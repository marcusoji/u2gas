-- ============================================================================
-- U2GAS — 0011 review fixes
--
-- Items 1, 2, 3, 4, 5, 6 and 8 from the external review, in that order.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- ITEM 1 — expire_order_holds trusted stale values
--
-- The loop re-checked payment_status using the record the cursor fetched,
-- which is the value read before the row was locked. Postgres does re-evaluate
-- a FOR UPDATE row after a concurrent write, but a plpgsql FOR loop buffers
-- rows, so the record in hand can still be older than the lock.
--
-- The sweep now selects only the id, then re-reads status under the lock. A
-- payment landing mid-sweep wins, every time.
-- ----------------------------------------------------------------------------

create or replace function expire_order_holds(p_limit integer default 500)
returns table (expired_orders integer, released_reservations integer)
language plpgsql security definer set search_path = public as $$
declare
  v_id             uuid;
  v_number         text;
  v_payment_status payment_status;
  v_status         order_status;
  v_expires        timestamptz;
  v_orders         integer := 0;
  v_res            integer := 0;
begin
  for v_id in
    select order_id
    from   "order"
    where  hold_expires_at is not null
      and  hold_expires_at < now()
      and  payment_status = 'pending'
      and  status in ('pending','confirmed')
    order  by hold_expires_at
    limit  p_limit
    for update skip locked
  loop
    -- Authoritative read, under the lock we now hold.
    select order_number, payment_status, status, hold_expires_at
      into v_number, v_payment_status, v_status, v_expires
      from "order"
     where order_id = v_id;

    if v_payment_status <> 'pending'
       or v_status not in ('pending','confirmed')
       or v_expires is null
       or v_expires >= now() then
      continue;
    end if;

    v_res := v_res + release_reservations(v_id, 'expired');

    update qr_token set status = 'void'
     where order_id = v_id and status = 'unscanned';

    update "order"
       set status = 'expired',
           cancelled_at = now(),
           cancel_reason = 'Hold expired before payment',
           hold_expires_at = null
     where order_id = v_id;

    insert into audit_log (action, entity_type, entity_id, after, note)
    values ('order.hold_expired', 'order', v_id,
            json_build_object('order_number', v_number)::jsonb,
            'Released by scheduled sweep');

    insert into notification (profile_id, order_id, kind, title, body)
    select o.user_id, o.order_id, 'order.expired',
           'Your hold expired',
           'Order ' || o.order_number || ' was released because it was not paid in time.'
    from "order" o
    where o.order_id = v_id and o.user_id is not null;

    v_orders := v_orders + 1;
  end loop;

  return query select v_orders, v_res;
end $$;


-- ----------------------------------------------------------------------------
-- ITEM 2 — reserve_products over-reserved on retry
-- ITEM 5 — duplicate product lines relied on the ON CONFLICT path
--
-- The old version incremented reserved_qty unconditionally, then added the
-- same amount again through ON CONFLICT. A retried order creation, or an order
-- containing the same product twice (a bundle plus a standalone, say), held
-- more stock than the customer bought.
--
-- Now: incoming items are aggregated by product_id first, so each product is
-- touched once; the function computes the difference against whatever this
-- order already holds and moves reserved_qty by that delta only.
--
-- The semantics are "make this order's reservation equal to this set", which
-- makes the call idempotent — running it twice with the same input is a no-op.
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
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
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

    -- A fractional count of a physical object is always a bug upstream.
    -- Catch it here rather than truncating silently. (Item 6)
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

    -- What this order already holds, if this is a retry.
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
          -- What they could have: free stock plus what they already hold.
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
    -- Absolute, not additive. This is what makes a retry safe.
    do update set quantity   = excluded.quantity,
                  expires_at = excluded.expires_at;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;


-- ----------------------------------------------------------------------------
-- ITEM 6 — a product reservation must be a whole number
--
-- quantity is numeric(12,3) because gas is measured in kilograms. Product code
-- paths cast to integer, so a fractional value would truncate without warning.
-- ----------------------------------------------------------------------------

alter table inventory_reservation
  drop constraint if exists reservation_product_qty_whole;

alter table inventory_reservation
  add constraint reservation_product_qty_whole
  check (kind <> 'product' or quantity = trunc(quantity));


-- ----------------------------------------------------------------------------
-- ITEM 4 — claim_unsent_notifications cross-joined profile
--
-- `join profile p2 on true` produced a cartesian product of the claimed batch
-- against every profile, filtered afterwards in the WHERE. The answer was
-- right; the plan was not, and it degrades with every customer added.
-- ----------------------------------------------------------------------------

create or replace function claim_unsent_notifications(p_limit integer default 50)
returns table (
  notification_id uuid,
  email text,
  title text,
  body text,
  kind text,
  order_number text
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with claimed as (
    select n.notification_id
      from notification n
      join profile p on p.profile_id = n.profile_id
     where n.emailed_at is null
       and p.email is not null
       and n.created_at > now() - interval '2 days'
     order by n.created_at
     limit p_limit
     for update of n skip locked
  )
  update notification n
     set emailed_at = now()
    from claimed c
    join profile p2 on p2.profile_id = (
      select n2.profile_id from notification n2
       where n2.notification_id = c.notification_id)
   where n.notification_id = c.notification_id
  returning n.notification_id, p2.email::text, n.title, n.body, n.kind,
            (select o.order_number from "order" o where o.order_id = n.order_id);
end $$;


-- ----------------------------------------------------------------------------
-- ITEM 3 — bundle price allocation
--
-- Removes the dead v_first flag, and guards the division: a bundle whose
-- members are all priced at zero would otherwise divide by zero. In that case
-- the bundle price is split evenly, which is the only sensible reading.
--
-- ITEM 5 — the reserve list is aggregated by reserve_products itself now, so
-- a bundle containing a product the customer also bought separately reserves
-- the correct total rather than relying on ON CONFLICT arithmetic.
-- ----------------------------------------------------------------------------

create or replace function create_accessory_order(
  p_depot_id     uuid,
  p_lines        jsonb,
  p_fulfillment  fulfillment_type,
  p_user_id      uuid    default null,
  p_zone_id      uuid    default null,
  p_address      text    default null,
  p_gas_kg       numeric default 0,
  p_channel      order_channel default 'online',
  p_guest_name   text    default null,
  p_guest_phone  text    default null,
  p_staff_id     uuid    default null,
  p_hold_minutes integer default 30
) returns "order"
language plpgsql security definer set search_path = public as $$
declare
  v_line        record;
  v_expires     timestamptz;
  v_fee         bigint := 0;
  v_items_total bigint := 0;
  v_gas_total   bigint := 0;
  v_rate        bigint;
  v_order       "order";
  v_reserve     jsonb := '[]'::jsonb;
  v_type        order_type;
  v_unit        bigint;
  v_bundle_id   uuid;
  v_bundle_qty  integer;
  v_member      record;
  v_list_total  bigint;
  v_member_cnt  integer;
  v_allocated   bigint;
  v_share       bigint;
begin
  if (p_lines is null or jsonb_array_length(p_lines) = 0) and coalesce(p_gas_kg,0) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  v_expires := now() + make_interval(mins => greatest(p_hold_minutes, 1));
  v_type := case when coalesce(p_gas_kg,0) > 0 then 'mixed' else 'accessory' end;

  if p_fulfillment = 'delivery' then
    if p_zone_id is null then raise exception 'ZONE_REQUIRED'; end if;
    select fee_kobo into v_fee from delivery_zone where zone_id = p_zone_id and active;
    if v_fee is null then
      raise exception 'ZONE_NOT_SERVED'
        using detail = json_build_object('zone_id', p_zone_id)::text;
    end if;
  end if;

  if coalesce(p_gas_kg,0) > 0 then
    select rate_kobo_per_kg into v_rate from gas_stock where depot_id = p_depot_id;
    if v_rate is null then raise exception 'DEPOT_NOT_FOUND'; end if;
    v_gas_total := round(p_gas_kg * v_rate);
  end if;

  -- Price every line and flatten bundles into products.
  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) e(line)
  loop
    if v_line.line->>'kind' = 'bundle' then
      v_bundle_id  := (v_line.line->>'bundle_id')::uuid;
      v_bundle_qty := (v_line.line->>'quantity')::integer;

      select price_kobo into v_unit from bundle
       where bundle_id = v_bundle_id and active;
      if v_unit is null then
        raise exception 'BUNDLE_NOT_FOUND'
          using detail = json_build_object('bundle_id', v_bundle_id)::text;
      end if;

      v_items_total := v_items_total + v_unit * v_bundle_qty;
      v_reserve := v_reserve || expand_bundle_items(v_bundle_id, v_bundle_qty);
    else
      v_unit := null;
      select price_kobo into v_unit from product
       where product_id = (v_line.line->>'product_id')::uuid and active;
      if v_unit is null then
        raise exception 'PRODUCT_NOT_FOUND'
          using detail = json_build_object('product_id', v_line.line->>'product_id')::text;
      end if;

      v_items_total := v_items_total + v_unit * (v_line.line->>'quantity')::integer;
      v_reserve := v_reserve || jsonb_build_array(jsonb_build_object(
        'product_id', v_line.line->>'product_id',
        'quantity',   (v_line.line->>'quantity')::integer));
    end if;
  end loop;

  insert into "order" (
    depot_id, user_id, channel, order_type,
    guest_name, guest_phone,
    gas_amount_kg, rate_at_purchase, gas_subtotal_kobo,
    items_subtotal_kobo, delivery_fee_kobo, total_kobo,
    fulfillment_type, zone_id, delivery_address,
    status, payment_status, hold_expires_at, reserved_at, recorded_by_staff_id
  ) values (
    p_depot_id, p_user_id, p_channel, v_type,
    p_guest_name, p_guest_phone,
    coalesce(p_gas_kg,0), v_rate, v_gas_total,
    v_items_total, v_fee, v_gas_total + v_items_total + v_fee,
    p_fulfillment, p_zone_id, p_address,
    'pending', 'pending', v_expires, now(), p_staff_id
  ) returning * into v_order;

  -- Order lines.
  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) e(line)
  loop
    if v_line.line->>'kind' = 'bundle' then
      v_bundle_id  := (v_line.line->>'bundle_id')::uuid;
      v_bundle_qty := (v_line.line->>'quantity')::integer;

      select price_kobo into v_unit from bundle where bundle_id = v_bundle_id;

      select coalesce(sum(p.price_kobo * bi.quantity), 0), count(*)
        into v_list_total, v_member_cnt
        from bundle_item bi
        join product p on p.product_id = bi.product_id
       where bi.bundle_id = v_bundle_id;

      if v_member_cnt = 0 then
        raise exception 'BUNDLE_NOT_FOUND'
          using detail = json_build_object('bundle_id', v_bundle_id,
                                           'reason', 'no members')::text;
      end if;

      v_allocated := 0;

      for v_member in
        select bi.product_id, bi.quantity, bi.slot_index, p.price_kobo
          from bundle_item bi
          join product p on p.product_id = bi.product_id
         where bi.bundle_id = v_bundle_id
         order by bi.slot_index
      loop
        -- Proportional to list price. When every member is free the proportion
        -- is undefined, so split the bundle price evenly instead of dividing
        -- by zero.
        if v_list_total > 0 then
          v_share := floor(
            (v_unit::numeric * (v_member.price_kobo * v_member.quantity)) / v_list_total
          )::bigint;
        else
          v_share := floor(v_unit::numeric / v_member_cnt)::bigint;
        end if;

        v_allocated := v_allocated + v_share * v_bundle_qty;

        insert into order_item (order_id, product_id, bundle_id, quantity, unit_price_kobo)
        values (v_order.order_id, v_member.product_id, v_bundle_id,
                v_member.quantity * v_bundle_qty,
                (v_share / greatest(v_member.quantity, 1)));
      end loop;

      -- Give the rounding remainder to the lowest slot so the lines sum
      -- exactly to what was charged. A receipt that is two kobo out is a
      -- receipt nobody trusts.
      if v_allocated <> v_unit * v_bundle_qty then
        update order_item oi
           set unit_price_kobo = oi.unit_price_kobo
               + ((v_unit * v_bundle_qty - v_allocated) / greatest(oi.quantity, 1))
         where oi.order_item_id = (
           select oi2.order_item_id
             from order_item oi2
             join bundle_item bi on bi.bundle_id = oi2.bundle_id
                                and bi.product_id = oi2.product_id
            where oi2.order_id = v_order.order_id
              and oi2.bundle_id = v_bundle_id
            order by bi.slot_index
            limit 1);
      end if;
    else
      insert into order_item (order_id, product_id, quantity, unit_price_kobo)
      select v_order.order_id, p.product_id,
             (v_line.line->>'quantity')::integer, p.price_kobo
      from product p where p.product_id = (v_line.line->>'product_id')::uuid;
    end if;
  end loop;

  -- reserve_products aggregates by product_id, so a bundle member the customer
  -- also bought separately reserves the combined total exactly once.
  perform reserve_products(v_order.order_id, v_reserve, v_expires);
  if coalesce(p_gas_kg,0) > 0 then
    perform reserve_gas(v_order.order_id, p_depot_id, p_gas_kg, v_expires);
  end if;

  return v_order;
end $$;


-- ----------------------------------------------------------------------------
-- ITEM 8 — redeem_qr silently no-opped when no delivery row existed
--
-- A delivery order only gets a delivery row when an admin assigns a driver. If
-- a driver somehow scanned first, the UPDATE matched nothing: the order was
-- marked fulfilled, the stock was deducted, and no delivery record survived to
-- say who took it or when.
--
-- Refusing would be wrong — the customer is standing there with the gas. The
-- row is created instead, flagged in the audit log so the missing assignment
-- surfaces rather than disappearing.
-- ----------------------------------------------------------------------------

create or replace function redeem_qr(
  p_token_hash char(64),
  p_scanner_id uuid,
  p_expected   fulfillment_type default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_qr       qr_token;
  v_order    "order";
  v_claimed  uuid;
  v_delivery uuid;
  v_driver   uuid;
begin
  select * into v_qr from qr_token where token_hash = p_token_hash;
  if not found then
    raise exception 'QR_INVALID';
  end if;

  select * into v_order from "order" where "order".order_id = v_qr.order_id for update;

  if v_order.status in ('cancelled','expired') then
    raise exception 'ORDER_ALREADY_CLOSED'
      using detail = json_build_object('order_status', v_order.status,
                                       'order_number', v_order.order_number)::text;
  end if;

  if v_order.status = 'fulfilled' then
    raise exception 'ALREADY_FULFILLED'
      using detail = json_build_object('order_number', v_order.order_number,
                                       'fulfilled_at', v_order.fulfilled_at)::text;
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'UNPAID'
      using detail = json_build_object('order_number', v_order.order_number,
                                       'total_kobo', v_order.total_kobo)::text;
  end if;

  if p_expected is not null and v_order.fulfillment_type <> p_expected then
    raise exception 'WRONG_FULFILLMENT_TYPE'
      using detail = json_build_object('expected', p_expected,
                                       'actual', v_order.fulfillment_type)::text;
  end if;

  if v_qr.expires_at is not null and v_qr.expires_at < now() then
    update qr_token set status = 'expired' where qr_id = v_qr.qr_id;
    raise exception 'QR_EXPIRED';
  end if;

  -- The atomic claim. A second scanner matches zero rows.
  update qr_token
     set status = 'scanned', scanned_at = now(), scanned_by = p_scanner_id
   where qr_id = v_qr.qr_id and status = 'unscanned'
   returning qr_id into v_claimed;

  if v_claimed is null then
    raise exception 'QR_ALREADY_SCANNED'
      using detail = json_build_object('order_number', v_order.order_number,
                                       'scanned_at', v_qr.scanned_at)::text;
  end if;

  perform fulfill_reservations(v_order.order_id);

  update "order"
     set status = 'fulfilled', fulfilled_at = now()
   where "order".order_id = v_order.order_id;

  if v_order.fulfillment_type = 'delivery' then
    select delivery_id into v_delivery from delivery
     where delivery.order_id = v_order.order_id;

    if v_delivery is null then
      -- No assignment was ever made. Record the handover anyway and flag it.
      select d.driver_id into v_driver from driver d
       where d.profile_id = p_scanner_id;

      insert into delivery (order_id, driver_id, delivery_address, zone_id,
                            status, assigned_at, delivered_at)
      values (v_order.order_id, v_driver,
              coalesce(v_order.delivery_address, 'Not recorded'),
              v_order.zone_id, 'delivered', now(), now());

      insert into audit_log (actor_id, action, entity_type, entity_id, note)
      values (p_scanner_id, 'delivery.unassigned_fulfilment', 'order',
              v_order.order_id,
              'Delivered with no prior driver assignment. Check dispatch.');
    else
      update delivery
         set status = 'delivered', delivered_at = now()
       where delivery_id = v_delivery;
    end if;

    update driver d
       set completed_deliveries = d.completed_deliveries + 1
      from delivery dl
     where dl.order_id = v_order.order_id and dl.driver_id = d.driver_id;
  end if;

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (p_scanner_id, 'qr.fulfilled', 'order', v_order.order_id,
          json_build_object('order_number', v_order.order_number)::jsonb);

  return jsonb_build_object(
    'order_id',         v_order.order_id,
    'order_number',     v_order.order_number,
    'fulfillment_type', v_order.fulfillment_type,
    'fulfilled',        true);
end $$;
