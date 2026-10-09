/**
 * Public configuration, read once at build time.
 *
 * Every value here is compiled into the browser bundle, so none of them may be
 * secret. The Supabase *publishable* key is public by design — it is useless
 * unless row-level security is satisfied. The service-role key belongs to the
 * Worker and must never appear in this app.
 *
 * Next inlines `NEXT_PUBLIC_*` at build time and leaves a bare `process.env`
 * reference as an empty string when the variable is unset, so each read has an
 * explicit fallback rather than arriving as `undefined`.
 */

export const EMBEDDED_API = process.env.NEXT_PUBLIC_EMBEDDED_API === "true";

/** Worker origin + /api, e.g. https://api.u2gas.example/api */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

/** Worker origin with no path. Used for the CSP and media fallbacks. */
export const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN || "";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost";

const browserKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

// A secret key in the browser bundle is a total compromise. Refuse to start
// rather than ship one by accident. This is a build-time check because the
// value is inlined, so it is caught before a deploy.
if (!EMBEDDED_API && /^sb_secret_|^service_role/.test(browserKey)) {
  throw new Error(
    "A Supabase SECRET key is configured in the frontend. Use the publishable key.",
  );
}

// Deliberately not fatal when unset: a CI build without secrets must still
// produce output. The only thing that breaks is sign-in, which then fails with
// a clear network error rather than crashing on import.
export const SUPABASE_KEY = EMBEDDED_API
  ? "sb_publishable_mock"
  : browserKey || "sb_publishable_unconfigured";

export const MEDIA_BASE =
  process.env.NEXT_PUBLIC_MEDIA_BASE ||
  `${SUPABASE_URL}/storage/v1/object/public/public-media`;

/** True when the Supabase project has been configured, for a startup warning. */
export const SUPABASE_CONFIGURED = Boolean(browserKey) || EMBEDDED_API;
