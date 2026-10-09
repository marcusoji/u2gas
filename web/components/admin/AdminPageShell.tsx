"use client";

import React, { type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import Footer from "@/components/footer";

/**
 * The shared chrome every admin sub-screen wears.
 *
 * The admin views the design draws are all the same plate: a BACK chip in the
 * top-left, a centred content column, and the footer. Factoring it out keeps a
 * new screen from inventing its own header and drifting from the language the
 * others use — the drift the rest of this repo has been fighting.
 */
export interface AdminPageShellProps {
  title?: string;
  subtitle?: string;
  onBack: () => void;
  children: ReactNode;
  /** A control pinned opposite the back chip, e.g. "ADD". */
  action?: ReactNode;
}

const CHIP =
  "border border-[#838EF8] text-[#1317E4] bg-white font-mono text-[11px] font-bold px-5 py-1.5 rounded-full tracking-wider uppercase hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed";

/** The pale-outlined pill every admin screen uses for a secondary action. */
export function AdminChip({
  children,
  onClick,
  type = "button",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${CHIP} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

export default function AdminPageShell({
  title,
  subtitle,
  onBack,
  children,
  action,
}: AdminPageShellProps) {
  return (
    <div className="w-full max-w-[420px] flex-1 flex flex-col items-center px-6 pt-6 sm:pt-8 pb-8 select-none">
      <div className="w-full flex items-center justify-between mb-6 sm:mb-8">
        <button
          type="button"
          onClick={onBack}
          className="bg-[#1317E4] text-white font-mono text-[11px] font-bold px-3 py-1.5 rounded-[6px] tracking-wider uppercase flex items-center gap-1.5 shadow-xs hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer select-none"
          aria-label="Go Back"
        >
          <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="leading-none">BACK</span>
        </button>
        {action}
      </div>

      {(title || subtitle) && (
        <div className="w-full flex flex-col items-center mb-5">
          {title && (
            <span
              style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
              className="text-[13px] sm:text-[14px] font-bold tracking-[0.2em] text-[#1317E4] uppercase text-center"
            >
              {title}
            </span>
          )}
          {subtitle && (
            <span
              style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
              className="text-[10px] font-bold tracking-[0.15em] text-[#838EF8] uppercase text-center mt-1"
            >
              {subtitle}
            </span>
          )}
        </div>
      )}

      <div className="w-full flex-1 flex flex-col items-center">{children}</div>

      <div className="w-full pt-8">
        <Footer />
      </div>
    </div>
  );
}
