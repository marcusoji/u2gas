"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { LoginKeypad } from "./LoginKeypad";
import { SocialAuth } from "./SocialAuth";
import EmailLoginForm from "./EmailLoginForm";
import { paths } from "@/utils/paths";
import { signInWithEmail, signInWithProvider, safeNext } from "@/lib/supabase";
import { EMBEDDED_API } from "@/lib/env";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only an internal path survives, so login cannot be turned into an open
  // redirect by a crafted `?next=`.
  const next = safeNext(params.get("next"));

  const handleTerminalKeyPress = (key: string) => {
    if (!showEmailLogin) return;
    if (key === "x" || key === "X") {
      setEmail((prev) => prev.slice(0, -1));
    } else if (key === "PAY") {
      void handleEmailSubmit();
    } else if (/^[0-9]$/.test(key)) {
      setEmail((prev) => prev + key);
    }
  };

  const handleEmailSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const finalEmail = email.trim();
    if (!finalEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(finalEmail)) {
      setError("ENTER A VALID EMAIL");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    if (EMBEDDED_API) {
      router.push(paths.home);
      return;
    }

    const { error: err } = await signInWithEmail(finalEmail, next ?? undefined);
    setIsSubmitting(false);
    if (err) {
      setError(err.message.toUpperCase());
      return;
    }
    setSent(true);
  };

  const handleQuickAuth = async (provider: "google" | "apple") => {
    setError(null);
    setIsSubmitting(true);
    if (EMBEDDED_API) {
      router.push(paths.home);
      return;
    }
    const { error: err } = await signInWithProvider(provider, next ?? undefined);
    setIsSubmitting(false);
    if (err) setError(err.message.toUpperCase());
    // On success the browser is already navigating to the provider.
  };

  return (
    <>
      <LoginKeypad onKeyPress={handleTerminalKeyPress} />

      <div className="w-full max-w-[340px] flex flex-col items-center mt-9 px-4">
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="text-[32px] sm:text-[36px] leading-[1.08] text-[#1317E4] tracking-wide uppercase text-center select-none"
        >
          MAKE GAS
          <br />
          CONVINIENT
        </motion.h1>

        {error && (
          <p
            role="alert"
            className="mt-4 text-[11px] font-mono tracking-wider text-red-500 uppercase text-center"
          >
            {error}
          </p>
        )}

        <AnimatePresence mode="wait">
          {sent ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-8 text-center flex flex-col items-center gap-2"
            >
              <p className="text-[13px] font-mono tracking-wider text-[#1317E4] uppercase">
                CHECK YOUR MAIL
              </p>
              <p className="text-[11px] font-mono text-[#838EF8] uppercase tracking-wide">
                We sent a sign-in link to {email}
              </p>
            </motion.div>
          ) : !showEmailLogin ? (
            <SocialAuth
              onOpenEmailLogin={() => setShowEmailLogin(true)}
              onQuickAuth={handleQuickAuth}
              disabled={isSubmitting}
            />
          ) : (
            <EmailLoginForm
              email={email}
              setEmail={setEmail}
              onSubmit={handleEmailSubmit}
              onBack={() => setShowEmailLogin(false)}
              isSubmitting={isSubmitting}
            />
          )}
        </AnimatePresence>

        {!showEmailLogin && !sent && (
          <div className="mt-8 text-center">
            <Link
              href={paths.home}
              className="text-[11px] tracking-wider text-[#838EF8] uppercase hover:text-[#1317E4] transition-colors inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>BACK TO TERMINAL</span>
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
