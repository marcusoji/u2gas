/**
 * Supabase access-token verification (Part 4).
 *
 * Supabase projects now sign with asymmetric keys (ES256/RS256) published at a
 * JWKS endpoint, and are migrating away from the shared HS256 secret. The old
 * implementation here understood HS256 only, so it would reject every token
 * from a project using the current signing model.
 *
 * This verifies against JWKS first and falls back to the legacy secret only if
 * one is configured. Both paths validate issuer, audience, expiry and
 * algorithm — a token is never trusted merely because it decoded.
 */

import type { Env } from "../types";
import { appError } from "./errors";

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  [k: string]: unknown;
}

interface CachedKeys {
  keys: Jwk[];
  fetchedAt: number;
}

/** Per-isolate cache. Refetched on a miss, so key rotation self-heals. */
let jwksCache: CachedKeys | null = null;
const JWKS_TTL_MS = 10 * 60_000;
const JWKS_MIN_REFETCH_MS = 30_000;
let lastFetchAttempt = 0;

const ALLOWED_ALGS = new Set(["ES256", "RS256", "HS256"]);

export interface Claims {
  sub: string;
  email?: string;
  role?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  iat?: number;
}

/**
 * A Uint8Array can be backed by a SharedArrayBuffer, which WebCrypto rejects.
 * Copying into a plain ArrayBuffer makes the type unambiguous and the call
 * safe regardless of where the view came from.
 */
function toBuffer(view: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodeSegment(segment: string): any {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)));
}

async function fetchJwks(env: Env): Promise<Jwk[]> {
  const now = Date.now();

  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  // Do not hammer the endpoint when it is down, or a burst of unauthenticated
  // traffic turns into a burst of outbound requests.
  if (now - lastFetchAttempt < JWKS_MIN_REFETCH_MS && jwksCache) {
    return jwksCache.keys;
  }
  lastFetchAttempt = now;

  // cf is a Workers-only init field; DOM's RequestInit does not declare it.
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`, {
    cf: { cacheTtl: 600, cacheEverything: true },
  } as RequestInit);

  if (!res.ok) {
    // Fail safely: keep serving with the keys we already have rather than
    // locking every user out because one fetch failed.
    if (jwksCache) return jwksCache.keys;
    throw appError("UNAUTHENTICATED");
  }

  const body = await res.json() as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

function algorithmFor(jwk: Jwk): { name: string; namedCurve?: string; hash?: string } {
  if (jwk.kty === "EC") return { name: "ECDSA", namedCurve: "P-256" };
  if (jwk.kty === "RSA") return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  throw appError("UNAUTHENTICATED");
}

async function verifyAsymmetric(
  env: Env, headerB64: string, payloadB64: string, sigB64: string, kid: string, alg: string,
): Promise<boolean> {
  let keys = await fetchJwks(env);
  let jwk = keys.find((k) => k.kid === kid);

  // A kid we have not seen usually means rotation. Force one refetch.
  if (!jwk) {
    jwksCache = null;
    lastFetchAttempt = 0;
    keys = await fetchJwks(env);
    jwk = keys.find((k) => k.kid === kid);
  }
  if (!jwk) return false;

  const params = algorithmFor(jwk);
  const key = await crypto.subtle.importKey(
    "jwk", jwk as JsonWebKey, params as any, false, ["verify"],
  );

  const verifyParams = alg === "ES256"
    ? { name: "ECDSA", hash: "SHA-256" }
    : { name: "RSASSA-PKCS1-v1_5" };

  return crypto.subtle.verify(
    verifyParams as any,
    key,
    toBuffer(b64urlToBytes(sigB64)),
    toBuffer(new TextEncoder().encode(`${headerB64}.${payloadB64}`)),
  );
}

async function verifySymmetric(
  secret: string, headerB64: string, payloadB64: string, sigB64: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw", toBuffer(new TextEncoder().encode(secret)),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC", key, toBuffer(b64urlToBytes(sigB64)),
    toBuffer(new TextEncoder().encode(`${headerB64}.${payloadB64}`)),
  );
}

/**
 * Verify and return the claims. Throws on anything suspect.
 *
 * Checks, in order: structure, algorithm allow-list, signature, issuer,
 * audience, expiry, subject. Skipping any one of these is how a forged token
 * gets in.
 */
export async function verifyAccessToken(token: string, env: Env): Promise<Claims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw appError("UNAUTHENTICATED");

  const [headerB64, payloadB64, sigB64] = parts;

  let header: { alg?: string; kid?: string };
  let claims: Claims;
  try {
    header = decodeSegment(headerB64);
    claims = decodeSegment(payloadB64);
  } catch {
    throw appError("UNAUTHENTICATED");
  }

  const alg = header.alg ?? "";
  // "none" and unexpected algorithms are rejected before any key work.
  if (!ALLOWED_ALGS.has(alg)) throw appError("UNAUTHENTICATED");

  let ok = false;

  if (alg === "HS256") {
    // Legacy projects only. Absent the secret, an HS256 token is not accepted
    // — it must not silently fall through to "valid".
    if (!env.SUPABASE_JWT_SECRET) throw appError("UNAUTHENTICATED");
    ok = await verifySymmetric(env.SUPABASE_JWT_SECRET, headerB64, payloadB64, sigB64);
  } else {
    if (!header.kid) throw appError("UNAUTHENTICATED");
    ok = await verifyAsymmetric(env, headerB64, payloadB64, sigB64, header.kid, alg);
  }

  if (!ok) throw appError("UNAUTHENTICATED");

  const expectedIssuer = `${env.SUPABASE_URL}/auth/v1`;
  if (claims.iss && claims.iss !== expectedIssuer) throw appError("UNAUTHENTICATED");

  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.aud && !aud.includes("authenticated")) throw appError("UNAUTHENTICATED");

  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) {
    throw appError("UNAUTHENTICATED");
  }

  // A little leeway for clock skew, but not much.
  if (typeof claims.iat === "number" && claims.iat * 1000 > Date.now() + 60_000) {
    throw appError("UNAUTHENTICATED");
  }

  if (!claims.sub) throw appError("UNAUTHENTICATED");

  return claims;
}
