# Frontend parity

## Source of truth

The uploaded frontend (`U2gas_frontend-main.zip`, also deployed at
`u2gass.vercel.app`) is the **only** UI source. There is no committed HTML
snapshot of the screens and no generator, and Figma is no longer a source.

`web/` is kept a carbon copy of the uploaded app. To match a screen, diff it
against the reference and mirror the change into `web/` verbatim — same markup,
same classes, same copy. Never restyle a screen by eye and never reintroduce a
committed HTML snapshot or a markup generator.

## Current implementation rule

- `web/` is the uploaded frontend, copied file for file. Do not add, remove or
  restructure files to "improve" it.
- Screens are the reference's own Tailwind components. Keep the tokens in
  `app/globals.css` and the reference's geometry as they are.
- The uploaded frontend is a self-contained UI demo: screens read the fixtures
  in `web/data.ts`, and there is no API, auth or Supabase client in `web/`.

## Non-negotiable constraints

- `web/` must stay a carbon copy: `diff -r` against the extracted
  `U2gas_frontend-main` must be empty.
- Do not reintroduce a Worker/Supabase client into a screen the reference
  renders from a fixture. Wiring the UI to the backend is a separate step.
- Do not replace functional controls with decorative markup.

## Verification

There is no automated parity gate. Verify by diffing `web/` against the extracted
reference zip (file set and bytes), then `npx tsc --noEmit`, `npm run lint` and
`npm run build`. To check rendering, load the app at 440px and compare it to
`u2gass.vercel.app`.
