# U2GAS — build progress

Updated as each piece lands. Anything not ticked has not been written yet.

---

## Done

### Database — `supabase/migrations/`
- [x] `0001_schema.sql` — enums, 26 tables, all constraints. Separate status
      enums per spec §36. Money in kobo as `bigint`, never float. Gas in
      `numeric(12,3)`.
- [x] `0002_indexes.sql` — 45 indexes, partial where it keeps them small
      (the hold-expiry index only covers unpaid live orders).
- [x] `0003_functions_inventory.sql` — `reserve_gas`, `reserve_products`,
      `release_reservations`, `fulfill_reservations`, `record_stock_entry`,
      `check_bundle_compatibility`, `bundle_available_qty`.
- [x] `0004_functions_orders.sql` — `create_gas_order`, `create_accessory_order`,
      `confirm_payment`, `issue_qr`, `redeem_qr`, `cancel_order`.
- [x] `0005_functions_jobs.sql` — `expire_order_holds`, `publish_bundle`,
      asset cleanup, `shop_listing` view.
- [x] `0006_rls.sql` — RLS forced on every table, policies per role.
- [x] `0007_seed.sql` — depot, categories, four compatibility rules, four
      delivery zones, app settings. No fake orders or demo customers.

### Scheduled jobs — `supabase/functions/`
- [x] `expire-order-holds/index.ts` — drains the backlog in one run, purges
      soft-deleted storage objects, service-role auth only.

### Tests — `supabase/tests/`
- [x] `01_concurrency.sql` — 30 inline assertions covering derived
      availability, over-reserve refusal, negative-stock guards, idempotent
      release, fulfilment accounting, duplicate payment references, repeated
      webhooks, double scan, unpaid scan, repeated expiry sweeps, bundle
      compatibility, four-item bundle rejection.
- [x] `run_concurrency.sh` — three genuinely concurrent cases that a single
      session cannot prove: two customers for the last 10kg, two staff on one
      QR, and a payment racing the expiry sweep.

### Worker API — `worker/`
- [x] `package.json`, `wrangler.toml`, `tsconfig.json`, `src/types.ts`
- [x] `lib/errors.ts` — every database code mapped to copy written in the
      interface's voice, with the numbers the UI needs (`ONLY 6KG LEFT`).
      Stack traces never reach the browser.
- [x] `lib/db.ts` — service-role and RLS-scoped clients, `rpc()` wrapper.
      Writes go through database functions, never bare `.update()`.
- [x] `lib/crypto.ts` — local JWT verify, HMAC-SHA512, constant-time compare,
      random QR tokens.
- [x] `lib/images.ts` — magic-byte type detection, header-only dimension peek
      as a decompression-bomb guard, four WebP tiers, alpha preserved.
- [x] `middleware/auth.ts` — JWT verified in the Worker rather than a round
      trip per request. Role read from the profile table, not the token.
- [x] `middleware/ratelimit.ts` — Durable Object, sliding window.
- [x] `routes/catalog.ts` — one-call home payload, shop grid with edge cache,
      product and bundle detail with derived availability.
- [x] `routes/orders.ts` — gas, cart, advisory availability, history, detail,
      QR issuance, cancel.
- [x] `routes/payments.ts` — Paystack init, verify, idempotent webhook with
      three layers of replay protection.
- [x] `routes/staff.ts` — queues, lookup, walk-in, in-person payment, change
      preview, scan, reconciliation.
- [x] `routes/driver.ts` — deliveries, availability, en route, scan, failed
      with reschedule/return.
- [x] `routes/admin.ts` — stock and rate, products, bundles, orders, flagged
      queue, driver assignment, zones, people, settings, audit, reports.
- [x] `routes/uploads.ts` — single image, avatar, and the atomic three-slot
      bundle upload with compensating rollback.
- [x] `index.ts` — router, pinned CORS, secure headers, error handler.

---

## Not started

### Frontend — `web/` (in progress)
- [x] `package.json`, `vite.config.ts` with per-role chunk splitting,
      `tsconfig.json`, `index.html` with font preloads, `.env.example`
- [x] `lighthouserc.json` — the 2s budget as failing CI thresholds
- [x] `styles/tokens.css` — every token sampled from the frames, subset
      self-hosted fonts, reduced-motion honoured
- [x] `styles/components.css` — the full component catalogue
- [x] `components/primitives.tsx` — Pill, Input, Segmented, Tabs, Chip, Stamp,
      LoadBar, Empty, ErrorState, Sheet with focus trap, Modal, U2Mark,
      ProductImage with srcset and explicit dimensions
- [x] `components/terminal.tsx` — Ticker, HoldCountdown, LedWindow, Terminal,
      Keypad, ReceiptSlot, Receipt with the feed animation
- [x] `components/illustrated.tsx` — TankGauge with ruler, WireBasket drawn in
      SVG, Scanner with lazily loaded WASM decoder
- [x] `lib/api.ts` — typed client, error codes surfaced with their detail,
      one silent retry for 5xx only
- [x] `lib/auth.ts` — Supabase Auth, role read from the profile table,
      open-redirect guard on `next`
- [x] `lib/useImageCompressor.ts` + `workers/compress.worker.ts` — off-thread
      compression, alpha preserved, WebP with a PNG fallback
- [x] `App.tsx` — router, role guards, deep links preserved through login
- [x] `routes/customer/Home.tsx` — terminal, keypad, advisory availability,
      **insufficient stock with TAKE NKG**, payment sheet, delivery zones
- [x] `routes/customer/OrderStatus.tsx` — **hold countdown**, **expiry**,
      QR issuance, Paystack return verification, delivery tracking

- [x] `lib/cart.ts` — browser-only cart. Adding reserves nothing; stock is
      only held at checkout, per spec 27. Cross-tab sync, malformed storage
      discarded rather than crashing the shop.
- [x] `routes/customer/Shop.tsx` — grid, ticker-as-search, category tabs,
      unavailable stamps, first row eager for LCP
- [x] `routes/customer/Product.tsx` — products and bundles, members in slot
      order, saving against buying separately, **names the short member**
- [x] `routes/customer/Cart.tsx` — wire basket, checkout sheet,
      **stamps the exact item the server refused**
- [x] `routes/customer/History.tsx` — month tabs, live status strip, receipts
- [x] `routes/customer/Profile.tsx` — script-face name, inline detail editing
- [x] `routes/customer/Notifications.tsx` — filtered list
- [x] `routes/auth/Login.tsx` — clipped terminal, magic link, Google, Apple
- [x] `routes/auth/VerifySent.tsx` — **check your mail**, 60s resend cooldown
- [x] `routes/auth/Callback.tsx` — **expired and failed link states**
- [x] `routes/auth/ResetRequest.tsx` — identical response either way, so it
      cannot be used to enumerate customers

- [x] `routes/staff/StaffApp.tsx` — own chunk, bottom nav (the prototype
      navigated by swiping frames, which a cashier mid-transaction cannot do)
- [x] `routes/staff/Scan.tsx` — idle, success, failure, plus the **flagged
      state** with the next action on screen
- [x] `routes/staff/Queue.tsx` — paid and awaiting-payment queues, polls only
      while visible
- [x] `routes/staff/Collect.tsx` — order detail and **change due**, nothing
      recorded until explicit confirmation
- [x] `routes/staff/WalkIn.tsx` — keypad order, name and phone required
- [x] `routes/staff/Lookup.tsx` — keypad doubles as the search pad
- [x] `routes/staff/Shift.tsx` — **cash reconciliation**, expected computed
      server-side, variance stamped
- [x] `routes/driver/DriverApp.tsx` + `Drops.tsx` — own chunk, route list
- [x] `routes/driver/Drop.tsx` — **en route**, call customer, **failed with
      reschedule or return**, unpaid warning
- [x] `routes/driver/DriverScan.tsx` — doorstep scan pinned to delivery
- [x] `routes/driver/DriverMe.tsx` — **availability toggle** with optimistic
      update and rollback when the API refuses

- [x] `routes/admin/AdminApp.tsx` — own chunk, scrolling bottom nav
- [x] `routes/admin/Tank.tsx` — gauge, −/+ stock entry modal, rate change,
      month-tabbed history. available_kg is read, never edited
- [x] `routes/admin/Products.tsx` — **accessories inventory**, stock shown as
      STOCK / RSVD / AVAIL together, adjusted by delta not absolute value
- [x] `routes/admin/BundleUpload.tsx` — **the three-slot upload**: live
      compatibility check, per-slot compression meters, manager override with
      a required reason, atomic publish
- [x] `routes/admin/Orders.tsx` — orders and the **flagged queue**, refunds
      owed first, driver reassignment, cancel with reason
- [x] `routes/admin/People.tsx` — staff and driver grids with detail
- [x] `routes/admin/Settings.tsx` — **delivery zones and fees**, hold and QR
      timings via the same −/+ stepper
- [x] `routes/admin/Audit.tsx` — **reports** in the tank's visual language
      rather than a charting library, plus the **audit log**

- [x] `components/states.tsx` — offline banner driven by real request
      failures rather than `navigator.onLine` alone, permission-denied screen,
      and a render error boundary so one broken screen cannot blank the app

### Docs
- [x] `README.md` — the one architectural idea and how to run it
- [x] `docs/DEPLOYMENT.md` — Supabase, the signup trigger, Storage, the cron
      schedule, Resend SMTP, Paystack, Workers, Pages, Hostinger to Cloudflare
      DNS, and a verification checklist in dependency order
- [x] `docs/ENVIRONMENT.md` — every key, where it comes from, what breaks
      without it, and what rotating it costs
- [x] `web/public/_redirects`, `.gitignore`, asset placeholders with
      instructions

### Deployment — `docs/`
- [ ] Cloudflare Pages and Workers configuration
- [ ] Supabase project setup, storage buckets and policies
- [ ] Resend SMTP wiring through Supabase Auth
- [ ] Hostinger to Cloudflare DNS instructions
- [ ] Environment variable reference
- [ ] Lighthouse CI budget enforcement

---

## Open decisions

1. **Bundle reading.** Built as admin publishing a 2–3 item compatible bundle.
   If the intent was customers adding three compatible items to the cart in one
   action, the schema still supports it but `publish_bundle` needs replacing
   with a customer-facing suggestion endpoint.
2. **Frontend framework.** React with Vite, chosen for the code splitting
   Cloudflare Pages needs. Say if the existing repo uses something else.
5. **Fonts.** `tokens.css` references `/fonts/u2-pixel-*.woff2` and
   `/fonts/u2-script.woff2`. Export the licensed faces from the Figma file,
   subset them to the glyph range in the `@font-face` rules, and drop them in
   `web/public/fonts/`. The fallback stack is metric-matched so nothing
   reflows before they land.
6. **Halftone assets.** The scanner success and failure glyphs are referenced
   at `/img/thumb-up.webp` and `/img/thumb-down.webp`. Export from Figma.
3. **Background removal.** The design needs transparent cut-outs. Doing this
   automatically needs a model the Worker cannot run. Assumption for now:
   admins upload pre-cut PNGs, and the pipeline preserves alpha rather than
   creating it.
4. **Image codec.** jsquash was chosen because it is pure WASM and runs on
   Workers. sharp and anything Node-native would not. Worth benchmarking the
   four-tier encode against the Worker CPU limit on a real 1600px upload.

---

## Defects found and fixed

Reviewing by hand rather than running, these were caught and corrected:

1. **`confirm_payment` / `redeem_qr` output-parameter collision.** Both declared
   `RETURNS TABLE` with parameters named `payment_id` and `order_id`, which
   collide with real column names inside the function body. Both now return
   `jsonb`.
2. **Fragile `order_item` RLS policy.** It leaned on the `order` policy being
   applied inside its subquery. Written out explicitly.
3. **`sha256Hex` buffer type.** Passed a `Uint8Array` to `crypto.subtle.digest`,
   which rejects `SharedArrayBuffer`-backed views. Copies into a plain
   `ArrayBuffer` first.
4. **`res.json<any>()`** used a Cloudflare-only type argument in three places.
5. **Unnarrowed `unknown`** in the webhook catch block.
6. **Countdown drift.** The hold timer decremented a counter, which drifts
   whenever the tab is backgrounded and the interval is throttled. It now
   recomputes from the expiry timestamp and re-checks on `visibilitychange`.
7. **Bundle publish gating.** The publish button required a green compatibility
   check, which a bundle of entirely new items can never produce — they have no
   `product_id` to check yet. Now gated on the absence of a *known* conflict.
8. **Orphaned payment was thrown away.** `confirm_payment` handled money
   arriving for an already-expired order: it inserted a payment row and an
   audit entry flagging a refund, then raised `ORDER_ALREADY_CLOSED`. The raise
   aborts the transaction, so both writes were discarded — Paystack had the
   customer's money and we had no record of it anywhere, which is precisely
   what that branch existed to prevent. It now returns normally with an
   `orphaned` flag (migration `0009`), the record survives into the admin
   flagged queue, the customer gets a notification, and the cashier screen
   shows DO NOT HAND OVER / TAKE THIS TO A MANAGER. Regression test 14.
9. **Infinite recursion in the profile RLS policy.** `current_role_name()`
   reads `profile`; every other table's policy calls `is_staff()`, which calls
   it; and `profile`'s own read policy also called `is_staff()`. SECURITY
   DEFINER would normally break the loop because the owner is exempt from RLS,
   but `0006` applied `FORCE ROW LEVEL SECURITY` to every table, and FORCE
   removes exactly that exemption. Any query against any table would have
   failed with `42P17`. `profile` is now `NO FORCE`, and its read policy uses a
   direct non-recursive lookup instead of `is_staff()`. Regression test 15.
10. **Import declared mid-file** in `states.tsx`. Hoisted.
11. **The entire guest checkout flow was a dead end.** Checkout accepts a guest
    with just a name and phone, but `order_owner_read` requires
    `user_id = current_profile_id()`, which is null for an anonymous caller,
    and the QR endpoint required a logged-in owner. A guest paid, was
    redirected to their order, and got NO SUCH ORDER — money taken, gas
    unreachable, no way back. Fixed in `0010` with a per-order capability
    token: random, returned once at checkout, stored only as a hash, carried in
    the URL and remembered on the device. It authorises that one order and
    nothing else.
12. **Resend was configured and never called.** The API key was a Worker secret
    and no code path used it. Supabase Auth sends verification mail over SMTP
    on its own, but the ten transactional events in spec 49 sent nothing. Added
    `send-notifications`, a scheduled Edge Function that drains the
    notification table to Resend, claiming rows in SQL so two runs cannot send
    twice and requeueing genuine failures.
13. **Notifications existed for one event out of ten.** Only hold expiry
    created a row. Added database triggers in `0010` covering payment
    confirmed, fulfilled, cancelled, and every delivery state change — at the
    source, so an API route cannot forget to send one.
14. **PostgREST filter injection in staff lookup.** The search term was
    interpolated straight into a `.or()` expression, which PostgREST parses as
    filter syntax. A term containing a comma or parenthesis could append
    arbitrary filters. Input is now stripped to alphanumerics and the query
    uses two plain filters instead of one parsed expression.
15. **Bundle receipts did not add up.** `create_accessory_order` charged the
    bundle price but wrote each member's own list price onto its `order_item`
    row. Every receipt in the product builds its lines from `order_item`, so a
    kit discounted from ₦46,500 to ₦40,000 showed three lines totalling ₦46,500
    above a total of ₦40,000. The bundle price is now allocated across members
    in proportion to list price, with the rounding remainder given to slot 1 so
    the lines sum exactly.
16. **Read-modify-write race on product stock.** The admin route read
   `stock_qty`, added the delta in JavaScript, and wrote an absolute value back.
   A QR redeemed in between had already decremented `stock_qty`, so the admin's
   stale write silently restored stock that had left the building. Replaced
   with `adjust_product_stock` in migration `0008`, which applies the delta
   under a row lock, and covered by test 13.

## External review, addressed in order

A second reviewer went through the SQL. Seven of their nine items were real.

**P0**
1. **`expire_order_holds` trusted stale values.** The loop re-checked
   `payment_status` from the record the cursor fetched, which predates the
   lock. Postgres usually re-evaluates a `FOR UPDATE` row, but a plpgsql `FOR`
   loop buffers rows, so the record in hand can still be older than the lock.
   The sweep now selects only the id and re-reads status under the lock.
2. **`reserve_products` over-reserved on retry.** It incremented
   `reserved_qty` unconditionally and then added the same amount again through
   `ON CONFLICT`. A retried checkout, or an order containing the same product
   twice, held more stock than was bought. It now aggregates by `product_id`,
   computes the delta against what the order already holds, and moves
   `reserved_qty` by that delta only. Calling it twice is a no-op.

**P1**
3. **Bundle allocation cleanup.** Removed the dead `v_first` flag; guarded the
   division so a bundle of zero-priced members splits evenly instead of
   dividing by zero.
4. **Cartesian join in `claim_unsent_notifications`.** `join profile p2 on
   true` crossed the batch against every profile before filtering. Correct
   answer, bad plan, worse with every customer added.

**P2**
5. **Reserve list pre-aggregation** — solved at the source inside
   `reserve_products` rather than at each call site, so every caller benefits.
6. **Whole-number product quantities** — a check constraint plus an explicit
   guard, so a fractional count cannot silently truncate on the cast to
   integer.
7. **`any` in the frontend API client** — replaced with 24 interfaces covering
   every payload. One `any` remains, on `ApiError.detail`, which is genuinely
   shape-varying and commented as such.
8. **Missing delivery row in `redeem_qr`.** The `UPDATE delivery` was a silent
   no-op if no driver had been assigned: the order was fulfilled, stock
   deducted, and no record survived of who took it. Refusing would strand a
   customer holding the gas, so the row is created and the missing assignment
   is flagged in the audit log instead.
9. **Regression tests** — four new blocks (16-19) covering retry idempotency,
   duplicate line summing, fractional refusal, the sweep-versus-payment race,
   and bundle receipt arithmetic. 51 assertions total.

## Cross-file audit

Checked mechanically across the whole tree, not just per file:

- All 39 frontend endpoints resolve to a Worker route.
- All 11 RPC names called from TypeScript exist in a migration.
- All `.from()` table references exist in the schema; spot-checked columns.
- Every named import resolves to a real export, both apps.
- Every `navigate()` and `<Link to>` target matches a declared route.
- Every enum literal sent by the frontend exists in the SQL enum.
- No secrets, TODOs, FIXMEs or `console.log` in the tree.

## Fonts

`tools/make_pixel_font.py` generates `u2-pixel-400` and `u2-pixel-700` from a
5x7 dot-matrix grid reconstructed from the prototype frames. Full printable
ASCII plus naira, multiply, middot and em dash. About 3KB per WOFF, against a
90KB budget. These are a reconstruction, not the licensed face — drop the real
files in over the top and nothing will move, because the metrics match.

`u2-script` still needs exporting from Figma. A handwriting face cannot be
reconstructed from a grid the way a pixel one can. Until it exists the stack
falls through to a system cursive and the profile screens read correctly.

## Verification status

The SQL has not been executed. This sandbox has no Postgres and no network to
install one, so the migrations were reviewed by hand rather than run. Three
defects were found and fixed that way:

- `confirm_payment` and `redeem_qr` declared `RETURNS TABLE` with output
  parameters named `payment_id` and `order_id`, which collide with real column
  names inside the function body. Both now return `jsonb`.
- The `order_item` read policy leaned on the `order` policy being applied
  inside its subquery. It is now written out explicitly.

The Worker's dependencies could not be installed either, so `tsc` ran with
`--noResolve`. That still caught four real defects, all fixed:

- `sha256Hex` passed a `Uint8Array` straight to `crypto.subtle.digest`. Under
  current lib types that can be backed by a `SharedArrayBuffer`, which digest
  rejects. It now copies into a plain `ArrayBuffer` first.
- Three calls used `res.json<any>()`. That type argument is a Cloudflare
  extension, not standard, and fails against the plain DOM `Response`.
- The webhook's catch block did not narrow `unknown` before reading `.message`.

The two errors still reported are `--noResolve` artifacts — an unresolved
import cannot narrow an `instanceof` — not defects.

Run this before trusting any of it:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/0001_schema.sql \
  -f supabase/migrations/0002_indexes.sql \
  -f supabase/migrations/0003_functions_inventory.sql \
  -f supabase/migrations/0004_functions_orders.sql \
  -f supabase/migrations/0005_functions_jobs.sql \
  -f supabase/migrations/0006_rls.sql \
  -f supabase/migrations/0007_seed.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01_concurrency.sql
./supabase/tests/run_concurrency.sh "$DATABASE_URL"

cd worker && npm install && npm run typecheck
```

## Phase 23 — Delivery/queue concurrency hardening (24 Sep 2026)
- Driver Drops list: prevent stale delivery-list responses from overwriting a newer scope/request.
- Staff Queue: prevent stale polling responses from overwriting a newer queue/tab request.
- Driver Drop detail: delivery fetch is cancellation-safe; refreshes after start/failure await the latest server response.
- Driver active-delivery Figma hit targets no longer overlap the SCAN action.
