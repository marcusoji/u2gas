import { MEDIA_BASE } from "./env";
import type { ImageRef } from "./types";

/**
 * Build the public URL for a stored image.
 *
 * The Worker stores an asset id plus its variants rather than a URL, so the
 * path is assembled here. `asset` may be a string path (already stored) or an
 * object with `base_path`. Anything falsy returns null so callers can fall
 * back to a bundled picture rather than render a broken image.
 */
export function mediaUrl(
  asset: ImageRef | string | null | undefined,
  variant = "lg",
): string | null {
  if (!asset) return null;
  const base =
    typeof asset === "string"
      ? asset
      : asset.base_path
        ? `${asset.base_path}/${variant}`
        : "";
  if (!base) return null;
  if (/^https?:\/\//.test(base)) return base;
  return `${MEDIA_BASE.replace(/\/$/, "")}/${base.replace(/^\//, "")}`;
}

/** A fallback picture for a product with no uploaded image. */
export function productFallback(name?: string | null): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("hose")) return "/shop/gas-hose.jpg";
  if (n.includes("clamp")) return "/shop/hose-clamps.jpg";
  if (n.includes("battery")) return "/shop/battery-9v.jpg";
  return "/shop/gas-cylinder.jpg";
}
