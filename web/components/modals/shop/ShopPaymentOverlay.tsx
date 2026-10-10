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
  paymentStatus: "idle" | "processing" | "success" | "held";
  onDismissSuccess: () => void;
  /** A signed-out customer must leave a name and phone the Worker can record. */
  needsGuest: boolean;
  guestName: string;
  guestPhone: string;
  onGuestNameChange: (value: string) => void;
  onGuestPhoneChange: (value: string) => void;
  error: string | null;
  /** Set when the browser refused the gateway tab, so it can be linked. */
  blockedUrl: string | null;
  /** Delivery zone choices, loaded from the Worker. */
  zones: { zone_id: string; name: string; fee_kobo: number }[];
  zoneId: string;
  onZoneChange: (zoneId: string) => void;
  deliveryAddress: string;
  onDeliveryAddressChange: (value: string) => void;
  /** Fired when a pay-at-depot order is dismissed (the basket is then cleared). */
  onDismissHeld: () => void;
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
  needsGuest,
  guestName,
  guestPhone,
  onGuestNameChange,
  onGuestPhoneChange,
  error,
  blockedUrl,
  zones,
  zoneId,
  onZoneChange,
  deliveryAddress,
  onDeliveryAddressChange,
  onDismissHeld,
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
                      <div className="w-full flex flex-col items-center gap-2">
                        <div className="w-full h-28 rounded-2xl overflow-hidden relative flex items-center justify-center shadow-xs">
                          <Image
                            src="/images/map.jpg"
                            alt="Delivery map"
                            fill
                            className="object-cover"
                          />
                        </div>
                        <select
                          value={zoneId}
                          onChange={(e) => onZoneChange(e.target.value)}
                          disabled={isProcessing}
                          className="w-full max-w-[300px] h-11 rounded-full bg-white border border-dashed border-[#CCD0DC] px-5 text-center text-[13px] font-mono tracking-wider text-[#1317E4] focus:outline-hidden focus:border-[#1317E4] disabled:opacity-60"
                        >
                          <option value="">CHOOSE A DELIVERY ZONE</option>
                          {zones.map((zone) => (
                            <option key={zone.zone_id} value={zone.zone_id}>
                              {zone.name} — ₦
                              {(zone.fee_kobo / 100).toLocaleString()}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={deliveryAddress}
                          onChange={(e) =>
                            onDeliveryAddressChange(e.target.value)
                          }
                          disabled={isProcessing}
                          placeholder="DELIVERY ADDRESS"
                          className="w-full max-w-[300px] h-11 rounded-full bg-white border border-dashed border-[#CCD0DC] px-5 text-center text-[13px] font-mono tracking-wider text-[#1317E4] placeholder:text-neutral-400 focus:outline-hidden focus:border-[#1317E4] disabled:opacity-60"
                        />
                      </div>
                    )}

                    {/* Payment Options Label */}
                    <p className="text-[#B5B5B5] text-[11px] tracking-[0.14em] uppercase">
                      PAYMENT OPTIONS
                    </p>

                    {needsGuest && (
                      <div className="w-full flex flex-col items-center gap-2">
                        <input
                          type="text"
                          value={guestName}
                          onChange={(e) => onGuestNameChange(e.target.value)}
                          disabled={isProcessing}
                          placeholder="YOUR NAME"
                          className="w-full max-w-[300px] h-11 rounded-full bg-white border border-dashed border-[#CCD0DC] px-5 text-center text-[13px] font-mono tracking-wider text-[#1317E4] placeholder:text-neutral-400 focus:outline-hidden focus:border-[#1317E4] uppercase disabled:opacity-60"
                        />
                        <input
                          type="tel"
                          inputMode="tel"
                          value={guestPhone}
                          onChange={(e) => onGuestPhoneChange(e.target.value)}
                          disabled={isProcessing}
                          placeholder="PHONE NUMBER"
                          className="w-full max-w-[300px] h-11 rounded-full bg-white border border-dashed border-[#CCD0DC] px-5 text-center text-[13px] font-mono tracking-wider text-[#1317E4] placeholder:text-neutral-400 focus:outline-hidden focus:border-[#1317E4] disabled:opacity-60"
                        />
                      </div>
                    )}

                    {error && (
                      <p className="text-[11px] font-mono text-red-500 tracking-wider text-center max-w-[300px]">
                        {error}
                      </p>
                    )}

                    {blockedUrl && (
                      <a
                        href={blockedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-mono text-brand-primary underline tracking-wider text-center"
                      >
                        OPEN THE PAYMENT PAGE
                      </a>
                    )}

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
                <img
                  src="/images/success.png"
                  alt="Success"
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

      {/* ──────────────── PAY-IN-DEPOT (HELD) OVERLAY ──────────────── */}
      <AnimatePresence>
        {paymentStatus === "held" && (
          <motion.div
            key="checkout-held-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onDismissHeld}
            className="absolute inset-0 z-50 bg-black/40 backdrop-blur-[3px] flex flex-col items-center justify-center select-none cursor-pointer overflow-hidden p-4"
          >
            <div className="flex flex-col items-center justify-center gap-5">
              <TerminalScreenBox value="HELD!!" variant="amber" speed={8} />
              <p className="text-white text-[12px] font-mono tracking-wider text-center max-w-[280px] uppercase">
                Pay at the depot — your order is held for a cashier to settle
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default ShopPaymentOverlay;
