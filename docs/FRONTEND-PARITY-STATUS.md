# Does the app match the Figma screens?

Short answer: **partially.** Here is the exact state, so nothing is overclaimed.

## What "matching" requires, and what exists for it

1. **A design of record.** The live U2-GAS Figma file
   (`v4xgWC0Q0wtSKmAff3EOzU`, page `MAIN SCREENS` `256:14758`) is the only design
   source. There is no committed HTML snapshot of the screens and no generator.
2. **A way to read it.** Every frame is read through the Figma MCP: structure,
   geometry and computed tokens, plus each leaf's `visible` flag.
3. **Wiring it into the app's pages is the remaining work.** Each route owns its
   own state, handlers and data-fetching, so matching a frame is real per-screen
   work, not a mechanical swap.

## Done

- **Catalogue and customer terminal** — the home terminal and the accessory
  strip read the Worker catalogue (`lib/api.ts`, `app/(public)/Shop.tsx`), with
  an unavailable item marked and kept visible rather than dropped.
- **Order history and receipts** — bound to real `/orders` through
  `lib/receipts.ts` (`toHistoryReceipt`); empty rather than inventing an order.
- **Auth** — Supabase Auth only; the role is read from the `profile` row, and
  `/auth/callback` routes each role to its own app.
- **Admin working desk** — every admin API now has a screen behind it:
  - `/admin/rate` (`AdminRateView`) — naira-per-kg, with a confirm step.
  - `/admin/products` (`AdminProductsView`) — accessories inventory with the
    drawn stock strip (`STOCK / RSVD / AVAIL`), create, edit (stock as a
    delta), picture upload and activate/deactivate.
  - `/admin/orders` (`AdminOrdersView`) — status tabs, delivery-driver
    assignment and order cancel-in-place (refund-pending, not "money moved").
  - `/admin/flagged` (`AdminFlaggedView`) — refunds owed (gateway process +
    record-manual fallback), failed deliveries and stale unpaid holds.
  - `/admin/zones` (`AdminZonesView`) — delivery zones and fees.
  - `/admin/drivers` (`AdminDriversView`) — the roster with live availability
    dots; read-only by design, because a driver is a staff row.
  - `/admin/reports` (`AdminReportsView`) — the gauge language, not charts.
  - `/admin/audit` (`AdminAuditView`) — the audit log, entity-filterable.
  - `/admin/settings` (`AdminSettingsView`) — the keys the order path reads.
  These hang off a MANAGE block on the admin menu and all sit behind
  `RequireRole role="admin"`.
- **Cashier** — `SHIFT` mode (`CashierReconciliationView`) closes the shift
  against the till with an idempotency key, and `LOOKUP`
  (`CashierLookupView`) searches by order number or phone.
- **Driver** — `MY DROPS` (`DriverDeliveriesView`) gives the full delivery
  detail plus `START TRIP` and failure reporting (reason × reschedule/return),
  and `PROFILE` (`DriverProfileView`) carries the `AVAILABLE / BUSY / OFFLINE`
  toggle the design puts on the driver's own screen.

## Not done

- The `data.ts` fixtures have been removed; the cashier history, admin
  gas/staff history, the admin staff store and add-address all read the API.
  Verify each against the Worker + Supabase.
- Driver and cashier queue/history flows are wired but not yet verified against
  the Worker + Supabase.
- The admin tank/sales/staff frames are wired but not yet pixel-compared to
  their live Figma frames; the new desk screens are built from the design
  language rather than a dedicated frame each.
- The compatibility bundle desk (`/admin/bundles`) now publishes sets of
  existing catalogue items through `POST /admin/bundles`, with the live
  `/admin/bundles/check` strip and the named-reason override. The inline-create
  multipart variant (`POST /uploads/bundle`) has no screen yet.
- No full typecheck / lint / static build has been captured for the whole app
  in CI, and the app has not been deployed.

## How to update this file

Move a screen from "Not done" to "Done" only after it renders real data and has
been compared against its live frame. Do not claim parity on the strength of the
markup alone.
