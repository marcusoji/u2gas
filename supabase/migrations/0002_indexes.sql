-- ============================================================================
-- U2GAS — 0002 indexes (spec 57)
-- Every index below backs a query the application actually runs. Unique
-- constraints that carry business meaning live in 0001 next to their table.
-- ============================================================================

-- Identity -------------------------------------------------------------------
create index profile_role_idx        on profile (role);
create index profile_phone_idx       on profile (phone) where phone is not null;
create index profile_email_idx       on profile (email) where email is not null;
create index driver_status_idx       on driver (status) where status <> 'offline';
create index staff_status_idx        on staff_member (status) where status = 'active';

-- Catalogue ------------------------------------------------------------------
create index product_active_idx      on product (active, category_id) where active;
create index product_category_idx    on product (category_id);
-- Availability lookups on the shop grid.
create index product_available_idx   on product ((stock_qty - reserved_qty)) where active;
create index product_attribute_key_idx on product_attribute (attribute_key, attribute_value);
create index compat_rule_pair_idx    on compatibility_rule (category_a, category_b) where active;

create index bundle_active_idx       on bundle (active) where active;
create index bundle_item_product_idx on bundle_item (product_id);
create index bundle_item_bundle_idx  on bundle_item (bundle_id);

-- Orders ---------------------------------------------------------------------
create index order_user_idx          on "order" (user_id, created_at desc);
create index order_status_idx        on "order" (status, created_at desc);
create index order_payment_status_idx on "order" (payment_status, created_at desc);
create index order_created_idx       on "order" (created_at desc);
create index order_guest_phone_idx   on "order" (guest_phone) where guest_phone is not null;
create index order_staff_idx         on "order" (recorded_by_staff_id, created_at desc)
  where recorded_by_staff_id is not null;

-- The expiry sweep. Partial so the index stays small as orders complete.
create index order_hold_expiry_idx
  on "order" (hold_expires_at)
  where payment_status = 'pending'
    and status in ('pending','confirmed')
    and hold_expires_at is not null;

-- Staff pickup queues: paid-and-waiting vs awaiting-payment.
create index order_pickup_queue_idx
  on "order" (depot_id, payment_status, created_at)
  where fulfillment_type = 'pickup' and status in ('confirmed','processing');

create index order_item_order_idx    on order_item (order_id);
create index order_item_product_idx  on order_item (product_id);

-- Reservations ---------------------------------------------------------------
create index reservation_order_idx   on inventory_reservation (order_id);
create index reservation_status_idx  on inventory_reservation (status, expires_at)
  where status = 'reserved';
create index reservation_product_idx on inventory_reservation (product_id)
  where status = 'reserved';

-- Payments -------------------------------------------------------------------
create index payment_order_idx       on payment (order_id, created_at desc);
create index payment_status_idx      on payment (status, created_at desc);
create index payment_method_date_idx on payment (method, paid_at desc) where status = 'paid';
create index payment_staff_idx       on payment (recorded_by_staff_id, paid_at desc)
  where recorded_by_staff_id is not null;

create index webhook_unprocessed_idx on webhook_event (received_at)
  where processed_at is null;

-- QR + delivery --------------------------------------------------------------
create index qr_order_idx            on qr_token (order_id);
create index qr_status_idx           on qr_token (status, expires_at);

create index delivery_driver_idx     on delivery (driver_id, status, assigned_at desc);
create index delivery_status_idx     on delivery (status, assigned_at desc);
create index delivery_active_idx     on delivery (driver_id)
  where status in ('assigned','en_route');

-- Stock ----------------------------------------------------------------------
create index stock_entry_depot_date_idx on stock_entry (depot_id, entry_date desc);
create index gas_rate_history_idx       on gas_rate_history (depot_id, effective_from desc);

-- Reconciliation, notifications, audit ---------------------------------------
create index recon_shift_idx         on cash_reconciliation (depot_id, shift_date desc);
create index recon_open_idx          on cash_reconciliation (staff_id) where closed_at is null;

create index notification_unread_idx on notification (profile_id, created_at desc)
  where read_at is null;
create index notification_profile_idx on notification (profile_id, created_at desc);

create index audit_entity_idx        on audit_log (entity_type, entity_id, created_at desc);
create index audit_actor_idx         on audit_log (actor_id, created_at desc);
create index audit_created_idx       on audit_log (created_at desc);

-- Images ---------------------------------------------------------------------
create index image_owner_idx on image_asset (owner_type, owner_id) where deleted_at is null;
create index image_cleanup_idx on image_asset (deleted_at) where deleted_at is not null;
