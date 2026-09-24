/**
 * Image pipeline, server side (addendum 72.2–72.4).
 *
 * The browser already compressed this file. None of that is trusted here: the
 * type is read from the bytes, the dimensions are checked before decoding, and
 * every derivative is re-encoded from the decoded pixels.
 *
 * jsquash is used because it is pure WASM and runs on Workers. sharp and
 * anything else Node-native would not.
 */

import decodeJpeg from "@jsquash/jpeg/decode";
import decodePng from "@jsquash/png/decode";
import decodeWebp from "@jsquash/webp/decode";
import encodeWebp from "@jsquash/webp/encode";
import resize from "@jsquash/resize";
import { appError } from "./errors";
import { sha256Hex } from "./crypto";

interface ImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace?: string;
}


export const TIERS = [
  { name: "thumb",  edge: 96,   quality: 75 },
  { name: "grid",   edge: 320,  quality: 80 },
  { name: "detail", edge: 800,  quality: 82 },
  { name: "source", edge: 1600, quality: 85 },
] as const;

/** A client that ran the compression worker cannot legitimately exceed this. */
const MAX_UPLOAD_BYTES = 1_024 * 1_024;
const MAX_EDGE = 1600;

type Detected = "image/jpeg" | "image/png" | "image/webp";

/**
 * Read the format from the magic bytes. The Content-Type header is attacker
 * controlled and means nothing.
 */
export function detectType(bytes: Uint8Array): Detected {
  if (bytes.length < 12) throw appError("UNSUPPORTED_IMAGE");

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png";

  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (riff === "RIFF" && webp === "WEBP") return "image/webp";

  throw appError("UNSUPPORTED_IMAGE");
}

/**
 * Read dimensions from the header without decoding the pixels.
 *
 * This is the decompression-bomb guard: a 40KB PNG can declare 30000x30000 and
 * blow the isolate's memory the moment it is decoded. Checking first costs
 * nothing and makes that impossible.
 */
export function peekDimensions(bytes: Uint8Array, type: Detected): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (type === "image/png") {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (type === "image/webp") {
    const fourcc = String.fromCharCode(...bytes.slice(12, 16));
    if (fourcc === "VP8X") {
      const w = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
      const h = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
      return { width: w, height: h };
    }
    if (fourcc === "VP8L") {
      const b = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }

  // JPEG: walk the segment markers to the SOF frame header.
  let i = 2;
  while (i < bytes.length - 9) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    }
    i += 2 + view.getUint16(i + 2);
  }
  throw appError("IMAGE_DECODE_FAILED");
}

async function decode(bytes: Uint8Array, type: Detected): Promise<ImageData> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  try {
    if (type === "image/jpeg") return await decodeJpeg(buf);
    if (type === "image/png") return await decodePng(buf);
    return await decodeWebp(buf);
  } catch {
    throw appError("IMAGE_DECODE_FAILED");
  }
}

/** True if any pixel is not fully opaque — the design's cut-outs depend on it. */
function hasAlpha(img: ImageData): boolean {
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

function fit(img: ImageData, edge: number) {
  const longest = Math.max(img.width, img.height);
  if (longest <= edge) return { width: img.width, height: img.height };
  const scale = edge / longest;
  return {
    width: Math.max(1, Math.round(img.width * scale)),
    height: Math.max(1, Math.round(img.height * scale)),
  };
}

export interface Derivative {
  tier: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface ProcessedImage {
  sha256: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  derivatives: Derivative[];
}

/**
 * Validate and build the four-tier derivative set.
 *
 * Alpha is deliberately preserved rather than flattened onto white. The design
 * places product cut-outs directly on the page background with no card behind
 * them, so flattening here would put a white rectangle around every product.
 */
export async function processImage(raw: ArrayBuffer): Promise<ProcessedImage> {
  const bytes = new Uint8Array(raw);

  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw appError("FILE_TOO_LARGE", {
      bytes: bytes.byteLength, max_bytes: MAX_UPLOAD_BYTES,
    });
  }

  const type = detectType(bytes);
  const dims = peekDimensions(bytes, type);

  if (dims.width > MAX_EDGE || dims.height > MAX_EDGE || dims.width < 1 || dims.height < 1) {
    throw appError("IMAGE_DIMENSIONS", { ...dims, max_edge: MAX_EDGE });
  }

  const decoded = await decode(bytes, type);
  const alpha = hasAlpha(decoded);
  const sha256 = await sha256Hex(bytes);

  const derivatives: Derivative[] = [];
  for (const tier of TIERS) {
    const target = fit(decoded, tier.edge);

    const scaled = target.width === decoded.width && target.height === decoded.height
      ? decoded
      : await resize(decoded, { width: target.width, height: target.height });

    const encoded = await encodeWebp(scaled, {
      quality: tier.quality,
      // Lossless keeps hard cut-out edges clean at thumbnail size, where lossy
      // artefacts around an alpha boundary are very visible.
      lossless: alpha && tier.edge <= 96 ? 1 : 0,
      alpha_quality: 100,
    });

    derivatives.push({
      tier: tier.name,
      bytes: new Uint8Array(encoded),
      width: target.width,
      height: target.height,
    });
  }

  return { sha256, width: decoded.width, height: decoded.height, hasAlpha: alpha, derivatives };
}

export function storageKey(basePath: string, tier: string) {
  return `${basePath}/${tier}.webp`;
}

/** Content-addressed keys, so these can be cached forever with no busting. */
export const CACHE_CONTROL = "public, max-age=31536000, immutable";
