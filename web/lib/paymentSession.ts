/**
 * The gateway returns the browser to /orders/verify with only `?order=` in the
 * query, so the merchant reference and the guest capability token have to
 * survive the round trip somewhere the URL cannot be tampered with. Both are
 * kept here — session storage, cleared when the tab closes — rather than in the
 * query, which is the contract in docs/FRONTEND-API-CONTRACT.md §6.2.
 */
const REFERENCE_KEY = "u2gas_payment_reference_v1";
const GUEST_KEY = "u2gas_payment_guest_v1";

export interface PaymentAttempt {
  orderId: string;
  reference: string;
  guestToken?: string;
}

export function rememberPaymentAttempt(attempt: PaymentAttempt): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      REFERENCE_KEY,
      JSON.stringify({ orderId: attempt.orderId, reference: attempt.reference }),
    );
    if (attempt.guestToken) {
      window.sessionStorage.setItem(GUEST_KEY, attempt.guestToken);
    }
  } catch {
    // Private mode without storage: the return page falls back to the webhook.
  }
}

export function readPaymentAttempt(orderId: string): PaymentAttempt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(REFERENCE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { orderId?: string; reference?: string };
    if (stored.orderId !== orderId || !stored.reference) return null;
    return {
      orderId,
      reference: stored.reference,
      guestToken: window.sessionStorage.getItem(GUEST_KEY) ?? undefined,
    };
  } catch {
    return null;
  }
}

export function forgetPaymentAttempt(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(REFERENCE_KEY);
    window.sessionStorage.removeItem(GUEST_KEY);
  } catch {
    // Nothing to clear.
  }
}
