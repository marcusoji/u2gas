export type AppRole = "customer" | "staff" | "driver" | "admin";
export type OrderChannel = "online" | "walk_in";
export type OrderType = "gas" | "accessory" | "mixed";
export type FulfillmentType = "pickup" | "delivery";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "fulfilled"
  | "cancelled"
  | "expired";

export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "partially_refunded";

export type PaymentMethod =
  | "monnify"
  | "cash"
  | "card_terminal"
  | "bank_transfer"
  | "opay";

export type ReservationStatus =
  | "reserved"
  | "fulfilled"
  | "released"
  | "expired";

export type QrStatus = "unscanned" | "scanned" | "expired" | "void";

export type DeliveryStatus =
  | "assigned"
  | "en_route"
  | "delivered"
  | "failed"
  | "rescheduled"
  | "returned";

export type DriverStatus = "available" | "busy" | "offline";
export type StaffStatus = "active" | "suspended" | "removed";
export type StockMove = "addition" | "removal" | "correction";
export type ReservationKind = "gas" | "product";
export type ImageOwner = "product" | "profile" | "bundle" | "stock_entry";
export type CompatMatch = "equal" | "in_set" | "numeric_range";

export type RefundStatus =
  | "pending"
  | "processing"
  | "refunded"
  | "declined"
  | "manual";

export interface ImageRef {
  base_path: string;
  width?: number;
  height?: number;
}

export interface Profile {
  profile_id: string;
  role: AppRole;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  email_verified_at?: string | null;
  avatar_asset?: ImageRef | null;
}

export interface UserProfile {
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  avatar?: string;
}

export interface StaffMember {
  staff_id: string;
  status: StaffStatus;
  bank_name: string | null;
  account_number: string | null;
  hired_at?: string;
  profile: Profile | null;
}

export interface AdminStaffProfile {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  bankName: string;
  accountNumber: string;
  avatarUrl: string;
  isBlackPlaceholder?: boolean;
  isOnline?: boolean;
}

export interface DriverProfile {
  driver_id: string;
  status: DriverStatus;
  phone: string;
  vehicle_info: string | null;
  completed_deliveries: number;
  profile: {
    display_name: string | null;
    avatar_asset?: ImageRef | null;
  } | null;
}

export interface Product {
  product_id: string;
  name?: string;
  subtitle?: string | null;
  description?: string | null;
  price_kobo?: number;
  stock_qty?: number;
  reserved_qty?: number;
  available?: number;
  active?: boolean;
  product_category?: { slug: string; name: string } | null;
  image: string;
  bgColor?: string;
  priceNaira?: number;
  unavailable?: boolean;
  sizeScale?: number;
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

export interface CartItem {
  id: string;
  name: string;
  description: string;
  image: string;
  priceNaira: number;
  quantity: number;
  unavailable?: boolean;
}

export interface ReceiptItem {
  id: string;
  title: string;
  subtitle?: string;
  image: string;
  priceNaira: number;
  quantity?: number;
}

export interface ReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date?: string;
  items?: ReceiptItem[];
  orderId?: string;
  onScreenshot?: () => void;
  onKeep?: () => void;
}

export interface HistoryReceipt {
  id: string;
  orderNumber?: string;
  date: string;
  month: string;
  deliveryStatus?: string;
  progressStep?: number;
  progressLabel?: string;
  items: ReceiptItem[];
  qrCode?: string;
  customerName?: string;
  customerPhone?: string;
  statusOnline?: string;
  time?: string;
  reference?: string;
  subtotal?: number;
  deliveryFee?: number | string;
  total?: number;
  paymentMedium?: string;
  paymentMediumAmount?: number;
  entryFee?: number | string;
  entryType?: string;
}

export interface HistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipts?: HistoryReceipt[];
}

export interface Order {
  order_id: string;
  order_number: string;
  order_type: OrderType;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_type: FulfillmentType;
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
  guest_name?: string | null;
  guest_phone?: string | null;
  profile?: { display_name: string | null; phone: string | null } | null;
}

export interface OrderSummary {
  order_id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_type?: FulfillmentType;
  total_kobo: number;
  gas_amount_kg?: number;
  guest_name: string | null;
  guest_phone: string | null;
  created_at: string;
  hold_expires_at?: string | null;
  profile?: { display_name: string | null; phone: string | null } | null;
}

export interface Delivery {
  delivery_id?: string;
  status: DeliveryStatus;
  delivery_address: string;
  failure_reason: string | null;
  attempt_count?: number;
  assigned_at?: string;
  en_route_at: string | null;
  delivered_at: string | null;
  eta_minutes?: number | null;
  zone?: { name: string; fee_kobo: number } | null;
  driver?: {
    phone: string;
    profile: { display_name: string | null } | null;
  } | null;
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
  low_gas_level?: 0 | 1 | 2 | 3;
  updated_at: string;
}

export interface StockEntry {
  entry_id: string;
  move: StockMove;
  amount_kg: number;
  note: string | null;
  entry_date: string;
  admin?: { display_name: string | null } | null;
}

export interface SavedAddress {
  address_id: string;
  label: string;
  line: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: string;
  zone: {
    zone_id: string;
    name: string;
    fee_kobo: number;
    active: boolean;
  } | null;
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

export interface Refund {
  refund_id: string;
  amount_kobo: number;
  currency: string;
  status: RefundStatus;
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

export type FlaggedRefund = Refund;

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

export interface GasOrderDraft {
  gas_amount_kg: number;
  gas_subtotal_kobo: number;
  rate_at_purchase: number;
  total_naira: number;
  display_value: string;
}

export type GasOrder = GasOrderDraft;

export interface GasTerminalProps {
  initialValue?: string;
  ratePerKg?: number;
  stock?: GasStock;
  notifications?: Notification[];
  notificationCount?: number;
  onNotificationClick?: () => void;
  onProfileClick?: () => void;
  onPay?: (orderDraft: GasOrderDraft) => void | Promise<void>;
  onChange?: (value: string) => void;
  className?: string;
  status?: "idle" | "processing" | "success" | "failed";
  onDismissStatus?: () => void;
  children?: React.ReactNode;
}

export interface TerminalKeyProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export interface TerminalKeyboardProps {
  onKeyPress: (key: string) => void;
  disabled?: boolean;
  className?: string;
}

export interface TankHistoryRecord {
  id: string;
  timestamp: string;
  level: number;
  type: "REFILL" | "DISPENSE" | "AUDIT" | "MANUAL_UPDATE";
  volumeLiters: number;
  operator: string;
}

export interface SalesHistoryItem {
  id: string;
  type: "LPG" | "PMS" | "AGO";
  method: "POS" | "CASH" | "TRANSFER";
  amount?: number;
  liters?: number;
  timestamp?: string;
}

export interface GasHistoryRecord {
  id: string;
  dayLabel: string;
  amountTons: number;
  actionType: "ADDITION" | "REMOVAL";
  operatorName: string;
  month: string;
  qrCode?: string;
  dateStr?: string;
}

export type TimeFilter = "TODAY" | "THIS MONTH" | "MAY" | "JUNE";
export type DriverStatusTab = "COMPLETE" | "UNFULFILLED" | "CANCELLED";
export type CashierStatusTab = "IN—PERSON" | "ONLINE";

export interface AdminSalesHistoryItem {
  id: string;
  title: string;
  date: Date;
  paymentMethod: "POS" | "TRANS" | "CASH";
}

export interface StaffDriverRecord {
  id: string;
  title: string;
  date: Date;
}

export interface StaffCashierRecord {
  id: string;
  title: string;
  date: Date;
  paymentMethod: "POS" | "TRANS" | "CASH";
}

export type DriverDeliveryStatusTab = "COMPLETED" | "UNFULFILLED" | "CANCELLED";

export interface DriverDeliveryOrder {
  id: string;
  title: string;
  date: Date;
  customerName: string;
  address?: string;
  mapImage?: string;
  status: DriverDeliveryStatusTab;
}

export type CashierPaymentFilter = "ALL" | "CASH" | "POS" | "TRANSFER";

export interface CashierTransactionItem {
  id: string;
  title: string;
  date: Date;
  paymentMethod: "POS" | "TRANS" | "CASH" | "TRANSFER";
  mode: CashierStatusTab;
}



