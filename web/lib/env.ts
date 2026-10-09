/**
 * Public runtime configuration.
 *
 * Every value here is compiled into the browser bundle, so nothing secret may
 * live in it. The Worker holds the secrets; this file only knows where the
 * Worker and Supabase are.
 *
 * Each key is read as a literal `process.env.NEXT_PUBLIC_…` member expression
 * on purpose: Next only substitutes those at build time, and a dynamic
 * `process.env[key]` lookup survives into the bundle as an undefined read.
 */

function pick(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (value && value.length > 0) return value;
  }
  return "";
}

export const env = {
  /** Worker origin + /api. Relative means same-origin, which is the deployed shape. */
  apiBase: pick(process.env.NEXT_PUBLIC_API_BASE, "/api"),
  /** Worker origin with no path. Used to build absolute media/asset URLs. */
  apiOrigin: pick(process.env.NEXT_PUBLIC_API_ORIGIN),
  supabaseUrl: pick(process.env.NEXT_PUBLIC_SUPABASE_URL),
  /**
   * Publishable (anon) key. RLS applies to every request made with it, which is
   * why it is safe in the bundle. The secret key must never appear here.
   */
  supabaseKey: pick(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  mediaBase: pick(process.env.NEXT_PUBLIC_MEDIA_BASE),
} as const;

/** True when the app has enough configuration to reach the backend at all. */
export const isConfigured = Boolean(env.supabaseUrl && env.supabaseKey);
