-- ============================================================================
-- U2GAS — 0010 guest access and bundle line pricing
-- ============================================================================


-- ----------------------------------------------------------------------------
-- FIX 1 — guests could order and pay, then never see the order again
--
-- The whole checkout flow accepts a guest: name and phone, no account. But
-- order_owner_read requires user_id = current_profile_id(), which is null for
-- an anonymous caller, and the QR endpoint required a logged-in owner.
--
-- So a guest paid, was redirected to /orders/<id>, and got NO SUCH ORDER. The
-- money was taken and the gas was unreachable.
--
-- Fix: a per-order capability token. Random, returned exactly once at
-- checkout, stored only as a hash. Holding it proves nothing except that you
-- are the person who placed this one order, which is precisely the claim we
-- need. It grants no access to anything else.
-- ----------------------------------------------------------------------------

alter table "order"
  add column if not exists guest_token_hash char(64),
  add column if not exists guest_token_expires_at timestamptz;

create unique index if not exists order_guest_token_idx
  on "order" (guest_token_hash) where guest_token_hash is not null;

comment on column "order".guest_token_hash is
  'SHA-256 of a capability token handed to guests at checkout. The plaintext is
   returned once and never stored, so a database leak yields no usable tokens.';

create or replace function set_guest_token(
  p_order_id  uuid,
  p_hash      char(64),
  p_days      integer default 30
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update "order"
     set guest_token_hash = p_hash,
         guest_token_expires_at = now() + make_interval(days => p_days)
   where order_id = p_order_id
     and user_id is null;      -- accounts do not need one

  if not found then
    -- Either the order does not exist, or it belongs to a signed-in customer
    -- who reaches it through RLS instead. Neither is an error.
    return;
  end if;
end $$;

/**
 * Resolve an order from a guest token. Returns the order id or null.
 * Deliberately takes the hash, so the plaintext never reaches the database
 * logs.
 */
create or replace function order_for_guest_token(p_hash char(64))
returns uuid
language sql security definer set search_path = public stable as $$
  select order_id from "order"
   where guest_token_hash = p_hash
     and (guest_token_expires_at is null or guest_token_expires_at > now())
$$;


-- ----------------------------------------------------------------------------
-- FIX 2 — a bundle's receipt did not add up
--
-- create_accessory_order charged the bundle price but wrote each member's own
-- price onto its order_item row. Every receipt in the product builds its lines
-- from order_item, so a customer buying a kit discounted from ₦46,500 to
-- ₦40,000 saw three lines totalling ₦46,500 above a total of ₦40,000.
--
-- The fix allocates the bundle price across its members in proportion to their
-- list prices, giving the rounding remainder to the first slot so the lines sum
-- exactly. The discount is visible on every line rather than hidden.
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
  v_bundle_qty  integer;
  v_member      record;
  v_list_total  bigint;
  v_allocated   bigint;
  v_share       bigint;
  v_first       boolean;
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

  -- Price every line and flatten bundles into products for the reserver.
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

  -- Order lines.
  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) e(line)
  loop
    if v_line.line->>'kind' = 'bundle' then
      v_bundle_qty := (v_line.line->>'quantity')::integer;

      select price_kobo into v_unit from bundle
       where bundle_id = (v_line.line->>'bundle_id')::uuid;

      -- What the members would cost separately, for the proportion.
      select sum(p.price_kobo * bi.quantity) into v_list_total
        from bundle_item bi
        join product p on p.product_id = bi.product_id
       where bi.bundle_id = (v_line.line->>'bundle_id')::uuid;

      v_allocated := 0;
      v_first := true;

      for v_member in
        select bi.product_id, bi.quantity, bi.slot_index, p.price_kobo
          from bundle_item bi
          join product p on p.product_id = bi.product_id
         where bi.bundle_id = (v_line.line->>'bundle_id')::uuid
         order by bi.slot_index desc          -- remainder lands on slot 1
      loop
        if v_first then
          -- Placeholder; the true first slot is handled after the loop.
          v_first := false;
        end if;

        v_share := floor(
          (v_unit::numeric * (v_member.price_kobo * v_member.quantity)) / v_list_total
        )::bigint;
        v_allocated := v_allocated + v_share * v_bundle_qty;

        insert into order_item (order_id, product_id, bundle_id, quantity, unit_price_kobo)
        values (v_order.order_id, v_member.product_id,
                (v_line.line->>'bundle_id')::uuid,
                v_member.quantity * v_bundle_qty,
                -- unit price per member unit
                case when v_member.quantity = 0 then 0
                     else (v_share / greatest(v_member.quantity, 1)) end);
      end loop;

      -- Hand the rounding remainder to slot 1 so the lines sum exactly to the
      -- bundle price. Without this a three-way split can be a kobo or two out,
      -- and a receipt that does not add up is a receipt nobody trusts.
      if v_allocated <> v_unit * v_bundle_qty then
        update order_item
           set unit_price_kobo = unit_price_kobo
               + ((v_unit * v_bundle_qty - v_allocated) / greatest(quantity, 1))
         where order_item_id = (
           select oi.order_item_id
             from order_item oi
             join bundle_item bi
               on bi.product_id = oi.product_id
              and bi.bundle_id = oi.bundle_id
            where oi.order_id = v_order.order_id
              and oi.bundle_id = (v_line.line->>'bundle_id')::uuid
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


-- ----------------------------------------------------------------------------
-- FIX 3 — notifications for the events that had none
--
-- Spec 49 lists ten notifiable events. Only hold expiry created a row. These
-- triggers cover the rest at the source, so a notification cannot be missed by
-- an API route forgetting to send one.
-- ----------------------------------------------------------------------------

create or replace function notify_order_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then
    return new;                              -- guests are reached by SMS/phone
  end if;

  if old.payment_status is distinct from new.payment_status
     and new.payment_status = 'paid' then
    insert into notification (profile_id, order_id, kind, title, body)
    values (new.user_id, new.order_id, 'order.confirmed',
            'Order confirmed',
            'We have your payment for ' || new.order_number || '. ' ||
            case when new.fulfillment_type = 'pickup'
                 then 'Show your code at the depot.'
                 else 'We will let you know when a driver is on the way.' end);
  end if;

  if old.status is distinct from new.status and new.status = 'fulfilled' then
    insert into notification (profile_id, order_id, kind, title, body)
    values (new.user_id, new.order_id, 'order.fulfilled',
            'All done',
            'Order ' || new.order_number || ' is complete. Thank you.');
  end if;

  if old.status is distinct from new.status and new.status = 'cancelled' then
    insert into notification (profile_id, order_id, kind, title, body)
    values (new.user_id, new.order_id, 'order.cancelled',
            'Order cancelled',
            'Order ' || new.order_number || ' was cancelled. ' ||
            coalesce(new.cancel_reason, ''));
  end if;

  return new;
end $$;

drop trigger if exists order_notify on "order";
create trigger order_notify
  after update on "order"
  for each row execute function notify_order_change();


create or replace function notify_delivery_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_number text;
begin
  select o.user_id, o.order_number into v_user, v_number
    from "order" o where o.order_id = new.order_id;

  if v_user is null then return new; end if;

  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into notification (profile_id, order_id, kind, title, body)
    select v_user, new.order_id, 'delivery.' || new.status,
           case new.status
             when 'assigned'    then 'A driver has your order'
             when 'en_route'    then 'Your driver is on the way'
             when 'delivered'   then 'Delivered'
             when 'failed'      then 'We could not deliver'
             when 'rescheduled' then 'We will try again'
             when 'returned'    then 'Your order went back to the depot'
           end,
           v_number || ' — ' || coalesce(new.failure_reason, new.status::text);
  end if;

  return new;
end $$;

drop trigger if exists delivery_notify on delivery;
create trigger delivery_notify
  after insert or update on delivery
  for each row execute function notify_delivery_change();


-- ----------------------------------------------------------------------------
-- Email drain. The Edge Function claims a batch, sends through Resend, and
-- marks them. Keeping the claim in SQL means two concurrent runs cannot send
-- the same message twice.
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
       and n.created_at > now() - interval '2 days'   -- do not send stale news
     order by n.created_at
     limit p_limit
     for update of n skip locked
  )
  update notification n
     set emailed_at = now()
    from claimed c
    join profile p2 on true
   where n.notification_id = c.notification_id
     and p2.profile_id = n.profile_id
  returning n.notification_id, p2.email::text, n.title, n.body, n.kind,
            (select o.order_number from "order" o where o.order_id = n.order_id);
end $$;
