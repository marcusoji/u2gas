-- ============================================================================
-- U2GAS — 0021 stock entry photographs
--
-- `stock_entry` has been a valid image_owner since 0001 and /uploads/image has
-- always accepted it, but nothing could attach the result: record_stock_entry
-- took no asset and stock_entry had no column to put one in. The capability
-- was designed and then left unreachable.
--
-- This closes it. When a tanker arrives the manager photographs the delivery
-- note, and that photograph is attached to the entry that moves the tank
-- reading — which is the evidence you want when a supplier's figure and the
-- gauge disagree weeks later.
-- ============================================================================

alter table stock_entry
  add column if not exists photo_asset uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stock_entry_photo_fk'
  ) then
    alter table stock_entry
      add constraint stock_entry_photo_fk
      foreign key (photo_asset) references image_asset(asset_id)
      on delete set null;
  end if;
end $$;

comment on column stock_entry.photo_asset is
  'Optional photograph of the delivery note or gauge reading for this movement.
   Evidence for a disputed quantity; never required, because a tanker at the
   gate should not be held up by a camera.';

create index if not exists stock_entry_photo_idx
  on stock_entry (photo_asset) where photo_asset is not null;

-- ----------------------------------------------------------------------------
-- record_stock_entry gains the asset. Appended with a default so every
-- existing five-argument call site keeps working unchanged.
-- ----------------------------------------------------------------------------

create or replace function record_stock_entry(
  p_depot_id    uuid,
  p_admin_id    uuid,
  p_move        stock_move,
  p_amount_kg   numeric,
  p_note        text default null,
  p_photo_asset uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_entry uuid;
  v_before numeric;
  v_after  numeric;
begin
  if p_amount_kg is null or p_amount_kg <= 0 then
    raise exception 'INVALID_QUANTITY'
      using detail = '{"field":"amount_kg"}';
  end if;

  -- The photo must exist and must be a stock-entry photo. Without this check
  -- an admin could point an entry at somebody's avatar.
  if p_photo_asset is not null then
    if not exists (
      select 1 from image_asset
       where asset_id = p_photo_asset
         and owner_type = 'stock_entry'
         and deleted_at is null
    ) then
      raise exception 'IMAGE_NOT_FOUND'
        using detail = json_build_object('asset_id', p_photo_asset)::text;
    end if;
  end if;

  -- Lock the tank so two entries cannot interleave and record the same before.
  select total_received_kg - deducted_kg into v_before
    from gas_stock where depot_id = p_depot_id for update;

  if not found then
    raise exception 'DEPOT_NOT_FOUND';
  end if;

  if p_move = 'addition' then
    update gas_stock
       set total_received_kg = total_received_kg + p_amount_kg,
           updated_at = now()
     where depot_id = p_depot_id;
  else
    -- A removal cannot take more than is actually free.
    if (select total_received_kg - reserved_kg - deducted_kg
          from gas_stock where depot_id = p_depot_id) < p_amount_kg then
      raise exception 'INSUFFICIENT_GAS'
        using detail = json_build_object(
          'requested_kg', p_amount_kg,
          'available_kg', (select greatest(total_received_kg - reserved_kg
                                           - deducted_kg, 0)
                             from gas_stock where depot_id = p_depot_id))::text;
    end if;
    update gas_stock
       set deducted_kg = deducted_kg + p_amount_kg,
           updated_at = now()
     where depot_id = p_depot_id;
  end if;

  select total_received_kg - deducted_kg into v_after
    from gas_stock where depot_id = p_depot_id;

  insert into stock_entry (depot_id, admin_id, move, amount_kg, note,
                           photo_asset)
  values (p_depot_id, p_admin_id, p_move, p_amount_kg, p_note, p_photo_asset)
  returning entry_id into v_entry;

  insert into audit_log (actor_id, action, entity_type, entity_id,
                         before, after, note)
  values (p_admin_id, 'stock.' || p_move, 'gas_stock', p_depot_id,
          json_build_object('net_kg', v_before)::jsonb,
          json_build_object('net_kg', v_after,
                            'entry_id', v_entry,
                            'photo_asset', p_photo_asset)::jsonb,
          p_note);

  return v_entry;
end $$;

revoke all on function record_stock_entry(uuid, uuid, stock_move, numeric, text, uuid)
  from public, anon, authenticated;
grant execute on function record_stock_entry(uuid, uuid, stock_move, numeric, text, uuid)
  to service_role;

-- The five-argument version would otherwise remain, and a five-argument call
-- would match both it and the new default — "function is not unique".
drop function if exists record_stock_entry(uuid, uuid, stock_move, numeric, text);

do $$
begin
  if (select count(*) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'record_stock_entry') > 1 then
    raise exception 'record_stock_entry still has more than one overload';
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- purge_idempotency_keys existed from 0012 but nothing ever called it, so
-- idempotency_key grew by a row per unsafe request and never shrank. It is now
-- run on the hourly cleanup-assets tick, which needs the grant.
-- ----------------------------------------------------------------------------

grant execute on function purge_idempotency_keys(interval) to service_role;
revoke all on function purge_idempotency_keys(interval) from public, anon, authenticated;
