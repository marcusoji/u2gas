# U2GAS — Setup checklist

Everything needed to open the accounts and bring the system up, in the order
you do it. This is the short operational list; the long version of any step is
in [`DEPLOY-NO-CLI.md`](DEPLOY-NO-CLI.md) (browser only) or
[`DEPLOYMENT.md`](DEPLOYMENT.md) (command line).

Work top to bottom. Each section depends on the one above it.

---

## A. Accounts to create

| # | Account | What the signup needs | Notes |
|---|---|---|---|
| 1 | Domain registrar | Business name, email, payment card | Docs assume Hostinger; only nameservers move later |
| 2 | GitHub | Email, username | Private repo `u2gas`; Cloudflare deploys from it |
| 3 | Supabase | Email, org name, project name, DB password, region | Region **EU (Frankfurt)** for Nigeria |
| 4 | Cloudflare | Email, payment card (free tier still asks) | Site + Pages + Workers + KV + DNS |
| 5 | Resend | Email, the domain to verify | Free tier is enough to start |
| 6 | Paystack | Business name, CAC number, business address, business phone, settlement bank account | Test mode works immediately; live needs verification |

Order matters: domain → Supabase → Resend → Cloudflare → Paystack.

---

## B. Details to have ready before you start

| Detail | Used by |
|---|---|
| The domain name (e.g. `u2gas.ng`) | Everything — Cloudflare, Supabase URLs, Resend, the Paystack webhook, `APP_ORIGIN`, `MAIL_FROM` |
| Company legal name | Paystack verification, Resend sender, Supabase project |
| CAC registration number | Paystack business verification |
| Business address and phone | Paystack verification |
| Business email, monitored | Account owner for all six services |
| Settlement bank account (bank + 10-digit number) | Paystack payouts |
| Region choice | Supabase project |
| Database password | Supabase — generated at creation, unrecoverable, save it in a password manager |
| `QR_SIGNING_KEY` | You generate it: 64 hex characters, keys QR codes and guest tokens |

Two hostnames to confirm: `api.<domain>` for the API, and `<domain>` plus
`www.<domain>` for the frontend. The docs assume this shape.

---

## C. Credentials each account produces

### Supabase → Settings → API

| Credential | Goes to |
|---|---|
| Project URL | Worker `SUPABASE_URL`, Pages `VITE_SUPABASE_URL` |
| Publishable key (`sb_publishable_…`) | Worker `SUPABASE_PUBLISHABLE_KEY`, Pages `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Secret key (`sb_secret_…`) | Worker `SUPABASE_SECRET_KEY` — **secret, never in the browser** |
| JWT secret | Worker `SUPABASE_JWT_SECRET` — **only** if the project still signs HS256 |

### Paystack → API Keys & Webhooks

| Credential | Goes to |
|---|---|
| Test secret key (`sk_test_…`) | Worker `PAYSTACK_SECRET_KEY` (start here) |
| Test public key (`pk_test_…`) | Worker `PAYSTACK_PUBLIC_KEY` |
| Live secret and public key (`sk_live_…` / `pk_live_…`) | Same variables, swapped at go-live |
| Webhook URL to set | `https://api.<domain>/api/payments/webhook/paystack` |

There is no separate webhook secret. Paystack signs with the secret key and the
Worker verifies that signature.

### Resend → API Keys

| Credential | Goes to |
|---|---|
| API key (`re_…`, shown once) | Worker `RESEND_API_KEY` **and** the Supabase Edge Function secret `RESEND_API_KEY` |

### Cloudflare

| Item | Goes to |
|---|---|
| KV namespace ID | `worker/wrangler.toml` — replace both `YOUR-KV-ID` and `YOUR-PRODUCTION-KV-ID` |
| Pages project | Frontend deploy |
| Worker name | `u2gas-api` |

---

## D. Four Supabase dashboard tasks

1. **Storage bucket** — named `public-media`, public read, 1 MB limit,
   `image/webp` only, plus the read policy and
   `revoke insert, update, delete on storage.objects from anon, authenticated`.
2. **Auth → URL Configuration** — Site URL `https://<domain>`, and
   `https://<domain>/auth/callback` on the redirect allowlist.
3. **Auth → SMTP** — host `smtp.resend.com`, port `465`, user `resend`,
   password = the Resend key, sender `no-reply@<domain>`. Without this the
   magic-link sign-in email never arrives.
4. **Auth → Providers** — Email stays enabled with confirm-email on. If Google
   or Apple is disabled, remove the matching button from
   `web/src/routes/auth/Login.tsx`.

---

## E. Values you write into config

### `worker/wrangler.toml`

Replace every placeholder.

| Variable | Value |
|---|---|
| `APP_ORIGIN` | `https://<domain>` — CORS is pinned to this exactly |
| `MAIL_FROM` | `U2 Oil and Gas <no-reply@<domain>>` |
| `DEPOT_ID` | `00000000-0000-0000-0000-00000000d001` (leave as-is) |
| `PAYSTACK_CALLBACK_PATH` | `/orders/verify` (leave as-is) |
| `YOUR-KV-ID` (both) | Your Cloudflare KV namespace ID |
| `YOUR-DOMAIN` (routes) | Your domain |

### Worker secrets — dashboard → Variables and Secrets

`SUPABASE_URL` · `SUPABASE_PUBLISHABLE_KEY` · `SUPABASE_SECRET_KEY` (SECRET) ·
`PAYSTACK_SECRET_KEY` (SECRET) · `PAYSTACK_PUBLIC_KEY` · `RESEND_API_KEY`
(SECRET) · `QR_SIGNING_KEY` (SECRET) · `ENVIRONMENT=production`

### Cloudflare Pages — frontend

`VITE_API_BASE` · `VITE_API_ORIGIN` · `VITE_SUPABASE_URL` ·
`VITE_SUPABASE_PUBLISHABLE_KEY` · `VITE_MEDIA_BASE`

`VITE_API_ORIGIN` is missing from the no-CLI guide's Phase 12, but the build
fails without it: it is substituted into the Content-Security-Policy by
`web/scripts/build-headers.mjs`. Add it or the first Pages deploy breaks.

### Edge Function secrets

`RESEND_API_KEY` · `MAIL_FROM` · `APP_ORIGIN`. `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

---

## F. Bring the system up

1. Apply all **24 migrations** in order, `supabase/migrations/0001_schema.sql`
   through `0024_staff_lifecycle.sql`. Stopping early leaves real defects, not
   just missing features — `0019` and `0020` fix the notification state
   machine, idempotency scoping and the webhook, QR and delivery races.
2. Run `supabase/tests/01_concurrency.sql` (87 assertions) and
   `02_rls.sql` (38). Expect 0 failures.
3. Run `./supabase/tests/run_concurrency.sh`. It needs two live sessions and is
   the only thing that proves the row locks hold.
4. Deploy the three Edge Functions: `expire-order-holds`, `send-notifications`,
   `cleanup-assets`.
5. Enable pg_cron and schedule `expire-order-holds` every minute,
   `send-notifications` every two minutes, `cleanup-assets` hourly.
6. Promote the first admin by hand in SQL. There is no self-service path.
7. Verify the Resend sending domain (green tick) **before** testing Supabase
   SMTP.
8. Check `https://api.<domain>/api/health` returns `{"ok":true,…}`.

Then work Phases 16–21 of `DEPLOY-NO-CLI.md`: the CORS check, the seven
security tests, the twenty payment tests, and finally the switch to live keys.

---

## G. The minimum to see it running

No accounts needed. The whole UI runs from in-browser fixtures — no Supabase,
no Cloudflare, no keys, no sign-in.

```bash
cd web
npm ci
npm run dev -- --host 0.0.0.0 --port 12001 --strictPort
```

Identity is chosen with `?as=customer|staff|driver|admin`, or the bottom-right
role switch. The accounts above are only needed for real data.

---

## H. Data the system needs before it is useful

The database ships with no products, no stock and no staff.

| Item | Notes |
|---|---|
| Gas rate | Seeded ₦1,400/kg; admin-editable, and old orders keep their old price |
| Opening gas stock | Seeded 0 — record a stock entry or every order fails `INSUFFICIENT_GAS` |
| Delivery zones | Name, fee and coverage note for each; the four seeded ones are invented |
| Product catalogue | Name, price, stock, and the compatibility attributes (`bore_mm`, `valve_thread`, `outer_diameter_mm`, `pressure_class`) |
| Staff roster | Each cashier needs a `profile` with role `staff` **and** a `staff_member` row |
| Drivers | Role `driver` plus a `driver` row; the phone is required |
| Per-person details | Email (login and notifications), phone, bank name, 10-digit account number |
| Settings | Hold window, max kg per order, QR validity, low-stock warning |

---

## I. Never do these

- Never commit `.env`, or any file containing `sb_secret_`, `sk_` or `re_`.
- Never put a secret in a `VITE_` variable — it is compiled into the browser
  bundle.
- Never set CORS to `*`.
- Never trust a payment amount sent by the browser; it always comes from the
  order row.
- Never mark a payment successful by editing the database.
- Never give out `admin` casually; an admin sees every order and every payment.
- Never rotate `QR_SIGNING_KEY` except on a known compromise — it invalidates
  every QR code a customer is holding.
