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
- [x] `01_concurrency.sql` — 86 inline assertions covering derived
      availability, over-reserve refusal, negative-stock guards, idempotent
      release, fulfilment accounting, duplicate payment references, repeated
      webhooks, double scan, unpaid scan, repeated expiry sweeps, bundle
      compatibility, four-item bundle rejection, and the orphaned-payment and
      low-stock regression guards.
- [x] `02_rls.sql` — 47 assertions proving the RLS fence as `anon` and
      `authenticated` with forged JWT claims, exactly as PostgREST presents a
      request.
- [x] `03_assets_and_transitions.sql` — 20 assertions covering shared image
      assets, reference-safe cleanup, atomic admin writes and order/payment
      state transitions.
- [x] `run_concurrency.sh` — three genuinely concurrent cases that a single
      session cannot prove: two customers for the last 10kg, two staff on one
      QR, and a payment racing the expiry sweep.

All four suites pass against a local PostgreSQL 17 (see "Verification status").

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
- [x] `routes/payments.ts` — Monnify init, verify, idempotent webhook with
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

### Frontend — `web/` (Next.js 16, in progress)

- [x] `package.json`, `next.config.ts` (`output: "export"`, `trailingSlash`),
      `tsconfig.json`, `eslint.config.mjs`, `.env.example`
- [x] `app/layout.tsx` — `next/font/local` for the pixel face,
      `next/font/google` for Barlow Semi Condensed, providers mounted once
- [x] `app/(public)/…` — one route per screen, thin server components over a
      `"use client"` view component
- [x] `components/` — the screens grouped by role: `admin/`, `cashier/`,
      `driver/`, `login/`, `modals/`, `home/`, `receipt/`, `ui/`, plus
      `providers.tsx`, `require-role.tsx`, `screen-notice.tsx`
- [x] `lib/api.ts` — typed Worker client; `ApiError` carries the code, the
      interface copy and the numbers a screen needs; `OFFLINE` on a network
      failure
- [x] `lib/supabase.ts` — Supabase Auth only, role read from the `profile`
      row, `safeNext` open-redirect guard
- [x] `lib/hooks.ts` — `useAsync`, load-once with a stale-response guard
- [x] `lib/adapters.ts`, `lib/receipts.ts` — backend rows → the view models
      the drawings use; no screen reads `price_kobo` or `image_asset` directly
- [x] `stores/` — Zustand view stores (`authStore`, `cartStore`,
      `adminStaffStore`, `adminTankStore`)
- [x] Auth flow — `/login`, magic-link + Google/Apple, `/auth/callback` routes
      each role to its own app
- [x] Customer — home terminal, shop/product/cart, order summary, payment
      (delivery and walk-in), receipt/history, profile. The bell opens a
      notifications list (`NotificationsModal`) with a working "mark all read"
      (`POST /notifications/read`); order history moved to the profile menu.
- [x] Cashier — scan, queue, walk-in, collect, lookup, shift
- [x] Driver — drops, drop detail (start trip / failure), doorstep scan, profile
- [x] Admin — tank, rate, products, bundles, orders, flagged, zones, drivers,
      reports, audit, settings, people. Every admin API method has a screen
      behind it, including the bundle publish action (`/admin/bundles`,
      `AdminBundlesView`) and its live compatibility check.
- [x] Removed `web/data.ts`; every screen reads the API (`lib/api.ts` +
      `useAsync`). The admin staff roster/add/edit/remove, staff history, cashier
      history and gas history screens are wired to the Worker/Supabase.
- [x] Removed dead files: the `jgs-main.zip` font-repo copy, the StackBlitz
      scaffolding (`.stackblitzrc`, `STACKBLITZ-RUN.md`), the `create-next-app`
      boilerplate SVGs in `web/public/`, the unused `noise.png`, and eight
      unreferenced `web/public/images/` assets.
- [x] Repo hygiene (audit #7): removed the dead shadcn/UI chain that nothing
      imported — `web/components/ui/{button,dialog,drawer,BottomSheetModal,
      modal-sheet,index}.ts(x)` and `web/components/modals/AddAddressModal.tsx`
      — and the duplicated/divergent view-model types and unreferenced exports
      in `web/lib/adapters.ts`, `web/lib/receipts.ts`, `web/helpers/functions.ts`
      and `web/types/types.ts` (e.g. `toViewOrderSummary`, `toViewDriver`,
      `toViewDelivery`, `toViewRefund`, `toViewReport`, `ViewNotification`,
      `formatNaira`, the unused `toGasHistory`/`toTankHistory`/`toAdminSales`/
      `toDriverHistoryOrders`/`filterSalesByPeriod`, and the orphan
      `TankHistoryRecord`/`GasHistoryRecord`/`SalesHistoryItem`/`QrStatus`/
      `AdminStaffProfile` types). `tsc`, `eslint` and the production build pass;
      no dangling references remain.

### Docs
- [x] `README.md` — the one architectural idea and how to run it
- [x] `docs/DEPLOYMENT.md` — Supabase, Storage, cron schedule, Resend SMTP,
      Monnify, Workers, Pages, Hostinger to Cloudflare DNS
- [x] `docs/ENVIRONMENT.md` — every key, where it comes from, what breaks
      without it, and what rotating it costs
- [x] `AGENTS.md` — the Next.js architecture and the live-Figma-only design rule
- [x] `docs/HANDOVER.md` — running with no API, adding a page, the asset
      workflow

### Deployment
- [ ] Cloudflare Pages (static export) and Workers configuration
- [ ] Supabase project setup, storage buckets and policies
- [ ] Resend SMTP wiring through Supabase Auth
- [ ] Hostinger to Cloudflare DNS instructions

The non-secret half is prepared: `web/.env.production` and `worker/.dev.vars`
exist (git-ignored, from the `.example` templates) with a freshly generated
`QR_SIGNING_KEY`. What remains needs an account nobody but the operator has:
Cloudflare authentication and the two KV namespace ids, the real domain, the
Supabase project URL and publishable key, and the dashboard secrets. A
placeholder is now refused rather than shipped — both `wrangler.toml`
(by `scripts/deploy-cloudflare.sh`) and the app build (by
`web/scripts/build-headers.mjs`, which would otherwise emit a CSP naming a
domain that never answers). The ordered steps are in
`docs/SETUP-CHECKLIST.md` §I.

---

## Open decisions

1. **Bundle reading.** Built as admin publishing a 2–3 item compatible bundle.
   If the intent was customers adding three compatible items to the cart in one
   action, the schema still supports it but `publish_bundle` needs replacing
   with a customer-facing suggestion endpoint.
2. **Frontend framework.** Next.js 16 with a static export, matching the
   uploaded app and Cloudflare Pages. The design file is the only design source.
5. **Fonts.** The pixel face is `web/public/fonts/jgs7.woff2` wired through
   `next/font/local`; Barlow Semi Condensed comes from `next/font/google`.
   Export any further face the Figma file uses from the live file.
6. **Halftone assets.** The scanner success and failure pictures live in
   `web/public/images/`. Export any the file uses from the live file.
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
   aborts the transaction, so both writes were discarded — the gateway had the
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

Checked mechanically across the whole tree, not just per file, and re-verified
against the live database (see "Verification status"):

- Every frontend API path resolves to a Worker route or an explicit Supabase
  `auth`/PostgREST read, with two known exceptions recorded under "Known
  omissions".
- All 26 Worker RPC names resolve to a function in the schema.
- Every `.from()` table reference in the Worker (21) and the app's direct
  Supabase reads (`profile`) exists in the schema or is a view (`shop_listing`,
  defined in 0005).
- Every named import resolves to a real export, both apps.
- Every `navigate()` and `<Link to>` target matches a declared route.
- Every enum literal sent by the frontend exists in the SQL enum (`app_role`,
  `order_status`, `payment_status`, `payment_method`, `delivery_status`,
  `driver_status`, `staff_status`, `refund_status`, `stock_move` all match).
- No secrets, TODOs, FIXMEs or `console.log` in the tree.

### Known omissions

The two endpoints recorded here previously now have screens:

- `POST /api/notifications/read` — the bell opens `NotificationsModal`, which
  lists the person's notifications and clears the unread ones; the endpoint is
  reachable from the "MARK ALL READ" control.
- `POST /api/admin/bundles` (`publish_bundle`) — `/admin/bundles`
  (`AdminBundlesView`) is the three-slot form; it calls the live
  `/admin/bundles/check` as slots fill and publishes through this endpoint,
  including the named-reason override path.

One richer surface is still without an app caller, and is not an omission the
screen depends on: `POST /api/uploads/bundle` (multipart, `publish_bundle` plus
inline creation of new member products and their images, with compensating
storage rollback). The admin desk publishes sets of *existing* catalogue items,
which is the flow the audit named; a screen for the inline-create variant is a
separate, larger job and is not needed for the existing-item publish to work.

The app and Worker are wired end to end for every flow the screens implement.

## Fonts

`web/public/fonts/jgs7.woff2` is the pixel face (Adél Faure's Jgs, Velvetyne,
SIL OFL 1.1), wired through `next/font/local` in `app/layout.tsx`; the licence
is committed beside it. Barlow Semi Condensed comes from `next/font/google`.
`scripts/fetch-fonts.sh` refreshes jgs7 from upstream. There is no reconstructed
fallback: the real face ships.

## Verification status

The SQL has now been executed against a local PostgreSQL 17 with a minimal
`auth`-schema bootstrap (`auth.users`, `auth.uid()`, the `anon` /
`authenticated` / `service_role` roles) standing in for Supabase's managed
objects. All 25 migrations apply cleanly in order, and every test suite passes:

- `supabase/tests/01_concurrency.sql` — 86/86 assertions.
- `supabase/tests/02_rls.sql` — 47/47 assertions.
- `supabase/tests/03_assets_and_transitions.sql` — 20/20 assertions.
- `supabase/tests/run_concurrency.sh` — all 6 two-session assertions pass
  (two customers for the last 10kg, two staff on one QR, a payment racing the
  sweep).

Running them surfaced four latent defects that hand review had missed, all now
fixed:

- `0009_audit_fixes.sql`'s `test_orphaned_payment_survives()` still called
  `confirm_payment` with the pre-rename `'paystack'` label, which 0025 renamed
  to `'monnify'`. The call raised `invalid input value for enum payment_method`,
  so the orphaned-payment regression guard never ran. `0014_exact_amount.sql`'s
  amount-mismatch guard had the same stale label.
- `0022_low_stock_alert.sql`'s `test_low_stock_fires_once()` asserted the alert
  fires, but the crossing only notifies `role = 'admin'` profiles and the seed
  (0007) creates none — real configuration, not demo accounts. The guard now
  creates a temporary admin recipient when the roster has none.
- `03_assets_and_transitions.sql`'s fixtures predated the `auth_user_id NOT
  NULL`, `depot_id`, `order_type`, `fulfillment_type` and `order_identifiable` /
  `order_total_consistent` constraints, so the whole file aborted at its first
  insert.
- `run_concurrency.sh` left TEST 1's reservation on the tank, so TEST 2's own
  `reserve_gas` was refused for lack of stock, and its final cleanup deleted an
  order still referenced by `refund`/`payment`.

Earlier, hand review had already found and fixed (before the SQL could run):

- `confirm_payment` and `redeem_qr` declared `RETURNS TABLE` with output
  parameters named `payment_id` and `order_id`, which collide with real column
  names inside the function body. Both now return `jsonb`.
- The `order_item` read policy leaned on the `order` policy being applied
  inside its subquery. It is now written out explicitly.

The Worker's dependencies have since been installed, so `tsc --noEmit` runs for
real (exit 0) and `vitest` runs 58/58. Those first caught four defects, all
fixed:

- `sha256Hex` passed a `Uint8Array` straight to `crypto.subtle.digest`. Under
  current lib types that can be backed by a `SharedArrayBuffer`, which digest
  rejects. It now copies into a plain `ArrayBuffer` first.
- Three calls used `res.json<any>()`. That type argument is a Cloudflare
  extension, not standard, and fails against the plain DOM `Response`.
- The webhook's catch block did not narrow `unknown` before reading `.message`.

Run this before trusting any of it:

```bash
# 1. Apply every migration in order, then run all three SQL suites and the
#    two-session script.
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01_concurrency.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/02_rls.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/03_assets_and_transitions.sql
./supabase/tests/run_concurrency.sh "$DATABASE_URL"

# 2. Worker
cd worker && npm install && npm run typecheck && npx vitest run

# 3. Frontend
cd ../web && npm install && npx tsc --noEmit && npm run build
```

## Phase 23 — Delivery/queue concurrency hardening (24 Sep 2026)
- Driver Drops list: prevent stale delivery-list responses from overwriting a newer scope/request.
- Staff Queue: prevent stale polling responses from overwriting a newer queue/tab request.
- Driver Drop detail: delivery fetch is cancellation-safe; refreshes after start/failure await the latest server response.
- Driver active-delivery Figma hit targets no longer overlap the SCAN action.

## Phase 24 — HTML-snapshot purge finished, audit #4 run (28 Sep 2026)

The snapshot gallery and its markup generator were removed earlier; this pass
removed the prose that still narrated them and closed the dependency audit.

- **Stale pipeline prose gone.** `docs/DESIGN-SYSTEM.md` described a
  "combiner" that merged the batch files and a "combined file" that rendered
  identically to the batches; `docs/SCREEN-GAP-ANALYSIS.md` called the design
  "the prototype"; `docs/DEPLOYMENT.md` named the CSP script at the wrong path.
  All three now describe reading the live file (`v4xgWC0Q0wtSKmAff3EOzU`, page
  `MAIN SCREENS` `256:14758`) through the Figma MCP as the only certification.
  `AGENTS.md` records what was removed so a later pass does not reintroduce it.
- The live file was re-read to confirm it is reachable and matches the declared
  key: `256:14759` PAYMENT SUCCESSFUL … `256:18694` DRIVER SCAN FAILED, with
  frames added after the first survey under `720:*` and `675:*`.
- No `.html` file remains anywhere in the tree.
- **Audit #4 (`npm audit`).** Both projects are clean for production:
  `npm audit --omit=dev` reports **0** in `web/` and **0** in `worker/`. The
  remaining advisories are all build/test tooling and every one is a `high`
  reached only through `fast-glob`→`braces` (the dev toolchain: `shadcn`,
  `eslint-config-next` in `web/`; `wrangler`, `vitest` in `worker/`). `braces`
  has no patched release (`3.0.3` is still flagged), and `npm audit fix --force`
  would downgrade `eslint-config-next` to a Next 14 line, so no safe fix exists.
  `shadcn` is genuinely used — `app/globals.css` imports `shadcn/tailwind.css` —
  so it is not dead weight and was left in place.
- Re-verified after the changes: `web` lint + `tsc --noEmit` + clean
  `npm run build` (28 static pages), `worker` `tsc --noEmit` + `vitest` 58/58,
  and the live Worker `/api/catalog/home` responds with real data.

