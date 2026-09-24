# U2 GAS — real Vite runtime check

This package is configured for StackBlitz WebContainers so the frontend can be run with a real Node/npm environment.

## Fastest check

1. Open StackBlitz in Chrome/Chromium.
2. Upload/import this entire project folder.
3. Let the project boot.
4. The `.stackblitzrc` automatically runs:

   `cd web && npm ci && npm run dev -- --host 0.0.0.0`

5. Open the Vite preview.

## Manual fallback

```bash
cd web
npm ci
npm run check:frontend
npm run typecheck
npm run build
npm run dev -- --host 0.0.0.0
```

Do not certify visual parity from the static Figma HTML alone. The certification must use the running React/Vite preview.
