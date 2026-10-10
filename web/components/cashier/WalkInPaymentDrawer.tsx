"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PaymentMethodBadge, { PaymentMethod } from "./PaymentMethodBadge";
import { staffWalkIn, staffRecordPayment } from "@/lib/endpoints";
import { ApiError } from "@/lib/api";

export interface WalkInOrderData {
  kg: number;
  totalNaira: number;
  method: PaymentMethod;
  timestamp: string;
  /** The order number the customer's receipt is keyed on (e.g. U2-100045). */
  orderId: string;
  /** The order row's uuid, kept for any follow-up call that needs it. */
  orderUuid: string;
  /** Cash only: what the customer handed over and the change to give back. */
  tenderedNaira?: number;
  changeDueNaira?: number;
}

interface WalkInPaymentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kg: number;
  ratePerKg?: number;
  onSuccess?: (order: WalkInOrderData) => void;
}

/** The drawn badge vocabulary mapped onto the Worker's payment methods. */
const METHOD_TO_API: Record<PaymentMethod, "cash" | "card_terminal" | "bank_transfer"> = {
  CASH: "cash",
  POS: "card_terminal",
  "BANK TRANS": "bank_transfer",
};

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
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [tendered, setTendered] = useState("");

  // Calculate total price based on kg (e.g. 10kg = ₦10,000)
  const totalNaira = kg * ratePerKg;
  const formattedPrice = `₦${totalNaira.toLocaleString()}`;

  const handleSelectMethod = (method: PaymentMethod) => {
    setError(null);
    setSelectedMethod(method);
  };

  const handleContinueToPay = async () => {
    if (!selectedMethod || isProcessing) return;

    const name = customerName.trim();
    const phone = customerPhone.trim();
    if (!name || !phone) {
      setError("ENTER THE CUSTOMER'S NAME AND PHONE");
      return;
    }

    // Cash needs the amount handed over: the Worker computes the change from
    // it, and refuses a cash payment that does not say what was tendered.
    let tenderedNaira: number | undefined;
    if (selectedMethod === "CASH") {
      const value = Number(tendered.replace(/[^0-9.]/g, ""));
      if (!value || value < totalNaira) {
        setError("ENTER AT LEAST THE AMOUNT DUE");
        return;
      }
      tenderedNaira = value;
    }

    setError(null);
    setIsProcessing(true);
    try {
      // One order per walk-in sale, then the explicit payment confirmation —
      // opening the drawer is not payment.
      const { order } = await staffWalkIn({
        kg,
        lines: [],
        guest_name: name,
        guest_phone: phone,
        fulfillment: "pickup",
      });

      const result = await staffRecordPayment({
        order_id: order.order_id,
        method: METHOD_TO_API[selectedMethod],
        ...(tenderedNaira !== undefined
          ? { tendered_kobo: Math.round(tenderedNaira * 100) }
          : {}),
      });

      const orderData: WalkInOrderData = {
        kg,
        totalNaira,
        method: selectedMethod,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        orderId: result.order_number,
        orderUuid: order.order_id,
        ...(tenderedNaira !== undefined
          ? {
              tenderedNaira,
              changeDueNaira: result.change_due_kobo / 100,
            }
          : {}),
      };

      onSuccess?.(orderData);
      onOpenChange(false);
      setSelectedMethod(null);
      setCustomerName("");
      setCustomerPhone("");
      setTendered("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "COULD NOT RECORD THE PAYMENT",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    setError(null);
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

                {/* Customer identity — the Worker needs a name and phone to
                    record who a walk-in order belongs to. */}
                <div className="w-full flex flex-col items-center gap-2 mb-4">
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    disabled={isProcessing}
                    placeholder="CUSTOMER NAME"
                    className="w-full max-w-[300px] h-11 rounded-full bg-white border border-dashed border-[#CCD0DC] px-5 text-center text-[13px] font-mono tracking-wider text-[#1317E4] placeholder:text-neutral-400 focus:outline-hidden focus:border-[#1317E4] uppercase disabled:opacity-60"
                  />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    disabled={isProcessing}
                    placeholder="CUSTOMER PHONE"
                    className="w-full max-w-[300px] h-11 rounded-full bg-white border border-dashed border-[#CCD0DC] px-5 text-center text-[13px] font-mono tracking-wider text-[#1317E4] placeholder:text-neutral-400 focus:outline-hidden focus:border-[#1317E4] disabled:opacity-60"
                  />
                  {selectedMethod === "CASH" && (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={tendered}
                      onChange={(e) => setTendered(e.target.value)}
                      disabled={isProcessing}
                      placeholder="CASH RECEIVED (₦)"
                      className="w-full max-w-[300px] h-11 rounded-full bg-white border border-dashed border-[#CCD0DC] px-5 text-center text-[13px] font-mono tracking-wider text-[#1317E4] placeholder:text-neutral-400 focus:outline-hidden focus:border-[#1317E4] disabled:opacity-60"
                    />
                  )}
                  {error && (
                    <span className="text-[11px] font-mono text-red-500 tracking-wider text-center">
                      {error}
                    </span>
                  )}
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
