"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import type { AppRole } from "@/types";
import { useAuthStore } from "@/stores/authStore";
import { paths } from "@/utils/paths";

/**
 * Client-side gate for a role-owned screen.
 *
 * Path prefixes are navigation, not security — the Worker runs `requireRole`
 * and RLS enforces the same boundary again. This exists so a signed-out or
 * wrong-role visitor lands on the sign-in screen instead of an empty shell.
 */
export function RoleGuard({
  allow,
  children,
}: {
  allow: AppRole[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isReady = useAuthStore((state) => state.isReady);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const role = useAuthStore((state) => state.role);

  const permitted = isLoggedIn && role !== null && allow.includes(role);

  useEffect(() => {
    if (!isReady) return;
    if (!permitted) router.replace(paths.login);
  }, [isReady, permitted, router]);

  if (!isReady || !permitted) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center">
        <p className="text-[11px] tracking-widest text-[#838EF8] uppercase">
          CHECKING ACCESS…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
