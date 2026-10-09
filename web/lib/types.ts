/* --- Types ----------------------------------------------------------------
   These mirror what the Worker actually returns. Keeping them honest is the
   point: a wrong field name here should be a compile error, not a blank space
   on a receipt at the depot counter.
   -------------------------------------------------------------------------- */

export type Role = "customer" | "staff" | "driver" | "admin";

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
  product: {
    name: string;
    subtitle?: string | null;
    image_asset?: ImageRef | null;
  } | null;
}

export type DeliveryStatus =
  | "assigned"
  | "en_route"
  | "delivered"
  | "failed"
  | "rescheduled"
  | "returned";

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
  driver?: {
    phone: string;
    profile: { display_name: string | null } | null;
  } | null;
}

export interface Order {
  order_id: string;
  order_number: string;
  order_type: "gas" | "accessory" | "mixed";
  status:
    | "pending"
    | "confirmed"
    | "processing"
    | "fulfilled"
    | "cancelled"
    | "expired";
  payment_status:
    | "pending"
    | "paid"
    | "failed"
    | "refunded"
    | "partially_refunded";
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
  payments?: {
    method: string;
    status: string;
    amount_kobo: number;
    paid_at: string | null;
  }[];
  delivery?: Delivery | null;
  // Who the order is for. A signed-in order carries `profile`; a walk-in or
  // guest order carries `guest_name`/`guest_phone`. Staff screens read both.
  guest_name?: string | null;
  guest_phone?: string | null;
  profile?: { display_name: string | null; phone: string | null } | null;
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
  role: Role;
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
  burn_kg_per_day?: number;
  burn_basis_days?: number;
  burn_sample_kg?: number;
  /** 0 none, 1 running low, 2 low, 3 almost empty. */
  low_gas_level?: 0 | 1 | 2 | 3;
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
  orders_by_type?: { gas: number; accessory: number; mixed: number };
  revenue_by_day?: { date: string; revenue_kobo: number; orders: number }[];
  previous?: {
    orders_total: number;
    orders_fulfilled: number;
    gas_sold_kg: number;
    revenue_kobo: number;
  };
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
    order_id: string;
    order_number: string;
    guest_phone: string | null;
    profile: { display_name: string | null } | null;
  } | null;
}

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
  guest_name?: string | null;
  guest_phone?: string | null;
  profile?: { display_name: string | null; phone?: string | null } | null;
  payment?: {
    method: string;
    amount_kobo: number;
    status: string;
    paid_at: string | null;
  }[] | null;
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
  vehicle_info?: string | null;
  completed_deliveries?: number;
  profile?: { display_name: string | null; avatar_asset?: ImageRef | null } | null;
}

export interface StaffSale {
  payment_id: string;
  method: string;
  amount_kobo: number;
  status: string;
  paid_at: string | null;
  order?: {
    order_number: string;
    total_kobo: number;
    gas_amount_kg: number | null;
  } | null;
}

export interface StaffDelivery {
  delivery_id: string;
  status: string;
  delivery_address: string;
  assigned_at: string;
  delivered_at: string | null;
  failure_reason: string | null;
  order?: { order_number: string; total_kobo: number } | null;
}

/** `/admin/staff/:id/history` — a cashier's sales or a driver's drops. */
export interface StaffActivity {
  ok: true;
  role: "staff" | "driver" | "admin";
  sales?: StaffSale[];
  deliveries?: StaffDelivery[];
}

export interface AdminStaff {
  staff_id: string;
  status: string;
  role?: string;
  bank_name?: string | null;
  account_number?: string | null;
  hired_at?: string;
  profile?: {
    display_name: string | null;
    email?: string | null;
    role?: string;
    phone?: string | null;
    avatar_asset?: ImageRef | null;
  } | null;
}

export interface AdminProduct {
  product_id: string;
  name: string;
  subtitle?: string | null;
  price_kobo: number;
  stock_qty: number;
  reserved_qty: number;
  available: number;
  active: boolean;
  category_id?: string | null;
  product_category?: { slug: string; name: string } | null;
  image_asset?: { base_path: string } | null;
}

export interface AdminZone {
  zone_id: string;
  name: string;
  fee_kobo: number;
  active: boolean;
  coverage_note?: string | null;
  description?: string | null;
}

export interface FlaggedRefund {
  audit_id: number;
  entity_id: string;
  created_at: string;
  note?: string | null;
  after?: { amount_kobo?: number; payment_id?: string } | null;
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
  stale_unpaid: {
    order_id: string;
    order_number: string;
    total_kobo: number;
    created_at: string;
  }[];
  total: number;
}

export interface WalkInBody {
  kg: number;
  lines: {
    kind: "product" | "bundle";
    product_id?: string;
    bundle_id?: string;
    quantity: number;
  }[];
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
