-- ============================================================================
-- U2GAS — 0023: image assets are shared, cleanup is reference-safe, admin
--               writes are atomic, and order transitions are enforced.
--
-- 1. IMAGE ASSET OWNERSHIP
--
-- image_asset already deduplicates on (owner_type, sha256) while also carrying
-- a single owner_id. Those two facts contradict each other: the same picture
-- uploaded by two profiles collapses onto one row, and that row names only the
-- first uploader as its owner. The second uploader then holds a reference to a
-- row somebody else "owns".
--
-- The architecture already keeps references where they belong — profile.
-- avatar_asset, product.image_asset, bundle.image_asset and
-- stock_entry.photo_asset all point at image_asset. So assets are shared and
-- content-addressed, and owner_id was never an ownership claim. It is kept as
-- provenance only (who first uploaded it) and renamed so it cannot be read as
-- ownership, and nothing authorises on it.
--
-- 2. CLEANUP RACE
--
-- Every reference was ON DELETE SET NULL, so deleting an asset silently blanked
-- live references instead of being refused: a cleanup pass racing an upload
-- could delete a row the instant after something started pointing at it. The
-- references are now RESTRICT, which makes the database itself refuse to drop a
-- referenced asset, and the claim/purge pair re-checks references while holding
-- the row.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1.1  Provenance, not ownership.
-- ---------------------------------------------------------------------------

alter table image_asset rename column owner_id to uploaded_for;

comment on column image_asset.uploaded_for is
  'Provenance only: the entity this picture was first uploaded for. Assets are '
  'content-addressed and shared, so this is NOT an ownership claim and must '
  'never be used to authorise access. Live references live in '
  'profile.avatar_asset, product.image_asset, bundle.image_asset and '
  'stock_entry.photo_asset.';

comment on column image_asset.owner_type is
  'Storage namespace for the object path (products/, profiles/, ...), and part '
  'of the dedupe key so the same bytes in two namespaces keep separate objects.';

comment on index image_asset_dedupe is
  'Content addressing: one row per (namespace, sha256) among live assets. Two '
  'owners uploading the same picture share this row; neither owns it.';

drop index if exists image_owner_idx;
create index image_uploaded_for_idx
  on image_asset (owner_type, uploaded_for) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 1.2  A referenced asset cannot be deleted.
-- ---------------------------------------------------------------------------

alter table profile     drop constraint if exists profile_avatar_fk;
alter table profile
  add constraint profile_avatar_fk foreign key (avatar_asset)
  references image_asset(asset_id) on delete restrict;

do $$
declare r record;
begin
  -- product / bundle carry the column under the same name; find their
  -- constraints rather than assuming generated names.
  for r in
    select tc.table_name, tc.constraint_name
    from   information_schema.table_constraints tc
    join   information_schema.key_column_usage k
           on k.constraint_name = tc.constraint_name
    join   information_schema.constraint_column_usage u
           on u.constraint_name = tc.constraint_name
    where  tc.constraint_type = 'FOREIGN KEY'
      and  u.table_name = 'image_asset'
      and  tc.table_name in ('product', 'bundle', 'stock_entry')
  loop
    execute format('alter table %I drop constraint %I', r.table_name, r.constraint_name);
  end loop;
end $$;

alter table product
  add constraint product_image_fk foreign key (image_asset)
  references image_asset(asset_id) on delete restrict;

alter table bundle
  add constraint bundle_image_fk foreign key (image_asset)
  references image_asset(asset_id) on delete restrict;

alter table stock_entry
  add constraint stock_entry_photo_fk foreign key (photo_asset)
  references image_asset(asset_id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 1.3  Reference count, in one place.
-- ---------------------------------------------------------------------------

create or replace function image_asset_refs(p_asset uuid)
returns integer language sql stable security definer set search_path = public as $$
  select (select count(*) from profile     where avatar_asset = p_asset)
       + (select count(*) from product     where image_asset  = p_asset)
       + (select count(*) from bundle      where image_asset  = p_asset)
       + (select count(*) from stock_entry where photo_asset  = p_asset);
$$;

comment on function image_asset_refs(uuid) is
  'How many live entities point at this asset. Cleanup deletes only at zero.';

-- ---------------------------------------------------------------------------
-- 4.  Cleanup: reference-aware, idempotent, concurrency-safe.
--
-- claim_deleted_assets locks the rows it returns (SKIP LOCKED), so two runs of
-- the hourly job cannot claim the same asset, and an upload that adopts the
-- asset in between is blocked by the lock until the purge decides. purge_assets
-- re-checks the reference count under that lock and refuses any asset that
-- gained a reference, so running it twice — or against stale ids — is safe.
-- ---------------------------------------------------------------------------

create or replace function claim_deleted_assets(p_limit integer default 200)
returns table (asset_id uuid, bucket text, base_path text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidate as (
    select a.asset_id
    from   image_asset a
    where  a.deleted_at is not null
      and  a.deleted_at < now() - interval '1 hour'
      and  image_asset_refs(a.asset_id) = 0
    order  by a.deleted_at
    limit  p_limit
    for update skip locked
  )
  select a.asset_id, a.bucket, a.base_path
  from   image_asset a
  join   candidate c on c.asset_id = a.asset_id;
end $$;

create or replace function purge_assets(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_gone integer;
begin
  with locked as (
    select a.asset_id
    from   image_asset a
    where  a.asset_id = any(p_ids)
      and  a.deleted_at is not null
    for update
  ),
  unreferenced as (
    select l.asset_id from locked l where image_asset_refs(l.asset_id) = 0
  ),
  gone as (
    delete from image_asset
    where asset_id in (select asset_id from unreferenced)
    returning 1
  )
  select count(*)::integer into v_gone from gone;
  return v_gone;
end $$;

comment on function purge_assets(uuid[]) is
  'Deletes only soft-deleted, unreferenced assets, re-checked under a row lock. '
  'Idempotent: ids that are already gone, still referenced, or undeleted are '
  'skipped rather than failing the batch.';

-- Soft-deleting is likewise refused while something still points at the asset,
-- so an admin cannot orphan a live product image by "deleting" it.
create or replace function soft_delete_image_asset(p_asset uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_refs integer;
begin
  perform 1 from image_asset where asset_id = p_asset for update;
  if not found then
    return false;
  end if;
  select image_asset_refs(p_asset) into v_refs;
  if v_refs > 0 then
    raise exception 'asset still referenced' using errcode = 'P0017';
  end if;
  update image_asset set deleted_at = coalesce(deleted_at, now())
   where asset_id = p_asset;
  return true;
end $$;

-- ============================================================================
-- 3.  ORDER AND PAYMENT STATE TRANSITIONS
--
-- The statuses already exist and are not changed. What was missing was one
-- place that says which move is legal, enforced no matter which function or
-- route performs the write.
--
-- Two machines, because the schema has two: order.status is the fulfilment
-- track (pending -> confirmed -> processing -> fulfilled) and
-- order.payment_status is the money track (pending -> paid -> refunded). The
-- moves below are exactly the ones the existing functions perform:
--   settle_payment:  payment_status pending -> paid, status pending -> confirmed
--   complete_delivery/fulfil: status confirmed|processing -> fulfilled
--   cancel_order:    status pending|confirmed -> cancelled
--   expire holds:    status pending -> expired
--   refund:          payment_status paid|partially_refunded -> refunded
-- ============================================================================

create table if not exists order_transition (
  track       text not null check (track in ('fulfilment', 'payment')),
  from_status text not null,
  to_status   text not null,
  primary key (track, from_status, to_status)
);

comment on table order_transition is
  'The legal moves. A row here means from_status -> to_status is allowed on '
  'that track; anything absent is refused by enforce_order_transition().';

insert into order_transition (track, from_status, to_status) values
  -- fulfilment
  ('fulfilment', 'pending',    'confirmed'),
  ('fulfilment', 'pending',    'cancelled'),
  ('fulfilment', 'pending',    'expired'),
  ('fulfilment', 'confirmed',  'processing'),
  ('fulfilment', 'confirmed',  'fulfilled'),
  ('fulfilment', 'confirmed',  'cancelled'),
  ('fulfilment', 'processing', 'fulfilled'),
  ('fulfilment', 'processing', 'cancelled'),
  -- payment
  ('payment',    'pending',             'paid'),
  ('payment',    'pending',             'failed'),
  ('payment',    'failed',              'pending'),
  ('payment',    'failed',              'paid'),
  ('payment',    'paid',                'partially_refunded'),
  ('payment',    'paid',                'refunded'),
  ('payment',    'partially_refunded',  'refunded')
on conflict do nothing;

-- Refused by omission, which is the point of the table:
--   cancelled -> confirmed, expired -> confirmed   (a dead order cannot revive)
--   fulfilled -> pending / processing              (delivery cannot un-happen)
--   refunded  -> paid, refunded -> partially_refunded
--   cancelled/expired/fulfilled -> anything

create or replace function enforce_order_transition()
returns trigger language plpgsql as $$
begin
  -- Re-writing the same value is allowed: settle_payment and the delivery
  -- routes are idempotent by design and may replay the same state.
  if new.status is distinct from old.status then
    if not exists (
      select 1 from order_transition
      where track = 'fulfilment'
        and from_status = old.status::text
        and to_status   = new.status::text
    ) then
      raise exception 'illegal order transition % -> %', old.status, new.status
        using errcode = 'P0018';
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status then
    if not exists (
      select 1 from order_transition
      where track = 'payment'
        and from_status = old.payment_status::text
        and to_status   = new.payment_status::text
    ) then
      raise exception 'illegal payment transition % -> %',
        old.payment_status, new.payment_status using errcode = 'P0019';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists order_transition_guard on "order";
create trigger order_transition_guard
  before update of status, payment_status on "order"
  for each row execute function enforce_order_transition();

comment on function enforce_order_transition() is
  'Single gate for both status tracks on "order". Same-value writes pass so the '
  'payment and delivery routes stay idempotent; anything not in '
  'order_transition raises P0018 (fulfilment) or P0019 (payment).';

-- ============================================================================
-- 2.  ATOMIC ADMIN OPERATIONS
--
-- Creating a product wrote the product, then its attributes, then the audit
-- row as three independent statements from the Worker. A failure between them
-- left a product with no attributes, or a change with no audit trail — and the
-- Worker cannot roll back a Supabase write it has already committed. Each
-- business operation is one function now, so it is one transaction.
--
-- Columns are written through an allowlist: a client cannot reach stock,
-- identifiers or timestamps by adding keys to the payload. Stock still moves
-- only through adjust_product_stock, which locks the row.
-- ============================================================================

create or replace function admin_create_product(
  p_fields     jsonb,
  p_attributes jsonb,
  p_actor      uuid
) returns product
language plpgsql security definer set search_path = public as $$
declare
  v_product product;
  v_cols    text[] := array['name','subtitle','description','price_kobo',
                            'active','image_asset','category','unit','sku'];
  v_keys    text[];
  v_sql     text;
begin
  select array_agg(k) into v_keys
  from   jsonb_object_keys(p_fields) k
  where  k = any(v_cols);

  if v_keys is null or array_length(v_keys, 1) = 0 then
    raise exception 'no writable product fields supplied' using errcode = 'P0020';
  end if;

  v_sql := format(
    'insert into product (%s) select %s from jsonb_to_record($1) as x(%s) returning *',
    (select string_agg(quote_ident(k), ', ') from unnest(v_keys) k),
    (select string_agg('x.' || quote_ident(k), ', ') from unnest(v_keys) k),
    (select string_agg(quote_ident(k) || ' ' ||
              (select data_type from information_schema.columns
               where table_name = 'product' and column_name = k), ', ')
     from unnest(v_keys) k));
  execute v_sql into v_product using p_fields;

  if p_attributes is not null and jsonb_typeof(p_attributes) = 'object' then
    insert into product_attribute (product_id, attribute_key, attribute_value, numeric_value)
    select v_product.product_id, a.key, a.value #>> '{}',
           case when (a.value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
                then (a.value #>> '{}')::numeric end
    from   jsonb_each(p_attributes) a;
  end if;

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (p_actor, 'product.created', 'product', v_product.product_id, p_fields);

  return v_product;
end $$;

comment on function admin_create_product(jsonb, jsonb, uuid) is
  'Product + attributes + audit row in one transaction. Partial products can no '
  'longer be left behind by a failure between the writes.';

create or replace function admin_update_product(
  p_product_id uuid,
  p_fields     jsonb,
  p_actor      uuid
) returns product
language plpgsql security definer set search_path = public as $$
declare
  v_before product;
  v_after  product;
  v_cols   text[] := array['name','subtitle','description','price_kobo',
                           'active','image_asset','category','unit','sku'];
  v_keys   text[];
  v_sql    text;
begin
  select * into v_before from product where product_id = p_product_id for update;
  if not found then
    raise exception 'product not found' using errcode = 'P0021';
  end if;

  select array_agg(k) into v_keys
  from   jsonb_object_keys(p_fields) k
  where  k = any(v_cols);

  if v_keys is null or array_length(v_keys, 1) = 0 then
    return v_before;                        -- nothing writable: a no-op, not an error
  end if;

  v_sql := format(
    'update product set %s from jsonb_to_record($1) as x(%s) where product_id = $2 returning product.*',
    (select string_agg(format('%I = x.%I', k, k), ', ') from unnest(v_keys) k),
    (select string_agg(quote_ident(k) || ' ' ||
              (select data_type from information_schema.columns
               where table_name = 'product' and column_name = k), ', ')
     from unnest(v_keys) k));
  execute v_sql into v_after using p_fields, p_product_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (p_actor, 'product.updated', 'product', p_product_id,
          to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end $$;

create or replace function admin_update_zone(
  p_zone_id uuid,
  p_fields  jsonb,
  p_actor   uuid
) returns delivery_zone
language plpgsql security definer set search_path = public as $$
declare
  v_before delivery_zone;
  v_after  delivery_zone;
  v_cols   text[] := array['name','fee_kobo','active','eta_minutes','polygon','notes'];
  v_keys   text[];
  v_sql    text;
begin
  select * into v_before from delivery_zone where zone_id = p_zone_id for update;
  if not found then
    raise exception 'zone not found' using errcode = 'P0021';
  end if;

  select array_agg(k) into v_keys
  from   jsonb_object_keys(p_fields) k
  where  k = any(v_cols)
    and  exists (select 1 from information_schema.columns
                 where table_name = 'delivery_zone' and column_name = k);

  if v_keys is null or array_length(v_keys, 1) = 0 then
    return v_before;
  end if;

  v_sql := format(
    'update delivery_zone set %s from jsonb_to_record($1) as x(%s) where zone_id = $2 returning delivery_zone.*',
    (select string_agg(format('%I = x.%I', k, k), ', ') from unnest(v_keys) k),
    (select string_agg(quote_ident(k) || ' ' ||
              (select data_type from information_schema.columns
               where table_name = 'delivery_zone' and column_name = k), ', ')
     from unnest(v_keys) k));
  execute v_sql into v_after using p_fields, p_zone_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (p_actor, 'zone.updated', 'delivery_zone', p_zone_id,
          to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end $$;


create or replace function admin_create_zone(p_fields jsonb, p_actor uuid)
returns delivery_zone
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zone;
  v_cols text[] := array['name','fee_kobo','coverage_note','active','eta_minutes'];
  v_keys text[];
  v_sql  text;
begin
  select array_agg(k) into v_keys
  from   jsonb_object_keys(p_fields) k
  where  k = any(v_cols)
    and  exists (select 1 from information_schema.columns
                 where table_name = 'delivery_zone' and column_name = k);

  if v_keys is null then
    raise exception 'no writable zone fields supplied' using errcode = 'P0020';
  end if;

  v_sql := format(
    'insert into delivery_zone (%s) select %s from jsonb_to_record($1) as x(%s) returning *',
    (select string_agg(quote_ident(k), ', ') from unnest(v_keys) k),
    (select string_agg('x.' || quote_ident(k), ', ') from unnest(v_keys) k),
    (select string_agg(quote_ident(k) || ' ' ||
              (select data_type from information_schema.columns
               where table_name = 'delivery_zone' and column_name = k), ', ')
     from unnest(v_keys) k));
  execute v_sql into v_zone using p_fields;

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (p_actor, 'zone.created', 'delivery_zone', v_zone.zone_id, p_fields);

  return v_zone;
end $$;

revoke all on function admin_create_zone(jsonb, uuid) from public, anon, authenticated;
grant execute on function admin_create_zone(jsonb, uuid) to service_role;

revoke all on function admin_create_product(jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function admin_update_product(uuid, jsonb, uuid)  from public, anon, authenticated;
revoke all on function admin_update_zone(uuid, jsonb, uuid)     from public, anon, authenticated;
revoke all on function soft_delete_image_asset(uuid)            from public, anon, authenticated;
revoke all on function image_asset_refs(uuid)                   from public, anon, authenticated;
grant execute on function admin_create_product(jsonb, jsonb, uuid) to service_role;
grant execute on function admin_update_product(uuid, jsonb, uuid)  to service_role;
grant execute on function admin_update_zone(uuid, jsonb, uuid)     to service_role;
grant execute on function soft_delete_image_asset(uuid)            to service_role;
grant execute on function image_asset_refs(uuid)                   to service_role;
