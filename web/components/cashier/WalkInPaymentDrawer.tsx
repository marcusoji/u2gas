"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PaymentMethodBadge, { PaymentMethod } from "./PaymentMethodBadge";

export interface WalkInOrderData {
  kg: number;
  totalNaira: number;
  method: PaymentMethod;
  timestamp: string;
  orderId: string;
  /** The server's own order number, when it differs from the display id. */
  orderNumber?: string;
}

/** The drawer's words mapped to the Worker's payment methods. */
export const WALKIN_METHOD_TO_API: Record<
  PaymentMethod,
  "cash" | "card_terminal" | "bank_transfer"
> = {
  CASH: "cash",
  POS: "card_terminal",
  "BANK TRANS": "bank_transfer",
};

interface WalkInPaymentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kg: number;
  ratePerKg?: number;
  /** The customer's name and phone, for the order record. */
  guestName: string;
  guestPhone: string;
  setGuestName: (v: string) => void;
  setGuestPhone: (v: string) => void;
  error?: string | null;
  /**
   * Places and pays the order. Resolves with the created order, or null when
   * the attempt failed (the parent shows the error). This drawer never invents
   * an order number.
   */
  onConfirm?: (method: PaymentMethod) => Promise<WalkInOrderData | null>;
  onSuccess?: (order: WalkInOrderData) => void;
}

export default function WalkInPaymentDrawer({
  open,
  onOpenChange,
  kg,
  ratePerKg = 1000,
  guestName,
  guestPhone,
  setGuestName,
  setGuestPhone,
  error,
  onConfirm,
  onSuccess,
}: WalkInPaymentDrawerProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate total price based on kg (e.g. 10kg = ₦10,000)
  const totalNaira = kg * ratePerKg;
  const formattedPrice = `₦${totalNaira.toLocaleString()}`;

  const handleSelectMethod = (method: PaymentMethod) => {
    setSelectedMethod(method);
  };

  const handleContinueToPay = async () => {
    if (!selectedMethod || isProcessing) return;

    setIsProcessing(true);
    const order = await onConfirm?.(selectedMethod);
    setIsProcessing(false);

    if (order) {
      onSuccess?.(order);
      onOpenChange(false);
      setSelectedMethod(null);
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    onOpenChange(false);
    setSelectedMethod(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop inside the terminal container */}
          <motion.div
            key="walkin-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            className="absolute inset-0 z-20 bg-black/20 backdrop-blur-[1px] cursor-pointer"
          />

          {/* Bottom Card / Drawer Container popping up inside the terminal */}
          <motion.div
            key="walkin-sheet"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 inset-x-0 z-30 w-full bg-white rounded-[64px] shadow-[0_-8px_32px_rgba(0,0,0,0.2)] border border-neutral-100/80 px-5 pt-3.5 pb-8 flex flex-col items-center select-none"
          >
            {/* Drag Handle / Close Pill */}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="w-12 h-1 bg-[#8E8E93] rounded-full mx-auto mb-3.5 cursor-pointer hover:bg-neutral-600 transition-colors"
            />

            {!selectedMethod ? (
              /* ──────────────── STATE 1: WALK-IN PAYMENT 2 (SELECT METHOD) ──────────────── */
              <motion.div
                key="select-mode"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="w-full flex flex-col items-center"
              >
                {/* Weight Header */}
                <span className="text-[38px] font-normal leading-none text-black mb-1">
                  {kg}kg
                </span>

                {/* Amount Pill Badge */}
                <span className="bg-brand-primary text-white text-[11px] px-3 py-0.5 rounded-full inline-flex items-center justify-center mb-2.5">
                  {formattedPrice}
                </span>

                {/* The order has to be traceable to a person, so a walk-in
                    carries a name and phone even with no account. */}
                <div className="w-full flex flex-col gap-2 mt-1 mb-1">
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="CUSTOMER NAME"
                    className="w-full max-w-[260px] mx-auto rounded-full border border-dashed border-[#CCD0DC] px-4 py-2 text-center text-[13px] font-mono tracking-wider text-[#1317E4] placeholder:text-neutral-400 outline-none focus:border-[#1317E4] uppercase"
                  />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="PHONE NUMBER"
                    className="w-full max-w-[260px] mx-auto rounded-full border border-dashed border-[#CCD0DC] px-4 py-2 text-center text-[13px] font-mono tracking-wider text-[#1317E4] placeholder:text-neutral-400 outline-none focus:border-[#1317E4] uppercase"
                  />
                </div>

                {error && (
                  <span
                    role="alert"
                    className="text-[10px] font-mono tracking-wider text-red-500 uppercase text-center mb-1"
                  >
                    {error}
                  </span>
                )}

                {/* 'via:' label */}
                <span className="text-[11px] text-neutral-400 mb-2 text-center">
                  via:
                </span>

                {/* Payment Option Stickers */}
                <div className="flex items-center justify-center gap-3 w-full py-1">
                  <PaymentMethodBadge
                    method="CASH"
                    onClick={() => handleSelectMethod("CASH")}
                  />
                  <PaymentMethodBadge
                    method="POS"
                    onClick={() => handleSelectMethod("POS")}
                  />
                  <PaymentMethodBadge
                    method="BANK TRANS"
                    onClick={() => handleSelectMethod("BANK TRANS")}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="confirm-mode"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="w-full flex flex-col"
              >
                {/* Top Row: Left (10kg & Price badge) / Right (via & Method sticker) */}
                <div className="flex items-center justify-between w-full px-2 mb-5">
                  {/* Left Column */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[38px] font-normal leading-none text-black">
                      {kg}kg
                    </span>
                    <span className="bg-brand-primary text-white text-[11px] px-3 py-0.5 rounded-full inline-flex items-center justify-center">
                      {formattedPrice}
                    </span>
                  </div>

                  {/* Right Column */}
                  <div className="flex flex-col items-center">
                    <span className="text-[11px] text-neutral-400 mb-1 text-center">
                      via:
                    </span>
                    <PaymentMethodBadge
                      method={selectedMethod}
                      selected
                      onClick={() => !isProcessing && setSelectedMethod(null)}
                      className="cursor-pointer"
                    />
                  </div>
                </div>

                {/* Action Button: 'Continue to Pay' OR 'PROCESSING...' */}
                <div className="w-full flex justify-center mt-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleContinueToPay}
                    className={`w-fit px-8 py-4 rounded-full font-bold text-md transition-all shadow-md flex items-center justify-center cursor-pointer ${
                      isProcessing
                        ? "bg-[#969AF6] text-white cursor-not-allowed opacity-95"
                        : "bg-[#1317E8] hover:bg-[#1014cc] text-white active:scale-[0.98]"
                    }`}
                  >
                    {isProcessing ? "PROCESSING..." : "Continue to Pay"}
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
