"use client";

import { useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useAuthStore } from "@/stores/authStore";

/**
 * Bridges the Supabase session into the Zustand view store the components read.
 *
 * The context is the source of identity; the store is the shape the screens
 * were drawn against. They are kept in step in one place so no screen has to
 * know about both.
 */
function StoreSync({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  const syncFromProfile = useAuthStore((s) => s.syncFromProfile);

  useEffect(() => {
    if (!loading) syncFromProfile(profile);
  }, [profile, loading, syncFromProfile]);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <StoreSync>{children}</StoreSync>
    </AuthProvider>
  );
}
