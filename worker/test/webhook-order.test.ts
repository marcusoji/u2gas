import { describe, expect, it, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../src/types";
import { hmacSha512Hex } from "../src/lib/crypto";
import payments from "../src/routes/payments";

/**
 * The webhook's ordering contract (Part 12).
 *
 * The route previously used the event insert itself as the idempotency gate and
 * marked the event processed whether or not processing succeeded — so a
 * transient database error recorded the event as handled, the gateway's retry
 * hit the duplicate check, and the charge was lost.
 *
 * These tests drive the real route with a fake database and assert the order of
 * side effects: process first, mark processed only after the work committed,
 * and on failure leave processed_at null (finish with an error) and answer 500
 * so the gateway retries.
 */

const SECRET = "sk_test_webhook_secret";
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const REFERENCE = "U2-100001-DEADBEEF";
const TOTAL_KOBO = 1_400_00; // ₦1,400

/** Records every rpc/from call so the test can assert what ran and in what order. */
function makeAdmin(opts: {
  claimState: "claimed" | "processed" | "in_flight";
  confirm?: "ok" | "throw";
}) {
  const calls: string[] = [];
  const finishArgs: any[] = [];

  const builder: any = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: any) => resolve({ data: null, error: null }),
  };

  const admin: any = {
    from(table: string) {
      calls.push(`from:${table}`);
      if (table === "order") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { total_kobo: TOTAL_KOBO, status: "pending" },
                  error: null,
                }),
            }),
          }),
        };
      }
      return builder;
    },
    async rpc(fn: string, args: any) {
      calls.push(`rpc:${fn}`);
      if (fn === "claim_webhook_event") {
        return { data: { state: opts.claimState }, error: null };
      }
      if (fn === "finish_webhook_event") {
        finishArgs.push(args);
        return { data: null, error: null };
      }
      if (fn === "confirm_payment") {
        if (opts.confirm === "throw") {
          return { data: null, error: { message: "deadlock detected", code: "40P01" } };
        }
        return {
          data: { payment_id: "pay-1", already_processed: false, orphaned: false },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  return { admin, calls, finishArgs };
}

function buildApp(admin: any) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("admin", admin);
    await next();
  });
  app.route("/payments", payments);
  return app;
}

function webhookBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    eventType: "SUCCESSFUL_TRANSACTION",
    eventData: {
      paymentReference: REFERENCE,
      paymentStatus: "PAID",
      currency: "NGN",
      amountPaid: "1400.00",
      metaData: { order_id: ORDER_ID },
      ...overrides,
    },
  });
}

async function post(app: Hono<AppEnv>, body: string) {
  const signature = await hmacSha512Hex(SECRET, body);
  return app.request(
    "/payments/webhook/monnify",
    {
      method: "POST",
      body,
      headers: { "monnify-signature": signature, "content-type": "application/json" },
    },
    { MONNIFY_SECRET_KEY: SECRET },
  );
}

describe("monnify webhook processing order", () => {
  it("marks the event processed only after the payment is confirmed", async () => {
    const { admin, calls, finishArgs } = makeAdmin({ claimState: "claimed", confirm: "ok" });
    const res = await post(buildApp(admin), webhookBody());

    expect(res.status).toBe(200);
    // The payment was confirmed before the event was closed.
    const confirmAt = calls.indexOf("rpc:confirm_payment");
    const finishAt = calls.indexOf("rpc:finish_webhook_event");
    expect(confirmAt).toBeGreaterThanOrEqual(0);
    expect(finishAt).toBeGreaterThan(confirmAt);
    // Closed with no error, i.e. processed_at is set.
    expect(finishArgs.at(-1)).toMatchObject({ p_provider: "monnify" });
    expect(finishArgs.at(-1).p_error ?? null).toBeNull();
  });

  it("does not mark the event processed when confirmation fails", async () => {
    const { admin, finishArgs } = makeAdmin({ claimState: "claimed", confirm: "throw" });
    const res = await post(buildApp(admin), webhookBody());

    // 500 so Monnify retries, and the event is released with an error rather
    // than closed — processed_at stays null.
    expect(res.status).toBe(500);
    expect(finishArgs.at(-1).p_error).toBeTruthy();
  });

  it("answers a duplicate without processing it again", async () => {
    const { admin, calls } = makeAdmin({ claimState: "processed" });
    const res = await post(buildApp(admin), webhookBody());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    // The authoritative work must not run for an event already handled.
    expect(calls).not.toContain("rpc:confirm_payment");
    expect(calls).not.toContain("rpc:finish_webhook_event");
  });

  it("answers 409 for a concurrent delivery so the gateway retries", async () => {
    const { admin, calls } = makeAdmin({ claimState: "in_flight" });
    const res = await post(buildApp(admin), webhookBody());

    expect(res.status).toBe(409);
    expect(calls).not.toContain("rpc:confirm_payment");
  });

  it("rejects a body whose signature does not match", async () => {
    const { admin, calls } = makeAdmin({ claimState: "claimed" });
    const res = await buildApp(admin).request(
      "/payments/webhook/monnify",
      {
        method: "POST",
        body: webhookBody(),
        headers: { "monnify-signature": "deadbeef", "content-type": "application/json" },
      },
      { MONNIFY_SECRET_KEY: SECRET },
    );

    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});
