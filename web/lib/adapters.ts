import type {
  Product as ApiProduct,
  ShopItem,
  Order,
  OrderSummary,
  Notification as ApiNotification,
  GasStock as ApiGasStock,
  StockEntry,
  StaffMember,
  DriverProfile,
  DriverDrop,
  AdminOrder,
  AdminDriver,
  AdminStaff,
  SavedAddress,
  Refund,
  ReportSummary,
} from "./types";
import { mediaUrl, productFallback } from "./media";
import { koboToNaira } from "@/helpers/functions";

/* ---------------------------------------------------------------------------
   Adapters.

   The screens were drawn against a view model of their own (`image`,
   `priceNaira`, `title`); the Worker speaks the database's vocabulary
   (`image_path`, `price_kobo`, `name`). Rather than rewrite every component's
   props — and every one of its layout numbers — the conversion happens once,
   here. A backend field rename then breaks one file, not thirty.
   --------------------------------------------------------------------------- */

export interface ViewProduct {
  product_id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  price_kobo: number;
  priceNaira: number;
  stock_qty: number;
  reserved_qty: number;
  available: number;
  active: boolean;
  unavailable: boolean;
  image: string;
  product_category?: { slug: string; name: string } | null;
}

export function toViewProduct(p: ApiProduct | ShopItem): ViewProduct {
  const image =
    "image_path" in p
      ? mediaUrl(p.image_path) ?? productFallback(p.name)
      : mediaUrl((p as ApiProduct).image_asset) ?? productFallback(p.name);
  const price_kobo = p.price_kobo ?? 0;
  const available = p.available ?? 0;
  // A shop row is identified by `id`; a product by `product_id`. A bundle row
  // reaching here keeps its own id, which is what the cart keys on.
  const id = "product_id" in p ? p.product_id : p.id;
  return {
    product_id: id,
    name: p.name,
    subtitle: p.subtitle ?? null,
    description: "description" in p ? (p.description ?? null) : null,
    price_kobo,
    priceNaira: koboToNaira(price_kobo),
    stock_qty: "stock_qty" in p ? (p.stock_qty ?? 0) : 0,
    reserved_qty: "reserved_qty" in p ? (p.reserved_qty ?? 0) : 0,
    available,
    active: "active" in p ? (p.active ?? true) : true,
    unavailable: available <= 0,
    image,
    product_category:
      "product_category" in p ? (p.product_category ?? null) : null,
  };
}

export type ViewNotification = ApiNotification;

export function toViewReceiptItem(
  item: {
    name?: string | null;
    subtitle?: string | null;
    image_asset?: { base_path: string } | null;
    quantity?: number;
    amountNaira?: number;
  },
) {
  return {
    id: item.name ?? "item",
    title: item.name ?? "U2 Accessory",
    subtitle: item.subtitle ?? undefined,
    image: mediaUrl(item.image_asset as never) ?? productFallback(item.name),
    priceNaira: item.amountNaira ?? 0,
    quantity: item.quantity ?? 1,
  };
}

/* --- Orders ---------------------------------------------------------------- */

export interface ViewOrderSummary {
  id: string;
  orderNumber: string;
  title: string;
  customerName: string;
  customerPhone: string | null;
  status: string;
  paymentStatus: string;
  fulfillment: string;
  totalNaira: number;
  kg: number;
  date: Date;
}

function orderOwner(o: {
  guest_name?: string | null;
  profile?: { display_name: string | null } | null;
}): string {
  return o.profile?.display_name || o.guest_name || "WALK-IN";
}

export function toViewOrderSummary(
  o: OrderSummary | AdminOrder,
): ViewOrderSummary {
  const kg = o.gas_amount_kg ?? 0;
  return {
    id: o.order_id,
    orderNumber: o.order_number,
    title: kg > 0 ? `${kg}kg Cooking Gas` : "Accessory Order",
    customerName: orderOwner(o),
    customerPhone: o.guest_phone ?? null,
    status: o.status,
    paymentStatus: o.payment_status,
    fulfillment: o.fulfillment_type ?? "pickup",
    totalNaira: koboToNaira(o.total_kobo ?? 0),
    kg,
    date: new Date(o.created_at),
  };
}

/* --- Admin ---------------------------------------------------------------- */

export interface ViewAdminStaff {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  bankName: string;
  accountNumber: string;
  avatarUrl: string;
  status: string;
  live?: boolean;
}

/** The database's `staff` role is the design's CASHIER. */
export const ROLE_LABEL: Record<string, string> = {
  staff: "CASHIER",
  admin: "ADMIN",
  driver: "DRIVER",
  customer: "CUSTOMER",
};

export function toViewAdminStaff(s: StaffMember): ViewAdminStaff {
  const display = s.profile?.display_name ?? "";
  const [first = "", ...rest] = display.split(" ");
  const role = s.profile?.role ?? "staff";
  return {
    id: s.staff_id,
    firstName: first.toUpperCase() || "—",
    lastName: rest.join(" ").toUpperCase(),
    role: ROLE_LABEL[role] ?? role.toUpperCase(),
    email: s.profile?.email ?? "",
    bankName: s.bank_name ?? "",
    accountNumber: s.account_number ?? "",
    avatarUrl: mediaUrl(s.profile?.avatar_asset) ?? "/images/staff-avatar-3.png",
    status: s.status,
  };
}

export interface ViewDriver {
  id: string;
  name: string;
  phone: string;
  status: DriverProfile["status"];
  vehicle: string;
  completed: number;
  avatarUrl: string;
}

export function toViewDriver(d: AdminDriver | DriverProfile): ViewDriver {
  const name = d.profile?.display_name ?? "DRIVER";
  return {
    id: d.driver_id,
    name: name.toUpperCase(),
    phone: d.phone ?? "",
    status: d.status,
    vehicle: d.vehicle_info ?? "",
    completed: d.completed_deliveries ?? 0,
    avatarUrl:
      mediaUrl(d.profile?.avatar_asset) ?? "/images/staff-avatar-3.png",
  };
}

export interface ViewDelivery {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  address: string;
  status: string;
  failureReason: string | null;
  kg: number;
  etaMinutes: number | null;
  date: Date;
}

export function toViewDelivery(d: DriverDrop): ViewDelivery {
  return {
    id: d.delivery_id,
    orderNumber: d.order?.order_number ?? "",
    customerName: orderOwner(d.order ?? {}),
    customerPhone: d.order?.guest_phone ?? null,
    address: d.delivery_address,
    status: d.status,
    failureReason: d.failure_reason,
    kg: d.order?.gas_amount_kg ?? 0,
    etaMinutes: d.eta_minutes ?? null,
    date: new Date(d.assigned_at ?? d.order?.created_at ?? Date.now()),
  };
}

export interface ViewStockEntry {
  id: string;
  title: string;
  amountKg: number;
  move: StockEntry["move"];
  operator: string;
  date: Date;
  month: string;
}

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

export function monthName(date: Date): string {
  return MONTHS[date.getUTCMonth()] ?? "";
}

export function toViewStockEntry(e: StockEntry): ViewStockEntry {
  const date = new Date(e.entry_date);
  return {
    id: e.entry_id,
    title: `${e.amount_kg}KG ${e.move === "addition" ? "ADDED" : e.move === "removal" ? "REMOVED" : "CORRECTED"}`,
    amountKg: e.amount_kg,
    move: e.move,
    operator: e.admin?.display_name ?? "—",
    date,
    month: monthName(date),
  };
}

/* --- Payments / refunds ---------------------------------------------------- */

/** The Worker's method vocabulary mapped to the words on the receipt. */
export const PAYMENT_MEDIUM: Record<string, string> = {
  cash: "CASH",
  card_terminal: "POS",
  bank_transfer: "TRANS",
  opay: "TRANS",
  monnify: "TRANS",
};

export function toViewRefund(r: Refund) {
  return {
    id: r.refund_id,
    amountNaira: koboToNaira(r.amount_kobo),
    status: r.status,
    reason: r.reason,
    orderNumber: r.order?.order_number ?? "",
    customerName: r.order?.profile?.display_name ?? r.order?.guest_phone ?? "—",
    lastError: r.last_error,
    attempts: r.attempts,
    date: new Date(r.created_at),
  };
}

/* --- Reports --------------------------------------------------------------- */

export interface ViewReport extends ReportSummary {
  revenueNaira: number;
}

export function toViewReport(r: ReportSummary): ViewReport {
  return { ...r, revenueNaira: koboToNaira(r.revenue_kobo) };
}

/* --- Home ------------------------------------------------------------------ */

export interface HomeView {
  rateNaira: number;
  rateKobo: number;
  ticker: string;
  availableKg: number;
  unread: number;
  signedIn: boolean;
}

export function toHomeView(h: {
  rate_kobo_per_kg: number;
  ticker: string;
  available_kg: number;
  unread_notifications: number;
  signed_in: boolean;
}): HomeView {
  return {
    rateKobo: h.rate_kobo_per_kg,
    rateNaira: koboToNaira(h.rate_kobo_per_kg),
    ticker: h.ticker,
    availableKg: h.available_kg,
    unread: h.unread_notifications,
    signedIn: h.signed_in,
  };
}

export function toStockView(s: ApiGasStock) {
  return {
    ...s,
    availableTons: Number((s.available_kg / 1000).toFixed(1)),
    rateNaira: koboToNaira(s.rate_kobo_per_kg),
  };
}

export type { SavedAddress };
