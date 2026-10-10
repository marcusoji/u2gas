import type { NextConfig } from "next";

/**
 * The UI is a static export (`out/`) served by Cloudflare Pages, and the API is
 * a Cloudflare Worker on `api.<domain>`. Every route prerenders: there are no
 * route handlers, middleware or server-only data reads, so a Node runtime would
 * add nothing. A static export keeps Pages on a plain asset upload — no Next
 * adapter to pin and keep current — and lets the security headers ship as
 * `out/_headers`, composed by `scripts/build-headers.mjs`.
 *
 * `images.unoptimized` follows from that: the Pages asset host has no image
 * optimizer, and the runtime optimizer would be a Node server. Product and state
 * imagery is already sized for the 440px frames, and uploaded media is served
 * from Supabase Storage, so there is nothing to optimize at the edge.
 */
const localApi = process.env.NEXT_PUBLIC_API_ORIGIN || "http://127.0.0.1:8787";
const localSupabase = process.env.NEXT_PUBLIC_SUPABASE_LOCAL_ORIGIN || "http://127.0.0.1:54321";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Pages serves a directory's `index.html`; without this a deep link like
  // `/orders/verify` 404s on a cold load instead of resolving to its file.
  trailingSlash: true,
  // The preview tunnel host is not localhost, so Next would block its dev
  // resource requests (HMR, RSC payloads) without this.
  allowedDevOrigins: ["work-2-tegmxfgnepeawwhc.prod-runtime.all-hands.dev"],
  // Dev-only: the Worker (`8787`) and Supabase (`54321`) run on loopback, which
  // a remote browser cannot reach, so proxying both through Next keeps the app
  // same-origin and a tunnel exercises the real backend. The export ignores
  // these; a deployed build talks to the absolute origins in `.env.production`.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      { source: "/api/:path*", destination: `${localApi}/api/:path*` },
      { source: "/supabase/:path*", destination: `${localSupabase}/:path*` },
    ];
  },
};

export default nextConfig;
