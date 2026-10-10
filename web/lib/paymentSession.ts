/**
 * The gateway returns the browser to /orders/verify with only `?order=` in the
 * query, so the merchant reference and the guest capability token have to
 * survive the round trip somewhere the URL cannot be tampered with. Both are
 * kept here — session storage, cleared when the tab closes — rather than in the
 * query, which is the contract in docs/FRONTEND-API-CONTRACT.md §6.2.
 *
 * The store is a map keyed by order id, not a single slot: a customer can start
 * a second payment without finishing the first, and a return for the older
 * order must still find its own reference. A single slot let the newer attempt
 * overwrite the older one, so the older return had no reference to verify with.
 *
 * `sessionStorage` is per-tab. When the gateway opens in a new tab, the return
 * lands in *that* tab, which never saw `rememberPaymentAttempt`. The page
 * therefore has to tolerate a missing record (fall back to the webhook and to
 * polling the order) rather than treat it as a failure — and
 * `latestPaymentAttempt` lets a return that arrives without `?order=` recover
 * the attempt the customer just made.
 */
const ATTEMPTS_KEY = "u2gas_payment_attempts_v1";
const GUEST_KEY = "u2gas_payment_guest_v1";

export interface PaymentAttempt {
  orderId: string;
  reference: string;
  guestToken?: string;
}

interface StoredAttempt {
  orderId: string;
  reference: string;
  createdAt: number;
}

/** Attempts older than this are pruned; a checkout does not span hours. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function readAll(): Record<string, StoredAttempt> {
  try {
    const raw = window.sessionStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredAttempt>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(attempts: Record<string, StoredAttempt>): void {
  try {
    window.sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch {
    // Private mode without storage: the return page falls back to the webhook.
  }
}

export function rememberPaymentAttempt(attempt: PaymentAttempt): void {
  if (typeof window === "undefined" || !attempt.orderId) return;
  const attempts = readAll();
  const now = Date.now();

  for (const [id, stored] of Object.entries(attempts)) {
    if (now - stored.createdAt > MAX_AGE_MS || id === attempt.orderId) {
      delete attempts[id];
    }
  }

  attempts[attempt.orderId] = {
    orderId: attempt.orderId,
    reference: attempt.reference,
    createdAt: now,
  };
  writeAll(attempts);

  if (attempt.guestToken) {
    try {
      window.sessionStorage.setItem(GUEST_KEY, attempt.guestToken);
    } catch {
      // Non-fatal: the order read still works for a signed-in customer.
    }
  }
}

function hydrate(stored: StoredAttempt | undefined, orderId: string): PaymentAttempt | null {
  if (!stored || stored.orderId !== orderId || !stored.reference) return null;
  let guestToken: string | undefined;
  try {
    guestToken = window.sessionStorage.getItem(GUEST_KEY) ?? undefined;
  } catch {
    guestToken = undefined;
  }
  return { orderId, reference: stored.reference, guestToken };
}

export function readPaymentAttempt(orderId: string): PaymentAttempt | null {
  if (typeof window === "undefined" || !orderId) return null;
  return hydrate(readAll()[orderId], orderId);
}

/**
 * The most recent attempt this tab recorded. Used when the gateway returns to
 * the callback without echoing `?order=` — the return still has an order to
 * settle, and dropping it would strand the payment.
 */
export function latestPaymentAttempt(): PaymentAttempt | null {
  if (typeof window === "undefined") return null;
  const attempts = readAll();
  let newest: StoredAttempt | undefined;
  for (const stored of Object.values(attempts)) {
    if (!newest || stored.createdAt > newest.createdAt) newest = stored;
  }
  return newest ? hydrate(newest, newest.orderId) : null;
}

/** Forget one attempt (its order settled), or every attempt when called bare. */
export function forgetPaymentAttempt(orderId?: string): void {
  if (typeof window === "undefined") return;
  if (!orderId) {
    try {
      window.sessionStorage.removeItem(ATTEMPTS_KEY);
      window.sessionStorage.removeItem(GUEST_KEY);
    } catch {
      // Nothing to clear.
    }
    return;
  }

  const attempts = readAll();
  if (!(orderId in attempts)) return;
  delete attempts[orderId];
  writeAll(attempts);
  // The guest token is not keyed by order, so it is only cleared when the map
  // empties — one guest may have two orders in flight at once.
  if (Object.keys(attempts).length === 0) {
    try {
      window.sessionStorage.removeItem(GUEST_KEY);
    } catch {
      // Nothing to clear.
    }
  }
}
