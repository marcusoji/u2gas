import { createClient, type Session } from "@supabase/supabase-js";
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Supabase Auth only. No second authentication system — the spec is explicit,
 * and two sources of truth for identity is how accounts drift apart.
 *
 * The anon key is public by design; it is useless without RLS being satisfied.
 * The service-role key never reaches this bundle.
 */
/**
 * Supabase's current key model uses `sb_publishable_...` in the browser and
 * `sb_secret_...` on the server. The legacy anon key is accepted as a fallback
 * so an existing project keeps working, but new deployments should set the
 * publishable key. (Part 5)
 *
 * Whichever is used, this key is public by design and useless without RLS
 * being satisfied. The secret key never appears in this bundle.
 */
const browserKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!browserKey) {
  throw new Error(
    "VITE_SUPABASE_PUBLISHABLE_KEY is not set. The app cannot reach Supabase.",
  );
}

// A secret key in the browser bundle is a total compromise, so refuse to start
// rather than ship one by accident.
if (/^sb_secret_|^service_role/.test(browserKey)) {
  throw new Error(
    "A Supabase SECRET key is configured in the frontend. Use the publishable key.",
  );
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  browserKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,   // magic links and verification return here
    },
  },
);

export type Role = "customer" | "staff" | "driver" | "manager" | "admin";

export interface AuthState {
  session: Session | null;
  profile: { profile_id: string; role: Role; display_name?: string } | null;
  loading: boolean;
  /** The route prefix this person belongs in. */
  home: string;
}

const AuthContext = createContext<AuthState>({
  session: null, profile: null, loading: true, home: "/",
});

const HOME: Record<Role, string> = {
  customer: "/", staff: "/staff", manager: "/staff",
  driver: "/driver", admin: "/admin",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null, profile: null, loading: true, home: "/",
  });

  useEffect(() => {
    let active = true;

    async function load(session: Session | null) {
      if (!session) {
        if (active) setState({ session: null, profile: null, loading: false, home: "/" });
        return;
      }

      // The role comes from the profile table, not the token, so revoking a
      // role takes effect immediately rather than when the JWT expires.
      const { data } = await supabase
        .from("profile")
        .select("profile_id, role, display_name")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!active) return;
      const role = (data?.role ?? "customer") as Role;
      setState({
        session,
        profile: data as AuthState["profile"],
        loading: false,
        home: HOME[role] ?? "/",
      });
    }

    supabase.auth.getSession().then(({ data }) => void load(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  return createElement(AuthContext.Provider, { value: state }, children);
}

export const useAuth = () => useContext(AuthContext);

export async function signInWithEmail(email: string, next?: string) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: buildRedirect(next) },
  });
}

export async function signInWithProvider(provider: "google" | "apple", next?: string) {
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: buildRedirect(next) },
  });
}

export async function signOut() {
  await supabase.auth.signOut();
}

/**
 * Deep links survive login, but only internal ones.
 *
 * An unvalidated `next` is an open redirect: a link to our own login page that
 * bounces the user to an attacker's site after they authenticate. Anything not
 * starting with a single slash is discarded. (Addendum 74.1)
 */
export function buildRedirect(next?: string): string {
  const origin = window.location.origin;
  if (!next) return `${origin}/auth/callback`;

  const safe = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/.test(next);
  return safe
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : `${origin}/auth/callback`;
}

export function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  return /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/.test(raw) ? raw : null;
}
