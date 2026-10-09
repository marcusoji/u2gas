import { createClient, type Session } from "@supabase/supabase-js";
import { EMBEDDED_API, SUPABASE_KEY, SUPABASE_URL } from "./env";

/**
 * Supabase Auth only. No second authentication system — the spec is explicit,
 * and two sources of truth for identity is how accounts drift apart.
 *
 * The publishable key is public by design; it is useless unless row-level
 * security is satisfied. The secret key never reaches this bundle.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // magic links and verification return here
  },
});

export type Role = "customer" | "staff" | "driver" | "admin";

/** The route prefix each role belongs in. */
export const HOME: Record<Role, string> = {
  customer: "/",
  staff: "/cashier",
  driver: "/driver",
  admin: "/admin",
};

export type { Profile } from "./types";

/**
 * The role comes from the profile table, not the token, so revoking a role
 * takes effect immediately rather than when the JWT expires.
 */
export async function loadProfile(
  session: Session | null,
): Promise<import("./types").Profile | null> {
  if (!session) return null;
  const { data } = await supabase
    .from("profile")
    .select(
      "profile_id, role, display_name, first_name, last_name, email, phone, email_verified_at, avatar_asset ( base_path )",
    )
    .eq("auth_user_id", session.user.id)
    .maybeSingle();
  return (data as import("./types").Profile | null) ?? null;
}

export async function getAccessToken(): Promise<string | null> {
  if (EMBEDDED_API) return "mock-token";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Deep links survive login, but only internal ones.
 *
 * An unvalidated `next` is an open redirect: a link to our own login page that
 * bounces the user to an attacker's site after they authenticate. Anything not
 * starting with a single slash, followed by something other than another slash
 * or a backslash, is discarded.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Reject protocol-relative ("//evil"), scheme ("javascript:"), and Windows
  // separators ("/\evil"), which browsers treat as slashes.
  return /^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/.test(raw) ? raw : null;
}

export function buildRedirect(next?: string | null): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const target = safeNext(next);
  return target
    ? `${origin}/auth/callback?next=${encodeURIComponent(target)}`
    : `${origin}/auth/callback`;
}

export async function signInWithEmail(email: string, next?: string) {
  if (EMBEDDED_API) return { data: {}, error: null };
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: buildRedirect(next) },
  });
}

export async function signInWithProvider(
  provider: "google" | "apple",
  next?: string,
) {
  if (EMBEDDED_API) return { data: {}, error: null };
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: buildRedirect(next) },
  });
}

export async function signOut() {
  if (EMBEDDED_API) return;
  await supabase.auth.signOut();
}
