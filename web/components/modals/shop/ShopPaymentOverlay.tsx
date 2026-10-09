"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useCartStore } from "@/stores/cartStore";
import { cn } from "@/lib/utils";
import TerminalScreenBox from "@/components/terminal-screen-box";

export type ShopPaymentOverlayProps = {
  showPayment: boolean;
  onClosePayment: () => void;
  checkoutMode: "delivery" | "walk-in";
  setCheckoutMode: (mode: "delivery" | "walk-in") => void;
  selectedPaymentMethod: string | null;
  onSelectPayment: (method: string) => void;
  isProcessing: boolean;
  paymentStatus: "idle" | "processing" | "success";
  onDismissSuccess: () => void;
};

export function ShopPaymentOverlay({
  showPayment,
  onClosePayment,
  checkoutMode,
  setCheckoutMode,
  selectedPaymentMethod,
  onSelectPayment,
  isProcessing,
  paymentStatus,
  onDismissSuccess,
}: ShopPaymentOverlayProps) {
  const getTotalItems = useCartStore((state) => state.getTotalItems);
  const getTotalPrice = useCartStore((state) => state.getTotalPrice);

  return (
    <>
      {/* ──────────────── FLOATING PAYMENT CARD ──────────────── */}
      <AnimatePresence>
        {showPayment && paymentStatus !== "success" && (
          <>
            {/* Subtle backdrop over the basket screen */}
            <motion.div
              key="checkout-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isProcessing) {
                  onClosePayment();
                }
              }}
              className="absolute inset-0 z-30 bg-black/25 backdrop-blur-[2px] cursor-pointer"
            />

            {/* Floating Payment Card */}
            <motion.div
              key="checkout-card"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[92%] max-w-[340px] bg-white rounded-[36px] px-5 pt-3 pb-6 flex flex-col items-center gap-3.5 shadow-[0_16px_50px_rgba(0,0,0,0.22)] border border-neutral-100"
            >
              {/* Drag Handle / Pill */}
              <button
                type="button"
                onClick={onClosePayment}
                aria-label="Close"
                className="w-12 h-1 bg-[#8E8E93] rounded-full hover:bg-neutral-600 transition-colors cursor-pointer"
              />

              <AnimatePresence mode="wait">
                {isProcessing ? (
                  /* Processing State */
                  <motion.div
                    key="checkout-processing"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="w-full flex flex-col items-center gap-6 pt-2 pb-2"
                  >
                    <div className="w-full flex items-center justify-between px-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[34px] font-normal leading-none text-black">
                          {getTotalItems()}{" "}
                          {getTotalItems() === 1 ? "item" : "items"}
                        </span>
                        <span className="bg-brand-primary text-white text-[11px] px-3 py-0.5 rounded-full inline-flex items-center justify-center">
                          ₦{getTotalPrice().toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[11px] text-neutral-400 mb-1 text-center">
                          via:
                        </span>
                        <div className="w-18 h-16 rounded-[18px] border border-dashed border-[#D1D5DB] bg-white flex items-center justify-center font-medium text-[13px] text-black text-center whitespace-pre-line shadow-xs rotate-[8deg]">
                          {selectedPaymentMethod || "OPAY"}
                        </div>
                      </div>
                    </div>

                    <div className="w-full max-w-[210px] py-3 rounded-full bg-[#7582EB] text-white text-[13px] tracking-wider flex items-center justify-center gap-0.5 shadow-xs cursor-default select-none">
                      <span>processing</span>
                      <span className="inline-flex">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            animate={{ opacity: [0.2, 1, 0.2] }}
                            transition={{
                              duration: 1.2,
                              repeat: Infinity,
                              delay: i * 0.25,
                            }}
                          >
                            .
                          </motion.span>
                        ))}
                      </span>
                    </div>
                  </motion.div>
                ) : (
                  /* Options State */
                  <motion.div
                    key="checkout-options"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-full flex flex-col items-center gap-3.5"
                  >
                    {/* Walk-in vs Delivery Toggle */}
                    <div className="flex border border-brand-primary rounded-[10px] p-0.5 bg-white">
                      <button
                        type="button"
                        onClick={() => setCheckoutMode("walk-in")}
                        className={cn(
                          "px-4 py-1 rounded-[8px] text-[11px] tracking-wider transition-all cursor-pointer",
                          checkoutMode === "walk-in"
                            ? "bg-brand-primary text-white"
                            : "text-brand-primary bg-transparent hover:bg-brand-primary/5",
                        )}
                      >
                        WALK-IN
                      </button>
                      <button
                        type="button"
                        onClick={() => setCheckoutMode("delivery")}
                        className={cn(
                          "px-4 py-1 rounded-[8px] text-[11px] tracking-wider transition-all cursor-pointer",
                          checkoutMode === "delivery"
                            ? "bg-brand-primary text-white"
                            : "text-brand-primary bg-transparent hover:bg-brand-primary/5",
                        )}
                      >
                        DELIVERY
                      </button>
                    </div>

                    {/* Map Preview for Delivery Mode */}
                    {checkoutMode === "delivery" && (
                      <div className="w-full h-28 rounded-2xl overflow-hidden relative flex items-center justify-center shadow-xs">
                        <Image
                          src="/images/map.jpg"
                          alt="Delivery map"
                          fill
                          className="object-cover"
                        />
                        <button
                          type="button"
                          className="relative z-10 bg-brand-primary text-white text-[11px] px-5 py-2.5 rounded-[10px] cursor-pointer shadow-md hover:bg-blue-700 transition-colors"
                        >
                          CONFIRM DELIVERY ADDRESS
                        </button>
                      </div>
                    )}

                    {/* Payment Options Label */}
                    <p className="text-[#B5B5B5] text-[11px] tracking-[0.14em] uppercase">
                      PAYMENT OPTIONS
                    </p>

                    {/* Payment Buttons */}
                    {checkoutMode === "delivery" ? (
                      <div className="flex justify-center items-start gap-4 w-full pt-2 pb-4">
                        <button
                          type="button"
                          onClick={() => onSelectPayment("BANK\nTRANS")}
                          className="w-18 h-16 rounded-[18px] border border-dashed border-[#D1D5DB] bg-white flex items-center justify-center font-medium text-[13px] leading-tight text-black text-center whitespace-pre-line shadow-[0_8px_20px_rgba(0,0,0,0.08)] hover:border-brand-primary hover:text-brand-primary transition-all active:scale-95 cursor-pointer -rotate-[13deg]"
                        >
                          {"BANK\nTRANS"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectPayment("CARD")}
                          className="w-18 h-16 rounded-[18px] border border-dashed border-[#D1D5DB] bg-white flex items-center justify-center font-medium text-[13px] leading-tight text-black text-center whitespace-pre-line shadow-[0_8px_20px_rgba(0,0,0,0.08)] hover:border-brand-primary hover:text-brand-primary transition-all active:scale-95 cursor-pointer rotate-[13deg] translate-y-7"
                        >
                          CARD
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectPayment("OPAY")}
                          className="w-18 h-16 rounded-[18px] border border-dashed border-[#D1D5DB] bg-white flex items-center justify-center font-medium text-[13px] leading-tight text-black text-center whitespace-pre-line shadow-[0_8px_20px_rgba(0,0,0,0.08)] hover:border-brand-primary hover:text-brand-primary transition-all active:scale-95 cursor-pointer rotate-[8deg]"
                        >
                          OPAY
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-5 justify-center items-center">
                          <button
                            type="button"
                            onClick={() => onSelectPayment("BANK\nTRANS")}
                            className="w-18 h-16 rounded-[18px] border border-dashed border-[#D1D5DB] bg-white flex items-center justify-center font-medium text-[13px] leading-tight text-black text-center whitespace-pre-line shadow-[0_8px_20px_rgba(0,0,0,0.08)] hover:border-brand-primary hover:text-brand-primary transition-all active:scale-95 cursor-pointer -rotate-6"
                          >
                            {"BANK\nTRANS"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectPayment("OPAY")}
                            className="w-18 h-16 rounded-[18px] border border-dashed border-[#D1D5DB] bg-white flex items-center justify-center font-medium text-[13px] leading-tight text-black text-center whitespace-pre-line shadow-[0_8px_20px_rgba(0,0,0,0.08)] hover:border-brand-primary hover:text-brand-primary transition-all active:scale-95 cursor-pointer rotate-6"
                          >
                            OPAY
                          </button>
                        </div>
                        <p className="text-[#B5B5B5] text-xs">OR</p>
                        <button
                          type="button"
                          onClick={() => onSelectPayment("DEPOT")}
                          className="border border-dashed border-[#B0B0B0] bg-white rounded-full px-8 py-3 text-xs tracking-wider text-black shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer"
                        >
                          PAY IN THE DEPOT
                        </button>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ──────────────── SUCCESS SCREEN OVERLAY ──────────────── */}
      <AnimatePresence>
        {paymentStatus === "success" && (
          <motion.div
            key="checkout-success-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onDismissSuccess}
            className="absolute inset-0 z-50 bg-black/40 backdrop-blur-[3px] flex flex-col items-center justify-center select-none cursor-pointer overflow-hidden p-4"
          >
            <div className="flex flex-col items-center justify-center">
              {/* Hand with Zoom-in Animation and 266/354 aspect ratio */}
              <motion.div
                initial={{ scale: 0.15, opacity: 0.3 }}
                animate={{ scale: 2, opacity: 1 }}
                transition={{
                  type: "tween",
                  duration: 0.9,
                }}
                className="relative w-66.5 h-88.5 max-w-full aspect-266/354 flex items-center justify-center -mb-6"
              >
                <Image
                  src="/images/success.png"
                  alt="Success"
                  width={266}
                  height={354}
                  className="object-contain drop-shadow-[0_16px_32px_rgba(0,0,0,0.45)] pointer-events-none"
                />
              </motion.div>

              {/* Glowing Green TerminalScreenBox directly under the hand */}
              <motion.div
                initial={{ scale: 0.7, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 280,
                  damping: 20,
                  delay: 0.1,
                }}
                className="relative z-40"
              >
                <TerminalScreenBox
                  value="SUCCESS!!"
                  variant="green"
                  speed={8}
                  className="shadow-[0_4px_24px_rgba(3,255,49,0.5)]"
                />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default ShopPaymentOverlay;
