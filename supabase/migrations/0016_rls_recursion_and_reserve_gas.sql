-- ============================================================================
-- U2GAS — 0016 RLS recursion and reserve_gas idempotency
--
-- Both found by running the suites against a live database:
--   01_concurrency.sql  51/51 pass
--   02_rls.sql          45/49 — four failures, all one root cause
-- ============================================================================


-- ----------------------------------------------------------------------------
-- P0 — infinite recursion between "order" and delivery
--
--   ERROR: infinite recursion detected in policy for relation "order"
--
-- The cycle:
--   order_read     → EXISTS (… FROM delivery …)      (so a driver sees their drop)
--   delivery_read  → EXISTS (… FROM "order" …)       (so a customer sees their delivery)
--
-- Each policy triggers the other's policy, and Postgres gives up.
--
-- It is wider than the two policies named in the review. order_item_read and
-- payment_read both reference "order", so they enter the same loop the moment
-- a customer reads their own basket or receipt. All four are fixed here.
--
-- The fix is to do the cross-table check inside a SECURITY DEFINER function.
-- The function runs as its owner, who is exempt from RLS on these tables, so
-- the inner read does not re-enter a policy and the cycle is broken.
--
-- Each helper answers exactly one yes/no question about the *current* user's
-- own relationship to one row. It cannot be used to read anything, so making
-- it callable is not a disclosure.
-- ----------------------------------------------------------------------------

/**
 * Is this order one the calling driver has been assigned to deliver?
 * Reads delivery and driver without triggering their policies.
 */
create or replace function order_visible_to_driver(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from   delivery d
    join   driver dr on dr.driver_id = d.driver_id
    where  d.order_id = p_order_id
      and  dr.profile_id = current_profile_id()
  )
$$;

/**
 * Does the calling customer own this order?
 * Used by the delivery, order_item and payment policies so none of them has to
 * read "order" through its policy.
 */
create or replace function order_owned_by_current(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from "order" o
    where  o.order_id = p_order_id
      and  o.user_id = current_profile_id()
  )
$$;

/**
 * Is this delivery assigned to the calling driver?
 * driver_read does not reference delivery, so this is not part of the cycle —
 * but keeping the shape consistent means a future edit to driver_read cannot
 * quietly create a new one.
 */
create or replace function delivery_assigned_to_current(p_driver_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from driver dr
    where  dr.driver_id = p_driver_id
      and  dr.profile_id = current_profile_id()
  )
$$;


-- ----------------------------------------------------------------------------
-- Rewrite the four policies. One policy per table per action, no duplicates:
-- 0012 already drops every pre-existing policy, and these replace the ones it
-- created.
-- ----------------------------------------------------------------------------

drop policy if exists order_read       on "order";
drop policy if exists order_owner_read on "order";     -- 0006 name, in case of partial apply
drop policy if exists order_item_read  on order_item;
drop policy if exists payment_read     on payment;
drop policy if exists payment_owner_read on payment;   -- 0006 name
drop policy if exists delivery_read    on delivery;

create policy order_read on "order" for select using (
  user_id = current_profile_id()
  or is_staff()
  or (is_driver() and order_visible_to_driver("order".order_id))
);

create policy order_item_read on order_item for select using (
  is_staff()
  or order_owned_by_current(order_item.order_id)
  or (is_driver() and order_visible_to_driver(order_item.order_id))
);

create policy payment_read on payment for select using (
  is_staff()
  or order_owned_by_current(payment.order_id)
);

create policy delivery_read on delivery for select using (
  is_staff()
  or delivery_assigned_to_current(delivery.driver_id)
  or order_owned_by_current(delivery.order_id)
);


-- ----------------------------------------------------------------------------
-- Grants.
--
-- The review asked for EXECUTE to be revoked from anon and authenticated on
-- these helpers, consistent with 0012. That would break them: a policy
-- expression is evaluated with the privileges of the *querying* role, so a
-- function called inside a policy must be executable by that role. Revoking it
-- turns every SELECT into "permission denied for function".
--
-- 0012 made the same distinction — it revoked EXECUTE on the business
-- functions (create_gas_order, confirm_payment, redeem_qr …) but explicitly
-- granted it on the policy helpers (is_staff, current_profile_id …). These
-- three belong in the second group.
--
-- Safe because each returns only a boolean about the caller's own row, takes
-- an id the caller must already possess, and exposes no data either way.
-- ----------------------------------------------------------------------------

revoke all on function order_visible_to_driver(uuid)      from public;
revoke all on function order_owned_by_current(uuid)       from public;
revoke all on function delivery_assigned_to_current(uuid) from public;

grant execute on function order_visible_to_driver(uuid)      to anon, authenticated;
grant execute on function order_owned_by_current(uuid)       to anon, authenticated;
grant execute on function delivery_assigned_to_current(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 0012 revoked INSERT/UPDATE/DELETE on the business tables, which is right.
-- SELECT still has to be granted or RLS never gets a chance to allow anything:
-- the table privilege is checked first, and a missing one denies outright.
-- Re-stated here so a fresh database is definitely correct.
-- ----------------------------------------------------------------------------

grant select on "order", order_item, payment, delivery, driver, staff_member,
                inventory_reservation, notification, cash_reconciliation,
                audit_log, app_setting
  to anon, authenticated;

grant select on product, product_category, product_attribute, bundle,
                bundle_item, image_asset, delivery_zone, depot, gas_stock,
                shop_listing
  to anon, authenticated;


-- ----------------------------------------------------------------------------
-- P1 — reserve_gas was not idempotent
--
-- reserve_products was fixed in 0011; reserve_gas kept the old shape:
--
--     reserved_kg = reserved_kg + p_kg        -- unconditional
--     insert into inventory_reservation …     -- no delta, no ON CONFLICT
--
-- A retried checkout over-increments reserved_kg and then trips the unique
-- live-gas index, leaving the pool short by the retried amount with no
-- reservation to account for it. Gas simply disappears from the tank.
--
-- Same treatment as reserve_products: compute the delta against what this
-- order already holds, move reserved_kg by that amount only, and upsert the
-- reservation to the absolute quantity.
-- ----------------------------------------------------------------------------

create or replace function reserve_gas(
  p_order_id   uuid,
  p_depot_id   uuid,
  p_kg         numeric,
  p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_available    numeric;
  v_existing     numeric;
  v_delta        numeric;
  v_reservation  uuid;
begin
  if p_kg is null or p_kg <= 0 then
    raise exception 'INVALID_QUANTITY' using detail = '{"field":"gas_amount_kg"}';
  end if;

  -- Serialisation point. Every concurrent gas order queues here.
  select total_received_kg - reserved_kg - deducted_kg
    into v_available
  from gas_stock
  where depot_id = p_depot_id
  for update;

  if not found then
    raise exception 'DEPOT_NOT_FOUND'
      using detail = json_build_object('depot_id', p_depot_id)::text;
  end if;

  -- What this order already holds, if this is a retry.
  select quantity into v_existing
    from inventory_reservation
   where order_id = p_order_id
     and kind = 'gas'
     and status = 'reserved';
  v_existing := coalesce(v_existing, 0);

  v_delta := p_kg - v_existing;

  if v_delta > 0 and v_available < v_delta then
    raise exception 'INSUFFICIENT_GAS'
      using detail = json_build_object(
        'requested_kg', p_kg,
        -- What they could have: free gas plus what they already hold.
        'available_kg', greatest(v_available + v_existing, 0)
      )::text;
  end if;

  if v_delta <> 0 then
    update gas_stock
       set reserved_kg = reserved_kg + v_delta,
           updated_at  = now()
     where depot_id = p_depot_id;
  end if;

  insert into inventory_reservation (order_id, kind, depot_id, quantity, expires_at)
  values (p_order_id, 'gas', p_depot_id, p_kg, p_expires_at)
  on conflict (order_id) where status = 'reserved' and kind = 'gas'
  -- Absolute, not additive. This is what makes a retry a no-op.
  do update set quantity   = excluded.quantity,
                expires_at = excluded.expires_at
  returning reservation_id into v_reservation;

  return v_reservation;
end $$;

revoke all on function reserve_gas(uuid, uuid, numeric, timestamptz)
  from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- P1 — reserve_products stranded products dropped from a retry
--
-- 0011 made the function idempotent for products present in both calls, but a
-- product removed between the first call and a retry kept its reservation
-- forever: nothing in the new set matched it, so nothing released it.
--
-- The set semantics are now complete. "Make this order's reservation equal to
-- this set" means anything not in the set is released, which is what a caller
-- passing the full basket every time already expects.
-- ----------------------------------------------------------------------------

create or replace function reserve_products(
  p_order_id   uuid,
  p_items      jsonb,
  p_expires_at timestamptz
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_item      record;
  v_available integer;
  v_name      text;
  v_existing  integer;
  v_delta     integer;
  v_count     integer := 0;
  v_keep      uuid[] := '{}';
  v_stale     record;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    -- An empty set means "hold nothing", so release anything still held.
    for v_stale in
      select reservation_id, product_id, quantity::integer as quantity
        from inventory_reservation
       where order_id = p_order_id and kind = 'product' and status = 'reserved'
       order by product_id
       for update
    loop
      update product
         set reserved_qty = greatest(reserved_qty - v_stale.quantity, 0),
             updated_at   = now()
       where product_id = v_stale.product_id;
      update inventory_reservation
         set status = 'released', released_at = now()
       where reservation_id = v_stale.reservation_id;
    end loop;
    return 0;
  end if;

  for v_item in
    select (e->>'product_id')::uuid          as product_id,
           sum((e->>'quantity')::numeric)    as quantity
    from   jsonb_array_elements(p_items) e
    group  by 1
    order  by 1                               -- deadlock avoidance
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'INVALID_QUANTITY'
        using detail = json_build_object('product_id', v_item.product_id)::text;
    end if;

    if v_item.quantity <> trunc(v_item.quantity) then
      raise exception 'INVALID_QUANTITY'
        using detail = json_build_object(
          'product_id', v_item.product_id,
          'quantity', v_item.quantity,
          'reason', 'whole numbers only')::text;
    end if;

    select stock_qty - reserved_qty, name
      into v_available, v_name
    from product
    where product_id = v_item.product_id and active
    for update;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND'
        using detail = json_build_object('product_id', v_item.product_id)::text;
    end if;

    select quantity::integer into v_existing
      from inventory_reservation
     where order_id = p_order_id
       and product_id = v_item.product_id
       and kind = 'product'
       and status = 'reserved';
    v_existing := coalesce(v_existing, 0);

    v_delta := v_item.quantity::integer - v_existing;

    if v_delta > 0 and v_available < v_delta then
      raise exception 'INSUFFICIENT_STOCK'
        using detail = json_build_object(
          'product_id',   v_item.product_id,
          'product_name', v_name,
          'requested',    v_item.quantity::integer,
          'available',    greatest(v_available + v_existing, 0)
        )::text;
    end if;

    if v_delta <> 0 then
      update product
         set reserved_qty = reserved_qty + v_delta,
             updated_at   = now()
       where product_id = v_item.product_id;
    end if;

    insert into inventory_reservation
      (order_id, kind, product_id, quantity, expires_at)
    values
      (p_order_id, 'product', v_item.product_id, v_item.quantity::integer, p_expires_at)
    on conflict (order_id, product_id) where status = 'reserved' and kind = 'product'
    do update set quantity   = excluded.quantity,
                  expires_at = excluded.expires_at;

    v_keep := v_keep || v_item.product_id;
    v_count := v_count + 1;
  end loop;

  -- Anything this order held that is no longer in the set goes back.
  for v_stale in
    select reservation_id, product_id, quantity::integer as quantity
      from inventory_reservation
     where order_id = p_order_id
       and kind = 'product'
       and status = 'reserved'
       and not (product_id = any(v_keep))
     order by product_id
     for update
  loop
    update product
       set reserved_qty = greatest(reserved_qty - v_stale.quantity, 0),
           updated_at   = now()
     where product_id = v_stale.product_id;

    update inventory_reservation
       set status = 'released', released_at = now()
     where reservation_id = v_stale.reservation_id;
  end loop;

  return v_count;
end $$;

revoke all on function reserve_products(uuid, jsonb, timestamptz)
  from public, anon, authenticated;
