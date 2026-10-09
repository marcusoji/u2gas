"use client";

import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export interface EmailLoginFormProps {
  email: string;
  setEmail: (email: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export function EmailLoginForm({
  email,
  setEmail,
  onSubmit,
  onBack,
  isSubmitting,
}: EmailLoginFormProps) {
  const hasText = email.trim().length > 0;

  return (
    <motion.form
      key="email-view"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      onSubmit={onSubmit}
      className="w-full flex flex-col items-center mt-12"
    >
      {/* Subtitle: ENTER EMAIL TO LOGIN */}
      <p className="text-[11px] tracking-widest text-[#1317E4] uppercase mb-4 select-none text-center">
        ENTER EMAIL TO LOGIN
      </p>

      {/* Dashed Pill Input Box */}
      <div className="w-full max-w-[280px] sm:max-w-[290px] h-[52px] rounded-full bg-white border border-dashed border-[#CCD0DC] flex items-center justify-center px-6 shadow-xs focus-within:border-[#1317E4] transition-colors">
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value.toUpperCase())}
          placeholder="EXAMPLE@GMAIL.COM"
          autoFocus
          className="w-full bg-transparent text-[15px] sm:text-[16px] tracking-wider text-center text-[#1317E4] placeholder:text-[#838EF8] focus:outline-hidden uppercase select-text"
        />
      </div>

      {/* CONTINUE Pill Button - switches to primary color #1317E4 when text is entered */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full max-w-[190px] mt-6 py-3 rounded-full text-white text-[17px] tracking-wider uppercase flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
          hasText
            ? "bg-[#1317E4] hover:bg-[#0f12c5] shadow-[0_4px_20px_rgba(19,23,228,0.4)]"
            : "bg-[#838EF8] hover:bg-[#727ef5] shadow-[0_4px_16px_rgba(131,142,248,0.3)]"
        }`}
      >
        {isSubmitting ? "LOGGING IN..." : "CONTINUE"}
      </button>

      {/* Back to Options button with Lucide ArrowLeft */}
      <button
        type="button"
        onClick={onBack}
        className="mt-5 text-[11px] tracking-wider text-[#838EF8] hover:text-[#1317E4] uppercase transition-colors cursor-pointer select-none flex items-center gap-1.5"
      >
        <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
        <span>BACK</span>
      </button>
    </motion.form>
  );
}

export default EmailLoginForm;
