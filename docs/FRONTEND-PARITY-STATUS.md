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

## Not done

- The `data.ts` fixtures have been removed; the cashier history, admin
  gas/staff history, the admin staff store and add-address all read the API.
  Verify each against the Worker + Supabase.
- Driver and cashier queue/history flows are wired but not yet verified against
  the Worker + Supabase.
- The admin screens (tank, sales history, staff) are not yet confirmed against
  their live frames.
- No full typecheck / lint / static build has been captured for the whole app,
  and the app has not been deployed.

## How to update this file

Move a screen from "Not done" to "Done" only after it renders real data and has
been compared against its live frame. Do not claim parity on the strength of the
markup alone.
