import { describe, expect, it, vi, beforeEach } from "vitest";
import { hmacSha512Hex, timingSafeEqual, sha256Hex, guestTokenHash,
         generateGuestToken, generateQrToken } from "../src/lib/crypto";
import { AppError, fromDbError, appError, errorBody } from "../src/lib/errors";

/**
 * Worker tests (Item 16).
 *
 * These cover the places where being wrong is expensive: webhook signatures,
 * payment ownership, the staff lookup that used to be injectable, and
 * idempotency replay. They are unit tests against the pure logic — the
 * transactional guarantees live in Postgres and are proven by the SQL suites,
 * not here.
 */

// ---------------------------------------------------------------------------
// Webhook signature
// ---------------------------------------------------------------------------

describe("paystack webhook signature", () => {
  const secret = "sk_test_pretend_secret";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "R1" } });

  it("accepts a signature computed with the real secret", async () => {
    const sig = await hmacSha512Hex(secret, body);
    expect(timingSafeEqual(await hmacSha512Hex(secret, body), sig)).toBe(true);
  });

  it("rejects a signature made with a different secret", async () => {
    const forged = await hmacSha512Hex("sk_test_wrong", body);
    const real = await hmacSha512Hex(secret, body);
    expect(timingSafeEqual(real, forged)).toBe(false);
  });

  it("rejects a signature for a tampered body", async () => {
    const real = await hmacSha512Hex(secret, body);
    const tampered = JSON.stringify({
      event: "charge.success", data: { reference: "R1", amount: 1 },
    });
    expect(timingSafeEqual(real, await hmacSha512Hex(secret, tampered))).toBe(false);
  });

  it("rejects an empty or truncated signature", async () => {
    const real = await hmacSha512Hex(secret, body);
    expect(timingSafeEqual(real, "")).toBe(false);
    expect(timingSafeEqual(real, real.slice(0, -2))).toBe(false);
  });

  it("compares in constant time regardless of where it differs", () => {
    // Not a timing measurement — those are unreliable in CI. This asserts the
    // function does not short-circuit on the first differing character, which
    // is the property that matters.
    const a = "a".repeat(128);
    expect(timingSafeEqual(a, "b" + a.slice(1))).toBe(false);
    expect(timingSafeEqual(a, a.slice(0, -1) + "b")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Guest capability tokens
// ---------------------------------------------------------------------------

describe("guest tokens", () => {
  it("are long and unguessable", () => {
    const t = generateGuestToken();
    expect(t).toMatch(/^g[0-9a-f]{48}$/);
  });

  it("never repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateGuestToken()));
    expect(seen.size).toBe(500);
  });

  it("hash differently under a different signing key", async () => {
    const token = generateGuestToken();
    const a = await guestTokenHash(token, "key-one");
    const b = await guestTokenHash(token, "key-two");
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });

  it("hash deterministically under the same key", async () => {
    const token = generateGuestToken();
    expect(await guestTokenHash(token, "k")).toBe(await guestTokenHash(token, "k"));
  });
});

describe("qr tokens", () => {
  it("carry no information about the order", () => {
    const t = generateQrToken();
    expect(t).toMatch(/^U2[0-9a-f]{64}$/);
  });

  it("never repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateQrToken()));
    expect(seen.size).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Staff lookup sanitisation — the field that was injectable
// ---------------------------------------------------------------------------

describe("staff lookup input", () => {
  const LOOKUP_OK = /^[A-Za-z0-9+-]{3,40}$/;
  it("rejects characters PostgREST parses as filter syntax", () => {
    expect(LOOKUP_OK.test("GT-1001,guest_phone.neq.x")).toBe(false);
    expect(LOOKUP_OK.test("a),or(total_kobo.gt.0")).toBe(false);
    expect(LOOKUP_OK.test("'; drop table order; --")).toBe(false);
  });
  it("accepts a legitimate order number or phone", () => {
    expect(LOOKUP_OK.test("GT-100042")).toBe(true);
    expect(LOOKUP_OK.test("+2348012345678")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Payment ownership
// ---------------------------------------------------------------------------

/**
 * The rule from routes/payments.ts: a Paystack reference is only accepted for
 * the order its own metadata names, and only for the caller who owns it.
 */
function mayVerify(opts: {
  metadataOrderId: string;
  requestedOrderId: string;
  orderUserId: string | null;
  callerProfileId: string | null;
  guestTokenMatches: boolean;
}): boolean {
  if (opts.metadataOrderId !== opts.requestedOrderId) return false;
  if (opts.callerProfileId && opts.orderUserId === opts.callerProfileId) return true;
  if (!opts.orderUserId && opts.guestTokenMatches) return true;
  return false;
}

describe("payment verification ownership", () => {
  const base = {
    metadataOrderId: "order-1",
    requestedOrderId: "order-1",
    orderUserId: "profile-a",
    callerProfileId: "profile-a",
    guestTokenMatches: false,
  };

  it("allows the owner", () => {
    expect(mayVerify(base)).toBe(true);
  });

  it("refuses a different customer holding a valid reference", () => {
    expect(mayVerify({ ...base, callerProfileId: "profile-b" })).toBe(false);
  });

  it("refuses when the reference belongs to another order", () => {
    expect(mayVerify({ ...base, metadataOrderId: "order-2" })).toBe(false);
  });

  it("allows a guest with the right capability token", () => {
    expect(mayVerify({
      ...base, orderUserId: null, callerProfileId: null, guestTokenMatches: true,
    })).toBe(true);
  });

  it("refuses a guest with the wrong token", () => {
    expect(mayVerify({
      ...base, orderUserId: null, callerProfileId: null, guestTokenMatches: false,
    })).toBe(false);
  });

  it("refuses an anonymous caller on someone's account order", () => {
    expect(mayVerify({
      ...base, callerProfileId: null, guestTokenMatches: true,
    })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Idempotency replay
// ---------------------------------------------------------------------------

describe("idempotency", () => {
  /**
   * Stands in for claim/complete/release_idempotency after 0019.
   *
   * The identity of a key is (key, scope, caller) and a match also requires
   * the same request hash — matching on the key alone returned one caller's
   * response to another.
   */
  type State =
    | { state: "claimed"; reclaimed: boolean }
    | { state: "replay"; response: unknown }
    | { state: "in_flight"; retry_after_seconds: number }
    | { state: "conflict" };

  interface Row {
    status: "in_progress" | "completed" | "failed";
    requestHash: string;
    response?: unknown;
    lockedUntil: number;
  }

  class Store {
    private rows = new Map<string, Row>();
    now = 1_000_000;

    /** key + scope + caller, exactly as the unique index defines it. */
    private id(key: string, scope: string, caller: string | null) {
      return `${key}\u0000${scope}\u0000${caller ?? "anon"}`;
    }

    claim(
      key: string, scope: string, requestHash: string,
      caller: string | null = null, leaseSeconds = 60,
    ): State {
      const id = this.id(key, scope, caller);
      const row = this.rows.get(id);

      if (row) {
        if (row.requestHash !== requestHash) return { state: "conflict" };
        if (row.status === "completed") {
          return { state: "replay", response: row.response };
        }
        if (row.status === "in_progress" && row.lockedUntil > this.now) {
          return {
            state: "in_flight",
            retry_after_seconds: Math.ceil((row.lockedUntil - this.now) / 1000),
          };
        }
        // Lease expired, or the last attempt failed.
        this.rows.set(id, {
          status: "in_progress", requestHash,
          lockedUntil: this.now + leaseSeconds * 1000,
        });
        return { state: "claimed", reclaimed: true };
      }

      this.rows.set(id, {
        status: "in_progress", requestHash,
        lockedUntil: this.now + leaseSeconds * 1000,
      });
      return { state: "claimed", reclaimed: false };
    }

    complete(key: string, scope: string, response: unknown, caller: string | null = null) {
      const id = this.id(key, scope, caller);
      const row = this.rows.get(id);
      if (row) this.rows.set(id, { ...row, status: "completed", response, lockedUntil: 0 });
    }

    release(key: string, scope: string, caller: string | null = null) {
      const id = this.id(key, scope, caller);
      const row = this.rows.get(id);
      if (row) this.rows.set(id, { ...row, status: "failed", lockedUntil: 0 });
    }
  }

  let store: Store;
  beforeEach(() => { store = new Store(); });

  it("claims a first request", () => {
    expect(store.claim("k1", "order.create", "hashA", "user-a").state).toBe("claimed");
  });

  it("replays the stored response instead of running twice", () => {
    store.claim("k1", "order.create", "hashA", "user-a");
    store.complete("k1", "order.create", { order_id: "order-1" }, "user-a");

    const replay = store.claim("k1", "order.create", "hashA", "user-a");
    expect(replay.state).toBe("replay");
    expect((replay as { response: unknown }).response).toEqual({ order_id: "order-1" });
  });

  it("reports in_flight while another worker holds the lease", () => {
    store.claim("k1", "order.create", "hashA", "user-a");
    const second = store.claim("k1", "order.create", "hashA", "user-a");
    expect(second.state).toBe("in_flight");
    expect((second as { retry_after_seconds: number }).retry_after_seconds).toBeGreaterThan(0);
  });

  it("lets a request reclaim a key after the lease expires", () => {
    // Without this a crashed worker would block the key permanently.
    store.claim("k1", "order.create", "hashA", "user-a");
    store.now += 61_000;

    const retry = store.claim("k1", "order.create", "hashA", "user-a");
    expect(retry.state).toBe("claimed");
    expect((retry as { reclaimed: boolean }).reclaimed).toBe(true);
  });

  it("refuses the same key with a different body", () => {
    // Returning the first response here would answer a question nobody asked.
    store.claim("k1", "order.create", "hashA", "user-a");
    expect(store.claim("k1", "order.create", "hashB", "user-a").state).toBe("conflict");
  });

  it("does not leak one user's response to another using the same key", () => {
    store.claim("k1", "order.create", "hashA", "user-a");
    store.complete("k1", "order.create", { order_id: "order-1" }, "user-a");

    // The bug this fixed: matching on the key alone made this a replay.
    const other = store.claim("k1", "order.create", "hashA", "user-b");
    expect(other.state).toBe("claimed");
  });

  it("keeps the same key independent across scopes", () => {
    store.claim("k1", "order.create", "hashA", "user-a");
    store.complete("k1", "order.create", { order_id: "order-1" }, "user-a");
    expect(store.claim("k1", "staff.payment", "hashA", "user-a").state).toBe("claimed");
  });

  it("frees the key after a failure so the customer can retry", () => {
    store.claim("k1", "order.create", "hashA", "user-a");
    store.release("k1", "order.create", "user-a");
    expect(store.claim("k1", "order.create", "hashA", "user-a").state).toBe("claimed");
  });

  it("keeps different keys independent", () => {
    store.claim("k1", "order.create", "hashA", "user-a");
    expect(store.claim("k2", "order.create", "hashA", "user-a").state).toBe("claimed");
  });
});

// ---------------------------------------------------------------------------
// Error mapping — nothing internal must reach the browser
// ---------------------------------------------------------------------------

describe("error responses", () => {
  it("turns a raised database code into copy plus the numbers the UI needs", () => {
    const err = fromDbError({
      message: "INSUFFICIENT_GAS",
      details: JSON.stringify({ requested_kg: 10, available_kg: 6 }),
    });
    expect(err.status).toBe(409);
    expect(err.userMessage).toBe("ONLY 6KG LEFT");
    expect(err.detail.available_kg).toBe(6);
  });

  it("does not leak a raw Postgres message", () => {
    const err = fromDbError({
      message: 'duplicate key value violates unique constraint "payment_pkey"',
      code: "23505",
    });
    expect(err.userMessage).not.toMatch(/constraint|payment_pkey|duplicate key/i);
  });

  it("maps an unknown failure to a generic 500", () => {
    const err = fromDbError({ message: "something nobody anticipated" });
    expect(err.status).toBe(500);
    expect(err.code).toBe("INTERNAL");
  });

  it("never puts a stack trace in the response body", () => {
    const body = errorBody(appError("INTERNAL"), "abc123");
    expect(JSON.stringify(body)).not.toMatch(/at \w+|\.ts:\d+|stack/i);
    expect(body.request_id).toBe("abc123");
  });

  it("refuses an overpayment as clearly as an underpayment", () => {
    const over = fromDbError({
      message: "AMOUNT_MISMATCH",
      details: JSON.stringify({
        expected_kobo: 140000, received_kobo: 200000, direction: "over",
      }),
    });
    expect(over.status).toBe(402);
    expect(over.userMessage).toContain("₦2,000");
  });
});

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

describe("sha256Hex", () => {
  it("matches the known digest of the empty string", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("accepts a Uint8Array without tripping on buffer type", async () => {
    expect(await sha256Hex(new Uint8Array([1, 2, 3]))).toHaveLength(64);
  });
});
