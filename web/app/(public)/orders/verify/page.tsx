"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import TerminalScreenBox from "@/components/terminal-screen-box";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError } from "@/lib/api";
import {
  readGuestToken,
  readPendingReference,
  clearPendingReference,
} from "@/lib/payment-return";
import { paths } from "@/utils/paths";
import type { Order } from "@/types";

/**
 * The gateway return URL (`MONNIFY_CALLBACK_PATH` in the Worker).
 *
 * After paying, Monnify redirects here with `?order=<order_id>`. The order is
 * marked paid by the **webhook**, never by this page, so a "not paid yet" is
 * usually just the webhook arriving a beat behind the browser. The page
 * therefore asks the Worker to verify (which queries the gateway itself and,
 * on a real success, records it idempotently) and, if the gateway is not done,
 * re-reads the order a few times before showing a "still confirming" state.
 *
 * It never trusts the query string alone: verification is server-side and
 * ownership is proven by the session or the guest capability token.
 */

type Phase = "checking" | "paid" | "pending" | "failed" | "closed";

/** How many times to re-check while the webhook catches up, and how often. */
const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 2500;

/** Monnify echoes our merchant reference on return, under one of these names. */
const REFERENCE_PARAMS = ["paymentReference", "reference", "txref"];

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("order") ?? params.get("order_id") ?? "";

  const [phase, setPhase] = useState<Phase>(orderId ? "checking" : "failed");
  const [order, setOrder] = useState<Order | null>(null);
  // Only ever set at initialisation: there is nothing to verify without an id.
  const [reason] = useState<string | null>(
    orderId ? null : "NO ORDER TO VERIFY",
  );
  const attempts = useRef(0);
  // The retry loop re-enters settlement after a delay; holding it in a ref
  // avoids the callback referring to itself before it is declared.
  const settlementRef = useRef<() => Promise<void>>(async () => {});

  const loadOrder = useCallback(
    async (token?: string): Promise<Order | null> => {
      try {
        const { order: o } = await api.order(orderId, token);
        setOrder(o);
        return o;
      } catch {
        return null;
      }
    },
    [orderId],
  );

  const settlement = useCallback(async () => {
    // No order to act on; the initial phase already says so.
    if (!orderId) return;

    const token = readGuestToken(orderId);
    const reference =
      REFERENCE_PARAMS.map((k) => params.get(k)).find(Boolean) ??
      readPendingReference(orderId) ??
      null;

    // Ask the gateway directly when we hold a reference. This is what turns a
    // return visit into a confirmed payment even if the webhook is slow.
    if (reference) {
      try {
        const result = await api.payVerify(reference, orderId, token);
        if (result.paid) {
          clearPendingReference(orderId);
          setPhase("paid");
          void loadOrder(token);
          return;
        }
      } catch (e) {
        // A closed order is a settled outcome, not a transient error.
        if (e instanceof ApiError && e.code === "ORDER_ALREADY_CLOSED") {
          setPhase("closed");
          void loadOrder(token);
          return;
        }
        // Otherwise fall through to the status check below; the gateway may
        // simply not be reporting a success yet.
      }
    }

    const current = await loadOrder(token);
    if (current?.payment_status === "paid") {
      setPhase("paid");
      return;
    }
    if (current && ["cancelled", "expired"].includes(current.status)) {
      setPhase("closed");
      return;
    }

    if (attempts.current < POLL_ATTEMPTS) {
      attempts.current += 1;
      setTimeout(() => void settlementRef.current(), POLL_INTERVAL_MS);
      return;
    }
    setPhase("pending");
  }, [orderId, params, loadOrder]);

  useEffect(() => {
    settlementRef.current = settlement;
  }, [settlement]);

  // Kick off once when there is an order to settle. The work runs through a
  // promise chain (the same shape as `useAsync`), so the state updates land
  // asynchronously rather than synchronously inside the effect.
  useEffect(() => {
    if (!orderId) return;
    attempts.current = 0;
    void Promise.resolve().then(() => settlement());
  }, [orderId, settlement]);

  return (
    <main className="w-full min-h-[calc(100vh-80px)] flex flex-col items-center bg-white px-4 py-10 select-none">
      <div className="w-full max-w-[380px] flex flex-col items-center text-center">
        {phase === "checking" && <Loading label="CONFIRMING YOUR PAYMENT…" />}

        {(phase === "paid" || phase === "failed") && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center"
          >
            <div className="relative w-52 h-70 max-w-full flex items-center justify-center mb-4">
              <Image
                src={phase === "paid" ? "/images/success.png" : "/images/failed.png"}
                alt={phase === "paid" ? "Payment successful" : "Payment failed"}
                fill
                className="object-contain drop-shadow-[0_16px_32px_rgba(0,0,0,0.35)]"
                priority
              />
            </div>
            <TerminalScreenBox
              value={phase === "paid" ? "SUCCESS!!" : "FAILED!!"}
              variant={phase === "paid" ? "green" : "red"}
            />
            <p className="mt-5 font-mono text-[12px] tracking-widest uppercase text-[#1317E4]">
              {phase === "paid"
                ? "THANK YOU — YOUR ORDER IS PAID"
                : reason ?? "WE COULDN'T CONFIRM THAT PAYMENT"}
            </p>
            {order && (
              <p className="mt-1 font-mono text-[11px] tracking-wider uppercase text-[#838EF8]">
                {order.order_number}
              </p>
            )}
          </motion.div>
        )}

        {phase === "pending" && (
          <>
            <TerminalScreenBox value="PROCESSING…" variant="green" />
            <p className="mt-5 font-mono text-[12px] tracking-widest uppercase text-[#1317E4]">
              WE&rsquo;RE STILL CONFIRMING YOUR PAYMENT
            </p>
            <p className="mt-1 font-mono text-[11px] tracking-wide uppercase text-[#838EF8]">
              If you were debited, your order will settle shortly — check HISTORY
              in a moment.
            </p>
          </>
        )}

        {phase === "closed" && (
          <ScreenNotice tone="error">THIS ORDER IS NO LONGER OPEN</ScreenNotice>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(paths.home)}
            className="px-6 py-2.5 rounded-full bg-[#1317E4] text-white text-[12px] font-mono tracking-wider uppercase shadow-xs active:scale-95 transition-all"
          >
            BACK TO TERMINAL
          </button>
          <button
            type="button"
            onClick={() => void settlement()}
            className="text-[11px] font-mono tracking-wider uppercase text-[#838EF8] hover:text-[#1317E4] transition-colors"
          >
            CHECK AGAIN
          </button>
        </div>
      </div>
    </main>
  );
}

export default function OrdersVerifyPage() {
  // useSearchParams needs a Suspense boundary for a statically exported route.
  return (
    <Suspense fallback={<Loading label="LOADING…" />}>
      <VerifyInner />
    </Suspense>
  );
}
