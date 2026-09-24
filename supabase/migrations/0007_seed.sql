-- ============================================================================
-- U2GAS — 0007 reference data
--
-- Real configuration, not demo content: the depot, the categories the shop
-- actually sells, the compatibility rules that make bundles work, and the
-- delivery zones. No fake orders, no placeholder customers.
-- ============================================================================

-- Depot ----------------------------------------------------------------------
insert into depot (depot_id, name, address)
values ('00000000-0000-0000-0000-00000000d001', 'U2 Main Depot', null)
on conflict (depot_id) do nothing;

insert into gas_stock (depot_id, total_received_kg, rate_kobo_per_kg)
values ('00000000-0000-0000-0000-00000000d001', 0, 140000)   -- ₦1,400 per kg
on conflict (depot_id) do nothing;

-- Categories -----------------------------------------------------------------
insert into product_category (category_id, slug, name, sort_order) values
  ('00000000-0000-0000-0000-0000000000c1','cylinder','Cylinders',1),
  ('00000000-0000-0000-0000-0000000000c2','hose','Hoses',2),
  ('00000000-0000-0000-0000-0000000000c3','regulator','Regulators',3),
  ('00000000-0000-0000-0000-0000000000c4','clamp','Clamps',4),
  ('00000000-0000-0000-0000-0000000000c5','battery','Batteries',5),
  ('00000000-0000-0000-0000-0000000000c6','burner','Burners',6)
on conflict (category_id) do nothing;

-- Compatibility rules --------------------------------------------------------
-- category_a must sort before category_b, matching the rule_pair_ordered check.
-- Messages are shown verbatim in the red stamp, so they are written in the
-- product's language, not the database's.

-- allowed_set is part of the INSERT, not a follow-up UPDATE: the
-- rule_in_set_needs_values CHECK fires on insert, so the in_set row failed and
-- took the whole seed with it on a clean database.
insert into compatibility_rule
  (category_a, category_b, attribute_key, match_type, tolerance, allowed_set, message)
values
  -- Hose to regulator: bore sizes must match within half a millimetre.
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c3',
   'bore_mm','numeric_range',0.5,null,
   'THIS HOSE DOES NOT FIT THIS REGULATOR'),

  -- Regulator to cylinder: valve threads must be identical.
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c3',
   'valve_thread','equal',null,null,
   'THIS REGULATOR DOES NOT FIT THIS CYLINDER VALVE'),

  -- Clamp to hose: the clamp must cover the hose's outer diameter.
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c4',
   'outer_diameter_mm','numeric_range',1.0,null,
   'THIS CLAMP IS THE WRONG SIZE FOR THIS HOSE'),

  -- Burner to regulator: both must run at the same pressure class.
  ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000c6',
   'pressure_class','in_set',null,array['low','standard'],
   'THIS BURNER NEEDS A DIFFERENT PRESSURE REGULATOR')
on conflict do nothing;

-- Delivery zones -------------------------------------------------------------
insert into delivery_zone (name, fee_kobo, coverage_note) values
  ('Zone A — Within 5km',   150000, 'Depot ward and adjoining streets'),
  ('Zone B — 5 to 12km',    250000, 'Inner city'),
  ('Zone C — 12 to 25km',   400000, 'Outer city'),
  ('Zone D — Beyond 25km',  650000, 'By arrangement only')
on conflict do nothing;

-- Settings the admin UI edits ------------------------------------------------
create table if not exists app_setting (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references profile(profile_id),
  updated_at timestamptz not null default now()
);

alter table app_setting enable row level security;
alter table app_setting force row level security;
create policy setting_read  on app_setting for select using (true);
create policy setting_admin on app_setting for all
  using (is_admin()) with check (is_admin());

insert into app_setting (key, value) values
  ('hold_minutes',        '30'::jsonb),
  ('qr_valid_hours',      '72'::jsonb),
  ('max_gas_kg_per_order','50'::jsonb),
  ('low_stock_warn_kg',   '500'::jsonb)
on conflict (key) do nothing;
