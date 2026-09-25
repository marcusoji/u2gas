import { MOCKS_ENABLED } from "../mocks/gate";

/**
 * Where pictures are served from.
 *
 * In production this is the storage bucket in `VITE_MEDIA_BASE`. The demo has
 * its own art under `public/mock-media`, but nothing set that variable, so every
 * url interpolated the literal string "undefined" — every product tile, avatar
 * and bundle preview in the demo was a broken image while the markup and the
 * layout stayed perfect, which is exactly the kind of fault a structural check
 * cannot see. Demo mode therefore uses the local tree, and the env var is only
 * consulted when it is actually set.
 */
const DEMO_MEDIA_BASE = "/mock-media";

export function mediaBase(): string {
  const configured = import.meta.env.VITE_MEDIA_BASE;
  if (configured) return configured.replace(/\/$/, "");
  return MOCKS_ENABLED ? DEMO_MEDIA_BASE : "";
}

/** A picture url for one asset, or "" when the record has no image. */
export function mediaUrl(
  basePath: string | null | undefined,
  tier: "thumb" | "grid" | "detail",
): string {
  if (!basePath) return "";
  const base = mediaBase();
  return base ? `${base}/${basePath}/${tier}.webp` : "";
}
