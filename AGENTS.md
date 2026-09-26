# u2gas

React + Vite frontend (`web/`) over a Cloudflare Worker API (`worker/`).

## Commands (run from `web/` unless noted)

- `npm run dev` — Vite dev server; this is what the preview tunnel serves
- `npm run check:frontend` — asset + Figma route registry guards
- `npm run check:assets` — fails if a font/image referenced by CSS is missing
- `bash scripts/check-figma-parity.sh` (repo root) — proves `web/src/figma/screens/`
  still matches `docs/u2gas-all-screens.html` byte for byte (generator `--check`)
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

A back control must be *visible*. `figma-route-interactive` is deliberately
transparent (`background: transparent; border: 0`), so a back hotspot only
reads as a button when it lands on artwork the file already draws:

- `CartEmpty` (`1:1624`) draws its arrow at (12,28) and (8,30) — put the
  hotspot on those, not at the artboard's nominal top-left.
- `ShopSingleItem` / `ShopItemUnavailable` draw theirs at (32,80) 52x52
  (`1:1483`), not at (25,70) where the hotspot used to sit.
- `Home` (`1:251`) and `WalkInPayment` (`1:4592`) draw no back control at all.
  `Home` gets an app-rendered `BackButton` in the clear band above the LED
  readout (top y=101); the Collect screen gets a hotspot in the band above its
  first element (top y=52). Neither artboard may be edited to add one — that
  would break `check-figma-parity.sh`.

When adding a back affordance, confirm it overlaps something drawn, or render a
`BackButton` instead of a bare hotspot.

Screens with no artboard (or no drawn back control) get `BackButton to="<parent>"`
as the first child of `.screen`: `OrderStatus` (both the app-drawn receipt and the
`1:762` paid frame, since `/orders/:id` is deep-linked from mail), `Login`,
`VerifySent`, `Drop`, and `StockHistory`. `/`, `/staff/*`, `/driver` and the other
admin tabs are top-level tabs, so they get none.

## The tank is a functional screen, not an artboard

`/admin` used to render `1:3887` / `1:3075` / `1:2847` and recover interaction by
hit-testing raw click coordinates (`x >= 120 && x <= 260 && y >= 610`) against
the drawing. Nothing in the drawing said which region was minus, plus or save, so
the control that moved the tank had no accessible name and had to be found by
trial; the rate and the history were unreachable. It is now a normal screen built
from the primitives that keeps `TankGauge` (the artboard's own gauge language,
already reused by `Reports`). History moved to `/admin/tank/history` so it has a
URL. Do not reintroduce coordinate hit-testing to "restore" the artboards.

## Viewport fitting

The artboards are a fixed 440px wide with absolutely positioned children, so
they cannot reflow narrower. The shell fits them to the viewport with CSS
`zoom` (`.frame-plate` in `components.css`) and centres the plate; do not
re-add `max-width: 100%` to `.figma-route-frame`, which used to clamp the
wrapper while its 440px child did not shrink and caused horizontal scroll.
Elements that must keep a real 44px tap target under the plate scale cancel it
with the inverse zoom.

## The artboard styling invariant (easy to break)

`docs/u2gas-all-screens.html` is the design source of truth. The app renders
that markup verbatim via `FigmaScreen` / `FigmaRouteFrame` (root class `.frame`),
and every artboard child is **absolutely positioned from the file's own
coordinates**. Nothing in the app may reach inside `.frame` and change layout,
colour, or text metrics.

`web/src/figma/{assets,screens,artboards}.ts` are generated files — run
`python3 build/gen_react.py` from the repo root to regenerate them after the
gallery changes, and never hand-edit a screen. The gallery draws each picture as
`<span class="asset-img" style="--src:var(--aN)">`, painted by
`.frame .asset-img { background-image: var(--src); background-size: contain }`.
The generator only repoints `--src` at the imported asset and leaves the span
alone, because an `<img object-fit: contain>` is **not** equivalent: Chromium
centres the scaled picture at a different subpixel offset, which put every
cropped photo a pixel out (worst board 0.88%). Keep the span, and keep the
modifier classes (`is-unavailable`, opacity .4) on it — they must not be dropped.

`npm run check:figma-pixels` renders every app artboard with `genboards.mjs` and
pixel-compares it against the gallery (`static-diff.mjs`, needs the dev server
on :12001). All 63 artboards must report 0%.

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
jgs7 is the pixel face, jgs5 the LED face (readouts and tickers) and Homemade
Apple the profile name. The reference pulls Barlow Condensed SemiBold and Barlow
Semi Condensed SemiBold from Google Fonts — the app named them but did not ship
them until they were added, so any Barlow string fell back to Arial Narrow and
measured wide. `scripts/fetch-fonts.sh` fetches these.

jgs5 was the last face named-but-not-shipped: `--font-led` had always listed it
and `figma.css` declared it, but that declaration pointed at a *relative*
`url("fonts/jgs5.woff2")`, which resolves against the stylesheet rather than the
document and so 404'd. Every LED readout silently fell back to jgs7. Both files
now embed the face as a data URI (as jgs7 already did) and `tokens.css` serves
it from `/fonts/`. jgs5 and jgs7 share advances, so this changes the glyphs, not
the widths — a width-only check cannot see it.

## Verifying visual parity

`npm run check:dom-parity` (`dom-token-diff.mjs`) is the gate that renders the
*demo* — not the generated markup — and compares each route's live DOM against
the same artboard in the gallery: structure, geometry and computed tokens
(font, colour, weight, tracking, radius, opacity, transform). The dev server
must be on :12001. It prints `STRUCTURAL + TOKEN PARITY: CLEAN` or the offending
`[data-node]`. Run it after any change to a route, a `.frame`-scoped rule, or a
font.

The other three checks each prove less than they appear to, and all four are
needed:

- `check:figma-parity.sh` — the generated markup equals the gallery, byte for
  byte. Nothing about the cascade or the live data.
- `check:figma-pixels` — the app's artboard *rendering* matches the gallery.
  Still not the demo: it renders the markup on its own, with one stylesheet.
- `check:frontend` — assets exist and every artboard the registry *names* is a
  real screen. It now also fails when a route lists an artboard that no route
  code draws, because the registry used to claim 15 artboards (`1:2107`,
  `1:1344`, `1:1517`, …) that no route rendered — the coverage read as complete
  for screens that were absent. Removing a claim needs the same note the empty
  entries carry: say which artboard and why it is not used.

Two things that make the demo differ from the file without being drift, and how
the harness handles them: a route may swap live data into a text leaf (the box
follows the text, so geometry on a changed leaf is not compared, only whether
the value escapes the 440px board), and a route may toggle a state the file
draws in one composite (`1:4643` in the walk-in frame is hidden until PAY;
`STATE_TOGGLED`). Anything else is a real difference.

`FigmaScreen` warns when a `values` key does not resolve to a text leaf. The
harness treats a console warning as a failure, so a value bound to a container
(the bug where a heading's live text was injected over its children) is caught
rather than silently leaving the drawn sample on screen.

Compare `[data-node]` boxes, not whole-page screenshots: the reference HTML
wraps each artboard in viewer chrome that renders off-viewport, so a naive
pixel diff of the two pages is meaningless. Force a common font on both sides
while measuring so font-availability differences do not read as layout bugs.

## What the four parity checks cannot see

All four pass on a screen that is still wrong, in two ways worth knowing.

**A value that is right but *formatted* differently.** The ticker read
`Today's Rate` while the file draws `Today&rsquo;s Rate`. A straight `'` and a
curly `’` are different characters; the substitution list even reported the
swap as "live data substituted", so it looked intentional. It is not — the
design's glyph was replaced. Match the file's punctuation exactly (`&middot;`,
`&rsquo;`, `&mdash;`). `FigmaScreen` decodes those named entities before
matching, so a route can key on the character a reader sees.

**Text no `[data-node]` covers.** The driver's drop rows are plain `<p>` with no
id. An unbound row therefore compared *nothing*: the geometry walk only visits
ids, so `/driver` reported CLEAN while still showing Figma's sample order number
and address. `dom-token-diff.mjs` now collects every leaf string in document
order, tags whether an id covers it, and pairs the two sides **positionally**.
Matching on text alone is not enough — the first active drop's real order number
*is* the `U2-100045` the file also draws in its third row — so only a pair that
is orphan on both sides, at the same index, still holding the file's string,
counts as stale. When adding a screen with unbound sample text, verify the
detector fires by temporarily reverting the binding.

Two related traps in the same code:

- `el.closest("[data-node]")` always matches, because the artboard root is
  itself `[data-node]`. Test against the root explicitly.
- A drawn row is `<p>U2-100045<br>19 Bode Thomas</p>`; the `<br>` is an element
  child, so a "no children" leaf test skips exactly these nodes. Tolerate `<br>`
  and split on it, or the joined string matches no order-number pattern.

## Demo fixtures are part of the design

The drawing always shows three rows in each driver list. With two active and one
finished delivery the spare rows had nothing to bind, so the screen repeated an
order or printed a placeholder. `orders` now carries one delivery per drop so
each list fills from real records. Do not pad a list by repeating a record:
`withDeliveryOrder` used to fall back to `orders[0]` for an unmatched id, which
made every row show the same order number and customer, and no caller could tell
the lookup had failed. It now 404s. `flaggedQueue`'s `failed_deliveries` had the
same hardcoded-order defect.
