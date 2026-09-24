import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Ctx } from "../types";
import { rpc, select } from "../lib/db";
import { appError } from "../lib/errors";
import { requireRole } from "../middleware/auth";
import { rateLimit } from "../middleware/ratelimit";
import { qrTokenHash } from "../lib/crypto";

const driver = new Hono<AppEnv>();

driver.use("*", requireRole("driver", "manager", "admin"));

/**
 * The driver row this caller acts as.
 *
 * Same rule as the till: a delivery has to be attributed to a real driver
 * record, so a manager or admin without one cannot take a drop. The error
 * distinguishes "not finished setting up" from "not allowed". (Item 4)
 */
async function driverId(c: Ctx): Promise<string> {
  const caller = c.get("caller");
  const row = await select<any>(
    c.get("admin").from("driver")
      .select("driver_id").eq("profile_id", caller.profileId).maybeSingle(),
  );
  if (!row) throw appError("DRIVER_RECORD_MISSING", { role: caller.role });
  return row.driver_id;
}

driver.get("/me", async (c) => {
  const row = await select<any>(
    c.get("admin").from("driver")
      .select(`
        driver_id, status, phone, vehicle_info, completed_deliveries,
        profile:profile_id ( display_name, avatar_asset ( base_path ) )
      `)
      .eq("profile_id", c.get("caller")!.profileId).maybeSingle(),
  );
  if (!row) throw appError("DRIVER_RECORD_MISSING", { role: c.get("caller")!.role });
  return c.json({ ok: true, driver: row });
});

/**
 * Availability toggle (spec 40). A driver may not go offline while a delivery
 * is still in their hands — that would strand the order with nobody assigned.
 */
driver.patch("/availability", async (c) => {
  const body = z.object({ status: z.enum(["available", "busy", "offline"]) })
    .safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  const id = await driverId(c);
  const admin = c.get("admin");

  if (body.data.status === "offline") {
    const live = await select<any[]>(
      admin.from("delivery").select("delivery_id")
        .eq("driver_id", id).in("status", ["assigned", "en_route"]),
    );
    if (live.length) {
      throw appError("VALIDATION_FAILED", {
        fields: [{
          field: "status",
          message: `Finish or hand back your ${live.length} open ${
            live.length === 1 ? "drop" : "drops"} first`,
        }],
      });
    }
  }

  await admin.from("driver").update({ status: body.data.status }).eq("driver_id", id);
  return c.json({ ok: true, status: body.data.status });
});

driver.get("/deliveries", async (c) => {
  const id = await driverId(c);
  const scope = c.req.query("scope") ?? "active";

  const statuses = scope === "completed"
    ? ["delivered"]
    : scope === "all"
      ? ["assigned", "en_route", "delivered", "failed", "rescheduled", "returned"]
      : ["assigned", "en_route"];

  const list = await select<any[]>(
    c.get("db").from("delivery")
      .select(`
        delivery_id, status, delivery_address, attempt_count,
        assigned_at, en_route_at, delivered_at, failure_reason,
        order:order_id (
          order_id, order_number, gas_amount_kg, total_kobo,
          payment_status, guest_name, guest_phone,
          profile:user_id ( display_name, phone ),
          order_item ( quantity, product:product_id ( name ) )
        ),
        zone:zone_id ( name, fee_kobo )
      `)
      .eq("driver_id", id)
      .in("status", statuses)
      .order("assigned_at", { ascending: scope === "active" }),
  );

  return c.json({ ok: true, scope, deliveries: list });
});

driver.get("/deliveries/:id", async (c) => {
  const row = await select<any>(
    c.get("db").from("delivery")
      .select(`
        *,
        order:order_id (
          order_id, order_number, gas_amount_kg, total_kobo, payment_status,
          guest_name, guest_phone, delivery_address,
          profile:user_id ( display_name, phone ),
          order_item ( quantity, unit_price_kobo, product:product_id ( name, subtitle ) )
        ),
        zone:zone_id ( name, fee_kobo )
      `)
      .eq("delivery_id", c.req.param("id")).maybeSingle(),
  );
  if (!row) throw appError("ORDER_NOT_FOUND");
  return c.json({ ok: true, delivery: row });
});

/** Start the trip. The ticker switches to EN ROUTE once this lands. */
driver.post("/deliveries/:id/en-route", async (c) => {
  // Delivery status and driver status in one transaction. Written separately,
  // a failure between them left a driver marked available with a live drop, or
  // busy with none. (Item 12)
  const result = await rpc<any>(c.get("admin"), "start_delivery", {
    p_delivery_id: c.req.param("id"),
    p_driver_id: await driverId(c),
  });

  return c.json({ ok: true, ...result });
});

/**
 * Scan on the doorstep. Same atomic fulfilment as the depot counter, with the
 * fulfillment type pinned to delivery so a pickup QR cannot be burned here.
 */
driver.post("/scan", rateLimit("scan", 120, 60_000), async (c) => {
  const body = z.object({ token: z.string().min(8).max(200) })
    .safeParse(await c.req.json());
  if (!body.success) throw appError("QR_INVALID");

  const hash = await qrTokenHash(body.data.token, c.env.QR_SIGNING_KEY);

  const result = await rpc<any>(c.get("admin"), "redeem_qr", {
    p_token_hash: hash,
    p_scanner_id: c.get("caller")!.profileId,
    p_expected: "delivery",
  });

  // redeem_qr frees the driver inside the same transaction now, so there is
  // no follow-up write here to be lost. (Item 12)
  return c.json({ ok: true, ...result });
});

/**
 * Failed delivery (spec 25). Not every drop succeeds, and the stock must not
 * be silently deducted when one doesn't. The reservation stays live so the
 * order can be re-attempted or returned.
 */
const failure = z.object({
  reason: z.enum(["no_answer", "wrong_address", "refused", "unsafe", "other"]),
  note: z.string().max(500).optional(),
  outcome: z.enum(["reschedule", "return"]).default("reschedule"),
});

driver.post("/deliveries/:id/failed", async (c) => {
  const body = failure.safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  const readable: Record<string, string> = {
    no_answer: "No answer at the address",
    wrong_address: "Address was wrong",
    refused: "Customer refused the delivery",
    unsafe: "Unsafe to deliver",
    other: body.data.note ?? "Delivery failed",
  };

  // The delivery, the order, the released stock and the driver's availability
  // all settle together. Previously these were up to four separate requests,
  // any gap leaving a delivery marked returned on an order still holding
  // stock. (Item 12)
  const result = await rpc<any>(c.get("admin"), "fail_delivery", {
    p_delivery_id: c.req.param("id"),
    p_driver_id: await driverId(c),
    p_reason: readable[body.data.reason],
    p_outcome: body.data.outcome,
    p_actor_id: c.get("caller")!.profileId,
  });

  return c.json({ ok: true, ...result, reason: readable[body.data.reason] });
});

export default driver;
