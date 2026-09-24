-- ============================================================================
-- U2GAS — 0004 order, payment and QR functions
--
-- Each function below is one transaction. The API layer calls exactly one of
-- them per request; it never stitches two together, because a crash between
-- two calls would strand reserved stock.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Gas order. Price, fee and reservation are all settled in one transaction.
-- (Spec 15-17)
-- ----------------------------------------------------------------------------

create or replace function create_gas_order(
  p_depot_id     uuid,
  p_kg           numeric,
  p_fulfillment  fulfillment_type,
  p_user_id      uuid    default null,
  p_zone_id      uuid    default null,
  p_address      text    default null,
  p_channel      order_channel default 'online',
  p_guest_name   text    default null,
  p_guest_phone  text    default null,
  p_staff_id     uuid    default null,
  p_hold_minutes integer default 30
) returns "order"
language plpgsql security definer set search_path = public as $$
declare
  v_rate      bigint;
  v_fee       bigint := 0;
  v_gas_total bigint;
  v_expires   timestamptz;
  v_order     "order";
begin
  v_expires := now() + make_interval(mins => greatest(p_hold_minutes, 1));

  -- Freeze the rate. Old orders must never be re-priced. (Spec 34)
  select rate_kobo_per_kg into v_rate from gas_stock where depot_id = p_depot_id;
  if v_rate is null then
    raise exception 'DEPOT_NOT_FOUND';
  end if;

  if p_fulfillment = 'delivery' then
    if p_zone_id is null then
      raise exception 'ZONE_REQUIRED';
    end if;
    select fee_kobo into v_fee from delivery_zone
     where zone_id = p_zone_id and active;
    if v_fee is null then
      raise exception 'ZONE_NOT_SERVED'
        using detail = json_build_object('zone_id', p_zone_id)::text;
    end if;
  end if;

  v_gas_total := round(p_kg * v_rate);

  insert into "order" (
    depot_id, user_id, channel, order_type,
    guest_name, guest_phone,
    gas_amount_kg, rate_at_purchase, gas_subtotal_kobo,
    delivery_fee_kobo, total_kobo,
    fulfillment_type, zone_id, delivery_address,
    status, payment_status, hold_expires_at, reserved_at,
    recorded_by_staff_id
  ) values (
    p_depot_id, p_user_id, p_channel, 'gas',
    p_guest_name, p_guest_phone,
    p_kg, v_rate, v_gas_total,
    v_fee, v_gas_total + v_fee,
    p_fulfillment, p_zone_id, p_address,
    'pending', 'pending', v_expires, now(),
    p_staff_id
  ) returning * into v_order;

  -- Raises INSUFFICIENT_GAS and rolls the whole thing back if the tank moved
  -- between the customer seeing availability and confirming.
  perform reserve_gas(v_order.order_id, p_depot_id, p_kg, v_expires);

  return v_order;
end $$;

-- ----------------------------------------------------------------------------
-- Accessory / mixed order.
--
-- p_lines is a mix of product and bundle lines:
--   [{"kind":"product","product_id":"...","quantity":2},
--    {"kind":"bundle","bundle_id":"...","quantity":1}]
-- (Spec 26-27, Addendum 71.5)
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
  v_line       record;
  v_expires    timestamptz;
  v_fee        bigint := 0;
  v_items_total bigint := 0;
  v_gas_total  bigint := 0;
  v_rate       bigint;
  v_order      "order";
  v_reserve    jsonb := '[]'::jsonb;
  v_type       order_type;
  v_unit       bigint;
  v_bundle_qty integer;
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

  -- Price every line and build the flat product list the reserver needs.
  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) e(line)
  loop
    if v_line.line->>'kind' = 'bundle' then
      v_bundle_qty := (v_line.line->>'quantity')::integer;

      select price_kobo into v_unit from bundle
       where bundle_id = (v_line.line->>'bundle_id')::uuid and active;
      if v_unit is null then
        raise exception 'BUNDLE_NOT_FOUND'
          using detail = json_build_object('bundle_id', v_line.line->>'bundle_id')::text;
      end if;

      v_items_total := v_items_total + v_unit * v_bundle_qty;
      v_reserve := v_reserve || expand_bundle_items(
        (v_line.line->>'bundle_id')::uuid, v_bundle_qty);
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

  -- Order lines, with bundle membership recorded for the receipt.
  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) e(line)
  loop
    if v_line.line->>'kind' = 'bundle' then
      insert into order_item (order_id, product_id, bundle_id, quantity, unit_price_kobo)
      select v_order.order_id, bi.product_id, bi.bundle_id,
             bi.quantity * (v_line.line->>'quantity')::integer,
             p.price_kobo
      from bundle_item bi
      join product p on p.product_id = bi.product_id
      where bi.bundle_id = (v_line.line->>'bundle_id')::uuid;
    else
      insert into order_item (order_id, product_id, quantity, unit_price_kobo)
      select v_order.order_id, p.product_id,
             (v_line.line->>'quantity')::integer, p.price_kobo
      from product p where p.product_id = (v_line.line->>'product_id')::uuid;
    end if;
  end loop;

  -- Reserve everything, or nothing.
  perform reserve_products(v_order.order_id, v_reserve, v_expires);
  if coalesce(p_gas_kg,0) > 0 then
    perform reserve_gas(v_order.order_id, p_depot_id, p_gas_kg, v_expires);
  end if;

  return v_order;
end $$;

-- ----------------------------------------------------------------------------
-- Payment confirmation.
--
-- Idempotent on (provider, provider_reference) via the unique index. A repeat
-- webhook finds the payment already paid and returns without touching stock,
-- issuing a second QR, or sending a second email. (Spec 20)
-- ----------------------------------------------------------------------------

create or replace function confirm_payment(
  p_order_id    uuid,
  p_provider    text,
  p_reference   text,
  p_amount_kobo bigint,
  p_method      payment_method,
  p_payload     jsonb   default null,
  p_staff_id    uuid    default null,
  p_tendered    bigint  default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order       "order";
  v_payment_id  uuid;
  v_existing    payment;
  v_change      bigint;
begin
  -- Short-circuit on a duplicate delivery before taking any write locks.
  if p_reference is not null then
    select * into v_existing from payment
     where provider = p_provider and provider_reference = p_reference;
    if found then
      return jsonb_build_object(
        'payment_id', v_existing.payment_id, 'already_processed', true);
    end if;
  end if;

  select * into v_order from "order" where order_id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.status in ('cancelled','expired') then
    -- The money arrived after we released the stock. Do not silently keep it.
    -- Record it as paid against a dead order so reconciliation can refund. (Spec 19)
    insert into payment (order_id, provider, provider_reference, amount_kobo,
                         method, status, raw_payload, paid_at, recorded_by_staff_id)
    values (p_order_id, p_provider, p_reference, p_amount_kobo,
            p_method, 'paid', p_payload, now(), p_staff_id)
    returning payment.payment_id into v_payment_id;

    insert into audit_log (action, entity_type, entity_id, after, note)
    values ('payment.orphaned', 'order', p_order_id,
            json_build_object('payment_id', v_payment_id, 'amount_kobo', p_amount_kobo)::jsonb,
            'Payment captured for an order already ' || v_order.status || '. Refund required.');

    raise exception 'ORDER_ALREADY_CLOSED'
      using detail = json_build_object(
        'order_status', v_order.status, 'payment_id', v_payment_id)::text;
  end if;

  if v_order.payment_status = 'paid' then
    select * into v_existing from payment
     where order_id = p_order_id and status = 'paid' limit 1;
    return jsonb_build_object(
      'payment_id', v_existing.payment_id, 'already_processed', true);
  end if;

  if p_amount_kobo < v_order.total_kobo then
    raise exception 'UNDERPAID'
      using detail = json_build_object(
        'expected_kobo', v_order.total_kobo, 'received_kobo', p_amount_kobo)::text;
  end if;

  if p_method = 'cash' then
    if p_tendered is null or p_tendered < v_order.total_kobo then
      raise exception 'INSUFFICIENT_TENDER'
        using detail = json_build_object(
          'expected_kobo', v_order.total_kobo, 'tendered_kobo', p_tendered)::text;
    end if;
    v_change := p_tendered - v_order.total_kobo;
  end if;

  insert into payment (order_id, provider, provider_reference, amount_kobo,
                       method, status, amount_tendered_kobo, change_due_kobo,
                       raw_payload, paid_at, recorded_by_staff_id)
  values (p_order_id, p_provider, p_reference, p_amount_kobo,
          p_method, 'paid', p_tendered, v_change,
          p_payload, now(), p_staff_id)
  returning payment.payment_id into v_payment_id;

  update "order"
     set payment_status = 'paid',
         status = 'confirmed',
         hold_expires_at = null      -- a paid order no longer expires
   where order_id = p_order_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (null, 'payment.confirmed', 'order', p_order_id,
          json_build_object('payment_id', v_payment_id,
                            'method', p_method,
                            'amount_kobo', p_amount_kobo)::jsonb);

  return jsonb_build_object('payment_id', v_payment_id, 'already_processed', false);
end $$;

-- ----------------------------------------------------------------------------
-- QR issuance. Only the hash is stored, so a database leak does not hand an
-- attacker working collection codes. (Spec 21)
-- ----------------------------------------------------------------------------

create or replace function issue_qr(
  p_order_id   uuid,
  p_token_hash char(64),
  p_valid_hours integer default 72
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_qr uuid;
  v_order "order";
begin
  select * into v_order from "order" where order_id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status in ('cancelled','expired') then
    raise exception 'ORDER_ALREADY_CLOSED'
      using detail = json_build_object('order_status', v_order.status)::text;
  end if;

  -- Replace any previous live token; an order has exactly one usable QR.
  update qr_token set status = 'void'
   where order_id = p_order_id and status = 'unscanned';

  insert into qr_token (order_id, token_hash, expires_at)
  values (p_order_id, p_token_hash, now() + make_interval(hours => p_valid_hours))
  returning qr_id into v_qr;

  return v_qr;
end $$;

-- ----------------------------------------------------------------------------
-- QR redemption. This is the double-scan guard. (Spec 22-23)
--
-- The single UPDATE ... WHERE status = 'unscanned' is the whole trick: two
-- concurrent scanners both try it, the second one blocks, re-reads the row
-- after the first commits, no longer matches, and gets zero rows.
-- ----------------------------------------------------------------------------

create or replace function redeem_qr(
  p_token_hash char(64),
  p_scanner_id uuid,
  p_expected   fulfillment_type default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_qr    qr_token;
  v_order "order";
  v_claimed uuid;
begin
  select * into v_qr from qr_token where token_hash = p_token_hash;
  if not found then
    raise exception 'QR_INVALID';
  end if;

  select * into v_order from "order" where "order".order_id = v_qr.order_id for update;

  -- Validate everything before claiming, so the error is specific.
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

  -- Atomic claim.
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
    update delivery
       set status = 'delivered', delivered_at = now()
     where delivery.order_id = v_order.order_id;

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

-- ----------------------------------------------------------------------------
-- Cancellation. Releases stock and closes the order in one step.
-- ----------------------------------------------------------------------------

create or replace function cancel_order(
  p_order_id uuid,
  p_actor_id uuid default null,
  p_reason   text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_order "order";
  v_released integer;
begin
  select * into v_order from "order" where order_id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status = 'fulfilled' then
    raise exception 'ALREADY_FULFILLED';
  end if;
  if v_order.status in ('cancelled','expired') then
    return 0;                                   -- idempotent
  end if;

  v_released := release_reservations(p_order_id, 'released');

  update qr_token set status = 'void'
   where order_id = p_order_id and status = 'unscanned';

  update "order"
     set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
   where order_id = p_order_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, note)
  values (p_actor_id, 'order.cancelled', 'order', p_order_id, p_reason);

  return v_released;
end $$;
