import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Ctx } from "../types";
import { rpc, select } from "../lib/db";
import { appError } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/ratelimit";
import { idempotent } from "../middleware/idempotency";
import {
  generateGuestToken, generateQrToken, guestTokenHash, qrTokenHash,
} from "../lib/crypto";

const orders = new Hono<AppEnv>();

const phone = z.string().regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number");

const gasBody = z.object({
  kg: z.number().positive().max(500),
  fulfillment: z.enum(["pickup", "delivery"]),
  zone_id: z.string().uuid().optional(),
  address: z.string().min(6).max(500).optional(),
  guest_name: z.string().min(1).max(120).optional(),
  guest_phone: phone.optional(),
}).refine(
  (v) => v.fulfillment !== "delivery" || (v.zone_id && v.address),
  { message: "Delivery needs an address and a zone" },
);

const line = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("product"),
    product_id: z.string().uuid(),
    quantity: z.number().int().positive().max(99),
  }),
  z.object({
    kind: z.literal("bundle"),
    bundle_id: z.string().uuid(),
    quantity: z.number().int().positive().max(20),
  }),
]);

const cartBody = z.object({
  lines: z.array(line).min(1).max(50),
  gas_kg: z.number().nonnegative().max(500).default(0),
  fulfillment: z.enum(["pickup", "delivery"]),
  zone_id: z.string().uuid().optional(),
  address: z.string().min(6).max(500).optional(),
  guest_name: z.string().min(1).max(120).optional(),
  guest_phone: phone.optional(),
});

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw appError("VALIDATION_FAILED", {
      fields: r.error.issues.map((i) => ({
        field: i.path.join("."), message: i.message,
      })),
    });
  }
  return r.data;
}

/**
 * Guests have no session, so RLS cannot identify them. After checkout they get
 * a capability token; every later read is authorised by presenting it.
 * Returned exactly once — it is stored only as a hash.
 */
async function issueGuestAccess(c: Ctx, orderId: string): Promise<string> {
  const token = generateGuestToken();
  await rpc(c.get("admin"), "set_guest_token", {
    p_order_id: orderId,
    p_hash: await guestTokenHash(token, c.env.QR_SIGNING_KEY),
    p_days: 30,
  });
  return token;
}

/**
 * Resolve who is asking. A signed-in owner goes through RLS as normal; a guest
 * presenting a valid token for THIS order is allowed, and nothing else.
 */
async function authoriseOrderAccess(c: Ctx, orderId: string): Promise<boolean> {
  const caller = c.get("caller");
  if (caller) return true;               // RLS decides from here

  const token = c.req.query("t");
  if (!token) return false;

  const match = await rpc<string | null>(c.get("admin"), "order_for_guest_token", {
    p_hash: await guestTokenHash(token, c.env.QR_SIGNING_KEY),
  });
  return match === orderId;
}

/**
 * Read an admin-editable setting. Cached briefly so the order path does not
 * pay for a round trip on every request, and invalidated by the admin route
 * when the value changes.
 */
async function setting(c: Ctx, key: string, fallback: number): Promise<number> {
  const cached = await c.env.CACHE.get(`setting:${key}`);
  if (cached !== null) return Number(cached);

  const row = await select<any>(
    c.get("admin").from("app_setting").select("value").eq("key", key).maybeSingle(),
  );
  const value = Number(row?.value ?? fallback);
  c.executionCtx.waitUntil(
    c.env.CACHE.put(`setting:${key}`, String(value), { expirationTtl: 300 }),
  );
  return value;
}

/** Settings the admin can change, read once per request rather than assumed. */
const holdMinutes = (c: Ctx) => setting(c, "hold_minutes", 30);

/**
 * Gas order.
 *
 * One RPC call. Pricing, the delivery fee and the stock reservation all happen
 * inside a single database transaction, so a customer can never end up holding
 * a reservation for an order row that failed to write, or the reverse.
 * (Spec 17)
 */
orders.post("/gas", rateLimit("order", 20, 60_000), idempotent("order.create"), async (c) => {
  const body = parse(gasBody, await c.req.json());
  const caller = c.get("caller");

  if (!caller && !body.guest_phone) {
    throw appError("VALIDATION_FAILED", {
      fields: [{ field: "guest_phone", message: "We need a phone number to reach you" }],
    });
  }

  // Raises INSUFFICIENT_GAS with available_kg in the detail, which is what the
  // "ONLY 6KG LEFT / TAKE 6KG" screen renders from.
  const order = await rpc<any>(c.get("admin"), "create_gas_order", {
    p_depot_id: c.env.DEPOT_ID,
    p_kg: body.kg,
    p_fulfillment: body.fulfillment,
    p_user_id: caller?.profileId ?? null,
    p_zone_id: body.zone_id ?? null,
    p_address: body.address ?? null,
    p_channel: "online",
    p_guest_name: body.guest_name ?? null,
    p_guest_phone: body.guest_phone ?? null,
    p_staff_id: null,
    p_hold_minutes: null,   // the database reads app_setting itself
  });

  const guest_token = caller ? undefined : await issueGuestAccess(c, order.order_id);

  return c.json({ ok: true, order: publicOrder(order), guest_token }, 201);
});

/** Accessories, bundles, or accessories plus gas in one order. */
orders.post("/cart", rateLimit("order", 20, 60_000), idempotent("order.create"), async (c) => {
  const body = parse(cartBody, await c.req.json());
  const caller = c.get("caller");

  if (!caller && !body.guest_phone) {
    throw appError("VALIDATION_FAILED", {
      fields: [{ field: "guest_phone", message: "We need a phone number to reach you" }],
    });
  }
  if (body.fulfillment === "delivery" && (!body.zone_id || !body.address)) {
    throw appError("ZONE_REQUIRED");
  }

  const order = await rpc<any>(c.get("admin"), "create_accessory_order", {
    p_depot_id: c.env.DEPOT_ID,
    p_lines: body.lines,
    p_fulfillment: body.fulfillment,
    p_user_id: caller?.profileId ?? null,
    p_zone_id: body.zone_id ?? null,
    p_address: body.address ?? null,
    p_gas_kg: body.gas_kg,
    p_channel: "online",
    p_guest_name: body.guest_name ?? null,
    p_guest_phone: body.guest_phone ?? null,
    p_staff_id: null,
    p_hold_minutes: null,   // the database reads app_setting itself
  });

  const guest_token = caller ? undefined : await issueGuestAccess(c, order.order_id);

  return c.json({ ok: true, order: publicOrder(order), guest_token }, 201);
});

/**
 * Check availability without reserving anything.
 *
 * The keypad calls this as the customer types so the LED can warn early. It
 * deliberately takes no lock and reserves nothing — spec 14 is explicit that
 * typing a number must not hold stock. The real check is the reservation.
 */
orders.get("/availability", async (c) => {
  const kg = Number(c.req.query("kg") ?? 0);

  const stock = await select<any>(
    c.get("db").from("gas_stock")
      .select("total_received_kg, reserved_kg, deducted_kg, rate_kobo_per_kg")
      .eq("depot_id", c.env.DEPOT_ID).single(),
  );

  const available = Math.max(
    Number(stock.total_received_kg) - Number(stock.reserved_kg) - Number(stock.deducted_kg), 0,
  );

  return c.json({
    ok: true,
    available_kg: available,
    requested_kg: kg,
    sufficient: kg > 0 && kg <= available,
    subtotal_kobo: Math.round(kg * stock.rate_kobo_per_kg),
    // Advisory only. Do not treat this as a promise of stock.
    provisional: true,
  });
});

orders.get("/", requireAuth, async (c) => {
  const caller = c.get("caller")!;
  const list = await select<any[]>(
    c.get("db").from("order")
      .select(`
        order_id, order_number, order_type, status, payment_status,
        fulfillment_type, gas_amount_kg, total_kobo, hold_expires_at,
        created_at, fulfilled_at
      `)
      .eq("user_id", caller.profileId)
      .order("created_at", { ascending: false })
      .limit(Number(c.req.query("limit") ?? 30)),
  );
  return c.json({ ok: true, orders: list.map((o) => publicOrder(o)) });
});

// A guest read is authorised only by a token in the URL. Without a limit,
// that is an offline-speed guessing oracle. 60/min is far above any human
// refreshing their own order. (Part 34)
orders.get("/:id", rateLimit("order.read", 60, 60_000), async (c) => {
  const id = c.req.param("id");
  const allowed = await authoriseOrderAccess(c, id);
  if (!allowed) throw appError("ORDER_NOT_FOUND");

  // A verified guest reads through the service role, because RLS has no
  // session to match them against. The token check above is the gate.
  const db = c.get("caller") ? c.get("db") : c.get("admin");

  const order = await select<any>(
    db.from("order")
      .select(`
        *,
        order_item ( order_item_id, quantity, unit_price_kobo, bundle_id,
                     product:product_id ( name, subtitle, image_asset ( base_path ) ) ),
        payment ( payment_id, method, status, amount_kobo, paid_at ),
        delivery ( status, delivery_address, failure_reason,
                   en_route_at, delivered_at,
                   zone:zone_id ( name ),
                   driver:driver_id ( phone, profile:profile_id ( display_name ) ) )
      `)
      .eq("order_id", id)
      .maybeSingle(),
  );

  if (!order) throw appError("ORDER_NOT_FOUND");
  return c.json({ ok: true, order: publicOrder(order, true) });
});

/**
 * The QR is issued only once payment requirements are satisfied, and the
 * plaintext token is returned exactly once — here. Only its hash is stored,
 * so it cannot be recovered from the database afterwards. (Spec 21)
 */
orders.post("/:id/qr", async (c) => {
  const id = c.req.param("id");
  const caller = c.get("caller");

  if (!(await authoriseOrderAccess(c, id))) throw appError("ORDER_NOT_FOUND");

  const order = await select<any>(
    c.get("admin").from("order")
      .select("order_id, order_number, user_id, payment_status, status, fulfillment_type, total_kobo")
      .eq("order_id", id).maybeSingle(),
  );
  if (!order) throw appError("ORDER_NOT_FOUND");

  // A signed-in caller must own it. A guest already proved it with the token.
  if (caller && order.user_id && order.user_id !== caller.profileId) {
    throw appError("FORBIDDEN");
  }
  if (order.payment_status !== "paid") {
    throw appError("UNPAID", { total_kobo: order.total_kobo ?? 0 });
  }

  // A refresh must not kill a code the customer already screenshotted, so a
  // live token is left alone unless replacement is explicitly requested. (Item 11)
  const force = c.req.query("force") === "1";

  const token = generateQrToken();
  const hash = await qrTokenHash(token, c.env.QR_SIGNING_KEY);

  // The admin screen exposes qr_valid_hours, so it has to actually bind.
  // A hardcoded 72 here meant changing it in the UI did nothing. (Item 5)
  const result = await rpc<any>(c.get("admin"), "issue_qr", {
    p_order_id: id,
    p_token_hash: hash,
    p_valid_hours: await setting(c, "qr_valid_hours", 72),
    p_force: force,
  });

  if (!result.issued) {
    // A valid code is already out there. Its plaintext was returned once when
    // issued and is never stored, so the client shows the copy it kept; if it
    // has none it asks again with ?force=1.
    return c.json({
      ok: true,
      token: null,
      existing: true,
      expires_at: result.expires_at ?? null,
      order_number: order.order_number,
      fulfillment_type: order.fulfillment_type,
    });
  }

  return c.json({
    ok: true,
    // Encode this into the QR image on the client. It is not stored anywhere.
    token,
    existing: false,
    order_number: order.order_number,
    fulfillment_type: order.fulfillment_type,
  });
});

orders.post("/:id/cancel", async (c) => {
  const caller = c.get("caller");
  const id = c.req.param("id");

  if (!(await authoriseOrderAccess(c, id))) throw appError("ORDER_NOT_FOUND");

  const order = await select<any>(
    c.get("admin").from("order").select("user_id").eq("order_id", id).maybeSingle(),
  );
  if (!order) throw appError("ORDER_NOT_FOUND");
  if (caller && order.user_id && order.user_id !== caller.profileId) {
    throw appError("FORBIDDEN");
  }

  const result = await rpc<any>(c.get("admin"), "cancel_order", {
    p_order_id: id,
    p_actor_id: caller?.profileId ?? null,
    p_reason: "Cancelled by customer",
  });

  return c.json({
    ok: true,
    reservations_released: result.reservations_released,
    // Present when the order was already paid. The customer is told a refund
    // is being processed — not that it has happened.
    refund: result.refund ?? null,
  });
});

/**
 * What the customer is told about their delivery (Item 11).
 *
 * v1 has no GPS: the honest answer is the driver's name, the status, and a
 * rough ETA derived from when they set off. Inventing a live position we do
 * not have would be worse than saying nothing.
 */
function deliveryView(d: any) {
  const started = d.en_route_at ? new Date(d.en_route_at).getTime() : null;

  // A flat window from departure. Crude, but it is a real bound rather than a
  // fabricated precision, and it stops counting once the drop is done.
  let eta_minutes: number | null = null;
  if (started && d.status === "en_route") {
    const elapsed = Math.floor((Date.now() - started) / 60000);
    eta_minutes = Math.max(0, 30 - elapsed);
  }

  return {
    status: d.status,
    delivery_address: d.delivery_address,
    failure_reason: d.failure_reason ?? null,
    en_route_at: d.en_route_at ?? null,
    delivered_at: d.delivered_at ?? null,
    eta_minutes,
    zone: d.zone ? { name: d.zone.name } : null,
    driver: d.driver
      ? {
          display_name: d.driver.profile?.display_name ?? null,
          // The phone is given out only while the drop is live. A customer
          // does not need their driver's number a week later.
          phone: ["assigned", "en_route"].includes(d.status)
            ? d.driver.phone ?? null
            : null,
        }
      : null,
  };
}

/** Strips internal columns. The client never sees reservation bookkeeping. */
function publicOrder(o: any, detailed = false) {
  const base = {
    order_id: o.order_id,
    order_number: o.order_number,
    order_type: o.order_type,
    status: o.status,
    payment_status: o.payment_status,
    fulfillment_type: o.fulfillment_type,
    gas_amount_kg: Number(o.gas_amount_kg ?? 0),
    gas_subtotal_kobo: o.gas_subtotal_kobo,
    items_subtotal_kobo: o.items_subtotal_kobo,
    delivery_fee_kobo: o.delivery_fee_kobo,
    total_kobo: o.total_kobo,
    hold_expires_at: o.hold_expires_at,
    created_at: o.created_at,
    fulfilled_at: o.fulfilled_at,
  };
  if (!detailed) return base;

  return {
    ...base,
    delivery_address: o.delivery_address,
    rate_at_purchase: o.rate_at_purchase,
    items: o.order_item ?? [],
    payments: (o.payment ?? []).map((p: any) => ({
      method: p.method, status: p.status,
      amount_kobo: p.amount_kobo, paid_at: p.paid_at,
    })),
    delivery: o.delivery ? deliveryView(o.delivery) : null,
  };
}

export default orders;
export { publicOrder };
