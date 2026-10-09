# U2GAS — Environment variables

Two tiers. The line between them matters: anything in the Pages column is
compiled into the browser bundle and readable by anyone who opens devtools.

## Example files

Three `.example` files are committed; copy each to its real, git-ignored name
and fill it in. None of the real files may be committed.

| Copy from | To | Used by |
|---|---|---|
| `web/.env.example` | `web/.env` | local `npm run dev` |
| `web/.env.production.example` | `web/.env.production` | the Pages build via `scripts/deploy-cloudflare.sh` |
| `worker/.dev.vars.example` | `worker/.dev.vars` | local `wrangler dev` |

`worker/.dev.vars` is the local equivalent of `wrangler secret put`; the public
Worker vars (`ENVIRONMENT`, `APP_ORIGIN`, …) live in `wrangler.toml`. In
production the Worker secrets are set in the Cloudflare dashboard, not a file.

## Cloudflare Workers — secrets

Set with `wrangler secret put <NAME>`. Never in `wrangler.toml`, never in git.

| Name | Example | What breaks without it |
|---|---|---|
| `SUPABASE_URL` | Supabase → Settings → API | Everything |
| `SUPABASE_PUBLISHABLE_KEY` | same | RLS-scoped reads. `SUPABASE_ANON_KEY` is the legacy name, still accepted as a fallback |
| `SUPABASE_SECRET_KEY` | same | All writes. **Never send to a browser.** `SUPABASE_SERVICE_ROLE_KEY` is the legacy name, still accepted as a fallback |
| `SUPABASE_JWT_SECRET` | same | Only needed on legacy projects still signing HS256 |
| `MONNIFY_API_KEY` | Monnify → API Keys & Contracts | Mints the access token |
| `MONNIFY_SECRET_KEY` | same | Basic auth and webhook signatures |
| `MONNIFY_CONTRACT_CODE` | same | Names the merchant contract on every call |
| `MONNIFY_BASE_URL` | optional | `https://sandbox.monnify.com` while testing |
| `RESEND_API_KEY` | Resend dashboard | Transactional mail |
| `QR_SIGNING_KEY` | `openssl rand -hex 32` | QR validation |

## Cloudflare Workers — public vars

In `wrangler.toml` under `[vars]`.

| Name | Example | Notes |
|---|---|---|
| `ENVIRONMENT` | `production` | |
| `APP_ORIGIN` | `https://u2gas.ng` | CORS is pinned to this exactly |
| `DEPOT_ID` | `00000000-…-d001` | From `0007_seed.sql` |
| `MONNIFY_CALLBACK_PATH` | `/orders/verify` | Where checkout returns |

## Cloudflare Pages

All public. Anything secret here is a leak. The **copied frontend (`web/`) reads
none of these yet** — it is a carbon copy of the uploaded
`U2gas_frontend-main.zip` and renders `data.ts` fixtures with no env module.
They are the contract for when the UI is wired to the Worker: the app then reads
`NEXT_PUBLIC_*` at build time and inlines them. The Supabase **publishable** key
is the only Supabase key the browser may see; a build must refuse to ship a
`sb_secret_` / `service_role` key.

| Name | Example |
|---|---|
| `NEXT_PUBLIC_API_BASE` | `https://api.u2gas.ng/api` |
| `NEXT_PUBLIC_API_ORIGIN` | `https://api.u2gas.ng` — used for the CSP and media fallbacks |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_` key, never the secret key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | optional. Legacy name for the same public key, accepted as a fallback so an older deployment keeps working. Set the publishable key on anything new. |
| `NEXT_PUBLIC_MEDIA_BASE` | `https://<ref>.supabase.co/storage/v1/object/public/public-media` |
| `NEXT_PUBLIC_EMBEDDED_API` | `true` builds a preview that contacts no API: no Supabase sign-in, and `'self'`-only CSP. There is no fixture layer - API-backed screens show their no-data state. Omit for a real deployment. |

## Supabase Edge Functions

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

---

## Rotating a key

- **Service role** — rotate in Supabase, `wrangler secret put`, redeploy. Brief
  write outage between the two.
- **Monnify secret** — rotate, update the secret, then confirm a fresh webhook
  verifies. In-flight webhooks signed with the old key will be rejected.
- **QR signing key** — invalidates every outstanding QR code. Customers holding
  an unused code cannot collect until they reopen their order and get a new
  one. Only rotate on a known compromise.
- **Anon key** — safe to rotate; it is public and useless without RLS.
