import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Ctx, KVKey } from "../types";
import { rpc, select } from "../lib/db";
import { appError } from "../lib/errors";
import { requireRole } from "../middleware/auth";
import { rateLimit } from "../middleware/ratelimit";

const admin = new Hono<AppEnv>();

admin.use("*", requireRole("manager", "admin"));

// A blanket ceiling across every admin route. Not a substitute for the role
// check above — it is the backstop for a stolen admin session being used to
// bulk-export data. (Part 34)
admin.use("*", rateLimit("admin", 300, 60_000));

/** Catalogue edits invalidate the shop cache immediately. */
async function purgeShopCache(c: Ctx) {
  const keys = await c.env.CACHE.list({ prefix: "shop:" });
  await Promise.all(keys.keys.map((k: KVKey) => c.env.CACHE.delete(k.name)));
}

// ---------------------------------------------------------------------------
// Gas stock — the tank gauge screen
// ---------------------------------------------------------------------------

admin.get("/stock", async (c) => {
  const stock = await select<any>(
    c.get("admin").from("gas_stock").select("*").eq("depot_id", c.env.DEPOT_ID).single(),
  );

  const available =
    Number(stock.total_received_kg) - Number(stock.reserved_kg) - Number(stock.deducted_kg);

  // Burn rate over the last 14 days, for the "predicted to last N more days"
  // line the tank screen shows.
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const recent = await select<any[]>(
    c.get("admin").from("order")
      .select("gas_amount_kg")
      .eq("depot_id", c.env.DEPOT_ID)
      .eq("status", "fulfilled")
      .gte("fulfilled_at", since),
  );
  const perDay = recent.reduce((s, o) => s + Number(o.gas_amount_kg), 0) / 14;

  return c.json({
    ok: true,
    stock: {
      total_received_kg: Number(stock.total_received_kg),
      reserved_kg: Number(stock.reserved_kg),
      deducted_kg: Number(stock.deducted_kg),
      available_kg: Math.max(available, 0),
      rate_kobo_per_kg: stock.rate_kobo_per_kg,
      fill_percent: stock.total_received_kg > 0
        ? Math.round((available / Number(stock.total_received_kg)) * 100) : 0,
      days_remaining: perDay > 0 ? Math.floor(available / perDay) : null,
      updated_at: stock.updated_at,
    },
  });
});

admin.post("/stock/entries", async (c) => {
  const body = z.object({
    move: z.enum(["addition", "removal", "correction"]).default("addition"),
    amount_kg: z.number().positive().max(100_000),
    note: z.string().max(500).optional(),
    // The delivery-note photograph, if one was taken. Optional by design:
    // a tanker at the gate should not wait on a camera.
    photo_asset: z.string().uuid().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  // Raises on gas_never_oversold if an admin tries to remove stock that is
  // already promised to a customer. That refusal is correct, not a bug.
  const entryId = await rpc<string>(c.get("admin"), "record_stock_entry", {
    p_depot_id: c.env.DEPOT_ID,
    p_admin_id: c.get("caller")!.profileId,
    p_move: body.data.move,
    p_amount_kg: body.data.amount_kg,
    p_note: body.data.note ?? null,
    p_photo_asset: body.data.photo_asset ?? null,
  });

  return c.json({ ok: true, entry_id: entryId }, 201);
});

admin.get("/stock/entries", async (c) => {
  const month = c.req.query("month");   // YYYY-MM, matching the month tabs
  let q = c.get("admin").from("stock_entry")
    .select("entry_id, move, amount_kg, note, entry_date, photo:photo_asset ( base_path ), admin:admin_id ( display_name )")
    .eq("depot_id", c.env.DEPOT_ID)
    .order("entry_date", { ascending: false })
    .limit(200);

  if (month) {
    const start = `${month}-01T00:00:00Z`;
    const end = new Date(new Date(start).setMonth(new Date(start).getMonth() + 1)).toISOString();
    q = q.gte("entry_date", start).lt("entry_date", end);
  }

  return c.json({ ok: true, entries: await select<any[]>(q) });
});

admin.patch("/rate", async (c) => {
  const body = z.object({ rate_kobo_per_kg: z.number().int().positive() })
    .safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  // One transaction: the rate, its history row and the audit entry. These were
  // three separate writes, so a failure between them changed the price with no
  // record of who changed it or what it was — the exact question asked when a
  // customer disputes a charge. (Item 10)
  const result = await rpc<any>(c.get("admin"), "set_gas_rate", {
    p_depot_id: c.env.DEPOT_ID,
    p_rate_kobo: body.data.rate_kobo_per_kg,
    p_actor_id: c.get("caller")!.profileId,
  });

  await purgeShopCache(c);
  await c.env.CACHE.delete("setting:rate_kobo_per_kg");

  return c.json({ ok: true, rate_kobo_per_kg: result.after_kobo });
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const productBody = z.object({
  name: z.string().min(1).max(160),
  subtitle: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
  category_id: z.string().uuid().optional(),
  sku: z.string().max(60).optional(),
  price_kobo: z.number().int().positive(),
  stock_qty: z.number().int().nonnegative().default(0),
  image_asset: z.string().uuid().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
});

admin.get("/products", async (c) => {
  const list = await select<any[]>(
    c.get("admin").from("product")
      .select(`
        product_id, name, subtitle, price_kobo, stock_qty, reserved_qty, active,
        product_category ( slug, name ), image_asset ( base_path )
      `)
      .order("name"),
  );
  return c.json({
    ok: true,
    products: list.map((p) => ({ ...p, available: p.stock_qty - p.reserved_qty })),
  });
});

admin.post("/products", async (c) => {
  const body = productBody.safeParse(await c.req.json());
  if (!body.success) {
    throw appError("VALIDATION_FAILED", {
      fields: body.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  const { attributes, ...fields } = body.data;
  const db = c.get("admin");

  // One transaction: product, attributes and the audit row. Three separate
  // writes could leave a product with no attributes if the second failed, and
  // the Worker cannot roll back a write Supabase has already committed.
  const product = await select<any>(
    db.rpc("admin_create_product", {
      p_fields: fields,
      p_attributes: attributes ?? null,
      p_actor: c.get("caller")!.profileId,
    }),
  );

  await purgeShopCache(c);
  return c.json({ ok: true, product }, 201);
});

/**
 * Price and visibility are plain column writes — last write wins is fine for
 * them. Stock is not: it goes through adjust_product_stock, which applies the
 * delta under a row lock. Reading, adding in JavaScript, and writing an
 * absolute number back would let a QR redeemed mid-edit be silently undone.
 */
admin.patch("/products/:id", async (c) => {
  const body = z.object({
    name: z.string().min(1).max(160).optional(),
    subtitle: z.string().max(80).optional(),
    description: z.string().max(2000).optional(),
    price_kobo: z.number().int().positive().optional(),
    stock_delta: z.number().int().optional(),
    stock_note: z.string().max(500).optional(),
    active: z.boolean().optional(),
    image_asset: z.string().uuid().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  const db = c.get("admin");
  const id = c.req.param("id");
  const actor = c.get("caller")!.profileId;

  const before = await select<any>(
    db.from("product").select("*").eq("product_id", id).maybeSingle(),
  );
  if (!before) throw appError("PRODUCT_NOT_FOUND");

  const { stock_delta, stock_note, ...fields } = body.data;
  let product = before;

  // Stock first. If it is refused, nothing else has been written yet.
  if (stock_delta !== undefined && stock_delta !== 0) {
    product = await rpc<any>(db, "adjust_product_stock", {
      p_product_id: id,
      p_delta: stock_delta,
      p_actor_id: actor,
      p_note: stock_note ?? null,
    });
  }

  if (Object.keys(fields).length > 0) {
    // Column write and audit row in one transaction; the audit can no longer
    // be missing for a change that landed. The function records the whole
    // before/after row rather than the two fields this route used to keep.
    product = await select<any>(
      db.rpc("admin_update_product", {
        p_product_id: id,
        p_fields: fields,
        p_actor: actor,
      }),
    );
  }

  await purgeShopCache(c);
  return c.json({ ok: true, product });
});

// ---------------------------------------------------------------------------
// Bundles (addendum 71)
// ---------------------------------------------------------------------------

/** Live compatibility check for the three-slot form, as slots are filled. */
admin.post("/bundles/check", async (c) => {
  const body = z.object({ product_ids: z.array(z.string().uuid()).min(2).max(3) })
    .safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  const violations = await rpc<any[]>(c.get("admin"), "check_bundle_compatibility", {
    p_product_ids: body.data.product_ids,
  });

  return c.json({
    ok: true,
    compatible: violations.length === 0,
    // Rendered verbatim in the red stamp.
    violations: violations.map((v) => ({
      message: v.message, product_a: v.product_a, product_b: v.product_b, rule_id: v.rule_id,
    })),
  });
});

admin.post("/bundles", async (c) => {
  const body = z.object({
    name: z.string().min(1).max(160),
    description: z.string().max(2000).optional(),
    price_kobo: z.number().int().positive(),
    image_asset: z.string().uuid().optional(),
    items: z.array(z.object({
      product_id: z.string().uuid(),
      quantity: z.number().int().positive().max(10).default(1),
      slot_index: z.number().int().min(1).max(3),
    })).min(2).max(3),
    override_rule_id: z.string().uuid().optional(),
    override_reason: z.string().min(10).max(500).optional(),
  }).safeParse(await c.req.json());

  if (!body.success) {
    throw appError("VALIDATION_FAILED", {
      fields: body.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }

  // Raises INCOMPATIBLE_ITEMS with the rule's own message, or
  // OVERRIDE_FORBIDDEN if a non-manager tried to force it through.
  const bundle = await rpc<any>(c.get("admin"), "publish_bundle", {
    p_name: body.data.name,
    p_price_kobo: body.data.price_kobo,
    p_items: body.data.items,
    p_created_by: c.get("caller")!.profileId,
    p_description: body.data.description ?? null,
    p_image_asset: body.data.image_asset ?? null,
    p_override_rule: body.data.override_rule_id ?? null,
    p_override_reason: body.data.override_reason ?? null,
  });

  await purgeShopCache(c);
  return c.json({ ok: true, bundle }, 201);
});

// ---------------------------------------------------------------------------
// Orders, flagged queue
// ---------------------------------------------------------------------------

admin.get("/orders", async (c) => {
  const status = c.req.query("status");
  let q = c.get("admin").from("order")
    .select(`
      order_id, order_number, channel, order_type, status, payment_status,
      fulfillment_type, total_kobo, gas_amount_kg, created_at,
      profile:user_id ( display_name, phone )
    `)
    .order("created_at", { ascending: false })
    .limit(Number(c.req.query("limit") ?? 100));

  if (status) q = q.eq("status", status);
  return c.json({ ok: true, orders: await select<any[]>(q) });
});

/**
 * Flagged queue: anything that needs a human decision. Orphaned payments come
 * first because someone is owed money.
 */
admin.get("/flagged", async (c) => {
  const db = c.get("admin");

  const [orphaned, failedDeliveries, staleUnpaid] = await Promise.all([
    select<any[]>(db.from("audit_log")
      .select("audit_id, entity_id, after, note, created_at")
      .eq("action", "payment.orphaned")
      .order("created_at", { ascending: false }).limit(50)),
    select<any[]>(db.from("delivery")
      .select("delivery_id, status, failure_reason, attempt_count, order:order_id ( order_number )")
      .in("status", ["failed", "rescheduled"])
      .order("assigned_at", { ascending: false }).limit(50)),
    select<any[]>(db.from("order")
      .select("order_id, order_number, total_kobo, created_at")
      .eq("payment_status", "pending").eq("status", "confirmed")
      .lt("created_at", new Date(Date.now() - 864e5).toISOString()).limit(50)),
  ]);

  return c.json({
    ok: true,
    flagged: {
      refunds_owed: orphaned,
      failed_deliveries: failedDeliveries,
      stale_unpaid: staleUnpaid,
      total: orphaned.length + failedDeliveries.length + staleUnpaid.length,
    },
  });
});

admin.post("/orders/:id/cancel", async (c) => {
  const body = z.object({ reason: z.string().min(3).max(500) })
    .safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  const result = await rpc<any>(c.get("admin"), "cancel_order", {
    p_order_id: c.req.param("id"),
    p_actor_id: c.get("caller")!.profileId,
    p_reason: body.data.reason,
  });
  return c.json({
    ok: true,
    reservations_released: result.reservations_released,
    refund: result.refund ?? null,
  });
});

/** Assign a driver (spec 25 step 1). */
admin.post("/orders/:id/assign", async (c) => {
  const body = z.object({ driver_id: z.string().uuid() }).safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  // Delivery row and driver availability move together. (Item 12)
  const result = await rpc<any>(c.get("admin"), "assign_delivery", {
    p_order_id: c.req.param("id"),
    p_driver_id: body.data.driver_id,
    p_actor_id: c.get("caller")!.profileId,
  });

  return c.json({ ok: true, delivery: result });
});

// ---------------------------------------------------------------------------
// Zones, people, settings, reports, audit
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Refunds (Item 14)
// ---------------------------------------------------------------------------

admin.get("/refunds", async (c) => {
  const rows = await select<any[]>(
    c.get("admin").from("refund")
      .select(`
        refund_id, amount_kobo, currency, status, reason, attempts,
        provider_refund_id, last_error, created_at, settled_at,
        order:order_id ( order_id, order_number, guest_phone,
                         profile:user_id ( display_name ) )
      `)
      .order("created_at", { ascending: true })
      .limit(100),
  );
  return c.json({ ok: true, refunds: rows });
});

/**
 * Process a refund through Paystack.
 *
 * The sequence matters. claim_refund flips the row from pending to processing
 * and returns it only to the caller that won, so two admins pressing the
 * button at the same moment cannot both reach Paystack. Only after Paystack
 * answers does settle_refund mark it refunded — which is the only thing that
 * tells the customer their money is on its way.
 *
 * If Paystack fails, the row returns to pending with the error recorded, so it
 * reappears in the queue rather than vanishing.
 */
admin.post("/refunds/:id/process", rateLimit("refund", 30, 60_000), async (c) => {
  const id = c.req.param("id");
  const caller = c.get("caller")!;
  const db = c.get("admin");

  // The router already restricts this to manager and admin. Money leaving the
  // business is worth checking twice.
  if (!["manager", "admin"].includes(caller.role)) throw appError("FORBIDDEN");

  const claim = await rpc<any>(db, "claim_refund", {
    p_refund_id: id, p_actor_id: caller.profileId,
  });

  if (!claim.provider_reference) {
    // An in-person payment has no Paystack transaction to reverse.
    await rpc(db, "settle_refund", {
      p_refund_id: id, p_status: "pending",
      p_error: "No provider reference — refund this one in person",
    });
    throw appError("REFUND_NOT_AUTOMATABLE");
  }

  let res: Response;
  try {
    res = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: claim.provider_reference,
        amount: claim.amount_kobo,
        currency: claim.currency ?? "NGN",
        merchant_note: `U2GAS refund ${id}`,
      }),
    });
  } catch {
    await rpc(db, "settle_refund", {
      p_refund_id: id, p_status: "pending", p_error: "Could not reach Paystack",
    });
    throw appError("PAYSTACK_REFUND_FAILED");
  }

  const json = await res.json() as any;

  if (!res.ok || !json.status) {
    const message = typeof json?.message === "string"
      ? json.message.slice(0, 200) : "Paystack declined the refund";

    // Paystack having already refunded this transaction is success from our
    // side, not failure — settle it rather than retrying forever.
    const already = /already.*refund/i.test(message);

    await rpc(db, "settle_refund", {
      p_refund_id: id,
      p_status: already ? "refunded" : "pending",
      p_payload: json ?? null,
      p_error: already ? null : message,
    });

    if (already) return c.json({ ok: true, status: "refunded", already: true });
    throw appError("PAYSTACK_REFUND_FAILED", { reason: message });
  }

  const settled = await rpc<any>(db, "settle_refund", {
    p_refund_id: id,
    p_status: "refunded",
    p_provider_refund_id: String(json.data?.id ?? ""),
    p_payload: json.data ?? null,
  });

  return c.json({ ok: true, ...settled });
});

/** Close a refund settled outside the system — cash handed back at the depot. */
admin.post("/refunds/:id/manual", async (c) => {
  const body = z.object({ note: z.string().min(3).max(500) })
    .safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  const id = c.req.param("id");
  await rpc(c.get("admin"), "claim_refund", {
    p_refund_id: id, p_actor_id: c.get("caller")!.profileId,
  });
  const settled = await rpc<any>(c.get("admin"), "settle_refund", {
    p_refund_id: id, p_status: "manual", p_error: body.data.note,
  });
  return c.json({ ok: true, ...settled });
});

admin.get("/zones", async (c) =>
  c.json({ ok: true, zones: await select<any[]>(
    c.get("admin").from("delivery_zone").select("*").order("fee_kobo")) }));

admin.post("/zones", async (c) => {
  const body = z.object({
    name: z.string().min(1).max(120),
    fee_kobo: z.number().int().nonnegative(),
    coverage_note: z.string().max(500).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  // Zone row and its audit record in one transaction.
  const zone = await select<any>(
    c.get("admin").rpc("admin_create_zone", {
      p_fields: body.data,
      p_actor: c.get("caller")!.profileId,
    }),
  );

  return c.json({ ok: true, zone }, 201);
});

admin.patch("/zones/:id", async (c) => {
  const body = z.object({
    name: z.string().min(1).max(120).optional(),
    fee_kobo: z.number().int().nonnegative().optional(),
    coverage_note: z.string().max(500).optional(),
    active: z.boolean().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  // Zone write and its audit row in one transaction.
  const zone = await select<any>(
    c.get("admin").rpc("admin_update_zone", {
      p_zone_id: c.req.param("id"),
      p_fields: body.data,
      p_actor: c.get("caller")!.profileId,
    }),
  );

  return c.json({ ok: true, zone });
});

admin.get("/staff", async (c) =>
  c.json({ ok: true, staff: await select<any[]>(
    c.get("admin").from("staff_member")
      .select(`
        staff_id, status, bank_name, account_number, hired_at,
        profile:profile_id ( profile_id, display_name, role, phone,
                             avatar_asset ( base_path ) )
      `)
      .neq("status", "removed")) }));

admin.get("/drivers", async (c) =>
  c.json({ ok: true, drivers: await select<any[]>(
    c.get("admin").from("driver")
      .select(`
        driver_id, status, phone, vehicle_info, completed_deliveries,
        profile:profile_id ( profile_id, display_name, avatar_asset ( base_path ) )
      `)) }));

admin.get("/settings", async (c) =>
  c.json({ ok: true, settings: await select<any[]>(
    c.get("admin").from("app_setting").select("key, value, updated_at")) }));

admin.patch("/settings/:key", async (c) => {
  const body = z.object({ value: z.any() }).safeParse(await c.req.json());
  if (!body.success) throw appError("VALIDATION_FAILED");

  await c.get("admin").from("app_setting").upsert({
    key: c.req.param("key"),
    value: body.data.value,
    updated_by: c.get("caller")!.profileId,
    updated_at: new Date().toISOString(),
  });

  await c.env.CACHE.delete(`setting:${c.req.param("key")}`);
  return c.json({ ok: true });
});

admin.get("/audit", async (c) => {
  let q = c.get("admin").from("audit_log")
    .select("audit_id, action, entity_type, entity_id, before, after, note, created_at, actor:actor_id ( display_name, role )")
    .order("created_at", { ascending: false })
    .limit(Number(c.req.query("limit") ?? 100));

  const entity = c.req.query("entity_type");
  if (entity) q = q.eq("entity_type", entity);

  return c.json({ ok: true, entries: await select<any[]>(q) });
});

admin.get("/reports/summary", async (c) => {
  const days = Math.min(Number(c.req.query("days") ?? 30), 365);
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const db = c.get("admin");

  const [orders, paymentsRows] = await Promise.all([
    select<any[]>(db.from("order")
      .select("status, order_type, fulfillment_type, total_kobo, gas_amount_kg, created_at")
      .gte("created_at", since)),
    select<any[]>(db.from("payment")
      .select("method, amount_kobo, status").eq("status", "paid").gte("paid_at", since)),
  ]);

  const fulfilled = orders.filter((o) => o.status === "fulfilled");
  const byMethod: Record<string, number> = {};
  for (const p of paymentsRows) {
    byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount_kobo);
  }

  return c.json({
    ok: true,
    period_days: days,
    orders_total: orders.length,
    orders_fulfilled: fulfilled.length,
    orders_expired: orders.filter((o) => o.status === "expired").length,
    orders_cancelled: orders.filter((o) => o.status === "cancelled").length,
    gas_sold_kg: fulfilled.reduce((s, o) => s + Number(o.gas_amount_kg), 0),
    revenue_kobo: paymentsRows.reduce((s, p) => s + Number(p.amount_kobo), 0),
    revenue_by_method: byMethod,
    pickup_share: orders.length
      ? orders.filter((o) => o.fulfillment_type === "pickup").length / orders.length : 0,
  });
});

export default admin;
