# Handover — continue the frontend work

This is the short version for whoever picks this up next. The detailed rules
live in [`AGENTS.md`](../AGENTS.md) at the repo root; read it before changing a
screen. This file is the "get running in five minutes" plus what is and is not
done.

## Run it with no API keys at all

Nothing in the dev flow needs a backend, a Supabase project, a Worker, or a
sign-in. Turn on the embedded (in-browser fixtures) mode and run the dev server:

```bash
git clone <repo> && cd u2gas
cd web && npm install
NEXT_PUBLIC_EMBEDDED_API=true npm run dev
```

Open `http://localhost:3000/`. Every screen is reachable from the fixtures, and
the app answers as whichever role you sign in as — the role gate a real
deployment authorises on the server. The real-API values, if you need them, are
documented in `docs/ENVIRONMENT.md`.

### Checks (run them before you commit)

```bash
cd web
npx tsc --noEmit        # typecheck
npm run lint            # ESLint, eslint-config-next
npm run build           # static export into web/out
```

The build is `output: "export"`, so it talks to no server at build time; a build
without Supabase env values still succeeds, it just cannot sign anyone in.

## The one contract to keep

The **live U2-GAS Figma file (`v4xgWC0Q0wtSKmAff3EOzU`) is the only design
source.** There is no committed HTML snapshot of the screens and no generator.
Two rules:

1. **To change a screen, change it in Figma first.** Re-read the frame through
   the Figma MCP (the file's screens page is `MAIN SCREENS`, `256:14758`) and
   update the app to match. Never change a screen without a matching live-file
   change.
2. **A value the file draws is drawn text, typos included** (`C0PYRIGHT`,
   `INSUFFICIENT- Please redude`, curly punctuation) — match it character for
   character. Watch a leaf's `visible` flag: a node that is `visible: false` in
   Figma must not be drawn, and one the file draws must not be omitted.

## Adding a new page

1. Draw it in Figma and get the frame's node id.
2. Read the frame through the Figma MCP (file `v4xgWC0Q0wtSKmAff3EOzU`) to get
   its structure, geometry and tokens.
3. Add `app/(public)/<route>/page.tsx` — a thin server component exporting
   `metadata` and rendering the interactive piece. Any component with state,
   effects or handlers is `"use client"`.
4. Build the screen from the existing primitives and view-model shapes
   (`lib/adapters.ts`, `lib/receipts.ts`, `types/`). Bind live data through
   `lib/api.ts` + `useAsync`; do not leave a fixture from `data.ts` on screen.
5. Put a dynamic id in a query parameter (`/orders?id=…`), not the path — the
   static export cannot pre-render unknown path segments. A `useSearchParams`
   page needs a `Suspense` boundary or the build fails.
6. Gate the route with `RequireRole` if it belongs to a role. Remember the gate
   is convenience only; the Worker authorises every request.
7. Run `npx tsc --noEmit`, `npm run lint` and `npm run build`, then compare the
   running screen against the live frame.

## Fonts

The pixel face is Velvetyne's **Jgs** family (SIL OFL): `jgs7` is every
heading/label/button and the LED readouts. It is self-hosted under
`web/public/fonts/` and wired through `next/font/local` in `app/layout.tsx`.
Barlow Semi Condensed is loaded from Google Fonts via `next/font/google` for
caption strings. The upstream repo also ships at the repo root as
`jgs-main.zip`, so masters can be refreshed offline.

## Asset workflow (pictures the screens show)

Pictures the screens show at runtime come from the Worker's media pipeline
(`lib/media.ts` `mediaUrl`) or from `web/public/` (product fallbacks, icons,
avatars). A picture the *design* embeds should be exported from the live Figma
file into `web/public/` and referenced by path. Live things a route supplies at
runtime (the camera feed, uploaded product photos, avatars) must not be stamped
into a static file — the route paints them over the drawn placeholder.

## Still to do

- Remove the remaining `data.ts` fixtures from screens that should read the API
  (cashier history, admin gas/staff history, admin staff store, add-address).
- Verify the driver and cashier queue/history flows against the Worker +
  Supabase.
- Confirm the admin screens (tank, sales history, staff) against the live
  frames.
- Full typecheck, lint and static build.
- Deploy the static export to Cloudflare Pages and confirm.
