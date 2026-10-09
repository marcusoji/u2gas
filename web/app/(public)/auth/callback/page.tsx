"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, loadProfile, safeNext, HOME } from "@/lib/supabase";

/**
 * Where Supabase returns after a magic link or OAuth round trip.
 *
 * The session is already in the URL when the SDK mounts (`detectSessionInUrl`),
 * so this waits for it, reads the role from the profile row, and sends the
 * person to their own app. The deep link in `next` survives, but only if it is
 * internal — an unvalidated one is an open redirect.
 */
function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function settle() {
      const { data, error: err } = await supabase.auth.getSession();
      if (!active) return;

      if (err || !data.session) {
        setError(err?.message ?? "We couldn't complete the sign-in.");
        return;
      }

      const profile = await loadProfile(data.session);
      if (!active) return;

      const home = profile ? HOME[profile.role] : "/";
      const next = safeNext(params.get("next"));
      router.replace(next ?? home);
    }

    void settle();
    return () => {
      active = false;
    };
  }, [router, params]);

  return (
    <main className="w-full min-h-[60vh] flex flex-col items-center justify-center gap-3 px-6 text-center">
      {error ? (
        <>
          <p className="text-[13px] font-mono tracking-wider text-red-500 uppercase">
            SIGN-IN FAILED
          </p>
          <p className="text-[11px] font-mono text-[#838EF8] uppercase tracking-wide">
            {error}
          </p>
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="mt-2 px-6 py-2.5 rounded-full bg-[#1317E4] text-white text-[12px] font-mono tracking-wider uppercase"
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
