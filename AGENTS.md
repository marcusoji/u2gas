# u2gas

Next.js 16 frontend (`web/`) over a Cloudflare Worker API (`worker/`) and
Supabase (`supabase/`).

> **The uploaded frontend (`U2gas_frontend-main.zip`) is the only UI source of
> truth.** `web/` is kept a carbon copy of it: the same components, the same
> fixtures, the same layout. Do not restyle a screen against a Figma file or a
> saved HTML gallery — there is none. When the uploaded frontend changes, mirror
> the change into `web/` verbatim.

## Commands

Root scripts (`package.json`) proxy into `web/`:

- `npm run dev` — `next dev` on port 3000. Pass `-p <port>` if the preview
  tunnel needs a specific one.
- `npm run build` — `next build`.
- `npm run typecheck` — `cd web && npx tsc --noEmit`.
- `npm run lint` — `cd web && npm run lint` (ESLint, `eslint-config-next`).

## Architecture

- `web/app/(public)/` — every route. `page.tsx` files are thin and render a
  screen from `web/components/`.
- `web/components/` — the screens, grouped by role: `admin/`, `cashier/`,
  `driver/`, `login/`, `modals/`, `home/`, `receipt/`, `layout/`, `ui/`, plus
  `terminal-screen-box.tsx`, `sign-box.tsx`, `footer.tsx`.
- `web/lib/utils.ts` — the `cn` class helper. This is the only `lib/` file the
  uploaded frontend ships.
- `web/helpers/functions.ts` — `koboToNaira` and friends.
- `web/data.ts` — the dummy fixtures (`dummyUserProfile`, `dummyUsers`, …) the
  screens render. The uploaded frontend is a UI demo: it reads no API and binds
  these fixtures directly.
- `web/stores/` — Zustand view stores (`authStore`, `cartStore`,
  `adminStaffStore`, `adminTankStore`).
- `web/types/` — the view-model types the fixtures and screens share.

The uploaded frontend is the reference: `web/` is a carbon copy of it. It is a
self-contained UI demo with **no backend wiring** — screens read `data.ts`
fixtures, and there is no `lib/api.ts`, `lib/supabase.ts` or environment module.
Keeping it a carbon copy is the priority; do not reintroduce a Worker/Supabase
client into a screen that the reference renders from a fixture.

## Build

`web/next.config.ts` is the uploaded frontend's plain config — no
`output: "export"`. `next build` compiles the app and prerenders the static
routes. It is served by `next start` or any Node host; Cloudflare deployment is
tracked separately.

## Auth and roles

The uploaded frontend is a UI demo: it has **no auth and no roles wiring**. The
login screen and the role apps (`/admin`, `/cashier`, `/driver`) render from the
`data.ts` fixtures and Zustand stores; there is no Supabase client, no
`RequireRole`, and no session handling in `web/`.

Supabase (`supabase/`) and the Worker (`worker/`) remain in the repo as the
backend, but nothing in the copied frontend calls them. Wiring the UI to the
backend is a deliberate, separate step — do not do it by editing a screen's
markup, or `web/` stops being a carbon copy of the reference.

## Environment

The uploaded frontend reads no environment. `web/next.config.ts` is the plain
Next config, and there is no `lib/env.ts`. Do not add `NEXT_PUBLIC_*` reads or a
Supabase client into the copied app.

## Data flow

Screens bind the fixtures in `web/data.ts` directly (through the Zustand stores
and component props). `helpers/functions.ts` holds `koboToNaira`; money is kobo
(integer), gas is kg. There is no API client, adapter or hook layer in the
copied frontend — that is the reference's shape, and it is intentional.

## Fonts

Self-hosted under `web/public/fonts/`, wired through `next/font/local` in
`app/layout.tsx` and declared in `app/globals.css`. jgs7 is the only face the
uploaded frontend ships and it is used for every text style
(`--font-sans`/`--font-mono`/`--font-heading`/`--font-led`/`--font-caption`).
Barlow Semi Condensed is loaded from Google Fonts via `next/font/google`
(`--font-barlow`) for caption strings. `scripts/fetch-fonts.sh` refreshes jgs7.

## Conventions that bite

- **`"use client"` on anything with state, effects, event handlers or browser
  APIs.** `page.tsx` files stay server components; the interactive part lives in
  the imported `*PageClient` / view component.
- **Verify against the uploaded frontend, not a remembered design.** Diff a
  screen against the reference app (`U2gas_frontend-main.zip`, also deployed at
  `u2gass.vercel.app`) and keep `web/` byte-for-byte in step with it: same
  markup, same classes, same copy. Do not "improve" a screen by eye.
- **A drawn value is drawn text, typos included** (`C0PYRIGHT`, `Please redude`,
  curly punctuation). Match the reference's characters exactly; a straight quote
  where it draws `&rsquo;` is a changed glyph, not a live value.
- **Do not pad a list by repeating a record.** A lookup that cannot find its row
  must fail (404), not fall back to `orders[0]` — otherwise every row shows the
  same order and no caller can tell the lookup failed.
- **Money is kobo (integer); gas is kg.** `koboToNaira` lives in
  `helpers/functions.ts`. Never float money.

## The UI source is the uploaded frontend

There is no snapshot and no generator: the uploaded frontend
(`U2gas_frontend-main.zip`, also deployed at `u2gass.vercel.app`) is the only UI
source. `web/` is a carbon copy of it — when it changes, mirror the change
verbatim.

The old Vite/React frontend, its `docs/*.html` galleries (`u2gas-all-screens.html`,
the `u2gas-batch*-exact.html` files, `design-system-reference.html`), the
`web/src/figma/*` generated screens and their generator (`build/gen_react.py`,
`scripts/check-figma-parity.sh`, `web/scripts/check-figma-registry.mjs`) were all
removed. Do not reintroduce a committed HTML snapshot or a markup generator. When
a doc still narrates the removed pipeline (a "combiner" that merges batches, a
"combined file" that matches the batch files, "the prototype"), that wording is
stale drift — delete it or point it at the uploaded frontend.

The old page ids (`256:*`, `369:*`, `720:*`, `675:*`) belonged to the removed
Figma survey and are no longer a source. Do not key anything on them.
