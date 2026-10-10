import { create } from "zustand";

import type { AppRole, Profile, UserProfile } from "@/types";
import { dummyUserProfile } from "@/data";
import { mediaUrl, setApiToken } from "@/lib/api";
import { getMe } from "@/lib/endpoints";
import {
  ensureFreshSession,
  loadSession,
  onAuthStateChange,
  signInWithPassword,
  signOut,
  signUp,
  type SignUpResult,
} from "@/lib/supabase";

interface AuthState {
  isLoggedIn: boolean;
  /** The display shape components already read. */
  user: UserProfile | null;
  /**
   * Demo sign-in used by the drawn login screen: it flips the session on
   * without a gateway round-trip. `loginWithPassword` is the real path.
   */
  login: (user?: UserProfile) => void;
  /** The full row from `/me`, including the role the Worker authorises on. */
  profile: Profile | null;
  role: AppRole | null;
  /** The role's landing route, straight from `/me`. */
  home: string;
  /** False until the persisted session has been checked once. */
  isReady: boolean;

  /** Sign in with a real Supabase account and load the profile. */
  loginWithPassword: (email: string, password: string) => Promise<void>;
  /** Register. Returns whether the address must be confirmed before signing in. */
  register: (
    email: string,
    password: string,
    meta?: { display_name?: string; phone?: string },
  ) => Promise<SignUpResult>;
  /** Restore a persisted session on first mount. Safe to call repeatedly. */
  bootstrap: () => Promise<void>;
  /** Re-read `/me` (after a profile edit, say). */
  refresh: () => Promise<void>;

  logout: () => Promise<void>;
  updateUser: (data: Partial<UserProfile>) => void;
  setUser: (user: UserProfile | null) => void;
}

/** Re-export for compatibility with components expecting fallback mock data */
export const defaultUserProfile: UserProfile = dummyUserProfile;

function toUserProfile(profile: Profile): UserProfile {
  const avatar = profile.avatar_asset?.base_path;
  return {
    email: profile.email ?? undefined,
    name: profile.display_name ?? undefined,
    firstName: profile.first_name ?? undefined,
    lastName: profile.last_name ?? undefined,
    avatar: avatar ? mediaUrl(avatar) : undefined,
  };
}

export const useAuthStore = create<AuthState>()((set, get) => {
  /** Adopt a session: put its token on the API client, then read `/me`. */
  async function adoptSession(): Promise<void> {
    const session = await ensureFreshSession();
    if (!session) {
      setApiToken(null);
      set({ isLoggedIn: false, user: null, profile: null, role: null, home: "/" });
      return;
    }
    setApiToken(session.access_token);
    try {
      const { profile, home } = await getMe();
      set({
        isLoggedIn: true,
        profile,
        role: profile.role,
        home,
        user: toUserProfile(profile),
      });
    } catch {
      // A valid token with no profile row means the account is half-provisioned;
      // treat it as signed out rather than showing a nameless shell.
      set({ isLoggedIn: false, user: null, profile: null, role: null });
    }
  }

  // Keep the API client's token in step when the session is refreshed or lost.
  onAuthStateChange((session) => {
    setApiToken(session?.access_token ?? null);
  });

  return {
    isLoggedIn: false,
    user: null,
    profile: null,
    role: null,
    home: "/",
    isReady: false,

    login: (user) => {
      const targetUser = user || dummyUserProfile;
      if (typeof document !== "undefined") {
        document.cookie = "u2gas_logged_in=true; path=/; max-age=2592000";
      }
      set({ isLoggedIn: true, user: targetUser });
    },

    loginWithPassword: async (email, password) => {
      const session = await signInWithPassword(email, password);
      setApiToken(session.access_token);
      await adoptSession();
      if (!get().isLoggedIn) throw new Error("SIGN IN FAILED");
    },

    register: async (email, password, meta) => {
      const result = await signUp(email, password, meta);
      if (result.session) {
        setApiToken(result.session.access_token);
        await adoptSession();
      }
      return result;
    },

    bootstrap: async () => {
      if (!loadSession()) {
        set({ isReady: true, isLoggedIn: false, user: null, profile: null, role: null });
        return;
      }
      await adoptSession();
      set({ isReady: true });
    },

    refresh: async () => {
      if (get().isLoggedIn) await adoptSession();
    },

    logout: async () => {
      await signOut();
      setApiToken(null);
      set({ isLoggedIn: false, user: null, profile: null, role: null, home: "/" });
    },

    updateUser: (data) => {
      set((state) => ({
        user: state.user ? { ...state.user, ...data } : { ...data },
      }));
    },

    setUser: (user) => {
      set({ user, isLoggedIn: Boolean(user) });
    },
  };
});
