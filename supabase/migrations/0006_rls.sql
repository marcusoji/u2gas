-- ============================================================================
-- U2GAS — 0006 Row Level Security (spec 53, addendum 74.2)
--
-- RLS is the second lock, not the only one. The Worker checks roles too. The
-- point of doing both is that a compromised Worker still cannot read another
-- role's rows.
--
-- Everything is denied by default. Policies grant, never restrict.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers, evaluated against the caller's JWT.
-- ----------------------------------------------------------------------------

create or replace function current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select profile_id from profile where auth_user_id = auth.uid()
$$;

create or replace function current_role_name() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profile where auth_user_id = auth.uid()
$$;

create or replace function is_staff() returns boolean
language sql stable as $$
  select current_role_name() in ('staff','manager','admin')
$$;

create or replace function is_admin() returns boolean
language sql stable as $$
  select current_role_name() in ('manager','admin')
$$;

create or replace function is_driver() returns boolean
language sql stable as $$
  select current_role_name() = 'driver'
$$;

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere. Tables with no policy are unreachable by anon/auth
-- roles, which is the intended default for the rest.
-- ----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'profile','staff_member','driver','image_asset',
    'product_category','product','product_attribute','compatibility_rule',
    'bundle','bundle_item','depot','gas_stock','stock_entry','gas_rate_history',
    'delivery_zone','order','order_item','inventory_reservation',
    'payment','webhook_event','qr_token','delivery',
    'cash_reconciliation','notification','audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Profile
-- ----------------------------------------------------------------------------

create policy profile_self_read on profile
  for select using (auth_user_id = auth.uid() or is_staff());

create policy profile_self_update on profile
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid() and role = current_role_name());
  -- role is pinned: a customer cannot promote themselves.

create policy profile_admin_all on profile
  for all using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Staff and drivers
-- ----------------------------------------------------------------------------

create policy staff_read on staff_member
  for select using (is_staff());
create policy staff_admin_write on staff_member
  for all using (is_admin()) with check (is_admin());

create policy driver_self_read on driver
  for select using (is_staff() or profile_id = current_profile_id());
create policy driver_self_status on driver
  for update using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());
create policy driver_admin_write on driver
  for all using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Catalogue. Readable by everyone including signed-out browsers; writable
-- only by admins.
-- ----------------------------------------------------------------------------

create policy category_public_read on product_category for select using (true);
create policy category_admin on product_category
  for all using (is_admin()) with check (is_admin());

create policy product_public_read on product
  for select using (active or is_staff());
create policy product_admin on product
  for all using (is_admin()) with check (is_admin());

create policy attribute_public_read on product_attribute for select using (true);
create policy attribute_admin on product_attribute
  for all using (is_admin()) with check (is_admin());

create policy rule_staff_read on compatibility_rule
  for select using (is_staff());
create policy rule_admin on compatibility_rule
  for all using (is_admin()) with check (is_admin());

create policy bundle_public_read on bundle
  for select using (active or is_staff());
create policy bundle_admin on bundle
  for all using (is_admin()) with check (is_admin());

create policy bundle_item_public_read on bundle_item for select using (true);
create policy bundle_item_admin on bundle_item
  for all using (is_admin()) with check (is_admin());

create policy image_public_read on image_asset
  for select using (deleted_at is null);
create policy image_admin on image_asset
  for all using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Depot and stock. The rate is public; the ledger is not.
-- ----------------------------------------------------------------------------

create policy depot_public_read on depot for select using (active);

create policy gas_stock_read on gas_stock
  for select using (true);      -- availability drives the customer UI
create policy gas_stock_admin on gas_stock
  for all using (is_admin()) with check (is_admin());

create policy stock_entry_staff_read on stock_entry for select using (is_staff());
create policy stock_entry_admin on stock_entry
  for all using (is_admin()) with check (is_admin());

create policy rate_history_read on gas_rate_history for select using (is_staff());
create policy rate_history_admin on gas_rate_history
  for all using (is_admin()) with check (is_admin());

create policy zone_public_read on delivery_zone for select using (active or is_staff());
create policy zone_admin on delivery_zone
  for all using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Orders. A customer sees their own. Staff see all. Drivers see only the
-- orders they have been assigned, and only while the delivery is live.
-- ----------------------------------------------------------------------------

create policy order_owner_read on "order"
  for select using (
    user_id = current_profile_id()
    or is_staff()
    or (is_driver() and exists (
          select 1 from delivery d
          join driver dr on dr.driver_id = d.driver_id
          where d.order_id = "order".order_id
            and dr.profile_id = current_profile_id()))
  );

create policy order_staff_write on "order"
  for all using (is_staff()) with check (is_staff());

-- Written out in full rather than leaning on the order policy being applied
-- inside this subquery. Relying on that is fragile and easy to misread.
create policy order_item_read on order_item
  for select using (
    is_staff()
    or exists (
      select 1 from "order" o
      where o.order_id = order_item.order_id
        and o.user_id = current_profile_id())
    or (is_driver() and exists (
      select 1 from "order" o
      join delivery d on d.order_id = o.order_id
      join driver dr on dr.driver_id = d.driver_id
      where o.order_id = order_item.order_id
        and dr.profile_id = current_profile_id()))
  );

create policy order_item_staff_write on order_item
  for all using (is_staff()) with check (is_staff());

-- ----------------------------------------------------------------------------
-- Reservations and payments. Customers never see the reservation ledger; they
-- see order status. Payments are visible to their owner for the receipt.
-- ----------------------------------------------------------------------------

create policy reservation_staff on inventory_reservation
  for select using (is_staff());
create policy reservation_admin on inventory_reservation
  for all using (is_admin()) with check (is_admin());

create policy payment_owner_read on payment
  for select using (
    is_staff() or exists (
      select 1 from "order" o
      where o.order_id = payment.order_id and o.user_id = current_profile_id())
  );
create policy payment_staff_write on payment
  for all using (is_staff()) with check (is_staff());

-- Webhook events are service-role only. No policy is deliberate.

-- ----------------------------------------------------------------------------
-- QR. The hash is never exposed to the client; only the owner's order status
-- is. Staff and drivers redeem through the security-definer function, which
-- bypasses RLS by design.
-- ----------------------------------------------------------------------------

create policy qr_staff_read on qr_token for select using (is_staff() or is_driver());

-- ----------------------------------------------------------------------------
-- Delivery
-- ----------------------------------------------------------------------------

create policy delivery_read on delivery
  for select using (
    is_staff()
    or exists (select 1 from driver dr
               where dr.driver_id = delivery.driver_id
                 and dr.profile_id = current_profile_id())
    or exists (select 1 from "order" o
               where o.order_id = delivery.order_id
                 and o.user_id = current_profile_id())
  );

create policy delivery_driver_update on delivery
  for update using (exists (
    select 1 from driver dr
    where dr.driver_id = delivery.driver_id and dr.profile_id = current_profile_id()))
  with check (exists (
    select 1 from driver dr
    where dr.driver_id = delivery.driver_id and dr.profile_id = current_profile_id()));

create policy delivery_staff_write on delivery
  for all using (is_staff()) with check (is_staff());

-- ----------------------------------------------------------------------------
-- Reconciliation, notifications, audit
-- ----------------------------------------------------------------------------

create policy recon_own on cash_reconciliation
  for select using (
    is_admin() or exists (
      select 1 from staff_member s
      where s.staff_id = cash_reconciliation.staff_id
        and s.profile_id = current_profile_id())
  );
create policy recon_admin on cash_reconciliation
  for all using (is_admin()) with check (is_admin());

create policy notification_own on notification
  for select using (profile_id = current_profile_id());
create policy notification_own_update on notification
  for update using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());

-- Audit log is read-only to admins and append-only to the service role.
create policy audit_admin_read on audit_log for select using (is_admin());
