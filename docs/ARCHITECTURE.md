# U2GAS — Architecture

## The shape of the system

```
                         ┌──────────────────────────┐
                         │   Hostinger (registrar)  │
                         │   nameservers → below    │
                         └────────────┬─────────────┘
                                      │
                         ┌────────────▼─────────────┐
                         │   Cloudflare DNS + CDN   │
                         └──────┬────────────┬──────┘
                                │            │
              u2gas.com ────────┘            └──────── api.u2gas.com
                    │                                      │
        ┌───────────▼────────────┐            ┌────────────▼─────────────┐
        │   Cloudflare Pages     │  fetch     │   Cloudflare Workers     │
        │                        ├───────────►│                          │
        │  /        customer     │   CORS     │  JWT verify (JWKS)       │
        │  /staff   cashier      │   pinned   │  role authorisation      │
        │  /driver  driver       │            │  idempotency keys        │
        │  /admin   admin        │            │  rate limiting (DO)      │
        │                        │            │  input validation        │
        │  4 separate chunks     │            │  request correlation     │
        └────────────────────────┘            └────────────┬─────────────┘
                                                           │
                                              sb_secret_ key, server-side only
                                                           │
                         ┌─────────────────────────────────▼─────────────────┐
                         │                    Supabase                       │
                         │                                                   │
                         │  Auth ──────── JWKS ──► (verified by the Worker)  │
                         │   │                                               │
                         │   └── trigger ──► profile (role lives here)       │
                         │                                                   │
                         │  PostgreSQL                                       │
                         │   ├── RLS forced on every table                   │
                         │   ├── all inventory logic in SQL functions        │
                         │   ├── EXECUTE revoked from anon / authenticated   │
                         │   └── constraints as the last line of defence     │
                         │                                                   │
                         │  Storage        public-media, write via Worker    │
                         │                                                   │
                         │  Edge Functions (scheduled)                       │
                         │   ├── expire-order-holds    every minute          │
                         │   ├── send-notifications    every 2 minutes ──┐   │
                         │   └── cleanup-assets        hourly            │   │
                         └───────────────────────────────────────────────┼───┘
                                                                         │
                                                            ┌────────────▼────────────┐
                                                            │         Resend          │
                                                            │  Auth SMTP + app email  │
                                                            └─────────────────────────┘
```

## Payment path

```
Customer
   │  chooses to pay
   ▼
Cloudflare Worker ──── initialize (amount read from the ORDER, never the client)
   │
   ▼
Paystack hosted checkout
   │
   ├──── customer returns ────► Worker /payments/verify
   │                              requires order_id AND reference
   │                              cross-checks Paystack metadata
   │                                       │
   └──── webhook ─────────────► Worker ────┤
            signature (HMAC-SHA512,        │
            constant-time compare)         │
                                           ▼
                              ask Paystack directly
                                           │
                              validate: status, reference,
                              currency, EXACT amount, metadata
                                           │
                                           ▼
                              confirm_payment()  — one transaction
                              · unique provider_reference
                              · exact amount re-checked in SQL
                              · order → confirmed, hold cleared
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
            order paid, QR issued                  orphaned payment recorded
                                                   → admin flagged queue
```

Nothing the browser says about a payment is believed. The amount is read from
the order row, the transaction is confirmed with Paystack directly, and the
final check happens inside the database so every path is held to it.

## Where the rules actually live

| Rule | Enforced in |
|---|---|
| Two customers cannot reserve the same gas | `reserve_gas` — single `FOR UPDATE` row lock |
| Two staff cannot fulfil one QR | `redeem_qr` — `UPDATE … WHERE status = 'unscanned'` |
| A webhook cannot pay twice | unique index on `(provider, provider_reference)` |
| Payment must equal the order total | `confirm_payment` — exact comparison |
| Stock cannot go negative | `CHECK` constraints on `product` and `gas_stock` |
| `available_kg` cannot drift | it is a function, not a column |
| A customer cannot become an admin | RLS pins `role` on `profile` |
| A browser cannot call a business function | `EXECUTE` revoked from `anon`, `authenticated` |
| An expired hold releases once | `release_reservations` only touches live rows |

The API layer never issues a bare `UPDATE` against an inventory column. A route
that does is a bug, not a shortcut.

---

# Production checklist

Work top to bottom. Each section depends on the one above it.

## Database

- [ ] Migrations `0001` … `0023` run in order, no errors
- [ ] `01_concurrency.sql` — 52 passed, 0 failed
- [ ] `02_rls.sql` — all passed, 0 failed
- [ ] `run_concurrency.sh` — 3 races, all passed
- [ ] `auth.users` → `profile` trigger fires on signup, role is `customer`
- [ ] Your own account promoted to `admin` by hand
- [ ] RLS shows enabled on every table in the Table Editor
- [ ] `pg_cron` and `pg_net` extensions enabled

## Supabase

- [ ] Site URL and redirect allowlist set
- [ ] SMTP pointed at Resend, sender on a verified domain
- [ ] Signup email arrives and is not in spam
- [ ] `public-media` bucket exists, public read, no public write
- [ ] Three Edge Functions deployed
- [ ] Three cron jobs scheduled and each has run once successfully

## Resend

- [ ] Domain verified — SPF, DKIM, DMARC all green
- [ ] API key created and stored as a secret, never committed
- [ ] `MAIL_FROM` uses the verified domain
- [ ] A real order-confirmed email arrives within two minutes

## Paystack

- [ ] Test keys in place, webhook URL configured
- [ ] ₦1 test order completes end to end
- [ ] Webhook replayed → no second payment row
- [ ] Webhook replayed with an altered amount → refused, `payment.amount_mismatch` logged
- [ ] Failed transaction leaves the order unpaid
- [ ] Switched to live keys, live webhook confirmed

## Cloudflare

- [ ] Pages builds from the production branch
- [ ] Worker deployed, `api.` subdomain resolves
- [ ] `/api/health` returns `ok`
- [ ] KV namespace created, real id in `wrangler.toml`
- [ ] Durable Object migration applied
- [ ] Every secret set in the dashboard, none in Git
- [ ] `APP_ORIGIN` is the real production origin
- [ ] CORS rejects a request from any other origin
- [ ] `_headers` and `_redirects` present in the build output

## Security

- [ ] Customer → `/admin` shows NOT YOUR DOOR
- [ ] Customer → another customer's order → denied
- [ ] Driver A → driver B's delivery → denied
- [ ] Guest token for order A → order B → denied
- [ ] Browser console: `supabase.rpc('confirm_payment', …)` → denied
- [ ] Browser console: direct `update` on `order` → denied
- [ ] No `sb_secret_` string anywhere in the built JS bundle
- [ ] No source maps served in production

## Application

- [ ] Signup, verification, login, logout
- [ ] Gas order — pickup and delivery
- [ ] Insufficient stock shows the reduced quantity offer
- [ ] Pay-at-depot hold counts down and expires, stock returns
- [ ] Guest checkout works, and the link opens on another phone
- [ ] Accessories, cart, bundle purchase
- [ ] Bundle receipt lines add up to the bundle price
- [ ] Staff: queue, walk-in, cash with change, scan, shift close
- [ ] Driver: availability, en route, scan, failed delivery
- [ ] Admin: stock entry, rate change, product edit, bundle publish, zones, audit
- [ ] QR scans once and is refused the second time

## Before real customers

- [ ] Database backups enabled and a restore tested
- [ ] Worker logs and Supabase logs both reachable
- [ ] Someone other than you knows how to process a refund
- [ ] One controlled live transaction completed and verified end to end
