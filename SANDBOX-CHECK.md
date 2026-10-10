# U2 GAS — real sandbox verification

This project is a Next.js 16 frontend (`web/`) over a Cloudflare Worker
(`worker/`) and Supabase (`supabase/`). Do not replace the build system.

**The live Figma file is the only design source of truth** (`U2-GAS`,
`v4xgWC0Q0wtSKmAff3EOzU`, page `MAIN SCREENS` `256:14758`), read through the
Figma MCP. There is no committed HTML snapshot and no markup generator, and none
may be added. The frontend under `web/` was seeded from the uploaded
`U2gas_frontend-main.zip` and is now wired to the Worker; where a screen and the
upload disagree, the live Figma file is what the screen is checked against.

## Frontend

```bash
cd web
npm install
npm run lint
npx tsc --noEmit
npm run build
npm run dev
```

`next dev` serves the app on port 3000.

## Worker

In a second terminal:

```bash
cd worker
npm install
npm run typecheck
npm test
```

If the environment supports Wrangler:

```bash
npm run dev
```

## What to verify

1. `npm install` succeeds and leaves the lockfile as the uploaded frontend ships
   it.
2. `npm run lint` and `npx tsc --noEmit` pass.
3. `npm run build` completes.
4. The app opens in a browser.
5. Check the application routes in the actual React runtime — there is no
   static HTML snapshot of the screens.
6. Capture screenshots at the reference viewport (440px-wide frames where
   applicable) and compare them to `u2gass.vercel.app`.
7. Record console errors and failed network requests separately from visual
   differences.

## Important

Do not claim visual parity without checking `web/` against the live Figma file
(`U2-GAS`, `v4xgWC0Q0wtSKmAff3EOzU`, page `MAIN SCREENS` `256:14758`) through
the Figma MCP. The live Figma file is the only UI source; there is no committed
HTML gallery and no snapshot to certify against.
