"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { GasOrderDraft } from "@/types";
import { getOrder, initializePayment } from "@/lib/endpoints";
import { rememberPaymentAttempt } from "@/lib/paymentSession";

type PaymentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?:
    | GasOrderDraft
    | {
        quantityKg?: number | string;
        totalNaira?: number;
        ratePerKg?: number;
      }
    | null;
  /** Set once the Worker has held the gas and created the order. */
  orderId?: string | null;
  /** Guest capability token, for a checkout that started signed out. */
  guestToken?: string;
  /**
   * `pending` is not a failure: a walk-in who chose PAY IN THE DEPOT holds an
   * unpaid order that a cashier settles. Reporting `success` there told the
   * customer a payment had happened when none had.
   */
  onPaymentComplete: (outcome: "success" | "failed" | "pending") => void;
};

export default function PaymentModal({
  open,
  onOpenChange,
  order,
  orderId,
  guestToken,
  onPaymentComplete,
}: PaymentModalProps) {
  const [mode, setMode] = useState<"walk-in" | "delivery">("walk-in");
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // Set when the browser refused the gateway tab, so the sheet can offer the
  // checkout URL as a clickable link instead of silently going nowhere.
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);

  // The gateway's own page is the authority: `initialize` returns its URL, the
  // tab it opens posts back to /orders/verify, and `verify` records the result.
  // Polling `/orders/:id` is what settles the sheet, so a closed tab or a
  // webhook that lands late still resolves rather than spinning forever.
  useEffect(() => {
    if (!isProcessing || !open) return;

    // PAY IN THE DEPOT leaves the order pending for a cashier to settle, so
    // there is no gateway to poll and no payment_status to wait for. The order
    // is *held*, not paid, so the outcome is `pending` — the terminal says so
    // rather than stamping SUCCESS over an unpaid order.
    if (selectedMethod === "DEPOT") {
      const timer = window.setTimeout(() => {
        setIsProcessing(false);
        setSelectedMethod(null);
        onOpenChange(false);
        onPaymentComplete("pending");
      }, 1400);
      return () => window.clearTimeout(timer);
    }

    // No order to poll means the hold never got created: nothing was charged,
    // so this is a failure, not a success.
    if (!orderId) {
      const timer = window.setTimeout(() => {
        setIsProcessing(false);
        setSelectedMethod(null);
        onOpenChange(false);
        onPaymentComplete("failed");
      }, 400);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;
    const startedAt = Date.now();

    const tick = async () => {
      try {
        const { order: current } = await getOrder(orderId, guestToken);
        if (cancelled) return;
        if (current.payment_status === "paid") {
          setIsProcessing(false);
          setSelectedMethod(null);
          onOpenChange(false);
          onPaymentComplete("success");
          return;
        }
        if (
          current.payment_status === "failed" ||
          current.payment_status === "refunded" ||
          current.status === "cancelled" ||
          current.status === "expired"
        ) {
          setIsProcessing(false);
          setSelectedMethod(null);
          onOpenChange(false);
          onPaymentComplete("failed");
          return;
        }
      } catch {
        // A transient read failure must not cancel a live payment attempt.
      }
      if (!cancelled && Date.now() - startedAt > 180_000) {
        setIsProcessing(false);
        setSelectedMethod(null);
        onOpenChange(false);
        onPaymentComplete("failed");
        return;
      }
      if (!cancelled) window.setTimeout(tick, 3000);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [isProcessing, open, orderId, guestToken, selectedMethod, onOpenChange, onPaymentComplete]);

  // Lock background scroll when payment modal is open
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

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setIsProcessing(false);
      setSelectedMethod(null);
      setBlockedUrl(null);
    }
  };

  /**
   * Hand the customer to the gateway. `PAY IN THE DEPOT` is not a Monnify
   * method — the order simply stays pending for a cashier to settle, so the
   * sheet closes and the terminal reports the hold as pending, not paid.
   */
  const handleSelectMethod = async (method: string) => {
    setSelectedMethod(method);
    setBlockedUrl(null);

    if (method === "DEPOT" || !orderId) {
      setIsProcessing(true);
      return;
    }

    setIsProcessing(true);

    // Open the destination tab *first*, synchronously, before the network call.
    // `window.open` only survives a browser's popup blocker while it is in the
    // direct call stack of the user's click; after an `await` it is treated as
    // an unsolicited popup and silently blocked, which left the customer on a
    // processing screen with no gateway.
    //
    // `noopener` is deliberately not passed: it makes `window.open` return
    // null, and we need the handle to seed the child tab's storage (below) and
    // navigate it. The opener link is severed by hand instead, which gives the
    // same isolation while keeping the reference.
    const gatewayTab = window.open("about:blank", "_blank");
    if (gatewayTab) {
      try {
        gatewayTab.opener = null;
      } catch {
        // Some browsers refuse the assignment; navigation still proceeds.
      }
    }

    try {
      const { authorization_url, reference, already_paid } =
        await initializePayment(orderId, guestToken);
      if (already_paid) {
        gatewayTab?.close();
        return; // the poll settles it on the next tick
      }
      // The return page reads these from session storage: the gateway sends
      // back only `?order=`, so the reference and the guest token cannot ride
      // in the query without becoming tamperable.
      rememberPaymentAttempt({ orderId, reference, guestToken });

      // sessionStorage is per-tab and a child opened here snapshotted it before
      // this attempt existed, so the gateway tab would return to /orders/verify
      // with nothing to verify with. Copy the record into it directly (it is
      // same-origin while blank) before sending it to Monnify.
      if (gatewayTab) {
        try {
          gatewayTab.sessionStorage.setItem(
            "u2gas_payment_attempts_v1",
            JSON.stringify({
              [orderId]: { orderId, reference, createdAt: Date.now() },
            }),
          );
          if (guestToken) {
            gatewayTab.sessionStorage.setItem("u2gas_payment_guest_v1", guestToken);
          }
        } catch {
          // If the copy is refused, the webhook still settles the order and the
          // opener tab still polls it.
        }
      }

      if (authorization_url && gatewayTab) {
        gatewayTab.location.href = authorization_url;
      } else if (authorization_url) {
        // The tab could not be reserved, so the popup was blocked. Tell the
        // customer instead of leaving them on a spinner, and offer a link they
        // can follow themselves.
        setBlockedUrl(authorization_url);
        setIsProcessing(false);
      }
    } catch {
      gatewayTab?.close();
      setIsProcessing(false);
      setSelectedMethod(null);
    }
  };

  const quantity =
    order && "gas_amount_kg" in order
      ? order.gas_amount_kg
      : order && "quantityKg" in order
        ? order.quantityKg
        : undefined;

  const total =
    order && "total_naira" in order
      ? order.total_naira
      : order && "totalNaira" in order
        ? order.totalNaira
        : undefined;

  const quantityText = quantity ? `${quantity}kg` : "10kg";
  const amountText =
    typeof total === "number" ? `₦${total.toLocaleString()}` : "₦10,000";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop to catch clicks outside the payment sheet */}
          <motion.div
            key="payment-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => handleOpenChange(false)}
            className="absolute inset-0 z-15 bg-black/15 cursor-pointer"
          />

          <motion.div
            key="payment-sheet"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 inset-x-0 z-20 w-full bg-white rounded-[64px] px-5 pt-3.5 pb-8 flex flex-col items-center gap-3.5 shadow-[0_-8px_32px_rgba(0,0,0,0.2)] border border-neutral-100/80"
          >
            {/* Drag Handle / Close Pill */}
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              aria-label="Close"
              className="w-12 h-1 bg-[#8E8E93] rounded-full hover:bg-neutral-600 transition-colors cursor-pointer"
            />

            <AnimatePresence mode="wait">
              {isProcessing ? (
                /* Processing View - Matches exact design */
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="w-full flex flex-col items-center gap-6 pt-2 pb-2"
                >
                  {/* Top section: Amount info on left, selected method on right */}
                  <div className="w-full flex items-center justify-between px-3">
                    {/* Left: KG & Amount pill */}
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-[38px] font-normal leading-none text-black">
                        {quantityText}
                      </span>
                      <span className="bg-brand-primary text-white text-[11px] px-3 py-0.5 rounded-full inline-flex items-center justify-center">
                        {amountText}
                      </span>
                    </div>

                    {/* Right: via + Method box */}
                    <div className="flex flex-col items-center">
                      <span className="text-[11px] text-neutral-400 mb-1 text-center">
                        via:
                      </span>
                      <PaymentOption
                        label={selectedMethod || "OPAY"}
                        rotation="rotate-[8deg]"
                        onClick={() => setIsProcessing(false)}
                      />
                    </div>
                  </div>

                  {/* Bottom: processing... button with animated dots */}
                  <div className="w-full flex flex-col items-center gap-2 pt-2">
                    <motion.div
                      animate={{
                        scale: [1, 1.02, 1],
                        boxShadow: [
                          "0 2px 10px rgba(117,130,235,0.25)",
                          "0 4px 18px rgba(117,130,235,0.55)",
                          "0 2px 10px rgba(117,130,235,0.25)",
                        ],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 2,
                        ease: "easeInOut",
                      }}
                      className="w-full max-w-[210px] py-3 rounded-full bg-[#7582EB] text-white text-[13px] tracking-wider flex items-center justify-center gap-0.5 shadow-xs cursor-default select-none"
                    >
                      <span>processing</span>
                      <span className="inline-flex tracking-tight">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            animate={{
                              opacity: [0.15, 1, 0.15],
                              y: [0, -2, 0],
                            }}
                            transition={{
                              repeat: Infinity,
                              duration: 1.1,
                              delay: i * 0.22,
                              ease: "easeInOut",
                            }}
                          >
                            .
                          </motion.span>
                        ))}
                      </span>
                    </motion.div>
                  </div>
                </motion.div>
              ) : (
                /* Payment Options View */
                <motion.div
                  key="options"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-full flex flex-col items-center gap-3.5"
                >
                  {/* Mode Toggle */}
                  <div className="flex border border-brand-primary rounded-[10px] p-0.5 bg-white mb-3">
                    <button
                      type="button"
                      onClick={() => setMode("walk-in")}
                      className={`px-4 py-1 rounded-[8px] text-[11px] tracking-wider transition-all cursor-pointer ${
                        mode === "walk-in"
                          ? "bg-brand-primary text-white"
                          : "text-brand-primary bg-transparent hover:bg-brand-primary/5"
                      }`}
                    >
                      WALK-IN
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("delivery")}
                      className={`px-4 py-1 rounded-[8px] text-[11px] tracking-wider transition-all cursor-pointer ${
                        mode === "delivery"
                          ? "bg-brand-primary text-white"
                          : "text-brand-primary bg-transparent hover:bg-brand-primary/5"
                      }`}
                    >
                      DELIVERY
                    </button>
                  </div>

                  {/* Delivery Section: Map */}
                  {mode === "delivery" && (
                    <div className="w-full h-28 mb-4  rounded-2xl overflow-hidden relative flex items-center justify-center shadow-xs">
                      <Image
                        src="/images/map.jpg"
                        alt="Delivery map"
                        fill
                        className="object-cover"
                      />
                      <button
                        type="button"
                        className="relative z-10 bg-brand-primary text-white text-[11px] px-5 py-2.5 rounded-[10px] cursor-pointer"
                      >
                        CONFIRM DELIVERY ADDRESS
                      </button>
                    </div>
                  )}

                  {/* Payment Options Label */}
                  <p className="text-[#B5B5B5] text-base tracking-[0.14em] uppercase mb-3">
                    PAYMENT OPTIONS
                  </p>

                  {blockedUrl && (
                    <div className="w-full flex flex-col items-center gap-2 mb-2">
                      <p className="text-[11px] tracking-wider text-[#B00020] text-center max-w-[280px]">
                        YOUR BROWSER BLOCKED THE PAYMENT TAB — OPEN IT BELOW
                      </p>
                      <a
                        href={blockedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setBlockedUrl(null)}
                        className="border border-brand-primary text-brand-primary rounded-full px-6 py-2 text-[12px] tracking-wider hover:bg-brand-primary/5 active:scale-95 transition-all"
                      >
                        OPEN PAYMENT PAGE
                      </a>
                    </div>
                  )}

                  {/* Cards for Delivery Mode */}
                  {mode === "delivery" ? (
                    <div className="flex justify-center items-start gap-5 w-full pt-2 pb-4 mb-3">
                      <PaymentOption
                        label={"BANK\nTRANS"}
                        rotation="-rotate-[13deg]"
                        onClick={() => handleSelectMethod("BANK\nTRANS")}
                      />
                      <PaymentOption
                        label="CARD"
                        rotation="rotate-[13deg] translate-y-7"
                        onClick={() => handleSelectMethod("CARD")}
                      />
                      <PaymentOption
                        label="OPAY"
                        rotation="rotate-[8deg]"
                        onClick={() => handleSelectMethod("OPAY")}
                      />
                    </div>
                  ) : (
                    /* Cards for Walk-in Mode */
                    <>
                      <div className="flex gap-5 justify-center items-center">
                        <PaymentOption
                          label={"BANK\nTRANS"}
                          rotation="-rotate-6"
                          onClick={() => handleSelectMethod("BANK\nTRANS")}
                        />
                        <PaymentOption
                          label="OPAY"
                          rotation="rotate-6"
                          onClick={() => handleSelectMethod("OPAY")}
                        />
                      </div>

                      {/* Walk-in: Pay in depot option */}
                      <p className="text-[#B5B5B5] text-xs">OR</p>
                      <button
                        type="button"
                        onClick={() => handleSelectMethod("DEPOT")}
                        className="border border-dashed border-[#B0B0B0] bg-white rounded-full px-8 py-3 text-xs tracking-wider text-black text-[20px] shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer"
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
  );
}

function PaymentOption({
  label,
  rotation = "",
  onClick,
}: {
  label: string;
  rotation?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-18.75 h-17.25 rounded-[18px] border border-dashed border-[#D1D5DB] bg-white flex items-center justify-center font-medium text-[24px] leading-[1.05] text-black text-center whitespace-pre-line shadow-[0_8px_20px_rgba(0,0,0,0.08)] hover:border-brand-primary hover:text-brand-primary transition-all active:scale-95 cursor-pointer ${rotation}`}
    >
      {label}
    </button>
  );
}
