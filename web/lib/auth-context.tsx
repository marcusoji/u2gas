"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  supabase,
  loadProfile,
  HOME,
  type Role,
  type Profile,
} from "./supabase";
import { EMBEDDED_API } from "./env";

export interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** The route prefix this person belongs in. */
  home: string;
  role: Role | null;
}

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  home: "/login",
  role: null,
});

/**
 * How long to wait for the first session read before giving up on it.
 *
 * `getSession()` talks to Supabase, and on a flaky network the request can
 * stall without ever settling. `RequireRole` holds the screen while `loading`
 * is true, so a read that never resolves would leave a protected screen on
 * "LOADING…" forever instead of bouncing to sign-in. The guard makes the
 * failure mode a normal signed-out state — the safe direction, since the
 * Worker still checks the token on every call.
 */
const SESSION_READ_TIMEOUT_MS = 10_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  // The preview build contacts no API. Calling Supabase would stall on a host
  // that does not exist until the timeout fires, so every role screen sat on
  // "LOADING…" for ten seconds before bouncing to sign-in. Seed the state as
  // already-signed-out instead; the role screens then redirect at once.
  const [state, setState] = useState<AuthState>(() =>
    EMBEDDED_API
      ? { session: null, profile: null, loading: false, home: "/login", role: null }
      : { session: null, profile: null, loading: true, home: "/login", role: null },
  );

  useEffect(() => {
    if (EMBEDDED_API) return;
    let active = true;

    async function load(session: Session | null) {
      const profile = await loadProfile(session);
      if (!active) return;
      const role = (profile?.role ?? null) as Role | null;
      setState({
        session,
        profile,
        loading: false,
        home: role ? HOME[role] : "/login",
        role,
      });
    }

    // Settle `loading` even if the session read stalls. The guard is cleared as
    // soon as the read resolves, so a fast path is not delayed by the timer.
    const guard = setTimeout(() => {
      if (!active) return;
      setState((prev) => (prev.loading ? { ...prev, loading: false } : prev));
    }, SESSION_READ_TIMEOUT_MS);

    supabase.auth
      .getSession()
      .then(({ data }) => load(data.session))
      .catch(() => load(null))
      .finally(() => clearTimeout(guard));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session);
    });

    return () => {
      active = false;
      clearTimeout(guard);
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
