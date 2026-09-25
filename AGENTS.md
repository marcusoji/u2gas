# u2gas

React + Vite frontend (`web/`) over a Cloudflare Worker API (`worker/`).

## Commands (run from `web/` unless noted)

- `npm run dev` — Vite dev server; this is what the preview tunnel serves
- `npm run check:frontend` — asset + Figma route registry guards
- `npm run check:assets` — fails if a font/image referenced by CSS is missing
- `bash scripts/check-figma-parity.sh` (repo root) — proves `web/src/figma/screens/`
  still matches `docs/u2gas-batch*-exact.html` byte for byte
- `npm run build` currently fails at `tsc -b` on pre-existing type errors in
  `Product.tsx`, `DriverScan.tsx`, `Collect.tsx`. `vite build` alone succeeds.

Demo mode: `VITE_USE_MOCKS=true`. Role links use `?as=<role>`.

## Routes and back navigation

`/` is the entry screen (LOG IN 1, figma `1:1219`) with a guest path to
`/home`, which is the customer terminal. `auth.ts` and `mocks/gate.ts` both
map the customer role to `/home`, not `/`.

Back navigation on deep screens goes through `useBackTo(to)` in
`components/primitives.tsx` (`BackButton` wraps it). Do not use
`window.history.length > 1` to decide whether back is safe: it is already
greater than 1 in a fresh tab, so a cold deep link pops out of the app.
`useBackTo` checks `location.key === "default"` — true only for the entry the
router booted on — and otherwise falls back to the screen's known parent.

## Viewport fitting

The artboards are a fixed 440px wide with absolutely positioned children, so
they cannot reflow narrower. The shell fits them to the viewport with CSS
`zoom` (`.frame-plate` in `components.css`) and centres the plate; do not
re-add `max-width: 100%` to `.figma-route-frame`, which used to clamp the
wrapper while its 440px child did not shrink and caused horizontal scroll.
Elements that must keep a real 44px tap target under the plate scale cancel it
with the inverse zoom.

## The artboard styling invariant (easy to break)

`docs/u2gas-batch*-exact.html` are the design source of truth. The app renders
that markup verbatim via `FigmaScreen` / `FigmaRouteFrame` (root class `.frame`),
and every artboard child is **absolutely positioned from the file's own
coordinates**. Nothing in the app may reach inside `.frame` and change layout,
colour, or text metrics.

Two real leaks existed, both fixed by keeping the app's styles out of the frame:

- `components.css` reuses the same class names as `figma.css` (`.keypad`,
  `.key`, `.pill`, `.receipt-slot`) and is imported after it, so it won inside
  artboards. `figma.css` now restores the file's values with `.frame`-scoped
  selectors, which also out-specifies the bare component rules regardless of
  import order.
- `tokens.css` sets `letter-spacing: -0.04em` on `body`; every artboard text
  node inherited it and ran narrow. `figma.css` resets it on `.frame`.

When adding a component class, check whether the artboards already use that
class name — `grep -o 'class="[^"]*"' web/src/figma/screens/*.ts` — and scope
accordingly.

## Fonts

Self-hosted under `web/public/fonts/`, declared in `src/styles/tokens.css`.
jgs7 is the pixel face; Homemade Apple is the profile name. The reference pulls
Barlow Condensed SemiBold and Barlow Semi Condensed SemiBold from Google Fonts —
the app named them but did not ship them until they were added, so any Barlow
string fell back to Arial Narrow and measured wide. `scripts/fetch-fonts.sh`
fetches these; jgs5 (the LED face) must be added by hand and is still missing,
so LED readouts fall back to jgs7 and render wider than the file.

## Verifying visual parity

Compare `[data-node]` boxes, not whole-page screenshots: the reference HTML
wraps each artboard in viewer chrome that renders off-viewport, so a naive
pixel diff of the two pages is meaningless. Force a common font on both sides
while measuring so font-availability differences do not read as layout bugs.
