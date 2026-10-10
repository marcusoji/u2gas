"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getOrder, verifyPayment } from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import {
  readPaymentAttempt,
  latestPaymentAttempt,
  forgetPaymentAttempt,
} from "@/lib/paymentSession";
import { paths } from "@/utils/paths";

/**
 * Where Monnify sends the browser back (`MONNIFY_CALLBACK_PATH`, `?order=`).
 *
 * The webhook is what actually marks an order paid; this page only makes a slow
 * webhook invisible to the customer, so it never reports failure on its own —
 * if the gateway has not settled yet it says so and lets them check again.
 * See docs/FRONTEND-API-CONTRACT.md §6.2.
 *
 * Two things are repaired here. The reference and guest token live in session
 * storage, which is per-tab: if the gateway was opened in a new tab and the
 * return did not land in that tab, there is no attempt record to read. That is
 * not a failure — the page falls back to reading the order (the webhook may
 * already have settled it). And when the gateway returns without echoing
 * `?order=`, the order id is recovered from the most recent attempt this tab
 * recorded rather than stranding the payment.
 */
type State = "confirming" | "paid" | "pending" | "unknown";

const POLL_MS = 3000;
const POLL_ATTEMPTS = 10;

export default function OrderVerifyPage() {
  return (
    <Suspense
      fallback={
        <main className="w-full min-h-[calc(100vh-80px)] flex items-center justify-center bg-white">
          <h1 className="font-barlow text-3xl tracking-tight">CHECKING PAYMENT</h1>
        </main>
      }
    >
      <VerifyResult />
    </Suspense>
  );
}

function VerifyResult() {
  const params = useSearchParams();
  const queryOrderId = params.get("order");

  // The stored attempt is read through useSyncExternalStore, which renders the
  // server snapshot (null) first and the real value after hydration. Reading it
  // directly during render would read `window` on the server and mismatch.
  const storedOrderId = useSyncExternalStore(
    () => () => {},
    () => latestPaymentAttempt()?.orderId ?? null,
    () => null,
  );
  // The query is authoritative; the stored attempt is the fallback for a return
  // the gateway sent back without echoing the order id.
  const orderId = queryOrderId ?? storedOrderId;

  const [state, setState] = useState<State>("confirming");
  const [message, setMessage] = useState<string | null>(null);

  // A return with no order id is not a payment in flight, so it is derived
  // during render rather than set from an effect.
  const resolved: State = orderId ? state : "unknown";

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;
    // May be null when the return landed in a tab that never saw initialize
    // (a new tab, or storage unavailable). Polling the order still settles it.
    const attempt = readPaymentAttempt(orderId);

    const settle = async () => {
      // Ask the gateway directly first: it can settle the order before the
      // webhook arrives.
      if (attempt) {
        try {
          const result = await verifyPayment(
            orderId,
            attempt.reference,
            attempt.guestToken,
          );
          if (!cancelled && result.paid) {
            forgetPaymentAttempt(orderId);
            setState("paid");
            return;
          }
        } catch (cause) {
          // A hard refusal is not a failed payment — keep polling.
          if (!(cause instanceof ApiError)) throw cause;
        }
      }

      for (let i = 0; i < POLL_ATTEMPTS && !cancelled; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (cancelled) return;
        try {
          const { order } = await getOrder(orderId, attempt?.guestToken);
          if (order.payment_status === "paid") {
            forgetPaymentAttempt(orderId);
            setState("paid");
            return;
          }
          if (
            order.payment_status === "failed" ||
            order.status === "cancelled" ||
            order.status === "expired"
          ) {
            setMessage("THE PAYMENT DID NOT GO THROUGH");
            setState("unknown");
            return;
          }
        } catch {
          // Keep polling: a transient read failure is not a verdict.
        }
      }
      if (!cancelled) setState("pending");
    };

    void settle();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const headline =
    resolved === "paid"
      ? "PAYMENT CONFIRMED"
      : resolved === "pending"
        ? "STILL CONFIRMING"
        : resolved === "unknown"
          ? "PAYMENT NOT CONFIRMED"
          : "CHECKING PAYMENT";

  return (
    <main className="w-full min-h-[calc(100vh-80px)] flex flex-col items-center justify-center gap-6 px-8 bg-white text-center select-none">
      <h1 className="font-barlow text-3xl tracking-tight">{headline}</h1>
      <p className="text-xs tracking-widest uppercase text-neutral-500 max-w-sm">
        {message ??
          (resolved === "pending"
            ? "The bank has not confirmed yet. Your order stays held and will update automatically."
            : "This usually takes a moment.")}
      </p>
      <Link
        href={paths.home}
        className="text-xs tracking-widest uppercase underline underline-offset-4"
      >
        Back to terminal
      </Link>
    </main>
  );
}
