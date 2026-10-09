# u2gas

Next.js 16 frontend (`web/`) over a Cloudflare Worker API (`worker/`) and
Supabase (`supabase/`).

> **The live U2-GAS Figma file (`v4xgWC0Q0wtSKmAff3EOzU`) is the only design
> source.** There is no committed HTML snapshot of the screens and no
> generator: matching the design means reading the live file through the Figma
> MCP and changing the app to match. No screen may be edited without a matching
> change in Figma. This file and the `docs/` under it name the live file as the
> single source of truth.

## Commands

Root scripts (`package.json`) proxy into `web/`:

- `npm run dev` — `next dev` on port 3000. Pass `-p <port>` if the preview
  tunnel needs a specific one.
- `npm run build` — `next build`, static export (`output: "export"`).
- `npm run typecheck` — `cd web && npx tsc --noEmit`.
- `npm run lint` — `cd web && npm run lint` (ESLint, `eslint-config-next`).

## Architecture

- `web/app/(public)/` — every route. `page.tsx` files are thin and mostly
  server components that render a `*PageClient` component.
- `web/components/` — the screens, grouped by role: `admin/`, `cashier/`,
  `driver/`, `login/`, `modals/`, `home/`, `receipt/`, `ui/`, plus
  `providers.tsx`, `require-role.tsx`, `screen-notice.tsx`.
- `web/lib/` — `api.ts` (Worker client), `supabase.ts` (auth only),
  `auth-context.tsx`, `hooks.ts` (`useAsync`), `adapters.ts` + `receipts.ts`
  (backend → the view-model shapes the drawings were made against), `types.ts`,
  `env.ts`, `media.ts`.
- `web/stores/` — Zustand view stores (`authStore`, `cartStore`,
  `adminStaffStore`, `adminTankStore`). `components/providers.tsx` keeps the
  session-backed `AuthProvider` in step with `authStore`; only that bridge knows
  both.

There is no `web/data.ts`. The dummy fixtures were removed: every screen reads
the Worker/Supabase APIs through `lib/api.ts`, and a fixture on a screen would be
unfinished wiring, not a design decision.

## Static export, and why ids are query parameters

`web/next.config.ts` sets `output: "export"` and `trailingSlash: true`. Every
route is client-rendered and talks to the Worker for data, so Cloudflare Pages
serves the emitted files directly — no adapter, no edge runtime. The cost is
that **dynamic path segments cannot exist** (a page whose id comes from the path
cannot be pre-rendered without knowing every id). Ids therefore travel as query
parameters (`/orders?id=…`) read with `useSearchParams` on the client. A
`useSearchParams` page needs a `Suspense` boundary or the build fails.

## Auth and roles

Supabase Auth is the only identity system — do not add a second. There is one
role enum, `customer | staff | driver | admin`; an admin override is admin-only.
The role is read from the `profile` row (`lib/supabase.ts` `loadProfile`), never
from the JWT, so revoking a role takes effect on the next load rather than at
token expiry. `HOME` maps each role to its route prefix; `/auth/callback` reads
the role and sends the person to their own app.

`components/require-role.tsx` (`RequireRole`) is a *convenience*, not the
security boundary: every Worker route independently checks the caller's role
from the profile row. It exists so a signed-in customer does not wander into an
admin screen. Because the role comes from the profile row, it stops matching as
soon as the role is revoked.

`safeNext` (`lib/supabase.ts`) validates every deep link: anything not starting
with a single slash followed by a non-slash, non-backslash character is
discarded, so login cannot be turned into an open redirect.

## Environment

`lib/env.ts` reads `NEXT_PUBLIC_*` at build time and inlines it. Never put a
secret here: the Supabase **publishable** key is public by design, and the module
throws at build time if a `sb_secret_` / `service_role` key reaches the browser
bundle. A missing key is non-fatal (a CI build without secrets must still
produce output); sign-in then fails with a network error. `EMBEDDED_API`
(`NEXT_PUBLIC_EMBEDDED_API=true`) marks a preview build that contacts no API:
it short-circuits Supabase sign-in and drops the API origin from the CSP, so
API-backed screens render their no-data state. There is no fixture layer.

## Data flow

`lib/api.ts` is the one Worker client. Its `ApiError` carries the machine code,
copy already written for the interface, and the numbers a screen needs
(`partialGasAvailable`, `fieldErrors`); screens render `message`/`detail` and
never build error copy themselves. A network failure raises `OFFLINE` and
dispatches `u2gas:offline` rather than reading as a 500.

`lib/hooks.ts` `useAsync` loads once and exposes
`{ data, error, loading, reload, mutate }`. It is deliberately not a cache; the
one thing it guards is the stale-response race (a monotonic sequence id stops a
late response clobbering a newer one, and an unmount never sets state).

`lib/adapters.ts` and `lib/receipts.ts` convert backend rows (`price_kobo`,
`image_asset`) into the view models the drawings use (`priceNaira`, `image`).
Layout numbers live in the component; the conversion happens once, here, so a
backend field rename breaks one file and no screen ever restyles the design.

## Fonts

Self-hosted under `web/public/fonts/`, wired through `next/font/local` in
`app/layout.tsx` and declared in `app/globals.css`. jgs7 is the pixel face — the
brand, used for every text style (`--font-sans`/`--font-mono`/`--font-heading`).
jgs5 is the LED face the readouts and tickers draw (`--font-led`); both ship as
`woff2`/`woff` and `scripts/fetch-fonts.sh` refreshes them. Barlow Semi
Condensed is loaded from Google Fonts via `next/font/google` (`--font-barlow`)
for caption strings.

## Conventions that bite

- **`"use client"` on anything with state, effects, event handlers or browser
  APIs.** `page.tsx` files stay server components; the interactive part lives in
  the imported `*PageClient` / view component.
- **Verify against the live Figma frame, not a saved copy.** Read the frame
  through the Figma MCP and compare structure, geometry and computed tokens
  (font, colour, weight, tracking, radius, opacity, transform), plus a leaf's
  `visible` flag. A node that is `visible: false` in Figma but drawn in the app
  (or vice versa) is drift. Compare element boxes, not full-page screenshots —
  the reference wraps each frame in viewer chrome that renders off-viewport.
- **A drawn value is drawn text, typos included** (`C0PYRIGHT`, `Please redude`,
  curly punctuation). Match the file's characters exactly; a straight quote
  where the file draws `&rsquo;` is a changed glyph, not a live value.
- **Do not pad a list by repeating a record.** A lookup that cannot find its row
  must fail (404), not fall back to `orders[0]` — otherwise every row shows the
  same order and no caller can tell the lookup failed.
- **Money is kobo (integer); gas is kg.** `koboToNaira` lives in
  `helpers/functions.ts`. Never float money.

## The design source is live Figma

There is no snapshot and no generator: the live Figma file
(`v4xgWC0Q0wtSKmAff3EOzU`) is the only design source. Read the live frame through
the Figma MCP and change the app to match.

The old Vite/React frontend, its `docs/*.html` galleries (`u2gas-all-screens.html`,
the `u2gas-batch*-exact.html` files, `design-system-reference.html`), the
`web/src/figma/*` generated screens and their generator (`build/gen_react.py`,
`scripts/check-figma-parity.sh`, `web/scripts/check-figma-registry.mjs`) were all
removed. Do not reintroduce a committed HTML snapshot or a markup generator: the
only way to certify a screen is to read its live frame. When a doc still narrates
the removed pipeline (a "combiner" that merges batches, a "combined file" that
matches the batch files, "the prototype"), that wording is stale drift — fix it to
describe reading the live file.

The live page is `MAIN SCREENS` (`256:14758`); its node ids are `256:*`, `369:*`
and `720:*` and `675:*` for the frames added after the first survey. Read the
frame, not a saved copy, and watch each leaf's `visible` flag.
