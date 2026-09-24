import { Hono } from "hono";
import type { AppEnv } from "../types";
import { select } from "../lib/db";
import { appError } from "../lib/errors";

const catalog = new Hono<AppEnv>();

/**
 * Everything the customer home screen needs, in one response.
 *
 * The terminal shows the rate on the LED ticker and the keypad needs to know
 * availability. Fanning that out into three calls would blow the 1800ms LCP
 * budget on 4G before anything rendered. (Addendum 73.2)
 */
catalog.get("/home", async (c) => {
  const db = c.get("db");
  const caller = c.get("caller");

  const [stock, unread] = await Promise.all([
    select<any>(
      db.from("gas_stock")
        .select("rate_kobo_per_kg, total_received_kg, reserved_kg, deducted_kg")
        .eq("depot_id", c.env.DEPOT_ID)
        .single(),
    ),
    caller
      ? db.from("notification")
          .select("notification_id", { count: "exact", head: true })
          .eq("profile_id", caller.profileId)
          .is("read_at", null)
          .then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ]);

  const available =
    Number(stock.total_received_kg) - Number(stock.reserved_kg) - Number(stock.deducted_kg);

  return c.json({
    ok: true,
    rate_kobo_per_kg: stock.rate_kobo_per_kg,
    // The ticker string, formatted here so every surface shows it identically.
    ticker: `RATE: 1KG AT ₦${(stock.rate_kobo_per_kg / 100).toLocaleString("en-NG")}`,
    available_kg: Math.max(available, 0),
    unread_notifications: unread,
    signed_in: Boolean(caller),
  });
});

/**
 * Shop grid. Products and bundles in one list, from the shop_listing view.
 * Cached at the edge; availability is intentionally excluded from the cache
 * key's lifetime because the grid only needs to know in-stock vs not, and the
 * authoritative check happens inside the reservation transaction anyway.
 */
catalog.get("/shop", async (c) => {
  const category = c.req.query("category");
  const q = c.req.query("q");

  const cacheKey = `shop:${category ?? "all"}:${q ?? ""}`;
  if (!q) {
    const hit = await c.env.CACHE.get(cacheKey, "json");
    if (hit) {
      c.header("X-Cache", "HIT");
      return c.json({ ok: true, items: hit });
    }
  }

  let query = c.get("db").from("shop_listing").select("*").order("name");
  if (category) query = query.eq("category", category);
  if (q) query = query.ilike("name", `%${q}%`);

  const items = await select<any[]>(query);

  if (!q) {
    // Short TTL with revalidation: stock moves, prices rarely do. Purged
    // explicitly whenever admin writes a product.
    c.executionCtx.waitUntil(
      c.env.CACHE.put(cacheKey, JSON.stringify(items), { expirationTtl: 60 }),
    );
  }
  c.header("X-Cache", "MISS");
  return c.json({ ok: true, items });
});

catalog.get("/products/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const product = await select<any>(
    db.from("product")
      .select(`
        product_id, name, subtitle, description, price_kobo,
        stock_qty, reserved_qty, active,
        product_category ( slug, name ),
        image_asset ( base_path, width, height )
      `)
      .eq("product_id", id)
      .maybeSingle(),
  );

  if (!product) throw appError("PRODUCT_NOT_FOUND");

  return c.json({
    ok: true,
    product: {
      ...product,
      available: Math.max(product.stock_qty - product.reserved_qty, 0),
    },
  });
});

/** Bundle detail, including each member and the saving against buying apart. */
catalog.get("/bundles/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const bundle = await select<any>(
    db.from("bundle")
      .select(`
        bundle_id, name, description, price_kobo, active,
        image_asset ( base_path, width, height ),
        bundle_item (
          slot_index, quantity,
          product:product_id (
            product_id, name, subtitle, price_kobo, stock_qty, reserved_qty,
            image_asset ( base_path )
          )
        )
      `)
      .eq("bundle_id", id)
      .maybeSingle(),
  );

  if (!bundle) throw appError("BUNDLE_NOT_FOUND");

  const members = (bundle.bundle_item ?? []).sort(
    (a: any, b: any) => a.slot_index - b.slot_index,
  );

  const separately = members.reduce(
    (sum: number, m: any) => sum + m.product.price_kobo * m.quantity, 0,
  );

  // Availability is the weakest member, computed the same way the database
  // does it. Never stored.
  const available = members.length
    ? Math.min(...members.map((m: any) =>
        Math.floor(Math.max(m.product.stock_qty - m.product.reserved_qty, 0) / m.quantity)))
    : 0;

  // Name the short member so the UI can say which one is holding it up.
  const short = members.find((m: any) =>
    Math.max(m.product.stock_qty - m.product.reserved_qty, 0) < m.quantity);

  return c.json({
    ok: true,
    bundle: {
      bundle_id: bundle.bundle_id,
      name: bundle.name,
      description: bundle.description,
      price_kobo: bundle.price_kobo,
      image: bundle.image_asset,
      members: members.map((m: any) => ({
        slot_index: m.slot_index,
        quantity: m.quantity,
        ...m.product,
      })),
      separately_kobo: separately,
      saving_kobo: Math.max(separately - bundle.price_kobo, 0),
      available,
      unavailable_member: short ? short.product.name : null,
    },
  });
});

/**
 * Bundles that contain what the customer is already looking at (Item 9).
 *
 * Deliberately narrow: only published, active bundles, only where every member
 * is in stock, and only where the bundle actually saves money. An upsell that
 * costs more than buying separately, or that cannot be fulfilled, is worse
 * than no upsell.
 *
 * ?product_id= for a product page, or repeated ?in= for a cart.
 */
catalog.get("/complete-the-set", async (c) => {
  const ids = [
    ...c.req.queries("in") ?? [],
    ...(c.req.query("product_id") ? [c.req.query("product_id")!] : []),
  ].filter((v) => /^[0-9a-f-]{36}$/i.test(v));

  if (!ids.length) return c.json({ ok: true, bundles: [] });

  const rows = await select<any[]>(
    c.get("db").from("bundle_item")
      .select(`
        bundle_id,
        bundle:bundle_id (
          bundle_id, name, price_kobo, active,
          image_asset ( base_path ),
          bundle_item (
            quantity, slot_index,
            product:product_id (
              product_id, name, price_kobo, stock_qty, reserved_qty, active,
              image_asset ( base_path )
            )
          )
        )
      `)
      .in("product_id", ids)
      .limit(40),
  );

  const seen = new Set<string>();
  const bundles: any[] = [];

  for (const row of rows) {
    const b = row.bundle;
    if (!b?.active || seen.has(b.bundle_id)) continue;
    seen.add(b.bundle_id);

    const members = (b.bundle_item ?? []).sort(
      (x: any, y: any) => x.slot_index - y.slot_index);
    if (!members.length) continue;

    // Availability is the weakest member, exactly as the database computes it.
    const available = Math.min(...members.map((m: any) =>
      Math.floor(Math.max(m.product.stock_qty - m.product.reserved_qty, 0) / m.quantity)));
    if (available <= 0) continue;
    if (members.some((m: any) => !m.product.active)) continue;

    const separately = members.reduce(
      (sum: number, m: any) => sum + m.product.price_kobo * m.quantity, 0);
    const saving = separately - b.price_kobo;
    if (saving <= 0) continue;

    bundles.push({
      bundle_id: b.bundle_id,
      name: b.name,
      price_kobo: b.price_kobo,
      image_path: b.image_asset?.base_path ?? null,
      separately_kobo: separately,
      saving_kobo: saving,
      available,
      // What the customer would be adding beyond what they already have.
      adds: members
        .filter((m: any) => !ids.includes(m.product.product_id))
        .map((m: any) => m.product.name),
      members: members.map((m: any) => ({
        product_id: m.product.product_id,
        name: m.product.name,
        image_path: m.product.image_asset?.base_path ?? null,
      })),
    });
  }

  // Best saving first, and never more than two — this is a nudge, not a wall.
  bundles.sort((a, b) => b.saving_kobo - a.saving_kobo);
  return c.json({ ok: true, bundles: bundles.slice(0, 2) });
});

catalog.get("/zones", async (c) => {
  const zones = await select<any[]>(
    c.get("db").from("delivery_zone")
      .select("zone_id, name, fee_kobo, coverage_note")
      .eq("active", true)
      .order("fee_kobo"),
  );
  return c.json({ ok: true, zones });
});

export default catalog;
