# U2GAS — Design System

> **Verified against the Figma file (v4xgWC0Q0wtSKmAff3EOzU) via the Figma MCP.**
> Several values below were originally sampled from compressed screenshots and
> were wrong. The corrected ones:
>
> | Token | Was | Actual |
> |---|---|---|
> | `--blue` | `#1317D1` | **`#1317E4`** |
> | `--led-red` | `#FF2A1A` | **`#FF0303`** |
> | `--led-bg` | `#140404` | **`#1E0E0E`** |
> | `--blue-soft` | `#BFC0F3` | **`#797BF4`** (button border) |
> | tracking | `+0.04em` | **`-0.04em`** (`-0.08em` on display) |
> | terminal caption | pixel face | **Barlow Condensed SemiBold 14px** |
> | LED readouts | jgs7 | **jgs5** — a different font, not yet in the repo |
>
> Frames are **440 wide**, not 340. Buttons are 344x64 with a 64px radius, not
> pill-shaped. The keypad is 211 wide with a 32px column gap and 10px row gap;
> keys are 49x39 and PAY is 66x39. (extracted from the 63 prototype frames)

This is the visual source of truth in written form. Every new or corrected screen must be
built from these tokens. Nothing here was invented — all values were sampled from the
supplied prototype screenshots.

---

## 1. The core idea of the design

The user app is a **skeuomorphic gas-pump terminal**. A physical blue dispenser body with a
red dot-matrix LED readout, hard plastic keypad, and a paper receipt that physically feeds
out of a slot. The staff app is the same machine in **industrial grey**. The admin app is a
**tank gauge** — a fill-level vessel next to a measuring ruler.

Everything else in the interface is quiet and white so the machine is the loud thing.

Do not soften this into a normal mobile app. The terminal is the brand.

---

## 2. Color tokens

| Token | Hex | Use |
|---|---|---|
| `--blue` | `#1317D1` | Primary. Terminal body, filled buttons, all headings, active tabs |
| `--blue-deep` | `#1114A9` | Terminal body shading, pressed button |
| `--blue-dark` | `#14165E` | Keypad recess, deep shadow inside terminal |
| `--blue-soft` | `#BFC0F3` | **Disabled** filled button, disabled tab label |
| `--blue-faint` | `#9C9EED` | Secondary/ghost label text, "SHOP FOR ACCESSORIES" link |
| `--paper` | `#F8F8F9` | App background |
| `--white` | `#FFFFFF` | Sheets, cards, receipt |
| `--field` | `#EFEFEF` | Input fill, secondary button fill |
| `--ink` | `#060607` | Splash background, keypad keys, LED housing |
| `--grey` | `#A8A8AA` | Hairlines, inactive tab, dashed borders |
| `--grey-mid` | `#5E5E5E` | Caption text |
| `--led-red` | `#FF2A1A` | LED glyphs |
| `--led-bg` | `#140404` | LED window background |
| `--danger` | `#E01B1B` | Remove staff, FAILED, ITEM UNAVAILABLE |
| `--live` | `#22C55E` | Online dot on avatars, notification badge |

Metal for the staff terminal: linear gradient `#D9D9DB → #B4B4B7 → #9A9A9D`, with a
1px `#FFFFFF66` top highlight and `#00000033` bottom shadow.

---

## 3. Typography

Three faces only.

**Display / UI — dot-matrix pixel face.**
Used for literally every label, heading, button and body string in the app.
Web equivalent: `"Departure Mono"`, fallback `"Silkscreen"`, fallback `ui-monospace`.
Always uppercase for headings and buttons. Letter-spacing `0.04em`.

- Screen title (`NOTIFS`, `STAFF`, `HISTORY`, `GAS HISTORY`) — 28px / 700 / `--blue`
- Section label (`PAYMENT OPTIONS`, `LOG IN OR SIGN UP`) — 11px / 400 / `--grey`, tracking `0.12em`
- Button label — 14px / 500
- Card title — 10px / 500
- Card subtitle — 8px / 400 / `--grey-mid`
- Big numeric (`10kg`, `6`) — 34px / 700

**LED — same pixel face, but rendered red on `--led-bg`** with `text-shadow: 0 0 6px #FF2A1A99`.
Used in the terminal window and the ticker strip. Never used outside a hardware surface.

**Signature — handwriting script.**
Only for the user's own name on profile screens: `[Caleb]`, `[Caleb]-Driver`, `[Caleb]-Cashier`.
Web equivalent: `"Caveat"` or similar. 26px / `--blue`. Always wrapped in square brackets.
This is the only non-pixel type in the product. Do not spread it to other screens.

---

## 4. Shape & elevation

- Bottom sheet: radius `32px` top corners, `0 -8px 40px rgba(0,0,0,.14)`
- Modal card: radius `28px` all corners
- Pill button: `border-radius: 999px`, height `44px`
- Input: `border-radius: 999px`, height `44px`, fill `--field`, no border
- Terminal body: radius `14px`
- LED window: radius `6px`
- List card: radius `18px`, **1px dashed `--grey`**, transparent fill
- Product/basket tile: no card at all — cut-out image on white
- Receipt: white, zig-zag torn bottom edge (CSS mask), radius `4px`

Two shadow levels only. Sheets/modals use the one above; everything else is flat.

---

## 5. Component catalogue

**LED ticker strip** — Black pill, red marquee text, suspended from two thin black wires
above the terminal. Scrolls the live gas rate: `Rate: 1kg at ₦1,400`. Present on every
user terminal screen. On success/failure it swaps its content to `!! SUCCESS !!` / `FAILED`.

**Terminal** — Blue body. Caption `AMOUNT IN NAIRA` in tiny white pixel type. LED window.
3×4 keypad, dark keys with `PAY` in the bottom-right. Receipt slot at the base with a
recessed metal lip; paper extends downward out of the slot when an order completes.

**Keypad key** — 46×34, radius 5px, fill `#1C1C1E`, top highlight `#FFFFFF1A`, label in
pixel type `#E8E8E8`.

**Segmented toggle** — Pill track `--field`, active segment filled `--blue` with white
label, inactive label `--ink`. Used for `WALK-IN / DELIVERY`.

**Tab row** — Text tabs, active one is a small filled `--blue` chip with white text,
inactive are plain `--grey`. Two levels stack: primary (`IN-PERSON / ONLINE / BOOKINGS`)
then secondary (`ALL / CASH / POS / TRANSFER`).

**Payment chip** — Dashed 1px border, radius 12px, white fill, **rotated between -4° and
+4°**, hand-cut feel. Sits in a loose cluster, not a grid.

**List card** — Dashed border, product cut-out thumbnail left, two lines of pixel text,
circular chevron button right. Expands in place to reveal a map + action button.

**Scanner** — Large rounded square with a dithered/halftone fill and an animated dashed
border. Idle = blurred grey. Success = thumbs-up halftone on green radial glow. Failure =
thumbs-down halftone on red radial glow. Blue `SCAN` pill beneath, plus a small circular
secondary button to its right.

**Tank gauge (admin)** — Vertical vessel with a cap, translucent fill rising from the
bottom, big pixel numeral and `TONS` inside the fill, `AVAILABLE QUANTITY` label at the
top. A ruler runs up the right side, `00` to `100`, ticks every 10. Percentage callout
sits beside the fill line.

**Wire basket (cart)** — Line-drawn basket illustration; items sit inside it as cut-outs
with small circular +/- controls floating at their corners. Empty state shows the basket
alone with a red dashed-outline stamp: `GO FOR A LIL MORE SHOPPING`.

**Stamp** — Red 1px border, red pixel text, tiny padding, slight rotation. Used for
`ITEM UNAVAILABLE` over a product image.

**Avatar** — Circle, `--live` dot top-right when online. Name in pixel caps below,
role beneath it in 7px `--grey`.

**Footer mark** — `U2` in large faint blue pixel type, centered, with
`COPYRIGHT 2026 U2 OIL AND GAS LTD.` in 6px beneath. Appears on splash, login and profile.

---

## 6. Motion

The design has exactly two motion moments. Do not add more.

1. **Receipt feed** — paper translates down out of the slot, ~600ms, `cubic-bezier(.2,.8,.2,1)`.
2. **Ticker scroll** — continuous horizontal marquee, ~12s linear, infinite.

Sheet entry is a plain slide-up, 220ms. Everything else is instant.
Respect `prefers-reduced-motion`: freeze the ticker, snap the receipt.

---

## 7. Voice

Short, uppercase, mechanical. `CONFIRM PICK-UP`, `ADD to Cart`, `Continue to Pay`,
`REMOVE STAFF`. Note the design deliberately mixes case on a few buttons — keep that,
it's part of the character. Errors are stamped, not apologised for.

---

## Where the build deliberately differs from the Figma file

The replicas in `docs/u2gas-batch*.html` reproduce the file exactly, including
its defects, because they are the record of what was drawn. The application
does not. Each deviation below is intentional.

| # | In the file | In the build | Why |
|---|---|---|---|
| 1 | Two stacked scrim rectangles on the product screens (`1:1480` + `1:1481`) | One, as `.shop-scrim` | Two copies double the opacity; the title stops reading as a fade and starts looking like a white block. The search screen draws only one, so one is the intent. |
| 2 | `#F30B0B` for ITEM UNAVAILABLE, `#FF0303` for the LED | `--danger-red: #FF0303` | Two reds a hair apart read as an inconsistency rather than a distinction. |
| 3 | Hero images carry two image fills, the first invisible (`1:1477`, `1:1478`, `1:1479`) | One image | Leftover swaps. The hidden fill still ships in an export. |
| 4 | "UPDATE" set in white on a white sheet, on all three payment sheets | Omitted | Invisible as drawn. Either a leftover label or a colour never updated. |
| 5 | "C0PYRIGHT" and "0R" — zeros for the letter O | "COPYRIGHT", "OR" | Reads as a typo, not a stylistic choice; a screen reader says "zero". |
| 6 | ORDER SUMMARY reads 10kg / ₦10,000 beside a kiosk showing 1KG at ₦1,400/kg | Computed from the order | The two do not reconcile under any rate. |
| 7 | Receipt wording outlined to vectors (`1:858`, `1:866`, `1:884`, `1:894`) | Live jgs7 text | Outlines cannot be edited, translated or read aloud. The outlines are jgs7, so rendering as text is visually identical. |
| 8 | FAILED screen's thumb layer named "TWO TONE THUMBS UP 1" (`1:577`) | Named for what it shows | Right image, misleading name. |
| 9 | Gas cylinder photo carries a Dreamstime watermark | Must be replaced | Not licensed. Tracked in `web/public/img/FIGMA-ASSETS.txt`. |
| 10 | Battery photo is a branded Energizer product shot | Should be replaced | Trademarked imagery on a commercial storefront. |

Items 9 and 10 are the only two that block launch. The rest are cosmetic or
maintenance concerns and are already handled in the build.


---

## How the Figma file is organised

Four 300px DIVIDER frames split the canvas into apps. They are content, not
scaffolding — they are the only statement of which screen belongs to which
application, and the x order is not the order you would guess:

| x | Section | Screens |
|---|---|---|
| 0 | **DRIVER APP** | 6 |
| 5,829 | **CASHIER APP** | 11 |
| 12,943 | **ADMIN APP** | 13 |
| 25,037 | **USER APP** | 26 |

Two traps in there:

- `1:2274` is named **HOME** and sits in the DRIVER section, not the user app.
  There is also a `1:4437` **HOME** in CASHIER and `1:251` **HOME** in USER.
  Three unrelated screens share one name; only position distinguishes them.
- All four divider text layers are named **"DRIVER DRIVER DRIVER DRIVER"**
  whatever they actually read — so layer names cannot be trusted to identify
  a section either.

Counts add to 56 screens plus 4 dividers.


---

## Component relationships across the four apps

The four apps are not four designs. Several elements recur with a deliberate
change of material or scale, and building them as one component each is the
difference between this being maintainable and being four codebases.

| Element | Customer | Cashier | Driver | Admin |
|---|---|---|---|---|
| Terminal | 360x476, blue `#1317E4` | 334x406, metal `#EFEFEF` | — | 280x476 reservoir, black |
| Scanner | — | 340x400 viewfinder, radius 64 | same | — |
| Result thumb | 266x266 over a frosted page | 266x266 over the viewfinder | same | — |
| Bottom sheet | 373 / 489 / 317 | 427 / 264 | — | 306 |
| Name (handwriting) | 160px box | 335px box | 315px box | — |
| List row | — | 387x88, 6px status bar | same | same |

Five sheet heights and three name-box widths for what are, in each case, one
component. The sheets differ because their contents differ, which is fine; the
name boxes differ only because they were sized by hand to fit three different
strings, which is not.

The admin app is the only place using a large black surface, and it is the
tank. It is also the only place with a destructive control — `REMOVE STAFF`
in `#D70000`, a third red after the LED `#FF0303` and the unavailable
`#F30B0B`.

---

## Corrections from the review recording

A screen recording of the replica surfaced differences that reading the design
context alone had missed. Every value below was then confirmed against the
Figma node rather than adjusted by eye.

| What | Was | Figma | Why it matters |
|---|---|---|---|
| Frosted overlay on the payment result screens | `blur(8px)` | `blur(4px)` | Figma's BACKGROUND_BLUR radius is roughly twice the Gaussian sigma CSS takes. At 8 the terminal behind the thumb stops being readable, which the design clearly means it to be. |
| Basket products | flat | `image 10` 14.2°, `image 9` 17.5°, `image 11` −90°, `image 13` −180° | They are tumbled in the basket. Laid out flat they read as a product list, which is the thing drawing a basket was avoiding. |
| Every LED assembly on the cart screens | upright, full opacity | rotated 90°, opacity 0.5 | Including the four 20px remove discs and the 52px header tile. Upright and opaque it reads as a readout; rotated and dimmed it reads as a dark tile in the corner. |
| CART - EMPTY message | horizontal | rotated 9.2° | Only this one. The small in-basket badge on CART - ITEM UNAVAILABLE is genuinely flat. |
| Watermark on cart frames | 15% | 10% | HOME uses 15%; the cart frames use 10%. Not one value across the file. |

**Rotation sign.** Figma reports rotation counter-clockwise and CSS `rotate()`
is clockwise, so every value above is negated in the markup. Copying Figma's
number straight into CSS mirrors the tilt, which looks deliberate and is
wrong.

## Surface treatment, scanned from the file

Reading positions alone missed how the kiosk is actually finished. Scanning
every fill, effect and stroke on the terminal found four things being rendered
as flat colour that are not:

| Element | Figma | Was rendered as |
|---|---|---|
| `mitre border` 1:258 | **4px black stroke**, inset glow `#9C9EEC` r10, **NOISE @25%** | no stroke, flat blue |
| Every key and LED housing | inner highlight `0 2px 2px #fff`, **two opposing side shadows** `±1px 0 2px rgba(0,0,0,.25)`, NOISE @25% | one inset highlight only |
| `AMOUNT IN NAIRA` 1:262 | inner shadow r4 off 0,4 @25% — the text is engraved | flat |
| `receipt slottt` 1:261 | inner highlight `0 0 3px #fff`, no offset | offset by -0.1px |

The 4px stroke is the single biggest one: it is most of what gives the kiosk
its moulded edge, and without it the terminal reads as a flat blue rectangle.

The NOISE fill is reproduced as a 64px tiling PNG — monochrome grain, alpha
only, so it darkens without shifting hue, tiled at native size so the grain
stays the same physical size on a 49px key and on the 360px body. Flat colour
there reads as plastic; the grain reads as moulded and matte.

Positions corrected by the same scan: keypad `59,180` (was 58,179), caption
`y=40` (was 39), receipt slot `bottom 16` (was 15).

### The cancel key

`1:287` is a real key — 49x39, its own body, border and inset highlight, with
the X drawn as pixel blocks so it sits on jgs7's grid. It sits to the left of
`0` and clears the last digit.

It was in the markup all along but rendering at zero size: the combiner that
merges the batches into one file rewrote `<img>` to `<span>` and dropped the
`class` attribute, so the key lost its box. Classes and explicit dimensions
now carry across.

## Whole-file scan

2,540 nodes across all 55 screens, checked for stroke weight, fills, effects
and rotation rather than position alone.

**The scanner viewfinder is a 16px black stroke.** `Frame 60` / `Frame 65`,
340x400 radius 64, stroke drawn INSIDE. Rendered as 2px blue it read as a
thin outline; at 16px black it reads as the moulded bezel of a handheld
scanner, which is what it is. Affects every scan screen across driver,
cashier and admin.

Stroke weights across the file: `2px` x477, `1px` x314, `4px` x49 (terminals
and LED legs), `16px` x15 (viewfinders), plus a few hairlines.

Effects, by frequency: inner shadow `r2 off 0,2` x597 — the key and LED
highlight, on every key in the file. Drop shadows `r2 off ±1,0` x96 each —
the opposing pair that lifts the keys. `r10 off 0,4` x109 — the standard card
and button shadow.

**755 of 2,540 nodes carry a rotation.** Most are the admin gauge ticks,
which reuse the name "LED left leg" 489 times — the ruler beside the tank is
built from rotated copies of the LED wire, not from a dedicated tick. The
rest are the tumbled basket contents, the payment chips and the LED
assemblies.

### The cancel key

Drawn inline as markup rather than pulled from the asset store. As an `<img>`
it depended on the combiner preserving its class and on no later rule
resetting the background, and it lost that race twice — first to a dropped
class, then to `background:none` in its own inline style. A key with the
glyph inside it cannot be switched off by a stylesheet it does not know
about.

## The scanner ring

`Frame 60` / `Frame 65` — 340x400, radius 64, stroke **16px black with
`dashPattern [4,4]`**, aligned INSIDE. It reads as perforations around the
viewfinder, not as a solid bezel.

CSS cannot express this. `border: 16px dashed` scales its dashes to the border
width, giving roughly 16px dashes instead of 4px, so the ring is drawn as an
SVG stroke: inset by half the weight because INSIDE alignment puts the
centreline there, with the corner radius reduced by the same 8px.

```
<rect x="8" y="8" width="324" height="384" rx="56"
      fill="none" stroke="#000" stroke-width="16" stroke-dasharray="4 4"/>
```

Thirteen viewfinders across driver, cashier and admin.

## Alignment audit

Every absolutely-positioned element on all 61 frames was checked for
off-centre placement and for overflow past the 440 frame. 93 were flagged;
all 93 are faithful.

- **Off-centre by ~1px (53).** `Frame 96` sits at x=99 with a 100px right
  margin, the KEEP button at 168 against 169. Those asymmetries are in the
  Figma file. Centring them would move the replica away from the source.
- **Overflow (38) and negative left (2).** The shop collage bleeds past the
  right edge and the product carousel places its neighbours at -58 and +380.
  Both are deliberate: they are what says the row continues.

Coordinates were then compared directly against Figma for every node with no
GROUP ancestor — 17 of them, spanning terminals, sheets, buttons, receipts and
the notification counter. **All 17 match to the pixel**, including the
fractional `90.48` of the Union receipt and the `CONTINUE` button whose
position derives from the 956px frame height.

Nodes inside groups could not be diffed the same way: Figma's GROUP children
carry frame-relative coordinates, so summing ancestor offsets double-counts.
Those were verified individually against the design context instead.

## Round of UI corrections

| # | Screen | Was | Now |
|---|---|---|---|
| 1 | HOME and every terminal | `1KG` sat low — a 64px line-height inside a 65px LED body | body centres it, line-height collapsed |
| 2 | HOME shop | label's 64px line box swallowed the 20px gap to the grid | placed at its real x=92/w=296 with line-height 18 |
| 3 | ORDER SUMMARY, cashier sheet | a 16px "via:" crowding the payment card | dropped; the card already reads as the method |
| 4 | RECEIPT screens | bell was two CSS borders, read as a rounded rectangle | drawn as a path — body, crown, clapper |
| 5 | LOG IN 1 | a capital G and an Apple character | real provider marks, Google on white, Apple on black |
| 6 | Product | no feedback on ADD to Cart | button dips, label swaps to IN YOUR BASKET, basket count bumps; all suppressed under `prefers-reduced-motion` |
| 7 | ITEM UNAVAILABLE | plain white strip | diagonal hatch, product behind dimmed to grayscale |
| 8 | BLACK CONCEPT | a white layout on black | a real dark theme — `#0B0B0D` ground, `#9C9EEC` for the blue, scrims and watermark inverted |
| 9 | Cashier scan screens | action row hand-placed, off centre | 262-wide row centred at 89, button and disc as a flex pair |
| 10 | Customer payment sheet | chips at four hand-placed tops | one baseline, rotations kept — the cashier sheet reads clean because its chips share a line |
| 11 | NOTIFS and every list sheet | 88-tall cards with a 6px coloured status bar | 387x109 at radius 40, hairline border, no fill, 125 apart, chevron disc; **the status bar was invented — there is none in the file** |

Item 11 also added the filter strip (`IN-PERSON` / `ONLINE` / `BOOKINGS`, chips
sized to their words with 34px gaps) and corrected the sheet titles from 48px
to 64px.

## Letter-spacing is a percentage

Figma reports letter-spacing as `{unit: "PERCENT", value: -4}` on almost every
text node — that is **−0.04em**, not −4px. Written as `-4px` it tightened 16px
text by a quarter. That is why the ₦10,000 chip under `10kg` on ORDER SUMMARY
was unreadable while the cashier's copy of the same chip was fine: one had been
converted, one had not. Eight occurrences corrected, each to the pixel value
for its own font size (−2.56px at 64, −0.96px at 24, −0.64px at 16).

## Centring pass

Every radius-64 control on every screen was checked against the frame centre
at 220, with container offsets applied.

- **Scan buttons** — `1:2279` sits at x=133.5 inside a GROUP, which in Figma is
  already frame-relative: (440−173)/2, dead centre. It had been drawn at 184.
  All eight scan buttons now centre, including two inside a page container at
  x=27, where the same centre is 106.5.
- **LOG IN 2** — all four rows are 344 wide at x=48. CONTINUE had been drawn
  `width:auto` with 126px of side padding, which only looked centred.
- **Checkout** — 200 wide, so 120; Figma has it at 118.
- **List viewfinders** — 3px right; now 23 inside their container, 50 on the
  frame.
- **Admin UPDATE** — a lone primary button aligned to the tank's left edge.
  Centred, since a single button off-centre reads as a mistake. The DASHBOARD
  UPDATE/HISTORY pair was left as it is: the pair spans 35–404 and is centred
  as a pair.

## INSUFFICIENT GAS INPUT

`1:221` is set at **10px** in Figma — seven pixels tall in jgs7 — and reads
"INSUFFICIENT- Please redude". Unreadable at arm's length, with a typo. It is
now 13px and reads **ONLY 6KG LEFT**, which is the message the application
actually returns for this state (`INSUFFICIENT_GAS`), so the screen shows what
the customer will see.

The LED body also needed `flex-direction: column`: the shared rule that centres
a single readout lays its children in a row, and with two lines it put "1KG"
and the message side by side, on top of each other.

The ₦10,000 chip was also placed at `top:4px` with a 16px line inside a 17px
chip, so it ran past the bottom edge. Both chips now centre their label.

## Measured verification (Chromium vs Figma)

Every screen is rendered in headless Chromium and each element's box is
compared with the same node's `absoluteBoundingBox` in Figma, on its own
screen only. 973 elements across all 61 screens.

| | Before | Now |
|---|---|---|
| Position within 1px | 53% | 89% |
| Off by more than 50px | 123 | 6 |

Every element still more than 2px out is accounted for: the box differs but
its centre matches (43 — mostly text in a substitute font), a change that was
asked for (21), or the missing Barlow font / receipt text Figma has as
outlines (12). None is unexplained.

The combined file renders identically to the batch files (1,060 elements, 0
differing by more than 0.5px), so the numbers describe what is actually opened.

### Content that had been invented, now replaced with the file's

- **Staff screens.** ADD STAFF is a grid of circular avatars with an empty
  "[ NAME ] / [ POSITION ]" slot, not a form. STAFF LAYOUT 1 is a scrolling
  row of four with the selected person's role, account number and bank.
  STAFF LAYOUT 2 DETAILS is a profile (200px avatar, SMITH, MANAGER, account,
  bank, REMOVE STAFF). None contained rows like "SHIFTS THIS WEEK".
- **Titles.** ADD STAFF and STAFF DETAILS are titled STAFF; both STAFF
  HISTORY screens are titled SMITH'S.
- **Staff preview.** Four 100px circles and green on-shift dots (hidden on the
  second), under a 40px STAFF label — not five bordered 88px circles under a
  dashed chip.
- **GAS LVL CHECK.** Its own readout: "AVAILABLE / QUANTITY:", a 300px "6",
  TONS, and "AVAILABLE INVENTORY IS PREDICTED TO LAST 34 MORE DAYS*". The
  dashed blue border over the tank was invented; Frame 59 has no fill or
  stroke. The gauge marks the level as "60%" at 20px.
- **Corner LEDs** are empty tiles. The X that would sit in them is hidden.
- **Receipt stub.** Hidden on RECEIPT DISPLAY and ALT (its parent Frame 21 is
  hidden); only RECEIPT PRINTING shows it.

### Readout typography

"AVAILABLE QUANTITY", "6.54", TONS and the gauge numbers are Barlow
Condensed SemiBold, not jgs7. "6.54" is three runs: the 6 at 96px, ".5" at
24px and the final digit at 24px and 20% — the imprecise digit is shown
faded. Gauge numbers are 14px solid black, not 11px at 55%.

### Node ids

`figma-relabel.py` records ids that were corrected by matching each rendered
element against every visible Figma node — mostly id tuples shifted by one
slot. Two lessons from applying it: a match between nested frames whose boxes
differ by under a pixel is ambiguous and must not be applied, and a rename
table breaks when new content later uses the same id. Every screen is now
checked for duplicate ids on build.

## Drive originals

The full-quality images come from the project's Drive folder. They are
re-exports of Figma layers, and the build machine cannot reach Drive, so each
screen decides in the viewer's browser how every file was exported and places
it to match Figma (`figma-drive-images.py`):

- **render** — rotation and drop shadow baked in. Placed at the layer's
  `absoluteRenderBounds`, with no CSS rotation or shadow. Accepted only for the
  slot the file was exported from, and only where no same-named slot shares its
  proportions at a different rotation (a baked 0° and 180° render cannot be
  told apart by shape).
- **source** — the untouched image. Placed in the layer box with Figma's
  rotation, its exact drop shadow, and FILL (cover) or CROP (the layer's
  `imageTransform`, full precision) framing.
- **neither** — the slot keeps its current image. `?imgcheck` labels each
  decision on screen; `window.U2_IMAGE_REPORT` lists them.

Tested with stand-in files of known size: a render at 2x lands on Figma's
render bounds to 0.01px, a source lands on the layer box, a cropped shop tile
reproduces Figma's crop (116.5x145.1 at -13.25,-14.66), and wrong or missing
files are left alone. 72 slots across the screens.

For the app, `scripts/fetch-drive-images.sh` downloads the originals into
`web/public/img/drive/`; `manifest.json` there records where each is used.

### Found while mapping them

- **The basket contents were all in the wrong places.** Figma's renders of
  each node: 1:1586 is the battery, 1:1588 the faded (unavailable) cylinder,
  1:1587 the hose, 1:1591 the clamps.
- Product shadows are per item (15px at 30%, 10px at 25%, 10px at 50%), not
  one generic shadow; the thumbs cast 100px at 20px offset.
- The notification thumbnail is 40x45.27 rotated 5.85deg.
- Figma uses 23 source images. Not in the Drive folder: the staff/profile
  photos (42 uses), the profile header, the scanner camera view, the map, the
  receipt image, and the two shop carousel photos. Those slots still show
  placeholders or the earlier stand-ins.
- `image PIPE PURPLE` and `image PIPDE BLACK` match no Figma layer and are not
  placed.

## Figma is the only specification

Every earlier instruction that conflicted with the file has been reverted to
what the file draws:

| Reverted | Figma |
|---|---|
| "via:" removed | restored on ORDER SUMMARY, WALK-IN PAY CONFIRM and WALK-IN PAYMENT 2 (hidden on WALK-IN PAYMENT) |
| "ONLY 6KG LEFT" at 13px | **1000KG** (48px) and "INSUFFICIENT- Please redude  " (10px), typo and trailing spaces as in the file |
| ADD to Cart animation | a plain button |
| BLACK CONCEPT as a dark theme | the frame as drawn: #000, header image, avatar, name, RECENT HISTORY, one 50%-to-0% scrim, a 70% LED disc with a visible white X |
| Google / Apple marks | a white "A" in each 62x60 disc, both with a #797BF4 border |
| chips on one baseline | hand-placed and tilted (12deg, -3.47deg) |
| centred Checkout / UPDATE / list scanner | 118, 40, and the file's 3px offset |
| scrolling ticker | still, as captured |

Invented content found while reverting: the cashier sheets had CASH / CARD
TERM cards, a WALK-IN/DELIVERY toggle, a 14,000 price and "Take Payment" /
"Confirm" buttons. The file has "Continue to Pay" on all three, a PAY CASH /
TRANSFER toggle, 10,000, and on WALK-IN PAYMENT no cards at all (that group is
hidden). WALK-IN PAYMENT 2 stacks an empty card at -9deg under BANK TRANS at
2deg.

### Root causes fixed, not patched

1px strokes drawn as CSS borders moved everything inside them. The terminal
body and the LED body are now inset shadows, which paint identically without
taking layout space — that alone corrected the keypad, the readout, the slot
and both INSUFFICIENT lines. The same applied to the new screen's 2px dashed
card.

### Frames added since the first survey

`83:246` Admin stock notification expanded and `88:55` notifs are now built
(batch 12). 83:246 is set in **Inter**, not jgs7 — a newer design than the
rest of the file. 88:55 holds a filled bell union, a different drawing from
the outlined bell (1:756) every screen uses; the screens keep theirs.

### Verification

979 elements across all 63 screens, each compared with the same node in Figma.
**921 (94%) are within 1px.** Of the rest, every one is a text box whose
centre matches but whose width differs because the font is missing. There are
no unexplained differences.

## This pass

**Tank gauge.** figma 1:2318 is 91 separate 2px black lines at x=336: eighty
10px ticks in ten groups of eight (4.44 apart), eight 20px ticks between the
groups, and three 40px lines at 183, 399 and 615.29. It had been eleven evenly
spaced 1px lines at 55% grey. Every line is now placed at its own y.

**Back tiles.** Figma has one on eight screens (1:4377, 1:4407, 1:4437,
1:4466, 1:4527, 1:4592, 1:4908, 1:4938). Checked: drawn on exactly those
eight, nowhere else.

**Desktop and mobile.** Each screen is a fixed 440px canvas and never
reflows. Measured at 1440px and at 390px with a 3x mobile viewport: 1,057
elements, zero differences.

**Fonts.** The pages now load Inter and Barlow Condensed / Semi Condensed from
Google Fonts, which closes those two gaps whenever the viewer is online;
`scripts/fetch-fonts.sh` vendors them for an offline build. jgs5 (the LED
face) is declared and used, falling back to jgs7 until `jgs5.woff2` is placed
in `web/public/fonts` — it is Velvetyne's Jgs family, SIL OFL, the same family
as the bundled jgs7. It could not be downloaded here (no network on the build
machine, and no verifiable direct file URL).

**Glass.** Figma's GLASS effect (radius 35, refraction 1, depth 49, light
-45deg, intensity 0.8, dispersion 0.95) has no browser equivalent: refraction
and dispersion require resampling the backdrop per pixel, which neither CSS
filters nor `backdrop-filter: url()` can do. The drawing now uses every
parameter as far as CSS allows — a 17.5px backdrop blur, a specular edge from
the -45deg light at 0.8, depth-49 inner shading and a cyan/magenta edge pair
for dispersion. Close, not exact.

**Verification.** 979 elements across 63 screens: **931 (95%) within 1px, none
more than 50px out.** The remaining differences are text boxes whose centre
matches but whose width differs while jgs5 is missing.

## Gallery order

The gallery follows the Figma canvas, left to right, and takes each screen's
section from the DIVIDER frames (`canvas_order.py`). Two placements this
corrected: `83:246` sits at x=12112, inside the CASHIER section despite being
named "Admin stock notification expanded", and `88:55` at x=1741 is in DRIVER.
Counts: DRIVER 8, CASHIER 13, ADMIN 14, CUSTOMER 28 = 63.

`console.table` is not available in every browser and threw on open; the image
runtime now logs with `console.log` behind a type check.

## The tank

figma 1:2300, exactly:

| | |
|---|---|
| shell 1:2301 | 280x476 black, radius 16, inner glow r10 at -1,1 |
| chamber 1:2302 | 242x445 inset at 17,15 — **#5B5B6F**, 1px black, radius 8 |
| gas 1:2303 | 242 wide on the chamber floor — **#9596E5 at 20%**, 1px black, radius 8, inner shadow r100 at 0,20, small glass |
| cap 1:2304 | a 99x34 LED housing with **six 8x34 slots** at 7,23,39,55,71,87 |

It had been a plain black box with a blue gradient and a solid cap.

**Levels are the file's own:** the gas is 267 of 445 — **60%** — on HOME
BLUEPRINT, GAS HISTORY, UPDATE GAS and GAS LVL CHECK, and 180 of 445 — **40%**
— on DASHBOARD. The build had 65% and 52%.

**Gauge:** every line is #000 at full opacity, 2px, centre-aligned (so each
sits at y-1); every number is Barlow Condensed SemiBold, solid black.

**The level marker.** Figma calls out the level only on GAS LVL CHECK (60% at
20px, same black as the rest). By request every tank screen now calls out its
own level the same way, and the other numbers are dimmed to 45% so it reads
brighter. The dimming is the one departure from the file on this screen —
Figma has them all at full black.

## Product photos and the sign-in marks

**Rotation.** Figma rotates several product fills by +-90 or 180 because those
source images are stored inverted — in the file every product still reads
upright. Applying the same angles to the upright stand-ins used here turned
the cylinder and battery upside down. The stand-ins now take only the genuine
tilts (14.16, 17.54, 4, -83.46); right-angle rotations are dropped. The Drive
runtime still applies the full rotation to Figma's own sources, where it is
correct.

Arrangement checked against Figma's renders: shop grid cylinder / battery /
clamps / hose; SHOP - SEARCH in four rows (cylinder+hose, battery+clamps,
hose+cylinder, clamps+battery); the basket battery upper-left, clamps
upper-right, cylinder lower-left, hose lower-right.

**LOG IN 1.** `1:1268` / `1:1270` are placeholder "A"s standing in for the
Google and Apple sign-in marks. The real marks are drawn, in white, on Figma's
blue and black discs.

## Page connectivity

Routes declared: 35. Every one has a way in:

- the four app roots are reached by role after sign-in (`HOME[role]` in
  `auth.ts`, used by the auth callback)
- admin, staff and driver sub-pages are linked from each app's own nav
- `/orders/verify` is the Paystack return URL (`PAYSTACK_CALLBACK_PATH` in
  `wrangler.toml`), so customers land on it after paying
- `/shop/bundle/:id` resolves through `/shop/:kind/:id`

No orphaned route, and no link pointing at a route that does not exist.

## Layer blurs

Figma blurs what sits behind a sheet or a readout. Its blur radius is twice
the CSS one, so r16 is `blur(8px)`:

| Screen | Blurred | Figma r |
|---|---|---|
| NOTIF STATE 1 / 2 (admin) | tank, gauge, button, staff strip, bell | 8 |
| GAS LVL CHECK | tank 10, gauge and numbers 2 | 10 / 2 |
| NOTIFS STATE 1/2/EXPANDED, STAFF HISTORY, DELIVERY NOTIFS, COMPLETED DELIVERY | the whole scan page behind the sheet | 16 |
| PAYMENT SUCCESSFUL / FAILED, GAS HISTORY | background blur behind the overlay | 8 |

None of these had been drawn. NOTIF STATE 1 and 2 also showed a flat
placeholder where the file has the tank page itself; they now draw it and blur
it.

## The basket

figma 1:1585 is a photograph (148 KB at full size, 51 KB at half), too large
to embed through this channel. The full-quality original loads from the
project Drive folder (`shopping basket 3 1.png`), and
`scripts/fetch-drive-images.sh` vendors it into `web/public/img/drive/`.

Until it loads — and offline — the cart draws a wire basket instead of the
grey placeholder that was there before, so the screen reads correctly either
way. It is a stand-in, not the file's artwork.

## Unavailable items, and the moving rate

**Unavailable.** figma marks it by dropping the image fill to **40%**, colour
intact — 1:1503 and 1:1507 on SHOP - ITEM UNAVAILABLE, and 1:1588 on CART -
ITEM UNAVAILABLE only (the other cart screens fade nothing). The grayscale
filter used here before is not in the file. A 1.5px blur is added on top by
request; it joins the element's own filter value, because a second `filter`
declaration replaces the shadow rather than adding to it.

**The rate ticker moves again.** Figma captures the strip mid-scroll; it now
scrolls from that position. In the application the string comes from the
worker (`RATE: 1KG AT ₦…`, built from `gas_stock.rate_kobo_per_kg`) and the
LED scrolls it, so the price on the terminal is always the live one.

**Admins set the price.** Two prices, both editable and both audited:

| | Where | Path |
|---|---|---|
| Gas rate per kg | admin Tank screen, rate modal | `api.admin.setRate` → `PATCH /admin/rate` → `set_gas_rate()` — rate, history row and audit entry in one transaction |
| Accessory prices | admin Products screen | `api.admin.updateProduct` / `createProduct` → `price_kobo` |

Payment amounts are never read from the client: every charge is computed from
the order server-side, so changing a price cannot be forced from the browser.

## The basket and the map are embedded

Both were supplied and are now in the files themselves, so the cart and every
address card work offline with no network at all.

- **1:1585, the basket** — supplied as a 3x layer export (1068x1548, 969 KB).
  Re-encoded at 2x as a 64-colour palette PNG: **47 KB**, which is small enough
  to inline. The drawn stand-in is gone.
- **image 0849f7f0, the map** — the file supplied is byte-for-byte Figma's own
  source (1584x672, 286,690 bytes). Re-encoded to the size the screens use.

The map appears in **six** places, all with the same crop
(`imageTransform [[0.6184,0,0.2638],[0,0.6564,0.0417]]`, radius 24, 1px black):
PAY - DELIVERY and CHECKOUT - DELIVERY (320x140), PERSONAL DTS and PERSONAL
DTS 2 (396x200), NOTIFS STATE 2 and DELIVERY NOTIFS (340x180). Two of those
had no map at all, and PERSONAL DTS had an invented grey "ADDRESS" card in its
place. PAY - DELIVERY keeps the 30% black wash under its button.

## Where the map actually belongs

Checking each map's parent chain in the file, not just its coordinates:

| Screen | In Figma the map is | Built as |
|---|---|---|
| PAY - DELIVERY, CHECKOUT - DELIVERY | inside the sheet's address group | correct |
| PERSONAL DTS, PERSONAL DTS 2 | inside the sheet's `address` group | correct |
| NOTIFS STATE 2 | **inside an opened notification row** (`HISTORY > Frame 69 > Frame 64 > Frame 74`) | was a card floating over the sheet |
| DELIVERY NOTIFS | **inside an opened delivery row** | was a card floating over the sheet |

Fixing that exposed the rest of the list structure, which was wrong on every
notification screen:

- The first entry **opens** into a taller card with a 2px black outline —
  387x363 on NOTIFS STATE 2 (map + DELIVER TO / AJAINO CALEB), 387x185 on
  NOTIFS STATE 1 (EXPANDED) (a CONFIRM button), 387x455 on DELIVERY NOTIFS
  (map + SCAN). The remaining rows follow at 125 spacing.
- There is a **second filter row** under the chips (ALL / CASH / POS /
  TRANSFER, or ALL / COMPLETED / CANCELLED), the active one set at 32px and
  the rest at 20px. It had not been drawn at all.
- The active chip differs per screen: IN-PERSON on STATE 1 and EXPANDED,
  **ONLINE** on STATE 2. It had been hardcoded to IN-PERSON.
- Rows begin at 342 or 351, not 262, and NOTIFS STATE 2 shows five entries,
  not an empty state.

## Parentage audit

Position matching is not structure matching: an element can sit on the right
pixels while living in the wrong parent. Every rendered element's parent here
was compared with its parent in the file — 725 elements with a recorded Figma
parent, across all 63 screens.

**One substantive finding.** CHECKOUT - WALK-IN and CHECKOUT - DELIVERY reuse
the PAY sheets and the cart basket, and carried those frames' node ids: 23 and
24 elements respectively. Their geometry and content were right, which is why
the position pass never saw it — and the comparison *excludes* reused ids, so
those two sheets had never actually been verified. The ids are corrected in
`figma-relabel.py` (the sheets are a constant offset: 1:1419 -> 1:1800 is +381,
1:401 -> 1:1924 is +1523; the basket items map one to one).

**The remaining 29 are nesting depth only** — the element is a sibling here
where the file nests it one level deeper (an LED body beside its housing
rather than inside it, and similar). Each was checked rather than assumed:
28 measure within 1px, all sit inside their parent's bounds, and no parent
involved applies opacity, blur or rotation that would cascade, so they render
identically. Several of those parents do clip (`clipsContent`), which is why
the check mattered. The 29th is AMOUNT IN NAIRA, off by 20.8px on width
because Barlow Condensed is missing.

## Order summary, and image resolution

**ORDER SUMMARY now matches WALK-IN PAY CONFIRM.** Both sheets are identical
in the file — the weight at 51,66 in a 121x37 box and the price chip at
80,112 with its label at 4,4 on a 9px line — so both are now built the same
way, placed at those coordinates rather than centred by flex.

**Embedded image resolution.** Each embedded raster measured against the
largest box it is drawn in:

| Image | Embedded | Largest use | Scale |
|---|---|---|---|
| basket | 712x1032 | 356x516 | 2.0x |
| manual-entry disc | 96x96 | 40x40 | 2.4x |
| map | 800x339 | 640x305 | 1.2x |
| pointing hand | 149x149 | 149x149 | 1.0x |
| thumb | 100x100 | 100x100 | 1.0x |
| **cylinder** | **63x82** | 160x212 | **0.4x** |
| **hose** | **62x62** | 250x200 | **0.2x** |
| **battery** | **60x67** | 200x226 | **0.3x** |
| **clamps** | **81x81** | 200x200 | **0.4x** |

The four product photos are upscaled and look soft. They came from early
low-resolution exports. Full-quality versions exist in the project Drive
folder (`image 3`, `image 4`, `image 5`, `image 7`, `image 9`, `image 10`,
`image 11`, `image 13`) and load over the network, but the embedded fallbacks
stay soft until those files are supplied the way the basket and map were.

## Product images are cut-outs

figma's product images have no background — they sit directly on the basket
wire, the tile colour and the row. The four here were JPEGs with a solid white
rectangle behind them, which showed as white boxes wherever they were placed.

The white is now keyed out: flood-filled from the border only, so white
*inside* a product (the gap in the hose coil) is kept, with a feathered edge,
re-encoded as palette PNGs with transparency (6-7 KB each).

They remain low resolution — 63x82 to 81x81, drawn at up to 250px. Detail
cannot be recovered from those; the full-size versions are in the Drive folder
(`image 3`, `4`, `5`, `7`, `9`, `10`, `11`, `13`) and load over the network.
Supplying those files the way the basket and map were supplied is what makes
them sharp offline.

## The app renders the screens

The app and the screens were two drawings of the same design kept in step by
hand, and they drifted: the corrections made while matching the file landed in
the screens and not in the product. Only 7 CSS selectors were even shared —
the screens place elements from the file's own measurements, the app re-drew
them from 163 hand-written rules.

`web/src/figma/` is now generated from the HTML screens by
`build/gen_react.py`: all **63 artboards, byte for byte**. `FigmaScreen`
renders one and substitutes live values by Figma node id, so data can never
restyle the design. `web/src/styles/figma.css` is the screens' own stylesheet.

`scripts/check-figma-parity.sh` fails if the two ever differ; run it in CI.
Regenerate with `python3 build/gen_react.py` whenever the screens change.

Behaviour is unchanged: routes still own state, data and interaction, and
interactive controls stay React components over the artboard.
