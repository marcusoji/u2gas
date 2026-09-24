-- ============================================================================
-- U2GAS — 0001 core schema
-- Enums, tables, constraints. No business logic here.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ----------------------------------------------------------------------------
-- Enums. Status concepts are kept separate on purpose (spec 36).
-- ----------------------------------------------------------------------------

create type app_role         as enum ('customer','staff','driver','manager','admin');
create type order_channel    as enum ('online','walk_in');
create type order_type       as enum ('gas','accessory','mixed');
create type fulfillment_type as enum ('pickup','delivery');

create type order_status       as enum ('pending','confirmed','processing','fulfilled','cancelled','expired');
create type payment_status     as enum ('pending','paid','failed','refunded','partially_refunded');
create type payment_method     as enum ('paystack','cash','card_terminal','bank_transfer','opay');
create type reservation_status as enum ('reserved','fulfilled','released','expired');
create type qr_status          as enum ('unscanned','scanned','expired','void');
create type delivery_status    as enum ('assigned','en_route','delivered','failed','rescheduled','returned');
create type driver_status      as enum ('available','busy','offline');
create type staff_status       as enum ('active','suspended','removed');
create type stock_move         as enum ('addition','removal','correction');
create type reservation_kind   as enum ('gas','product');
create type image_owner        as enum ('product','profile','bundle','stock_entry');
create type compat_match       as enum ('equal','in_set','numeric_range');

-- ----------------------------------------------------------------------------
-- Identity. Supabase Auth owns credentials; we own the application profile.
-- ----------------------------------------------------------------------------

create table profile (
  profile_id   uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,              -- references auth.users(id)
  role         app_role not null default 'customer',
  first_name   text,
  last_name    text,
  display_name text,
  email        citext,
  phone        text,
  avatar_asset uuid,                              -- fk added in 0002 (image_asset)
  email_verified_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profile_phone_shape check (phone is null or phone ~ '^\+?[0-9]{7,15}$')
);

create table staff_member (
  staff_id     uuid primary key default gen_random_uuid(),
  profile_id   uuid not null unique references profile(profile_id) on delete cascade,
  status       staff_status not null default 'active',
  bank_name    text,
  account_number text,
  hired_at     timestamptz not null default now(),
  removed_at   timestamptz,
  constraint staff_account_shape check (account_number is null or account_number ~ '^[0-9]{10}$')
);

create table driver (
  driver_id    uuid primary key default gen_random_uuid(),
  profile_id   uuid not null unique references profile(profile_id) on delete cascade,
  status       driver_status not null default 'offline',
  vehicle_info text,
  phone        text not null,
  completed_deliveries integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint driver_completed_nonneg check (completed_deliveries >= 0)
);

-- ----------------------------------------------------------------------------
-- Images. Bytes never land in Postgres; only references. (Addendum 72.4)
-- ----------------------------------------------------------------------------

create table image_asset (
  asset_id     uuid primary key default gen_random_uuid(),
  owner_type   image_owner not null,
  owner_id     uuid,
  bucket       text not null default 'public-media',
  base_path    text not null,
  sha256       char(64) not null,
  width        integer not null,
  height       integer not null,
  bytes_source integer not null,
  bytes_grid   integer not null,
  has_alpha    boolean not null default true,
  mime         text not null default 'image/webp',
  uploaded_by  uuid references profile(profile_id),
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint image_dims  check (width between 1 and 1600 and height between 1 and 1600),
  constraint image_bytes check (bytes_source > 0 and bytes_grid > 0),
  constraint image_mime  check (mime = 'image/webp')
);

-- Same picture uploaded twice for the same owner type is stored once.
create unique index image_asset_dedupe
  on image_asset (owner_type, sha256) where deleted_at is null;

alter table profile
  add constraint profile_avatar_fk foreign key (avatar_asset)
  references image_asset(asset_id) on delete set null;

-- ----------------------------------------------------------------------------
-- Catalogue
-- ----------------------------------------------------------------------------

create table product_category (
  category_id uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  sort_order  integer not null default 0
);

create table product (
  product_id   uuid primary key default gen_random_uuid(),
  category_id  uuid references product_category(category_id) on delete set null,
  sku          text unique,
  name         text not null,
  subtitle     text,                              -- the "4 Feet" line in the design
  description  text,
  price_kobo   bigint not null,                   -- money in minor units, never float
  stock_qty    integer not null default 0,
  reserved_qty integer not null default 0,
  image_asset  uuid references image_asset(asset_id) on delete set null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Data integrity (spec 58). These are the last line of defence; the
  -- reservation functions should never let them fire.
  constraint product_price_positive   check (price_kobo > 0),
  constraint product_stock_nonneg     check (stock_qty >= 0),
  constraint product_reserved_nonneg  check (reserved_qty >= 0),
  constraint product_reserved_lte_stock check (reserved_qty <= stock_qty)
);

-- Attributes drive compatibility. No hardcoded pairs. (Addendum 71.2)
create table product_attribute (
  product_id      uuid not null references product(product_id) on delete cascade,
  attribute_key   text not null,
  attribute_value text not null,
  numeric_value   numeric,                        -- populated when the value is numeric
  primary key (product_id, attribute_key)
);

create table compatibility_rule (
  rule_id       uuid primary key default gen_random_uuid(),
  category_a    uuid not null references product_category(category_id) on delete cascade,
  category_b    uuid not null references product_category(category_id) on delete cascade,
  attribute_key text not null,
  match_type    compat_match not null,
  allowed_set   text[],                           -- for in_set
  tolerance     numeric,                          -- for numeric_range
  message       text not null,                    -- shown verbatim in the red stamp
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint rule_pair_ordered check (category_a <= category_b),
  constraint rule_in_set_needs_values
    check (match_type <> 'in_set' or (allowed_set is not null and array_length(allowed_set,1) > 0)),
  constraint rule_range_needs_tolerance
    check (match_type <> 'numeric_range' or tolerance is not null)
);

-- ----------------------------------------------------------------------------
-- Bundles (Addendum 71). Availability is derived, never stored.
-- ----------------------------------------------------------------------------

create table bundle (
  bundle_id    uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  price_kobo   bigint not null,
  image_asset  uuid references image_asset(asset_id) on delete set null,
  active       boolean not null default true,
  created_by   uuid references profile(profile_id),
  override_rule_id uuid references compatibility_rule(rule_id),
  override_reason  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint bundle_price_positive check (price_kobo > 0),
  constraint bundle_override_needs_reason
    check (override_rule_id is null or override_reason is not null)
);

create table bundle_item (
  bundle_item_id uuid primary key default gen_random_uuid(),
  bundle_id      uuid not null references bundle(bundle_id) on delete cascade,
  product_id     uuid not null references product(product_id) on delete restrict,
  quantity       integer not null default 1,
  slot_index     smallint not null,
  constraint bundle_slot_range check (slot_index between 1 and 3),
  constraint bundle_qty_positive check (quantity > 0),
  unique (bundle_id, slot_index),
  unique (bundle_id, product_id)
);

-- Hard ceiling of three members, enforced in the database not the app.
create or replace function bundle_item_max_three() returns trigger
language plpgsql as $$
begin
  if (select count(*) from bundle_item where bundle_id = new.bundle_id) > 3 then
    raise exception 'A bundle may contain at most three items'
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger bundle_item_ceiling
  after insert or update on bundle_item
  deferrable initially deferred
  for each row execute function bundle_item_max_three();

-- ----------------------------------------------------------------------------
-- Gas inventory. Single fungible pool per depot.
-- available_kg is derived, never written. (Spec 29)
-- ----------------------------------------------------------------------------

create table depot (
  depot_id   uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  active     boolean not null default true
);

create table gas_stock (
  depot_id          uuid primary key references depot(depot_id) on delete cascade,
  total_received_kg numeric(12,3) not null default 0,
  reserved_kg       numeric(12,3) not null default 0,
  deducted_kg       numeric(12,3) not null default 0,
  rate_kobo_per_kg  bigint not null,
  updated_at        timestamptz not null default now(),
  constraint gas_totals_nonneg check (
    total_received_kg >= 0 and reserved_kg >= 0 and deducted_kg >= 0
  ),
  constraint gas_never_oversold check (
    reserved_kg + deducted_kg <= total_received_kg
  ),
  constraint gas_rate_positive check (rate_kobo_per_kg > 0)
);

-- Derived, so nobody is tempted to store it.
create or replace function gas_available_kg(p_depot uuid)
returns numeric language sql stable as $$
  select total_received_kg - reserved_kg - deducted_kg
  from gas_stock where depot_id = p_depot
$$;

create table stock_entry (
  entry_id      uuid primary key default gen_random_uuid(),
  depot_id      uuid not null references depot(depot_id) on delete cascade,
  admin_id      uuid references profile(profile_id),
  move          stock_move not null default 'addition',
  amount_kg     numeric(12,3) not null,
  note          text,
  entry_date    timestamptz not null default now(),
  constraint stock_entry_amount_nonzero check (amount_kg <> 0)
);

create table gas_rate_history (
  rate_id      uuid primary key default gen_random_uuid(),
  depot_id     uuid not null references depot(depot_id) on delete cascade,
  rate_kobo_per_kg bigint not null,
  changed_by   uuid references profile(profile_id),
  effective_from timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Delivery zones (spec 34). The fee is copied onto the order at purchase time.
-- ----------------------------------------------------------------------------

create table delivery_zone (
  zone_id    uuid primary key default gen_random_uuid(),
  name       text not null,
  fee_kobo   bigint not null,
  active     boolean not null default true,
  coverage_note text,
  created_at timestamptz not null default now(),
  constraint zone_fee_nonneg check (fee_kobo >= 0)
);

-- ----------------------------------------------------------------------------
-- Orders
-- ----------------------------------------------------------------------------

create sequence order_number_seq start 100000;

create table "order" (
  order_id        uuid primary key default gen_random_uuid(),
  order_number    text not null unique default 'U2-' || nextval('order_number_seq'),
  depot_id        uuid not null references depot(depot_id),
  user_id         uuid references profile(profile_id) on delete set null,   -- nullable: walk-ins
  channel         order_channel not null default 'online',
  order_type      order_type not null,

  guest_name      text,
  guest_phone     text,

  gas_amount_kg   numeric(10,3) not null default 0,
  rate_at_purchase bigint,                         -- kobo per kg, frozen at order time
  gas_subtotal_kobo bigint not null default 0,
  items_subtotal_kobo bigint not null default 0,
  delivery_fee_kobo bigint not null default 0,
  total_kobo      bigint not null default 0,

  fulfillment_type fulfillment_type not null,
  zone_id         uuid references delivery_zone(zone_id),
  delivery_address text,

  status          order_status not null default 'pending',
  payment_status  payment_status not null default 'pending',

  hold_expires_at timestamptz,
  reserved_at     timestamptz,
  fulfilled_at    timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,

  recorded_by_staff_id uuid references staff_member(staff_id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint order_amounts_nonneg check (
    gas_amount_kg >= 0 and gas_subtotal_kobo >= 0 and items_subtotal_kobo >= 0
    and delivery_fee_kobo >= 0 and total_kobo >= 0
  ),
  constraint order_total_consistent check (
    total_kobo = gas_subtotal_kobo + items_subtotal_kobo + delivery_fee_kobo
  ),
  -- A walk-in with no account must still be contactable.
  constraint order_identifiable check (
    user_id is not null or guest_phone is not null
  ),
  -- Delivery orders need somewhere to go.
  constraint order_delivery_needs_address check (
    fulfillment_type <> 'delivery' or (delivery_address is not null and zone_id is not null)
  ),
  -- Pickup orders never carry a fee.
  constraint order_pickup_no_fee check (
    fulfillment_type <> 'pickup' or delivery_fee_kobo = 0
  ),
  constraint order_gas_needs_rate check (
    gas_amount_kg = 0 or rate_at_purchase is not null
  )
);

create table order_item (
  order_item_id uuid primary key default gen_random_uuid(),
  order_id      uuid not null references "order"(order_id) on delete cascade,
  product_id    uuid not null references product(product_id) on delete restrict,
  bundle_id     uuid references bundle(bundle_id) on delete set null,  -- set when part of a bundle line
  quantity      integer not null,
  unit_price_kobo bigint not null,                -- frozen at order time
  created_at    timestamptz not null default now(),
  constraint order_item_qty_positive check (quantity > 0),
  constraint order_item_price_nonneg check (unit_price_kobo >= 0)
);

-- ----------------------------------------------------------------------------
-- Reservations. The auditable middle layer between an order and stock. (Spec 35)
-- ----------------------------------------------------------------------------

create table inventory_reservation (
  reservation_id uuid primary key default gen_random_uuid(),
  order_id       uuid not null references "order"(order_id) on delete cascade,
  kind           reservation_kind not null,
  product_id     uuid references product(product_id) on delete restrict,
  depot_id       uuid references depot(depot_id),
  quantity       numeric(12,3) not null,
  status         reservation_status not null default 'reserved',
  expires_at     timestamptz,
  released_at    timestamptz,
  fulfilled_at   timestamptz,
  created_at     timestamptz not null default now(),

  constraint reservation_qty_positive check (quantity > 0),
  constraint reservation_target check (
    (kind = 'gas'     and depot_id is not null and product_id is null) or
    (kind = 'product' and product_id is not null)
  ),
  -- A terminal reservation must record when it got there.
  constraint reservation_terminal_timestamp check (
    (status = 'reserved')
    or (status = 'fulfilled' and fulfilled_at is not null)
    or (status in ('released','expired') and released_at is not null)
  )
);

-- One live reservation per product per order. Prevents double-reserving on retry.
create unique index reservation_one_live_per_product
  on inventory_reservation (order_id, product_id)
  where status = 'reserved' and kind = 'product';

create unique index reservation_one_live_gas
  on inventory_reservation (order_id)
  where status = 'reserved' and kind = 'gas';

-- ----------------------------------------------------------------------------
-- Payments. Separate entity, never crammed into the order. (Spec 35)
-- ----------------------------------------------------------------------------

create table payment (
  payment_id   uuid primary key default gen_random_uuid(),
  order_id     uuid not null references "order"(order_id) on delete cascade,
  provider     text not null,                     -- 'paystack' | 'in_person'
  provider_reference text,
  amount_kobo  bigint not null,
  currency     char(3) not null default 'NGN',
  method       payment_method not null,
  status       payment_status not null default 'pending',
  amount_tendered_kobo bigint,                    -- cash only
  change_due_kobo      bigint,                    -- cash only
  recorded_by_staff_id uuid references staff_member(staff_id),
  raw_payload  jsonb,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint payment_amount_positive check (amount_kobo > 0),
  constraint payment_cash_fields check (
    method <> 'cash' or (amount_tendered_kobo is not null and change_due_kobo is not null)
  ),
  constraint payment_change_nonneg check (change_due_kobo is null or change_due_kobo >= 0),
  constraint payment_paid_has_timestamp check (status <> 'paid' or paid_at is not null)
);

-- The single most important constraint for webhook idempotency (spec 20).
create unique index payment_provider_reference_unique
  on payment (provider, provider_reference)
  where provider_reference is not null;

-- Every webhook delivery is recorded before it is acted on.
create table webhook_event (
  event_id     uuid primary key default gen_random_uuid(),
  provider     text not null,
  provider_event_id text not null,
  event_type   text,
  signature_valid boolean not null,
  payload      jsonb not null,
  processed_at timestamptz,
  processing_error text,
  received_at  timestamptz not null default now(),
  unique (provider, provider_event_id)
);

-- ----------------------------------------------------------------------------
-- QR + fulfilment
-- ----------------------------------------------------------------------------

create table qr_token (
  qr_id       uuid primary key default gen_random_uuid(),
  order_id    uuid not null references "order"(order_id) on delete cascade,
  token_hash  char(64) not null unique,           -- sha256 of the token; plaintext never stored
  status      qr_status not null default 'unscanned',
  expires_at  timestamptz,
  scanned_at  timestamptz,
  scanned_by  uuid references profile(profile_id),
  created_at  timestamptz not null default now(),
  constraint qr_scanned_has_timestamp check (status <> 'scanned' or scanned_at is not null)
);

-- One live QR per order.
create unique index qr_one_live_per_order
  on qr_token (order_id) where status = 'unscanned';

create table delivery (
  delivery_id  uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references "order"(order_id) on delete cascade,
  driver_id    uuid references driver(driver_id) on delete set null,
  delivery_address text not null,
  zone_id      uuid references delivery_zone(zone_id),
  status       delivery_status not null default 'assigned',
  failure_reason text,
  attempt_count integer not null default 1,
  assigned_at  timestamptz not null default now(),
  en_route_at  timestamptz,
  delivered_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint delivery_attempts_positive check (attempt_count > 0),
  constraint delivery_failed_has_reason check (
    status <> 'failed' or failure_reason is not null
  ),
  constraint delivery_delivered_has_timestamp check (
    status <> 'delivered' or delivered_at is not null
  )
);

-- ----------------------------------------------------------------------------
-- Cash reconciliation (spec 33)
-- ----------------------------------------------------------------------------

create table cash_reconciliation (
  reconciliation_id uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff_member(staff_id),
  depot_id      uuid not null references depot(depot_id),
  shift_date    date not null,
  expected_kobo bigint not null,
  counted_kobo  bigint not null,
  variance_kobo bigint generated always as (counted_kobo - expected_kobo) stored,
  note          text,
  closed_at     timestamptz,
  closed_by     uuid references profile(profile_id),
  created_at    timestamptz not null default now(),
  unique (staff_id, shift_date),
  constraint recon_amounts_nonneg check (expected_kobo >= 0 and counted_kobo >= 0)
);

-- ----------------------------------------------------------------------------
-- Notifications + audit
-- ----------------------------------------------------------------------------

create table notification (
  notification_id uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profile(profile_id) on delete cascade,
  order_id    uuid references "order"(order_id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  read_at     timestamptz,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table audit_log (
  audit_id    bigserial primary key,
  actor_id    uuid references profile(profile_id) on delete set null,
  actor_role  app_role,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  note        text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at housekeeping
-- ----------------------------------------------------------------------------

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['profile','product','bundle','order','payment']
  loop
    execute format(
      'create trigger %I_touch before update on %I
         for each row execute function touch_updated_at()',
      t || '_updated', t);
  end loop;
end $$;
