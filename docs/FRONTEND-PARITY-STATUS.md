# Does the app match the Figma screens?

Short answer: **not yet, for most routes.** Here is the exact state, so nothing
here is overclaimed the way an earlier pass in this project was.

## What "matching" requires, and what exists for it

1. **The markup exists and is verified exact.** `web/src/figma/` holds all 63
   Figma artboards, generated from `docs/u2gas-batch*-exact.html` and checked
   byte-for-byte identical by `scripts/check-figma-parity.sh`.
2. **A component to render it exists.** `FigmaScreen` (`web/src/figma/`) takes
   a node id and an optional map of live text values, and injects the exact
   markup with only those text nodes replaced.
3. **Wiring it into the app's actual pages is the remaining work**, and it is
   large: each route owns its own state, handlers and data-fetching, so
   connecting it to an artboard is real per-screen work, not a mechanical
   swap.

## Done

- **HOME** (`web/src/routes/customer/Home.tsx`) — the full terminal (ticker,
  LED readout, keypad, receipt slot, watermark) now renders `<FigmaScreen
  node="1:251" .../>`. The keypad has no per-key id in the file, so presses
  are read from the clicked key's own class/text via one delegated handler —
  functionally identical to the old per-key component. Verified against the
  literal markup `FigmaScreen` injects, headless, with no console errors, and
  visually confirmed with a render.
- **A real bug this surfaced and fixed**: the stylesheet the app loads
  (`web/src/styles/figma.css`) had never resolved its `{NOISE_TILE}` texture
  placeholder — the grain on every button and LED housing was silently
  missing. Rebuilt from the finished HTML, which has it correctly resolved,
  and confirmed present.

## Not done — 32 of 33 routes

Everything else still renders the old hand-built components. They carry the
CSS fixes from the previous pass (the corrected LED/terminal borders, the
40% fade on unavailable items, the tank colours, the primary-button
treatment), so they are closer to the file than before, but they are not the
file's own markup, and screens with structure the CSS pass didn't reach — the
tank gauge's 91 lines, the staff screens, the opened notification rows — are
still the old approximation.

## A limit `FigmaScreen` has today, found while wiring HOME

The generated artboards are Figma's **single frozen example** of each screen
— `StaffLayout1.ts` contains the literal text "SMITH", not a placeholder for
it. `values` swaps text on a fixed set of nodes; it cannot render a variable
number of real orders, staff members or notifications. Any screen showing a
list of real records needs an actual row template extracted and ported to
TSX first — the equivalent of what `notif_rows()` did for the HTML build.
That is unbuilt.

## Honest count (updated 24 September 2026)

The earlier 1-of-33 figure is historical and no longer describes the source tree.
The current registry is the authoritative count: **31 registered routes with 46 valid Figma visual mappings**.
A route with an empty `artboards` array is intentionally treated as functionally implemented but **not Figma-matched** when the supplied source contains no corresponding artboard.

| Measure | Current status |
|---|---|
| Registered application routes in the parity registry | 31 |
| Valid Figma visual mappings | 46 |
| Generated Figma artboards passing byte-level reference check | 63 / 63 |
| Routes intentionally left unmatched because no corresponding Figma state exists | 14 |
| Browser screenshot comparison | Pending |
| Clean dependency install + typecheck/build | Pending in a networked environment |


## Latest implementation pass — 24 September 2026

The following routes/states are now connected to the extracted Figma visual source of truth while their existing API/business logic remains in place:

- customer HOME, SHOP, PRODUCT, PROFILE, CART empty state
- customer LOGIN
- driver SCAN, PROFILE, DELIVERY NOTIFS
- staff SCAN, WALK-IN
- admin GAS LVL CHECK / stock-history state

The remaining routes still use their original visual implementations where the
Figma file does not provide a direct one-to-one dynamic state. In particular,
transaction receipts, saved addresses, and variable-length administrative and
notification lists require dynamic templates rather than blindly rendering
frozen Figma sample records.

`FigmaScreen` now supports both node-based replacements and literal-text
replacement for generated Figma elements that have no `data-node` id. This is
used only for frozen sample text whose geometry is already defined by the
Figma drawing; it does not change CSS measurements.

The parity checker remains green: 63/63 generated Figma artboards match their
reference drawings byte-for-byte. Browser screenshot comparison and a clean
`npm ci` + typecheck/build are still required before declaring production
readiness.

## Parity integrity pass — 24 September 2026 (continued)

- Driver delivery history now selects the exact `1:4803` COMPLETED DELIVERY artboard for the completed scope, while active deliveries continue to use `1:4683` DELIVERY NOTIFS.
- Staff Queue, Staff Lookup, and Staff Shift are intentionally **not** mapped to unrelated Figma artboards. Their existing functional UIs remain in place until matching Figma states or dynamic row templates exist.
- Admin Products, Bundle Upload, Orders, and Settings are likewise not falsely mapped to unrelated artboards. This keeps the registry semantically correct instead of claiming visual parity where the supplied Figma source does not support it.

## Phase 10 — 24 September 2026

### Admin Tank update state
- `/admin` stock-update interaction now renders the supplied `UPDATE GAS` artboard (`1:3075`) as the visual source of truth instead of the previous hand-built modal.
- The designed minus/plus controls update the real stock movement amount and direction.
- The designed `UPDATE` control submits through the existing `api.admin.addStock` business logic.
- The live available quantity is injected into the Figma quantity node.
- Error feedback is layered only when the real API rejects the operation; the underlying Figma artwork is not rewritten.
- Optional stock-note/photo capture is not represented in the supplied `UPDATE GAS` artboard, so those optional fields are not exposed in this exact state.

### Verification limitation
- A clean frontend TypeScript/build verification has not been performed in this sandbox because the uploaded package does not contain a complete installable `node_modules` tree and dependency installation requires network access.
- Therefore this phase is source-level implementation work, not a claim of browser-verified pixel parity.

## Phase 11 — 24 Sep 2026

- Reviewed remaining Admin Figma states against their actual route responsibilities.
- Confirmed `1:3245` / `1:3461` are Admin notification-state artboards, but the current Worker exposes notifications only through the authenticated customer `/api/notifications` endpoint; no Admin notification route/API exists. They are therefore **not** wired to Admin Audit or another unrelated Admin route.
- Confirmed `1:3675` / `1:3781` are Staff History / Driver history visual states and are not substitutes for the current Admin Audit or Orders routes.
- Fixed a frontend compile issue in `admin/Tank.tsx`: `Pill` was used by the existing rate editor but was missing from the import list.
- No new Figma mapping was added where the source artboards do not correspond to the live route semantics.

## Phase 12 — Registry truth audit (24 Sep 2026)

The Figma route registry was audited against the generated `artboards.ts` source.
Mappings that pointed to non-screen/file assets or unrelated artboards were removed:

- `/notifications`: removed `88:55` because it is a FILE icon asset, not a notification screen.
- `/addresses`: removed `1:1952` because it is CHECKOUT NO DELIVERY ADDRESS, not saved-address management.
- `/auth/sent`: removed the login artboard; there is no dedicated verification-sent artboard.
- `/auth/callback`: removed the login artboard; callback is a transient routing state.
- `/driver/drops/:id`: removed `1:4803` because it is the completed-deliveries list, not delivery detail.

Added `web/scripts/check-figma-registry.mjs` and the `check:figma-registry` npm script.
The check currently passes with **31 registered routes and 46 valid visual mappings**.

This phase deliberately reduces the claimed parity count where the supplied Figma source does not contain a matching screen. Functional routes remain intact.

### Verification limitation

`npm run typecheck` was attempted in the sandbox but the checked-in `node_modules` tree is incomplete and reports missing type-definition packages (`@types/react`, `@types/node`, etc.). This is an environment/dependency-installation limitation, not evidence of a source-level TypeScript failure. A clean `npm ci` followed by `npm run typecheck` and `npm run build` is still required in a networked development environment.


## Phase 13 — Frontend verification/configuration pass — 24 September 2026

- Tightened `web/tsconfig.json` type-library discovery so the frontend does not
  accidentally load unrelated transitive `@types/*` packages.
- Kept the explicit frontend runtime types (`vite/client`, React, React DOM,
  and QR-code typings) required by the source.
- Verified the asset checker and Figma registry checker directly with Node:
  - assets: **10 CSS asset references checked**; three woff2 files use the
    committed woff fallback and are therefore non-fatal.
  - registry: **31 routes / 46 visual mappings**, valid.
- Confirmed the Cloudflare Pages CSP is generated from
  `public/_headers.template` and requires `VITE_API_ORIGIN`; the placeholder
  origin is rejected by `build-headers.mjs` rather than being shipped.

A clean `npm ci`, `npm run typecheck`, and `npm run build` remains the required
next verification in a networked environment.

## Phase 20 — payment verification / QR lifecycle hardening (24 Sep 2026)
- Paystack return verification is deduplicated by order/reference/guest-token so React StrictMode or dependency re-runs do not submit the same verification repeatedly.
- Collection-code generation now has an effect cleanup guard, preventing late QR-generation promises from updating an unmounted/stale order screen.
- Cancelled orders clear any cached collection-code token and rendered QR from the current session.
- No visual mapping count changed in this phase.

## Phase 22 — shift close safety (24 Sep 2026)

- Staff shift closing now sends an idempotency key so a reconnect/double-submit cannot create a second close operation.
- Closed reconciliations are immutable: a later request cannot silently overwrite the filed cash count.
- A non-zero cash variance now requires an explanatory note in both the UI and Worker validation.
- The frontend rejects invalid/negative/non-finite counted amounts before submission.
- Existing Figma registry remains 31 routes / 46 visual mappings.
