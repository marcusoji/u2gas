"use client";

import React, { useState } from "react";
import Image from "next/image";
import TerminalScreenBox from "@/components/terminal-screen-box";
import { TerminalKeyboard } from "@/app/(public)/terminal-keyboard";
import WalkInPaymentDrawer, { WalkInOrderData } from "./WalkInPaymentDrawer";
import { deleteKeypadDigit, appendKeypadDigit } from "@/helpers/functions";

interface CashierTerminalProps {
  initialValue?: string;
  ratePerKg?: number;
  onScanClick?: () => void;
  onManualEntryClick?: () => void;
  onPaymentSuccess?: (order: WalkInOrderData) => void;
  className?: string;
}

export default function CashierTerminal({
  initialValue = "1KG",
  ratePerKg = 1000,
  onScanClick,
  onManualEntryClick,
  onPaymentSuccess,
  className = "",
}: CashierTerminalProps) {
  const [displayValue, setDisplayValue] = useState<string>(initialValue);
  const [hasStartedTyping, setHasStartedTyping] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Parse current numerical KG value
  const parsedKg = parseInt(displayValue.replace(/[^0-9]/g, ""), 10) || 1;

  const handleKeyPress = (key: string) => {
    if (key === "PAY") {
      setDrawerOpen(true);
      return;
    }

    if (key === "x" || key === "X" || key === "×") {
      setHasStartedTyping(true);
      setDisplayValue((prev) => deleteKeypadDigit(prev));
      return;
    }

    const isFirst = !hasStartedTyping;
    setHasStartedTyping(true);
    setDisplayValue((prev) => appendKeypadDigit(prev, key, isFirst));
  };

  const handleOrderSuccess = (order: WalkInOrderData) => {
    // Reset terminal to default 1KG
    setDisplayValue("1KG");
    setHasStartedTyping(false);
    onPaymentSuccess?.(order);
  };

  const hasTyped = hasStartedTyping && displayValue !== "0KG";

  return (
    <div
      className={`w-full max-w-[340px] sm:max-w-[360px] mx-auto flex flex-col items-center select-none ${className}`}
    >
      {/* ──────────────── CASHIER GREY TERMINAL BODY ──────────────── */}
      <div className="w-full bg-[#858587] rounded-[24px] pt-6 pb-7 px-8 relative shadow-[0_12px_32px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06),inset_0_1px_2px_rgba(255,255,255,0.85)]  flex flex-col items-center overflow-hidden">
        {/* Authentic tactile stipple noise overlay */}
        <div className="absolute inset-0 noise-texture opacity-28 mix-blend-overlay pointer-events-none z-0" />

        {/* Inner Border Line (similar to original POS style) */}
        <div className="absolute inset-2.5 rounded-[16px] border border-black/15 pointer-events-none z-10" />

        {/* Header Label */}
        <div className="text-md tracking-[0.22em] text-[#D4D4D4] font-mono font-semibold uppercase mb-3 z-10">
          AMOUNT IN NAIRA
        </div>

        {/* LED Digital Screen Box */}
        <TerminalScreenBox
          value={displayValue}
          variant="red"
          className="mb-6 z-10"
        />

        {/* Keypad Grid (3 x 4) */}
        <TerminalKeyboard onKeyPress={handleKeyPress} className="mb-2 z-10" />

        {/* ──────────────── WALK-IN PAYMENT DRAWER (POPS UP INSIDE TERMINAL) ──────────────── */}
        <WalkInPaymentDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          kg={parsedKg}
          ratePerKg={ratePerKg}
          onSuccess={handleOrderSuccess}
        />
      </div>

      {/* ──────────────── ACTION CONTROLS (SCAN & MANUAL PEN) ──────────────── */}
      <div className="flex items-center justify-center gap-4 mt-5">
        {/* SCAN Button: Switches to primary button color when user has typed an amount */}
        <button
          type="button"
          onClick={onScanClick}
          className={`py-3 px-9 rounded-full text-white text-sm font-bold tracking-widest uppercase flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
            hasTyped
              ? "bg-brand-primary hover:bg-brand-primary/90 shadow-[0_4px_14px_rgba(19,23,228,0.35)]"
              : "bg-[#969AF6] hover:bg-[#858AF4] shadow-sm"
          }`}
        >
          SCAN
        </button>

        {/* Circular Signature / Manual Entry Button */}
        <button
          type="button"
          onClick={onManualEntryClick}
          aria-label="Manual Entry"
          className="w-12 h-12 rounded-full bg-linear-to-b from-white to-[#D5D5D5] border border-[#D8DCE5] flex items-center justify-center cursor-pointer active:scale-95 shadow-sm transition-transform"
        >
          <Image
            src="/images/manual-sign-pen.png"
            alt="Manual Entry"
            width={26}
            height={26}
            className="object-contain"
            priority
          />
        </button>
      </div>
    </div>
  );
}
