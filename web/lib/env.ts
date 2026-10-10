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

// A Supabase secret/service-role key in a NEXT_PUBLIC_ variable is compiled into
// the browser bundle and is total compromise: it bypasses RLS for anyone who
// opens devtools. Refuse to build rather than ship one. The publishable/anon key
// is the only key that belongs here. (Part 5)
if (env.supabaseKey.startsWith("sb_secret_") || /service_role/.test(env.supabaseKey)) {
  throw new Error(
    "A Supabase secret key is set as NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
      "Everything NEXT_PUBLIC_ ships to the browser. Use the publishable key " +
      "(sb_publishable_…) and keep the secret key in the Worker's secrets.",
  );
}
