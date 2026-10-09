"use client";

import { motion } from "framer-motion";

export interface SocialAuthProps {
  onOpenEmailLogin: () => void;
  onQuickAuth: (provider: "google" | "apple") => void;
  disabled?: boolean;
}

export function SocialAuth({
  onOpenEmailLogin,
  onQuickAuth,
  disabled = false,
}: SocialAuthProps) {
  return (
    <motion.div
      key="initial-view"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      className="w-full flex flex-col items-center mt-10"
    >
      {/* LOG IN Pill Button */}
      <button
        type="button"
        onClick={onOpenEmailLogin}
        className="w-full max-w-[215px] py-3.5 px-6 rounded-full bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] border border-black/5 flex items-center justify-center hover:shadow-[0_8px_28px_rgba(19,23,228,0.12)] active:scale-95 transition-all cursor-pointer"
      >
        <span className="text-[21px] tracking-widest text-[#1317E4] uppercase select-none">
          LOG IN
        </span>
      </button>

      {/* OR / SIGN UP WITH: Subtext */}
      <div className="flex flex-col items-center gap-0.5 mt-5 text-center select-none">
        <span className="text-[10px] tracking-widest text-[#1317E4] uppercase">
          OR
        </span>
        <span className="text-[11px] tracking-widest text-[#1317E4] uppercase">
          SIGN UP WITH:
        </span>
      </div>

      {/* Social / Direct Auth Buttons */}
      <div className="flex items-center justify-center gap-4.5 mt-4">
        {/* Blue Circle Button */}
        <button
          type="button"
          onClick={() => onQuickAuth("google")}
          disabled={disabled}
          aria-label="Sign in with Google"
          className="size-15 sm:size-16 rounded-full bg-[#1317E4] flex items-center justify-center shadow-[0_6px_20px_rgba(19,23,228,0.4)] hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
        >
          <span className="text-[26px] text-white select-none translate-y-[-1px]">
            A
          </span>
        </button>

        {/* Black Circle Button */}
        <button
          type="button"
          onClick={() => onQuickAuth("apple")}
          disabled={disabled}
          aria-label="Sign in with Apple"
          className="size-15 sm:size-16 rounded-full bg-black flex items-center justify-center shadow-[0_6px_20px_rgba(0,0,0,0.35)] hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
        >
          <span className="text-[26px] text-white select-none translate-y-[-1px]">
            A
          </span>
        </button>
      </div>
    </motion.div>
  );
}

export default SocialAuth;
