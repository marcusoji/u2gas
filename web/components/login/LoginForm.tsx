"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/stores/authStore";
import { ArrowLeft } from "lucide-react";
import { LoginKeypad } from "./LoginKeypad";
import { SocialAuth } from "./SocialAuth";
import EmailLoginForm from "./EmailLoginForm";
import { paths } from "@/utils/paths";

export default function LoginForm() {
  const router = useRouter();
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);
  const login = useAuthStore((state) => state.login);
  const requestMagicLink = useAuthStore((state) => state.requestMagicLink);
  const isConfigured = useAuthStore((state) => state.isConfigured);

  const handleTerminalKeyPress = (key: string) => {
    if (showEmailLogin) {
      if (key === "x" || key === "X") {
        setEmail((prev) => prev.slice(0, -1));
      } else if (key === "PAY") {
        handleEmailSubmit();
      } else if (/^[0-9]$/.test(key)) {
        setEmail((prev) => prev + key);
      }
    }
  };

  const handleEmailSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    // Without Supabase configured there is nothing to sign in against, so the
    // preview keeps its drawn demo behaviour. With it, the email is the real
    // account path — a passwordless magic link, exactly as the Worker docs.
    if (!isConfigured) {
      const finalEmail = email.trim() || "example@gmail.com";
      setIsSubmitting(true);
      login({ email: finalEmail });
      setTimeout(() => {
        setIsSubmitting(false);
        router.push(`${paths.home}?logged_in=true`);
      }, 300);
      return;
    }

    const address = email.trim();
    if (!address) return;
    setIsSubmitting(true);
    try {
      await requestMagicLink(address);
      setLinkSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "COULD NOT SEND THE LINK");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAuth = () => {
    // The blue/black circle buttons are "sign up with Google/Apple". Without
    // Supabase (demo preview) they keep the drawn shortcut to the terminal.
    // With it, sending the browser to a provider we have not configured would
    // just error, so they open the email path instead — a working control
    // rather than a dead one.
    if (isConfigured) {
      setShowEmailLogin(true);
      return;
    }
    login({ email: "user@u2gas.com" });
    router.push(`${paths.home}?logged_in=true`);
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

        <AnimatePresence mode="wait">
          {!showEmailLogin ? (
            <SocialAuth
              onOpenEmailLogin={() => setShowEmailLogin(true)}
              onQuickAuth={handleQuickAuth}
            />
          ) : (
            <EmailLoginForm
              email={email}
              setEmail={setEmail}
              onSubmit={handleEmailSubmit}
              onBack={() => setShowEmailLogin(false)}
              isSubmitting={isSubmitting}
              linkSent={linkSent}
              error={error}
            />
          )}
        </AnimatePresence>

        {!showEmailLogin && (
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
