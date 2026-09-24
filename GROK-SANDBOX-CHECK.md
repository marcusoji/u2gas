# U2 GAS — Real Sandbox Verification

This project is intentionally kept as a normal Vite + React + Cloudflare Worker project. Do not replace the build system or mock the frontend for this verification.

## Frontend

```bash
cd web
npm ci
npm run check:frontend
npm run typecheck
npm run build
npm run dev -- --host 0.0.0.0
```

Vite's normal development server should then expose the frontend (normally port 5173). For production-build verification, use:

```bash
npm run preview -- --host 0.0.0.0
```

## Worker

In a second terminal:

```bash
cd worker
npm ci
npm run typecheck
npm test
```

If the environment supports Wrangler:

```bash
npm run dev
```

## What to verify

1. `npm ci` succeeds without changing either lockfile.
2. `npm run check:frontend` passes.
3. `npm run typecheck` passes.
4. `npm run build` completes successfully.
5. The real Vite application opens in a browser.
6. Check the registered application routes in the actual React runtime, not the static Figma HTML alone.
7. Capture screenshots at the Figma reference viewport (440px-wide mobile artboards where applicable).
8. Compare the rendered React screens against `u2gas-all-screens-2.html` / the Figma reference screens for spacing, typography, sizing, borders, colors, icons, imagery, and state.
9. Record console errors and failed network requests separately from visual differences.

## Important

Do not claim visual/pixel certification merely because the static Figma HTML is valid. Certification should be based on screenshots of the running React/Vite application.
