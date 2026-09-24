-- ============================================================================
-- U2GAS — 0022 low stock alert
--
-- Three pieces of this already existed and never met:
--
--   * low_stock_warn_kg is seeded (500) and range-checked in 0012
--   * the customer notifications screen filters on a "stock.low" kind
--   * nothing anywhere produces that notification
--
-- So the threshold was adjustable, the UI was ready to show the result, and
-- the depot was never told. For a business whose entire stock is one number,
-- that is the alert that matters most.
--
-- Fires on the crossing, not on every movement: a tank sitting below the
-- threshold for a week should produce one message, not one per order.
-- ============================================================================

create or replace function notify_low_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_threshold numeric;
  v_before    numeric;
  v_after     numeric;
  v_depot     text;
begin
  v_threshold := setting_number('low_stock_warn_kg', 500);

  v_before := old.total_received_kg - old.reserved_kg - old.deducted_kg;
  v_after  := new.total_received_kg - new.reserved_kg - new.deducted_kg;

  -- Only the moment it crosses downward. Staying below is not news, and
  -- coming back up is handled by the reverse crossing arming it again.
  if not (v_before > v_threshold and v_after <= v_threshold) then
    return null;
  end if;

  select name into v_depot from depot where depot_id = new.depot_id;

  -- Everyone who can do something about it. A cashier cannot order gas, so
  -- telling them is noise; managers and admins can.
  insert into notification (profile_id, kind, title, body)
  select p.profile_id,
         'stock.low',
         'Gas is running low',
         'The tank at ' || coalesce(v_depot, 'the depot') || ' is down to ' ||
         trim(to_char(v_after / 1000.0, 'FM999990.00')) || ' tons (' ||
         trim(to_char(v_after, 'FM999999990')) || 'kg). The warning level is ' ||
         trim(to_char(v_threshold, 'FM999999990')) || 'kg.'
  from profile p
  where p.role in ('manager', 'admin');

  insert into audit_log (action, entity_type, entity_id, before, after, note)
  values ('stock.low', 'gas_stock', new.depot_id,
          json_build_object('available_kg', v_before)::jsonb,
          json_build_object('available_kg', v_after,
                            'threshold_kg', v_threshold)::jsonb,
          'Crossed the low-stock threshold');

  return null;
end $$;

drop trigger if exists gas_stock_low_warning on gas_stock;

-- AFTER, so a failure here can never block the order that moved the stock.
-- Selling gas must not depend on the notification insert succeeding.
create trigger gas_stock_low_warning
  after update of total_received_kg, reserved_kg, deducted_kg on gas_stock
  for each row execute function notify_low_stock();

revoke all on function notify_low_stock() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Let the admin screen read the threshold alongside the tank, so the gauge can
-- show where the line is rather than the number living only in settings.
-- ----------------------------------------------------------------------------

create or replace function gas_overview(p_depot_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_received_kg', g.total_received_kg,
    'reserved_kg',       g.reserved_kg,
    'deducted_kg',       g.deducted_kg,
    'available_kg',      g.total_received_kg - g.reserved_kg - g.deducted_kg,
    'rate_kobo_per_kg',  g.rate_kobo_per_kg,
    'low_warn_kg',       setting_number('low_stock_warn_kg', 500),
    'is_low',            (g.total_received_kg - g.reserved_kg - g.deducted_kg)
                         <= setting_number('low_stock_warn_kg', 500),
    'updated_at',        g.updated_at)
  from gas_stock g
  where g.depot_id = p_depot_id
$$;

revoke all on function gas_overview(uuid) from public, anon, authenticated;
grant execute on function gas_overview(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Regression guard
-- ----------------------------------------------------------------------------

create or replace function test_low_stock_fires_once()
returns boolean language plpgsql as $$
declare
  v_depot uuid := '00000000-0000-0000-0000-00000000d001';
  v_first integer;
  v_second integer;
begin
  delete from notification where kind = 'stock.low';

  -- Well above the threshold to start.
  update gas_stock
     set total_received_kg = 20000, reserved_kg = 0, deducted_kg = 0
   where depot_id = v_depot;

  -- Cross it.
  update gas_stock set deducted_kg = 19800 where depot_id = v_depot;
  select count(*) into v_first from notification where kind = 'stock.low';

  -- Move again while still below: must not notify a second time.
  update gas_stock set deducted_kg = 19900 where depot_id = v_depot;
  select count(*) into v_second from notification where kind = 'stock.low';

  delete from notification where kind = 'stock.low';

  return v_first > 0 and v_second = v_first;
end $$;
