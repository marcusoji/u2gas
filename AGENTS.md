# u2gas

React + Vite frontend (`web/`) over a Cloudflare Worker API (`worker/`).

## Commands (run from `web/` unless noted)

- `npm run dev` إŒؤ†أ¶ Vite dev server; this is what the preview tunnel serves.
  Vite binds loopback unless told otherwise, so a bare `npm run dev` leaves the
  `work-*` tunnel answering **502 Bad Gateway** while `curl 127.0.0.1:12001`
  is a clean 200. Start it as the root `npm run dev` does إŒؤ†أ¶ `vite --host
  0.0.0.0 --port 12001 --strictPort` إŒؤ†أ¶ or the preview URL is unreachable even
  though the app is running.
- `npm run check:frontend` إŒؤ†أ¶ asset + Figma route registry guards
- `npm run check:assets` إŒؤ†أ¶ fails if a font/image referenced by CSS is missing
- `bash scripts/check-figma-parity.sh` (repo root) إŒؤ†أ¶ proves `web/src/figma/screens/`
  still matches `docs/u2gas-all-screens.html` byte for byte (generator `--check`)
- `npm run build` â€” asset check, `tsc -b`, `vite build`, then the CSP header.
  It fails if `VITE_API_ORIGIN` is unset, because the CSP names the API origin
  explicitly; the script reads Vite's own `.env` (loading it via `loadEnv`), so
  the value does not have to be exported a second time. A
  `VITE_EMBEDDED_API=true` build contacts no API and may omit the origin â€”
  and the flag takes precedence: when it is set, `VITE_API_ORIGIN` is ignored
  for the header even if `.env` still names a local Worker, so `connect-src`
  is 'self' and a mock build never ships a `127.0.0.1` directive.

Local preview: `VITE_EMBEDDED_API=true` serves the whole UI from in-browser
fixtures, so every screen is reachable with no sign-in. Role links use
`?as=<role>`, and a bottom-right switch changes role.

## Routes and back navigation

`/` is the entry screen (LOG IN 1, figma `1:1219`) with a guest path to
`/home`, which is the customer terminal. `auth.ts` and `mocks/gate.ts` both
map the customer role to `/home`, not `/`.

Back navigation on deep screens goes through `useBackTo(to)` in
`components/primitives.tsx` (`BackButton` wraps it). Do not use
`window.history.length > 1` to decide whether back is safe: it is already
greater than 1 in a fresh tab, so a cold deep link pops out of the app.
`useBackTo` checks `location.key === "default"` إŒؤ†أ¶ true only for the entry the
router booted on إŒؤ†أ¶ and otherwise falls back to the screen's known parent.

A back control must be *visible*. `figma-route-interactive` is deliberately
transparent (`background: transparent; border: 0`), so a back hotspot only
reads as a button when it lands on artwork the file already draws:

- `CartEmpty` (`1:1624`) draws its arrow at (12,28) and (8,30) إŒؤ†أ¶ put the
  hotspot on those, not at the artboard's nominal top-left.
- `ShopSingleItem` / `ShopItemUnavailable` draw theirs at (32,80) 52x52
  (`1:1483`), not at (25,70) where the hotspot used to sit.
- `Home` (`1:251`) and `WalkInPayment` (`1:4592`) draw no back control at all.
  `Home` gets an app-rendered `BackButton` in the clear band above the LED
  readout (top y=101); the Collect screen gets a hotspot in the band above its
  first element (top y=52). Neither artboard may be edited to add one إŒؤ†أ¶ that
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

`web/src/figma/{assets,screens,artboards}.ts` are generated files إŒؤ†أ¶ run
`python3 build/gen_react.py` from the repo root to regenerate them after the
gallery changes, and never hand-edit a screen. The gallery draws each picture as
`<span class="asset-img" style="--src:var(--aN)">`, painted by
`.frame .asset-img { background-image: var(--src); background-size: contain }`.
The generator only repoints `--src` at the imported asset and leaves the span
alone, because an `<img object-fit: contain>` is **not** equivalent: Chromium
centres the scaled picture at a different subpixel offset, which put every
cropped photo a pixel out (worst board 0.88%). Keep the span, and keep the
modifier classes (`is-unavailable`, opacity .4) on it إŒؤ†أ¶ they must not be dropped.

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
class name إŒؤ†أ¶ `grep -o 'class="[^"]*"' web/src/figma/screens/*.ts` إŒؤ†أ¶ and scope
accordingly.

## Fonts

Self-hosted under `web/public/fonts/`, declared in `src/styles/tokens.css`.
jgs7 is the pixel face, jgs5 the LED face (readouts and tickers) and Homemade
Apple the profile name. The reference pulls Barlow Condensed SemiBold and Barlow
Semi Condensed SemiBold from Google Fonts إŒؤ†أ¶ the app named them but did not ship
them until they were added, so any Barlow string fell back to Arial Narrow and
measured wide. `scripts/fetch-fonts.sh` fetches these.

jgs5 was the last face named-but-not-shipped: `--font-led` had always listed it
and `figma.css` declared it, but that declaration pointed at a *relative*
`url("fonts/jgs5.woff2")`, which resolves against the stylesheet rather than the
document and so 404'd. Every LED readout silently fell back to jgs7. Both files
now embed the face as a data URI (as jgs7 already did) and `tokens.css` serves
it from `/fonts/`. jgs5 and jgs7 share advances, so this changes the glyphs, not
the widths إŒؤ†أ¶ a width-only check cannot see it.

## Verifying visual parity

`npm run check:dom-parity` (`dom-token-diff.mjs`) is the gate that renders the
*demo* إŒؤ†أ¶ not the generated markup إŒؤ†أ¶ and compares each route's live DOM against
the same artboard in the gallery: structure, geometry and computed tokens
(font, colour, weight, tracking, radius, opacity, transform). The dev server
must be on :12001. It prints `STRUCTURAL + TOKEN PARITY: CLEAN` or the offending
`[data-node]`. Run it after any change to a route, a `.frame`-scoped rule, or a
font.

The other three checks each prove less than they appear to, and all four are
needed:

- `check:figma-parity.sh` إŒؤ†أ¶ the generated markup equals the gallery, byte for
  byte. Nothing about the cascade or the live data.
- `check:figma-pixels` إŒؤ†أ¶ the app's artboard *rendering* matches the gallery.
  Still not the demo: it renders the markup on its own, with one stylesheet.
- `check:frontend` إŒؤ†أ¶ assets exist and every artboard the registry *names* is a
  real screen. It now also fails when a route lists an artboard that no route
  code draws, because the registry used to claim 15 artboards (`1:1344`,
  `1:1517`, إŒؤ†â€‌) that no route rendered إŒؤ†أ¶ the coverage read as complete
  for screens that were absent. Removing a claim needs the same note the empty
  entries carry: say which artboard and why it is not used.

## Rows the drawing does not id

`FigmaScreen` binds live data by replacing the text of named `[data-node]`
leaves. An artboard whose rows carry no ids cannot carry real records إŒؤ†أ¶ the
drawn sample stays on screen, and `dom-token-diff.mjs` sees nothing to compare,
so the route reads CLEAN while showing Figma's sample order. `/history` hit
this; it is now handled by rendering the artboard for its chrome and painting
live rows over it.

`/history` (1:2107 TRANS HISTORY) renders the artboard for its chrome إŒؤ†أ¶ the
drawn `HISTORY` heading, the month strip, the panel, the top fade, the
watermark, the copyright إŒؤ†أ¶ and paints live receipts at the two card boxes the
file reserves. `HistoryReceipt.tsx` is the row template, carrying the drawing's
measurements verbatim: 241px paper, `drop-shadow(0 4px 24px rgba(0,0,0,.18))`,
`RECEIPT` at 14px `-0.56px` 17px down, the date at 32px `-1.28px` 37px down.

The re-issued file redrew the receipt body, and the old row model no longer
matches it. Each line is a **223أ—37 block 45px apart** from the card's top 87
(1:2134's rows sit at 87 and 132), not a 12px flex row 9px apart: a 33أ—37
product image at the block's left (`opacity: .7`), the label 10px `-0.4px` at
x33, a dotted leader at x128, `â‚¦` 10px at x177 and the amount 14px `-0.56px`
at x183. The 100أ—100 QR (`373:11504`) is stamped 69px below the last row, so
it follows the row count. The status strip keeps its 241أ—70 `#1317e4` with a
1px `#797bf4` edge and its 16px `-0.64px` label, but the dashed slot (1:2201)
is gone: the file draws a **four-segment progress bar** (445:16125), 158أ—20
at (40,38), segments 38أ—6 radius 3 at x 0/40/80/120 with the last unfilled,
and `In motion` 10px beneath. The month strip's chips are 24px tall and now
read MARCHâ€¦DECEMBER, 24px type `-0.96px`. All of this lives in
`figma-route.css` and `HistoryReceipt.tsx`, not inline, and must be changed
with the drawing.

The receipts are a **row, not a list**. The file draws `1:2134` at x=60 and
`1:2170` at x=341 إŒؤ†أ¶ 241 wide, 40px apart إŒؤ†أ¶ so the second is cut by the 440px
board and the row plainly continues past it. The app keeps that crop and lets
the row scroll horizontally (`.history-rail`, `left:60 top:312 width:380`,
hidden scrollbar) rather than stacking the cards vertically. One status strip,
not one per row: the file draws `1:2199` only over the first receipt, so
`i === 0` gates it and every column still reserves the 78px band above the
paper so the cards keep one baseline.

The sample rows and the sample month strip (`1:2134`, `1:2170`, `1:2199`,
`1:2115`) are hidden by `.figma-route-frame.is-history`. Their text leaves carry no `data-node` id, so
nothing can bind over them and a real user would otherwise read Figma's example
order (`GAS 10KG`, `6-pack batteries`, `17 MAR`). `dom-token-diff.mjs` lists
them in `TEMPLATE_ROWS_HIDDEN` (with the nine chip ids `1:2116`..`1:2132`): the boxes stop being compared, but a new
`template-row-visible` check fails the run if the route stops hiding them, so
the declaration cannot be used to skip a row that leaks.

Two traps in that screen. The panel `1:2112` is itself at `top:80`, so the
drawn `top:232` and `top:151` land at 312 and 231 **on the board** إŒؤ†أ¶ reading
them straight off the child tags puts the strip and month row 80px high, over
the heading. And `.history-strip` / `.history-card` are `position: relative`
inside `.history-rail`, which is their containing block: made absolute (the
obvious reading, since the drawn cards are absolute children of the artboard)
both land on the rail's origin and the strip covers the paper. The rail is sized
by its content, not stretched to the board's bottom, or its transparent box
swallows clicks in the watermark band.

The registry entry for such a route names the artboard it renders *and* says
which row template fills it, so `check:frontend` still proves the route draws
what it claims.

## The basket, and why checkout is a route

`1:1517` CART - ITEM UNAVAILABLE paints its basket as a **single 356x516 bottle
illustration** (`1:1585`) with the jars and LEDs composited on top. It itemises
nothing: there is no card per line and no text leaf to bind. The three 400x120
dashed rows lower down (`1:1543`, `1:1521`, `1:1563`) are the `SHOP OTHER
ACCESSORIES` strip إŒؤ†أ¶ their group names say so إŒؤ†أ¶ and are a designed element that
must stay visible. Do not hide them or paint live lines over them.

So `BasketLine.tsx` is the row template (the file's own card, discs, type) and
the live lines sit in the band the file leaves empty between the Checkout button
and that strip: `.basket-lines` at `top:872`, 244px tall, scrolling, with the
running total below it. The band is not drawn, so nothing is covered; the rows
would overflow the board if they went under the strip.

`1:1589`'s `ITEM UNAVAILABLE` stamp is a **state, not copy**. It is drawn on the
board but hidden at rest إŒؤ†أ¶ the route sets `is-short` only when the server
refuses a line إŒؤ†أ¶ so it is listed in `STATE_TOGGLED`, not `TEMPLATE_ROWS_HIDDEN`,
because it is genuinely toggled rather than replaced by a template.

The sheet `1:1517` draws over the basket is a different screen: `1:1703`
WALK-IN, `1:1827` DELIVERY with the address confirmed, `1:1952` DELIVERY with
none yet. Checkout is therefore `/checkout`, not a modal on `/cart`, and each
state renders the frame that already draws it. Do not reintroduce a modal.

Two traps in the checkout sheet. The toggle chips and the tiles are **hug/flex**,
so their widths come from the pixel font's advances إŒؤ†أ¶ recomputing them by hand
puts the hotspot off the drawn chip. `CheckoutSheet` measures each drawn node's
box instead (`useDrawnBoxes`), which is the same fix as the back hotspots. And
`1:1952` draws its toggle, its `PAYMENT OPTIONS` heading and its handle with **no
`data-node` ids**, so those are placed from the panel box with the offsets the
other two boards do share (`DERIVED`).

`?add=<id>` (in `lib/useAddFromQuery.ts`) seeds one catalogue item so a basket
state can be deep-linked. It is shared by `/cart` and `/checkout` because a cold
`/checkout?add=إŒؤ†â€‌` otherwise arrives empty and bounces to `/cart`; the hook
returns whether a seed is in flight so the redirect waits for it, and a ref
guard stops StrictMode's double effect adding the item twice.

Three things make the demo differ from the file without being drift, and how
the harness handles them: a route may swap live data into a text leaf (the box
follows the text, so geometry on a changed leaf is not compared, only whether
the value escapes the 440px board); a route may toggle a state the file draws in
one composite (`1:4643` in the walk-in frame is hidden until PAY;
`STATE_TOGGLED`); and a route may hide a drawn row that is a *template* rather
than content (`TEMPLATE_ROWS_HIDDEN`, the history samples إŒؤ†أ¶ those still fail
the run if they are visible, via `template-row-visible`). Anything else is a
real difference.

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
curly `إŒؤ†أ–` are different characters; the substitution list even reported the
swap as "live data substituted", so it looked intentional. It is not إŒؤ†أ¶ the
design's glyph was replaced. Match the file's punctuation exactly (`&middot;`,
`&rsquo;`, `&mdash;`). `FigmaScreen` decodes those named entities before
matching, so a route can key on the character a reader sees.

**Text no `[data-node]` covers.** The driver's drop rows are plain `<p>` with no
id. An unbound row therefore compared *nothing*: the geometry walk only visits
ids, so `/driver` reported CLEAN while still showing Figma's sample order number
and address. `dom-token-diff.mjs` now collects every leaf string in document
order, tags whether an id covers it, and pairs the two sides **positionally**.
Matching on text alone is not enough إŒؤ†أ¶ the first active drop's real order number
*is* the `U2-100045` the file also draws in its third row إŒؤ†أ¶ so only a pair that
is orphan on both sides, at the same index, still holding the file's string,
counts as stale. When adding a screen with unbound sample text, verify the
detector fires by temporarily reverting the binding.

Two related traps in the same code:

- `el.closest("[data-node]")` always matches, because the artboard root is
  itself `[data-node]`. Test against the root explicitly.
- A drawn row is `<p>U2-100045<br>19 Bode Thomas</p>`; the `<br>` is an element
  child, so a "no children" leaf test skips exactly these nodes. Tolerate `<br>`
  and split on it, or the joined string matches no order-number pattern.

## Measuring drift against live Figma

When comparing the gallery to the live file, two mistakes both produce a large
false reading, and each one cost a full investigation before it was caught.

**Do not screenshot an artboard by reparenting it to the viewport.** A harness
that moved `.frame` out of the rack to capture it changed what painted إŒؤ†أ¶ the
artboard's own `background: #fff` and the rack context stopped applying, so the
capture came back mostly dark and the diff read 20-30% on screens that were
fine. Clip to the element's own box (`element.screenshot()` after
`scrollIntoView`) and verify the capture independently: probe a known point with
`document.elementFromPoint`, and check a colour you can predict. If the PNG and
the DOM disagree, the capture is wrong, not the page.

**A node's fill must be cross-checked against Figma's `visible` flag, not
trusted by id.** Three profile artboards (`1:2090`, `1:4665`, `1:4968`) carry
two stacked gradient rectangles إŒؤ†أ¶ a hidden white fade and a visible black
scrim. The gallery painted the *hidden* fade's colour at the *visible* node's
id, so the header photo washed out to white. Nothing in the four gates can see
this: the markup is self-consistent, the tokens match the id they claim, and
the geometry is identical. Enumerate every gradient overlay and compare its
`visible` flag to whether the gallery draws it. A node that is `visible: false`
in Figma and rendered in the gallery, or vice versa, is the signature.

Also note the gallery is a *hand-maintained* snapshot: it is not regenerated
from Figma, so a live-file change lands as silent drift. `docs/figma-relabel.py`
and `docs/figma-drive-images.py` exist for targeted patches, and
`build/gen_react.py` only propagates the gallery into `web/src/figma`.

## Demo fixtures are part of the design

The drawing always shows three rows in each driver list. With two active and one
finished delivery the spare rows had nothing to bind, so the screen repeated an
order or printed a placeholder. `orders` now carries one delivery per drop so
each list fills from real records. Do not pad a list by repeating a record:
`withDeliveryOrder` used to fall back to `orders[0]` for an unmatched id, which
made every row show the same order number and customer, and no caller could tell
the lookup had failed. It now 404s. `flaggedQueue`'s `failed_deliveries` had the
same hardcoded-order defect.

## A refusal belongs where the file draws it

`1:175` is named INSUFFICIENT GAS **INPUT**, and the name is the spec: it is the
terminal at input time, not a sheet reached by pressing PAY. The shortfall board
replaces HOME as soon as the typed amount exceeds what the depot holds, so the
keypad that corrects it is the same keypad already under the reader's finger,
and PAY is inert until the amount comes down. `openSheet` refuses while
`looksShort`, which means the `takeWhatsLeft` "accept what's left" helper and the
`partialGasAvailable` branch on this route are unreachable إŒؤ†أ¶ the server's
authoritative check still runs inside the reservation transaction, but the UI
never reaches it with a known-short amount.

Two consequences worth keeping:

- `dom-token-diff.mjs` covers it as `/home?kg=9999` (`1:175`). The board's live
  leaves are `1:220` (the amount) and `1:181` (the ticker), which carries HOME's
  `ONLY nKG LEFT â”¬ؤک Today's RateإŒؤ†â€‌` warning rather than the bare rate.
- Its drawn message is `INSUFFICIENT- Please redude` إŒؤ†أ¶ the file's own typo, in
  the file's own wording. Do not "fix" it: it is drawn text, and the parity
  harness compares it character for character.

The initial-JS budget (160KB) is not met. `index.html` preloaded `app-staff`
(إŒؤ“إ‚800KB raw, إŒؤ“إ‚300KB gzip) because of how Rollup placed *shared* code, not
because anything imported the staff routes.

The entry graph is `main.tsx إŒأ¥أ† App.tsx إŒأ¥أ† routes/customer/Home.tsx إŒأ¥أ†
figma/FigmaScreen.tsx إŒأ¥أ† figma/artboards.ts` إŒؤ†أ¶ the home route is statically
imported ("the default chunk, so no lazy wrapper on the home route"), so the
entry genuinely needs `FigmaScreen` and the whole 61-board registry. The
`manualChunks` function only named `/routes/{admin,staff,driver}/`, so every
other module إŒؤ†أ¶ `components/primitives`, `components/terminal`, `lib/api`,
`lib/media`, `lib/auth`, `mocks/gate`, `figma/*` إŒؤ†أ¶ was left unassigned and
Rollup swept it into the first role chunk it emitted, `app-staff`. The entry
then imported that chunk, and `modulepreload` followed. It was never true that
a customer "downloaded the staff bundle" by importing staff code: `probe` over
the real module graph finds **no static path from `main.tsx` to `StaffApp.tsx`**.
The staff *chunk* was on the entry path only because it held shared modules.

Naming a chunk for the shared modules fixes it: `/components/`, `/lib/`,
`/mocks/`, `/figma/` and `/styles/` now map to `app-shared`. After that build,
`index.html` preloads `vendor`, `vendor-react`, `vendor-supabase` and
`app-shared`; `app-staff`, `app-driver` and `app-admin` are lazy and each
depends only on `app-shared`. `app-shared` is still إŒؤ“إ‚316KB gzip (mostly the
artboard registry), so the 160KB budget needs a further step إŒؤ†أ¶ stop the entry
importing the full registry (lazy-load the artboards or `FigmaScreen` per
route) إŒؤ†أ¶ but the role-separation requirement is met. Measure the preload set in
`dist/index.html`, not the build log: the log shows a small `index` chunk and
hides what is preloaded.

## Printing the report

`/admin/reports` renders two trees. The screen is the dashboard â€” gauge, trend
bars, tap targets â€” and `.report-print` is a plain table rendered next to it,
hidden with `display: none`. `printReport` just calls `window.print()`; the
`@media print` block in `components.css` hides the whole screen subtree
(`body * { visibility: hidden }`) and re-reveals `.report-print`, so the printer
gets the document and never the dashboard. The daily period exists mostly for
this. If you add a figure to the screen, add it to the print sheet too â€” the two
trees do not share markup on purpose, because a dashboard does not paginate.

## The roster is three drawings, and two of them were unwired

`/admin/people` renders every staff artboard the file draws rather than
picking one. 1:2747 STAFF LAYOUT 2 is the six-up grid; 1:2686 ADD STAFF is the
same grid with its third tile left as the drawn `[ NAME ] / [ POSITION ]` slot
and a plus at (351,145); 1:2624 STAFF LAYOUT 1 is the row of four avatars with
the selected person's ROLE / ACCOUNT NUMBER / BANK and the drawn REMOVE STAFF;
1:2803 STAFF LAYOUT 2 DETAILS is one person's full profile. The two alternative
layouts are reached with `?state=add` and `?layout=1` إŒؤ†أ¶ the registry used to
call them "alternative layouts, not states the screen moves between", which
left two boards rendering nowhere while `check:frontend` still read as
complete. A board the registry names must be a board some route draws.

Two things about the bindings:

- The API nests the role on `profile` (`profile:profile_id ( إŒؤ†â€‌ role إŒؤ†â€‌ )`), so
  `staff.role` is undefined and a row read that way prints a dash for every
  person. Read `profile.role`. The database's `staff` role is the design's
  CASHIER, so the drawn vocabulary needs the same mapping `StaffProfile` uses;
  `STAFF`/`MANAGER`/`DRIVER` are not the words on the board.
- A grid slot with no record keeps the file's own sample (SMITH, MICAH, إŒؤ†â€‌).
  Padding a short roster with a dash would put an invented person on screen;
  leaving the drawn text is the honest "nobody here" state, and it is what the
  text-substitution path does when an array element equals the sample.

## Staff lifecycle: add and remove

The drawn plus and REMOVE STAFF had nothing behind them. `admin_add_staff` and
`admin_remove_staff` (migration `0024`) are the two controls, reached from
`POST /admin/staff` and `DELETE /admin/staff/:id`.

Adding writes **two** rows, and both are needed before the person can act: a
`profile` with the role (`requireRole` reads the role from the table, never the
JWT, so a stale token cannot carry a revoked one) and a `staff_member` row
(every till write is attributed to one; without it a cashier signs in and gets
`STAFF_RECORD_MISSING` on the first sale). The account may already exist, so
adding is an upsert of the role plus the staff row, not a new identity.

Removing is soft: the person is named on every sale they rang up, so the row
and its history stay and only `staff_member.status` changes to `removed`. The
last active admin cannot be removed إŒؤ†أ¶ a roster with nobody who can manage it is
unrecoverable through the app إŒؤ†أ¶ and the error says to add another first, which
reads better than FORBIDDEN. Both functions are `security definer`, so the
migration revokes them from `anon`/`authenticated`: without that a signed-in
admin's own JWT could call them through PostgREST and bypass the Worker.

The demo store is in memory, so a reload resets it. A functional test that adds
a person, navigates, and expects them still there must stay on one page load إŒؤ†أ¶
and must click through the UI (the drawn plus, the drawn REMOVE STAFF) rather
than calling the API, or it proves nothing about the controls being wired.

importing the full registry (lazy-load the artboards or `FigmaScreen` per
route) إŒؤ†أ¶ but the role-separation requirement is met. Measure the preload set in
`dist/index.html`, not the build log: the log shows a small `index` chunk and
hides what is preloaded.

## The re-issued GIFT-TECH file: node ids moved, geometry did not

The live file was re-issued under a new name (GIFT-TECH) and page (`u2` =
`152:2265`), and it reassigned **every** node id (`1:*` â†’ `4xx:*`). The gallery
and `web/src/figma` key on the old `1:*` ids, and `check-figma-parity.sh` only
proves gallery-vs-generated, so a re-issue lands as *silent* drift: all four
gates stay green while the drawing has moved underneath them.

What actually changed, and how to see it:

- **Geometry is stable.** A node's box is within a pixel or two of its old box,
  so the two sides can be diffed positionally: for each old gallery node, the
  live text at the same `(x, y)` is its refinement â€” "compare `[data-node]`
  boxes, not whole-page screenshots" is the right instinct here. The gallery
  resolves `translateX(-50%)`, `bottom:` and `calc(50% آ± npx)` in `style=`, so
  parse those before matching or the centred nodes (titles, footer, tickers)
  read as no-match.
- **Copy refinements are real, and `C0PYRIGHT` is one of them.** Every board's
  footer is now `C0PYRIGHT 2026 U2 OIL AND GAS LTD.` (zero for "o") â€” the file's
  own typo, which the parity harness compares character for character. The
  gallery, `figma.css` and the two app bindings (`primitives.tsx`'s `U2Mark`,
  `staff/Collect.tsx`'s `1:4530`/`1:4595`) all had to move together.
- **Live-only strings that are *not* screens live in `ASSETS AND SCRAPS`.** Its
  `MORE FOR YOU`, `PAYMENT OPTIONS`, `SHOP OTHER ACCESSORIES`, keypad digits and
  the alternate `Todayâ€™s Rate` forms are scrap frames, not the artboards â€” the
  gallery already carries the drawn equivalents under the old ids. Confirm a
  live-only string's frame path before "refining" it, or you will copy scrap
  copy onto a screen.
- **Readouts the file marks hidden are not refinements.** Every admin, cashier
  and driver board carries an `AVAILABLE QUANTITY / 6.54 / TONS` group, but the
  live file marks all three leaves **`visible: false`** â€” the boards draw the
  bare scanner instead, and only the two functional tank screens (`UPDATE GAS`,
  `GAS LVL CHECK`) show a real readout. Enumerating text by id alone (without
  the `visible` flag) reads those hidden leaves as new copy and paints them on;
  that was a regression, now reverted. The checklist in "Measuring drift"
  applies here too: a node that is `visible: false` in Figma but rendered in the
  gallery (or an injected one the file hides) is the signature.
- **The scan screens were redrawn.** The live scanner body is an image-backed
  frame (`Frame 60` holding `Frame 65`), not the old vector module; bringing
  that across verbatim is a larger, image-dependent job than the copy pass and
  is tracked separately. The fetch harness's `change_list.txt` lists the
  live-only nodes frame by frame.

Removing the `manager` role is a consequence of the same re-issue: the file
draws customer, cashier (`staff`), driver and admin only. It is gone from the
`Role` unions (front and Worker), `requireRole`, the add-staff vocabulary, the
embedded fixtures, `app_role` and the migrations; admin overrides and low-stock
alerts are admin-only now.

## The re-issue is per-board, and a geometry join is not enough to see it

The four gates all compare the *gallery* to the *generated markup* (or to the
app's render of it). None of them reads the live file, so when the file is
re-issued they stay green while individual boards have genuinely moved. The way
to find which boards actually changed is to compare each gallery frame to its
live counterpart, and the trap is the pairing itself.

The old geometry join (score each gallery frame against every live frame by box
overlap) produced false pairs: it matched `1:3461` (a 1739-tall cashier NOTIF
board) to `475:19526` (the 1739-tall admin NOTIF board) because their empty
chrome overlapped, and it matched `1:2847` (admin GAS HISTORY) to the
`GAS HISTORY` live frame by name but scored the *wrong* `GAS HISTORY` when two
existed. Both directions produce noise that reads as "the whole app drifted".

Pair by **name + height** from the gallery caption instead â€” `figcaption`'s
`<b>APP</b>Title` and the `440أ—H` in its `<em>` â€” then disambiguate the
duplicate names (`HOME`, `NOTIF STATE`, `DIVIDER`) with the geometry score only
as a tie-break. `.figdiff/namemap.py` writes that map; `.figdiff/setdiff.py`
then compares each pair's *own-text* set (a node's direct text, not its
descendants â€” `dumpref.mjs` now dumps `own` alongside `text` for this) and
reports the boards whose vocabulary really differs. Run those two after any
re-issue; they are the only thing that sees live drift.

What the comparison showed for this re-issue, and what it means:

- **The vocabulary deltas that are real:** TRANS HISTORY (months
  MARCHâ€¦DECEMBER, the QR, the progress bar, `In motion`, `RECEIPT`), and the
  admin GAS HISTORY panel now reads `2 TONS - ADDED BY MR GIFT` (the `23rd` and
  `30th` history rows). Those boards are the copy pass.
- **The rest is mostly not drift.** `AMOUNT IN NAIRA`/`1KG`/`UPDATE`/`WALK-IN`
  on the PAY boards are the *drawn* labels the gallery already carries, and
  `C0PYRIGHT`/`Todayâ€™s Rate` are the known re-issue strings â€” `setdiff.py`
  normalises the punctuation-only forms away so they do not mask a real delta.
- **The scan screens are a redraw, not a copy pass.** The live scanner body is
  now an image-backed frame (`Frame 60` holding `Frame 65`), so bringing it
  across is an image-dependent job; the copy refinements can land first and the
  scanner body follows separately.
- **`BLACK CONCEPT` (`306:8081`) and `PERSONAL DTS` (`376:11738`) are live
  frames the gallery never carried** â€” BLACK CONCEPT is the profile board with
  the drawn `RECENT HISTORY`, and PERSONAL DTS is the profile-with-history
  variant. `1:2090`/`1:2244` are their stale counterparts. Decide per board
  whether it is "not designed yet" (leave) or a superseded frame (retire).

Do not hand-edit `web/src/figma/screens/*` to "fix" a delta the join reported
until the pair is confirmed by name+height, or a mis-pairing will move the wrong
board's copy.

## Redrawing a panel the re-issue replaced

Seven notification boards (`1:3245`, `1:3461`, `1:4114`, `1:4192`, `1:4285`,
`1:4683`, `1:4803`) carry a lower sheet (`1:3398`, `1:3614`, `1:4131`, `1:4209`,
`1:4302`, `1:4734`, `1:4854`) that the re-issue replaced outright, ids and all,
so no old node can be patched into the new one. `.figdiff/gen_panel.py` emits
the live subtree as gallery markup (absolute-positioned children, the file's own
type and images) and `.figdiff/patch_notif_panels.py` splices it in; the two new
pictures are the product thumbnail (`--a13`) and the delivery pin map (`--a14`),
downloaded through MCP and downscaled, not copied from Drive.

Two traps cost real time:

- **Splice the sheet atomically.** Replacing the node's own tag and rewriting its
  `style=` leaves the old children in the markup, so the file draws the stale
  rows *and* the new ones — measured as a paint leak in the panel body while every
  box on both sides was identical. Match the whole element (tag through its
  matching `</div>`) and replace it. The box walker cannot see this: it compares
  `[data-node]` geometry, and the leak is an *extra* rectangle at the live node's
  coordinates, so verify a redraw by pixel-diffing the panel, not by geometry.
- **A data-URI custom property needs its semicolon.** `--a14: url("…")` with no
  `;` runs into the next declaration, which then parses under the *previous*
  property: `--a14` resolved empty, the map drew nothing, and the gallery's
  `--a13` grew to hold both pictures. The pixel checks still passed, because they
  compare the app to the gallery and both were equally broken. Read the computed
  value of a new custom property (`getComputedStyle(documentElement)
  .getPropertyValue("--a14")`) after adding one; length 0 is the signature.

The re-issued file also stacks two IMAGE fills on a thumbnail and marks the
**first** `visible: false`. Pick the last image fill in paint order, not the
first visible one, or the crop hides behind the one that never draws.

## The re-issue's camera feed is a real picture

The biggest single drift between the gallery and the live `u2` page is not
geometry: it is that **51 of the 59 boards carry a 340x400 IMAGE fill**
(`392d0ec272…`, the live camera viewfinder) and the gallery paints none of them.
Every scan / collect / notifs board draws a `.asset` placeholder — the literal
text `camera feed` on a diagonal hatch — at exactly that box instead. The pixel
harness reads the placeholder as a flat light block and the live feed as a dark
one, so the scan boards sit at 8–11% off with no structural signature, and the
notifs boards barely move because the feed is dimmed under `filter: blur` and a
white scrim.

`web/src/routes/driver/DriverScan.tsx` (and `staff/Collect.tsx`,
`staff/Lookup.tsx`, `admin/StaffHistory.tsx`) already paint the route's own
`<Scanner>` over that box at runtime, so a user sees a real feed on those routes;
only the *gallery* still has the placeholder. Do not "fix" this by stamping the
stock photo into the drawing — a camera feed is a live thing the route supplies,
and a screenshot of one frame is the same mistake as a hardcoded order on an
unbound row. Keeping the placeholder is the honest drawn state; the diff row is
expected.

## The MANAGER word, and which tree to change

The re-issued file draws `MANAGER` in the staff sample grids (1:2747, 1:2686,
1:2624, 1:2803) and in `STAFF LAYOUT 1`'s ROLE block. Those are drawn sample
text — the same category as the SMITH/SARA/MICAH names — so the gallery keeps
them; editing them would break `check-figma-parity`. What the re-issue *did*
drop is the manager as a **role in the app**: the database has no manager, the
role enum is `staff | admin | driver`, and `People.tsx`'s `ROLE_LABEL` already
maps the DB `staff` role to the drawn word CASHIER. There is no manager route
and no manager role to remove; the remaining `MANAGER` literal in the app is
`People.tsx:101`, the *key* the bound role text substitutes over (the drawn word
is the slot key). Leave it.

## A live frame with no gallery counterpart is usually a nested child

`frame_map.json` pairs gallery nodes to live frames, but a handful of live
frames never became a board of their own — they are the *inner* groups the route
renders underneath (`BLACK CONCEPT`, `PERSONAL DTS`, the four `DIVIDER`
rotated-logo frames, two `STAFF HISTORY - DRIVER` sheets). A board whose visible
difference is "the live side has a frame the gallery does not" is usually one of
these, not drift. The pixel diff for `1:2244` and `1:2107` also reads high purely
because the MCP export of a framed board comes back **480px wide** (a 440px
board plus a 20px drop-shadow margin each side); `live_diff.mjs` detects and
crops that symmetric border before comparing, or the margin alone reads as drift.

## What the walk-in family still needs (verified deltas)

The four walk-in boards were re-issued and their panels were **re-drawn**, not
re-worded, so they cannot be patched by swapping a string — the panel internals
moved too.

| gallery | live | gallery panel | live panel |
|---|---|---|---|
| `1:4466` WALK-IN INPUT | `459:18629` | readout `1:4476` 334x406 at (53,140) | readout at (54,136); keypad `459:18642` at (114,317) |
| `1:4527` PAY CONFIRM | `459:18690` | sheet `1:4536` 334x406 at (53,142) | sheet at (54,137); keypad at (114,314) |
| `1:4592` WALK-IN PAYMENT | `459:18755` | sheet `1:4601` 334x406 at (53,141) | sheet at (54,137); keypad at (114,314) |
| `1:4047` WALK-IN PAYMENT 2 | `459:18259` | sheet `1:4056` 334x406 at (53,125) | sheet at (54,131) |

Drawn words that changed: the readout label is `AMOUNT IN NAIRA` (not
`AMOUNT IN KG`), the primary pill reads `SCAN` on all four (not `ENTER` /
`CONFIRM`), and `459:18690`'s ledger re-reads as `Continue to Pay` / `OPAY` /
`via:` / `10kg` / `₦10,000`.

Redrawing these is not a gallery-only edit: `WalkIn.tsx` binds the readout by the
drawn text `1KG` and hit-tests `data-node="1:4514"` (the pill) and `1:4516` (the
hand), and `Collect.tsx` binds `1:4530`, `1:4641` and the sheet's values. A
redraw renumbers every node to the live ids, so the gallery splice, `gen_react`,
and those route bindings have to move in the same change — patch the text alone
and the route goes dead.

## PERSONAL DTS 2 (`1:2244`)

The gallery already carries the full field set — `FIRST NAME`, `LAST NAME`,
`YOUR BEAUTIFUL NAME` x2, `Phone Number`, `+234 80 3936 8868`, `[ Caleb ]`,
`Delivery Address` — and the live frame agrees, so this board is *not* missing
rows. Two traps produced a false "missing" reading and are worth recording:

- The rows live inside the `381:11914` details panel, whose own `top` is 90, so
  their gallery `top` (e.g. `Delivery Address` at 21) is **panel-relative** and
  must be added to the ancestor's offset before comparing to a live absolute y.
  A leaf-by-leaf diff that reads `top` straight off the tag sees every panel
  child ~90–1039px out of place.
- `PERSONAL / DETAILS` is one `data-node="1:2250"` heading with an inner
  `<span style="display:block">DETAILS</span>`; the live file draws it as two
  lines too. A leaf walker that ignores element children sees only `U` of the
  watermark and reads the heading as `PERSONAL`, hence the spurious
  `PERSONAL DETAILS` vs `DETAILS` report. It is not a difference.

## The admin gauge axis: a real refinement the four gates could not see

The re-issued file redrew the admin gauge scale, and the change is invisible to
every gate because it is neither structural nor a font/colour *token* the
harness compares:

- The tick labels (`100`…`00`) have **no `opacity`** in the live file — they are
  solid black. The gallery painted them at `opacity:0.45`, so the whole scale
  read as light grey against the file's black. Set it to `1` on all seven
  gauge boards (`1:2299`, `1:2454`, `1:3075`, `1:2847`, `1:3887`, `1:3245`,
  `1:3461`).
- The `%` suffix is **not** on every board. Only the three older admin boards
  (`1:3887`, `1:3245`, `1:3461`) label the `60` tick `60%`; the four redrawn
  ones (`1:2299`, `1:2454`, `1:3075`, `1:2847`) draw bare numbers. The gallery
  had applied `60%` to all seven — including `40%` on `1:2454` — so those four
  boards drew a percent the file does not.

Both are the "value that is right but formatted differently" class: `dom-parity`
compares colour/tracking tokens but the axis text is a `[data-node]`-less leaf
inside a group, and `figma-pixels` renders the *markup* (which matched) rather
than the live file. Read tick opacity and the `%` suffix straight from live
`style`/`characters`, not from the drawn snapshot.


## The shop strip: a drawn element the gallery never carried

`docs/u2gas-all-screens.html` is a hand-maintained snapshot, so when the file
re-issues a board it can gain *structure*, not just a recoloured leaf. The four
product boards never carried the strip the live file now draws on `SHOP - Single
ITEM` and `SHOP - ITEM UNAVAILABLE`: a group at (48,845) 447x183 holding four
tall product photographs (a jar, a pack, a bottle, a cylinder) and the faded
`SHOP FOR OTHER` / `ACCESSORIES` label. Nothing in the app can render what the
gallery does not hold, so both boards showed a blank band where the file draws
the row.

`SHOP FOR ACCESSORIES` (the `ADD to Cart` boards' own button) and `SHOP FOR
OTHER ACCESSORIES` (this strip) are different strings, so the copy diff flags
the strip and not the button — do not "fix" the button.

The strip is spliced by `.figdiff/patch_shop_strip.py`: four new `--a17`..`--a20`
pictures appended to the gallery's `:root` asset block, then the group inserted
before each board's watermark, then `python3 build/gen_react.py`. Use the
`figma_download_figma_images` *cropped* exports (`.figdiff/stripc/`), not the raw
node renders — the live fills are `scaleMode: STRETCH` with an `imageTransform`,
so the uncropped bitmap is padded and the picture sits small inside its box.
`check-figma-parity.sh` still passes because it compares gallery to generated
markup (both changed together); only a live render (`shot_frame.mjs` against
`.figdiff/live/live-250-5655.png`) can see the strip land.

Two boards only. `SHOP - SEARCH` (`1:1438`) draws `SHOP FOR` / `ACCESSORIES` as
its heading with an LED button, not this strip; `Cart` and the checkout sheets
draw their own `SHOP OTHER ACCESSORIES` dashed rows. Do not spread the strip
around.
