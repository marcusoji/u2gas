import { API_BASE } from "./env";
import { getAccessToken } from "./supabase";

/* ---------------------------------------------------------------------------
   API client.

   Every failed response carries the machine code, the copy the interface
   shows, and the numbers the screen needs to render its state. Screens read
   `message` and `detail`; they never build error copy themselves.
   --------------------------------------------------------------------------- */

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

async function request<T>(
  path: string,
  init: RequestInit = {},
  retries = 1,
): Promise<T> {
  let res: Response;
  const token = await getAccessToken();

  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    // The network itself failed. Distinct from a server error, and the
    // interface says so — the ticker goes dark rather than showing a 500.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("u2gas:offline"));
    }
    throw new ApiError("OFFLINE", 0, "NO SIGNAL");
  }

  // Any answer at all means we are back.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("u2gas:online"));
  }

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
    // is how one tap becomes two orders.
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

const get = <T>(p: string) => request<T>(p);
const post = <T>(p: string, body?: unknown, idempotencyKey?: string) =>
  request<T>(p, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });

/** Stable per attempt, so a retry of the same submission replays rather than
 *  creating a second order. */
export const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now()}${Math.random().toString(16).slice(2)}`;

const patch = <T>(p: string, body: unknown) =>
  request<T>(p, { method: "PATCH", body: JSON.stringify(body) });
const del = <T>(p: string) => request<T>(p, { method: "DELETE" });

export * from "./types";

/* --- Endpoints ------------------------------------------------------------ */

export const api = {
  home: () => get<{ ok: true } & import("./types").HomePayload>("/catalog/home"),
  shop: (q?: { category?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (q?.category) params.set("category", q.category);
    if (q?.q) params.set("q", q.q);
    const qs = params.toString();
    return get<{ items: import("./types").ShopItem[] }>(
      `/catalog/shop${qs ? `?${qs}` : ""}`,
    );
  },
  product: (id: string) =>
    get<{ product: import("./types").Product }>(`/catalog/products/${id}`),
  bundle: (id: string) =>
    get<{ bundle: import("./types").Bundle }>(`/catalog/bundles/${id}`),
  zones: () => get<{ zones: import("./types").Zone[] }>("/catalog/zones"),

  /** Bundles that complete what the customer already has. */
  completeTheSet: (productIds: string[]) => {
    const p = new URLSearchParams();
    productIds.forEach((id) => p.append("in", id));
    return get<{ bundles: import("./types").BundleOffer[] }>(
      `/catalog/complete-the-set?${p}`,
    );
  },

  me: () =>
    get<{ profile: import("./types").Profile; home: string }>("/me"),

  /** Update the fields a person owns. Role is never writable here. */
  updateMe: (body: {
    first_name?: string;
    last_name?: string;
    phone?: string;
  }) =>
    patch<{ ok: true; profile: Partial<import("./types").Profile> }>("/me", body),

  addresses: {
    list: () =>
      get<{ addresses: import("./types").SavedAddress[] }>("/me/addresses"),
    create: (body: {
      label: string;
      line: string;
      zone_id?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      is_default?: boolean;
    }) => post<{ address: import("./types").SavedAddress }>("/me/addresses", body),
    update: (
      id: string,
      body: Partial<{
        label: string;
        line: string;
        zone_id: string | null;
        is_default: boolean;
      }>,
    ) => patch<{ ok: true }>(`/me/addresses/${id}`, body),
    remove: (id: string) =>
      request<{ ok: true }>(`/me/addresses/${id}`, { method: "DELETE" }),
  },

  notifications: () =>
    get<{ notifications: import("./types").Notification[] }>("/notifications"),

  availability: (kg: number) =>
    get<{
      available_kg: number;
      sufficient: boolean;
      subtotal_kobo: number;
    }>(`/orders/availability?kg=${kg}`),

  createGasOrder: (
    body: {
      kg: number;
      fulfillment: "pickup" | "delivery";
      zone_id?: string;
      address?: string;
      guest_name?: string;
      guest_phone?: string;
    },
    idempotencyKey?: string,
  ) =>
    post<{ order: import("./types").Order; guest_token?: string }>(
      "/orders/gas",
      body,
      idempotencyKey,
    ),

  createCartOrder: (
    body: {
      lines: {
        kind: "product" | "bundle";
        product_id?: string;
        bundle_id?: string;
        quantity: number;
      }[];
      gas_kg?: number;
      fulfillment: "pickup" | "delivery";
      zone_id?: string;
      address?: string;
      guest_name?: string;
      guest_phone?: string;
    },
    idempotencyKey?: string,
  ) =>
    post<{ order: import("./types").Order; guest_token?: string }>(
      "/orders/cart",
      body,
      idempotencyKey,
    ),

  orders: () => get<{ orders: import("./types").Order[] }>("/orders"),

  // A guest has no session, so every read carries the capability token they
  // were handed at checkout.
  order: (id: string, t?: string) =>
    get<{ order: import("./types").Order }>(
      `/orders/${id}${t ? `?t=${encodeURIComponent(t)}` : ""}`,
    ),
  cancelOrder: (id: string, t?: string) =>
    post<{
      reservations_released: number;
      refund: { refund_id: string; status: string } | null;
    }>(`/orders/${id}/cancel${t ? `?t=${encodeURIComponent(t)}` : ""}`),

  issueQr: (id: string, t?: string, force = false) => {
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

  payInit: (order_id: string, t?: string) =>
    post<{ authorization_url: string; reference: string; already_paid?: boolean }>(
      `/payments/initialize${t ? `?t=${encodeURIComponent(t)}` : ""}`,
      { order_id },
    ),
  payVerify: (reference: string, order_id: string, t?: string) =>
    post<{
      paid: boolean;
      order_id?: string;
      payment_id?: string;
      already_processed?: boolean;
      orphaned?: boolean;
      refund_required?: boolean;
    }>(
      `/payments/verify${t ? `?t=${encodeURIComponent(t)}` : ""}`,
      { reference, order_id },
    ),

  staff: {
    queue: (kind: "paid" | "unpaid") =>
      get<{ orders: import("./types").OrderSummary[] }>(
        `/staff/queue?kind=${kind}`,
      ),
    lookup: (q: string) =>
      get<{ results: import("./types").OrderSummary[] }>(
        `/staff/lookup?q=${encodeURIComponent(q)}`,
      ),
    walkIn: (body: import("./types").WalkInBody, idempotencyKey?: string) =>
      post<{ order: import("./types").Order }>(
        "/staff/walk-in",
        body,
        idempotencyKey,
      ),
    recordPayment: (
      body: {
        order_id: string;
        method: "cash" | "card_terminal" | "bank_transfer" | "opay";
        tendered_kobo?: number;
        terminal_reference?: string;
      },
      idempotencyKey?: string,
    ) =>
      post<{
        change_due_kobo: number | null;
        order_number: string;
        orphaned?: boolean;
        refund_required?: boolean;
        message?: string;
      }>("/staff/payments", body, idempotencyKey),
    scan: (token: string) => post<{ order_number: string }>("/staff/scan", { token }),
    reconciliation: (date?: string) =>
      get<import("./types").Reconciliation>(
        `/staff/reconciliation${date ? `?date=${date}` : ""}`,
      ),
    closeShift: (
      body: { shift_date: string; counted_kobo: number; note?: string },
      idempotencyKey?: string,
    ) =>
      post<{
        ok: true;
        reconciliation?: import("./types").Reconciliation;
        already_closed?: boolean;
      }>("/staff/reconciliation", body, idempotencyKey),
  },

  driver: {
    me: () =>
      get<{ driver: import("./types").DriverProfile }>("/driver/me"),
    setStatus: (status: "available" | "busy" | "offline") =>
      patch<{ status: string }>("/driver/availability", { status }),
    deliveries: (scope: "active" | "completed" | "all" = "active") =>
      get<{ deliveries: import("./types").DriverDrop[] }>(
        `/driver/deliveries?scope=${scope}`,
      ),
    delivery: (id: string) =>
      get<{ delivery: import("./types").DriverDrop }>(`/driver/deliveries/${id}`),
    enRoute: (id: string) =>
      post<{ status: string }>(`/driver/deliveries/${id}/en-route`),
    scan: (token: string) => post<{ order_number: string }>("/driver/scan", { token }),
    failed: (
      id: string,
      body: { reason: string; note?: string; outcome: "reschedule" | "return" },
    ) => post<{ status: string }>(`/driver/deliveries/${id}/failed`, body),
  },

  admin: {
    stock: () => get<{ stock: import("./types").GasStock }>("/admin/stock"),
    addStock: (body: {
      move: string;
      amount_kg: number;
      note?: string;
      photo_asset?: string;
    }) => post<{ entry_id: string }>("/admin/stock/entries", body),
    stockHistory: (month?: string) =>
      get<{ entries: import("./types").StockEntry[] }>(
        `/admin/stock/entries${month ? `?month=${month}` : ""}`,
      ),
    setRate: (rate_kobo_per_kg: number) =>
      patch<{ rate_kobo_per_kg: number }>("/admin/rate", { rate_kobo_per_kg }),

    products: () =>
      get<{ products: import("./types").AdminProduct[] }>("/admin/products"),
    createProduct: (body: import("./types").ProductDraft) =>
      post<{ product: import("./types").AdminProduct }>("/admin/products", body),
    updateProduct: (id: string, body: import("./types").ProductPatch) =>
      patch<{ product: import("./types").AdminProduct }>(
        `/admin/products/${id}`,
        body,
      ),

    checkBundle: (product_ids: string[]) =>
      post<{ compatible: boolean; violations: { message: string }[] }>(
        "/admin/bundles/check",
        { product_ids },
      ),

    orders: (status?: string) =>
      get<{ orders: import("./types").AdminOrder[] }>(
        `/admin/orders${status ? `?status=${status}` : ""}`,
      ),
    flagged: () =>
      get<{ flagged: import("./types").FlaggedQueue }>("/admin/flagged"),

    refunds: () => get<{ refunds: import("./types").Refund[] }>("/admin/refunds"),
    processRefund: (id: string) =>
      post<{ status: string; already?: boolean }>(`/admin/refunds/${id}/process`),
    settleRefundManually: (id: string, note: string) =>
      post<{ status: string }>(`/admin/refunds/${id}/manual`, { note }),
    cancelOrder: (id: string, reason: string) =>
      post<{ reservations_released: number }>(`/admin/orders/${id}/cancel`, {
        reason,
      }),
    assign: (id: string, driver_id: string) =>
      post<{ delivery: import("./types").Delivery }>(
        `/admin/orders/${id}/assign`,
        { driver_id },
      ),

    zones: () => get<{ zones: import("./types").AdminZone[] }>("/admin/zones"),
    createZone: (body: {
      name: string;
      fee_kobo: number;
      coverage_note?: string;
    }) => post<{ zone: import("./types").AdminZone }>("/admin/zones", body),
    updateZone: (
      id: string,
      body: Partial<Pick<import("./types").AdminZone, "name" | "fee_kobo" | "active">>,
    ) => patch<{ zone: import("./types").AdminZone }>(`/admin/zones/${id}`, body),

    staff: () => get<{ staff: import("./types").StaffMember[] }>("/admin/staff"),
    addStaff: (body: {
      email: string;
      display_name: string;
      role: "staff" | "admin" | "driver";
      bank_name?: string;
      account_number?: string;
    }) => post<{ staff_id: string; created: boolean }>("/admin/staff", body),
    removeStaff: (staffId: string) =>
      del<{ staff_id: string; status: string }>(`/admin/staff/${staffId}`),

    drivers: () =>
      get<{ drivers: import("./types").DriverProfile[] }>("/admin/drivers"),
    settings: () =>
      get<{
        settings: { key: string; value: unknown; updated_at: string }[];
      }>("/admin/settings"),
    setSetting: (key: string, value: unknown) =>
      patch<{ ok: true }>(`/admin/settings/${key}`, { value }),
    audit: (entity_type?: string) =>
      get<{ entries: import("./types").AuditEntry[] }>(
        `/admin/audit${entity_type ? `?entity_type=${entity_type}` : ""}`,
      ),
    report: (days = 30) =>
      get<import("./types").ReportSummary>(
        `/admin/reports/summary?days=${days}`,
      ),
  },

  uploads: {
    image: (file: Blob, owner_type: "product" | "bundle" | "stock_entry") => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("owner_type", owner_type);
      return request<{
        asset_id: string;
        base_path: string;
        urls: Record<string, string>;
      }>("/uploads/image", { method: "POST", body: fd });
    },
    /** The person's own picture. Needs no role — anyone signed in may change
     *  their own — and the Worker writes profile.avatar_asset itself. */
    avatar: (file: Blob) => {
      const fd = new FormData();
      fd.append("file", file);
      return request<{ asset_id: string; url: string }>("/uploads/avatar", {
        method: "POST",
        body: fd,
      });
    },
    bundle: (form: FormData) =>
      request<{
        bundle: import("./types").Bundle & { bundle_id: string };
        products_created: number;
      }>("/uploads/bundle", { method: "POST", body: form }),
  },
};
