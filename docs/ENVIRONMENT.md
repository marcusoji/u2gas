# U2GAS — Environment variables

Two tiers. The line between them matters: anything in the Pages column is
compiled into the browser bundle and readable by anyone who opens devtools.

## Cloudflare Workers — secrets

Set with `wrangler secret put <NAME>`. Never in `wrangler.toml`, never in git.

| Name | Where it comes from | What breaks without it |
|---|---|---|
| `SUPABASE_URL` | Supabase → Settings → API | Everything |
| `SUPABASE_ANON_KEY` | same | RLS-scoped reads |
| `SUPABASE_SERVICE_ROLE_KEY` | same | All writes. **Never send to a browser** |
| `SUPABASE_JWT_SECRET` | same | Auth — every request reads as anonymous |
| `PAYSTACK_SECRET_KEY` | Paystack dashboard | Payments and webhook signatures |
| `PAYSTACK_PUBLIC_KEY` | same | Checkout initialisation |
| `RESEND_API_KEY` | Resend dashboard | Transactional mail |
| `QR_SIGNING_KEY` | `openssl rand -hex 32` | QR validation |

## Cloudflare Workers — public vars

In `wrangler.toml` under `[vars]`.

| Name | Example | Notes |
|---|---|---|
| `ENVIRONMENT` | `production` | |
| `APP_ORIGIN` | `https://u2gas.ng` | CORS is pinned to this exactly |
| `DEPOT_ID` | `00000000-…-d001` | From `0007_seed.sql` |
| `PAYSTACK_CALLBACK_PATH` | `/orders/verify` | Where checkout returns |

## Cloudflare Pages

All public. Anything secret here is a leak.

| Name | Example |
|---|---|
| `VITE_API_BASE` | `https://api.u2gas.ng/api` |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the sb_publishable_ key, never the secret key |
| `VITE_SUPABASE_ANON_KEY` | optional. Legacy name for the same public key, still accepted as a fallback so an older deployment keeps working. Set the publishable key on anything new. |
| `VITE_MEDIA_BASE` | `https://<ref>.supabase.co/storage/v1/object/public/public-media` |

## Supabase Edge Functions

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

---

## Rotating a key

- **Service role** — rotate in Supabase, `wrangler secret put`, redeploy. Brief
  write outage between the two.
- **Paystack secret** — rotate, update the secret, then confirm a fresh webhook
  verifies. In-flight webhooks signed with the old key will be rejected.
- **QR signing key** — invalidates every outstanding QR code. Customers holding
  an unused code cannot collect until they reopen their order and get a new
  one. Only rotate on a known compromise.
- **Anon key** — safe to rotate; it is public and useless without RLS.
