# u2gas

React + Vite frontend (`web/`) over a Cloudflare Worker API (`worker/`).

## Commands (run from `web/` unless noted)

- `npm run dev` — Vite dev server; this is what the preview tunnel serves.
  Vite binds loopback unless told otherwise, so a bare `npm run dev` leaves the
  `work-*` tunnel answering **502 Bad Gateway** while `curl 127.0.0.1:12001`
  is a clean 200. Start it as the root `npm run dev` does — `vite --host
  0.0.0.0 --port 12001 --strictPort` — or the preview URL is unreachable even
  though the app is running.
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
  code draws, because the registry used to claim 15 artboards (`1:1344`,
  `1:1517`, …) that no route rendered — the coverage read as complete
  for screens that were absent. Removing a claim needs the same note the empty
  entries carry: say which artboard and why it is not used.

## Rows the drawing does not id

`FigmaScreen` binds live data by replacing the text of named `[data-node]`
leaves. An artboard whose rows carry no ids cannot carry real records — the
drawn sample stays on screen, and `dom-token-diff.mjs` sees nothing to compare,
so the route reads CLEAN while showing Figma's sample order. `/history` hit
this; it is now handled by rendering the artboard for its chrome and painting
live rows over it.

`/history` (1:2107 TRANS HISTORY) renders the artboard for its chrome — the
drawn `HISTORY` heading, the month strip, the panel, the top fade, the
watermark, the copyright — and paints live receipts at the two card boxes the
file reserves. `HistoryReceipt.tsx` is the row template, carrying the drawing's
measurements verbatim: 241px paper, `drop-shadow(0 4px 24px rgba(0,0,0,.18))`,
`RECEIPT` at 14px `-0.56px` 17px down, the date at 32px `-1.28px` 37px down,
rows at 12px `-0.48px` 9px apart from 90px, the status strip 241x70 `#1317e4`
with a 1px `#797bf4` edge. Its styles live in `figma-route.css`, not inline, and
must be changed with the drawing.

The receipts are a **row, not a list**. The file draws `1:2134` at x=60 and
`1:2170` at x=341 — 241 wide, 40px apart — so the second is cut by the 440px
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
drawn `top:232` and `top:151` land at 312 and 231 **on the board** — reading
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
ACCESSORIES` strip — their group names say so — and are a designed element that
must stay visible. Do not hide them or paint live lines over them.

So `BasketLine.tsx` is the row template (the file's own card, discs, type) and
the live lines sit in the band the file leaves empty between the Checkout button
and that strip: `.basket-lines` at `top:872`, 244px tall, scrolling, with the
running total below it. The band is not drawn, so nothing is covered; the rows
would overflow the board if they went under the strip.

`1:1589`'s `ITEM UNAVAILABLE` stamp is a **state, not copy**. It is drawn on the
board but hidden at rest — the route sets `is-short` only when the server
refuses a line — so it is listed in `STATE_TOGGLED`, not `TEMPLATE_ROWS_HIDDEN`,
because it is genuinely toggled rather than replaced by a template.

The sheet `1:1517` draws over the basket is a different screen: `1:1703`
WALK-IN, `1:1827` DELIVERY with the address confirmed, `1:1952` DELIVERY with
none yet. Checkout is therefore `/checkout`, not a modal on `/cart`, and each
state renders the frame that already draws it. Do not reintroduce a modal.

Two traps in the checkout sheet. The toggle chips and the tiles are **hug/flex**,
so their widths come from the pixel font's advances — recomputing them by hand
puts the hotspot off the drawn chip. `CheckoutSheet` measures each drawn node's
box instead (`useDrawnBoxes`), which is the same fix as the back hotspots. And
`1:1952` draws its toggle, its `PAYMENT OPTIONS` heading and its handle with **no
`data-node` ids**, so those are placed from the panel box with the offsets the
other two boards do share (`DERIVED`).

`?add=<id>` (in `lib/useAddFromQuery.ts`) seeds one catalogue item so a basket
state can be deep-linked. It is shared by `/cart` and `/checkout` because a cold
`/checkout?add=…` otherwise arrives empty and bounces to `/cart`; the hook
returns whether a seed is in flight so the redirect waits for it, and a ref
guard stops StrictMode's double effect adding the item twice.

Three things make the demo differ from the file without being drift, and how
the harness handles them: a route may swap live data into a text leaf (the box
follows the text, so geometry on a changed leaf is not compared, only whether
the value escapes the 440px board); a route may toggle a state the file draws in
one composite (`1:4643` in the walk-in frame is hidden until PAY;
`STATE_TOGGLED`); and a route may hide a drawn row that is a *template* rather
than content (`TEMPLATE_ROWS_HIDDEN`, the history samples — those still fail
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

## Measuring drift against live Figma

When comparing the gallery to the live file, two mistakes both produce a large
false reading, and each one cost a full investigation before it was caught.

**Do not screenshot an artboard by reparenting it to the viewport.** A harness
that moved `.frame` out of the rack to capture it changed what painted — the
artboard's own `background: #fff` and the rack context stopped applying, so the
capture came back mostly dark and the diff read 20-30% on screens that were
fine. Clip to the element's own box (`element.screenshot()` after
`scrollIntoView`) and verify the capture independently: probe a known point with
`document.elementFromPoint`, and check a colour you can predict. If the PNG and
the DOM disagree, the capture is wrong, not the page.

**A node's fill must be cross-checked against Figma's `visible` flag, not
trusted by id.** Three profile artboards (`1:2090`, `1:4665`, `1:4968`) carry
two stacked gradient rectangles — a hidden white fade and a visible black
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
`partialGasAvailable` branch on this route are unreachable — the server's
authoritative check still runs inside the reservation transaction, but the UI
never reaches it with a known-short amount.

Two consequences worth keeping:

- `dom-token-diff.mjs` covers it as `/home?kg=9999` (`1:175`). The board's live
  leaves are `1:220` (the amount) and `1:181` (the ticker), which carries HOME's
  `ONLY nKG LEFT · Today's Rate…` warning rather than the bare rate.
- Its drawn message is `INSUFFICIENT- Please redude` — the file's own typo, in
  the file's own wording. Do not "fix" it: it is drawn text, and the parity
  harness compares it character for character.

The initial-JS budget (160KB) is not met. `index.html` preloaded `app-staff`
(≈800KB raw, ≈300KB gzip) because of how Rollup placed *shared* code, not
because anything imported the staff routes.

The entry graph is `main.tsx → App.tsx → routes/customer/Home.tsx →
figma/FigmaScreen.tsx → figma/artboards.ts` — the home route is statically
imported ("the default chunk, so no lazy wrapper on the home route"), so the
entry genuinely needs `FigmaScreen` and the whole 61-board registry. The
`manualChunks` function only named `/routes/{admin,staff,driver}/`, so every
other module — `components/primitives`, `components/terminal`, `lib/api`,
`lib/media`, `lib/auth`, `mocks/gate`, `figma/*` — was left unassigned and
Rollup swept it into the first role chunk it emitted, `app-staff`. The entry
then imported that chunk, and `modulepreload` followed. It was never true that
a customer "downloaded the staff bundle" by importing staff code: `probe` over
the real module graph finds **no static path from `main.tsx` to `StaffApp.tsx`**.
The staff *chunk* was on the entry path only because it held shared modules.

Naming a chunk for the shared modules fixes it: `/components/`, `/lib/`,
`/mocks/`, `/figma/` and `/styles/` now map to `app-shared`. After that build,
`index.html` preloads `vendor`, `vendor-react`, `vendor-supabase` and
`app-shared`; `app-staff`, `app-driver` and `app-admin` are lazy and each
depends only on `app-shared`. `app-shared` is still ≈316KB gzip (mostly the
artboard registry), so the 160KB budget needs a further step — stop the entry
importing the full registry (lazy-load the artboards or `FigmaScreen` per
route) — but the role-separation requirement is met. Measure the preload set in
`dist/index.html`, not the build log: the log shows a small `index` chunk and
hides what is preloaded.

## The roster is three drawings, and two of them were unwired

`/admin/people` renders every staff artboard the file draws rather than
picking one. 1:2747 STAFF LAYOUT 2 is the six-up grid; 1:2686 ADD STAFF is the
same grid with its third tile left as the drawn `[ NAME ] / [ POSITION ]` slot
and a plus at (351,145); 1:2624 STAFF LAYOUT 1 is the row of four avatars with
the selected person's ROLE / ACCOUNT NUMBER / BANK and the drawn REMOVE STAFF;
1:2803 STAFF LAYOUT 2 DETAILS is one person's full profile. The two alternative
layouts are reached with `?state=add` and `?layout=1` — the registry used to
call them "alternative layouts, not states the screen moves between", which
left two boards rendering nowhere while `check:frontend` still read as
complete. A board the registry names must be a board some route draws.

Two things about the bindings:

- The API nests the role on `profile` (`profile:profile_id ( … role … )`), so
  `staff.role` is undefined and a row read that way prints a dash for every
  person. Read `profile.role`. The database's `staff` role is the design's
  CASHIER, so the drawn vocabulary needs the same mapping `StaffProfile` uses;
  `STAFF`/`MANAGER`/`DRIVER` are not the words on the board.
- A grid slot with no record keeps the file's own sample (SMITH, MICAH, …).
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
last active admin cannot be removed — a roster with nobody who can manage it is
unrecoverable through the app — and the error says to add another first, which
reads better than FORBIDDEN. Both functions are `security definer`, so the
migration revokes them from `anon`/`authenticated`: without that a signed-in
admin's own JWT could call them through PostgREST and bypass the Worker.

The demo store is in memory, so a reload resets it. A functional test that adds
a person, navigates, and expects them still there must stay on one page load —
and must click through the UI (the drawn plus, the drawn REMOVE STAFF) rather
than calling the API, or it proves nothing about the controls being wired.

importing the full registry (lazy-load the artboards or `FigmaScreen` per
route) — but the role-separation requirement is met. Measure the preload set in
`dist/index.html`, not the build log: the log shows a small `index` chunk and
hides what is preloaded.
