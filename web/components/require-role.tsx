"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { safeNext, type Role } from "@/lib/supabase";

/**
 * Front the app for one role.
 *
 * This is a *convenience*, not the security boundary: every Worker route
 * independently checks the caller's role from the profile row, so hiding a
 * screen here does not protect the data behind it. What it prevents is a
 * signed-in customer wandering into an admin screen and reading confusing
 * errors, and an unauthenticated visitor landing on a dead shell.
 *
 * Because the role comes from the profile row rather than the token, a
 * revoked role stops matching on the next load, not at JWT expiry.
 */
export function RequireRole({
  role,
  children,
  fallback = "/login",
}: {
  role: Role | Role[];
  children: ReactNode;
  fallback?: string;
}) {
  const { profile, loading, role: current } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      const here =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "";
      const next = safeNext(here);
      router.replace(`${fallback}${next ? `?next=${encodeURIComponent(next)}` : ""}`);
      return;
    }
    const allowed = Array.isArray(role) ? role : [role];
    if (!allowed.includes(current as Role)) {
      router.replace("/");
    }
  }, [profile, loading, current, role, router, fallback]);

  if (loading) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center">
        <span className="text-[#838EF8] font-mono text-[12px] tracking-widest uppercase animate-pulse">
          LOADING…
        </span>
      </div>
    );
  }

  const allowed = Array.isArray(role) ? role : [role];
  if (!profile || !allowed.includes(current as Role)) return null;

  return <>{children}</>;
}
