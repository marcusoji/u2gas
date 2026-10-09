"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useAdminTankStore } from "@/stores/adminTankStore";

interface AdminUpdateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLevel?: number;
  totalCapacityTons?: number;
}

export default function AdminUpdateModal({
  open,
  onOpenChange,
}: AdminUpdateModalProps) {
  const {
    unit,
    tons,
    level,
    totalCapacityTons,
    increment,
    decrement,
    toggleUnit,
  } = useAdminTankStore();

  // Lock background scroll when open
  useEffect(() => {
    if (!open) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [open]);

  // Format digits to two digits: e.g. "00", "01", "06", "40"
  const displayDigits =
    unit === "TONS"
      ? String(Math.round(tons)).padStart(2, "0")
      : String(Math.round(level)).padStart(2, "0");

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Full-screen backdrop to catch clicks outside the popup sheet */}
          <motion.div
            key="update-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] cursor-pointer"
          />

          {/* Floating Sheet positioned right over the lower gauge as in design */}
          <motion.div
            key="update-sheet"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-[230px] sm:top-[235px] left-[calc(50%-28px)] -translate-x-1/2 z-50 w-[94%] max-w-[340px] bg-white rounded-[64px] px-6 pt-3.5 pb-8 flex flex-col items-center gap-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.25)] border border-neutral-100 select-none"
          >
            {/* Drag Handle / Close Pill */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="w-12 h-1 bg-[#8E8E93] rounded-full hover:bg-neutral-600 transition-colors cursor-pointer"
            />

            {/* Subtitle / Available Amount */}
            <div className="font-mono text-[11px] font-bold text-neutral-500 uppercase tracking-wider text-center mt-1">
              TOTAL AVAILABLE AMOUNT: {totalCapacityTons} TONS
            </div>

            {/* Central Large 7-Segment / Pixel Digits in jgs7 font */}
            <div
              className="text-[76px] sm:text-[84px] leading-none my-2 select-none tracking-widest text-[#B5B5BA] flex items-center justify-center"
              style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
            >
              {displayDigits}
            </div>

            {/* Unit Badge / Selector with dashed border */}
            <button
              type="button"
              onClick={toggleUnit}
              className="border border-dashed border-neutral-300 rounded-[6px] px-3 py-0.5 flex items-center gap-1 font-mono text-xs font-bold text-neutral-600 uppercase hover:border-neutral-400 active:scale-95 transition-all cursor-pointer"
              title="Click to toggle units"
            >
              <span>{unit}</span>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
            </button>

            {/* Circular Action Controls: Red Minus & Blue Plus */}
            <div className="flex items-center justify-center gap-6 mt-3">
              {/* Red Minus Button */}
              <button
                type="button"
                onClick={decrement}
                aria-label="Decrease amount"
                className="w-15 h-15 rounded-full bg-[#E00000] flex items-center justify-center shadow-[0_6px_20px_rgba(224,0,0,0.35)] active:scale-90 hover:bg-[#c80000] transition-all cursor-pointer"
              >
                <div className="w-6 h-1.5 bg-white rounded-full" />
              </button>

              {/* Blue Plus Button */}
              <button
                type="button"
                onClick={increment}
                aria-label="Increase amount"
                className="w-15 h-15 rounded-full bg-[#1317E4] flex items-center justify-center shadow-[0_6px_20px_rgba(19,23,228,0.4)] active:scale-90 hover:bg-[#0f12c5] transition-all cursor-pointer"
              >
                <div className="relative w-6 h-6 flex items-center justify-center">
                  <div className="w-6 h-1.5 bg-white rounded-full absolute" />
                  <div className="h-6 w-1.5 bg-white rounded-full absolute" />
                </div>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
