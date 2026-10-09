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
  -f supabase/migrations/0024_staff_lifecycle.sql \
  -f supabase/migrations/0025_monnify.sql
```

**Run all twenty-five.** Stopping early does not merely omit features — it leaves
defects in place. 0019 finishes the notification state machine (without it a
claimed row can stay claimed forever and its email is never sent), scopes
idempotency to the caller rather than the key alone, and closes the webhook,
QR and delivery-state races. 0020 drops the old function overloads 0019
replaced; without it Postgres keeps both and a call can resolve to the stale
one. 0020 ends by raising if any critical function still has more than one
overload, which doubles as proof the earlier migrations applied. 0024 adds the
staff add/remove functions the roster's controls call; without it those two
endpoints return an error on a fresh database.

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

## 3. Monnify

From **Developers → API Keys & Contracts**, take the API key, the secret
key and the contract code. Set the webhook URL to:

```
https://api.<your-domain>/api/payments/webhook/monnify
```

Test against `https://sandbox.monnify.com` first (`MONNIFY_BASE_URL`), then
replay the same webhook twice from the Monnify dashboard. The second delivery must return
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
wrangler secret put MONNIFY_API_KEY
wrangler secret put MONNIFY_SECRET_KEY
wrangler secret put MONNIFY_CONTRACT_CODE
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

`bash scripts/deploy-cloudflare.sh` deploys the API and then builds the
frontend. It does not deploy the frontend: `web/` is a carbon copy of the
uploaded `U2gas_frontend-main.zip`, a plain Next.js 16 app with no static
export, so Pages needs a Next adapter (e.g. `@opennextjs/cloudflare`) that is
not installed yet. The script stops with that step called out; add the adapter
and a `wrangler pages deploy <output>` invocation when the UI is wired to the
Worker.

By hand, the API half is:

```bash
cd worker
npm install
npx wrangler deploy --env production
```

The frontend builds with `npm run build` and runs with `next start` (or any Node
host). It is a self-contained UI demo — it reads no API — so a deploy does not
need the `NEXT_PUBLIC_*` variables, a CSP header file or the API origin. When
the UI is wired to the Worker, that wiring (and its headers) comes back as a
separate step.

### Fonts and images

The pixel face (`jgs7`) is self-hosted at `web/public/fonts/jgs7.woff2` and
`jgs7.woff` and wired through `next/font/local`. Product and state imagery is
under `web/public/images/` and `web/public/shop/`, exactly as the uploaded
frontend ships it.

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
- [ ] Paying through Monnify flips the order to `confirmed`
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
- [ ] The frontend loads with no console error on all four role apps

---

## Running locally

```bash
# API (optional — the copied frontend reads no API)
cd worker && npm install && npm run dev        # 127.0.0.1:8787

# Web
cd web && npm install && npm run dev           # localhost:3000
```

The frontend under `web/` is a carbon copy of the uploaded
`U2gas_frontend-main.zip` and renders the `data.ts` fixtures, so it needs no
backend to show every screen. Wiring it to the Worker + Supabase is a separate
step; until then the Worker is only needed if you are working on the API itself.
