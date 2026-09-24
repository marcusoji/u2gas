-- ============================================================================
-- U2GAS — 0003 inventory functions
--
-- Everything that touches stock lives here and nowhere else. The API layer
-- never issues a bare UPDATE against product.reserved_qty or gas_stock.
--
-- Error convention: exceptions are raised with a machine-readable MESSAGE and
-- a JSON DETAIL. The Worker maps the message to a user-facing string; the
-- detail carries the numbers needed to render "ONLY 6KG LEFT".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Availability helpers (read-only, safe to call from anywhere)
-- ----------------------------------------------------------------------------

create or replace function product_available_qty(p_product uuid)
returns integer language sql stable as $$
  select stock_qty - reserved_qty from product where product_id = p_product
$$;

-- A bundle's availability is the weakest link, never a stored number.
create or replace function bundle_available_qty(p_bundle uuid)
returns integer language sql stable as $$
  select coalesce(min(floor((p.stock_qty - p.reserved_qty)::numeric / bi.quantity)), 0)::integer
  from bundle_item bi
  join product p on p.product_id = bi.product_id
  where bi.bundle_id = p_bundle and p.active
$$;

-- ----------------------------------------------------------------------------
-- Compatibility evaluation (Addendum 71.2)
-- Returns one row per violation. No rows means the set is compatible.
-- ----------------------------------------------------------------------------

create or replace function check_bundle_compatibility(p_product_ids uuid[])
returns table (rule_id uuid, product_a uuid, product_b uuid, message text)
language plpgsql stable as $$
begin
  return query
  with pairs as (
    select a.product_id as pa, b.product_id as pb,
           a.category_id as ca, b.category_id as cb
    from   unnest(p_product_ids) with ordinality as x(id, ord)
    join   product a on a.product_id = x.id
    join   unnest(p_product_ids) with ordinality as y(id, ord) on y.ord > x.ord
    join   product b on b.product_id = y.id
  ),
  applicable as (
    select r.rule_id, r.attribute_key, r.match_type, r.allowed_set, r.tolerance,
           r.message, pr.pa, pr.pb
    from   pairs pr
    join   compatibility_rule r
      on   r.active
     and   r.category_a = least(pr.ca, pr.cb)
     and   r.category_b = greatest(pr.ca, pr.cb)
  )
  select ap.rule_id, ap.pa, ap.pb, ap.message
  from   applicable ap
  left join product_attribute va
         on va.product_id = ap.pa and va.attribute_key = ap.attribute_key
  left join product_attribute vb
         on vb.product_id = ap.pb and vb.attribute_key = ap.attribute_key
  where
    -- An attribute we cannot read is a failure, not a pass. We never assume fit.
    va.attribute_value is null
    or vb.attribute_value is null
    or (ap.match_type = 'equal'
        and va.attribute_value is distinct from vb.attribute_value)
    or (ap.match_type = 'in_set'
        and not (va.attribute_value = any(ap.allowed_set)
                 and vb.attribute_value = any(ap.allowed_set)))
    or (ap.match_type = 'numeric_range'
        and (va.numeric_value is null or vb.numeric_value is null
             or abs(va.numeric_value - vb.numeric_value) > ap.tolerance));
end $$;

-- ----------------------------------------------------------------------------
-- Gas reservation
--
-- Gas is a single fungible pool, so one row lock serialises every competing
-- order. FOR UPDATE is what makes spec 46's two-customers-one-tank test pass.
-- ----------------------------------------------------------------------------

create or replace function reserve_gas(
  p_order_id   uuid,
  p_depot_id   uuid,
  p_kg         numeric,
  p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_available numeric;
  v_reservation uuid;
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
    raise exception 'DEPOT_NOT_FOUND' using detail = json_build_object('depot_id', p_depot_id)::text;
  end if;

  if v_available < p_kg then
    raise exception 'INSUFFICIENT_GAS'
      using detail = json_build_object(
        'requested_kg', p_kg,
        'available_kg', greatest(v_available, 0)
      )::text;
  end if;

  update gas_stock
     set reserved_kg = reserved_kg + p_kg,
         updated_at  = now()
   where depot_id = p_depot_id;

  insert into inventory_reservation (order_id, kind, depot_id, quantity, expires_at)
  values (p_order_id, 'gas', p_depot_id, p_kg, p_expires_at)
  returning reservation_id into v_reservation;

  return v_reservation;
end $$;

-- ----------------------------------------------------------------------------
-- Product reservation
--
-- p_items is [{"product_id": "...", "quantity": 2}, ...]
-- Rows are locked in ascending product_id order so two orders containing the
-- same two products can never deadlock against each other. (Addendum 71.5)
-- ----------------------------------------------------------------------------

create or replace function reserve_products(
  p_order_id   uuid,
  p_items      jsonb,
  p_expires_at timestamptz
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_item record;
  v_available integer;
  v_name text;
  v_count integer := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    return 0;
  end if;

  for v_item in
    select (e->>'product_id')::uuid as product_id,
           (e->>'quantity')::integer as quantity
    from   jsonb_array_elements(p_items) e
    order  by (e->>'product_id')::uuid          -- deadlock avoidance
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'INVALID_QUANTITY'
        using detail = json_build_object('product_id', v_item.product_id)::text;
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

    if v_available < v_item.quantity then
      -- Spec 27: name the exact item and the exact shortfall.
      raise exception 'INSUFFICIENT_STOCK'
        using detail = json_build_object(
          'product_id', v_item.product_id,
          'product_name', v_name,
          'requested', v_item.quantity,
          'available', greatest(v_available, 0)
        )::text;
    end if;

    update product
       set reserved_qty = reserved_qty + v_item.quantity,
           updated_at   = now()
     where product_id = v_item.product_id;

    insert into inventory_reservation (order_id, kind, product_id, quantity, expires_at)
    values (p_order_id, 'product', v_item.product_id, v_item.quantity, p_expires_at)
    on conflict (order_id, product_id) where status = 'reserved' and kind = 'product'
    do update set quantity = inventory_reservation.quantity + excluded.quantity;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- ----------------------------------------------------------------------------
-- Expand a bundle line into its member products, so reservation sees only
-- products. Bundles never hold stock of their own.
-- ----------------------------------------------------------------------------

create or replace function expand_bundle_items(p_bundle uuid, p_bundle_qty integer)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', bi.product_id,
           'quantity',   bi.quantity * p_bundle_qty)), '[]'::jsonb)
  from bundle_item bi where bi.bundle_id = p_bundle
$$;

-- ----------------------------------------------------------------------------
-- Release
--
-- Idempotent by construction: the WHERE clause only matches reservations that
-- are still live, so a second call is a no-op. This is what makes the expiry
-- job in 0005 safe to run repeatedly. (Spec 37)
-- ----------------------------------------------------------------------------

create or replace function release_reservations(
  p_order_id uuid,
  p_status   reservation_status default 'released'
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_released integer := 0;
begin
  if p_status not in ('released','expired') then
    raise exception 'INVALID_RELEASE_STATUS';
  end if;

  for v_row in
    select reservation_id, kind, product_id, depot_id, quantity
    from   inventory_reservation
    where  order_id = p_order_id and status = 'reserved'
    order  by product_id nulls first          -- same lock order as reserve_products
    for update
  loop
    if v_row.kind = 'gas' then
      update gas_stock
         set reserved_kg = greatest(reserved_kg - v_row.quantity, 0),
             updated_at  = now()
       where depot_id = v_row.depot_id;
    else
      update product
         set reserved_qty = greatest(reserved_qty - v_row.quantity::integer, 0),
             updated_at   = now()
       where product_id = v_row.product_id;
    end if;

    update inventory_reservation
       set status = p_status, released_at = now()
     where reservation_id = v_row.reservation_id;

    v_released := v_released + 1;
  end loop;

  return v_released;
end $$;

-- ----------------------------------------------------------------------------
-- Fulfil: reserved stock becomes deducted stock.
-- Also idempotent — only live reservations move.
-- ----------------------------------------------------------------------------

create or replace function fulfill_reservations(p_order_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_done integer := 0;
begin
  for v_row in
    select reservation_id, kind, product_id, depot_id, quantity
    from   inventory_reservation
    where  order_id = p_order_id and status = 'reserved'
    order  by product_id nulls first
    for update
  loop
    if v_row.kind = 'gas' then
      update gas_stock
         set reserved_kg = greatest(reserved_kg - v_row.quantity, 0),
             deducted_kg = deducted_kg + v_row.quantity,
             updated_at  = now()
       where depot_id = v_row.depot_id;
    else
      -- reserved_qty and stock_qty fall together; the check constraint
      -- product_reserved_lte_stock guards the ordering.
      update product
         set reserved_qty = greatest(reserved_qty - v_row.quantity::integer, 0),
             stock_qty    = stock_qty - v_row.quantity::integer,
             updated_at   = now()
       where product_id = v_row.product_id;
    end if;

    update inventory_reservation
       set status = 'fulfilled', fulfilled_at = now()
     where reservation_id = v_row.reservation_id;

    v_done := v_done + 1;
  end loop;

  return v_done;
end $$;

-- ----------------------------------------------------------------------------
-- Stock entry. available_kg is never written directly. (Spec 29)
-- ----------------------------------------------------------------------------

create or replace function record_stock_entry(
  p_depot_id uuid,
  p_admin_id uuid,
  p_move     stock_move,
  p_amount_kg numeric,
  p_note     text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_entry uuid;
  v_delta numeric;
begin
  if p_amount_kg <= 0 then
    raise exception 'INVALID_QUANTITY' using detail = '{"field":"amount_kg"}';
  end if;

  v_delta := case when p_move = 'addition' then p_amount_kg else -p_amount_kg end;

  perform 1 from gas_stock where depot_id = p_depot_id for update;
  if not found then
    raise exception 'DEPOT_NOT_FOUND';
  end if;

  update gas_stock
     set total_received_kg = total_received_kg + v_delta,
         updated_at = now()
   where depot_id = p_depot_id;
  -- gas_never_oversold fires here if an admin tries to remove stock that is
  -- already promised to a customer. That is the correct outcome.

  insert into stock_entry (depot_id, admin_id, move, amount_kg, note)
  values (p_depot_id, p_admin_id, p_move, p_amount_kg, p_note)
  returning entry_id into v_entry;

  insert into audit_log (actor_id, action, entity_type, entity_id, after, note)
  values (p_admin_id, 'stock.' || p_move, 'gas_stock', p_depot_id,
          json_build_object('amount_kg', p_amount_kg)::jsonb, p_note);

  return v_entry;
end $$;
