import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { mediaUrl } from "../lib/media";
import { ImagePicker } from "./ImagePicker";
import { Stamp } from "./primitives";

/**
 * The person's own picture, in one place.
 *
 * Every signed-in user owns a profile row with an `avatar_asset`, but only the
 * customer's screen ever offered a way to set it — a cashier or a driver had
 * the same avatar slot drawn on their ME page and no control to fill it (item
 * 4). The upload endpoint needs no role: anyone may change their own, and the
 * Worker writes the reference rather than trusting the client with it.
 *
 * The drawn plate draws the picture at a fixed 142x139 box, so this positions
 * itself there rather than in the document flow.
 */
export function AvatarUpload({
  basePath,
  size = 142,
  left,
  top,
  zIndex = 22,
  label = "CHANGE YOUR PICTURE",
}: {
  /** The current `avatar_asset.base_path`, if any. */
  basePath: string | null | undefined;
  size?: number;
  left: number;
  top: number;
  zIndex?: number;
  label?: string;
}) {
  const [current, setCurrent] = useState<string | null>(
    basePath ? mediaUrl(basePath, "detail") : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(blob: Blob, previewUrl: string) {
    setBusy(true);
    setError(null);
    // Show the picture the moment it is picked — the upload can be slow on
    // depot wi-fi and the person has already chosen.
    setCurrent(previewUrl);
    try {
      const r = await api.uploads.avatar(blob);
      if (r.url) setCurrent(r.url);
    } catch (e) {
      setError((e as ApiError).message);
      setCurrent(basePath ? mediaUrl(basePath, "detail") : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "absolute", left, top, width: size, height: size, zIndex }}>
      <ImagePicker
        size={size}
        shape="square"
        label={label}
        busy={busy}
        preview={current}
        onPicked={(blob, url) => void save(blob, url)}
      />
      {error && (
        <div style={{ position: "absolute", top: size + 8, left: 0, width: 220, zIndex: 30 }}>
          <Stamp>{error}</Stamp>
        </div>
      )}
    </div>
  );
}
