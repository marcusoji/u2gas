# U2GAS — Deployment

Order matters. Supabase first, because everything else needs its URL and keys.

```
Hostinger (registrar)
   └── Cloudflare (DNS + CDN)
         ├── Pages   → the four apps
         └── Workers → api.<domain>
               └── Supabase — Postgres, Auth, Storage, Edge Functions
                     └── Resend SMTP
```

---

## 1. Supabase

Create a project, then note the URL, anon key, service-role key, and JWT secret
from **Settings → API**.

### Migrations

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \  -f supabase/migrations/0001_schema.sql \
  -f supabase/migrations/0002_indexes.sql \
  -f supabase/migrations/0003_functions_inventory.sql \
  -f supabase/migrations/0004_functions_orders.sql \
  -f supabase/migrations/0005_functions_jobs.sql \
  -f supabase/migrations/0006_rls.sql \
  -f supabase/migrations/0007_seed.sql \
  -f supabase/migrations/0008_stock_adjust.sql \
  -f supabase/migrations/0009_audit_fixes.sql \
  -f supabase/migrations/0010_guest_and_notify.sql \
  -f supabase/migrations/0011_review_fixes.sql \
  -f supabase/migrations/0012_hardening.sql \
  -f supabase/migrations/0013_settings_binding.sql \
  -f supabase/migrations/0014_exact_amount.sql \
  -f supabase/migrations/0015_audit_correlation.sql \
  -f supabase/migrations/0016_rls_recursion_and_reserve_gas.sql \
  -f supabase/migrations/0017_saved_addresses.sql \
  -f supabase/migrations/0018_refunds.sql \
  -f supabase/migrations/0019_correctness_fixes.sql \
  -f supabase/migrations/0020_drop_stale_overloads.sql \
  -f supabase/migrations/0021_stock_entry_photo.sql \
  -f supabase/migrations/0022_low_stock_alert.sql \
  -f supabase/migrations/0023_asset_refs_and_transitions.sql \
  -f supabase/migrations/0022_low_stock_alert.sql
```

**Run all twenty-two.** Stopping early does not merely omit features — it leaves
defects in place. 0019 finishes the notification state machine (without it a
claimed row can stay claimed forever and its email is never sent), scopes
idempotency to the caller rather than the key alone, and closes the webhook,
QR and delivery-state races. 0020 drops the old function overloads 0019
replaced; without it Postgres keeps both and a call can resolve to the stale
one. 0020 ends by raising if any critical function still has more than one
overload, which doubles as proof the earlier migrations applied.

```bash
```

Then prove it works before going further:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01_concurrency.sql
./supabase/tests/run_concurrency.sh "$DATABASE_URL"
```

The second script needs two live sessions and is the only thing that actually
proves the row locks hold. Do not skip it.

### Profiles on signup

Supabase Auth creates the user; the application profile is ours. Without this
trigger a new signup has no row in `profile` and no role, so every API call
returns 401.

```sql
create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profile (auth_user_id, email, role, email_verified_at)
  values (new.id, new.email, 'customer', new.email_confirmed_at)
  on conflict (auth_user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Keep verification state in sync when the link is followed.
create or replace function sync_email_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profile set email_verified_at = new.email_confirmed_at
   where auth_user_id = new.id;
  return new;
end $$;

create trigger on_auth_user_verified
  after update of email_confirmed_at on auth.users
  for each row execute function sync_email_verified();
```

Promote your first admin by hand — there is deliberately no self-service path
to an admin role:

```sql
update profile set role = 'admin' where email = 'you@example.com';
```

### Storage

Create a bucket named `public-media`, public read.

```sql
create policy "media public read" on storage.objects
  for select using (bucket_id = 'public-media');

-- Writes go through the Worker on the service-role key, so no insert policy
-- is granted to authenticated users. Browsers never upload to Storage directly.
```

### Edge Function

```bash
supabase functions deploy expire-order-holds  --no-verify-jwt
supabase functions deploy send-notifications  --no-verify-jwt

supabase secrets set MAIL_FROM="U2 Oil and Gas <no-reply@<your-domain>>"
supabase secrets set APP_ORIGIN="https://<your-domain>"
supabase secrets set RESEND_API_KEY="<your key>"
```

Schedule it. Every minute is right: the function drains its whole backlog per
run, so a minute of latency on an expired hold is the worst case.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'expire-order-holds', '* * * * *',
  $$select net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/expire-order-holds',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <service-role-key>',
        'Content-Type', 'application/json')
  )$$
);

-- Transactional mail. Order and delivery updates are written to the
-- notification table by database triggers; this drains them to Resend.
-- Without it customers are told nothing after checkout.
select cron.schedule(
  'send-notifications', '*/2 * * * *',
  $$select net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/send-notifications',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <service-role-key>',
        'Content-Type', 'application/json')
  )$$
);
```

---

## 2. Resend

Add and verify your sending domain in Resend, then add the DNS records it
gives you in Cloudflare (SPF, DKIM, and the return-path CNAME). Mail from an
unverified domain lands in spam, which for a verification link means the
customer simply never arrives.

In Supabase, **Authentication → Email → SMTP**:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| User | `resend` |
| Password | your Resend API key |
| Sender | `no-reply@<your-domain>` |

Set **Site URL** to `https://<your-domain>` and add
`https://<your-domain>/auth/callback` to the redirect allowlist. Supabase
rejects any redirect not on that list, which is what stops the callback being
pointed somewhere else.

---

## 3. Paystack

From the dashboard, take the secret and public keys. Set the webhook URL to:

```
https://api.<your-domain>/api/payments/webhook/paystack
```

Test with a real transaction in test mode, then replay the same webhook twice
from the Paystack dashboard. The second delivery must return
`{"ok":true,"duplicate":true}` and must not create a second payment row.

---

## 4. Cloudflare Workers

```bash
cd worker
npm install

wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put SUPABASE_JWT_SECRET
wrangler secret put PAYSTACK_SECRET_KEY
wrangler secret put PAYSTACK_PUBLIC_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put QR_SIGNING_KEY     # openssl rand -hex 32

wrangler kv namespace create CACHE      # put the id in wrangler.toml
wrangler deploy --env production
```

`QR_SIGNING_KEY` keys the hash stored in `qr_token`. Rotating it invalidates
every outstanding QR code, so do it only deliberately.

Update `APP_ORIGIN` in `wrangler.toml` to your real origin before deploying.
It is what CORS is pinned to.

---

## 5. Cloudflare Pages

```bash
cd web
npm install
npm run build
```

Build command `npm run build`, output directory `dist`. Set the `VITE_*`
variables from `.env.example` — all four are public by design and compiled
into the bundle, so nothing secret may go here.

Add a `_redirects` file so client-side routes resolve on refresh:

```
/*  /index.html  200
```

Without it, someone refreshing on `/admin/products` gets a 404 from the CDN.

### Fonts and images

Before the first deploy, export from the Figma file into `web/public/`:

```
public/fonts/u2-pixel-400.woff2
public/fonts/u2-pixel-700.woff2
public/fonts/u2-script.woff2
public/img/thumb-up.webp
public/img/thumb-down.webp
```

Subset the pixel faces to the glyph range in the `@font-face` rules — the full
character set is several times the 90KB font budget. The halftone thumbs are
the scanner's success and failure states.

---

## 6. DNS (Hostinger → Cloudflare)

The domain stays registered at Hostinger. Only nameservers move.

1. In Cloudflare, add the site and copy the two assigned nameservers.
2. In Hostinger, **Domains → DNS/Nameservers → Change nameservers**, and enter
   them. Propagation is usually under an hour.
3. In Cloudflare DNS:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `@` | `<project>.pages.dev` | Proxied |
| CNAME | `www` | `<project>.pages.dev` | Proxied |
| CNAME | `api` | `<worker>.workers.dev` | Proxied |
| TXT / CNAME | — | Resend's SPF and DKIM records | DNS only |

Mail records must stay unproxied. Proxying a TXT record breaks verification.

SSL/TLS mode: **Full (strict)**.

---

## 7. Verify before calling it live

Work down this list in order. Each step depends on the one above it.

- [ ] `GET https://api.<domain>/api/health` returns `ok`
- [ ] Signing up creates a `profile` row with role `customer`
- [ ] The verification email arrives and is not in spam
- [ ] `/auth/callback` logs you in; an expired link shows the expired screen
- [ ] A customer visiting `/admin` sees NOT YOUR DOOR, not a blank page
- [ ] Ordering gas reserves stock — check `gas_stock.reserved_kg` moved
- [ ] Paying through Paystack flips the order to `confirmed`
- [ ] Replaying that webhook creates no second payment
- [ ] The QR scans once at `/staff` and is refused the second time
- [ ] An unpaid order expires within a minute of its hold and stock returns
- [ ] A three-item bundle publishes, and an incompatible pair is refused
- [ ] A bundle's receipt lines add up to the bundle price, not the list price
- [ ] Checking out **without an account** still shows the order and the QR
      afterwards, and the link works when opened on another phone
- [ ] An order-confirmed email arrives within two minutes of paying
- [ ] Staff lookup for `a,b)` returns nothing rather than erroring
- [ ] Submitting the same order twice does not reserve the stock twice
- [ ] An order paid one second after its hold lapsed is NOT swept
- [ ] `npx lhci autorun` passes every budget on all four routes

---

## Running locally

```bash
# API
cd worker && npm install && npm run dev        # 127.0.0.1:8787

# Web
cd web && cp .env.example .env && npm install && npm run dev   # localhost:5173
```

Point `.env` at a Supabase project with the migrations applied. There is no
offline mock — the whole system is transactional logic living in Postgres, and
stubbing that out would test nothing worth testing.
