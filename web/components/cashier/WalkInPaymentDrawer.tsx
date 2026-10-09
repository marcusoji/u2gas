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
}

interface WalkInPaymentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kg: number;
  ratePerKg?: number;
  onSuccess?: (order: WalkInOrderData) => void;
}

export default function WalkInPaymentDrawer({
  open,
  onOpenChange,
  kg,
  ratePerKg = 1000,
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

  const handleContinueToPay = () => {
    if (!selectedMethod || isProcessing) return;

    setIsProcessing(true);

    // Simulate payment transaction
    setTimeout(() => {
      setIsProcessing(false);
      const orderData: WalkInOrderData = {
        kg,
        totalNaira,
        method: selectedMethod,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        orderId: `ORD-${Math.floor(10000 + Math.random() * 90000)}`,
      };

      onSuccess?.(orderData);
      onOpenChange(false);
      // Reset state for subsequent uses
      setSelectedMethod(null);
    }, 1500);
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
