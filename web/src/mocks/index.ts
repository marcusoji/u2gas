import * as fx from "./fixtures";
import { getMockRole, mockHome } from "./gate";

/* ---------------------------------------------------------------------------
   A stand-in for the Worker.

   Enabled only by `VITE_USE_MOCKS=true`. It answers every endpoint lib/api.ts
   calls, from the fixtures, and mutates them in memory so the demo behaves:
   an order moves stock, a collected code stops being collectable, a refund
   leaves the queue.

   Reached by dynamic import, and only once the flag is known to be set, so no
   fixture in here can land in a real bundle. The flag and the demo role live
   in ./gate, which is cheap enough to import on the real path.
   --------------------------------------------------------------------------- */

export class MockHttpError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public detail: Record<string, any> = {},
  ) {
    super(message);
    this.name = "MockHttpError";
  }
}

const fail = (code: string, status: number, message: string, detail: Record<string, any> = {}) =>
  new MockHttpError(code, status, message, detail);

/* --- Who is signed in ----------------------------------------------------- */

/** The role-shaped fixture for whoever the demo bar has selected. */
export function mockProfile(): any {
  const role = getMockRole();
  if (role === "customer") return fx.customerProfile;
  return fx.staffProfiles.find((p) => p.role === role) ?? fx.staffProfiles[0];
}

/* --- Interactive state ---------------------------------------------------- */

const state = {
  stockReceivedKg: fx.tankBase.total_received_kg,
  stockDeductedKg: fx.tankBase.deducted_kg,
  rateKoboPerKg: fx.RATE_KOBO_PER_KG,
  qrTokens: new Map<string, string>(),   // token -> order_id
  orderTokens: new Map<string, string>(), // order_id -> token
  paymentRefs: new Map<string, string>(), // reference -> order_id
  closedShifts: new Map<string, { counted_kobo: number; variance_kobo: number; note: string | null; closed_at: string }>(),
};

let orderSeq = 100050;
const nextOrderNumber = () => `U2-${orderSeq++}`;
const nextId = () => Math.random().toString(36).slice(2, 10);

function mutableProduct(id: string) {
  return fx.products.find((p) => p.product_id === id);
}

function reservedKg(): number {
  return fx.orders
    .filter((o) => ["pending", "confirmed", "processing"].includes(o.status))
    .reduce((s, o) => s + o.gas_amount_kg, 0);
}

function availableKg(): number {
  return Math.max(0, state.stockReceivedKg - state.stockDeductedKg - reservedKg());
}

function gasSubtotal(kg: number): number {
  return Math.round(kg * state.rateKoboPerKg);
}

function findOrder(id: string) {
  return fx.orders.find((o) => o.order_id === id);
}

/* --- Shipping shapes ------------------------------------------------------ */

function shopItems() {
  const ps = fx.products
    .filter((p) => p.active)
    .map((p) => ({
      kind: "product" as const, id: p.product_id, name: p.name,
      subtitle: p.subtitle, price_kobo: p.price_kobo, available: p.available,
      image_path: p.image_asset?.base_path ?? null,
      category: p.product_category?.slug ?? null,
    }));
  const bs = fx.bundles.map((b) => ({
    kind: "bundle" as const, id: b.bundle_id, name: b.name,
    subtitle: "KIT", price_kobo: b.price_kobo, available: b.available,
    image_path: b.image?.base_path ?? null, category: null,
  }));
  return [...bs, ...ps];
}

function newOrder(fields: Partial<import("../lib/api").Order>): import("../lib/api").Order {
  return {
    order_id: fields.order_id ?? `o-${nextId()}`,
    order_number: fields.order_number ?? nextOrderNumber(),
    order_type: "gas", status: "pending", payment_status: "pending",
    fulfillment_type: "pickup", gas_amount_kg: 0, gas_subtotal_kobo: 0,
    items_subtotal_kobo: 0, delivery_fee_kobo: 0, total_kobo: 0,
    hold_expires_at: new Date(Date.now() + fx.HOLD_HOURS * 3_600_000).toISOString(),
    created_at: new Date().toISOString(), fulfilled_at: null,
    delivery_address: null, rate_at_purchase: state.rateKoboPerKg,
    items: [], payments: [], delivery: null,
    ...fields,
  };
}

function summarise(o: import("../lib/api").Order) {
  return {
    order_id: o.order_id, order_number: o.order_number,
    status: o.status, payment_status: o.payment_status,
    fulfillment_type: o.fulfillment_type, total_kobo: o.total_kobo,
    gas_amount_kg: o.gas_amount_kg, guest_name: "Walk-in customer",
    guest_phone: "+2348030000009", created_at: o.created_at,
    hold_expires_at: o.hold_expires_at,
    profile: { display_name: "Ade Balogun", phone: "+2348030000001" },
  };
}

function markPaid(order: import("../lib/api").Order, method: string) {
  order.payment_status = "paid";
  order.status = order.fulfillment_type === "delivery" ? "processing" : "confirmed";
  order.payments = [
    ...(order.payments ?? []),
    { method, status: "success", amount_kobo: order.total_kobo, paid_at: new Date().toISOString() },
  ];
  if (order.fulfillment_type === "delivery" && !order.delivery) {
    const zone = fx.zones.find((z) => z.name === (order.delivery_address ? "Ikoyi" : "")) ?? fx.zones[0];
    order.delivery = {
      delivery_id: `dl-${nextId()}`, status: "assigned",
      delivery_address: order.delivery_address ?? "12 Awolowo Road, Ikoyi",
      failure_reason: null, eta_minutes: null, attempt_count: 0,
      assigned_at: new Date().toISOString(), en_route_at: null, delivered_at: null,
      zone: { name: zone.name, fee_kobo: zone.fee_kobo },
      driver: { phone: fx.drivers[0].phone, profile: { display_name: "Ajao Caleb" } },
    };
  }
}

/* --- The router ----------------------------------------------------------- */

export async function mockRequest(
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const method = (init.method ?? "GET").toUpperCase();
  const [rawPath, rawQuery = ""] = path.split("?");
  const params = new URLSearchParams(rawQuery);
  const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;

  await new Promise((r) => setTimeout(r, 120)); // a little latency, so loading states are visible

  const seg = rawPath.split("/").filter(Boolean);

  /* ---- Catalog -------------------------------------------------------- */
  if (method === "GET" && rawPath === "/catalog/home") {
    return {
      ok: true, rate_kobo_per_kg: state.rateKoboPerKg,
      ticker: `Today's Rate: 1kg at ₦${(state.rateKoboPerKg / 100).toLocaleString("en-NG")}`,
      available_kg: availableKg(),
      unread_notifications: fx.notifications.filter((n) => !("read_at" in n && n.read_at)).length,
      signed_in: true,
    };
  }

  if (method === "GET" && rawPath === "/catalog/shop") {
    const category = params.get("category");
    const q = (params.get("q") ?? "").toLowerCase();
    let items = shopItems();
    if (category) items = items.filter((i) => i.category === category);
    if (q) items = items.filter((i) => i.name.toLowerCase().includes(q));
    return { items };
  }

  if (method === "GET" && seg[0] === "catalog" && seg[1] === "products" && seg[2]) {
    const p = mutableProduct(seg[2]);
    if (!p) throw fail("NOT_FOUND", 404, "NO SUCH ITEM");
    p.available = Math.max(0, p.stock_qty - p.reserved_qty);
    return { product: p };
  }

  if (method === "GET" && seg[0] === "catalog" && seg[1] === "bundles" && seg[2]) {
    const b = fx.bundles.find((x) => x.bundle_id === seg[2]);
    if (!b) throw fail("NOT_FOUND", 404, "NO SUCH KIT");
    return { bundle: b };
  }

  if (method === "GET" && rawPath === "/catalog/zones") {
    return { zones: fx.zones.filter((z) => z.active) };
  }

  if (method === "GET" && rawPath === "/catalog/complete-the-set") {
    const wanted = params.getAll("in");
    const offers = fx.bundles
      .filter((b) => b.saving_kobo > 0 && b.members.some((m) => wanted.includes(m.product_id)))
      .map((b) => ({
        bundle_id: b.bundle_id, name: b.name, price_kobo: b.price_kobo,
        image_path: b.image?.base_path ?? null,
        separately_kobo: b.separately_kobo, saving_kobo: b.saving_kobo,
        available: b.available,
        adds: b.members.filter((m) => !wanted.includes(m.product_id)).map((m) => m.name),
        members: b.members.map((m) => ({
          product_id: m.product_id, name: m.name,
          image_path: m.image_asset?.base_path ?? null,
        })),
      }));
    return { bundles: offers };
  }

  /* ---- Me ------------------------------------------------------------- */
  if (method === "GET" && rawPath === "/me") {
    return { profile: mockProfile(), home: mockHome() };
  }

  if (rawPath === "/me/addresses") {
    if (method === "GET") return { addresses: fx.addresses };
    if (method === "POST") {
      if (!body?.label?.trim() || !body?.line?.trim()) {
        throw fail("VALIDATION", 400, "LABEL AND ADDRESS ARE REQUIRED", {
          fields: [{ field: "label", message: "Give it a name" }],
        });
      }
      const zone = fx.zones.find((z) => z.zone_id === body.zone_id);
      const address = {
        address_id: `a-${nextId()}`, label: body.label, line: body.line,
        latitude: body.latitude ?? null, longitude: body.longitude ?? null,
        is_default: Boolean(body.is_default), created_at: new Date().toISOString(),
        zone: zone ? { zone_id: zone.zone_id, name: zone.name, fee_kobo: zone.fee_kobo, active: Boolean(zone.active) } : null,
      };
      if (address.is_default) fx.addresses.forEach((a) => { a.is_default = false; });
      fx.addresses.push(address);
      return { address };
    }
  }

  if (seg[0] === "me" && seg[1] === "addresses" && seg[2]) {
    const a = fx.addresses.find((x) => x.address_id === seg[2]);
    if (!a) throw fail("NOT_FOUND", 404, "NO SUCH ADDRESS");
    if (method === "PATCH") {
      if (body.label !== undefined) a.label = body.label;
      if (body.line !== undefined) a.line = body.line;
      if (body.zone_id !== undefined) {
        const zone = fx.zones.find((z) => z.zone_id === body.zone_id);
        a.zone = zone ? { zone_id: zone.zone_id, name: zone.name, fee_kobo: zone.fee_kobo, active: Boolean(zone.active) } : null;
      }
      if (body.is_default) {
        fx.addresses.forEach((x) => { x.is_default = false; });
        a.is_default = true;
      }
      return { ok: true };
    }
    if (method === "DELETE") {
      fx.addresses.splice(fx.addresses.indexOf(a), 1);
      return { ok: true };
    }
  }

  /* ---- Notifications -------------------------------------------------- */
  if (method === "GET" && rawPath === "/notifications") {
    return { notifications: fx.notifications };
  }
  if (method === "POST" && rawPath === "/notifications/read") {
    return { ok: true };
  }

  /* ---- Orders --------------------------------------------------------- */
  if (method === "GET" && rawPath === "/orders/availability") {
    const kg = Number(params.get("kg") ?? 0);
    return {
      available_kg: availableKg(),
      sufficient: kg <= availableKg(),
      subtotal_kobo: gasSubtotal(kg),
    };
  }

  if (method === "GET" && rawPath === "/orders") {
    return { orders: [...fx.orders].sort((a, b) => b.created_at.localeCompare(a.created_at)) };
  }

  if (method === "POST" && (rawPath === "/orders/gas" || rawPath === "/orders/cart")) {
    const isGas = rawPath === "/orders/gas";
    const kg = Number(body?.kg ?? body?.gas_kg ?? 0);

    if (!isGas) {
      if (!Array.isArray(body?.lines) || body.lines.length === 0) {
        throw fail("VALIDATION", 400, "YOUR BASKET IS EMPTY");
      }
    }
    if (kg <= 0 && isGas) throw fail("VALIDATION", 400, "CHOOSE HOW MUCH GAS YOU WANT");

    if (kg > availableKg()) {
      throw fail("INSUFFICIENT_GAS", 409,
        `ONLY ${availableKg()}KG LEFT IN THE TANK`,
        { available_kg: availableKg() });
    }

    // Accessory lines are checked against live availability, exactly as the
    // reservation transaction would.
    const items: import("../lib/api").OrderItem[] = [];
    let itemsSubtotal = 0;
    let shortProduct: string | null = null;
    for (const l of body?.lines ?? []) {
      const qty = Number(l.quantity ?? 0);
      if (l.kind === "bundle") {
        const b = fx.bundles.find((x) => x.bundle_id === l.bundle_id);
        if (!b) throw fail("NOT_FOUND", 404, "NO SUCH KIT");
        for (const m of b.members) {
          const p = mutableProduct(m.product_id);
          if (p && p.stock_qty - p.reserved_qty < m.quantity * qty) shortProduct = p.product_id;
          if (p) p.reserved_qty += m.quantity * qty;
        }
        itemsSubtotal += b.price_kobo * qty;
        items.push({
          order_item_id: `oi-${nextId()}`, quantity: qty,
          unit_price_kobo: b.price_kobo, bundle_id: b.bundle_id,
          product: { name: b.name, subtitle: "KIT", image_asset: b.image },
        });
      } else {
        const p = mutableProduct(l.product_id);
        if (!p) throw fail("NOT_FOUND", 404, "NO SUCH ITEM");
        if (p.stock_qty - p.reserved_qty < qty) shortProduct = p.product_id;
        p.reserved_qty += qty;
        itemsSubtotal += p.price_kobo * qty;
        items.push({
          order_item_id: `oi-${nextId()}`, quantity: qty,
          unit_price_kobo: p.price_kobo, bundle_id: null,
          product: { name: p.name, subtitle: p.subtitle, image_asset: p.image_asset },
        });
      }
    }

    if (shortProduct) {
      // Roll the reservations back before refusing, as the transaction would.
      for (const l of body?.lines ?? []) {
        const qty = Number(l.quantity ?? 0);
        if (l.kind === "bundle") {
          const b = fx.bundles.find((x) => x.bundle_id === l.bundle_id);
          b?.members.forEach((m) => {
            const p = mutableProduct(m.product_id);
            if (p) p.reserved_qty -= m.quantity * qty;
          });
        } else {
          const p = mutableProduct(l.product_id);
          if (p) p.reserved_qty -= qty;
        }
      }
      throw fail("INSUFFICIENT_STOCK", 409, "ONE OF THOSE JUST SOLD OUT", { product_id: shortProduct });
    }

    const zone = fx.zones.find((z) => z.zone_id === body?.zone_id);
    const deliveryFee = body?.fulfillment === "delivery" ? (zone?.fee_kobo ?? 0) : 0;
    const gasKobo = gasSubtotal(kg);

    const order = newOrder({
      order_type: kg > 0 && itemsSubtotal > 0 ? "mixed" : itemsSubtotal > 0 ? "accessory" : "gas",
      fulfillment_type: body?.fulfillment ?? "pickup",
      gas_amount_kg: kg, gas_subtotal_kobo: gasKobo,
      items_subtotal_kobo: itemsSubtotal, delivery_fee_kobo: deliveryFee,
      total_kobo: gasKobo + itemsSubtotal + deliveryFee,
      items,
      delivery_address: body?.fulfillment === "delivery" ? (body?.address ?? null) : null,
    });
    fx.orders.unshift(order);
    return { order };
  }

  if (seg[0] === "orders" && seg[1] && seg[2] === "cancel") {
    const order = findOrder(seg[1]);
    if (!order) throw fail("NOT_FOUND", 404, "NO SUCH ORDER");
    if (!["pending", "confirmed", "processing"].includes(order.status)) {
      throw fail("ORDER_ALREADY_CLOSED", 409, "THIS ORDER IS ALREADY CLOSED");
    }
    const wasPaid = order.payment_status === "paid";
    order.status = "cancelled";
    if (wasPaid) order.payment_status = "refunded";
    (order.items ?? []).forEach((it) => {
      const p = it.product?.name ? fx.products.find((x) => x.name === it.product?.name) : undefined;
      if (p) p.reserved_qty = Math.max(0, p.reserved_qty - it.quantity);
    });
    return {
      reservations_released: 1,
      refund: wasPaid ? { refund_id: `r-${nextId()}`, status: "pending" } : null,
    };
  }

  if (seg[0] === "orders" && seg[1] && seg[2] === "qr") {
    const order = findOrder(seg[1]);
    if (!order) throw fail("NOT_FOUND", 404, "NO SUCH ORDER");
    const force = params.get("force") === "1";
    const existing = state.orderTokens.get(order.order_id);
    if (existing && !force) {
      return { token: null, existing: true, order_number: order.order_number };
    }
    if (existing) {
      state.qrTokens.delete(existing);
      state.orderTokens.delete(order.order_id);
    }
    const token = `mock-qr-${nextId()}`;
    state.qrTokens.set(token, order.order_id);
    state.orderTokens.set(order.order_id, token);
    return {
      token, existing: false,
      expires_at: new Date(Date.now() + 72 * 3_600_000).toISOString(),
      order_number: order.order_number,
    };
  }

  if (method === "GET" && seg[0] === "orders" && seg[1]) {
    const order = findOrder(seg[1]);
    if (!order) throw fail("NOT_FOUND", 404, "WE COULDN'T FIND THAT ORDER");
    return { order };
  }

  /* ---- Payments ------------------------------------------------------- */
  if (method === "POST" && rawPath === "/payments/initialize") {
    const order = findOrder(body?.order_id);
    if (!order) throw fail("NOT_FOUND", 404, "NO SUCH ORDER");
    if (order.payment_status === "paid") return { authorization_url: "", reference: "", already_paid: true };
    const reference = `mock-ref-${nextId()}`;
    state.paymentRefs.set(reference, order.order_id);
    // Send the browser to our own verify page, standing in for the Paystack
    // redirect, so the full pay → verify → receipt path is visible offline.
    const url = `${window.location.origin}/orders/verify?order=${order.order_id}` +
      `&reference=${reference}`;
    return { authorization_url: url, reference };
  }

  if (method === "POST" && rawPath === "/payments/verify") {
    const orderId = body?.order_id ?? state.paymentRefs.get(body?.reference ?? "");
    const order = orderId ? findOrder(orderId) : undefined;
    if (!order) throw fail("NOT_FOUND", 404, "WE COULDN'T MATCH THAT PAYMENT");
    if (order.payment_status !== "paid") markPaid(order, "card");
    return { paid: true, order_id: order.order_id };
  }

  /* ---- Staff ---------------------------------------------------------- */
  if (method === "GET" && rawPath === "/staff/queue") {
    const kind = params.get("kind");
    const rows = fx.orders.filter((o) =>
      o.fulfillment_type === "pickup" &&
      !["fulfilled", "cancelled", "expired"].includes(o.status) &&
      (kind === "paid" ? o.payment_status === "paid" : o.payment_status === "pending"));
    return { orders: rows.map(summarise) };
  }

  if (method === "GET" && rawPath === "/staff/lookup") {
    const q = (params.get("q") ?? "").toLowerCase();
    const rows = fx.orders.filter((o) =>
      o.order_number.toLowerCase().includes(q) || "2348030000009".includes(q));
    return { results: rows.map(summarise) };
  }

  if (method === "POST" && rawPath === "/staff/walk-in") {
    const kg = Number(body?.kg ?? 0);
    if (kg <= 0) throw fail("VALIDATION", 400, "ENTER AN AMOUNT", { fields: [{ field: "kg", message: "Enter an amount" }] });
    if (!body?.guest_name?.trim()) throw fail("VALIDATION", 400, "WE NEED A NAME", { fields: [{ field: "guest_name", message: "We need a name" }] });
    if (!body?.guest_phone?.trim()) throw fail("VALIDATION", 400, "WE NEED A PHONE NUMBER", { fields: [{ field: "guest_phone", message: "We need a phone number" }] });
    if (kg > availableKg()) throw fail("INSUFFICIENT_GAS", 409, `ONLY ${availableKg()}KG LEFT`, { available_kg: availableKg() });

    const order = newOrder({
      fulfillment_type: body?.fulfillment ?? "pickup",
      gas_amount_kg: kg, gas_subtotal_kobo: gasSubtotal(kg),
      total_kobo: gasSubtotal(kg),
    });
    fx.orders.unshift(order);
    return { order };
  }

  if (method === "POST" && rawPath === "/staff/payments") {
    const order = findOrder(body?.order_id);
    if (!order) throw fail("NOT_FOUND", 404, "NO SUCH ORDER");
    if (order.payment_status === "paid") {
      return { change_due_kobo: null, order_number: order.order_number };
    }
    if (["expired", "cancelled"].includes(order.status)) {
      return {
        change_due_kobo: null, order_number: order.order_number,
        orphaned: true, refund_required: true,
        message: "THE HOLD EXPIRED — MONEY MUST GO BACK",
      };
    }
    markPaid(order, body?.method ?? "cash");
    const change = body?.method === "cash" && body?.tendered_kobo
      ? Math.max(0, body.tendered_kobo - order.total_kobo) : null;
    return { change_due_kobo: change, order_number: order.order_number };
  }

  if (method === "POST" && rawPath === "/staff/scan") {
    const orderId = state.qrTokens.get(body?.token ?? "");
    const order = orderId ? findOrder(orderId) : undefined;
    if (!order) throw fail("QR_INVALID", 404, "THAT CODE ISN'T OURS");
    if (order.payment_status !== "paid") {
      throw fail("UNPAID", 409, "NOT PAID — TAKE PAYMENT FIRST", { order_number: order.order_number });
    }
    if (order.status === "fulfilled") {
      throw fail("QR_ALREADY_SCANNED", 409, "ALREADY HANDED OVER", { order_number: order.order_number });
    }
    order.status = "fulfilled";
    order.fulfilled_at = new Date().toISOString();
    return { order_number: order.order_number };
  }

  if (rawPath === "/staff/reconciliation") {
    if (method === "GET") {
      const date = params.get("date") ?? new Date().toISOString().slice(0, 10);
      const paid = fx.orders.filter((o) => o.payment_status === "paid" || o.status === "fulfilled");
      const expected = paid.reduce((s, o) => s + o.total_kobo, 0);
      return {
        shift_date: date, expected_kobo: expected, transaction_count: paid.length,
        reconciliation: state.closedShifts.get(date) ?? null,
      };
    }
    if (method === "POST") {
      const date = body?.shift_date ?? new Date().toISOString().slice(0, 10);
      if (state.closedShifts.has(date)) {
        return { ok: true, already_closed: true };
      }
      const paid = fx.orders.filter((o) => o.payment_status === "paid" || o.status === "fulfilled");
      const expected = paid.reduce((s, o) => s + o.total_kobo, 0);
      state.closedShifts.set(date, {
        counted_kobo: body?.counted_kobo ?? 0,
        variance_kobo: (body?.counted_kobo ?? 0) - expected,
        note: body?.note ?? null,
        closed_at: new Date().toISOString(),
      });
      return { ok: true };
    }
  }

  /* ---- Driver --------------------------------------------------------- */
  if (method === "GET" && rawPath === "/driver/me") {
    return { driver: fx.drivers[0] };
  }

  if (method === "PATCH" && rawPath === "/driver/availability") {
    const next = body?.status;
    if (next === "offline" && fx.deliveries.some((d) => ["assigned", "en_route"].includes(d.status))) {
      throw fail("HAS_OPEN_DROP", 409,
        "YOU STILL HAVE A LIVE DROP — FINISH IT FIRST",
        { fields: [{ field: "status", message: "Finish your live drop first" }] });
    }
    fx.drivers[0].status = next;
    return { status: next };
  }

  if (method === "GET" && rawPath === "/driver/deliveries") {
    const scope = params.get("scope") ?? "active";
    const rows = fx.deliveries.filter((d) =>
      scope === "completed" ? ["delivered", "returned"].includes(d.status)
      : scope === "active" ? !["delivered", "returned"].includes(d.status)
      : true);
    return {
      deliveries: rows.map((d) => ({
        ...d,
        order: withDeliveryOrder(d.delivery_id),
      })),
    };
  }

  if (method === "GET" && seg[0] === "driver" && seg[1] === "deliveries" && seg[2] && !seg[3]) {
    const d = fx.deliveries.find((x) => x.delivery_id === seg[2]);
    if (!d) throw fail("NOT_FOUND", 404, "NO SUCH DROP");
    return { delivery: { ...d, order: withDeliveryOrder(d.delivery_id) } };
  }

  if (method === "POST" && seg[0] === "driver" && seg[1] === "deliveries" && seg[3] === "en-route") {
    const d = fx.deliveries.find((x) => x.delivery_id === seg[2]);
    if (!d) throw fail("NOT_FOUND", 404, "NO SUCH DROP");
    d.status = "en_route";
    d.en_route_at = new Date().toISOString();
    d.eta_minutes = d.eta_minutes ?? 20;
    return { status: "en_route" };
  }

  if (method === "POST" && seg[0] === "driver" && seg[1] === "deliveries" && seg[3] === "failed") {
    const d = fx.deliveries.find((x) => x.delivery_id === seg[2]);
    if (!d) throw fail("NOT_FOUND", 404, "NO SUCH DROP");
    d.status = body?.outcome === "return" ? "returned" : "rescheduled";
    d.failure_reason = body?.reason ?? "other";
    d.attempt_count = (d.attempt_count ?? 0) + 1;
    return { status: d.status };
  }

  if (method === "POST" && rawPath === "/driver/scan") {
    const orderId = state.qrTokens.get(body?.token ?? "");
    const order = orderId ? findOrder(orderId) : undefined;
    if (!order) throw fail("QR_INVALID", 404, "THAT CODE ISN'T OURS");
    if (order.fulfillment_type !== "delivery") {
      throw fail("WRONG_SURFACE", 409, "THIS IS A PICKUP CODE", { order_number: order.order_number });
    }
    if (order.payment_status !== "paid") {
      throw fail("UNPAID", 409, "NOT PAID — DON'T HAND IT OVER", { order_number: order.order_number });
    }
    if (order.status === "fulfilled") {
      throw fail("ALREADY_FULFILLED", 409, "ALREADY DELIVERED", { order_number: order.order_number });
    }
    order.status = "fulfilled";
    order.fulfilled_at = new Date().toISOString();
    const d = fx.deliveries.find((x) => x.delivery_id === order.delivery?.delivery_id);
    if (d) { d.status = "delivered"; d.delivered_at = new Date().toISOString(); }
    return { order_number: order.order_number };
  }

  /* ---- Admin ---------------------------------------------------------- */
  if (method === "GET" && rawPath === "/admin/stock") {
    const available = availableKg();
    return {
      stock: {
        total_received_kg: state.stockReceivedKg,
        reserved_kg: reservedKg(),
        deducted_kg: state.stockDeductedKg,
        available_kg: available,
        rate_kobo_per_kg: state.rateKoboPerKg,
        fill_percent: Math.round((available / state.stockReceivedKg) * 100),
        days_remaining: available > 0 ? Math.floor(available / 180) : 0,
        updated_at: new Date().toISOString(),
      },
    };
  }

  if (rawPath === "/admin/stock/entries") {
    if (method === "GET") return { entries: fx.stockEntries };
    if (method === "POST") {
      const amount = Number(body?.amount_kg ?? 0);
      if (amount <= 0) throw fail("VALIDATION", 400, "ENTER AN AMOUNT");
      if (body?.move === "removal" && amount > availableKg()) {
        throw fail("GAS_OVERSELL", 409,
          `ONLY ${availableKg()}KG IS AVAILABLE TO REMOVE`);
      }
      if (body?.move === "removal") state.stockDeductedKg += amount;
      else state.stockReceivedKg += amount;
      const entry = {
        entry_id: `e-${nextId()}`,
        kind: body?.move === "removal" ? "removal" as const : "addition" as const,
        quantity_kg: amount, note: body?.note ?? null,
        created_at: new Date().toISOString(),
        actor: { display_name: mockProfile().display_name },
      };
      fx.stockEntries.unshift(entry);
      return { entry_id: entry.entry_id };
    }
  }

  if (method === "PATCH" && rawPath === "/admin/rate") {
    const rate = Number(body?.rate_kobo_per_kg ?? 0);
    if (rate <= 0) throw fail("VALIDATION", 400, "THAT RATE ISN'T A NUMBER");
    state.rateKoboPerKg = rate;
    return { rate_kobo_per_kg: rate };
  }

  if (rawPath === "/admin/products") {
    if (method === "GET") return { products: fx.adminProducts() };
    if (method === "POST") {
      if (!body?.name?.trim()) throw fail("VALIDATION", 400, "GIVE IT A NAME", { fields: [{ field: "name", message: "Give it a name" }] });
      if (!(Number(body?.price_kobo) > 0)) throw fail("VALIDATION", 400, "SET A PRICE", { fields: [{ field: "price_kobo", message: "Set a price" }] });
      const created = {
        product_id: `pr-${nextId()}`, name: body.name, subtitle: null,
        description: null, price_kobo: Number(body.price_kobo),
        stock_qty: Number(body.stock_qty ?? 0), reserved_qty: 0,
        available: Number(body.stock_qty ?? 0), active: true,
        product_category: body.category_id ? { slug: body.category_id, name: body.category_id.toUpperCase() } : null,
        image_asset: body.image_asset ? { base_path: "catalog/combo" } : null,
      };
      fx.products.push(created);
      return { product: created };
    }
  }

  if (seg[0] === "admin" && seg[1] === "products" && seg[2]) {
    const p = mutableProduct(seg[2]);
    if (!p) throw fail("NOT_FOUND", 404, "NO SUCH ITEM");
    if (method === "PATCH") {
      if (body.name !== undefined) p.name = body.name;
      if (body.subtitle !== undefined) p.subtitle = body.subtitle;
      if (body.description !== undefined) p.description = body.description;
      if (body.price_kobo !== undefined) p.price_kobo = Number(body.price_kobo);
      if (body.active !== undefined) p.active = Boolean(body.active);
      if (body.image_asset !== undefined) p.image_asset = { base_path: "catalog/combo" };
      if (body.stock_delta !== undefined && body.stock_delta !== null) {
        const next = p.stock_qty + Number(body.stock_delta);
        if (next < p.reserved_qty) {
          throw fail("STOCK_BELOW_RESERVED", 409,
            `${p.reserved_qty} ARE ALREADY RESERVED`);
        }
        if (next < 0) throw fail("VALIDATION", 400, "STOCK CANNOT GO BELOW ZERO");
        p.stock_qty = next;
      }
      p.available = Math.max(0, p.stock_qty - p.reserved_qty);
      return { product: p };
    }
  }

  if (method === "POST" && rawPath === "/admin/bundles/check") {
    const ids: string[] = body?.product_ids ?? [];
    const picked = ids.map((id) => mutableProduct(id)).filter(Boolean);
    const violations: { message: string }[] = [];
    return { compatible: violations.length === 0, violations, picked: picked.length };
  }

  if (method === "GET" && rawPath === "/admin/orders") {
    const status = params.get("status");
    const rows = fx.adminOrders().filter((o) => !status || o.status === status);
    return { orders: rows };
  }

  if (method === "GET" && rawPath === "/admin/flagged") {
    return { flagged: flaggedQueueLive() };
  }

  if (rawPath === "/admin/refunds") {
    if (method === "GET") return { refunds: fx.refunds };
  }

  if (method === "POST" && seg[0] === "admin" && seg[1] === "refunds" && seg[3] === "process") {
    const r = fx.refunds.find((x) => x.refund_id === seg[2]);
    if (!r) throw fail("NOT_FOUND", 404, "NO SUCH REFUND");
    r.status = "refunded";
    r.settled_at = new Date().toISOString();
    return { status: "refunded" };
  }

  if (method === "POST" && seg[0] === "admin" && seg[1] === "refunds" && seg[3] === "manual") {
    const r = fx.refunds.find((x) => x.refund_id === seg[2]);
    if (!r) throw fail("NOT_FOUND", 404, "NO SUCH REFUND");
    if (!body?.note || body.note.trim().length < 3) {
      throw fail("VALIDATION", 400, "SAY HOW YOU REFUNDED IT");
    }
    r.status = "manual";
    r.settled_at = new Date().toISOString();
    return { status: "manual" };
  }

  if (method === "POST" && seg[0] === "admin" && seg[1] === "orders" && seg[3] === "cancel") {
    const order = findOrder(seg[2]);
    if (!order) throw fail("NOT_FOUND", 404, "NO SUCH ORDER");
    if (!body?.reason || body.reason.trim().length < 3) {
      throw fail("VALIDATION", 400, "GIVE A REASON");
    }
    order.status = "cancelled";
    if (order.payment_status === "paid") order.payment_status = "refunded";
    return { reservations_released: 1 };
  }

  if (method === "POST" && seg[0] === "admin" && seg[1] === "orders" && seg[3] === "assign") {
    const order = findOrder(seg[2]);
    if (!order) throw fail("NOT_FOUND", 404, "NO SUCH ORDER");
    const driver = fx.drivers.find((d) => d.driver_id === body?.driver_id);
    if (!driver) throw fail("NOT_FOUND", 404, "NO SUCH DRIVER");
    if (!order.delivery) {
      order.delivery = {
        delivery_id: `dl-${nextId()}`, status: "assigned",
        delivery_address: order.delivery_address ?? "12 Awolowo Road, Ikoyi",
        failure_reason: null, eta_minutes: null, attempt_count: 0,
        assigned_at: new Date().toISOString(), en_route_at: null, delivered_at: null,
        zone: null, driver: { phone: driver.phone, profile: { display_name: driver.profile?.display_name ?? null } },
      };
    } else {
      order.delivery.status = "assigned";
      order.delivery.driver = { phone: driver.phone, profile: { display_name: driver.profile?.display_name ?? null } };
    }
    return { delivery: order.delivery };
  }

  if (rawPath === "/admin/zones") {
    if (method === "GET") return { zones: fx.adminZones };
    if (method === "POST") {
      if (!body?.name?.trim()) throw fail("VALIDATION", 400, "GIVE THE ZONE A NAME");
      if (!(Number(body?.fee_kobo) >= 0)) throw fail("VALIDATION", 400, "SET A FEE");
      const zone = {
        zone_id: `z-${nextId()}`, name: body.name, fee_kobo: Number(body.fee_kobo),
        active: true, description: body.coverage_note ?? null,
      };
      fx.adminZones.push(zone);
      fx.zones.push({ zone_id: zone.zone_id, name: zone.name, fee_kobo: zone.fee_kobo, active: true, coverage_note: zone.description });
      return { zone };
    }
  }

  if (seg[0] === "admin" && seg[1] === "zones" && seg[2]) {
    const z = fx.adminZones.find((x) => x.zone_id === seg[2]);
    if (!z) throw fail("NOT_FOUND", 404, "NO SUCH ZONE");
    if (method === "PATCH") {
      if (body.name !== undefined) z.name = body.name;
      if (body.fee_kobo !== undefined) z.fee_kobo = Number(body.fee_kobo);
      if (body.active !== undefined) z.active = Boolean(body.active);
      return { zone: z };
    }
  }

  if (method === "GET" && rawPath === "/admin/staff") {
    return { staff: fx.staffMembers };
  }

  if (method === "GET" && rawPath === "/admin/drivers") {
    return { drivers: fx.drivers };
  }

  if (rawPath === "/admin/settings") {
    if (method === "GET") {
      return {
        settings: fx.settings.map((s) => ({
          key: s.key, value: Number(s.value), updated_at: fx.notifications[0].created_at,
        })),
      };
    }
  }

  if (method === "PATCH" && seg[0] === "admin" && seg[1] === "settings" && seg[2]) {
    const s = fx.settings.find((x) => x.key === seg[2]);
    if (!s) throw fail("NOT_FOUND", 404, "NO SUCH SETTING");
    s.value = String(body?.value);
    return { ok: true };
  }

  if (method === "GET" && rawPath === "/admin/audit") {
    const type = params.get("entity_type");
    return { entries: fx.auditEntries.filter((e) => !type || e.entity_type === type) };
  }

  if (method === "GET" && rawPath === "/admin/reports/summary") {
    return fx.report(Number(params.get("days") ?? 30));
  }

  /* ---- Uploads -------------------------------------------------------- */
  if (method === "POST" && rawPath === "/uploads/image") {
    return {
      asset_id: `as-${nextId()}`, base_path: "catalog/combo",
      urls: { thumb: `${fx.MEDIA}/catalog/combo/thumb.webp` },
    };
  }
  if (method === "POST" && rawPath === "/uploads/avatar") {
    return { asset_id: `as-${nextId()}`, url: `${fx.MEDIA}/media/avatar/detail.webp` };
  }
  if (method === "POST" && rawPath === "/uploads/bundle") {
    const name = "New Bundle";
    const bundle = {
      ...fx.bundles[0],
      bundle_id: `bu-${nextId()}`,
      name,
    };
    fx.bundles.push(bundle);
    return { bundle, products_created: 0 };
  }

  throw fail("NOT_FOUND", 404, `No mock for ${method} ${path}`);
}

/* --- Helpers that read live state ----------------------------------------- */

function withDeliveryOrder(deliveryId: string) {
  const order =
    fx.orders.find((o) => o.delivery?.delivery_id === deliveryId) ?? fx.orders[0];
  return {
    ...order,
    guest_name: "Walk-in customer",
    guest_phone: "+2348030000009",
    profile: { display_name: "Ade Balogun", phone: "+2348030000001" },
    order_item: order.items ?? [],
  };
}

function flaggedQueueLive() {
  const queue = fx.flaggedQueue();
  const failed = fx.deliveries.filter((d) => ["failed", "rescheduled", "returned"].includes(d.status));
  return {
    ...queue,
    failed_deliveries: failed.map((d) => ({
      delivery_id: d.delivery_id, status: d.status,
      failure_reason: d.failure_reason, attempt_count: d.attempt_count,
      order: { order_id: fx.orders[0].order_id, order_number: fx.orders[0].order_number },
    })),
    total: queue.refunds_owed.length + failed.length + queue.stale_unpaid.length,
  };
}
