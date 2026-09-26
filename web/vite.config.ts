import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

/**
 * The four apps are separate chunks (addendum 74.1). A customer must never
 * download the admin bundle — it is dead weight against the 160KB initial-JS
 * budget and it hands an attacker a map of the admin surface for free.
 *
 * The split is enforced here and asserted in the Lighthouse CI run.
 */
export default defineConfig({
  plugins: [
    react(),
    visualizer({ filename: "dist/stats.html", gzipSize: true }),
  ],
  build: {
    target: "es2020",
    cssCodeSplit: true,
    // Part 37: no public source maps. Shipping them hands an attacker the
    // full readable frontend, including every route and API shape. Use
    // "hidden" if you wire up an error reporter that uploads them privately.
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react")) return "vendor-react";
            if (id.includes("supabase")) return "vendor-supabase";
            // The QR scanner is ~300KB of WASM. It loads only when a staff or
            // driver actually opens the scanner, never on first paint.
            if (id.includes("zxing")) return "vendor-scanner";
            if (id.includes("qrcode")) return "vendor-qrcode";
            return "vendor";
          }
          if (id.includes("/routes/admin/"))  return "app-admin";
          if (id.includes("/routes/staff/"))  return "app-staff";
          if (id.includes("/routes/driver/")) return "app-driver";
          // Shared code gets its own chunk. Left unassigned, Rollup swept
          // primitives/lib/figma into whichever role chunk it built first —
          // `app-staff` — which then made the entry import that chunk and put
          // it in the preload set, so a customer downloaded the staff bundle
          // on first paint. Naming the chunk keeps the role bundles lazy.
          if (
            id.includes("/components/") || id.includes("/lib/") ||
            id.includes("/mocks/") || id.includes("/figma/") ||
            id.includes("/styles/")
          ) return "app-shared";
          return undefined;
        },
      },
    },
    // Fails the build rather than quietly shipping a regression.
    chunkSizeWarningLimit: 180,
  },
  server: {
    port: 5173,
    // Hosts the dev server is allowed to answer for. The tunnel hostname is
    // for local preview; it has no effect on a build.
    allowedHosts: [
      ".prod-runtime.all-hands.dev",
      "localhost",
    ],
  },
});
