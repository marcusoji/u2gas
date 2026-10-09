"use client";

import { useEffect } from "react";

import { useAuthStore } from "@/stores/authStore";

/**
 * Restores the persisted session once on mount and keeps the API client's
 * bearer token in step with it.
 *
 * Mounted in the root layout so a deep link to a protected screen resolves the
 * session before the screen decides what to render.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return <>{children}</>;
}
