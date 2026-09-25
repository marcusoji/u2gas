import { supabase } from "./auth";
import { MOCKS_ENABLED, ROLE_KEY } from "../mocks/gate";

/* ---------------------------------------------------------------------------
   API client.

   Every failed response carries the machine code, the copy the interface
   shows, and the numbers the screen needs to render its state. Screens read
   `message` and `detail`; they never build error copy themselves.
   --------------------------------------------------------------------------- */

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    /** Already written for the interface. Render this verbatim. */
    message: string,
    // Deliberately loose: this is whatever the server attached to the error,
    // and its shape varies by code. Callers read named fields off it.
    public detail: Record<string, any> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The customer can accept a smaller quantity instead of failing outright. */
  get partialGasAvailable(): number | null {
    return this.code === "INSUFFICIENT_GAS" && Number(this.detail.available_kg) > 0
      ? Number(this.detail.available_kg)
      : null;
  }

  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of this.detail.fields ?? []) out[f.field] = f.message;
    return out;
  }

  get isRetryable(): boolean {
    return this.status >= 500 || this.code === "RETRY";
  }
}

async function authHeader(): Promise<Record<string, string>> {
  if (MOCKS_ENABLED) return { Authorization: "Bearer mock-token" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Demo mode. Same contract as the fetch path below — the response body on
 * success, an ApiError carrying the server's own code and copy on failure — so
 * no screen needs to know which one it is talking to.
 *
 * The fixture module is pulled in here rather than at the top of the file: a
 * static import would put every fixture in the production bundle, which the
 * build already proved it would.
 */
async function mockFetch<T>(path: string, init: RequestInit): Promise<T> {
  const mocks = await import("../mocks");
  const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  try {
    return (await mocks.mockRequest(path, {
      ...init, body: body ? init.body : undefined,
    })) as T;
  } catch (e) {
    if (e instanceof mocks.MockHttpError) {
      throw new ApiError(e.code, e.status, e.message, e.detail);
    }
    throw new ApiError("INTERNAL", 500, "SOMETHING WENT WRONG IN DEMO MODE");
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retries = 1,
): Promise<T> {
  if (MOCKS_ENABLED) return mockFetch<T>(path, init);

  let res: Response;

  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(await authHeader()),
        ...init.headers,
      },
    });
  } catch {
    // The network itself failed. Distinct from a server error, and the
    // interface says so — the ticker goes dark rather than showing a 500.
    // navigator.onLine can't see a reachable-but-dead API, so tell the banner.
    window.dispatchEvent(new Event("u2gas:offline"));
    throw new ApiError("OFFLINE", 0, "NO SIGNAL");
  }

  // Any answer at all means we are back.
  window.dispatchEvent(new Event("u2gas:online"));

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new ApiError(
      body?.error?.code ?? "INTERNAL",
      res.status,
      body?.error?.message ?? "WE COULDN'T FINISH THAT — TRY AGAIN",
      body?.error?.detail ?? {},
    );

    // Only safe methods are retried automatically. Silently replaying a POST
    // is how one tap becomes two orders. (Part 17)
    const method = (init.method ?? "GET").toUpperCase();
    const safe = method === "GET" || method === "HEAD";
    if (safe && err.isRetryable && retries > 0) {
      await new Promise((r) => setTimeout(r, 400));
      return request<T>(path, init, retries - 1);
    }
    throw err;
  }

  return body as T;
}

const get  = <T,>(p: string) => request<T>(p);
const post = <T,>(p: string, body?: unknown, idempotencyKey?: string) =>
  request<T>(p, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });

/** Stable per attempt, so a retry of the same submission replays rather than
 *  creating a second order. */
export const newIdempotencyKey = () => crypto.randomUUID().replace(/-/g, "");
const patch = <T,>(p: string, body: unknown) =>
  request<T>(p, { method: "PATCH", body: JSON.stringify(body) });

/* --- Types ----------------------------------------------------------------
   These mirror what the Worker actually returns. Keeping them honest is the
   point: a wrong field name here should be a compile error, not a blank space
   on a receipt at the depot counter.
   -------------------------------------------------------------------------- */

export interface ImageRef {
  base_path: string;
  width?: number;
  height?: number;
}

export interface HomePayload {
  rate_kobo_per_kg: number;
  ticker: string;
  available_kg: number;
  unread_notifications: number;
  signed_in: boolean;
}

export interface ShopItem {
  kind: "product" | "bundle";
  id: string;
  name: string;
  subtitle: string | null;
  price_kobo: number;
  available: number;
  image_path: string | null;
  category: string | null;
}

export interface Product {
  product_id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  price_kobo: number;
  stock_qty: number;
  reserved_qty: number;
  available: number;
  active: boolean;
  product_category?: { slug: string; name: string } | null;
  image_asset?: ImageRef | null;
}

export interface BundleMember extends Product {
  slot_index: number;
  quantity: number;
}

export interface Bundle {
  bundle_id: string;
  name: string;
  description: string | null;
  price_kobo: number;
  image: ImageRef | null;
  members: BundleMember[];
  separately_kobo: number;
  saving_kobo: number;
  available: number;
  unavailable_member: string | null;
}

export interface OrderItem {
  order_item_id: string;
  quantity: number;
  unit_price_kobo: number;
  bundle_id: string | null;
  product: { name: string; subtitle?: string | null; image_asset?: ImageRef | null } | null;
}

export type DeliveryStatus =
  | "assigned" | "en_route" | "delivered" | "failed" | "rescheduled" | "returned";

export interface Delivery {
  /** Minutes left in the departure window, or null when not en route. */
  eta_minutes?: number | null;
  delivery_id?: string;
  status: DeliveryStatus;
  delivery_address: string;
  failure_reason: string | null;
  attempt_count?: number;
  assigned_at?: string;
  en_route_at: string | null;
  delivered_at: string | null;
  zone?: { name: string; fee_kobo: number } | null;
  driver?: { phone: string; profile: { display_name: string | null } | null } | null;
}

export interface Order {
  order_id: string;
  order_number: string;
  order_type: "gas" | "accessory" | "mixed";
  status: "pending" | "confirmed" | "processing" | "fulfilled" | "cancelled" | "expired";
  payment_status: "pending" | "paid" | "failed" | "refunded" | "partially_refunded";
  fulfillment_type: "pickup" | "delivery";
  gas_amount_kg: number;
  gas_subtotal_kobo: number;
  items_subtotal_kobo: number;
  delivery_fee_kobo: number;
  total_kobo: number;
  hold_expires_at: string | null;
  created_at: string;
  fulfilled_at: string | null;
  delivery_address?: string | null;
  rate_at_purchase?: number | null;
  items?: OrderItem[];
  payments?: { method: string; status: string; amount_kobo: number; paid_at: string | null }[];
  delivery?: Delivery | null;
}

/** Queue and lookup rows carry less than a full order. */
export interface OrderSummary {
  order_id: string;
  order_number: string;
  status: Order["status"];
  payment_status: Order["payment_status"];
  fulfillment_type?: Order["fulfillment_type"];
  total_kobo: number;
  gas_amount_kg?: number;
  guest_name: string | null;
  guest_phone: string | null;
  created_at: string;
  hold_expires_at?: string | null;
  profile?: { display_name: string | null; phone: string | null } | null;
}

export interface SavedAddress {
  address_id: string;
  label: string;
  line: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: string;
  zone: { zone_id: string; name: string; fee_kobo: number; active: boolean } | null;
}

export interface BundleOffer {
  bundle_id: string;
  name: string;
  price_kobo: number;
  image_path: string | null;
  separately_kobo: number;
  saving_kobo: number;
  available: number;
  adds: string[];
  members: { product_id: string; name: string; image_path: string | null }[];
}

export interface Zone {
  zone_id: string;
  name: string;
  fee_kobo: number;
  active?: boolean;
  coverage_note: string | null;
}

export interface Profile {
  profile_id: string;
  role: "customer" | "staff" | "driver" | "manager" | "admin";
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  email_verified_at: string | null;
  avatar_asset?: ImageRef | null;
}

export interface Notification {
  notification_id: string;
  kind: string;
  title: string;
  body: string | null;
  order_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface DriverProfile {
  driver_id: string;
  status: "available" | "busy" | "offline";
  phone: string;
  vehicle_info: string | null;
  completed_deliveries: number;
  profile: { display_name: string | null; avatar_asset?: ImageRef | null } | null;
}

export interface DriverDrop extends Delivery {
  delivery_id: string;
  order: Order & {
    guest_name: string | null;
    guest_phone: string | null;
    profile?: { display_name: string | null; phone: string | null } | null;
    order_item?: OrderItem[];
  };
}

export interface GasStock {
  total_received_kg: number;
  reserved_kg: number;
  deducted_kg: number;
  available_kg: number;
  rate_kobo_per_kg: number;
  fill_percent: number;
  days_remaining: number | null;
  updated_at: string;
}

export interface StockEntry {
  entry_id: string;
  move: "addition" | "removal" | "correction";
  amount_kg: number;
  note: string | null;
  entry_date: string;
  admin?: { display_name: string | null } | null;
}

export interface StaffMember {
  staff_id: string;
  status: "active" | "suspended" | "removed";
  bank_name: string | null;
  account_number: string | null;
  hired_at: string;
  profile: Profile | null;
}

export interface Reconciliation {
  shift_date: string;
  expected_kobo: number;
  transaction_count: number;
  reconciliation: {
    counted_kobo: number;
    variance_kobo: number;
    note: string | null;
    closed_at: string | null;
  } | null;
}

export interface AuditEntry {
  audit_id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
  /** Correlates with the Worker's X-Request-Id. Added in migration 0015. */
  request_id?: string | null;
  actor?: { display_name: string | null; role: string } | null;
}

export interface ReportSummary {
  period_days: number;
  orders_total: number;
  orders_fulfilled: number;
  orders_expired: number;
  orders_cancelled: number;
  gas_sold_kg: number;
  revenue_kobo: number;
  revenue_by_method: Record<string, number>;
  pickup_share: number;
}

export interface Refund {
  refund_id: string;
  amount_kobo: number;
  currency: string;
  status: "pending" | "processing" | "refunded" | "declined" | "manual";
  reason: string | null;
  attempts: number;
  provider_refund_id: string | null;
  last_error: string | null;
  created_at: string;
  settled_at: string | null;
  order: {
    order_id: string; order_number: string; guest_phone: string | null;
    profile: { display_name: string | null } | null;
  } | null;
}

/**
 * Shapes the admin screens receive. These were `any[]`, which meant a renamed
 * column in a migration surfaced as undefined on screen rather than as a type
 * error at build time — exactly the class of mistake TypeScript is here for.
 */
export interface AdminOrder {
  order_id: string;
  order_number: string;
  status: string;
  payment_status: string;
  refund_status?: string | null;
  total_kobo: number;
  order_type: "gas" | "accessory" | "mixed";
  fulfillment_type: "pickup" | "delivery";
  gas_amount_kg?: number | null;
  created_at: string;
  guest_phone?: string | null;
  profile?: { display_name: string | null; phone?: string | null } | null;
  delivery?: {
    status: string;
    driver_id?: string | null;
    delivery_address?: string | null;
  } | null;
}

export interface AdminDriver {
  driver_id: string;
  phone: string | null;
  status: "available" | "busy" | "offline";
  completed_deliveries?: number;
  profile?: { display_name: string | null } | null;
}

export interface AdminStaff {
  staff_id: string;
  status: string;
  role?: string;
  profile?: { display_name: string | null; email?: string | null } | null;
}

export interface AdminProduct {
  product_id: string;
  name: string;
  price_kobo: number;
  stock_qty: number;
  reserved_qty: number;
  active: boolean;
  category_id?: string | null;
  image_asset?: { base_path: string } | null;
}

export interface NotificationRow {
  notification_id: string;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  emailed_at?: string | null;
  send_status?: "pending" | "claimed" | "sent" | "failed" | "abandoned";
  order_id?: string | null;
  read_at?: string | null;
}

export interface AdminZone {
  zone_id: string;
  name: string;
  fee_kobo: number;
  active: boolean;
  description?: string | null;
}

export interface AdminSetting {
  key: string;
  value: string;
  description?: string | null;
}

export interface FlaggedRefund {
  audit_id: number;
  entity_id: string;
  created_at: string;
  note?: string | null;
  after?: { amount_kobo?: number; payment_id?: string } | null;
}

export interface FlaggedDelivery {
  delivery_id: string;
  order_id: string;
  status: string;
  failure_reason?: string | null;
  attempt_count?: number;
}

export interface FlaggedOrder {
  order_id: string;
  order_number: string;
  total_kobo: number;
  hold_expires_at?: string | null;
}

export interface FlaggedQueue {
  refunds_owed: FlaggedRefund[];
  failed_deliveries: {
    delivery_id: string;
    status: DeliveryStatus;
    failure_reason: string | null;
    attempt_count: number;
    order: { order_id: string; order_number: string } | null;
  }[];
  stale_unpaid: { order_id: string; order_number: string; total_kobo: number; created_at: string }[];
  total: number;
}

export interface WalkInBody {
  kg: number;
  lines: { kind: "product" | "bundle"; product_id?: string; bundle_id?: string; quantity: number }[];
  guest_name: string;
  guest_phone: string;
  fulfillment: "pickup" | "delivery";
  zone_id?: string;
  address?: string;
}

export interface ProductDraft {
  name: string;
  subtitle?: string;
  description?: string;
  category_id?: string;
  sku?: string;
  price_kobo: number;
  stock_qty?: number;
  image_asset?: string;
  attributes?: Record<string, string>;
}

export interface ProductPatch {
  name?: string;
  subtitle?: string;
  description?: string;
  price_kobo?: number;
  stock_delta?: number;
  stock_note?: string;
  active?: boolean;
  image_asset?: string;
}

/* --- Endpoints ------------------------------------------------------------ */

export const api = {
  home:        () => get<{ ok: true } & HomePayload>("/catalog/home"),
  shop:        (q?: { category?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (q?.category) params.set("category", q.category);
    if (q?.q) params.set("q", q.q);
    const qs = params.toString();
    return get<{ items: ShopItem[] }>(`/catalog/shop${qs ? `?${qs}` : ""}`);
  },
  product:     (id: string) => get<{ product: Product }>(`/catalog/products/${id}`),
  bundle:      (id: string) => get<{ bundle: Bundle }>(`/catalog/bundles/${id}`),
  zones:       () => get<{ zones: Zone[] }>("/catalog/zones"),

  /** Bundles that complete what the customer already has. */
  completeTheSet: (productIds: string[]) => {
    const p = new URLSearchParams();
    productIds.forEach((id) => p.append("in", id));
    return get<{ bundles: BundleOffer[] }>(`/catalog/complete-the-set?${p}`);
  },

  me:          () => get<{ profile: Profile; home: string }>("/me"),

  addresses: {
    list:   () => get<{ addresses: SavedAddress[] }>("/me/addresses"),
    create: (body: {
      label: string; line: string; zone_id?: string | null;
      latitude?: number | null; longitude?: number | null; is_default?: boolean;
    }) => post<{ address: SavedAddress }>("/me/addresses", body),
    update: (id: string, body: Partial<{
      label: string; line: string; zone_id: string | null; is_default: boolean;
    }>) => patch<{ ok: true }>(`/me/addresses/${id}`, body),
    remove: (id: string) =>
      request<{ ok: true }>(`/me/addresses/${id}`, { method: "DELETE" }),
  },
  notifications: () => get<{ notifications: Notification[] }>("/notifications"),
  markRead:    () => post<{ ok: true }>("/notifications/read"),

  availability: (kg: number) =>
    get<{ available_kg: number; sufficient: boolean; subtotal_kobo: number }>(
      `/orders/availability?kg=${kg}`),

  createGasOrder: (body: {
    kg: number;
    fulfillment: "pickup" | "delivery";
    zone_id?: string;
    address?: string;
    guest_name?: string;
    guest_phone?: string;
  }, idempotencyKey?: string) =>
    post<{ order: Order; guest_token?: string }>("/orders/gas", body, idempotencyKey),

  createCartOrder: (body: {
    lines: { kind: "product" | "bundle"; product_id?: string; bundle_id?: string; quantity: number }[];
    gas_kg?: number;
    fulfillment: "pickup" | "delivery";
    zone_id?: string;
    address?: string;
    guest_name?: string;
    guest_phone?: string;
  }, idempotencyKey?: string) =>
    post<{ order: Order; guest_token?: string }>("/orders/cart", body, idempotencyKey),

  orders:      () => get<{ orders: Order[] }>("/orders"),

  // A guest has no session, so every read carries the capability token they
  // were handed at checkout.
  order:       (id: string, t?: string) =>
                 get<{ order: Order }>(`/orders/${id}${t ? `?t=${encodeURIComponent(t)}` : ""}`),
  cancelOrder: (id: string, t?: string) =>
                 post<{
                   reservations_released: number;
                   refund: { refund_id: string; status: string } | null;
                 }>(`/orders/${id}/cancel${t ? `?t=${encodeURIComponent(t)}` : ""}`),
  /**
   * Ask for the collection code.
   *
   * Returns `token: null, existing: true` when a valid code is already out
   * there — the server will not replace it, because a refresh must not
   * invalidate a code the customer has already screenshotted. Pass
   * force when the client has no cached copy to show.
   */
  issueQr:     (id: string, t?: string, force = false) => {
    const p = new URLSearchParams();
    if (t) p.set("t", t);
    if (force) p.set("force", "1");
    const qs = p.toString();
    return post<{
      token: string | null;
      existing: boolean;
      expires_at?: string | null;
      order_number: string;
    }>(`/orders/${id}/qr${qs ? `?${qs}` : ""}`);
  },

  payInit:   (order_id: string, t?: string) =>
    post<{ authorization_url: string; reference: string; already_paid?: boolean }>(
      `/payments/initialize${t ? `?t=${encodeURIComponent(t)}` : ""}`, { order_id }),
  // order_id is required: a reference alone used to be enough to act on
  // somebody else's order.
  payVerify: (reference: string, order_id: string, t?: string) =>
    post<{ paid: boolean; order_id?: string; refund_required?: boolean }>(
      `/payments/verify${t ? `?t=${encodeURIComponent(t)}` : ""}`,
      { reference, order_id }),

  staff: {
    queue:   (kind: "paid" | "unpaid") => get<{ orders: OrderSummary[] }>(`/staff/queue?kind=${kind}`),
    lookup:  (q: string) => get<{ results: OrderSummary[] }>(`/staff/lookup?q=${encodeURIComponent(q)}`),
    walkIn:  (body: WalkInBody, idempotencyKey?: string) => post<{ order: Order }>("/staff/walk-in", body, idempotencyKey),
    recordPayment: (body: {
      order_id: string;
      method: "cash" | "card_terminal" | "bank_transfer" | "opay";
      tendered_kobo?: number;
      terminal_reference?: string;
    }, idempotencyKey?: string) => post<{
      change_due_kobo: number | null;
      order_number: string;
      orphaned?: boolean;
      refund_required?: boolean;
      message?: string;
    }>("/staff/payments", body, idempotencyKey),
    scan:    (token: string) => post<{ order_number: string }>("/staff/scan", { token }),
    reconciliation: (date?: string) =>
      get<Reconciliation>(`/staff/reconciliation${date ? `?date=${date}` : ""}`),
    closeShift: (body: { shift_date: string; counted_kobo: number; note?: string }, idempotencyKey?: string) =>
      post<{ ok: true; reconciliation?: Reconciliation; already_closed?: boolean }>("/staff/reconciliation", body, idempotencyKey),
  },

  driver: {
    me:        () => get<{ driver: DriverProfile }>("/driver/me"),
    setStatus: (status: "available" | "busy" | "offline") =>
      patch<{ status: string }>("/driver/availability", { status }),
    deliveries: (scope: "active" | "completed" | "all" = "active") =>
      get<{ deliveries: DriverDrop[] }>(`/driver/deliveries?scope=${scope}`),
    delivery:  (id: string) => get<{ delivery: DriverDrop }>(`/driver/deliveries/${id}`),
    enRoute:   (id: string) => post<{ status: string }>(`/driver/deliveries/${id}/en-route`),
    scan:      (token: string) => post<{ order_number: string }>("/driver/scan", { token }),
    failed:    (id: string, body: { reason: string; note?: string; outcome: "reschedule" | "return" }) =>
      post<{ status: string }>(`/driver/deliveries/${id}/failed`, body),
  },

  admin: {
    stock:       () => get<{ stock: GasStock }>("/admin/stock"),
    addStock:    (body: {
                   move: string;
                   amount_kg: number;
                   note?: string;
                   /** Delivery-note photograph, uploaded beforehand. */
                   photo_asset?: string;
                 }) =>
      post<{ entry_id: string }>("/admin/stock/entries", body),
    stockHistory: (month?: string) =>
      get<{ entries: StockEntry[] }>(`/admin/stock/entries${month ? `?month=${month}` : ""}`),
    setRate:     (rate_kobo_per_kg: number) => patch<{ rate_kobo_per_kg: number }>("/admin/rate", { rate_kobo_per_kg }),

    products:    () => get<{ products: Product[] }>("/admin/products"),
    createProduct: (body: ProductDraft) => post<{ product: Product }>("/admin/products", body),
    updateProduct: (id: string, body: ProductPatch) =>
      patch<{ product: Product }>(`/admin/products/${id}`, body),

    checkBundle: (product_ids: string[]) =>
      post<{ compatible: boolean; violations: { message: string }[] }>(
        "/admin/bundles/check", { product_ids }),

    orders:      (status?: string) =>
      get<{ orders: OrderSummary[] }>(`/admin/orders${status ? `?status=${status}` : ""}`),
    flagged:     () => get<{ flagged: FlaggedQueue }>("/admin/flagged"),

    refunds:     () => get<{ refunds: Refund[] }>("/admin/refunds"),
    processRefund: (id: string) =>
      post<{ status: string; already?: boolean }>(`/admin/refunds/${id}/process`),
    settleRefundManually: (id: string, note: string) =>
      post<{ status: string }>(`/admin/refunds/${id}/manual`, { note }),
    cancelOrder: (id: string, reason: string) =>
      post<{ reservations_released: number }>(`/admin/orders/${id}/cancel`, { reason }),
    assign:      (id: string, driver_id: string) =>
      post<{ delivery: Delivery }>(`/admin/orders/${id}/assign`, { driver_id }),

    zones:       () => get<{ zones: Zone[] }>("/admin/zones"),
    createZone:  (body: { name: string; fee_kobo: number; coverage_note?: string }) =>
      post<{ zone: Zone }>("/admin/zones", body),
    updateZone:  (id: string, body: Partial<Pick<Zone, "name" | "fee_kobo" | "active">>) =>
      patch<{ zone: Zone }>(`/admin/zones/${id}`, body),

    staff:       () => get<{ staff: StaffMember[] }>("/admin/staff"),
    drivers:     () => get<{ drivers: DriverProfile[] }>("/admin/drivers"),
    settings:    () => get<{ settings: { key: string; value: unknown; updated_at: string }[] }>("/admin/settings"),
    setSetting:  (key: string, value: unknown) =>
      patch<{ ok: true }>(`/admin/settings/${key}`, { value }),
    audit:       (entity_type?: string) =>
      get<{ entries: AuditEntry[] }>(`/admin/audit${entity_type ? `?entity_type=${entity_type}` : ""}`),
    report:      (days = 30) => get<ReportSummary>(`/admin/reports/summary?days=${days}`),
  },

  uploads: {
    image: (file: Blob, owner_type: "product" | "bundle" | "stock_entry") => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("owner_type", owner_type);
      return request<{ asset_id: string; base_path: string; urls: Record<string, string> }>(
        "/uploads/image", { method: "POST", body: fd });
    },
    /**
     * The person's own picture. Separate from `image` because it needs no
     * role — anyone signed in may change their own — and because the Worker
     * writes profile.avatar_asset itself rather than trusting the client to.
     */
    avatar: (file: Blob) => {
      const fd = new FormData();
      fd.append("file", file);
      return request<{ asset_id: string; url: string }>(
        "/uploads/avatar", { method: "POST", body: fd });
    },

    bundle: (form: FormData) =>
      request<{ bundle: Bundle & { bundle_id: string }; products_created: number }>(
        "/uploads/bundle", { method: "POST", body: form }),
  },
};
