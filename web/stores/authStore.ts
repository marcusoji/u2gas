import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { UserProfile } from "@/types";
import { dummyUserProfile } from "@/data";

interface AuthState {
  isLoggedIn: boolean;
  user: UserProfile | null;
  login: (user?: UserProfile) => void;
  logout: () => void;
  updateUser: (data: Partial<UserProfile>) => void;
  setUser: (user: UserProfile | null) => void;
}

/** Re-export for compatibility with components expecting fallback mock data */
export const defaultUserProfile: UserProfile = dummyUserProfile;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      user: null,

      login: (user) => {
        const targetUser = user || dummyUserProfile;
        if (typeof document !== "undefined") {
          document.cookie = "u2gas_logged_in=true; path=/; max-age=2592000";
        }
        set({ isLoggedIn: true, user: targetUser });
      },

      logout: () => {
        if (typeof document !== "undefined") {
          document.cookie = "u2gas_logged_in=; path=/; max-age=0";
        }
        if (typeof window !== "undefined") {
          localStorage.removeItem("u2gas_logged_in");
          localStorage.removeItem("u2gas_user");
        }
        set({ isLoggedIn: false, user: null });
      },

      updateUser: (data) => {
        set((state) => ({
          user: state.user
            ? { ...state.user, ...data }
            : { ...dummyUserProfile, ...data },
        }));
      },

      setUser: (user) => {
        set({ user, isLoggedIn: Boolean(user) });
      },
    }),
    {
      name: "u2gas_auth_store",
    },
  ),
);
