# U2 GAS — runtime check

This package is configured for StackBlitz WebContainers so the frontend can be
run with a real Node/npm environment.

## Fastest check

1. Open StackBlitz in Chrome/Chromium.
2. Upload/import this entire project folder.
3. Let the project boot.
4. The `.stackblitzrc` automatically runs:

   `cd web && npm install && npm run dev -- -p 3000`

5. Open the Next.js preview.

## Manual fallback

```bash
cd web
npm install
npx tsc --noEmit
npm run lint
npm run build        # static export into web/out
npm run dev -- -p 3000
```

The build is a static export (`output: "export"`), so `web/out/` is plain files
Cloudflare Pages serves directly.

## Design source

The live U2-GAS Figma file (`v4xgWC0Q0wtSKmAff3EOzU`) is the only design source.
Do not certify visual parity from any saved HTML snapshot — read the live file
through the Figma MCP and compare the running app against it.
