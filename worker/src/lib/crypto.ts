/**
 * Crypto helpers. WebCrypto only — everything here runs on Workers.
 */

const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  const view =
    typeof input === "string" ? enc.encode(input)
    : input instanceof Uint8Array ? input
    : new Uint8Array(input);

  // Re-wrap into a view that is definitely backed by a plain ArrayBuffer.
  // A Uint8Array can be backed by a SharedArrayBuffer, which digest() rejects.
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);

  return toHex(await crypto.subtle.digest("SHA-256", buf));
}

export async function hmacSha512Hex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

/**
 * Constant-time comparison. A plain === on a signature leaks its prefix through
 * timing, which is enough to forge one given patience.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * QR tokens.
 *
 * The token is random, not derived from the order, so it carries no
 * information and cannot be guessed from an order number. Only its hash is
 * stored (spec 21) — the QR scan is validated live against the database, so
 * possession of the token alone authorises nothing.
 */
export function generateQrToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "U2" + toHex(bytes.buffer);
}

export async function qrTokenHash(token: string, signingKey: string): Promise<string> {
  // Keyed so that a leaked database of hashes cannot be brute-forced against
  // the token format offline.
  return sha256Hex(`${signingKey}:${token}`);
}

/**
 * Guest capability token.
 *
 * Handed to someone who checks out without an account. It proves one thing:
 * that the holder placed this specific order. Random, so it cannot be guessed
 * from an order number, and only its hash is stored.
 */
export function generateGuestToken(): string {
  return "g" + toHex(crypto.getRandomValues(new Uint8Array(24)).buffer);
}

export async function guestTokenHash(token: string, signingKey: string): Promise<string> {
  return sha256Hex(`guest:${signingKey}:${token}`);
}

/** Opaque, human-typable payment reference. */
export function paymentReference(orderNumber: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${orderNumber}-${toHex(bytes.buffer).toUpperCase()}`;
}

export function requestId(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(8)).buffer);
}
