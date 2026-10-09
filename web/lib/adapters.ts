import type {
  Product as ApiProduct,
  ShopItem,
  StockEntry,
  StaffMember,
  AdminOrder,
  SavedAddress,
} from "./types";
import { mediaUrl, productFallback } from "./media";
import { koboToNaira } from "@/helpers/functions";
import type { StaffActivity } from "@/lib/types";
import type {
  AdminSalesHistoryItem,
  TimeFilter,
  StaffDriverRecord,
  StaffCashierRecord,
} from "@/types/types";

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
  /** Whether the row is a product or a bundle. The cart checkout needs this to
   *  send the right id field: a bundle's id belongs in `bundle_id`, not
   *  `product_id`. */
  kind: "product" | "bundle";
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
  const kind = "kind" in p ? p.kind : "product";
  return {
    product_id: id,
    kind,
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
  /** A drawn grid slot with no person behind it keeps the file's black plate. */
  isBlackPlaceholder?: boolean;
}

/** The database's `staff` role is the design's CASHIER. */
const ROLE_LABEL: Record<string, string> = {
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

export interface ViewStockEntry {
  id: string;
  title: string;
  amountKg: number;
  move: StockEntry["move"];
  operator: string;
  date: Date;
  month: string;
  /** The day, ordinal — "23rd". The history card leads with it. */
  day: string;
}

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

export function monthName(date: Date): string {
  return MONTHS[date.getUTCMonth()] ?? "";
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
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
    day: ordinal(date.getUTCDate()),
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

/**
 * LPG at ~0.51 kg/L, so a kilogram is ~1.96 litres. The till records kilograms
 * (the order stores `gas_amount_kg`); the sales drawing is labelled in litres.
 * This is the one place the two units meet.
 */
const LPG_LITERS_PER_KG = 1.96;

function naira(kobo: number): string {
  return Math.round(kobo / 100).toLocaleString("en-US");
}

function toSalesItem(o: AdminOrder): AdminSalesHistoryItem {
  const kg = Number(o.gas_amount_kg ?? 0);
  const method = PAYMENT_MEDIUM[o.payment?.[0]?.method ?? ""] ?? "CASH";
  return {
    id: o.order_id,
    title: `₦${naira(o.total_kobo)} ~ ${kg}kg`,
    date: new Date(o.created_at),
    paymentMethod: method === "POS" ? "POS" : method === "TRANS" ? "TRANS" : "CASH",
  };
}

/** The period buckets the sales-history tabs name, resolved against today. */
function salesPeriodOrders(
  orders: AdminOrder[],
  period: TimeFilter,
): AdminOrder[] {
  const now = new Date();
  return orders.filter((o) => {
    const d = new Date(o.created_at);
    if (period === "TODAY") return d.toDateString() === now.toDateString();
    if (period === "THIS MONTH")
      return (
        d.getUTCFullYear() === now.getUTCFullYear() &&
        d.getUTCMonth() === now.getUTCMonth()
      );
    // MAY / JUNE name a month in the current year.
    return d.getUTCFullYear() === now.getUTCFullYear() && monthName(d) === period;
  });
}

export function salesHistoryFor(orders: AdminOrder[], period: TimeFilter) {
  const inPeriod = salesPeriodOrders(orders, period);
  const liters = inPeriod.reduce(
    (sum, o) => sum + Number(o.gas_amount_kg ?? 0) * LPG_LITERS_PER_KG,
    0,
  );
  return {
    // The drawing separates thousands with a dot: 10.345 L.
    totalLiters: Math.round(liters).toLocaleString("de-DE"),
    items: inPeriod.map(toSalesItem),
  };
}

/** A driver's STAFF HISTORY rows — one per drop, with the order as the title. */
export function toStaffDriverRecords(a: StaffActivity): StaffDriverRecord[] {
  return (a.deliveries ?? []).map((d) => ({
    id: d.delivery_id,
    title: d.order?.order_number ?? d.delivery_address,
    date: new Date(d.delivered_at ?? d.assigned_at),
  }));
}

/** A cashier's STAFF HISTORY rows — one per sale, with the method badge. */
export function toStaffCashierRecords(a: StaffActivity): StaffCashierRecord[] {
  return (a.sales ?? []).map((s) => {
    const method = PAYMENT_MEDIUM[s.method] ?? "CASH";
    return {
      id: s.payment_id,
      title: s.order?.order_number ?? `₦${naira(s.amount_kobo)}`,
      date: new Date(s.paid_at ?? Date.now()),
      paymentMethod:
        method === "POS" ? "POS" : method === "TRANS" ? "TRANS" : "CASH",
    };
  });
}

/**
 * Keep only the staff-history rows that fall in the chosen period. The staff
 * screen's TIME FILTER chips (TODAY / THIS MONTH / MAY / JUNE) are the same
 * buckets the sales screen uses, so the same calendar rules apply; without
 * this the chip changed colour but the list never moved.
 */
export function filterStaffRecordsByPeriod<
  T extends { date: Date },
>(records: T[], period: TimeFilter): T[] {
  const now = new Date();
  return records.filter((r) => {
    const d = new Date(r.date);
    if (period === "TODAY") return d.toDateString() === now.toDateString();
    if (period === "THIS MONTH")
      return (
        d.getUTCFullYear() === now.getUTCFullYear() &&
        d.getUTCMonth() === now.getUTCMonth()
      );
    return d.getUTCFullYear() === now.getUTCFullYear() && monthName(d) === period;
  });
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

export type { SavedAddress };
