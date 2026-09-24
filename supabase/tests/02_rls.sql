-- ============================================================================
-- U2GAS — RLS and authorization tests (Part 48)
--
-- Run with:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 02_rls.sql
--
-- The concurrency suite proves the business logic. This proves the fence
-- around it: that each role can reach exactly what it should and nothing more.
--
-- Every check runs as the real Postgres role Supabase uses (`authenticated`
-- or `anon`) with a forged JWT claim, which is what PostgREST does. Testing
-- policies as the table owner proves nothing — the owner bypasses most of it.
-- ============================================================================

\set ON_ERROR_STOP on
begin;

create temporary table t_result (name text, passed boolean, detail text);

-- The checks below run as anon and authenticated. Neither owns these scratch
-- tables, so without a grant the harness itself fails before it can record a
-- result — and a suite that cannot write its own output looks like a pass.
grant all on t_result to anon, authenticated;

create or replace function t_assert(p_name text, p_cond boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into t_result values (p_name, p_cond, p_detail);
  if not p_cond then
    raise warning 'FAIL: % — %', p_name, coalesce(p_detail,'');
  end if;
end $$;

/**
 * Become a given role with a given auth.uid(). This is how PostgREST presents
 * a request: the database role carries the privileges, the JWT claim carries
 * the identity, and RLS reads the claim.
 */
create or replace function become(p_role text, p_auth_uid uuid default null)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_auth_uid is null then '{"role":"anon"}'
         else json_build_object('sub', p_auth_uid, 'role', p_role)::text end,
    true);
  execute format('set local role %I', p_role);
end $$;

create or replace function unbecome() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

/** Did this statement fail, or return nothing? Both count as denied. */
create or replace function denied(p_sql text) returns boolean
language plpgsql as $$
declare v_rows integer;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  return v_rows = 0;
exception when others then
  return true;              -- a raised error is also a denial
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures: one person per role, plus an order belonging to the customer.
-- ----------------------------------------------------------------------------

create temporary table t_ids (label text primary key, id uuid, auth_uid uuid);
grant all on t_ids to anon, authenticated;

do $$
declare
  r record;
  v_auth uuid;
  v_profile uuid;
  v_order uuid;
  v_driver uuid;
  v_driver2 uuid;
begin
  for r in select * from (values
      ('customer','customer'), ('customer_b','customer'),
      ('staff','staff'), ('manager','manager'), ('admin','admin'),
      ('driver_a','driver'), ('driver_b','driver')) as t(label, role)
  loop
    v_auth := gen_random_uuid();
    insert into profile (auth_user_id, role, email, display_name)
    values (v_auth, r.role::app_role, r.label || '@test.local', r.label)
    returning profile_id into v_profile;
    insert into t_ids values (r.label, v_profile, v_auth);
  end loop;

  -- Staff rows where the role needs one.
  insert into staff_member (profile_id, status)
  select id, 'active' from t_ids where label in ('staff','manager');

  insert into driver (profile_id, phone, status)
  select id, '+2348000000300', 'available' from t_ids where label = 'driver_a'
  returning driver_id into v_driver;
  insert into t_ids values ('driver_a_row', v_driver, null);

  insert into driver (profile_id, phone, status)
  select id, '+2348000000301', 'available' from t_ids where label = 'driver_b'
  returning driver_id into v_driver2;
  insert into t_ids values ('driver_b_row', v_driver2, null);

  -- An order owned by 'customer', delivered by driver_a.
  insert into "order" (depot_id, user_id, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo,
                       fulfillment_type, delivery_address, zone_id,
                       delivery_fee_kobo, status, payment_status)
  select '00000000-0000-0000-0000-00000000d001', id, 'gas', 5, 140000, 700000,
         850000, 'delivery', '1 Test Street',
         (select zone_id from delivery_zone limit 1), 150000, 'confirmed', 'paid'
  from t_ids where label = 'customer'
  returning order_id into v_order;
  insert into t_ids values ('order', v_order, null);

  insert into delivery (order_id, driver_id, delivery_address, status)
  values (v_order, v_driver, '1 Test Street', 'assigned');

  -- `denied()` treats zero rows as a denial, which is right for a SELECT that
  -- RLS filtered away — but on an empty table it makes a permitted read look
  -- forbidden. Guarantee there is something to find. (Item 6)
  insert into audit_log (action, entity_type, entity_id, note)
  values ('test.fixture', 'order', v_order, 'RLS suite fixture');

  -- denied() reads zero rows as a denial, which is right for a row RLS
  -- filtered away — but on an empty catalogue it makes the public shop look
  -- forbidden. Guarantee there is an active product to find.
  insert into product (product_id, category_id, name, price_kobo, stock_qty, active)
  values (
    '00000000-0000-0000-0000-00000000e099',
    '00000000-0000-0000-0000-0000000000c2',
    'RLS Fixture Hose',
    50000, 5, true
  )
  on conflict (product_id) do update set active = true;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Anonymous
-- ----------------------------------------------------------------------------
do $$
declare v_order uuid;
begin
  select id into v_order from t_ids where label = 'order';
  perform become('anon');

  perform t_assert('anon cannot read orders',
    denied(format('select 1 from "order" where order_id = %L', v_order)));
  perform t_assert('anon cannot read profiles',
    denied('select 1 from profile limit 1'));
  perform t_assert('anon cannot read payments',
    denied('select 1 from payment limit 1'));
  perform t_assert('anon cannot read the audit log',
    denied('select 1 from audit_log where action = ''test.fixture'''));
  perform t_assert('anon cannot read webhook events',
    denied('select 1 from webhook_event limit 1'));
  perform t_assert('anon cannot read reservations',
    denied('select 1 from inventory_reservation limit 1'));

  -- The shop must stay public or nobody can browse before signing up.
  perform t_assert('anon CAN read active products',
    not denied('select 1 from product
                 where product_id = ''00000000-0000-0000-0000-00000000e099'''));

  perform unbecome();
end $$;

-- ----------------------------------------------------------------------------
-- 2. Customer
-- ----------------------------------------------------------------------------
do $$
declare v_me uuid; v_order uuid; v_other uuid;
begin
  select auth_uid into v_me from t_ids where label = 'customer';
  select id into v_order from t_ids where label = 'order';
  select auth_uid into v_other from t_ids where label = 'customer_b';

  perform become('authenticated', v_me);

  perform t_assert('customer CAN read their own order',
    not denied(format('select 1 from "order" where order_id = %L', v_order)));

  perform unbecome();
  perform become('authenticated', v_other);

  perform t_assert('customer CANNOT read another customer''s order',
    denied(format('select 1 from "order" where order_id = %L', v_order)));
  perform t_assert('customer cannot read another customer''s payments',
    denied(format('select 1 from payment where order_id = %L', v_order)));

  -- Part 45: the whole point.
  perform t_assert('customer cannot promote themselves to admin',
    denied(format(
      'update profile set role = ''admin'' where auth_user_id = %L', v_other)));

  -- Part 7.
  perform t_assert('customer cannot change their own email',
    denied(format(
      'update profile set email = ''hijack@x.test'' where auth_user_id = %L', v_other)));
  perform t_assert('customer cannot mark their own email verified',
    denied(format(
      'update profile set email_verified_at = now() where auth_user_id = %L', v_other)));

  perform t_assert('customer cannot write stock',
    denied('update product set stock_qty = 9999 where active'));
  perform t_assert('customer cannot write an order',
    denied(format('update "order" set payment_status = ''paid'' where order_id = %L', v_order)));
  perform t_assert('customer cannot insert an audit entry',
    denied('insert into audit_log (action, entity_type) values (''forged'', ''order'')'));
  perform t_assert('customer cannot read the audit log',
    denied('select 1 from audit_log where action = ''test.fixture'''));

  -- Part 8: business RPCs must not be callable from a browser session.
  perform t_assert('customer cannot call confirm_payment',
    denied(format(
      'select confirm_payment(%L, ''paystack'', ''forged'', 1, ''paystack'')', v_order)));
  perform t_assert('customer cannot call adjust_product_stock',
    denied('select adjust_product_stock((select product_id from product limit 1), 100)'));
  perform t_assert('customer cannot call redeem_qr',
    denied('select redeem_qr(repeat(''a'',64), null)'));

  perform unbecome();
end $$;

-- ----------------------------------------------------------------------------
-- 3. Driver — Part 46
-- ----------------------------------------------------------------------------
do $$
declare v_a uuid; v_b uuid; v_delivery uuid;
begin
  select auth_uid into v_a from t_ids where label = 'driver_a';
  select auth_uid into v_b from t_ids where label = 'driver_b';
  select delivery_id into v_delivery from delivery limit 1;

  perform become('authenticated', v_a);
  perform t_assert('driver A CAN read their own delivery',
    not denied(format('select 1 from delivery where delivery_id = %L', v_delivery)));
  perform unbecome();

  perform become('authenticated', v_b);
  perform t_assert('driver B CANNOT read driver A''s delivery',
    denied(format('select 1 from delivery where delivery_id = %L', v_delivery)));
  perform t_assert('driver B cannot reassign a delivery to themselves',
    denied(format(
      'update delivery set driver_id = (select driver_id from driver limit 1)
       where delivery_id = %L', v_delivery)));
  perform t_assert('driver cannot mark a delivery delivered directly',
    denied(format(
      'update delivery set status = ''delivered'' where delivery_id = %L', v_delivery)));
  perform t_assert('driver cannot read the customer list',
    denied('select 1 from profile where role = ''customer'' limit 1'));
  perform t_assert('driver cannot reach admin settings',
    denied('update app_setting set value = ''999'' where key = ''hold_minutes'''));
  perform unbecome();
end $$;

-- ----------------------------------------------------------------------------
-- 4. Staff vs manager vs admin — Part 47
-- ----------------------------------------------------------------------------
do $$
declare v_staff uuid; v_manager uuid; v_admin uuid; v_order uuid;
begin
  select auth_uid into v_staff from t_ids where label = 'staff';
  select auth_uid into v_manager from t_ids where label = 'manager';
  select auth_uid into v_admin from t_ids where label = 'admin';
  select id into v_order from t_ids where label = 'order';

  perform become('authenticated', v_staff);
  perform t_assert('staff CAN read orders',
    not denied(format('select 1 from "order" where order_id = %L', v_order)));

  -- Writes belong to the Worker, not to a browser session holding a staff JWT.
  perform t_assert('staff cannot write an order directly',
    denied(format('update "order" set status = ''fulfilled'' where order_id = %L', v_order)));
  perform t_assert('staff cannot alter a historical payment',
    denied(format('update payment set amount_kobo = 1 where order_id = %L', v_order)));
  perform t_assert('staff cannot change product stock directly',
    denied('update product set stock_qty = 500 where active'));
  perform t_assert('staff cannot change settings',
    denied('update app_setting set value = ''999'' where key = ''hold_minutes'''));
  perform t_assert('staff cannot delete an audit entry',
    denied('delete from audit_log where true'));
  perform t_assert('staff cannot read the audit log',
    denied('select 1 from audit_log where action = ''test.fixture'''));
  perform unbecome();

  perform become('authenticated', v_admin);
  -- The fixture above guarantees a row, so a zero-row result here really does
  -- mean the policy refused.
  perform t_assert('admin CAN read the audit log',
    not denied('select 1 from audit_log where action = ''test.fixture'''));
  perform t_assert('admin still cannot insert a forged audit entry',
    denied('insert into audit_log (action, entity_type) values (''forged'', ''order'')'));
  perform unbecome();
end $$;

-- ----------------------------------------------------------------------------
-- 5. Nobody may write the immutable records
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
  rows jsonb;
begin
  -- Materialised before any role switch: a cursor left open across
  -- `set local role` fetches under the new role, which owns nothing here.
  select jsonb_agg(jsonb_build_object('label', label, 'auth_uid', auth_uid))
    into rows
    from t_ids where auth_uid is not null;

  for r in select (e->>'label') as label, (e->>'auth_uid')::uuid as auth_uid
           from jsonb_array_elements(rows) e
  loop
    perform become('authenticated', r.auth_uid);
    perform t_assert(r.label || ' cannot write webhook_event',
      denied('insert into webhook_event (provider, provider_event_id, signature_valid, payload)
              values (''paystack'', ''forged'', true, ''{}''::jsonb)'));
    perform t_assert(r.label || ' cannot write inventory_reservation',
      denied('update inventory_reservation set status = ''released'' where true'));
    perform unbecome();
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Report
-- ----------------------------------------------------------------------------

select count(*) filter (where passed)     as passed,
       count(*) filter (where not passed) as failed,
       count(*)                           as total
from t_result;

select name, detail from t_result where not passed;

do $$
begin
  if exists (select 1 from t_result where not passed) then
    raise exception 'RLS suite failed';
  end if;
end $$;

rollback;   -- the suite never leaves data behind
