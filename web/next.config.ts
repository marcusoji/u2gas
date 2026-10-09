import type { NextConfig } from "next";

/**
 * Static export.
 *
 * Every route is client-rendered and talks to the Worker for data, so there is
 * nothing to render on a server. `output: "export"` emits plain files, which
 * Cloudflare Pages serves directly — no adapter, no edge runtime, and none of
 * the Next-16-on-Workers incompatibilities the newer SSR adapters still carry.
 * `trailingSlash` makes each directory resolve to its own index.html, which is
 * what Pages' routing expects for nested paths.
 *
 * The consequence is that dynamic segments cannot exist: a page whose id comes
 * from the path cannot be pre-rendered without knowing every id up front. Ids
 * therefore travel as query parameters (`/orders?id=…`), read with
 * `useSearchParams` on the client.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  // Next 16 otherwise writes its own AGENTS.md/CLAUDE.md into the project root,
  // which would shadow the repository's real AGENTS.md — the file this project
  // treats as its memory. The generated files are noise here.
  agentRules: false,
  images: {
    // The static exporter cannot run Next's image optimizer, so pictures are
    // served as-is. They are already sized by the Worker's upload pipeline.
    unoptimized: true,
  },
};

export default nextConfig;
