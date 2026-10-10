import { apiFetch, mediaUrl, newIdempotencyKey } from "./api";
import type {
  AuditEntry,
  Bundle,
  BundleMember,
  BundleOffer,
  DriverDrop,
  DriverProfile,
  FlaggedQueue,
  GasStock,
  Notification,
  Order,
  OrderSummary,
  Product,
  Profile,
  Reconciliation,
  Refund,
  ReportSummary,
  SavedAddress,
  StockEntry,
  Zone,
} from "@/types";

/**
 * Typed wrappers over the Worker API. One function per endpoint in
 * docs/FRONTEND-API-CONTRACT.md §4, so a screen never builds a path by hand.
 *
 * The Worker returns the payload directly; `apiFetch` has already unwrapped
 * the error envelope, so nothing here inspects status codes.
 */

// --- Catalogue (public) ------------------------------------------------------

export interface HomePayload {
  ok: boolean;
  rate_kobo_per_kg: number;
  ticker: string;
  available_kg: number;
  unread_notifications: number;
  signed_in: boolean;
}

export function getHome(signal?: AbortSignal): Promise<HomePayload> {
  return apiFetch("/catalog/home", { signal });
}

/**
 * `shop_listing` rows carry `id`/`image_path`; the screens expect the `Product`
 * shape (`product_id`/`image`). Normalise here so no component maps fields.
 */
export function normalizeListing(row: Record<string, unknown>): Product {
  const imagePath = (row.image_path ?? null) as string | null;
  const priceKobo = (row.price_kobo ?? 0) as number;
  return {
    product_id: String(row.id ?? ""),
    name: (row.name as string) ?? undefined,
    subtitle: (row.subtitle as string | null) ?? null,
    price_kobo: priceKobo,
    priceNaira: priceKobo / 100,
    available: (row.available as number) ?? 0,
    stock_qty: (row.available as number) ?? 0,
    product_category: row.category
      ? { slug: String(row.category), name: String(row.category) }
      : null,
    image: mediaUrl(imagePath),
    unavailable: ((row.available as number) ?? 0) <= 0,
  };
}

export async function getShop(
  params: { category?: string; q?: string } = {},
  signal?: AbortSignal,
): Promise<{ items: Product[] }> {
  const payload = await apiFetch<{ items: Record<string, unknown>[] }>(
    "/catalog/shop",
    { query: params, signal },
  );
  return { items: (payload.items ?? []).map(normalizeListing) };
}

/**
 * Resolve whatever an image-bearing row carries — an `image_asset` ref
 * (`{ base_path }`), a bare `image_path`/`base_path` string, or an absolute URL
 * — into the `image` URL the screens render.
 */
function imageUrlFrom(row: Record<string, unknown>): string {
  const asset = row.image_asset;
  if (asset && typeof asset === "object" && "base_path" in asset) {
    return mediaUrl((asset as { base_path?: string | null }).base_path ?? null);
  }
  if (typeof asset === "string") return mediaUrl(asset);
  const path = row.image_path ?? row.base_path;
  return typeof path === "string" ? mediaUrl(path) : "";
}

/**
 * The catalogue endpoints return the raw `image_asset` ref (contract §3.1); the
 * screens render `Product.image` as a URL. Normalise here, so no component has
 * to know about `base_path`.
 */
export function normalizeProduct(row: Record<string, unknown>): Product {
  return { ...(row as unknown as Product), image: imageUrlFrom(row) };
}

export async function getProduct(id: string): Promise<{ product: Product }> {
  const payload = await apiFetch<{ product: Record<string, unknown> }>(
    `/catalog/products/${id}`,
  );
  return { product: normalizeProduct(payload.product) };
}

export async function getBundle(id: string): Promise<{ bundle: Bundle }> {
  const payload = await apiFetch<{ bundle: Record<string, unknown> }>(
    `/catalog/bundles/${id}`,
  );
  const b = payload.bundle;
  return {
    bundle: {
      ...(b as unknown as Bundle),
      image: imageUrlFrom(b),
      // Members carry `slot_index`/`quantity` alongside the product fields, so
      // spread the original row and only swap the image ref for a URL.
      members: ((b.members as Record<string, unknown>[]) ?? []).map((m) => ({
        ...(m as unknown as BundleMember),
        image: imageUrlFrom(m),
      })),
    },
  };
}

export function getZones(): Promise<{ zones: Zone[] }> {
  return apiFetch("/catalog/zones");
}

export function getCompleteTheSet(
  ids: string[],
): Promise<{ bundles: BundleOffer[] }> {
  // Repeated `?in=`, matching `c.req.queries("in")` on the Worker. Joining them
  // into one comma-separated value made the endpoint see a single malformed id
  // and return an empty list.
  return apiFetch("/catalog/complete-the-set", { query: { in: ids } });
}

// --- Account -----------------------------------------------------------------

export interface MePayload {
  profile: Profile;
  home: string;
}

export function getMe(): Promise<MePayload> {
  return apiFetch("/me");
}

export function updateMe(patch: Partial<Profile>): Promise<{ ok: true }> {
  return apiFetch("/me", { method: "PATCH", body: patch });
}

export function getNotifications(): Promise<{ notifications: Notification[] }> {
  return apiFetch("/notifications");
}

export function markNotificationsRead(
  ids?: string[],
): Promise<{ ok: true }> {
  return apiFetch("/notifications/read", {
    method: "POST",
    body: ids ? { notification_ids: ids } : {},
  });
}

export function getAddresses(): Promise<{ addresses: SavedAddress[] }> {
  return apiFetch("/me/addresses");
}

export function createAddress(
  body: Partial<SavedAddress> & { label: string; line: string },
): Promise<{ address: SavedAddress }> {
  return apiFetch("/me/addresses", { method: "POST", body });
}

export function updateAddress(
  id: string,
  body: Partial<SavedAddress>,
): Promise<{ ok: true }> {
  return apiFetch(`/me/addresses/${id}`, { method: "PATCH", body });
}

export function deleteAddress(id: string): Promise<{ ok: true }> {
  return apiFetch(`/me/addresses/${id}`, { method: "DELETE" });
}

// --- Orders ------------------------------------------------------------------

export interface Availability {
  available_kg: number;
  sufficient: boolean;
  subtotal_kobo: number;
}

export function getAvailability(kg: number): Promise<Availability> {
  return apiFetch("/orders/availability", { query: { kg } });
}

export interface OrderLines {
  kind: "product" | "bundle";
  product_id?: string;
  bundle_id?: string;
  quantity: number;
}

export interface CreateOrderResult {
  order: Order;
  guest_token?: string;
}

export function createGasOrder(
  body: {
    kg: number;
    fulfillment: "pickup" | "delivery";
    zone_id?: string;
    address?: string;
    guest_name?: string;
    guest_phone?: string;
  },
  idempotencyKey = newIdempotencyKey(),
): Promise<CreateOrderResult> {
  return apiFetch("/orders/gas", {
    method: "POST",
    body,
    idempotencyKey,
  });
}

export function createCartOrder(
  body: {
    lines: OrderLines[];
    gas_kg?: number;
    fulfillment: "pickup" | "delivery";
    zone_id?: string;
    address?: string;
    guest_name?: string;
    guest_phone?: string;
  },
  idempotencyKey = newIdempotencyKey(),
): Promise<CreateOrderResult> {
  return apiFetch("/orders/cart", {
    method: "POST",
    body,
    idempotencyKey,
  });
}

export function getOrders(): Promise<{ orders: Order[] }> {
  return apiFetch("/orders");
}

export function getOrder(id: string, guestToken?: string): Promise<{ order: Order }> {
  return apiFetch(`/orders/${id}`, { guestToken });
}

export function cancelOrder(
  id: string,
  guestToken?: string,
): Promise<{ reservations_released: number; refund: unknown }> {
  return apiFetch(`/orders/${id}/cancel`, { method: "POST", guestToken });
}

export interface QrResult {
  token: string | null;
  existing: boolean;
  expires_at?: string;
  order_number: string;
}

export function issueQr(
  id: string,
  opts: { guestToken?: string; force?: boolean } = {},
): Promise<QrResult> {
  return apiFetch(`/orders/${id}/qr`, {
    method: "POST",
    guestToken: opts.guestToken,
    query: opts.force ? { force: 1 } : undefined,
  });
}

// --- Payments ----------------------------------------------------------------

export function initializePayment(
  orderId: string,
  guestToken?: string,
): Promise<{ authorization_url: string; reference: string; already_paid?: boolean }> {
  return apiFetch("/payments/initialize", {
    method: "POST",
    body: { order_id: orderId },
    guestToken,
  });
}

export interface VerifyResult {
  paid: boolean;
  order_id: string;
  payment_id: string | null;
  already_processed: boolean;
  orphaned: boolean;
  refund_required: boolean;
}

export function verifyPayment(
  orderId: string,
  reference: string,
  guestToken?: string,
): Promise<VerifyResult> {
  return apiFetch("/payments/verify", {
    method: "POST",
    body: { reference, order_id: orderId },
    guestToken,
  });
}

// --- Staff (role staff | admin) ---------------------------------------------

export function getStaffQueue(
  kind: "paid" | "unpaid",
): Promise<{ orders: OrderSummary[] }> {
  return apiFetch("/staff/queue", { query: { kind } });
}

export function staffLookup(q: string): Promise<{ results: OrderSummary[] }> {
  return apiFetch("/staff/lookup", { query: { q } });
}

export function staffWalkIn(
  body: {
    kg: number;
    lines: OrderLines[];
    guest_name: string;
    guest_phone: string;
    fulfillment: "pickup" | "delivery";
    zone_id?: string;
    address?: string;
  },
  idempotencyKey = newIdempotencyKey(),
): Promise<{ order: Order }> {
  return apiFetch("/staff/walk-in", {
    method: "POST",
    body,
    idempotencyKey,
  });
}

export interface InPersonPaymentResult {
  change_due_kobo: number;
  order_number: string;
  orphaned?: boolean;
  refund_required?: boolean;
  message?: string;
}

export function staffRecordPayment(
  body: {
    order_id: string;
    method: "cash" | "card_terminal" | "bank_transfer" | "opay";
    tendered_kobo?: number;
    terminal_reference?: string;
  },
  idempotencyKey = newIdempotencyKey(),
): Promise<InPersonPaymentResult> {
  return apiFetch("/staff/payments", {
    method: "POST",
    body,
    idempotencyKey,
  });
}

export function staffScan(token: string): Promise<{ order_number: string }> {
  return apiFetch("/staff/scan", { method: "POST", body: { token } });
}

export function getReconciliation(date: string): Promise<Reconciliation> {
  return apiFetch("/staff/reconciliation", { query: { date } });
}

export function closeReconciliation(
  body: { shift_date: string; counted_kobo: number; note?: string },
  idempotencyKey = newIdempotencyKey(),
): Promise<Reconciliation> {
  return apiFetch("/staff/reconciliation", {
    method: "POST",
    body,
    idempotencyKey,
  });
}

// --- Driver (role driver) ----------------------------------------------------

export function getDriverMe(): Promise<{ driver: DriverProfile }> {
  return apiFetch("/driver/me");
}

export function setDriverAvailability(
  status: DriverProfile["status"],
): Promise<{ ok: true }> {
  return apiFetch("/driver/availability", {
    method: "PATCH",
    body: { status },
  });
}

export function getDriverDeliveries(
  scope: "active" | "completed" | "all" = "active",
): Promise<{ deliveries: DriverDrop[] }> {
  return apiFetch("/driver/deliveries", { query: { scope } });
}

export function getDriverDelivery(id: string): Promise<{ delivery: DriverDrop }> {
  return apiFetch(`/driver/deliveries/${id}`);
}

export function markEnRoute(id: string): Promise<{ status: string }> {
  return apiFetch(`/driver/deliveries/${id}/en-route`, { method: "POST" });
}

export function failDelivery(
  id: string,
  body: { reason: string; note?: string; outcome: "reschedule" | "return" },
): Promise<{ status: string }> {
  return apiFetch(`/driver/deliveries/${id}/failed`, { method: "POST", body });
}

export function driverScan(token: string): Promise<{ order_number: string }> {
  return apiFetch("/driver/scan", { method: "POST", body: { token } });
}

// --- Admin (role admin) ------------------------------------------------------

export function getAdminStock(): Promise<GasStock> {
  return apiFetch("/admin/stock");
}

export function addStockEntry(
  body: { move: string; amount_kg: number; note?: string; entry_date?: string },
): Promise<{ ok: true }> {
  return apiFetch("/admin/stock/entries", { method: "POST", body });
}

export function getStockEntries(month?: string): Promise<{ entries: StockEntry[] }> {
  return apiFetch("/admin/stock/entries", { query: { month } });
}

export function setRate(rate_kobo_per_kg: number): Promise<{ ok: true }> {
  return apiFetch("/admin/rate", {
    method: "PATCH",
    body: { rate_kobo_per_kg },
  });
}

export async function getAdminProducts(): Promise<{ products: Product[] }> {
  const payload = await apiFetch<{ products: Record<string, unknown>[] }>(
    "/admin/products",
  );
  return { products: (payload.products ?? []).map(normalizeProduct) };
}

export function createProduct(body: Record<string, unknown>): Promise<{ product: Product }> {
  return apiFetch("/admin/products", { method: "POST", body });
}

export function updateProduct(
  id: string,
  body: Record<string, unknown>,
): Promise<{ ok: true }> {
  return apiFetch(`/admin/products/${id}`, { method: "PATCH", body });
}

export function getAdminOrders(status?: string): Promise<{ orders: Order[] }> {
  return apiFetch("/admin/orders", { query: { status } });
}

export function adminCancelOrder(id: string): Promise<{ ok: true }> {
  return apiFetch(`/admin/orders/${id}/cancel`, { method: "POST" });
}

export function assignDriver(
  orderId: string,
  driverId: string,
): Promise<{ ok: true }> {
  return apiFetch(`/admin/orders/${orderId}/assign`, {
    method: "POST",
    body: { driver_id: driverId },
  });
}

export function getFlagged(): Promise<FlaggedQueue> {
  return apiFetch("/admin/flagged");
}

export function getRefunds(): Promise<{ refunds: Refund[] }> {
  return apiFetch("/admin/refunds");
}

export function processRefund(id: string): Promise<{ ok: true; status: string }> {
  return apiFetch(`/admin/refunds/${id}/process`, { method: "POST" });
}

export function getAdminZones(): Promise<{ zones: Zone[] }> {
  return apiFetch("/admin/zones");
}

export function createZone(body: Record<string, unknown>): Promise<{ zone: Zone }> {
  return apiFetch("/admin/zones", { method: "POST", body });
}

export function getAdminStaff(): Promise<{ staff: unknown[] }> {
  return apiFetch("/admin/staff");
}

export function addStaff(body: {
  email: string;
  role: string;
  display_name?: string;
  bank_name?: string;
  account_number?: string;
}): Promise<{ ok: true }> {
  return apiFetch("/admin/staff", { method: "POST", body });
}

export function removeStaff(id: string): Promise<{ ok: true }> {
  return apiFetch(`/admin/staff/${id}`, { method: "DELETE" });
}

export function getAdminDrivers(): Promise<{ drivers: DriverProfile[] }> {
  return apiFetch("/admin/drivers");
}

export function getAdminAudit(entityType?: string): Promise<{ audit: AuditEntry[] }> {
  return apiFetch("/admin/audit", { query: { entity_type: entityType } });
}

export function getReportSummary(days = 7): Promise<ReportSummary> {
  return apiFetch("/admin/reports/summary", { query: { days } });
}
