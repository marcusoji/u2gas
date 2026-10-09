# U2GAS — Backend models and API contract

The Worker's real surface: every type it returns, every endpoint, every enum and
the rules that connect them. Written for whoever is wiring screens to data.

The types here are the ones in `web/lib/api.ts`, which mirror what the
Worker returns. Keep them honest — a wrong field name should be a compile error,
not a blank space on a receipt at the depot counter.

---

## 1. Conventions

### Money

**Every amount is an integer in kobo** (1/100 naira). No floats, anywhere.
`price_kobo`, `total_kobo`, `fee_kobo`, `amount_kobo`, `rate_kobo_per_kg`.
Format for display only, at the edge.

### Gas quantity

Kilograms, `numeric(12,3)` — three decimal places. `gas_amount_kg`,
`available_kg`, `amount_kg`.

### Response envelope

Success returns the payload directly (no wrapper). Failure returns:

```json
{ "error": { "code": "INSUFFICIENT_GAS", "message": "…", "detail": { … } } }
```

`message` is **already written for the interface** — render it verbatim. Screens
never build their own error copy.

### `ApiError`

The client throws one of these on every failure:

| Member | Meaning |
|---|---|
| `code` | Machine code from the table in §8 |
| `status` | HTTP status |
| `message` | Display copy, verbatim |
| `detail` | Loose object; shape varies by code |
| `partialGasAvailable` | For `INSUFFICIENT_GAS`, the kg actually available, else `null` |
| `fieldErrors` | `detail.fields` mapped to `{ field: message }` for form highlighting |
| `isRetryable` | 5xx or `RETRY` |

### Idempotency

Every order-creating and payment-recording call takes an `Idempotency-Key`
header. Use `newIdempotencyKey()` — a stable key per *attempt*, so a retry
replays rather than creating a second order. Never regenerate the key on retry.

### Guest tokens

A signed-out checkout returns `guest_token`. Every subsequent read of that order
must carry it: `/orders/:id?t=<token>`, `/orders/:id/qr?t=<token>`,
`/payments/initialize?t=<token>`. It is a capability token — treat it as a
password and never log it.

### Auth

`Authorization: Bearer <supabase access token>`. The Worker reads the **role
from the database**, never from the JWT, so a stale token cannot carry a revoked
role.

---

## 2. Enums

```ts
type AppRole          = "customer" | "staff" | "driver" | "admin";
type OrderChannel     = "online" | "walk_in";
type OrderType        = "gas" | "accessory" | "mixed";
type FulfillmentType  = "pickup" | "delivery";

type OrderStatus      = "pending" | "confirmed" | "processing"
                      | "fulfilled" | "cancelled" | "expired";
type PaymentStatus    = "pending" | "paid" | "failed"
                      | "refunded" | "partially_refunded";
// The first value is the *stored* gateway tag, set server-side. Nothing in the
// UI sends it — see §6.1.
type PaymentMethod    = "monnify" | "cash" | "card_terminal"
                      | "bank_transfer" | "opay";
type ReservationStatus = "reserved" | "fulfilled" | "released" | "expired";
type QrStatus          = "unscanned" | "scanned" | "expired" | "void";
type DeliveryStatus    = "assigned" | "en_route" | "delivered"
                       | "failed" | "rescheduled" | "returned";
type DriverStatus      = "available" | "busy" | "offline";
type StaffStatus       = "active" | "suspended" | "removed";
type StockMove         = "addition" | "removal" | "correction";
type ReservationKind   = "gas" | "product";
type ImageOwner        = "product" | "profile" | "bundle" | "stock_entry";
type CompatMatch       = "equal" | "in_set" | "numeric_range";
type RefundStatus      = "pending" | "processing" | "refunded"
                       | "declined" | "manual";
// `processing` means handed to Monnify, awaiting its answer. Monnify refunds
// are asynchronous: the acceptance response is not the refund. `refunded` is
// set only by the SUCCESSFUL_REFUND webhook (or a terminal status on the
// acceptance response), so the customer is never told "refunded" early.
```

⚠️ **`"depot"` is not a payment method.** "Pay in the depot" is a UI branch that
creates an *unpaid* order holding stock, not a value in `payment_method`. The
order is later settled with `cash`, `card_terminal`, `bank_transfer` or `opay`
through the staff endpoint. See §6.

---

## 3. Core models

### Identity

```ts
interface Profile {
  profile_id: string;
  role: AppRole;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;              // citext, case-insensitive
  phone: string | null;              // ^\+?[0-9]{7,15}$ — no spaces or dashes
  email_verified_at: string | null;
  avatar_asset?: ImageRef | null;
}

interface ImageRef { base_path: string; width?: number; height?: number; }

interface StaffMember {
  staff_id: string;
  status: StaffStatus;
  bank_name: string | null;
  account_number: string | null;     // exactly 10 digits
  hired_at: string;
  profile: Profile | null;           // role lives on profile.role
}

interface DriverProfile {
  driver_id: string;
  status: DriverStatus;
  phone: string;                     // NOT NULL in the schema
  vehicle_info: string | null;
  completed_deliveries: number;
  profile: { display_name: string | null; avatar_asset?: ImageRef | null } | null;
}
```

**A cashier needs two rows:** a `profile` with `role = 'staff'` **and** a
`staff_member` row. Without the second, the first sale fails
`STAFF_RECORD_MISSING`. Drivers likewise need a `driver` row.

### Catalogue

```ts
interface Product {
  product_id: string;
  name: string;
  subtitle: string | null;           // the "4 Feet" line in the design
  description: string | null;
  price_kobo: number;                // > 0
  stock_qty: number;
  reserved_qty: number;              // 0 <= reserved_qty <= stock_qty
  available: number;                 // derived: stock_qty - reserved_qty
  active: boolean;
  product_category?: { slug: string; name: string } | null;
  image_asset?: ImageRef | null;
}

interface BundleMember extends Product { slot_index: number; quantity: number; }

interface Bundle {
  bundle_id: string;
  name: string;
  description: string | null;
  price_kobo: number;
  image: ImageRef | null;
  members: BundleMember[];           // 2 or 3, never more
  separately_kobo: number;           // sum of members at list price
  saving_kobo: number;
  available: number;                 // min over members
  unavailable_member: string | null; // which member is blocking, if any
}
```

A bundle's availability is **derived from its scarcest member**, never stored.
Max 3 members, enforced in the database.

```ts
interface ShopItem {
  kind: "product" | "bundle";
  id: string;
  name: string;
  subtitle: string | null;
  price_kobo: number;
  available: number;
  image_path: string | null;
  category: string | null;
}

interface BundleOffer {                // "complete the set"
  bundle_id: string;
  name: string;
  price_kobo: number;
  image_path: string | null;
  separately_kobo: number;
  saving_kobo: number;
  available: number;
  adds: string[];                      // what this bundle adds to the basket
  members: { product_id: string; name: string; image_path: string | null }[];
}

interface Zone {
  zone_id: string;
  name: string;
  fee_kobo: number;
  active?: boolean;
  coverage_note: string | null;
}
```

### Orders

```ts
interface OrderItem {
  order_item_id: string;
  quantity: number;
  unit_price_kobo: number;             // frozen at order time
  bundle_id: string | null;            // set when the line came from a bundle
  product: { name: string; subtitle?: string | null;
             image_asset?: ImageRef | null } | null;
}

interface Order {
  order_id: string;
  order_number: string;                // 'U2-' || nextval, e.g. U2-100045
  order_type: OrderType;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_type: FulfillmentType;
  gas_amount_kg: number;
  gas_subtotal_kobo: number;
  items_subtotal_kobo: number;
  delivery_fee_kobo: number;
  total_kobo: number;                  // gas + items + delivery, always
  hold_expires_at: string | null;      // set while unpaid
  created_at: string;
  fulfilled_at: string | null;
  delivery_address?: string | null;
  rate_at_purchase?: number | null;    // kobo/kg, frozen
  items?: OrderItem[];
  payments?: { method: string; status: string;
               amount_kobo: number; paid_at: string | null }[];
  delivery?: Delivery | null;
  guest_name?: string | null;          // walk-in or guest
  guest_phone?: string | null;
  profile?: { display_name: string | null; phone: string | null } | null;
}
```

Database invariants the frontend can rely on:

- `total_kobo = gas_subtotal_kobo + items_subtotal_kobo + delivery_fee_kobo`
- `fulfillment_type = 'pickup'` ⟹ `delivery_fee_kobo = 0`
- `fulfillment_type = 'delivery'` ⟹ `delivery_address` and `zone_id` both set
- `gas_amount_kg > 0` ⟹ `rate_at_purchase` is set
- An order is identifiable: `user_id` **or** `guest_phone`

```ts
interface OrderSummary {               // queue and lookup rows — less than full
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
```

### Delivery

```ts
interface Delivery {
  delivery_id?: string;
  status: DeliveryStatus;
  delivery_address: string;
  failure_reason: string | null;       // required when status = 'failed'
  attempt_count?: number;              // >= 1
  assigned_at?: string;
  en_route_at: string | null;
  delivered_at: string | null;         // required when status = 'delivered'
  eta_minutes?: number | null;         // minutes left in the departure window
  zone?: { name: string; fee_kobo: number } | null;
  driver?: { phone: string;
             profile: { display_name: string | null } | null } | null;
}

interface DriverDrop extends Delivery {
  delivery_id: string;
  order: Order & {
    guest_name: string | null;
    guest_phone: string | null;
    profile?: { display_name: string | null; phone: string | null } | null;
    order_item?: OrderItem[];
  };
}
```

The driver's phone is shown to the customer **only while the drop is live**
(`assigned` / `en_route`); after that it is withheld.

### Inventory

```ts
interface GasStock {
  total_received_kg: number;
  reserved_kg: number;
  deducted_kg: number;
  available_kg: number;                // total - reserved - deducted
  rate_kobo_per_kg: number;
  fill_percent: number;
  days_remaining: number | null;
  burn_kg_per_day?: number;
  burn_basis_days?: number;
  burn_sample_kg?: number;
  low_gas_level?: 0 | 1 | 2 | 3;       // 0 none … 3 almost empty
  updated_at: string;
}

interface StockEntry {
  entry_id: string;
  move: StockMove;
  amount_kg: number;                   // non-zero
  note: string | null;
  entry_date: string;
  admin?: { display_name: string | null } | null;
}
```

`available_kg` is a **function, not a column**. Nothing may write it.

### Addresses, notifications, audit

```ts
interface SavedAddress {
  address_id: string;
  label: string;                       // HOME, SHOP, MUM'S PLACE — 1–40 chars
  line: string;                        // 6–500 chars
  latitude: number | null;             // nothing populates these today
  longitude: number | null;
  is_default: boolean;                 // at most one per person
  created_at: string;
  zone: { zone_id: string; name: string;
          fee_kobo: number; active: boolean } | null;
}

interface Notification {
  notification_id: string;
  kind: string;                        // e.g. order.confirmed, stock.low
  title: string;
  body: string | null;
  order_id: string | null;
  read_at: string | null;
  created_at: string;
}

interface AuditEntry {
  audit_id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
  request_id?: string | null;          // correlates with X-Request-Id
  actor?: { display_name: string | null; role: string } | null;
}
```

Max 20 saved addresses per person, enforced by a trigger.

### Staff-side models

```ts
interface Reconciliation {
  shift_date: string;
  expected_kobo: number;
  transaction_count: number;
  reconciliation: {
    counted_kobo: number;
    variance_kobo: number;             // generated: counted - expected
    note: string | null;
    closed_at: string | null;
  } | null;
}

interface Refund {
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
  order: { order_id: string; order_number: string;
           guest_phone: string | null;
           profile: { display_name: string | null } | null } | null;
}

interface ReportSummary {
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
  previous?: { orders_total: number; orders_fulfilled: number;
               gas_sold_kg: number; revenue_kobo: number };
}

interface FlaggedQueue {
  refunds_owed: FlaggedRefund[];
  failed_deliveries: {
    delivery_id: string; status: DeliveryStatus;
    failure_reason: string | null; attempt_count: number;
    order: { order_id: string; order_number: string } | null;
  }[];
  stale_unpaid: { order_id: string; order_number: string;
                  total_kobo: number; created_at: string }[];
  total: number;
}
```

---

## 4. Endpoints

Every path is relative to `NEXT_PUBLIC_API_BASE` (default `/api`).

### Catalogue — public

| Method | Path | Returns |
|---|---|---|
| GET | `/catalog/home` | `HomePayload`: rate, ticker, available_kg, unread count, signed_in |
| GET | `/catalog/shop?category&q` | `{ items: ShopItem[] }` |
| GET | `/catalog/products/:id` | `{ product: Product }` |
| GET | `/catalog/bundles/:id` | `{ bundle: Bundle }` |
| GET | `/catalog/zones` | `{ zones: Zone[] }` |
| GET | `/catalog/complete-the-set?in=<id>&in=<id>` | `{ bundles: BundleOffer[] }` |

### Account

| Method | Path | Returns |
|---|---|---|
| GET | `/me` | `{ profile: Profile; home: string }` — `home` is the role's landing route |
| GET | `/notifications` | `{ notifications: Notification[] }` |
| POST | `/notifications/read` | `{ ok: true }` |
| GET | `/me/addresses` | `{ addresses: SavedAddress[] }` |
| POST | `/me/addresses` | `{ address: SavedAddress }` |
| PATCH | `/me/addresses/:id` | `{ ok: true }` |
| DELETE | `/me/addresses/:id` | `{ ok: true }` |

### Orders

| Method | Path | Notes |
|---|---|---|
| GET | `/orders/availability?kg=` | `{ available_kg, sufficient, subtotal_kobo }` |
| POST | `/orders/gas` | `{ kg, fulfillment, zone_id?, address?, guest_name?, guest_phone? }` → `{ order, guest_token? }` — **idempotency key** |
| POST | `/orders/cart` | `{ lines[], gas_kg?, fulfillment, zone_id?, address?, guest_name?, guest_phone? }` → `{ order, guest_token? }` — **idempotency key** |
| GET | `/orders` | `{ orders: Order[] }` — signed-in only |
| GET | `/orders/:id?t=` | `{ order: Order }` — `t` required for guests |
| POST | `/orders/:id/cancel?t=` | `{ reservations_released, refund }` |
| POST | `/orders/:id/qr?t=&force=1` | `{ token, existing, expires_at?, order_number }` |

**`lines` shape** (used by cart, walk-in and bundles):

```ts
{ kind: "product" | "bundle"; product_id?: string; bundle_id?: string; quantity: number }[]
```

**QR issuance is gated on payment.** An unpaid order gets `UNPAID` rather than a
code. And `issueQr` **will not replace a live code** — a refresh returns
`{ token: null, existing: true }`, because replacing it would invalidate a code
the customer has already screenshotted. Pass `force=1` only when the client has
no cached copy.

### Payments

| Method | Path | Notes |
|---|---|---|
| POST | `/payments/initialize?t=` | `{ order_id }` → `{ authorization_url, reference, already_paid? }` |
| POST | `/payments/verify?t=` | `{ reference, order_id }` → `{ paid, order_id, payment_id, already_processed, orphaned, refund_required }` |
| POST | `/payments/webhook/monnify` | Monnify only. Signature-verified (see §6.1) |

`order_id` is required on verify — a reference alone used to be enough to act on
somebody else's order.

### Staff — role `staff` or `admin`

| Method | Path | Notes |
|---|---|---|
| GET | `/staff/queue?kind=paid\|unpaid` | `{ orders: OrderSummary[] }` |
| GET | `/staff/lookup?q=` | `{ results: OrderSummary[] }` |
| POST | `/staff/walk-in` | `WalkInBody` → `{ order }` — **idempotency key** |
| POST | `/staff/payments` | In-person payment — **idempotency key** |
| POST | `/staff/scan` | `{ token }` → `{ order_number }` |
| GET | `/staff/reconciliation?date=` | `Reconciliation` |
| POST | `/staff/reconciliation` | `{ shift_date, counted_kobo, note? }` — **idempotency key** |

```ts
interface WalkInBody {
  kg: number;
  lines: { kind: "product" | "bundle"; product_id?: string;
           bundle_id?: string; quantity: number }[];
  guest_name: string;
  guest_phone: string;
  fulfillment: "pickup" | "delivery";
  zone_id?: string;
  address?: string;
}
```

**The in-person payment body** — this is where a depot payment is recorded:

```ts
{
  order_id: string;
  method: "cash" | "card_terminal" | "bank_transfer" | "opay";
  tendered_kobo?: number;        // cash only, for change calculation
  terminal_reference?: string;   // card terminal only
}
// → { change_due_kobo, order_number, orphaned?, refund_required?, message? }
```

**Only an explicit confirmation marks an order paid.** Scanning a QR does not
pay. This endpoint does.

### Driver — role `driver`

| Method | Path | Notes |
|---|---|---|
| GET | `/driver/me` | `{ driver: DriverProfile }` |
| PATCH | `/driver/availability` | `{ status }` |
| GET | `/driver/deliveries?scope=active\|completed\|all` | `{ deliveries: DriverDrop[] }` |
| GET | `/driver/deliveries/:id` | `{ delivery: DriverDrop }` |
| POST | `/driver/deliveries/:id/en-route` | `{ status }` |
| POST | `/driver/deliveries/:id/failed` | `{ reason, note?, outcome: "reschedule" \| "return" }` |
| POST | `/driver/scan` | `{ token }` → `{ order_number }` |

### Admin — role `admin`

| Method | Path |
|---|---|
| GET | `/admin/stock` · POST `/admin/stock/entries` · GET `/admin/stock/entries?month=` |
| PATCH | `/admin/rate` |
| GET | `/admin/products` · POST `/admin/products` · PATCH `/admin/products/:id` |
| POST | `/admin/bundles/check` · POST `/admin/bundles` |
| GET | `/admin/orders?status=` · POST `/admin/orders/:id/cancel` · POST `/admin/orders/:id/assign` |
| GET | `/admin/flagged` |
| GET | `/admin/refunds` · POST `/admin/refunds/:id/process` · POST `/admin/refunds/:id/manual` |
| | `/process` → `{ ok, status, pending_webhook?, already? }`. `status: "processing"` means Monnify accepted it and the refund webhook will settle it; `"refunded"` means it is already terminal. Both are success. |
| GET | `/admin/zones` · POST `/admin/zones` · PATCH `/admin/zones/:id` |
| GET | `/admin/staff` · POST `/admin/staff` · DELETE `/admin/staff/:id` |
| GET | `/admin/drivers` |
| GET | `/admin/settings` · PATCH `/admin/settings/:key` |
| GET | `/admin/audit?entity_type=` |
| GET | `/admin/reports/summary?days=` |

```ts
interface ProductDraft {
  name: string; subtitle?: string; description?: string;
  category_id?: string; sku?: string;
  price_kobo: number; stock_qty?: number;
  image_asset?: string;                       // asset id from /uploads/image
  attributes?: Record<string, string>;        // drives compatibility
}

interface ProductPatch {
  name?: string; subtitle?: string; description?: string;
  price_kobo?: number;
  stock_delta?: number;                       // signed
  stock_note?: string;
  active?: boolean;
  image_asset?: string;
}
```

Adding a staff member writes **two** rows (role + roster). Removing is soft —
the person is named on every sale they rang up, so the row stays and
`staff_member.status` becomes `removed`. The **last active admin cannot be
removed** (`LAST_ADMIN`).

### Uploads

| Method | Path | Notes |
|---|---|---|
| POST | `/uploads/image` | multipart: `file`, `owner_type` → `{ asset_id, base_path, urls }` |
| POST | `/uploads/avatar` | multipart: `file` → `{ asset_id, url }`. No role needed; the Worker writes `profile.avatar_asset` itself |
| POST | `/uploads/bundle` | multipart → `{ bundle, products_created }` |

Images are re-encoded to WebP by the Worker. The bucket is `public-media`,
1 MB limit, `image/webp` only.

---

## 5. State machines

### Order

```
pending ──paid──> confirmed ──> processing ──> fulfilled
   │                  │
   │                  └──cancel──> cancelled
   └──hold lapses──> expired
```

### Payment status

```
pending ──> paid ──> refunded | partially_refunded
   │
   └──> failed
```

### Delivery

```
assigned ──> en_route ──> delivered
    │            │
    │            └──> failed ──> rescheduled | returned
    └────────────┘
```

### Reservation (internal, but drives stock)

```
reserved ──> fulfilled
    │
    └──> released | expired
```

### QR

```
unscanned ──> scanned
    │
    └──> expired | void
```

**One live QR per order**, one live gas reservation per order, one live product
reservation per product per order — each enforced by a unique index, which is
what makes a retry idempotent rather than a double-reserve.

---

## 6. "Pay in the depot" — what it actually is

The frontend `Method` type is `"bank_transfer" | "opay" | "card" | "depot"`.
**`"depot"` exists only in the UI.** It is not a `payment_method` in the
database.

What it does:

1. `POST /orders/gas` (or `/orders/cart`) with the order, **unpaid**.
2. The order is created with `payment_status = 'pending'` and
   `hold_expires_at = now() + hold_minutes` (default **30 minutes**).
3. Stock is **reserved immediately** — `gas_stock.reserved_kg` moves up.
4. The UI shows the countdown `HOLD EXPIRES IN mm:ss` and an `UNPAID` stamp.
   No QR is issued while unpaid.
5. The customer takes the order number to the depot. Staff look it up
   (`/staff/lookup`), take payment, and record it with
   `POST /staff/payments` — `method` is `cash`, `card_terminal`,
   `bank_transfer` or `opay`.
6. That call flips the order to `paid`, which releases the hold, issues the QR,
   and fires the notification.

If the hold lapses first, `expire-order-holds` (a cron Edge Function, every
minute) releases the reservation and the order becomes `expired`. An order paid
**one second after** its hold lapsed is still honoured — the sweep only touches
reservations still marked `reserved`.

The other three methods (`card`, `bank_transfer`, `opay`) go through the payment
gateway: `POST /payments/initialize` returns an `authorization_url` to redirect
to, and the webhook (not the browser) is what marks the order paid.

### 6.1 The gateway is Monnify

The online gateway is **Monnify** (a Moniepoint product), migrated from Paystack
in migration `0025_monnify.sql`. The contract above did not move; what follows is
what changed underneath it.

What is unchanged, and is what the frontend actually depends on:

- `/payments/initialize` returns `authorization_url` and `reference`. The
  frontend redirects to `authorization_url` exactly as before.
- `/payments/verify` takes `{ reference, order_id }`.
- The order is marked paid by the **webhook**, never by the browser.
- `card`, `bank_transfer` and `opay` are the customer-facing methods.
- The `cash | card_terminal | bank_transfer | opay` enum the staff endpoint
  accepts is unchanged.

What changed, all server-side:

| Where | Before | Now |
|---|---|---|
| Webhook path | `/payments/webhook/paystack` | `/payments/webhook/monnify` |
| Webhook signature header | `x-paystack-signature` | `monnify-signature` |
| Signature scheme | HMAC-SHA512 of the raw body, keyed by the secret | **same** |
| Webhook event type | `charge.success` | `SUCCESSFUL_TRANSACTION` |
| Webhook payload shape | `{ event, data }` | `{ eventType, eventData }`, and `eventData` is flat |
| Merchant reference field | `data.reference` | `eventData.paymentReference` |
| Metadata field | `metadata` | `metaData` (capital D), string values only |
| Stored `payment_method` | `'paystack'` | `'monnify'` |
| `refund.provider` default | `'paystack'` | `'monnify'` |
| Error codes | `PAYSTACK_*` | `MONNIFY_*` |
| Auth | static secret key as Bearer | Basic (API key + secret) mints a 1-hour Bearer token, cached in KV |
| Public key | `PAYSTACK_PUBLIC_KEY` | **none** — see below |

⚠️ **`public_key` is now always `null`.** Paystack's inline popup needed a public
key in the browser; Monnify's checkout is a full-page redirect to a URL the
server is given, so no gateway credential is ever shipped to the client. The
field is kept in the response so the client contract does not change, but no
screen should read it.

⚠️ **Amounts invert.** Paystack took **kobo as an integer**; Monnify takes
**naira as a decimal**. `500000` kobo is `5000.00` to Monnify. The Worker
converts at the boundary (`koboToNaira` / `nairaToKobo` in
`worker/src/lib/monnify.ts`) and nowhere else. If you ever add a call to the
gateway directly, convert — passing kobo through charges one hundred times the
order total.

⚠️ **Refunds have hard constraints, all of them Monnify's.** The Refund service
is **not enabled by default** (request activation from
integration-support@monnify.com, quoting the business code). Refunds are
**bank-transfer only — card payments are not eligible**, and this is enforced
before the gateway is called: the Worker reads `paymentMethod` from the stored
payment payload and refuses anything but `ACCOUNT_TRANSFER` with
`REFUND_METHOD_NOT_ELIGIBLE`, leaving the row `pending` for the manual route.
A card payment is therefore not refundable through the gateway at all — send
the money back and close the refund with `POST /refunds/:id/manual`. And refunds are paid
**out of the Monnify wallet**, not the settlement bank account, so the wallet
must hold enough or the refund fails. A refund that Monnify refuses returns to
`pending` with its reason recorded, and the admin's manual route closes it.

⚠️ **Refunds are asynchronous.** Monnify accepts a refund and answers later,
over a `SUCCESSFUL_REFUND` / `FAILED_REFUND` webhook. The row therefore goes
`pending → processing` on acceptance and only becomes `refunded` when the
gateway confirms. A refund is requested with Monnify's own
`transactionReference`, **not** the merchant `paymentReference` — the merchant
reference is not accepted there — so the id is read from the stored payment
payload. Refunds are also disabled by default on a Monnify account; see the
setup checklist.

⚠️ **Neither stored tag is sent by the UI.** `payment_method` is chosen
server-side; a screen reading a stored method should **switch on the four
customer-facing/in-person values and treat anything else as "paid online"**
rather than hardcoding `"monnify"`. That keeps the next provider change
invisible to the frontend too.

**Out of scope for the frontend, confirmed:** it does not call the gateway's
API, does not verify signatures, and does not name the gateway except in a
route label. Monnify is a Worker and migration concern.



---

## 7. Derived quantities — never store these

| Value | How it is computed |
|---|---|
| `available_kg` | `total_received_kg - reserved_kg - deducted_kg` |
| `Product.available` | `stock_qty - reserved_qty` |
| `Bundle.available` | `min(available)` over its members |
| `saving_kobo` | `separately_kobo - price_kobo` |
| `variance_kobo` | `counted_kobo - expected_kobo` (a generated column) |
| `fill_percent` | derived from the tank totals |

**Nothing touches stock except a database function.** `reserve_gas`,
`reserve_products`, `release_reservations`, `fulfill_reservations` and
`redeem_qr` are the only code that moves inventory, and each is one
transaction. A route that reaches for `.update()` on `product.reserved_qty` is a
bug.

---

## 8. Error codes

All codes the Worker can return. Screens should switch on these, not on status
alone.

**Inventory and catalogue**

| Code | Status | Meaning |
|---|---|---|
| `INSUFFICIENT_GAS` | 409 | `detail.available_kg` — offer the partial amount |
| `INSUFFICIENT_STOCK` | 409 | Not enough of a product |
| `PRODUCT_NOT_FOUND` | 404 | |
| `BUNDLE_NOT_FOUND` | 404 | |
| `DEPOT_NOT_FOUND` | 404 | |
| `INVALID_QUANTITY` | 400 | |
| `EMPTY_ORDER` | 400 | |
| `ZONE_REQUIRED` | 400 | Choose an address first |
| `ZONE_NOT_SERVED` | 400 | |
| `OVER_MAX_GAS` | 400 | `detail.max_kg` |
| `INCOMPATIBLE_ITEMS` | 400 | `detail.violations[]` — each carries `message` |
| `BUNDLE_SIZE` | 400 | A bundle holds 2 or 3 |
| `BUNDLE_DUPLICATE_ITEM` | 400 | |
| `OVERRIDE_FORBIDDEN` | 403 | |
| `OVERRIDE_REASON_REQUIRED` | 400 | |

**Orders**

| Code | Status | Meaning |
|---|---|---|
| `ORDER_NOT_FOUND` | 404 | |
| `ORDER_ALREADY_CLOSED` | 409 | |
| `ALREADY_FULFILLED` | 409 | |
| `UNPAID` | 409 | No QR until paid |
| `WRONG_FULFILLMENT_TYPE` | 400 | |
| `NOTHING_TO_REFUND` | 409 | |
| `REFUND_PENDING` | 409 | |

**Payments**

| Code | Status | Meaning |
|---|---|---|
| `AMOUNT_MISMATCH` | 409 | Amount came from somewhere other than the order |
| `CURRENCY_MISMATCH` | 409 | |
| `UNDERPAID` | 409 | |
| `INSUFFICIENT_TENDER` | 400 | Cash tendered below the total |
| `DUPLICATE_PAYMENT` | 409 | |
| `MONNIFY_INIT_FAILED` | 502 | The checkout page could not be created |
| `MONNIFY_VERIFY_FAILED` | 502 | Could not confirm the payment with the gateway |
| `MONNIFY_REFUND_FAILED` | 502 | The gateway refused the refund; it stays queued |
| `REFUND_NOT_AUTOMATABLE` | 409 | Cash — refund in person |
| `REFUND_METHOD_NOT_ELIGIBLE` | 409 | Card — Monnify refunds bank transfers only; send the money back and mark it manual |
| `REFUND_NOT_CLAIMABLE` | 409 | |
| `REFUND_NOT_FOUND` | 404 | |
| `INVALID_REFUND_STATUS` | 409 | |

**QR and delivery**

| Code | Status | Meaning |
|---|---|---|
| `QR_INVALID` | 404 | Not our code |
| `QR_EXPIRED` | 410 | |
| `QR_ALREADY_SCANNED` | 409 | |
| `DELIVERY_NOT_STARTABLE` | 409 | |
| `INVALID_OUTCOME` | 400 | |

**Auth and staff**

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | |
| `FORBIDDEN` | 403 | "NOT YOUR DOOR" |
| `EMAIL_NOT_VERIFIED` | 403 | |
| `STAFF_RECORD_MISSING` | 403 | Role set but no roster row |
| `STAFF_RECORD_INACTIVE` | 403 | |
| `DRIVER_RECORD_MISSING` | 403 | |
| `STAFF_NOT_FOUND` | 404 | |
| `STAFF_ACCOUNT_MISSING` | 409 | No account for that email — invite first |
| `LAST_ADMIN` | 409 | Add another admin before removing this one |
| `RATE_LIMITED` | 429 | |

**Generic**

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | `detail.fields[]` → use `fieldErrors` |
| `DUPLICATE` | 409 | |
| `INACTIVE` | 409 | |
| `IMAGE_NOT_FOUND` / `FILE_TOO_LARGE` / `UNSUPPORTED_IMAGE` / `IMAGE_DIMENSIONS` / `IMAGE_DECODE_FAILED` | 404/413/415/400/400 | |
| `INVALID_RATE` | 400 | |
| `INVALID_RELEASE_STATUS` | 409 | |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | Same key still running |
| `IDEMPOTENCY_MISMATCH` | 409 | Same key, different body |
| `RETRY` | 503 | Safe to retry (GET only, automatically) |
| `INTERNAL` | 500 | |
| `OFFLINE` | 0 | Client-side: network failed, no response |
| `MISCONFIGURED` | 503 | Worker env missing — not a screen state |

---

## 9. Settings

Admin-editable, seeded in `0007`:

| Key | Default | Range in the UI |
|---|---|---|
| `hold_minutes` | 30 | 5–240 |
| `qr_valid_hours` | 72 | 12–336 |
| `max_gas_kg_per_order` | 50 | 5–500 |
| `low_stock_warn_kg` | 500 | — |

`GET /admin/settings` → `{ settings: { key, value, updated_at }[] }`,
`PATCH /admin/settings/:key` → `{ ok: true }`.

---

## 10. Live Figma state — the file has been restructured

⚠️ **Read this before matching a screen.**

The live U2-GAS file (`v4xgWC0Q0wtSKmAff3EOzU`) now has two pages:

| Page | Node | Contents |
|---|---|---|
| `workshop` | `0:1` | Scratch |
| **`MAIN SCREENS`** | **`256:14758`** | Every screen |

The node ids are `256:*` and `369:*`. There is no committed snapshot of these
frames and no generator — the app matches them by reading the live file through
the Figma MCP, so a new frame or a moved node must be re-read from
`MAIN SCREENS` before a screen is built.

Frames on `MAIN SCREENS`, by role:

**Customer**
`PAYMENT SUCCESSFUL` `256:14759` · `PAYMENT failed` `256:14842` ·
`order summary` `256:14922` / `256:15005` · `pay > delivery` `256:15088` ·
`pay > walk in` `256:15178` / `256:15267` ·
`insufficiant inventory` `256:15339` · `RECEIPT PRINTING` `256:15428` ·
`history` `256:15501` / `256:15673` / `256:15765` ·
`RECEIPT DISPLAY` `256:15860` · `LOG IN 3` `256:16099` / `LOG IN 4` `256:16164` ·
`SHOP - SEARCH` `256:16225` / `256:16256` ·
`SHOP - Single ITEM` `256:16287` / `256:16330` ·
`CART - ITEM UNAVAILABLE` `256:16375` / `256:16479` / `256:16555` / `256:16677` / `256:16800` ·
`HOME` `256:16922`

**Cashier**
`WALK-IN PAYMENT 2` `256:17908` · `WALK-IN INPUT` `256:18348` ·
`WALK-IN PAY CONFIRM` `256:18411` / `256:18485` ·
`SCAN SUCCESSFUL` `256:18248` · `SCAN FAIL` `256:18283` · `HOME` `256:18318`

**Driver**
`NOTIFS STATE 1` `256:17985` · `NOTIFS STATE 2` `256:18063` ·
`NOTIFS STATE 1 (EXPANDED)` `256:18156` · `DELIVERY NOTIFS` `256:18561` ·
`DRIVER SCAN SUCCESSFUL` `256:18660` · `DRIVER SCAN FAILED` `256:18694` ·
`DRIVER PROFILE` `256:18728`

**Admin**
`DASHBOARD` × many — `256:16950`, `256:17111`, `256:17255`, `256:17469`,
`256:17614`, `256:17666`, `256:17716`, `256:17817`, `369:558`, `369:659`,
`369:1772`, `369:1283`, `369:2018`, `369:1529`

**Dividers (not screens)**
`DIVIDER` `256:16920` ("USER APP"), `256:18559` ("CASHIER APP"),
`256:18923` / `256:18925` ("DRIVER APP")

Also present: a `Keyboard/Default` **component set** `212:9799` — the on-screen
keypad is a reusable component rather than a drawn group.

**What this means for the frontend work:** the Next.js app (`web/`) rebuilds
each screen from the live frame, so a frame that moves must be re-read before
the matching component is changed. A drawn leaf is drawn text, including its
typos (`C0PYRIGHT`, `INSUFFICIENT- Please redude`); match it character for
character. A leaf the file marks `visible: false` must not be drawn, and one it
draws must not be omitted.

---

## 11. What the frontend can assume

- **Money is always integer kobo.** Format at the edge only.
- **`total_kobo` always equals the sum of its parts** — do not recompute it.
- **`available` is derived** — never trust a cached value across an order.
- **`rate_at_purchase` is frozen.** An admin changing the rate must not move an
  existing order's total.
- **One live QR per order**, and issuing never replaces one.
- **An unpaid order has no QR.** `UNPAID` is the state, not an error to retry.
- **A hold expires.** Treat `hold_expires_at` as authoritative and count down
  locally; the server sweeps once a minute.
- **Retries replay, they do not duplicate** — but only with the same
  `Idempotency-Key`.
- **`message` is display copy.** Render it verbatim; never compose your own.
- **Guests carry a token.** Losing it loses the order.
- **The gateway is not the frontend's business.** Do not hardcode `"monnify"`
  as a stored method value — see §6.1. The redirect flow is what the UI relies
  on, and it does not change when the gateway does.
