# U2 GAS — real sandbox verification

This project is a Next.js 16 frontend (`web/`, static export) over a Cloudflare
Worker (`worker/`) and Supabase (`supabase/`). Do not replace the build system,
and do not introduce a mock or fixture layer for this verification: every screen
reads the real APIs, so an unreachable backend shows the screen's own empty
state.

## Frontend

```bash
cd web
npm install
npm run lint
npx tsc --noEmit
npm run build          # static export into web/out
npm run dev            # point .env.local at the Worker for real data
```

`next dev` serves the app (port 3000 by default). For the exported files,
serve `web/out/` with any static server.

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

1. `npm install` succeeds without changing either lockfile in a way that breaks
   the build.
2. `npm run lint` and `npx tsc --noEmit` pass.
3. `npm run build` completes and writes `web/out/`.
4. The real Next.js app opens in a browser.
5. Check the application routes in the actual React runtime — there is no
   static HTML snapshot of the screens.
6. Capture screenshots at the design's reference viewport (440px-wide frames
   where applicable).
7. Compare the rendered screens against the live U2-GAS Figma file
   (`v4xgWC0Q0wtSKmAff3EOzU`), read through the Figma MCP, for spacing,
   typography, sizing, borders, colours, icons, imagery, and state.
8. Record console errors and failed network requests separately from visual
   differences.

## Important

Do not claim visual/pixel certification without comparing the running app
against the live file. The live file is the only design source; there is no
committed HTML gallery to certify against.
