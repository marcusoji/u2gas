import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Ctx } from "../types";
import { rpc, select } from "../lib/db";
import { appError } from "../lib/errors";
import { requireRole } from "../middleware/auth";
import { rateLimit } from "../middleware/ratelimit";
import { idempotent } from "../middleware/idempotency";
import { qrTokenHash } from "../lib/crypto";

const staff = new Hono<AppEnv>();

staff.use("*", requireRole("staff", "manager", "admin"));

/**
 * The staff_member row this caller acts as.
 *
 * requireRole lets managers and admins through, but every till operation has
 * to be attributed to a real staff record — cash reconciliation and the audit
 * trail are meaningless otherwise. A manager who has never been given a staff
 * record used to get a bare FORBIDDEN, which reads as "you are not allowed"
 * when the truth is "your account is not finished".
 *
 * The rule is now explicit: acting at the till requires a staff record, and
 * the error says exactly what is missing and who can fix it. (Item 4)
 */
async function staffId(c: Ctx): Promise<string> {
  const caller = c.get("caller")!;
  const row = await select<any>(
    c.get("admin").from("staff_member")
      .select("staff_id, status").eq("profile_id", caller.profileId).maybeSingle(),
  );

  if (!row) throw appError("STAFF_RECORD_MISSING", { role: caller.role });
  if (row.status !== "active") {
    throw appError("STAFF_RECORD_INACTIVE", { status: row.status });
  }
  return row.staff_id;
}

/**
 * The two pickup queues the cashier screen shows as tabs: orders already paid
 * and waiting for collection, and orders waiting to be paid at the counter.
 */
staff.get("/queue", async (c) => {
  const kind = c.req.query("kind") ?? "paid";
  // requireRole has already established this caller is staff. Reading through
  // the service role from here is deliberate: keeping the RLS staff predicate
  // in step with this query forever is a maintenance trap, and a mismatch
  // fails silently by returning fewer rows rather than erroring. One
  // authorization check, in one place. (Item 17)
  const db = c.get("admin");

  let q = db.from("order")
    .select(`
      order_id, order_number, guest_name, guest_phone,
      gas_amount_kg, total_kobo, payment_status, status,
      hold_expires_at, created_at,
      profile:user_id ( display_name, phone )
    `)
    .eq("depot_id", c.env.DEPOT_ID)
    .eq("fulfillment_type", "pickup")
    .in("status", ["pending", "confirmed", "processing"])
    .order("created_at", { ascending: true })
    .limit(100);

  q = kind === "unpaid" ? q.eq("payment_status", "pending")
                        : q.eq("payment_status", "paid");

  return c.json({ ok: true, kind, orders: await select<any[]>(q) });
});

/** Order lookup by number or phone — the keypad doubles as a search pad. */
// Order lookup returns customer phone numbers. Limited so a compromised staff
// session cannot be used to enumerate the customer base. (Part 34)
staff.get("/lookup", rateLimit("lookup", 60, 60_000), async (c) => {
  const term = (c.req.query("q") ?? "").trim();
  if (term.length < 3) {
    throw appError("VALIDATION_FAILED", {
      fields: [{ field: "q", message: "Enter at least three characters" }],
    });
  }

  // Part 31: reject, do not sanitise. Stripping characters turns
  // "U2-123<script>" into the valid search "U2-123", which quietly answers a
  // question nobody asked. An invalid identifier is an error.
  if (!/^[A-Za-z0-9+-]{3,40}$/.test(term)) {
    throw appError("VALIDATION_FAILED", {
      fields: [{
        field: "q",
        message: "Order numbers and phone numbers only — no other characters",
      }],
    });
  }
  const safe = term;

  const db = c.get("admin");
  const byNumber = safe.toUpperCase().startsWith("U2")
    ? safe.toUpperCase()
    : `U2-${safe}`;

  const columns = `
    order_id, order_number, status, payment_status, fulfillment_type,
    total_kobo, gas_amount_kg, guest_name, guest_phone, created_at
  `;

  // Two plain filters rather than one .or() expression. Slightly more code,
  // and nothing user-supplied is ever parsed as syntax.
  const [byRef, byPhone] = await Promise.all([
    select<any[]>(db.from("order").select(columns)
      .eq("order_number", byNumber).limit(5)),
    select<any[]>(db.from("order").select(columns)
      .ilike("guest_phone", `%${safe}%`)
      .order("created_at", { ascending: false }).limit(20)),
  ]);

  const seen = new Set<string>();
  const results = [...byRef, ...byPhone].filter((o) => {
    if (seen.has(o.order_id)) return false;
    seen.add(o.order_id);
    return true;
  });

  return c.json({ ok: true, results });
});

/**
 * Walk-in order (spec 31). No account required, but a phone number is, so the
 * order can be traced back to a person.
 */
const walkIn = z.object({
  kg: z.number().nonnegative().max(500).default(0),
  lines: z.array(z.object({
    kind: z.enum(["product", "bundle"]),
    product_id: z.string().uuid().optional(),
    bundle_id: z.string().uuid().optional(),
    quantity: z.number().int().positive().max(99),
  })).default([]),
  guest_name: z.string().min(1).max(120),
  guest_phone: z.string().regex(/^\+?[0-9]{7,15}$/),
  fulfillment: z.enum(["pickup", "delivery"]).default("pickup"),
  zone_id: z.string().uuid().optional(),
  address: z.string().max(500).optional(),
});

staff.post("/walk-in", rateLimit("walkin", 60, 60_000), async (c) => {
  const body = walkIn.safeParse(await c.req.json());
  if (!body.success) {
    throw appError("VALIDATION_FAILED", {
      fields: body.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  const b = body.data;
  if (b.kg === 0 && b.lines.length === 0) throw appError("EMPTY_ORDER");

  const sid = await staffId(c);
  const admin = c.get("admin");

  const order = b.lines.length
    ? await rpc<any>(admin, "create_accessory_order", {
        p_depot_id: c.env.DEPOT_ID, p_lines: b.lines, p_fulfillment: b.fulfillment,
        p_user_id: null, p_zone_id: b.zone_id ?? null, p_address: b.address ?? null,
        p_gas_kg: b.kg, p_channel: "walk_in",
        p_guest_name: b.guest_name, p_guest_phone: b.guest_phone,
        p_staff_id: sid, p_hold_minutes: null,
      })
    : await rpc<any>(admin, "create_gas_order", {
        p_depot_id: c.env.DEPOT_ID, p_kg: b.kg, p_fulfillment: b.fulfillment,
        p_user_id: null, p_zone_id: b.zone_id ?? null, p_address: b.address ?? null,
        p_channel: "walk_in",
        p_guest_name: b.guest_name, p_guest_phone: b.guest_phone,
        p_staff_id: sid, p_hold_minutes: null,
      });

  return c.json({ ok: true, order }, 201);
});

/**
 * Record an in-person payment (spec 32).
 *
 * Opening the payment screen is not payment. This endpoint is the explicit
 * confirmation, and it is the only thing that marks the order paid.
 */
const inPerson = z.object({
  order_id: z.string().uuid(),
  method: z.enum(["cash", "card_terminal", "bank_transfer", "opay"]),
  tendered_kobo: z.number().int().nonnegative().optional(),
  terminal_reference: z.string().max(120).optional(),
});

staff.post("/payments", rateLimit("staffpay", 120, 60_000),
  idempotent("payment.record"), async (c) => {
  const body = inPerson.safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");
  const b = body.data;

  if (b.method === "cash" && b.tendered_kobo === undefined) {
    throw appError("VALIDATION_FAILED", {
      fields: [{ field: "tendered_kobo", message: "Enter what the customer handed over" }],
    });
  }

  const sid = await staffId(c);
  const admin = c.get("admin");

  const order = await select<any>(
    admin.from("order").select("total_kobo, order_number")
      .eq("order_id", b.order_id).maybeSingle(),
  );
  if (!order) throw appError("ORDER_NOT_FOUND");

  // Raises INSUFFICIENT_TENDER with both numbers, which the change screen uses.
  const result = await rpc<any>(admin, "confirm_payment", {
    p_order_id: b.order_id,
    p_provider: "in_person",
    p_reference: b.terminal_reference ?? null,
    p_amount_kobo: order.total_kobo,
    p_method: b.method,
    p_payload: b.terminal_reference ? { terminal_reference: b.terminal_reference } : null,
    p_staff_id: sid,
    p_tendered: b.tendered_kobo ?? null,
    p_currency: "NGN",
  });

  // A cashier can take money for an order whose hold expired while the
  // customer was queueing. It is recorded, not lost, and flagged for refund.
  if (result.orphaned) {
    return c.json({
      ok: true,
      orphaned: true,
      refund_required: true,
      payment_id: result.payment_id,
      order_number: order.order_number,
      message: "THE HOLD EXPIRED — TAKE THIS TO A MANAGER FOR REFUND",
    });
  }

  return c.json({
    ok: true,
    payment_id: result.payment_id,
    already_processed: result.already_processed,
    order_number: order.order_number,
    total_kobo: order.total_kobo,
    tendered_kobo: b.tendered_kobo ?? null,
    change_due_kobo:
      b.method === "cash" ? (b.tendered_kobo ?? 0) - order.total_kobo : null,
  });
});

/** Change preview before anything is recorded, so the cashier can check. */
/**
 * Change preview.
 *
 * Deliberately unused by the app. Collect.tsx computes change locally the
 * moment the cashier types, because a round trip while a customer waits at
 * the counter is the wrong trade — and confirm_payment recomputes it in SQL
 * anyway, which is the figure that gets recorded.
 *
 * Kept because a physical till integration would want a server-side figure to
 * display, and because removing a working endpoint that costs nothing is not
 * worth the churn. If it is still unused when the till question is settled,
 * delete it.
 */
staff.get("/change-preview", async (c) => {
  const orderId = c.req.query("order_id");
  const tendered = Number(c.req.query("tendered_kobo") ?? 0);
  if (!orderId) throw appError("VALIDATION_FAILED");

  const order = await select<any>(
    c.get("admin").from("order").select("total_kobo, order_number")
      .eq("order_id", orderId).maybeSingle(),
  );
  if (!order) throw appError("ORDER_NOT_FOUND");

  return c.json({
    ok: true,
    order_number: order.order_number,
    total_kobo: order.total_kobo,
    tendered_kobo: tendered,
    change_due_kobo: tendered - order.total_kobo,
    sufficient: tendered >= order.total_kobo,
  });
});

/**
 * QR scan (spec 22-23). The double-scan guard is in redeem_qr; this route's
 * only job is to hash the token and translate the outcome.
 */
staff.post("/scan", rateLimit("scan", 120, 60_000), async (c) => {
  const body = z.object({ token: z.string().min(8).max(200) })
    .safeParse(await c.req.json());
  if (!body.success) throw appError("QR_INVALID");

  const hash = await qrTokenHash(body.data.token, c.env.QR_SIGNING_KEY);

  const result = await rpc<any>(c.get("admin"), "redeem_qr", {
    p_token_hash: hash,
    p_scanner_id: c.get("caller")!.profileId,
    p_expected: "pickup",
  });

  return c.json({ ok: true, ...result });
});

/** Cash reconciliation (spec 33). */
staff.get("/reconciliation", async (c) => {
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const sid = await staffId(c);

  const expected = await select<any[]>(
    c.get("admin").from("payment")
      .select("amount_kobo")
      .eq("recorded_by_staff_id", sid)
      .eq("method", "cash")
      .eq("status", "paid")
      .gte("paid_at", `${date}T00:00:00Z`)
      .lte("paid_at", `${date}T23:59:59Z`),
  );

  const expectedKobo = expected.reduce((s, p) => s + Number(p.amount_kobo), 0);

  const existing = await select<any>(
    c.get("admin").from("cash_reconciliation")
      .select("*").eq("staff_id", sid).eq("shift_date", date).maybeSingle(),
  );

  return c.json({
    ok: true,
    shift_date: date,
    expected_kobo: expectedKobo,
    transaction_count: expected.length,
    reconciliation: existing,
  });
});

staff.post("/reconciliation", idempotent("shift.close"), async (c) => {
  const body = z.object({
    shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    counted_kobo: z.number().int().nonnegative(),
    note: z.string().max(500).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  const sid = await staffId(c);
  const admin = c.get("admin");

  const expected = await select<any[]>(
    admin.from("payment").select("amount_kobo")
      .eq("recorded_by_staff_id", sid).eq("method", "cash").eq("status", "paid")
      .gte("paid_at", `${body.data.shift_date}T00:00:00Z`)
      .lte("paid_at", `${body.data.shift_date}T23:59:59Z`),
  );
  const expectedKobo = expected.reduce((s, p) => s + Number(p.amount_kobo), 0);

  const existing = await select<any>(
    admin.from("cash_reconciliation")
      .select("*")
      .eq("staff_id", sid)
      .eq("shift_date", body.data.shift_date)
      .maybeSingle(),
  );

  // A closed shift is immutable. Replays are handled by the idempotency
  // middleware; this guard also protects against a new key being used to
  // silently rewrite an already filed cash count.
  if (existing?.closed_at) {
    return c.json({ ok: true, reconciliation: existing, already_closed: true });
  }

  if (body.data.counted_kobo !== expectedKobo && !body.data.note?.trim()) {
    throw appError("VALIDATION_FAILED", {
      fields: [{ field: "note", message: "Explain the difference before closing the shift" }],
    });
  }

  const saved = await select<any>(
    admin.from("cash_reconciliation").upsert({
      staff_id: sid,
      depot_id: c.env.DEPOT_ID,
      shift_date: body.data.shift_date,
      expected_kobo: expectedKobo,
      counted_kobo: body.data.counted_kobo,
      note: body.data.note ?? null,
      closed_at: new Date().toISOString(),
      closed_by: c.get("caller")!.profileId,
    }, { onConflict: "staff_id,shift_date" }).select().single(),
  );

  return c.json({ ok: true, reconciliation: saved });
});

export default staff;
