# u2gas

Next.js 16 frontend (`web/`) over a Cloudflare Worker API (`worker/`) and
Supabase (`supabase/`).

> **The live Figma file is the only design source of truth.**
> `U2-GAS` — file `v4xgWC0Q0wtSKmAff3EOzU`, page `MAIN SCREENS` (`256:14758`) —
> read through the Figma MCP. There is no committed HTML snapshot and no
> generator; do not reintroduce one. `web/` is a carbon copy of the uploaded
> frontend (`U2gas_frontend-main.zip`) and keeps its components, fixtures and
> layout: when the uploaded frontend changes, mirror the change into `web/`
> verbatim, and when the design changes, the live file is what it is checked
> against.

## Commands

Root scripts (`package.json`) proxy into `web/`:

- `npm run dev` — `next dev` on port 3000. Pass `-p <port>` if the preview
  tunnel needs a specific one.
- `npm run build` — `next build`.
- `npm run typecheck` — `cd web && npx tsc --noEmit`.
- `npm run lint` — `cd web && npm run lint` (ESLint, `eslint-config-next`).
- `bash scripts/check-monnify.sh` — mints a Monnify token from the credentials in
  `worker/.dev.vars` and reports PASS or the gateway's rejection. Run it before
  debugging any payment symptom: a placeholder or wrong-environment key makes
  initialize, verify and refund fail together, and the app only says
  `MONNIFY_INIT_FAILED`. It never echoes the secret.

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

The uploaded frontend shipped as a UI demo with no auth wiring: the login screen
and the role apps (`/admin`, `/cashier`, `/driver`) rendered from the `data.ts`
fixtures and Zustand stores, with no Supabase client and no session handling.

That is still true of most screens. The wiring added so far is confined to the
payment path and the layers the carbon copy did not have — `lib/supabase.ts`
(session, `ensureFreshSession`), `lib/api.ts` (bearer token, `ApiError`),
`lib/endpoints.ts`, `lib/env.ts` and `stores/authStore.ts`. Add the rest of the
wiring there, not by editing a screen's markup, or `web/` stops being a carbon
copy of the reference.

## Environment

`web/lib/env.ts` reads the API origin and Supabase keys. `web/next.config.ts`
stays the plain Next config. Keep new `NEXT_PUBLIC_*` reads in `lib/env.ts` so
there is one place that names the backend.

## Data flow

Most screens still bind the fixtures in `web/data.ts` directly (through the
Zustand stores and component props). `helpers/functions.ts` holds
`koboToNaira`; money is kobo (integer), gas is kg.

Wiring to the Worker is in progress and lives in the layers the carbon copy did
not have: `lib/api.ts` (one `ApiError`, bearer token, idempotency key),
`lib/endpoints.ts` (one function per Worker route) and `lib/supabase.ts`. The
home payment flow is wired — `PaymentModal` initializes a real Monnify payment
and polls `getOrder` until `payment_status === "paid"`. The cashier, driver and
admin history views still read fixtures.

## Payment return, and the RLS policy that must not recurse

`MONNIFY_CALLBACK_PATH` is `/orders/verify`, so that route must exist:
`app/(public)/orders/verify/page.tsx`. The gateway sends back only `?order=`, so
the merchant reference and guest token are kept in session storage
(`lib/paymentSession.ts`) at initialize rather than in the URL. The page asks
`/payments/verify` first, then polls `getOrder`, and never reports failure on its
own — the webhook is what settles an order.

A policy on `profile` must not read `profile`. `profile_self_read` once selected
from `profile` inside its own `USING` clause and every read raised `42P17
infinite recursion detected in policy for relation "profile"`. A `SECURITY
DEFINER` helper runs exempt from RLS; a subquery inside the policy runs as the
*querying* role, so only `is_staff()` breaks the loop. The blast radius is wide
because the order detail query embeds `profile:user_id (…)`, so the recursion
surfaced as a 500 on every signed-in `GET /api/orders/:id` — which the payment
poll reads. `supabase/tests/02_rls.sql` covers it; keep `profile` out of its own
policy.

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

## The UI source is the live Figma file

There is no snapshot and no generator: the live Figma file `U2-GAS`
(`v4xgWC0Q0wtSKmAff3EOzU`, page `MAIN SCREENS` `256:14758`), read through the
Figma MCP, is the only design source. `web/` is a carbon copy of the uploaded
frontend (`U2gas_frontend-main.zip`, also deployed at `u2gass.vercel.app`) — when
the upload changes, mirror the change verbatim; when the design changes, the live
file is what a screen is checked against.

The old Vite/React frontend, its `docs/*.html` galleries (`u2gas-all-screens.html`,
the `u2gas-batch*-exact.html` files, `design-system-reference.html`), the
`web/src/figma/*` generated screens and their generator (`build/gen_react.py`,
`scripts/check-figma-parity.sh`, `web/scripts/check-figma-registry.mjs`) were all
removed. Do not reintroduce a committed HTML snapshot or a markup generator. When
a doc still narrates the removed pipeline (a "combiner" that merges batches, a
"combined file" that matches the batch files, "the prototype"), that wording is
stale drift — delete it or point it at the live file.

The page's frames carry several id prefixes — `256:*`, `369:*`, `720:*`,
`675:*` — because frames were added to `MAIN SCREENS` after the first survey.
They are all members of the current page, so a screen may be keyed on any of
them; only the *page* id (`256:14758`) is stable. Re-read the page through the
MCP rather than trusting an id recorded here, since the file is live.
