import type {
  AdminOrder, AdminProduct, AdminSetting, AdminStaff, AdminZone, AuditEntry,
  Bundle, Delivery, DriverProfile, GasStock, NotificationRow, Order,
  OrderSummary, Product, Profile, Refund, ReportSummary, SavedAddress,
  StaffMember, StockEntry, Zone,
} from "../lib/api";

/* ---------------------------------------------------------------------------
   Demo data for running the interface without a backend.

   Shapes mirror what the Worker returns (the interfaces in lib/api.ts), so a
   screen cannot tell the difference between this and the live API. Everything
   is held in module state for the life of the tab, which is what makes the
   demo interactive: placing an order moves stock, scanning a code fulfils it.
   --------------------------------------------------------------------------- */

const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const RATE_KOBO_PER_KG = 140_000; // ₦1,400.00

/**
 * How long an unpaid order holds stock, in minutes.
 *
 * Minutes, not hours: this is the `app_setting` row the admin TIMINGS screen
 * edits (`hold_minutes`), and that screen's stepper moves in 5-minute steps. It
 * was six hours under the key `hold_hours`, which the real Worker and the seed
 * migration both spell `hold_minutes` — so the stepper wrote a row the screen
 * did not read, and looked dead.
 */
export const HOLD_MINUTES = 30;

/** Media base for the placeholder art in public/mock-media. */
export const MEDIA = "/mock-media";

const asset = (base_path: string) => ({ base_path });

/* --- People --------------------------------------------------------------- */

export const customerProfile: Profile = {
  profile_id: "p-customer",
  role: "customer",
  display_name: "Ade Balogun",
  first_name: "Ade",
  last_name: "Balogun",
  email: "ade@example.com",
  phone: "+2348030000001",
  email_verified_at: iso(-30 * DAY),
  avatar_asset: asset("media/avatar"),
};

export const staffProfiles: Profile[] = [
  { profile_id: "p-staff", role: "staff", display_name: "Ngozi Eze", first_name: "Ngozi", last_name: "Eze", email: "ngozi@u2gas.ng", phone: "+2348030000002", email_verified_at: iso(-20 * DAY), avatar_asset: null },
  { profile_id: "p-driver", role: "driver", display_name: "Ajao Caleb", first_name: "Ajao", last_name: "Caleb", email: "caleb@u2gas.ng", phone: "+2348030000003", email_verified_at: iso(-20 * DAY), avatar_asset: null },
  { profile_id: "p-manager", role: "manager", display_name: "Bola Adeyemi", first_name: "Bola", last_name: "Adeyemi", email: "bola@u2gas.ng", phone: "+2348030000004", email_verified_at: iso(-60 * DAY), avatar_asset: null },
  { profile_id: "p-admin", role: "admin", display_name: "Uche Obi", first_name: "Uche", last_name: "Obi", email: "uche@u2gas.ng", phone: "+2348030000005", email_verified_at: iso(-90 * DAY), avatar_asset: null },
];

export const staffMembers: StaffMember[] = [
  { staff_id: "s-1", status: "active", bank_name: "GTBank", account_number: "0123456789", hired_at: iso(-200 * DAY), profile: staffProfiles[0] },
  { staff_id: "s-2", status: "active", bank_name: "Zenith", account_number: "0987654321", hired_at: iso(-120 * DAY), profile: staffProfiles[2] },
  { staff_id: "s-3", status: "suspended", bank_name: "Access", account_number: "1122334455", hired_at: iso(-60 * DAY), profile: staffProfiles[3] },
];

export const drivers: DriverProfile[] = [
  { driver_id: "d-1", status: "available", phone: "+2348030000003", vehicle_info: "Honda CG 125 · KJA-245-XY", completed_deliveries: 148, profile: { display_name: "Ajao Caleb", avatar_asset: null } },
  { driver_id: "d-2", status: "busy", phone: "+2348030000006", vehicle_info: "Bajaj Boxer · LSD-908-AB", completed_deliveries: 92, profile: { display_name: "Musa Ibrahim", avatar_asset: null } },
  { driver_id: "d-3", status: "offline", phone: "+2348030000007", vehicle_info: "TVS Apache · KJA-771-CD", completed_deliveries: 54, profile: { display_name: "Peter Nwosu", avatar_asset: null } },
];

/* --- Catalogue ------------------------------------------------------------ */

function product(
  product_id: string, name: string, subtitle: string, price_kobo: number,
  stock_qty: number, reserved_qty: number, slug: string, image: string,
): Product {
  return {
    product_id, name, subtitle,
    description: `${name} — depot stock.`,
    price_kobo, stock_qty, reserved_qty,
    available: Math.max(0, stock_qty - reserved_qty),
    active: true,
    product_category: { slug, name: slug.toUpperCase() },
    image_asset: asset(image),
  };
}

export const products: Product[] = [
  // Subtitles render into the artboard's own `1:1474` slot, which the file
  // draws at 32px inside a 440px board. The file clips anything longer, so
  // keep each under about 11 characters — a longer string is cut off mid-word.
  product("pr-cylinder", "Gas Cylinder 12.5kg", "REFILLABLE", 4_500_000, 24, 3, "cylinder", "catalog/cylinder"),
  product("pr-hose", "High Pressure Hose", "1.5M · RUBBER", 250_000, 40, 5, "hose", "catalog/hose"),
  product("pr-regulator", "Brass Regulator", "UNIVERSAL", 850_000, 30, 2, "regulator", "catalog/regulator"),
  product("pr-clamp", "Hose Clamp Pair", "STAINLESS", 120_000, 60, 0, "clamp", "catalog/clamp"),
  product("pr-battery", "Ignition Battery", "1.5V · SINGLE", 45_000, 120, 12, "battery", "catalog/battery"),
  product("pr-burner", "Tabletop Burner", "SINGLE RING", 3_200_000, 8, 1, "burner", "catalog/burner"),
];

/** A bundle row is a Product plus its slot and quantity. */
function member(p: Product, slot_index: number, quantity = 1) {
  return { ...p, slot_index, quantity };
}

function buildBundle(
  bundle_id: string, name: string, description: string, price_kobo: number,
  image: string, picked: [Product, number][],
): Bundle {
  const members = picked.map(([p, slot], i) => member(p, i + 1));
  const separately = members.reduce((sum, m) => sum + m.price_kobo * m.quantity, 0);
  const available = members.length
    ? Math.min(...members.map((m) => Math.floor(m.available / m.quantity)))
    : 0;
  const short = members.find((m) => m.available < m.quantity);
  return {
    bundle_id, name, description,
    price_kobo,
    image: asset(image),
    members,
    separately_kobo: separately,
    saving_kobo: Math.max(0, separately - price_kobo),
    available,
    unavailable_member: short ? short.name : null,
  };
}

export const bundles: Bundle[] = [
  buildBundle("bu-combo", "Complete Cooking Kit",
    "Cylinder, hose and regulator — everything to start cooking.",
    5_400_000, "catalog/combo",
    [[products[0], 1], [products[1], 2], [products[2], 3]]),
  buildBundle("bu-starter", "Starter Set",
    "Hose, regulator and clamps.",
    1_050_000, "catalog/combo",
    [[products[1], 1], [products[2], 2], [products[3], 3]]),
];

export const categories = [
  { slug: "cylinder", name: "CYLINDER" },
  { slug: "hose", name: "HOSE" },
  { slug: "regulator", name: "REGULATOR" },
  { slug: "clamp", name: "CLAMP" },
  { slug: "battery", name: "BATTERY" },
  { slug: "burner", name: "BURNER" },
];

/* --- Delivery ------------------------------------------------------------- */

export const zones: Zone[] = [
  { zone_id: "z-1", name: "Ikoyi", fee_kobo: 150_000, active: true, coverage_note: "Same-day before 4pm" },
  { zone_id: "z-2", name: "Yaba", fee_kobo: 200_000, active: true, coverage_note: "Same-day before 2pm" },
  { zone_id: "z-3", name: "Lekki Phase 1", fee_kobo: 250_000, active: true, coverage_note: null },
  { zone_id: "z-4", name: "Ajegunle", fee_kobo: 300_000, active: false, coverage_note: null },
];

export const adminZones: AdminZone[] = zones.map((z) => ({
  zone_id: z.zone_id, name: z.name, fee_kobo: z.fee_kobo,
  active: Boolean(z.active), description: z.coverage_note,
}));

/* --- Tank ----------------------------------------------------------------- */

export const tankBase = { total_received_kg: 5_000, deducted_kg: 1_500 };

/* --- Orders --------------------------------------------------------------- */

const line = (name: string, qty: number, unit: number) => ({
  order_item_id: `oi-${Math.random().toString(36).slice(2, 8)}`,
  quantity: qty, unit_price_kobo: unit, bundle_id: null,
  product: { name, subtitle: null, image_asset: asset("catalog/battery") },
});

export const orders: Order[] = [
  {
    order_id: "o-unpaid", order_number: "U2-100042", order_type: "gas",
    status: "pending", payment_status: "pending", fulfillment_type: "pickup",
    gas_amount_kg: 10, gas_subtotal_kobo: 10 * RATE_KOBO_PER_KG,
    items_subtotal_kobo: 0, delivery_fee_kobo: 0,
    total_kobo: 10 * RATE_KOBO_PER_KG,
    hold_expires_at: iso(4 * HOUR), created_at: iso(-2 * HOUR),
    fulfilled_at: null, delivery_address: null, rate_at_purchase: RATE_KOBO_PER_KG,
    items: [], payments: [], delivery: null,
  },
  {
    order_id: "o-paid", order_number: "U2-100044", order_type: "gas",
    status: "confirmed", payment_status: "paid", fulfillment_type: "pickup",
    gas_amount_kg: 12, gas_subtotal_kobo: 12 * RATE_KOBO_PER_KG,
    items_subtotal_kobo: 0, delivery_fee_kobo: 0,
    total_kobo: 12 * RATE_KOBO_PER_KG,
    hold_expires_at: iso(-1 * HOUR), created_at: iso(-6 * HOUR),
    fulfilled_at: null, delivery_address: null, rate_at_purchase: RATE_KOBO_PER_KG,
    items: [], payments: [{ method: "card", status: "success", amount_kobo: 12 * RATE_KOBO_PER_KG, paid_at: iso(-5 * HOUR) }],
    delivery: null,
  },
  {
    order_id: "o-delivery", order_number: "U2-100045", order_type: "mixed",
    status: "processing", payment_status: "paid", fulfillment_type: "delivery",
    gas_amount_kg: 6, gas_subtotal_kobo: 6 * RATE_KOBO_PER_KG,
    items_subtotal_kobo: 250_000, delivery_fee_kobo: 150_000,
    total_kobo: 6 * RATE_KOBO_PER_KG + 250_000 + 150_000,
    hold_expires_at: iso(-3 * HOUR), created_at: iso(-8 * HOUR),
    fulfilled_at: null, delivery_address: "12 Awolowo Road, Ikoyi",
    rate_at_purchase: RATE_KOBO_PER_KG,
    items: [line("High Pressure Hose", 1, 250_000)],
    payments: [{ method: "card", status: "success", amount_kobo: 6 * RATE_KOBO_PER_KG + 400_000, paid_at: iso(-7 * HOUR) }],
    delivery: {
      delivery_id: "dl-1", status: "en_route",
      delivery_address: "12 Awolowo Road, Ikoyi",
      failure_reason: null, eta_minutes: 18, attempt_count: 1,
      assigned_at: iso(-2 * HOUR), en_route_at: iso(-30 * 60_000),
      delivered_at: null,
      zone: { name: "Ikoyi", fee_kobo: 150_000 },
      driver: { phone: "+2348030000003", profile: { display_name: "Ajao Caleb" } },
    },
  },
  {
    order_id: "o-fulfilled", order_number: "U2-100037", order_type: "gas",
    status: "fulfilled", payment_status: "paid", fulfillment_type: "pickup",
    gas_amount_kg: 6, gas_subtotal_kobo: 6 * RATE_KOBO_PER_KG,
    items_subtotal_kobo: 0, delivery_fee_kobo: 0,
    total_kobo: 6 * RATE_KOBO_PER_KG,
    hold_expires_at: iso(-2 * DAY), created_at: iso(-3 * DAY),
    fulfilled_at: iso(-2 * DAY), delivery_address: null,
    rate_at_purchase: RATE_KOBO_PER_KG, items: [],
    payments: [{ method: "cash", status: "success", amount_kobo: 6 * RATE_KOBO_PER_KG, paid_at: iso(-2 * DAY) }],
    delivery: null,
  },
  {
    order_id: "o-expired", order_number: "U2-100031", order_type: "gas",
    status: "expired", payment_status: "pending", fulfillment_type: "pickup",
    gas_amount_kg: 15, gas_subtotal_kobo: 15 * RATE_KOBO_PER_KG,
    items_subtotal_kobo: 0, delivery_fee_kobo: 0,
    total_kobo: 15 * RATE_KOBO_PER_KG,
    hold_expires_at: iso(-5 * DAY), created_at: iso(-6 * DAY),
    fulfilled_at: null, delivery_address: null, rate_at_purchase: RATE_KOBO_PER_KG,
    items: [], payments: [], delivery: null,
  },
];

/** `Delivery.delivery_id` is optional on the wire; every row here has one. */
export type DemoDelivery = Delivery & { delivery_id: string };

export const deliveries: DemoDelivery[] = [
  orders[2].delivery as DemoDelivery,
  {
    delivery_id: "dl-2", status: "assigned",
    delivery_address: "4 Marina Street, Yaba", failure_reason: null,
    eta_minutes: null, attempt_count: 0, assigned_at: iso(-1 * HOUR),
    en_route_at: null, delivered_at: null,
    zone: { name: "Yaba", fee_kobo: 200_000 },
    driver: { phone: "+2348030000003", profile: { display_name: "Ajao Caleb" } },
  },
  {
    delivery_id: "dl-3", status: "delivered",
    delivery_address: "19 Bode Thomas, Surulere", failure_reason: null,
    eta_minutes: null, attempt_count: 1, assigned_at: iso(-2 * DAY),
    en_route_at: iso(-2 * DAY), delivered_at: iso(-2 * DAY + 40 * 60_000),
    zone: { name: "Yaba", fee_kobo: 200_000 },
    driver: { phone: "+2348030000003", profile: { display_name: "Ajao Caleb" } },
  },
];

/* --- Customer-adjacent ---------------------------------------------------- */

export const addresses: SavedAddress[] = [
  { address_id: "a-1", label: "Home", line: "12 Awolowo Road, Ikoyi", latitude: 6.45, longitude: 3.43, is_default: true, created_at: iso(-40 * DAY), zone: { zone_id: "z-1", name: "Ikoyi", fee_kobo: 150_000, active: true } },
  { address_id: "a-2", label: "Shop", line: "4 Marina Street, Yaba", latitude: null, longitude: null, is_default: false, created_at: iso(-10 * DAY), zone: { zone_id: "z-2", name: "Yaba", fee_kobo: 200_000, active: true } },
];

export const notifications: NotificationRow[] = [
  { notification_id: "n-1", kind: "delivery.en_route", title: "Your driver is on the way", body: "Ajao Caleb will arrive in about 18 minutes.", order_id: "o-delivery", created_at: iso(-30 * 60_000), send_status: "sent" },
  { notification_id: "n-2", kind: "payment.confirmed", title: "Payment received", body: "We got ₦16,800 for U2-100044.", order_id: "o-paid", created_at: iso(-5 * HOUR), send_status: "sent" },
  { notification_id: "n-3", kind: "order.expired", title: "Your hold ran out", body: "U2-100031 was released back to stock.", order_id: "o-expired", created_at: iso(-5 * DAY), send_status: "sent" },
  { notification_id: "n-4", kind: "stock.low", title: "Running low on 12.5kg", body: "Under 25 cylinders left at the depot.", order_id: null, created_at: iso(-1 * DAY), send_status: "sent" },
];

/* --- Admin ---------------------------------------------------------------- */

export const refunds: Refund[] = [
  {
    refund_id: "r-1", amount_kobo: 840_000, currency: "NGN", status: "pending",
    reason: "Order cancelled after payment", attempts: 1,
    provider_refund_id: null, last_error: "Paystack timeout",
    created_at: iso(-1 * DAY), settled_at: null,
    order: { order_id: "o-expired", order_number: "U2-100031", guest_phone: "+2348030000009", profile: null },
  },
];

export const auditEntries: AuditEntry[] = [
  { audit_id: 1, action: "bundle.publish_override", entity_type: "bundle", entity_id: "bu-starter", before: null, after: { name: "Starter Set" }, note: "Manager override — supplier spec changed", created_at: iso(-2 * DAY), request_id: "req-9f2c11", actor: { display_name: "Bola Adeyemi", role: "manager" } },
  { audit_id: 2, action: "payment.amount_mismatch", entity_type: "order", entity_id: "o-delivery", before: null, after: { expected: 990_000 }, note: "Paystack reported a larger amount", created_at: iso(-7 * HOUR), request_id: "req-3a1b70", actor: { display_name: null, role: "system" } },
  { audit_id: 3, action: "gas_stock.addition", entity_type: "gas_stock", entity_id: "e-1", before: null, after: { amount_kg: 3000 }, note: "Truck 24 delivery", created_at: iso(-3 * DAY), request_id: "req-77aa02", actor: { display_name: "Uche Obi", role: "admin" } },
  { audit_id: 4, action: "product.price_change", entity_type: "product", entity_id: "pr-hose", before: { price_kobo: 220_000 }, after: { price_kobo: 250_000 }, note: null, created_at: iso(-4 * DAY), request_id: null, actor: { display_name: "Uche Obi", role: "admin" } },
];

export const stockEntries: StockEntry[] = [
  { entry_id: "e-1", move: "addition", amount_kg: 3_000, note: "Truck 24 delivery", entry_date: iso(-3 * DAY), admin: { display_name: "Uche Obi" } },
  { entry_id: "e-2", move: "removal", amount_kg: 120, note: "Cylinder swap, no note", entry_date: iso(-2 * DAY), admin: { display_name: "Ngozi Eze" } },
];

export const settings: AdminSetting[] = [
  { key: "hold_minutes", value: String(HOLD_MINUTES), description: "How long an unpaid order holds stock" },
  { key: "qr_valid_hours", value: "72", description: "How long a collection code stays good" },
  { key: "max_gas_kg_per_order", value: "50", description: "Most gas in one order" },
];

/* --- Derived -------------------------------------------------------------- */

function reservedKg(): number {
  return orders
    .filter((o) => ["pending", "confirmed", "processing"].includes(o.status))
    .reduce((s, o) => s + o.gas_amount_kg, 0);
}

export function availableKg(): number {
  return Math.max(0, tankBase.total_received_kg - tankBase.deducted_kg - reservedKg());
}

export function gasStock(): GasStock {
  const available = availableKg();
  return {
    total_received_kg: tankBase.total_received_kg,
    reserved_kg: reservedKg(),
    deducted_kg: tankBase.deducted_kg,
    available_kg: available,
    rate_kobo_per_kg: RATE_KOBO_PER_KG,
    fill_percent: Math.round((available / tankBase.total_received_kg) * 100),
    days_remaining: available > 0 ? Math.floor(available / 180) : 0,
    updated_at: iso(-2 * HOUR),
  };
}

export function summarise(o: Order): OrderSummary {
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

export function report(days: number): ReportSummary {
  const cutoff = now - days * DAY;
  const inRange = orders.filter((o) => new Date(o.created_at).getTime() >= cutoff);
  const fulfilled = inRange.filter((o) => o.status === "fulfilled");
  const revenue = inRange
    .filter((o) => o.payment_status === "paid")
    .reduce((s, o) => s + o.total_kobo, 0);

  return {
    period_days: days,
    orders_total: inRange.length,
    orders_fulfilled: fulfilled.length,
    orders_expired: inRange.filter((o) => o.status === "expired").length,
    orders_cancelled: inRange.filter((o) => o.status === "cancelled").length,
    gas_sold_kg: inRange.reduce((s, o) => s + o.gas_amount_kg, 0),
    revenue_kobo: revenue,
    revenue_by_method: { cash: Math.round(revenue * 0.35), card: Math.round(revenue * 0.5), bank_transfer: Math.round(revenue * 0.15) },
    pickup_share: inRange.length
      ? inRange.filter((o) => o.fulfillment_type === "pickup").length / inRange.length
      : 0,
  };
}

export function adminOrders(): AdminOrder[] {
  return orders.map((o) => ({
    order_id: o.order_id, order_number: o.order_number,
    status: o.status, payment_status: o.payment_status,
    refund_status: null, total_kobo: o.total_kobo,
    order_type: o.order_type, fulfillment_type: o.fulfillment_type,
    gas_amount_kg: o.gas_amount_kg, created_at: o.created_at,
    guest_phone: "+2348030000009",
    profile: { display_name: "Ade Balogun", phone: "+2348030000001" },
    delivery: o.delivery
      ? { status: o.delivery.status, driver_id: "d-1", delivery_address: o.delivery.delivery_address }
      : null,
  }));
}

export function adminProducts(): AdminProduct[] {
  return products.map((p) => ({
    product_id: p.product_id, name: p.name, price_kobo: p.price_kobo,
    stock_qty: p.stock_qty, reserved_qty: p.reserved_qty, active: p.active,
    category_id: p.product_category?.slug ?? null,
    image_asset: p.image_asset ? { base_path: p.image_asset.base_path } : null,
  }));
}

export function flaggedQueue() {
  const owed = auditEntries.filter((e) => e.action === "payment.amount_mismatch");
  const failed = deliveries.filter((d) => d.status === "failed");
  return {
    refunds_owed: owed.map((e) => ({
      audit_id: e.audit_id, entity_id: e.entity_id ?? "",
      created_at: e.created_at, note: e.note,
      after: { amount_kobo: Number(e.after?.expected ?? 0) },
    })),
    failed_deliveries: failed.map((d) => ({
      delivery_id: d.delivery_id, status: d.status,
      failure_reason: d.failure_reason, attempt_count: d.attempt_count,
      order: { order_id: "o-delivery", order_number: "U2-100045" },
    })),
    stale_unpaid: [{
      order_id: "o-unpaid", order_number: "U2-100042",
      total_kobo: 10 * RATE_KOBO_PER_KG, created_at: iso(-2 * HOUR),
    }],
    total: owed.length + failed.length + 1,
  };
}

export function staffRow(role: string): AdminStaff {
  const p = staffProfiles.find((x) => x.role === role) ?? staffProfiles[0];
  return {
    staff_id: `s-${role}`, status: "active", role,
    profile: { display_name: p.display_name, email: p.email },
  };
}

export const STAFF_ROLES = ["staff", "manager", "admin"];
