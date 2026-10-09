import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { UserProfile } from "@/types";
import type { Profile } from "@/lib/types";
import { mediaUrl } from "@/lib/media";
import { signOut as supabaseSignOut } from "@/lib/supabase";

/**
 * The signed-in person, in the shape the screens were drawn against.
 *
 * Identity itself comes from Supabase Auth; this store is the *view* of it the
 * components read. `syncFromProfile` is the only writer of identity fields, so
 * there is one source of truth — the profile row — and the store cannot drift
 * from it. `updateUser` writes only the presentation fields a person edits.
 */
interface AuthState {
  isLoggedIn: boolean;
  /** True until the first session read resolves, so screens can hold still. */
  loading: boolean;
  profile: Profile | null;
  user: UserProfile | null;
  syncFromProfile: (profile: Profile | null) => void;
  logout: () => Promise<void>;
  updateUser: (data: Partial<UserProfile>) => void;
  setUser: (user: UserProfile | null) => void;
}

export function profileToUser(p: Profile): UserProfile {
  const name =
    p.display_name ||
    [p.first_name, p.last_name].filter(Boolean).join(" ") ||
    "";
  return {
    firstName: p.first_name || name.split(" ")[0] || "",
    lastName: p.last_name || name.split(" ").slice(1).join(" ") || "",
    name,
    email: p.email ?? "",
    avatar: mediaUrl(p.avatar_asset) ?? "/images/profile-avatar.png",
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      loading: true,
      profile: null,
      user: null,

      syncFromProfile: (profile) =>
        set({
          profile,
          isLoggedIn: Boolean(profile),
          loading: false,
          user: profile ? profileToUser(profile) : null,
        }),

      logout: async () => {
        if (typeof document !== "undefined") {
          document.cookie = "u2gas_logged_in=; path=/; max-age=0";
        }
        await supabaseSignOut();
        set({ isLoggedIn: false, user: null, profile: null, loading: false });
      },

      updateUser: (data) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        })),

      setUser: (user) => set({ user, isLoggedIn: Boolean(user) }),
    }),
    {
      // Only the presentation fields persist. The session and profile are read
      // from Supabase on every load, so a stale snapshot can never authenticate
      // anyone — the worst a stale entry does is avoid a flash of empty fields.
      name: "u2gas_auth_view",
      partialize: (s) => ({ user: s.user }),
    },
  ),
);
