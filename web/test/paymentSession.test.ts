import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * The payment-return session store.
 *
 * These lock in the two defects that made a return from the gateway unusable:
 * a single storage slot that a second attempt overwrote, and the lack of any
 * way to recover the order id when the gateway does not echo `?order=`.
 */

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

// The module reads `window.sessionStorage`; give Node a stand-in before import.
const storage = new MemoryStorage();
(globalThis as unknown as { window: { sessionStorage: MemoryStorage } }).window = {
  sessionStorage: storage,
};

const {
  rememberPaymentAttempt,
  readPaymentAttempt,
  latestPaymentAttempt,
  forgetPaymentAttempt,
} = await import("../lib/paymentSession");

const ORDER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORDER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  storage.clear();
  vi.useRealTimers();
});

describe("payment attempt session store", () => {
  it("round-trips an attempt for its own order", () => {
    rememberPaymentAttempt({ orderId: ORDER_A, reference: "U2-1-ABC" });
    expect(readPaymentAttempt(ORDER_A)).toMatchObject({
      orderId: ORDER_A,
      reference: "U2-1-ABC",
    });
  });

  it("keeps two attempts for two orders instead of overwriting", () => {
    rememberPaymentAttempt({ orderId: ORDER_A, reference: "REF-A" });
    rememberPaymentAttempt({ orderId: ORDER_B, reference: "REF-B" });

    expect(readPaymentAttempt(ORDER_A)?.reference).toBe("REF-A");
    expect(readPaymentAttempt(ORDER_B)?.reference).toBe("REF-B");
  });

  it("returns null for an order it never recorded", () => {
    rememberPaymentAttempt({ orderId: ORDER_A, reference: "REF-A" });
    expect(readPaymentAttempt(ORDER_B)).toBeNull();
  });

  it("carries the guest token alongside the reference", () => {
    rememberPaymentAttempt({
      orderId: ORDER_A,
      reference: "REF-A",
      guestToken: "g-deadbeef",
    });
    expect(readPaymentAttempt(ORDER_A)?.guestToken).toBe("g-deadbeef");
  });

  it("forgets one order without disturbing the other", () => {
    rememberPaymentAttempt({ orderId: ORDER_A, reference: "REF-A" });
    rememberPaymentAttempt({ orderId: ORDER_B, reference: "REF-B" });

    forgetPaymentAttempt(ORDER_A);

    expect(readPaymentAttempt(ORDER_A)).toBeNull();
    expect(readPaymentAttempt(ORDER_B)?.reference).toBe("REF-B");
  });

  it("exposes the newest attempt for a return with no ?order=", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    rememberPaymentAttempt({ orderId: ORDER_A, reference: "REF-A" });

    vi.setSystemTime(new Date("2026-01-01T00:05:00Z"));
    rememberPaymentAttempt({ orderId: ORDER_B, reference: "REF-B" });

    expect(latestPaymentAttempt()?.orderId).toBe(ORDER_B);
  });

  it("prunes an attempt once it is stale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    rememberPaymentAttempt({ orderId: ORDER_A, reference: "REF-A" });

    // Seven hours later: past the six-hour horizon.
    vi.setSystemTime(new Date("2026-01-01T07:00:00Z"));
    rememberPaymentAttempt({ orderId: ORDER_B, reference: "REF-B" });

    expect(readPaymentAttempt(ORDER_A)).toBeNull();
    expect(readPaymentAttempt(ORDER_B)?.reference).toBe("REF-B");
  });
});
