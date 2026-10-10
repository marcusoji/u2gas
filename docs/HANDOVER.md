# Handover — continue the frontend work

This is the short version for whoever picks this up next. The detailed rules
live in [`AGENTS.md`](../AGENTS.md) at the repo root; read it before changing a
screen.

## Run it locally

The frontend under `web/` was seeded from the uploaded
`U2gas_frontend-main.zip` and is wired to the Worker (`worker/`) and Supabase
(`supabase/`) backend, so a screen is checked against the live Figma file rather
than the upload.

```bash
git clone <repo> && cd u2gas
cd web && npm install
npm run dev
```

Open `http://localhost:3000/`. The Worker (`worker/`) and Supabase (`supabase/`)
are the backend and remain the system's authority; the frontend consumes them.

### Checks (run them before you commit)

```bash
cd web
npx tsc --noEmit        # typecheck
npm run lint            # ESLint, eslint-config-next
npm run build           # next build
```

## The one contract to keep

The **live Figma file (`U2-GAS`, `v4xgWC0Q0wtSKmAff3EOzU`, page `MAIN SCREENS`
`256:14758`) is the only UI source of record**, read through the Figma MCP. There
is no committed HTML snapshot and no generator, and none may be added. `web/`
keeps the uploaded frontend's markup and classes, and where the two disagree the
live file wins.

1. **To change a screen, read the live file through the Figma MCP and mirror the
   change into `web/` verbatim** — same markup, same classes, same copy. Never
   restyle a screen by eye, and never certify against a saved snapshot.
2. **A drawn value is drawn text, typos included** (`C0PYRIGHT`,
   `INSUFFICIENT- Please redude`, curly punctuation) — match it character for
   character.

## Adding a new page

1. Read the screen in the live Figma file through the Figma MCP, then build it
   into `web/` from the reference's own language, keeping the same primitives and
   copy.
2. Add `app/(public)/<route>/page.tsx` — a thin component. Anything with state,
   effects or handlers is `"use client"`.
3. Build the screen from the existing primitives; fetch through
   `hooks/useApiData.ts` and the typed `lib/endpoints.ts` wrappers rather than
   reaching for a fixture.
4. Run `npx tsc --noEmit`, `npm run lint` and `npm run build`, then load the
   route at 440px and compare it to the live Figma frame.

## Fonts

The pixel face is Velvetyne's **Jgs** family (SIL OFL): `jgs7` is every
heading/label/button and the LED readouts. It is self-hosted under
`web/public/fonts/` and wired through `next/font/local` in `app/layout.tsx`.
Barlow Semi Condensed is loaded from Google Fonts via `next/font/google` for
caption strings. The face is refreshed with `scripts/fetch-fonts.sh`, which
pulls the upstream Jgs webfont (or subsets a local `JGS_SRC` master) into
`web/public/fonts/`.

## Asset workflow (pictures the screens show)

Pictures are the uploaded frontend's own files under `web/public/` (`images/`,
`icons/`, `shop/`). Keep them as they ship; the live Figma file is the reference
for any picture you add or replace.

## Still to do

- Confirm the screens against the live Figma file (`U2-GAS`,
  `v4xgWC0Q0wtSKmAff3EOzU`, `256:14758`) through the Figma MCP.
- Full typecheck, lint and build.
- Deploy and confirm.
