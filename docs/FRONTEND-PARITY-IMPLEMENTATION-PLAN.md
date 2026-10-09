# Frontend Figma parity

## Source of truth

The live U2-GAS Figma file (`v4xgWC0Q0wtSKmAff3EOzU`) is the **only** design
source. There is no committed HTML snapshot of the screens and no generator. Its
screens live on the page `MAIN SCREENS` (`256:14758`); the other page,
`workshop`, is scratch.

To match a screen, read its frame through the Figma MCP and rebuild it in the
Next.js app (`web/`). Never change a screen without a matching change in the
file, and never reintroduce a committed HTML snapshot or a markup generator —
the live file is the only design source.

## Current implementation rule

- A route is a thin `app/(public)/…/page.tsx` server component over a
  `"use client"` view component in `web/components/`.
- Screens are built from Tailwind components using the tokens in
  `docs/DESIGN-SYSTEM.md`; the design's geometry (440px frames, the pixel face,
  the terminal chrome) is reproduced, not approximated with a second stylesheet.
- Live records are rendered with React row templates derived from the drawn
  measurements. A drawn sample string must never be treated as a variable-length
  list.
- Data comes from `lib/api.ts` (Worker) and Supabase through `lib/adapters.ts` /
  `lib/receipts.ts`. A fixture left on a screen is unfinished wiring.

## Non-negotiable constraints

- Preserve API calls, authentication, authorization, reservation/hold logic,
  payment verification, QR logic and server-side security.
- Do not replace functional controls with decorative markup.
- Do not approximate the file's geometry with new CSS when the frame gives an
  exact measurement.
- Do not claim parity until the route has rendered the corresponding frame and
  its dynamic data has been exercised against the API.

## Verification

There is no automated parity gate. Verify by reading the live frame through the
Figma MCP and comparing the running app against it: structure, geometry and
computed tokens (font, colour, weight, tracking, radius, opacity, transform),
plus each leaf's `visible` flag. Compare element boxes, not full-page
screenshots. Then `npx tsc --noEmit`, `npm run lint` and `npm run build`.
