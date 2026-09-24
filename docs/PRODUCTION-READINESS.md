# U2GAS — Production Readiness Report

Covers the hardening pass across all 56 parts of the brief.

---

## A. Files changed in this final pass

| Path | What changed | Why |
|---|---|---|
| *(whole tree)* | `gift-tech` → `u2gas`, `GIFT-TECH` → `U2GAS` | Project renamed. 0 residual references. |
| `web/public/fonts/*` | Regenerated from `tools/make_pixel_font.py` | The rename ran `sed` across the tree; regenerating rules out a silently corrupted binary. Verified by rendering. |
| `web/src/lib/auth.ts` | Prefers `VITE_SUPABASE_PUBLISHABLE_KEY`; throws if a `sb_secret_` key is configured | Part 5. A secret key in the browser bundle is total compromise — refuse to start rather than ship one. |
| `web/src/vite-env.d.ts`, `web/.env.example` | Publishable key documented, legacy marked optional | Part 5. |
| `web/public/_headers` | **New.** CSP, HSTS, `Referrer-Policy: no-referrer`, Permissions-Policy, no-store on `/orders/*` | Part 29 + 30. The Worker's headers never reach Pages responses. Guest tokens live in URLs, so a referrer would leak one to every third party. |
| `worker/src/routes/payments.ts` | Passes `p_currency` to `confirm_payment` | Part 11. |
| `worker/src/routes/staff.ts` | Passes `p_currency`; rate limit on `/lookup` | Parts 11, 34. Lookup returns customer phone numbers. |
| `worker/src/routes/orders.ts` | Rate limit on guest order read | Part 34. A token-authorised read with no limit is a guessing oracle. |
| `worker/src/routes/admin.ts` | Blanket 300/min across the router | Part 34. Backstop for a stolen admin session bulk-exporting. |
| `worker/src/lib/errors.ts` | `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH` mapped | Part 11. |
| `worker/src/lib/db.ts` | `tagRequest()` helper | Part 44. |
| `worker/src/index.ts` | Tags non-GET requests with the request id | Part 44. |
| `supabase/functions/cleanup-assets/index.ts` | **New.** Split out of `expire-order-holds` | Part 25. A storage outage must not eat the time budget of the job releasing customers' stock. |
| `supabase/functions/expire-order-holds/index.ts` | Cleanup removed; raw error no longer returned | Parts 25, 35. |
| `supabase/functions/send-notifications/index.ts` | Raw error no longer returned | Part 35. |
| `supabase/tests/01_concurrency.sql` | Test 20 added | Part 48. |
| `docs/*` | Migration lists regenerated to 0001-0023, stale `VITE_API_ORIGIN` removed, legacy `VITE_SUPABASE_ANON_KEY` documented | This pass. |
| *(tree)* | Three stray `{components,lib,...}` directories removed | Brace-expansion artifacts from failed `mkdir` calls. |

---

## B. Database changes

**23 migrations.** `0001`–`0007` build the system; `0008`–`0023` are corrections. `0021` adds the stock-entry photo, `0022` the low-stock alert, and `0023` makes image assets shared with reference-safe cleanup, admin writes atomic, and order/payment transitions enforced.

| Migration | Contents |
|---|---|
| `0008_stock_adjust` | `adjust_product_stock()` — delta under a row lock |
| `0009_audit_fixes` | `confirm_payment` orphan path stops raising; `profile` RLS de-recursed |
| `0010_guest_and_notify` | Guest capability tokens; bundle price allocation; notification triggers; `claim_unsent_notifications` |
| `0011_review_fixes` | Expiry re-read under lock; `reserve_products` idempotent; allocation cleanup; join fix; whole-number constraint; `redeem_qr` delivery row |
| `0012_hardening` | Auth→profile trigger; RLS rewrite; RPC grants revoked; settings binding; idempotency; notification state machine; refund-pending; payment uniqueness; indexes |
| `0013_settings_binding` | Settings enforced in the order path |
| `0014_exact_amount` | **Exact** payment amount + currency in the database; grants re-applied; old signature dropped |
| `0015_audit_correlation` | `audit_log.request_id`, `set_request_id()`, trigger, indexes |
| `0016_rls_recursion_and_reserve_gas` | Breaks the `order`↔`delivery` policy cycle with SECURITY DEFINER helpers; `reserve_gas` made idempotent; `reserve_products` releases dropped items |
| `0017_saved_addresses` | `saved_address` table, owner-only RLS, one default enforced by index |
| `0018_refunds` | `refund` table and state machine, `request_refund` / `claim_refund` / `settle_refund`, `cancel_order` raises the refund itself |
| `0019_correctness_fixes` | Finishes the notification state machine (claim lease, `mark_notifications_sent` / `_failed`); scopes idempotency to key + scope + caller + request hash, with a lease so a crash cannot jam a key; webhook lease so a concurrent delivery cannot acknowledge work it did not do; `issue_qr` will not replace a live code; atomic gas-rate update; atomic driver/delivery transitions; orphaned payments raise a real refund |
| `0020_drop_stale_overloads` | Drops the old signatures `0019` replaced, and raises if any critical function still has more than one overload |
| `0022_low_stock_alert` | Produces the `stock.low` notification the UI already filtered for. The threshold was adjustable and the screen was ready; nothing created the alert |
| `0021_stock_entry_photo` | `stock_entry.photo_asset`; `record_stock_entry` accepts and validates it. Closes a path the schema always allowed but nothing could reach |

**Key objects:** 26 tables, 3 views/derived functions, ~40 functions, ~55 indexes, RLS forced on every table except `profile` (deliberate — see `0009`).

---

## C. Security fixes

1. **RPC functions were executable by `PUBLIC`** — `create_gas_order`, `confirm_payment`, `redeem_qr` and every other business function. A browser client holding only the publishable key could have marked its own order paid. Revoked from `public`, `anon`, `authenticated`. (`0012`, re-applied in `0014`.)
2. **Infinite RLS recursion on `profile`** — `FORCE ROW LEVEL SECURITY` removed the owner exemption that `SECURITY DEFINER` relies on. Every query against every table would have failed with `42P17`. The app would not have started.
3. **Guest checkout was a dead end** — guests paid and then could not reach their own order. Capability tokens, hashed at rest, in the URL and on the device.
4. **PostgREST filter injection** in staff lookup — the term was interpolated into a `.or()` expression, which is parsed as filter *syntax*.
5. **Customer could edit their own `role`** — profile writes now restricted to permitted columns.
6. **JWT verification** — moved off HS256-only to JWKS with issuer, audience, expiry and algorithm validation.
7. **Secret key in the browser** — startup guard throws if one is configured.
8. **Security headers** on both the Worker and Pages, including `no-referrer` specifically because capability tokens travel in URLs.
9. **Rate limiting** extended to guest reads, staff lookup and all admin routes.
10. **No secrets, no `console.log`, nothing logging a token** — verified by static scan.

---

## D. Payment fixes

1. **Exact amount enforced in the database**, not only the Worker. Overpayment previously confirmed the order silently. (`0014`)
2. **Currency validated** at both layers.
3. **Webhook marked processed only after successful processing** — failures leave `processed_at` null and return 500 so Paystack retries.
4. **Verification requires `order_id` as well as `reference`**, and cross-checks Paystack's own metadata, so a valid reference cannot be applied to someone else's order.
5. **Orphaned payments recorded, not discarded** — the previous code inserted the record then raised, rolling it back.
6. **Paid-order cancellation moves to refund-pending** rather than claiming a refund happened.
7. **Idempotency keys** on order creation and staff payment recording.
8. **POST requests are never auto-retried** by the client.
9. **Non-Paystack methods** carry unique references and cannot be double-recorded.

---

## E. Email fixes

1. **Resend was configured and never called.** The key was a Worker secret with no code path touching it — ten notifiable events sent nothing.
2. **`send-notifications`** Edge Function drains the queue; claims are made in SQL so two runs cannot double-send.
3. **State machine** — `pending → claimed → sending → sent`, with attempt count and last error. Nothing is marked sent before Resend confirms.
4. **`MAIL_FROM` placeholder fallback removed.** Production refuses to serve if it is missing or still contains `YOUR-DOMAIN`.
5. **Notification triggers** in the database, so a route cannot forget to notify.

---

## F. Cloudflare changes

1. **Durable Object** uses `new_sqlite_classes`, the current storage model.
2. **KV placeholder** is marked `YOUR-KV-ID` with instructions, not a fake id that looks real.
3. **CORS** pinned to `APP_ORIGIN`; dev origins only outside production; no wildcard.
4. **Source maps disabled** for production builds.
5. **Per-role chunk splitting** — a customer never downloads the admin bundle.
6. **`_headers` and `_redirects`** for Pages.

---

## G. Tests

**87 assertions** in `supabase/tests/01_concurrency.sql` and **38** in
`supabase/tests/02_rls.sql`, plus a two-session harness in
`run_concurrency.sh` covering three genuine races.

Coverage since the last run has grown to include the webhook lease, the
idempotency scope and lease, QR non-replacement, the notification state
machine and the orphaned-payment refund — the checks for `0019`.

Earlier coverage: derived availability, over-reserve refusal, negative-stock guards, idempotent release, fulfilment accounting, duplicate payment references, repeated webhooks, double scan, unpaid scan, repeated expiry sweeps, bundle compatibility, four-item rejection, stock adjustment floor, orphaned payment survival, RLS non-recursion, reserve idempotency, duplicate line summing, fractional refusal, sweep-versus-payment race, bundle receipt arithmetic, exact amount enforcement.

**Result: not run.** See H.

---

## H. Remaining warnings

### Live run — what has and has not been executed

One run has been reported, and it predates the last five migrations:

- `01_concurrency.sql` — 51 of 51 *at the time*, against a database built to
  `0015` and a suite that then had 51 checks; the suite is now 01_concurrency.sql (0 checks), 02_rls.sql (0 checks)
- `02_rls.sql` — 45/49, the four failures being the `order`/`delivery` policy
  recursion that `0016` fixes

Since that run the suites have grown to **86 and 38 assertions** and five
further migrations have been written (`0016`–`0020`). **None of them has been
applied to a database, and neither suite has been re-run.** The earlier
pass/fail numbers should not be read as current.

### BLOCKER — `0016` through `0020` have never been executed

This sandbox has no PostgreSQL and no network access, so:

- The 23 migrations have never been applied to a database. Nothing in this repository has been run against Postgres, Supabase or Cloudflare; every claim below is a code-level statement only.
- The 125 assertions have never run against `0019`/`0020`.
- `npm install` has never run, so **no lockfiles exist** (Part 38) and
  `npm run build` has never been verified (Part 49).
- Dependency vulnerability scanning (Part 38) requires the registry.

Everything has been verified by static analysis instead: TypeScript syntax
across all 60 source files, SQL structural balance, cross-file import
resolution, endpoint-to-route mapping, RPC-name existence, enum consistency,
and a static secret scan. That catches a great deal — 16 real defects were
found this way, several of which would have prevented the system from starting
at all. It does not substitute for running the code.

**To clear this blocker**, in order:

1. Supabase Dashboard → SQL Editor → run `0001` through `0015` in order
   (Phase 3 of `docs/DEPLOY-NO-CLI.md`).
2. Run `supabase/tests/01_concurrency.sql` in the same editor. Expect
   `passed = 52, failed = 0`.
3. `cd web && npm install` then `npm run build`; `cd worker && npm install`
   then `npm run typecheck`. Commit both lockfiles.
4. Run `npm audit` in each and address anything high or critical.
5. Work Phases 4–21 of the no-CLI guide.

### Non-blocking

- **Fonts identified and wired, not yet downloaded.** The file specifies
  **jgs7** (Adél Faure) for the pixel face and **Homemade Apple** (Google
  Fonts, SIL OFL) for the handwriting. Both are freely licensed, so both ship
  with the project rather than being placeholders. Run `./tools/fetch-fonts.sh`
  once on a machine with network access; it downloads, subsets to the glyphs
  used, and writes woff2 + woff into `web/public/fonts`. Commit the results.
  Until then the generated `u2-pixel` fallback renders the app correctly.
- ~~Halftone scanner glyphs~~ **Done.** Supplied from Figma and installed. The
  exports were JPEG, which cannot carry alpha, so the transparency was
  reconstructed by corner flood-fill before encoding to lossless WebP.
- **Paystack refunds are not automated.** Cancelling a paid order moves it to
  refund-pending and tells the customer a refund is being processed, which is
  true. A manager completes it in the Paystack dashboard. The wording
  deliberately does not claim the money has already moved.
- **`YOUR-DOMAIN` and `YOUR-KV-ID`** remain in `wrangler.toml` by design. The
  Worker refuses to serve in production if `MAIL_FROM` still contains the
  placeholder, so this cannot ship unnoticed.

---

## Verdict

**NOT READY** — one blocker: migrations `0016` through `0022` have never been
applied, and neither test suite has been run against them.

Deploying only through `0018`, as earlier versions of these docs described,
leaves the database with the defects `0019` fixes — notifications that can
stay claimed forever, idempotency keys that match across callers, and the
webhook, QR and delivery races — and with the stale function overloads that
`0020` removes. Apply all twenty-two in order, then run both suites.

There are no known defects. There is no known missing functionality. Every part
of the brief that can be satisfied by changing the repository has been. What
remains is the part that requires a running database and a package registry,
neither of which exists in this environment.

Run the migrations and the test suite. If all 125 assertions pass and both
projects build, the verdict becomes READY.


---

## Typing

`any` count: **161 → 123**.

What was tightened, and why these:

- **`c: any` on every Worker helper** → a single `Ctx` alias in `types.ts`.
  This was the worst of them: it turned off checking on `c.env`, `c.get()` and
  `c.req`, which are exactly what breaks after a refactor.
- **`any[]` state in the admin and customer screens** → real interfaces
  (`AdminOrder`, `AdminDriver`, `AdminStaff`, `AdminProduct`, `AdminZone`,
  `AdminSetting`, `GasEntry`, `NotificationRow`, the three `Flagged*` shapes).
  Untyped, a column renamed in a migration showed up as `undefined` on screen
  instead of as a build error.
- **`FlaggedQueue`** was pointing at `AuditEntry[]` for its refund rows, which
  was simply the wrong shape.

What is deliberately still `any`:

- **`select<any>(...)` at the PostgREST call sites in the Worker.** These are
  row shapes for queries whose column list is written inline, so the type
  would have to be restated next to every query and would drift from it. The
  boundary that matters — what the browser receives — is typed in `api.ts`.
- **`fromDbError(err: any)`** and `decodeSegment`, which take genuinely
  unknown input by definition and narrow it themselves.
