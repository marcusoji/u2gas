/**
 * Client-side image compression (addendum 72.1).
 *
 * Runs in a Web Worker so a three-slot bundle upload doesn't freeze the form
 * while three phone photos are resized. The server re-validates and re-encodes
 * everything anyway — this pass exists to make the upload small and fast, not
 * to be trusted.
 *
 * Message in:  { id, file }
 * Message out: { id, ok: true, blob, width, height, bytes } | { id, ok: false, code }
 */

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const TARGET_BYTES = 400 * 1024;
const MAX_EDGE = 1600;
const FLOOR_EDGE = 1200;
const START_QUALITY = 0.82;
const FLOOR_QUALITY = 0.60;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

self.onmessage = async (e: MessageEvent) => {
  const { id, file } = e.data as { id: string; file: File };

  try {
    if (!ACCEPTED.includes(file.type)) {
      return reply(id, false, "UNSUPPORTED_IMAGE");
    }
    if (file.size > MAX_INPUT_BYTES) {
      return reply(id, false, "FILE_TOO_LARGE");
    }

    // createImageBitmap applies the EXIF orientation tag for us and drops the
    // rest of the metadata, which is both the rotation fix and the privacy
    // strip in one step. Reading the tag by hand is how photos end up sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    let edge = MAX_EDGE;
    let quality = START_QUALITY;
    let blob = await encode(bitmap, edge, quality);

    // Step the quality down, then the size, until it fits. Quality first
    // because a smaller picture is more noticeable than a slightly softer one.
    while (blob.size > TARGET_BYTES && quality > FLOOR_QUALITY) {
      quality = Math.round((quality - 0.05) * 100) / 100;
      blob = await encode(bitmap, edge, quality);
    }
    if (blob.size > TARGET_BYTES) {
      edge = FLOOR_EDGE;
      blob = await encode(bitmap, edge, quality);
    }

    const { width, height } = fit(bitmap, edge);
    bitmap.close();

    (self as any).postMessage(
      { id, ok: true, blob, width, height, bytes: blob.size },
    );
  } catch {
    reply(id, false, "IMAGE_DECODE_FAILED");
  }
};

function fit(bitmap: ImageBitmap, edge: number) {
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= edge) return { width: bitmap.width, height: bitmap.height };
  const scale = edge / longest;
  return {
    width: Math.max(1, Math.round(bitmap.width * scale)),
    height: Math.max(1, Math.round(bitmap.height * scale)),
  };
}

async function encode(bitmap: ImageBitmap, edge: number, quality: number): Promise<Blob> {
  const { width, height } = fit(bitmap, edge);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: true })!;

  // Deliberately not filling the canvas first. The design shows products as
  // cut-outs directly on the page background, so flattening onto white here
  // would put a white box behind every item in the shop grid.
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);

  try {
    return await canvas.convertToBlob({ type: "image/webp", quality });
  } catch {
    // Safari below 16 has no WebP encoder here. PNG keeps the alpha that JPEG
    // would throw away, and the server re-encodes to WebP regardless.
    return await canvas.convertToBlob({ type: "image/png" });
  }
}

function reply(id: string, ok: boolean, code: string) {
  (self as any).postMessage({ id, ok, code });
}

export {};
