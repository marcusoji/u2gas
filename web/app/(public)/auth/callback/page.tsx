"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { safeNext } from "@/lib/supabase";

/**
 * Where Supabase returns after a magic link (or an OAuth round trip).
 *
 * Supabase appends the session to the redirect URL. `completeMagicLink`
 * adopts it, reads the role from the `profile` row through `/me`, and this page
 * sends the person to their own app — the same routing `RoleGuard` expects, so
 * a cashier lands on `/staff`-style access rather than the customer terminal.
 *
 * `next` carries a deep link from the sign-in screen, but only if it is an
 * internal path: an unvalidated one is an open redirect.
 */
function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const completeMagicLink = useAuthStore((state) => state.completeMagicLink);

  useEffect(() => {
    let active = true;

    async function settle() {
      try {
        await completeMagicLink();
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "SIGN-IN FAILED");
        return;
      }
      if (!active) return;

      const { isLoggedIn, home } = useAuthStore.getState();
      if (!isLoggedIn) {
        setError("THIS LINK IS INVALID OR HAS EXPIRED");
        return;
      }
      router.replace(safeNext(params.get("next")) ?? home);
    }

    void settle();
    return () => {
      active = false;
    };
  }, [router, params, completeMagicLink]);

  return (
    <main className="w-full min-h-[60vh] flex flex-col items-center justify-center gap-3 px-6 text-center">
      {error ? (
        <>
          <p className="text-[13px] font-mono tracking-wider text-[#FF0303] uppercase">
            SIGN-IN FAILED
          </p>
          <p className="text-[11px] font-mono text-[#838EF8] uppercase tracking-wide">
            {error}
          </p>
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="mt-2 px-6 py-2.5 rounded-full bg-[#1317E4] text-white text-[12px] font-mono tracking-wider uppercase cursor-pointer"
          >
            TRY AGAIN
          </button>
        </>
      ) : (
        <p className="text-[#838EF8] font-mono text-[12px] tracking-widest uppercase animate-pulse">
          SIGNING YOU IN…
        </p>
      )}
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="w-full min-h-[60vh] flex items-center justify-center">
          <span className="text-[#838EF8] font-mono text-[12px] tracking-widest uppercase animate-pulse">
            LOADING…
          </span>
        </main>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
