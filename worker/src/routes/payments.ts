import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Ctx } from "../types";
import { rpc, select } from "../lib/db";
import { appError, AppError } from "../lib/errors";
import { rateLimit } from "../middleware/ratelimit";
import { hmacSha512Hex, timingSafeEqual, paymentReference, guestTokenHash } from "../lib/crypto";
import {
  monnifyBase, monnifyToken, monnifyOk, monnifyMeta,
  koboToNaira, nairaToKobo,
} from "../lib/monnify";

const payments = new Hono<AppEnv>();

/**
 * Establish that the caller owns this order (Part 14).
 *
 * Both payment endpoints previously trusted a gateway reference on its own,
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
    return ["staff", "admin"].includes(caller.role);
  }

  const token = c.req.query("t") ?? c.req.header("X-Guest-Token");
  if (!token) return false;

  const match = await rpc<string | null>(c.get("admin"), "order_for_guest_token", {
    p_hash: await guestTokenHash(token, c.env.QR_SIGNING_KEY),
  });
  return match === orderId;
}

/**
 * Start a Monnify transaction.
 *
 * The amount always comes from the order row. Part 13: the payment record is
 * written before Monnify is called and an in-flight attempt is reused, so a
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
      .eq("order_id", orderId).eq("provider", "monnify").eq("status", "pending")
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
      provider: "monnify",
      provider_reference: candidate,
      amount_kobo: order.total_kobo,
      method: "monnify",
      status: "pending",
    });

    if (!error) {
      reference = candidate;
    } else if (error.code === "23505") {
      // A concurrent initialize won. The old code carried on with `candidate`
      // anyway — so the gateway was handed a reference with no matching row, and
      // the webhook for it would never find the payment it belonged to.
      //
      // Read back the reference that actually won and use that one.
      const winner = await select<any>(
        admin.from("payment")
          .select("provider_reference, amount_kobo")
          .eq("order_id", orderId).eq("provider", "monnify").eq("status", "pending")
          .maybeSingle(),
      );

      if (!winner || Number(winner.amount_kobo) !== Number(order.total_kobo)) {
        // The winning row is for a different amount, so it is not ours to
        // reuse. Better to fail visibly than to charge against it.
        console.error("payment init lost the race and found no usable winner", {
          order_id: orderId,
        });
        throw appError("MONNIFY_INIT_FAILED");
      }
      reference = winner.provider_reference;
    } else {
      throw appError("MONNIFY_INIT_FAILED");
    }
  }

  const email = caller?.email ?? `${order.guest_phone ?? "guest"}@guest.u2gas.invalid`;
  const token = await monnifyToken(c.env, c.env.CACHE);

  const res = await fetch(`${monnifyBase(c.env)}/api/v1/merchant/transactions/init-transaction`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: koboToNaira(order.total_kobo),   // naira, not kobo — see koboToNaira
      customerEmail: email,
      customerName: caller?.email ?? "U2 Customer",
      paymentReference: reference,
      paymentDescription: `Order ${order.order_number}`,
      currencyCode: "NGN",
      contractCode: c.env.MONNIFY_CONTRACT_CODE,
      redirectUrl: `${c.env.APP_ORIGIN}${c.env.MONNIFY_CALLBACK_PATH}?order=${orderId}`,
      // Monnify calls this `metaData`, with a capital D, and only accepts
      // string values. `metadata` is accepted on the way out but never echoed
      // back, which is how the verify step below would have lost the order id.
      metaData: {
        order_id: orderId,
        order_number: order.order_number,
        profile_id: caller?.profileId ?? "",
      },
    }),
  });

  const json = await res.json() as any;
  const body = json?.responseBody;

  // Monnify answers 200 with requestSuccessful:false for a business rejection,
  // so the status code alone is not enough.
  if (!monnifyOk(res, json) || !body?.checkoutUrl) {
    // The body is not logged: it can echo request details back.
    console.error("monnify initialize failed", { status: res.status, order_id: orderId });
    throw appError("MONNIFY_INIT_FAILED");
  }

  return c.json({
    ok: true,
    authorization_url: body.checkoutUrl,
    reference,
    // Retained for the client contract, and now always null: Monnify has no
    // public key, because the customer is redirected to a URL we were given
    // rather than to a widget keyed by one.
    public_key: null,
  });
});

/**
 * Verify on return from checkout (Part 14).
 *
 * Requires order_id as well as reference, and cross-checks that Monnify's own
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
 * Monnify webhook (Part 12).
 *
 * The previous version treated the event insert as the idempotency gate and
 * marked the event processed whether or not processing succeeded. A transient
 * database error therefore left the event recorded as handled and the payment
 * lost, because the gateway's retry hit the duplicate check and got a 200.
 *
 * Correct order: verify signature, return 200 if already processed, otherwise
 * process, and mark processed only after the transaction commits. On failure,
 * leave processed_at null and return 500 so the gateway retries.
 *
 * Monnify differs from Paystack in three ways that matter here:
 *   - the header is `monnify-signature`, not `x-paystack-signature`;
 *   - the event type is `SUCCESSFUL_TRANSACTION`, not `charge.success`;
 *   - the payload is `{ eventType, eventData }`, and `eventData` is flat —
 *     the reference and metadata are not nested under `data`.
 */
payments.post("/webhook/monnify", async (c) => {
  const raw = await c.req.text();
  const signature = c.req.header("monnify-signature") ?? "";

  // HMAC-SHA512 of the raw body, keyed by the secret key.
  const expected = await hmacSha512Hex(c.env.MONNIFY_SECRET_KEY, raw);
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
  const data = event?.eventData;
  const eventType = event?.eventType;

  // Monnify's merchant reference is `paymentReference`; `transactionReference`
  // is Monnify's own id for the same transaction. We key on ours, because that
  // is what the payment row was written with.
  const reference = data?.paymentReference;
  if (!reference) return c.json({ ok: true, ignored: true });

  const eventId = `${eventType}:${reference}`;

  // Claim the event under a lease (0019). Exactly one caller processes it;
  // a concurrent delivery is told the claim is live and returns a retryable
  // status rather than acknowledging work it did not do. If the holder dies,
  // the lease expires and the gateway's next retry picks it up.
  const claim = await rpc<any>(admin, "claim_webhook_event", {
    p_provider: "monnify",
    p_event_id: eventId,
    p_event_type: eventType,
    p_payload: event,
    p_lease_seconds: 60,
  });

  if (claim.state === "processed") {
    return c.json({ ok: true, duplicate: true });
  }

  if (claim.state === "in_flight") {
    // 409, not 200. Monnify retries, and if the holder failed the retry is
    // what saves the charge. Acknowledging here is how an event gets lost.
    return c.json({ ok: false, concurrent: true }, 409);
  }

  try {
    if (eventType === "SUCCESSFUL_TRANSACTION") {
      const orderId = monnifyMeta(data)?.order_id;
      if (!orderId) throw new Error("no order_id in metadata");
      await verifyAndRecord(c.env, admin, reference, orderId, data);
    } else if (eventType === "FAILED_TRANSACTION" || eventType === "REJECTED_PAYMENT") {
      await admin.from("payment")
        .update({ status: "failed", raw_payload: data })
        .eq("provider", "monnify").eq("provider_reference", reference);
    }

    // Only now, after the work committed.
    await rpc(admin, "finish_webhook_event", {
      p_provider: "monnify", p_event_id: eventId,
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
      p_provider: "monnify",
      p_event_id: eventId,
      p_error: handled ? null : code,
    });

    if (handled) return c.json({ ok: true, orphaned: true });

    console.error("webhook processing failed", { event_id: eventId, code });
    return c.json({ ok: false }, 500);   // Monnify will retry
  }
});

/**
 * Shared verification (Parts 10 and 11).
 *
 * Always asks Monnify rather than trusting the caller, and validates every
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

  // A webhook body already carries the authoritative fields. A return-from-
  // checkout has only the reference, so ask. Either way the checks below run.
  if (!data || data.paymentStatus !== "PAID") {
    const token = await monnifyToken(env, env.CACHE);
    const res = await fetch(
      `${monnifyBase(env)}/api/v2/transactions/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = await res.json() as any;
    if (!monnifyOk(res, json)) throw appError("MONNIFY_VERIFY_FAILED");
    data = json.responseBody;
  }

  // Monnify's terminal statuses are PAID, OVERPAID, PARTIALLY_PAID, FAILED and
  // EXPIRED. Only an exact PAID confirms the order — the amount check below
  // would catch an over- or underpayment anyway, but failing here first keeps
  // the audit trail honest about *why*.
  if (data?.paymentStatus !== "PAID") {
    await admin.from("payment")
      .update({ status: "failed", raw_payload: data })
      .eq("provider", "monnify").eq("provider_reference", reference);
    return { paid: false, status: data?.paymentStatus };
  }

  // The reference Monnify echoes must be the one we asked about.
  if (data.paymentReference !== reference) throw appError("MONNIFY_VERIFY_FAILED");

  const orderId = monnifyMeta(data)?.order_id;
  if (!orderId || orderId !== expectedOrderId) {
    // Someone is trying to apply a real transaction to a different order.
    console.warn("payment metadata does not match the requested order");
    throw appError("MONNIFY_VERIFY_FAILED");
  }

  if (data.currencyCode && data.currencyCode !== "NGN") {
    throw appError("MONNIFY_VERIFY_FAILED");
  }

  const order = await select<any>(
    admin.from("order").select("total_kobo, status").eq("order_id", orderId).maybeSingle(),
  );
  if (!order) throw appError("ORDER_NOT_FOUND");

  // The amount Monnify reports is naira; ours is kobo. Convert before
  // comparing, or every order would look underpaid by a factor of 100.
  const receivedKobo = nairaToKobo(data.amountPaid ?? data.amount);

  // Part 11: exact match, not "at least". An overpayment is as much an anomaly
  // as an underpayment and must not silently confirm the order.
  if (receivedKobo !== Number(order.total_kobo)) {
    await admin.from("audit_log").insert({
      action: "payment.amount_mismatch",
      entity_type: "order",
      entity_id: orderId,
      after: { expected_kobo: order.total_kobo, received_kobo: receivedKobo },
      note: "Monnify amount did not match the order total. Not confirmed.",
    });
    throw appError("UNDERPAID", {
      expected_kobo: order.total_kobo,
      received_kobo: receivedKobo,
    });
  }

  const result = await rpc<any>(admin, "confirm_payment", {
    p_order_id: orderId,
    p_provider: "monnify",
    p_reference: reference,
    p_amount_kobo: receivedKobo,
    p_method: "monnify",
    p_payload: data,
    p_currency: "NGN",
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
