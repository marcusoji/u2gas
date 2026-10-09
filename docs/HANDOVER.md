# Handover — continue the frontend work

This is the short version for whoever picks this up next. The detailed rules
live in [`AGENTS.md`](../AGENTS.md) at the repo root; read it before changing a
screen.

## Run it locally

The frontend under `web/` is a carbon copy of the uploaded
`U2gas_frontend-main.zip` and is a self-contained UI demo: it renders the
`data.ts` fixtures and reads no API, so every screen is reachable with no Worker
and no sign-in.

```bash
git clone <repo> && cd u2gas
cd web && npm install
npm run dev
```

Open `http://localhost:3000/`. The Worker (`worker/`) and Supabase (`supabase/`)
are the backend and remain in the repo, but nothing in the copied frontend calls
them yet.

### Checks (run them before you commit)

```bash
cd web
npx tsc --noEmit        # typecheck
npm run lint            # ESLint, eslint-config-next
npm run build           # next build
```

## The one contract to keep

The **uploaded frontend (`U2gas_frontend-main.zip`, also deployed at
`u2gass.vercel.app`) is the only UI source of record.** `web/` must stay a
carbon copy of it: `diff -r` against the extracted reference must be empty.

1. **To change a screen, diff it against the reference and mirror the change
   into `web/` verbatim** — same markup, same classes, same copy. Never restyle
   a screen by eye.
2. **A drawn value is drawn text, typos included** (`C0PYRIGHT`,
   `INSUFFICIENT- Please redude`, curly punctuation) — match it character for
   character.

## Adding a new page

1. Add the page to the reference, then copy it into `web/` (or, if it is a new
   screen built from the reference's own language, keep the same primitives and
   copy).
2. Add `app/(public)/<route>/page.tsx` — a thin component. Anything with state,
   effects or handlers is `"use client"`.
3. Build the screen from the existing primitives and the `data.ts` fixtures.
   There is no API client, auth or Supabase layer in the copied frontend.
4. Run `npx tsc --noEmit`, `npm run lint` and `npm run build`, then load the
   route at 440px and compare it to `u2gass.vercel.app`.

## Fonts

The pixel face is Velvetyne's **Jgs** family (SIL OFL): `jgs7` is every
heading/label/button and the LED readouts. It is self-hosted under
`web/public/fonts/` and wired through `next/font/local` in `app/layout.tsx`.
Barlow Semi Condensed is loaded from Google Fonts via `next/font/google` for
caption strings. The face is refreshed with `scripts/fetch-fonts.sh`, which
pulls the upstream Jgs webfont (or subsets a local `JGS_SRC` master) into
`web/public/fonts/`.

## Asset workflow (pictures the screens show)

Pictures are the reference's own files under `web/public/` (`images/`, `icons/`,
`shop/`). Keep them as the reference ships them.

## Still to do

- Wire the UI to the Worker + Supabase. This is a deliberate, separate step —
  the copied frontend is a fixture-only demo today.
- Full typecheck, lint and build.
- Deploy and confirm.
