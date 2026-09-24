# Frontend Figma Parity Implementation

## Source of truth

`web/src/figma/` contains the generated Figma artboard markup. It is the visual
source of truth. Route components must not recreate that artwork with a second
CSS implementation.

## Current implementation rule

- `FigmaScreen` renders the exact generated artboard markup.
- `FigmaRouteFrame` provides the standard shell for combining that exact visual
  layer with real React interaction/data.
- `routeRegistry.ts` maps every application route to the Figma artboards/states
  it must implement.
- Dynamic records must be rendered with React templates that preserve the
  measured Figma row/card geometry; frozen sample text must never be treated as
  a variable-length list implementation.

## Migration order

1. Customer: shop/product/cart/checkout/order/payment/receipt/profile/history/
   notifications/addresses.
2. Auth: login and callback/sent states.
3. Driver: drops/drop/scan/profile.
4. Staff: scan/queue/walk-in/collect/lookup/shift.
5. Admin: tank/products/bundles/orders/people/settings/reports/audit.
6. Verify every route/state with runtime console checks and visual screenshots.

## Non-negotiable constraints

- Preserve API calls, authentication, authorization, reservation/hold logic,
  payment verification, QR logic and server-side security.
- Do not replace functional controls with decorative Figma markup.
- Do not approximate Figma geometry with new CSS when an exact artboard exists.
- Do not claim parity until the route has actually rendered the corresponding
  artboard/state and its dynamic data has been tested.
- A route can have several Figma states; the implementation must choose the
  correct state from actual application state.


## Implementation progress — 2026-09-24

Completed in the working source:
- Added `FigmaScreen` image-source overrides so API-backed product/avatar media can occupy the exact Figma image nodes without rebuilding their geometry.
- Added the shared `FigmaRouteFrame` functional-overlay layer and its route-frame CSS.
- Reworked customer Shop to use the exact `SHOP - SEARCH` artboard with API-backed image replacement and transparent hit targets.
- Reworked customer Product to switch between the exact available/unavailable Figma artboards, substitute live product copy, replace the designed product image, and retain the real add-to-cart flow.
- Reworked customer Profile to use the exact `USER PROFILE` artboard, live name/avatar, navigation hit targets, avatar upload, and logout.
- Reworked driver Profile/ME to use the exact `DRIVER PROFILE` artboard while retaining live availability controls, server rollback behaviour, vehicle data and logout.
- Reworked driver Scan to use the exact successful/failed scan artboards with the real QR scanner and API scan action layered into the designed camera region.

Not yet claimed as complete: all remaining routes, exhaustive visual screenshot parity, clean dependency install, typecheck/build, and final browser/device verification.
