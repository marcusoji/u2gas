-- ============================================================================
-- U2GAS — 0013 settings enforcement in the order path
--
-- Parts 19 and 20. The Worker now passes p_hold_minutes = null and the
-- database reads app_setting itself, so the website, the walk-in counter and
-- any future channel cannot drift apart or be talked past by a caller.
-- ============================================================================

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
  p_hold_minutes integer default null
) returns "order"
language plpgsql security definer set search_path = public as $$
declare
  v_rate      bigint;
  v_fee       bigint := 0;
  v_gas_total bigint;
  v_expires   timestamptz;
  v_hold      integer;
  v_order     "order";
begin
  if p_kg is null or p_kg <= 0 then
    raise exception 'INVALID_QUANTITY' using detail = '{"field":"kg"}';
  end if;

  -- Part 19: the cap is enforced here, not in the browser and not in the
  -- Worker, so no caller can exceed it however the request is shaped.
  perform assert_gas_within_limit(p_kg);

  -- Part 20: one authoritative hold duration for every channel. The argument
  -- is ignored unless it is explicitly supplied by an operator override.
  v_hold := coalesce(p_hold_minutes, effective_hold_minutes());
  v_expires := now() + make_interval(mins => greatest(v_hold, 1));

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

  perform reserve_gas(v_order.order_id, p_depot_id, p_kg, v_expires);

  return v_order;
end $$;


-- Same two changes for the accessory path.
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
  p_hold_minutes integer default null
) returns "order"
language plpgsql security definer set search_path = public as $$
declare
  v_line        record;
  v_expires     timestamptz;
  v_hold        integer;
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

  if coalesce(p_gas_kg,0) > 0 then
    perform assert_gas_within_limit(p_gas_kg);
  end if;

  v_hold := coalesce(p_hold_minutes, effective_hold_minutes());
  v_expires := now() + make_interval(mins => greatest(v_hold, 1));
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

  perform reserve_products(v_order.order_id, v_reserve, v_expires);
  if coalesce(p_gas_kg,0) > 0 then
    perform reserve_gas(v_order.order_id, p_depot_id, p_gas_kg, v_expires);
  end if;

  return v_order;
end $$;


-- QR lifetime is configurable too, and was equally ignored.
create or replace function issue_qr(
  p_order_id    uuid,
  p_token_hash  char(64),
  p_valid_hours integer default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_qr    uuid;
  v_order "order";
  v_hours integer;
begin
  select * into v_order from "order" where order_id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status in ('cancelled','expired') then
    raise exception 'ORDER_ALREADY_CLOSED'
      using detail = json_build_object('order_status', v_order.status)::text;
  end if;

  v_hours := coalesce(p_valid_hours, setting_number('qr_valid_hours', 72)::integer);

  update qr_token set status = 'void'
   where order_id = p_order_id and status = 'unscanned';

  insert into qr_token (order_id, token_hash, expires_at)
  values (p_order_id, p_token_hash, now() + make_interval(hours => v_hours))
  returning qr_id into v_qr;

  return v_qr;
end $$;


-- The redefinitions above re-create these functions, which resets their
-- permissions to the PUBLIC default. Lock them down again. (Part 8)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname in ('create_gas_order','create_accessory_order','issue_qr',
                         'setting_number','effective_hold_minutes',
                         'assert_gas_within_limit','cancel_order',
                         'claim_unsent_notifications','mark_notifications_sent',
                         'mark_notifications_failed','claim_idempotency',
                         'complete_idempotency','release_idempotency',
                         'purge_idempotency_keys','handle_new_auth_user',
                         'sync_auth_user_email')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
