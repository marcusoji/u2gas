import { EMBEDDED_API } from "../mocks/gate";

/**
 * Where pictures are served from.
 *
 * In production this is the storage bucket in `VITE_MEDIA_BASE`. The local
 * its own art under `public/mock-media`, but nothing set that variable, so every
 * url interpolated the literal string "undefined" — every product tile, avatar
 * and bundle preview was a broken image while the markup and the layout
 * stayed perfect, which is exactly the kind of fault a structural check cannot
 * see. The embedded build therefore uses the local tree, and the env var is
 * only consulted when it is actually set.
 */
const PREVIEW_MEDIA_BASE = "/mock-media";

export function mediaBase(): string {
  // The embedded build owns the media base outright. The shipped `.env` sets
  // VITE_MEDIA_BASE to a placeholder Supabase host, so honouring it here made
  // every product tile, avatar and bundle preview a DNS failure while the
  // markup and layout stayed perfect — invisible to a structural check, but a
  // broken picture to anyone looking at the screen.
  if (EMBEDDED_API) return PREVIEW_MEDIA_BASE;
  const configured = import.meta.env.VITE_MEDIA_BASE;
  if (configured) return configured.replace(/\/$/, "");
  return "";
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
