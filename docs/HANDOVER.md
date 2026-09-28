# Handover — continue the Figma parity work

This is the short version for whoever picks this up next. The long, detailed
rules live in [`AGENTS.md`](../AGENTS.md) at the repo root; read it before
changing an artboard. This file is the "get running in five minutes" plus the
list of what is and is not done.

## Run it with no API keys at all

Nothing in the dev flow needs a backend, a Supabase project, a Worker, or a
sign-in. `web/.env.development` is committed and forces the embedded mode, so:

```bash
git clone <repo> && cd u2gas
cd web && npm ci
npm run dev -- --host 0.0.0.0 --port 12001 --strictPort
```

Open `http://localhost:12001/`. Every screen is reachable from in-browser
fixtures. Identity is picked with `?as=<role>`
(`customer` | `staff` | `driver` | `admin`) or the bottom-right role switch.

Committing `.env.development` is deliberate: Vite reads it only in `dev` mode,
never for `build` (that reads `.env`), so it cannot reach a production bundle.
The real-API values, if you ever need them, are documented in
`web/.env.example`.

### Checks (run them before you commit)

```bash
cd web
npm run check:frontend      # assets exist + every named artboard is a real screen
npm run check:assets        # no CSS font/image reference is missing
npm run typecheck           # tsc --noEmit
```

The four parity gates, and what each actually proves (they are not
interchangeable — see AGENTS.md "What the four parity checks cannot see"):

| command | requires | proves |
|---|---|---|
| `bash scripts/check-figma-parity.sh` (repo root) | python3 | generated `web/src/figma/` == `docs/u2gas-all-screens.html`, byte for byte |
| `npm run check:figma-pixels` | dev server on :12001 | the app's artboard *rendering* matches the gallery |
| `npm run check:dom-parity` | dev server on :12001 | the live *demo* DOM matches the gallery (structure + tokens) |
| `npm run check:frontend` | — | registry/assets consistency |

## The one contract to keep

`docs/u2gas-all-screens.html` is the **design source of truth**. The app renders
that markup verbatim through `FigmaScreen` / `FigmaRouteFrame`. Two rules:

1. **Never hand-edit `web/src/figma/{assets,screens,artboards}.ts`.** They are
   generated. After changing the gallery, run `python3 build/gen_react.py` from
   the repo root.
2. **Nothing may reach inside `.frame`** to change layout, colour, or text
   metrics. A value the file draws is drawn text, including its typos
   (`C0PYRIGHT`, `INSUFFICIENT- Please redude`) — the parity harness compares
   character for character.

When you add a back control, a new page, or a state, clear it against the rules
in AGENTS.md first (visible-back-hotspot, state-vs-template, `data-node`
bindings, the `letter-spacing`/class-leak traps). Nearly every regression in
this repo's history came from breaking one of them.

## Adding a new page

1. Draw it in Figma. Get the frame's node id.
2. Add it to the gallery (`docs/u2gas-all-screens.html`) as a `<figure
   class="slot">` with a `<div class="frame" data-node="…">` and a
   `<figcaption>` naming app + title + `440×H`.
3. `python3 build/gen_react.py` → regenerates `web/src/figma/screens/*.ts`.
4. Register the artboard in `web/src/figma/artboards.ts` and add a route that
   renders `<FigmaScreen node="…" />`. A registry entry must name an artboard
   *and* say which row template fills it, if any; `check:frontend` fails on a
   claimed-but-unrendered board.
5. Bind live data with `values={{ "node-id": text }}`; text you leave unbound
   keeps the file's drawn sample. Rows the file does not id must be painted
   over a reserved band (see the `/history` and `/cart` patterns in AGENTS.md).
6. Run all four gates. Then `npm run build` (fails if `VITE_API_ORIGIN` is
   unset and `VITE_EMBEDDED_API` is not `true`).

## Fonts

The pixel faces are Velvetyne's **Jgs** family (SIL OFL): `jgs7` is every
heading/label/button, `jgs5` the LED readouts and tickers. Both are committed
under `web/public/fonts/`, byte-identical to the upstream repo. The whole
upstream repository also ships at the repo root as `jgs-main.zip`, so the
masters can be refreshed offline; it carries `jgs5`, `jgs7`, `jgs9` and the
`jgs_Font` master (the last two are not used by any artboard). Inventory and
licences are in `web/public/fonts/README.txt`.

## Asset workflow (pictures you bring in a zip)

Pictures for the *drawn* artboards (product tiles, the shop strip/grid, the
notification panel thumbnail and pin map) are the gallery's `--aN` custom
properties in `docs/u2gas-all-screens.html`, painted by
`.frame .asset-img { background-image: var(--src) }`.

To add new drawn pictures:

1. Put the source files somewhere the repo does not track (e.g. `.figdiff/`,
   which is gitignored) and downscale them.
2. Append each as `--aN: url("data:image/webp;base64,…")` (or a file under
   `web/public/`) to the gallery's `:root` asset block.
3. Point the relevant `<span class="asset-img" style="--src:var(--aN)">` at it.
4. `python3 build/gen_react.py` and re-run the pixel gate.

Live pictures a route supplies at runtime (the camera feed, user avatars,
product photos from storage) do **not** belong in the gallery: the gallery
keeps the honest `camera feed` placeholder and the route paints a real
`<Scanner>`/`<img>` over that box. Do not stamp a screenshot of a live feed
into the drawing.

## Verified state (last commit on `main`)

- All 61 artboards: `check:figma-pixels` worst **0%**, `check:dom-parity`
  **CLEAN**, gallery byte-identical, `tsc` clean.
- Done since the GIFT-TECH re-issue: manager role removed; TRANS HISTORY, admin
  GAS HISTORY and the seven notification panels redrawn; shop strip + shop grid
  added where the live file draws them; thumb-glow state colours; admin gauge
  axis opacity/`%`; walk-in copy (`AMOUNT IN NAIRA`, `SCAN`); STAFF HISTORY
  panels (`1:3675`/`1:3781`) rebuilt from live.

## Still to do (verified deltas against live Figma)

All coordinates below are board-relative, read from the live `u2` page
(`152:2265`) via the Figma MCP, with Figma's 20px export margin cropped.

1. **Walk-in panels — the four outer frames (`1:4466`, `1:4527`, `1:4592`,
   `1:4047`)** are redrawn, not re-worded, so the panel internals must be
   spliced (same technique as the notif panels). Confirmed:
   - `AMOUNT IN NAIRA` sits at y **177 / 179 / 178 / 162** (drawn at
     166/168/167/151) and is `#D4D4D4`, not `rgba(0,0,0,.45)`.
   - `1:4466`: LED readout box at y **182** (drawn 192); keypad at
     left **114** / top **301** (drawn 44/165).
   - `1:4592`, `1:4047`: `UPDATE` sheet is **380×427** at (30,257); selected
     `DELIVERY OR WALK-IN` toggle extended to `1:4527`.
2. **`1:4683` DELIVERY NOTIFS, `1:4803` COMPLETED DELIVERY** — the live file
   draws a `SEE ALL` / `ALL` / `DELIVERIES` filter row above the list that the
   gallery lacks. Confirm against the frame, then splice.
3. **`1:2847` GAS HISTORY** — the live month strip adds `MARCH`…`DECEMBER`
   chips. Most already exist; diff the chip list before adding.
4. **`306:8081 BLACK CONCEPT` and `376:11738 PERSONAL DTS`** — live frames the
   gallery never carried (`1:2090` / `1:2244` are their stale counterparts).
   Decide per board: "not designed yet" (leave) or superseded (retire).
5. **Scan screens** — the live scanner body is now an image-backed frame
   (`Frame 60`/`Frame 65`). This is an image-dependent redraw, tracked
   separately from the copy pass.

Expected, not drift: the camera feed placeholder on 51 boards; the framed
export's 20px border (already cropped by the comparator).
