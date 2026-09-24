import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Ctx } from "../types";
import { rpc, select } from "../lib/db";
import { appError, AppError } from "../lib/errors";
import { rateLimit } from "../middleware/ratelimit";
import { hmacSha512Hex, timingSafeEqual, paymentReference, guestTokenHash } from "../lib/crypto";

const payments = new Hono<AppEnv>();

const PAYSTACK = "https://api.paystack.co";

/**
 * Establish that the caller owns this order (Part 14).
 *
 * Both payment endpoints previously trusted a Paystack reference on its own,
 * so anyone holding a valid reference could drive the flow for an order that
 * was not theirs. Ownership is now proven by session or guest token first.
 */
async function ownsOrder(c: Ctx, orderId: string): Promise<boolean> {
  const caller = c.get("caller");

  if (caller) {
    const row = await select<any>(
      c.get("admin").from("order").select("user_id").eq("order_id", orderId).maybeSingle(),
    );
    if (!row) return false;
    if (row.user_id === caller.profileId) return true;
    // Staff act for walk-in customers at the counter.
    return ["staff", "manager", "admin"].includes(caller.role);
  }

  const token = c.req.query("t") ?? c.req.header("X-Guest-Token");
  if (!token) return false;

  const match = await rpc<string | null>(c.get("admin"), "order_for_guest_token", {
    p_hash: await guestTokenHash(token, c.env.QR_SIGNING_KEY),
  });
  return match === orderId;
}

/**
 * Start a Paystack transaction.
 *
 * The amount always comes from the order row. Part 13: the payment record is
 * written before Paystack is called and an in-flight attempt is reused, so a
 * webhook arriving early always finds a row to match and two taps cannot
 * produce two competing references.
 */
payments.post("/initialize", rateLimit("pay", 15, 60_000), async (c) => {
  const parsed = z.object({ order_id: z.string().uuid() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw appError("VALIDATION_FAILED");

  const orderId = parsed.data.order_id;
  if (!(await ownsOrder(c, orderId))) throw appError("ORDER_NOT_FOUND");

  const admin = c.get("admin");
  const caller = c.get("caller");

  const order = await select<any>(
    admin.from("order")
      .select("order_id, order_number, user_id, total_kobo, payment_status, status, guest_phone")
      .eq("order_id", orderId).maybeSingle(),
  );

  if (!order) throw appError("ORDER_NOT_FOUND");
  if (["cancelled", "expired"].includes(order.status)) {
    throw appError("ORDER_ALREADY_CLOSED", { order_status: order.status });
  }
  if (order.payment_status === "paid") {
    return c.json({ ok: true, already_paid: true });
  }

  // Reuse an in-flight attempt rather than minting a second reference.
  const existing = await select<any>(
    admin.from("payment")
      .select("provider_reference, amount_kobo")
      .eq("order_id", orderId).eq("provider", "paystack").eq("status", "pending")
      .maybeSingle(),
  );

  const reuse = existing && Number(existing.amount_kobo) === Number(order.total_kobo);
  let reference: string;

  if (reuse) {
    reference = existing.provider_reference;
  } else {
    if (existing) {
      // Stale attempt for a different total. Retire it.
      await admin.from("payment")
        .update({ status: "failed" })
        .eq("order_id", orderId).eq("provider_reference", existing.provider_reference);
    }

    const candidate = paymentReference(order.order_number);
    const { error } = await admin.from("payment").insert({
      order_id: orderId,
      provider: "paystack",
      provider_reference: candidate,
      amount_kobo: order.total_kobo,
      method: "paystack",
      status: "pending",
    });

    if (!error) {
      reference = candidate;
    } else if (error.code === "23505") {
      // A concurrent initialize won. The old code carried on with `candidate`
      // anyway — so Paystack was handed a reference with no matching row, and
      // the webhook for it would never find the payment it belonged to.
      //
      // Read back the reference that actually won and use that one.
      const winner = await select<any>(
        admin.from("payment")
          .select("provider_reference, amount_kobo")
          .eq("order_id", orderId).eq("provider", "paystack").eq("status", "pending")
          .maybeSingle(),
      );

      if (!winner || Number(winner.amount_kobo) !== Number(order.total_kobo)) {
        // The winning row is for a different amount, so it is not ours to
        // reuse. Better to fail visibly than to charge against it.
        console.error("payment init lost the race and found no usable winner", {
          order_id: orderId,
        });
        throw appError("PAYSTACK_INIT_FAILED");
      }
      reference = winner.provider_reference;
    } else {
      throw appError("PAYSTACK_INIT_FAILED");
    }
  }

  const email = caller?.email ?? `${order.guest_phone ?? "guest"}@guest.u2gas.invalid`;

  const res = await fetch(`${PAYSTACK}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: order.total_kobo,
      reference,
      currency: "NGN",
      callback_url: `${c.env.APP_ORIGIN}${c.env.PAYSTACK_CALLBACK_PATH}?order=${orderId}`,
      metadata: {
        order_id: orderId,
        order_number: order.order_number,
        profile_id: caller?.profileId ?? null,
      },
    }),
  });

  const json = await res.json() as any;
  if (!res.ok || !json.status) {
    // The body is not logged: it can echo request details back.
    console.error("paystack initialize failed", { status: res.status, order_id: orderId });
    throw appError("PAYSTACK_INIT_FAILED");
  }

  return c.json({
    ok: true,
    authorization_url: json.data.authorization_url,
    reference,
    public_key: c.env.PAYSTACK_PUBLIC_KEY,
  });
});

/**
 * Verify on return from checkout (Part 14).
 *
 * Requires order_id as well as reference, and cross-checks that Paystack's own
 * metadata names the same order. A reference alone used to be enough to act on
 * an order that belonged to someone else.
 */
payments.post("/verify", rateLimit("pay", 30, 60_000), async (c) => {
  const parsed = z.object({
    reference: z.string().regex(/^[A-Za-z0-9._-]{6,120}$/),
    order_id: z.string().uuid(),
  }).safeParse(await c.req.json().catch(() => ({})));

  if (!parsed.success) throw appError("VALIDATION_FAILED");

  const { reference, order_id } = parsed.data;
  if (!(await ownsOrder(c, order_id))) throw appError("ORDER_NOT_FOUND");

  const result = await verifyAndRecord(c.env, c.get("admin"), reference, order_id);
  return c.json({ ok: true, ...result });
});

/**
 * Paystack webhook (Part 12).
 *
 * The previous version treated the event insert as the idempotency gate and
 * marked the event processed whether or not processing succeeded. A transient
 * database error therefore left the event recorded as handled and the payment
 * lost, because Paystack's retry hit the duplicate check and got a 200.
 *
 * Correct order: verify signature, return 200 if already processed, otherwise
 * process, and mark processed only after the transaction commits. On failure,
 * leave processed_at null and return 500 so Paystack retries.
 */
payments.post("/webhook/paystack", async (c) => {
  const raw = await c.req.text();
  const signature = c.req.header("x-paystack-signature") ?? "";

  const expected = await hmacSha512Hex(c.env.PAYSTACK_SECRET_KEY, raw);
  if (!timingSafeEqual(expected, signature)) {
    console.warn("webhook rejected: bad signature");
    return c.json({ ok: false }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return c.json({ ok: false }, 400);
  }

  const admin = c.get("admin");
  const reference = event?.data?.reference;
  if (!reference) return c.json({ ok: true, ignored: true });

  const eventId = `${event.event}:${reference}`;

  // Claim the event under a lease (0019). Exactly one caller processes it;
  // a concurrent delivery is told the claim is live and returns a retryable
  // status rather than acknowledging work it did not do. If the holder dies,
  // the lease expires and Paystack's next retry picks it up.
  const claim = await rpc<any>(admin, "claim_webhook_event", {
    p_provider: "paystack",
    p_event_id: eventId,
    p_event_type: event.event,
    p_payload: event,
    p_lease_seconds: 60,
  });

  if (claim.state === "processed") {
    return c.json({ ok: true, duplicate: true });
  }

  if (claim.state === "in_flight") {
    // 409, not 200. Paystack retries, and if the holder failed the retry is
    // what saves the charge. Acknowledging here is how an event gets lost.
    return c.json({ ok: false, concurrent: true }, 409);
  }

  try {
    if (event.event === "charge.success") {
      const orderId = event.data?.metadata?.order_id;
      if (!orderId) throw new Error("no order_id in metadata");
      await verifyAndRecord(c.env, admin, reference, orderId, event.data);
    } else if (event.event === "charge.failed") {
      await admin.from("payment")
        .update({ status: "failed", raw_payload: event.data })
        .eq("provider", "paystack").eq("provider_reference", reference);
    }

    // Only now, after the work committed.
    await rpc(admin, "finish_webhook_event", {
      p_provider: "paystack", p_event_id: eventId,
    });

    return c.json({ ok: true });

  } catch (err: unknown) {
    const code = err instanceof AppError ? err.code
               : err instanceof Error ? err.message
               : "unknown";

    // An orphaned payment is a recorded outcome, not something to retry.
    const handled = err instanceof AppError && err.code === "ORDER_ALREADY_CLOSED";

    // A handled outcome closes the event; a genuine failure releases the
    // lease with processed_at still null, so a retry can pick it up.
    await rpc(admin, "finish_webhook_event", {
      p_provider: "paystack",
      p_event_id: eventId,
      p_error: handled ? null : code,
    });

    if (handled) return c.json({ ok: true, orphaned: true });

    console.error("webhook processing failed", { event_id: eventId, code });
    return c.json({ ok: false }, 500);   // Paystack will retry
  }
});

/**
 * Shared verification (Parts 10 and 11).
 *
 * Always asks Paystack rather than trusting the caller, and validates every
 * field that matters: status, reference, currency, the exact amount, and that
 * the metadata names the order we were asked about.
 */
async function verifyAndRecord(
  env: AppEnv["Bindings"],
  admin: any,
  reference: string,
  expectedOrderId: string,
  known?: any,
) {
  let data = known;

  if (!data || data.status !== "success") {
    const res = await fetch(
      `${PAYSTACK}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } },
    );
    const json = await res.json() as any;
    if (!res.ok || !json.status) throw appError("PAYSTACK_VERIFY_FAILED");
    data = json.data;
  }

  if (data.status !== "success") {
    await admin.from("payment")
      .update({ status: "failed", raw_payload: data })
      .eq("provider", "paystack").eq("provider_reference", reference);
    return { paid: false, status: data.status };
  }

  // The reference Paystack echoes must be the one we asked about.
  if (data.reference !== reference) throw appError("PAYSTACK_VERIFY_FAILED");

  const orderId = data.metadata?.order_id;
  if (!orderId || orderId !== expectedOrderId) {
    // Someone is trying to apply a real transaction to a different order.
    console.warn("payment metadata does not match the requested order");
    throw appError("PAYSTACK_VERIFY_FAILED");
  }

  if (data.currency && data.currency !== "NGN") {
    throw appError("PAYSTACK_VERIFY_FAILED");
  }

  const order = await select<any>(
    admin.from("order").select("total_kobo, status").eq("order_id", orderId).maybeSingle(),
  );
  if (!order) throw appError("ORDER_NOT_FOUND");

  // Part 11: exact match, not "at least". An overpayment is as much an anomaly
  // as an underpayment and must not silently confirm the order.
  if (Number(data.amount) !== Number(order.total_kobo)) {
    await admin.from("audit_log").insert({
      action: "payment.amount_mismatch",
      entity_type: "order",
      entity_id: orderId,
      after: { expected_kobo: order.total_kobo, received_kobo: data.amount },
      note: "Paystack amount did not match the order total. Not confirmed.",
    });
    throw appError("UNDERPAID", {
      expected_kobo: order.total_kobo,
      received_kobo: data.amount,
    });
  }

  const result = await rpc<any>(admin, "confirm_payment", {
    p_order_id: orderId,
    p_provider: "paystack",
    p_reference: reference,
    p_amount_kobo: data.amount,
    p_method: "paystack",
    p_payload: data,
    p_currency: data.currency ?? "NGN",
  });

  if (result.orphaned) {
    console.warn("orphaned payment recorded, refund required", { order_id: orderId });
  }

  return {
    paid: true,
    order_id: orderId,
    payment_id: result.payment_id,
    already_processed: result.already_processed,
    orphaned: Boolean(result.orphaned),
    refund_required: Boolean(result.refund_required),
  };
}

export default payments;
