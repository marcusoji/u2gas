import type { NextConfig } from "next";

/**
 * In development the Worker (`8787`) and Supabase (`54321`) run on loopback,
 * which a remote browser cannot reach. Proxying both through Next keeps the
 * app same-origin, so a tunnel to this dev server exercises the real backend.
 * A production build talks to the configured absolute origins instead and
 * these rewrites are not registered.
 */
const localApi = process.env.NEXT_PUBLIC_API_ORIGIN || "http://127.0.0.1:8787";
const localSupabase = process.env.NEXT_PUBLIC_SUPABASE_LOCAL_ORIGIN || "http://127.0.0.1:54321";

const nextConfig: NextConfig = {
  // The preview tunnel host is not localhost, so Next would block its dev
  // resource requests (HMR, RSC payloads) without this.
  allowedDevOrigins: ["work-2-tegmxfgnepeawwhc.prod-runtime.all-hands.dev"],
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      { source: "/api/:path*", destination: `${localApi}/api/:path*` },
      { source: "/supabase/:path*", destination: `${localSupabase}/:path*` },
    ];
  },
};

export default nextConfig;
