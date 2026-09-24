-- ============================================================================
-- U2GAS — 0005 scheduled-job and bundle functions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Hold expiry sweep (spec 37).
--
-- Safe to run every minute, twice at once, or twice in a row. Three things
-- make that true:
--   1. FOR UPDATE SKIP LOCKED — two concurrent runs never fight over a row.
--   2. The unpaid check is re-read inside the lock, so a payment landing
--      mid-sweep wins and the order is left alone.
--   3. release_reservations only touches reservations still marked 'reserved'.
-- ----------------------------------------------------------------------------

create or replace function expire_order_holds(p_limit integer default 500)
returns table (expired_orders integer, released_reservations integer)
language plpgsql security definer set search_path = public as $$
declare
  v_order   record;
  v_orders  integer := 0;
  v_res     integer := 0;
begin
  for v_order in
    select order_id, order_number, payment_status, status
    from   "order"
    where  hold_expires_at is not null
      and  hold_expires_at < now()
      and  payment_status = 'pending'
      and  status in ('pending','confirmed')
    order  by hold_expires_at
    limit  p_limit
    for update skip locked
  loop
    -- Re-check under the lock. A Paystack webhook may have landed in the
    -- microseconds since the outer query ran.
    if v_order.payment_status <> 'pending' then
      continue;
    end if;

    v_res := v_res + release_reservations(v_order.order_id, 'expired');

    update qr_token set status = 'void'
     where order_id = v_order.order_id and status = 'unscanned';

    update "order"
       set status = 'expired',
           cancelled_at = now(),
           cancel_reason = 'Hold expired before payment',
           hold_expires_at = null        -- so a re-run cannot match it again
     where order_id = v_order.order_id;

    insert into audit_log (action, entity_type, entity_id, after, note)
    values ('order.hold_expired', 'order', v_order.order_id,
            json_build_object('order_number', v_order.order_number)::jsonb,
            'Released by scheduled sweep');

    insert into notification (profile_id, order_id, kind, title, body)
    select o.user_id, o.order_id, 'order.expired',
           'Your hold expired',
           'Order ' || o.order_number || ' was released because it was not paid in time.'
    from "order" o
    where o.order_id = v_order.order_id and o.user_id is not null;

    v_orders := v_orders + 1;
  end loop;

  return query select v_orders, v_res;
end $$;

-- ----------------------------------------------------------------------------
-- Storage cleanup. Deleted assets are removed from the bucket by the Edge
-- Function; this hands it the list and clears the rows once it confirms.
-- ----------------------------------------------------------------------------

create or replace function claim_deleted_assets(p_limit integer default 200)
returns table (asset_id uuid, bucket text, base_path text)
language sql security definer set search_path = public as $$
  select asset_id, bucket, base_path
  from   image_asset
  where  deleted_at is not null and deleted_at < now() - interval '1 hour'
  order  by deleted_at
  limit  p_limit
$$;

create or replace function purge_assets(p_ids uuid[])
returns integer language sql security definer set search_path = public as $$
  with gone as (delete from image_asset where asset_id = any(p_ids) returning 1)
  select count(*)::integer from gone
$$;

-- ----------------------------------------------------------------------------
-- Bundle publishing (Addendum 71.3).
--
-- All-or-nothing. Compatibility is checked inside the transaction, so two
-- admins cannot race a product edit past the check.
--
-- p_items: [{"product_id":"...","quantity":1,"slot_index":1}, ...]
-- ----------------------------------------------------------------------------

create or replace function publish_bundle(
  p_name        text,
  p_price_kobo  bigint,
  p_items       jsonb,
  p_created_by  uuid,
  p_description text default null,
  p_image_asset uuid default null,
  p_override_rule uuid default null,
  p_override_reason text default null
) returns bundle
language plpgsql security definer set search_path = public as $$
declare
  v_bundle    bundle;
  v_ids       uuid[];
  v_violation record;
  v_count     integer;
  v_role      app_role;
begin
  v_count := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  if v_count < 2 or v_count > 3 then
    raise exception 'BUNDLE_SIZE'
      using detail = json_build_object('items', v_count, 'min', 2, 'max', 3)::text;
  end if;

  select array_agg((e->>'product_id')::uuid order by (e->>'slot_index')::int)
    into v_ids
  from jsonb_array_elements(p_items) e;

  if array_length(v_ids,1) <> cardinality(array(select distinct unnest(v_ids))) then
    raise exception 'BUNDLE_DUPLICATE_ITEM';
  end if;

  -- Lock the members so their attributes cannot change under the check.
  perform 1 from product where product_id = any(v_ids) order by product_id for update;

  select * into v_violation
  from check_bundle_compatibility(v_ids) limit 1;

  if found then
    if p_override_rule is null then
      -- Block, and name the conflict exactly as the red stamp will show it.
      raise exception 'INCOMPATIBLE_ITEMS'
        using detail = json_build_object(
          'rule_id',  v_violation.rule_id,
          'product_a', v_violation.product_a,
          'product_b', v_violation.product_b,
          'message',  v_violation.message)::text;
    end if;

    -- Override is manager-only and always leaves a trail. (Addendum 71.2)
    select role into v_role from profile where profile_id = p_created_by;
    if v_role not in ('manager','admin') then
      raise exception 'OVERRIDE_FORBIDDEN'
        using detail = json_build_object('role', v_role)::text;
    end if;
    if p_override_reason is null or length(trim(p_override_reason)) < 10 then
      raise exception 'OVERRIDE_REASON_REQUIRED';
    end if;
  end if;

  insert into bundle (name, description, price_kobo, image_asset, created_by,
                      override_rule_id, override_reason)
  values (p_name, p_description, p_price_kobo, p_image_asset, p_created_by,
          p_override_rule, p_override_reason)
  returning * into v_bundle;

  insert into bundle_item (bundle_id, product_id, quantity, slot_index)
  select v_bundle.bundle_id,
         (e->>'product_id')::uuid,
         coalesce((e->>'quantity')::integer, 1),
         (e->>'slot_index')::smallint
  from jsonb_array_elements(p_items) e;

  insert into audit_log (actor_id, action, entity_type, entity_id, after, note)
  values (p_created_by,
          case when p_override_rule is null then 'bundle.published'
               else 'bundle.published_with_override' end,
          'bundle', v_bundle.bundle_id,
          json_build_object('name', p_name, 'items', v_ids)::jsonb,
          p_override_reason);

  return v_bundle;
end $$;

-- ----------------------------------------------------------------------------
-- Shop listing. One query serves the whole grid, including bundles, so the
-- customer route hits a single endpoint on first paint. (Addendum 73.2)
-- ----------------------------------------------------------------------------

create or replace view shop_listing as
  select 'product'::text as kind,
         p.product_id    as id,
         p.name, p.subtitle, p.price_kobo,
         p.stock_qty - p.reserved_qty as available,
         ia.base_path    as image_path,
         c.slug          as category
  from   product p
  left join image_asset ia on ia.asset_id = p.image_asset and ia.deleted_at is null
  left join product_category c on c.category_id = p.category_id
  where  p.active
union all
  select 'bundle',
         b.bundle_id,
         b.name, null, b.price_kobo,
         bundle_available_qty(b.bundle_id),
         ia.base_path,
         'bundles'
  from   bundle b
  left join image_asset ia on ia.asset_id = b.image_asset and ia.deleted_at is null
  where  b.active;
