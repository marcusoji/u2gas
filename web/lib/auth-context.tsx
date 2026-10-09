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
import { supabase, loadProfile, HOME, type Role, type Profile } from "./supabase";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    loading: true,
    home: "/login",
    role: null,
  });

  useEffect(() => {
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

    supabase.auth.getSession().then(({ data }) => void load(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
