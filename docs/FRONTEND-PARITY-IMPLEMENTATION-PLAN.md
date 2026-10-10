# Frontend parity

## Source of truth

The live Figma file is the only design source (`U2-GAS`, `v4xgWC0Q0wtSKmAff3EOzU`,
page `MAIN SCREENS` `256:14758`), read through the Figma MCP. There is no
committed HTML snapshot of the screens and no generator, and none may be added.

`web/` was seeded from the uploaded frontend (`U2gas_frontend-main.zip`, also
deployed at `u2gass.vercel.app`) and keeps its markup and classes. To match a
screen, read the live file and mirror the change into `web/` verbatim — same
markup, same classes, same copy. Never restyle a screen by eye, and never
certify against a saved snapshot.

## Current implementation rule

- `web/` keeps the uploaded frontend's files and structure. Do not add, remove or
  restructure files to "improve" it.
- Screens are the reference's own Tailwind components. Keep the tokens in
  `app/globals.css` and the reference's geometry as they are.
- The demo fixtures in `web/data.ts` remain as the offline fallback; live data
  arrives through `lib/endpoints.ts` and `hooks/useApiData.ts`.

## Non-negotiable constraints

- The live Figma file is the design `web/` is checked against; there is no
  snapshot to diff against instead.
- Do not reintroduce a committed HTML snapshot or a markup generator.
- Do not replace functional controls with decorative markup.

## Verification

There is no automated parity gate. Verify by reading the live file through the
Figma MCP, then `npx tsc --noEmit`, `npm run lint` and `npm run build`. To check
rendering, load the app at 440px and compare it to the live Figma frame.
