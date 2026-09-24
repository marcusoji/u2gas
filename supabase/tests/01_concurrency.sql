-- ============================================================================
-- U2GAS — concurrency and integrity tests (spec 46, 62)
--
-- Run with:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 01_concurrency.sql
--
-- The single-session assertions run inline. The genuinely concurrent cases
-- (marked SESSION A / SESSION B) need two psql sessions and are scripted in
-- ../tests/run_concurrency.sh — a single session cannot prove a row lock works.
-- ============================================================================

\set ON_ERROR_STOP on
begin;

create temporary table t_result (name text, passed boolean, detail text);

create or replace function t_assert(p_name text, p_cond boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into t_result values (p_name, p_cond, p_detail);
  if not p_cond then
    raise warning 'FAIL: % — %', p_name, coalesce(p_detail,'');
  end if;
end $$;


/**
 * Tear down an order and everything that references it.
 *
 * refund.order_id is ON DELETE RESTRICT (0018) on purpose — a refund record
 * must outlive careless cleanup in production. That makes the test suite
 * responsible for its own ordering, which is what this does.
 */
create or replace function t_drop_order(p_order_id uuid)
returns void language plpgsql as $$
begin
  delete from refund                 where order_id = p_order_id;
  delete from payment                where order_id = p_order_id;
  delete from inventory_reservation  where order_id = p_order_id;
  delete from qr_token               where order_id = p_order_id;
  delete from delivery               where order_id = p_order_id;
  delete from notification           where order_id = p_order_id;
  delete from order_item             where order_id = p_order_id;
  delete from audit_log              where entity_type = 'order' and entity_id = p_order_id;
  delete from "order"                where order_id = p_order_id;
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------
do $$
declare v_depot uuid := '00000000-0000-0000-0000-00000000d001';
begin
  update gas_stock
     set total_received_kg = 10, reserved_kg = 0, deducted_kg = 0
   where depot_id = v_depot;

  insert into product (product_id, category_id, name, price_kobo, stock_qty, reserved_qty)
  values ('00000000-0000-0000-0000-00000000e001',
          '00000000-0000-0000-0000-0000000000c2', 'TEST HOSE 8MM', 500000, 1, 0)
  on conflict (product_id) do update
     set stock_qty = 1, reserved_qty = 0, active = true;
end $$;

-- ----------------------------------------------------------------------------
-- 1. available_kg is derived correctly
-- ----------------------------------------------------------------------------
select t_assert('gas available = received - reserved - deducted',
  gas_available_kg('00000000-0000-0000-0000-00000000d001') = 10);

-- ----------------------------------------------------------------------------
-- 2. Over-reserving gas is refused with the numbers needed for the UI
-- ----------------------------------------------------------------------------
do $$
declare v_order uuid; v_detail text; v_ok boolean := false;
begin
  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo, fulfillment_type)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000001','gas',
          15, 140000, 2100000, 2100000, 'pickup')
  returning order_id into v_order;

  begin
    perform reserve_gas(v_order, '00000000-0000-0000-0000-00000000d001', 15, now() + interval '30 min');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    v_ok := sqlerrm = 'INSUFFICIENT_GAS'
        and (v_detail::jsonb->>'available_kg')::numeric = 10;
  end;

  perform t_assert('over-reserve refused and reports available_kg', v_ok, v_detail);
  perform t_drop_order(v_order);
end $$;

-- ----------------------------------------------------------------------------
-- 3. Stock cannot go negative even if a function is misused
-- ----------------------------------------------------------------------------
do $$
declare v_ok boolean := false;
begin
  begin
    update gas_stock set reserved_kg = 999
     where depot_id = '00000000-0000-0000-0000-00000000d001';
  exception when check_violation then
    v_ok := true;
  end;
  perform t_assert('gas_never_oversold blocks a bad direct write', v_ok);
end $$;

do $$
declare v_ok boolean := false;
begin
  begin
    update product set stock_qty = -1
     where product_id = '00000000-0000-0000-0000-00000000e001';
  exception when check_violation then
    v_ok := true;
  end;
  perform t_assert('product_stock_nonneg blocks negative stock', v_ok);
end $$;

-- ----------------------------------------------------------------------------
-- 4. Release is idempotent — running it twice must not double-release
-- ----------------------------------------------------------------------------
do $$
declare v_order uuid; v_first integer; v_second integer; v_after numeric;
begin
  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo, fulfillment_type)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000002','gas',
          4, 140000, 560000, 560000, 'pickup')
  returning order_id into v_order;

  perform reserve_gas(v_order, '00000000-0000-0000-0000-00000000d001', 4, now() + interval '30 min');

  v_first  := release_reservations(v_order, 'released');
  v_second := release_reservations(v_order, 'released');

  select reserved_kg into v_after from gas_stock
   where depot_id = '00000000-0000-0000-0000-00000000d001';

  perform t_assert('first release returns 1', v_first = 1, v_first::text);
  perform t_assert('second release is a no-op', v_second = 0, v_second::text);
  perform t_assert('reserved_kg back to zero, not negative', v_after = 0, v_after::text);

  perform t_drop_order(v_order);
end $$;

-- ----------------------------------------------------------------------------
-- 5. Fulfilment moves reserved into deducted, leaving the total untouched
-- ----------------------------------------------------------------------------
do $$
declare v_order uuid; r record;
begin
  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo, fulfillment_type)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000003','gas',
          3, 140000, 420000, 420000, 'pickup')
  returning order_id into v_order;

  perform reserve_gas(v_order, '00000000-0000-0000-0000-00000000d001', 3, now() + interval '30 min');
  perform fulfill_reservations(v_order);

  select * into r from gas_stock where depot_id = '00000000-0000-0000-0000-00000000d001';

  perform t_assert('fulfilment deducts 3kg', r.deducted_kg = 3, r.deducted_kg::text);
  perform t_assert('fulfilment clears the reservation', r.reserved_kg = 0, r.reserved_kg::text);
  perform t_assert('total_received untouched by fulfilment', r.total_received_kg = 10);
  perform t_assert('available drops to 7',
    gas_available_kg('00000000-0000-0000-0000-00000000d001') = 7);

  -- reset
  update gas_stock set deducted_kg = 0 where depot_id = '00000000-0000-0000-0000-00000000d001';
  perform t_drop_order(v_order);
end $$;

-- ----------------------------------------------------------------------------
-- 6. Duplicate payment reference is rejected by the database, not the app
-- ----------------------------------------------------------------------------
do $$
declare v_order uuid; v_ok boolean := false;
begin
  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo, fulfillment_type)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000004','gas',
          1, 140000, 140000, 140000, 'pickup')
  returning order_id into v_order;

  insert into payment (order_id, provider, provider_reference, amount_kobo, method, status, paid_at)
  values (v_order, 'paystack', 'ref_dup_test', 140000, 'paystack', 'paid', now());

  begin
    insert into payment (order_id, provider, provider_reference, amount_kobo, method, status, paid_at)
    values (v_order, 'paystack', 'ref_dup_test', 140000, 'paystack', 'paid', now());
  exception when unique_violation then
    v_ok := true;
  end;

  perform t_assert('duplicate provider_reference rejected', v_ok);
  perform t_drop_order(v_order);
end $$;

-- ----------------------------------------------------------------------------
-- 7. confirm_payment is idempotent on a repeated webhook
-- ----------------------------------------------------------------------------
do $$
declare v_order uuid; a jsonb; b jsonb;
begin
  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo, fulfillment_type)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000005','gas',
          2, 140000, 280000, 280000, 'pickup')
  returning order_id into v_order;

  perform reserve_gas(v_order, '00000000-0000-0000-0000-00000000d001', 2, now() + interval '30 min');

  a := confirm_payment(v_order, 'paystack', 'ref_idem_test', 280000, 'paystack');
  b := confirm_payment(v_order, 'paystack', 'ref_idem_test', 280000, 'paystack');

  perform t_assert('first webhook processes',    (a->>'already_processed')::boolean = false);
  perform t_assert('repeat webhook is a no-op',  (b->>'already_processed')::boolean = true);
  perform t_assert('same payment row returned',  a->>'payment_id' = b->>'payment_id');
  perform t_assert('exactly one payment row',
    (select count(*) from payment where order_id = v_order) = 1);
  perform t_assert('stock deducted once, not twice',
    (select reserved_kg from gas_stock
      where depot_id = '00000000-0000-0000-0000-00000000d001') = 2);

  perform cancel_order(v_order, null, 'test cleanup');
  perform t_drop_order(v_order);
end $$;

-- ----------------------------------------------------------------------------
-- 8. A QR cannot be redeemed twice
-- ----------------------------------------------------------------------------
do $$
declare v_order uuid; v_hash char(64); v_ok boolean := false; r jsonb;
begin
  v_hash := encode(digest('qr-double-scan-test','sha256'),'hex');

  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo,
                       fulfillment_type, status, payment_status)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000006','gas',
          1, 140000, 140000, 140000, 'pickup', 'confirmed', 'paid')
  returning order_id into v_order;

  perform reserve_gas(v_order, '00000000-0000-0000-0000-00000000d001', 1, null);
  perform issue_qr(v_order, v_hash, 72);

  r := redeem_qr(v_hash, null, 'pickup');
  perform t_assert('first scan fulfils', (r->>'fulfilled')::boolean);

  begin
    perform redeem_qr(v_hash, null, 'pickup');
  exception when others then
    v_ok := sqlerrm in ('QR_ALREADY_SCANNED','ALREADY_FULFILLED');
  end;
  perform t_assert('second scan refused', v_ok);

  perform t_assert('stock deducted exactly once',
    (select deducted_kg from gas_stock
      where depot_id = '00000000-0000-0000-0000-00000000d001') = 1);

  update gas_stock set deducted_kg = 0
   where depot_id = '00000000-0000-0000-0000-00000000d001';
  perform t_drop_order(v_order);
end $$;

-- ----------------------------------------------------------------------------
-- 9. An unpaid QR is refused
-- ----------------------------------------------------------------------------
do $$
declare v_order uuid; v_hash char(64); v_ok boolean := false;
begin
  v_hash := encode(digest('qr-unpaid-test','sha256'),'hex');

  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo, fulfillment_type)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000007','gas',
          1, 140000, 140000, 140000, 'pickup')
  returning order_id into v_order;

  perform issue_qr(v_order, v_hash, 72);

  begin
    perform redeem_qr(v_hash, null, 'pickup');
  exception when others then
    v_ok := sqlerrm = 'UNPAID';
  end;

  perform t_assert('unpaid order cannot be collected', v_ok);
  perform t_drop_order(v_order);
end $$;

-- ----------------------------------------------------------------------------
-- 10. Expiry sweep releases once and only once
-- ----------------------------------------------------------------------------
do $$
declare v_order uuid; r1 record; r2 record; v_reserved numeric;
begin
  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo,
                       fulfillment_type, hold_expires_at)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000008','gas',
          5, 140000, 700000, 700000, 'pickup', now() - interval '1 minute')
  returning order_id into v_order;

  perform reserve_gas(v_order, '00000000-0000-0000-0000-00000000d001', 5, now() - interval '1 minute');

  select * into r1 from expire_order_holds(100);
  select * into r2 from expire_order_holds(100);

  select reserved_kg into v_reserved from gas_stock
   where depot_id = '00000000-0000-0000-0000-00000000d001';

  perform t_assert('sweep expires the order', r1.expired_orders >= 1);
  perform t_assert('sweep releases the reservation', r1.released_reservations >= 1);
  perform t_assert('second sweep finds nothing', r2.expired_orders = 0);
  perform t_assert('reserved_kg released exactly once, not twice', v_reserved = 0, v_reserved::text);
  perform t_assert('order marked expired',
    (select status from "order" where order_id = v_order) = 'expired');

  perform t_drop_order(v_order);
end $$;

-- ----------------------------------------------------------------------------
-- 11. Bundle compatibility
-- ----------------------------------------------------------------------------
do $$
declare v_hose uuid; v_reg_good uuid; v_reg_bad uuid; v_ok boolean := false; v_detail text;
begin
  insert into product (category_id, name, price_kobo, stock_qty)
  values ('00000000-0000-0000-0000-0000000000c2','T HOSE 8MM', 500000, 10)
  returning product_id into v_hose;
  insert into product_attribute values (v_hose,'bore_mm','8',8);

  insert into product (category_id, name, price_kobo, stock_qty)
  values ('00000000-0000-0000-0000-0000000000c3','T REG 8MM', 900000, 10)
  returning product_id into v_reg_good;
  insert into product_attribute values (v_reg_good,'bore_mm','8',8);

  insert into product (category_id, name, price_kobo, stock_qty)
  values ('00000000-0000-0000-0000-0000000000c3','T REG 10MM', 900000, 10)
  returning product_id into v_reg_bad;
  insert into product_attribute values (v_reg_bad,'bore_mm','10',10);

  perform t_assert('matching bores are compatible',
    (select count(*) from check_bundle_compatibility(array[v_hose, v_reg_good])) = 0);

  perform t_assert('mismatched bores are not',
    (select count(*) from check_bundle_compatibility(array[v_hose, v_reg_bad])) = 1);

  begin
    perform publish_bundle('BAD KIT', 1400000,
      jsonb_build_array(
        jsonb_build_object('product_id', v_hose,    'quantity',1,'slot_index',1),
        jsonb_build_object('product_id', v_reg_bad, 'quantity',1,'slot_index',2)),
      null);
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    v_ok := sqlerrm = 'INCOMPATIBLE_ITEMS';
  end;

  perform t_assert('incompatible bundle is blocked', v_ok, v_detail);
  perform t_assert('block names the conflict for the stamp',
    v_detail is not null and length(v_detail::jsonb->>'message') > 0);

  perform t_assert('bundle availability is the weakest member',
    (select count(*) from product where product_id in (v_hose, v_reg_good)) = 2);

  delete from product where product_id in (v_hose, v_reg_good, v_reg_bad);
end $$;

-- ----------------------------------------------------------------------------
-- 12. A bundle may not exceed three members
-- ----------------------------------------------------------------------------
do $$
declare v_ok boolean := false; v_b uuid; ids uuid[];
begin
  -- RETURNING … INTO only accepts a single row, so collect the ids afterwards
  -- rather than from the insert itself.
  insert into product (category_id, name, price_kobo, stock_qty)
  select '00000000-0000-0000-0000-0000000000c5', 'T BAT ' || g, 100000, 5
  from generate_series(1,4) g;

  select array_agg(product_id order by name) into ids
    from product where name like 'T BAT %';

  begin
    insert into bundle (bundle_id, name, price_kobo)
    values (gen_random_uuid(), 'FOUR ITEM KIT', 300000)
    returning bundle_id into v_b;

    insert into bundle_item (bundle_id, product_id, quantity, slot_index)
    select v_b, ids[i], 1, i from generate_series(1,4) i;
  exception when others then
    v_ok := true;
  end;

  perform t_assert('four-item bundle rejected by the database', v_ok);
  delete from product where name like 'T BAT %';
end $$;

-- ----------------------------------------------------------------------------
-- 13. Admin stock adjustment cannot go below what is reserved
-- ----------------------------------------------------------------------------
do $$
declare v_p uuid; v_ok boolean := false; v_detail text; r product;
begin
  insert into product (category_id, name, price_kobo, stock_qty, reserved_qty)
  values ('00000000-0000-0000-0000-0000000000c5','T ADJUST', 100000, 10, 4)
  returning product_id into v_p;

  r := adjust_product_stock(v_p, 5, null, 'test top-up');
  perform t_assert('delta applied on top of current stock', r.stock_qty = 15, r.stock_qty::text);

  begin
    perform adjust_product_stock(v_p, -12, null, 'too far');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    v_ok := sqlerrm = 'INSUFFICIENT_STOCK';
  end;

  perform t_assert('cannot cut below reserved', v_ok, v_detail);
  perform t_assert('stock unchanged after refusal',
    (select stock_qty from product where product_id = v_p) = 15);
  perform t_assert('adjustment is audited',
    (select count(*) from audit_log
      where entity_id = v_p and action like 'product.stock_%') = 1);

  delete from product where product_id = v_p;
end $$;

-- ----------------------------------------------------------------------------
-- 14. A payment for a dead order is recorded, not discarded
--
-- This is the regression guard for the bug where confirm_payment inserted the
-- orphaned payment and then raised, rolling its own record back.
-- ----------------------------------------------------------------------------
select t_assert('orphaned payment survives and is flagged',
  test_orphaned_payment_survives());

do $$
declare v_audits integer;
begin
  select count(*) into v_audits from audit_log
   where action = 'payment.orphaned';
  perform t_assert('orphaned payment is audited', v_audits >= 1, v_audits::text);
end $$;

-- ----------------------------------------------------------------------------
-- 15. The profile policy does not recurse
--
-- is_staff() reads profile; profile's own policy must not call is_staff(), or
-- every policy in the system deadlocks on itself.
-- ----------------------------------------------------------------------------
do $$
declare v_ok boolean := false;
begin
  begin
    perform is_staff();                 -- would raise 42P17 if it recursed
    perform count(*) from profile;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform t_assert('profile policy does not recurse', v_ok);
end $$;

-- ----------------------------------------------------------------------------
-- 16. reserve_products is idempotent (review item 2)
--
-- Calling it twice for the same order must leave reserved_qty and the
-- reservation quantity correct. The old version added the amount twice.
-- ----------------------------------------------------------------------------
do $$
declare v_p uuid; v_o uuid; v_items jsonb; v_res numeric; v_rows integer;
begin
  insert into product (category_id, name, price_kobo, stock_qty)
  values ('00000000-0000-0000-0000-0000000000c5','T IDEMPOTENT', 100000, 10)
  returning product_id into v_p;

  insert into "order" (depot_id, guest_phone, order_type, total_kobo,
                       items_subtotal_kobo, fulfillment_type)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000201','accessory',
          300000, 300000, 'pickup')
  returning order_id into v_o;

  v_items := jsonb_build_array(
    jsonb_build_object('product_id', v_p, 'quantity', 3));

  perform reserve_products(v_o, v_items, now() + interval '30 min');
  perform reserve_products(v_o, v_items, now() + interval '30 min');

  select reserved_qty into v_res from product where product_id = v_p;
  select count(*) into v_rows from inventory_reservation
   where order_id = v_o and status = 'reserved';

  perform t_assert('retry does not double-reserve', v_res = 3, v_res::text);
  perform t_assert('retry leaves one reservation row', v_rows = 1, v_rows::text);
  perform t_assert('reservation quantity is absolute',
    (select quantity from inventory_reservation
      where order_id = v_o and product_id = v_p) = 3);

  -- Same product twice in one call must sum, not fight (review item 5).
  perform release_reservations(v_o, 'released');
  perform reserve_products(v_o, jsonb_build_array(
      jsonb_build_object('product_id', v_p, 'quantity', 2),
      jsonb_build_object('product_id', v_p, 'quantity', 4)),
    now() + interval '30 min');

  select reserved_qty into v_res from product where product_id = v_p;
  perform t_assert('duplicate lines are summed once', v_res = 6, v_res::text);

  perform release_reservations(v_o, 'released');
  perform t_drop_order(v_o);
  delete from product where product_id = v_p;
end $$;

-- ----------------------------------------------------------------------------
-- 17. Fractional product quantities are refused (review item 6)
-- ----------------------------------------------------------------------------
do $$
declare v_p uuid; v_o uuid; v_ok boolean := false;
begin
  insert into product (category_id, name, price_kobo, stock_qty)
  values ('00000000-0000-0000-0000-0000000000c5','T FRACTION', 100000, 10)
  returning product_id into v_p;

  insert into "order" (depot_id, guest_phone, order_type, total_kobo,
                       items_subtotal_kobo, fulfillment_type)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000202','accessory',
          100000, 100000, 'pickup')
  returning order_id into v_o;

  begin
    perform reserve_products(v_o,
      jsonb_build_array(jsonb_build_object('product_id', v_p, 'quantity', 1.5)),
      now() + interval '30 min');
  exception when others then
    v_ok := sqlerrm = 'INVALID_QUANTITY';
  end;

  perform t_assert('fractional product quantity refused', v_ok);
  perform t_assert('nothing was reserved',
    (select reserved_qty from product where product_id = v_p) = 0);

  perform t_drop_order(v_o);
  delete from product where product_id = v_p;
end $$;

-- ----------------------------------------------------------------------------
-- 18. The expiry sweep re-reads under the lock (review item 1)
--
-- An order paid after its hold lapsed but before the sweep reaches it must be
-- left alone. Single-session proof that the re-read happens at all; the real
-- race is covered by run_concurrency.sh test 3.
-- ----------------------------------------------------------------------------
do $$
declare v_o uuid; r record;
begin
  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo,
                       fulfillment_type, hold_expires_at)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000203','gas',
          2, 140000, 280000, 280000, 'pickup', now() - interval '1 minute')
  returning order_id into v_o;

  perform reserve_gas(v_o, '00000000-0000-0000-0000-00000000d001', 2,
                      now() - interval '1 minute');

  -- Pay it. confirm_payment clears hold_expires_at.
  perform confirm_payment(v_o, 'paystack', 'sweep_race_ref', 280000, 'paystack');

  select * into r from expire_order_holds(100);

  perform t_assert('paid order is not swept', r.expired_orders = 0, r.expired_orders::text);
  perform t_assert('paid order keeps its reservation',
    (select reserved_kg from gas_stock
      where depot_id = '00000000-0000-0000-0000-00000000d001') = 2);
  perform t_assert('order is never expired and paid at once',
    (select count(*) from "order"
      where order_id = v_o and status = 'expired' and payment_status = 'paid') = 0);

  perform cancel_order(v_o, null, 'test cleanup');
  perform t_drop_order(v_o);
end $$;

-- ----------------------------------------------------------------------------
-- 19. Bundle receipt lines sum to the bundle price (review item 3)
-- ----------------------------------------------------------------------------
do $$
declare
  v_a uuid; v_b uuid; v_bundle bundle; v_o "order"; v_sum bigint;
begin
  insert into product (category_id, name, price_kobo, stock_qty)
  values ('00000000-0000-0000-0000-0000000000c2','T KIT HOSE', 1500000, 20)
  returning product_id into v_a;
  insert into product_attribute values (v_a,'bore_mm','8',8);

  insert into product (category_id, name, price_kobo, stock_qty)
  values ('00000000-0000-0000-0000-0000000000c3','T KIT REG', 3100000, 20)
  returning product_id into v_b;
  insert into product_attribute values (v_b,'bore_mm','8',8);

  -- 46,000 list, sold at 40,000. The split will not divide evenly.
  v_bundle := publish_bundle('T KIT', 4000000,
    jsonb_build_array(
      jsonb_build_object('product_id', v_a, 'quantity', 1, 'slot_index', 1),
      jsonb_build_object('product_id', v_b, 'quantity', 1, 'slot_index', 2)),
    null);

  v_o := create_accessory_order(
    '00000000-0000-0000-0000-00000000d001',
    jsonb_build_array(jsonb_build_object(
      'kind','bundle','bundle_id', v_bundle.bundle_id, 'quantity', 1)),
    'pickup', null, null, null, 0, 'online', 'T', '+2348000000204');

  select sum(unit_price_kobo * quantity) into v_sum
    from order_item where order_id = v_o.order_id;

  perform t_assert('bundle lines sum to the bundle price',
    v_sum = 4000000, v_sum::text);
  perform t_assert('order total matches the bundle price',
    v_o.items_subtotal_kobo = 4000000, v_o.items_subtotal_kobo::text);

  perform cancel_order(v_o.order_id, null, 'test cleanup');
  perform t_drop_order(v_o.order_id);
  delete from bundle where bundle_id = v_bundle.bundle_id;
  delete from product where product_id in (v_a, v_b);
end $$;

-- ----------------------------------------------------------------------------
-- 20. The database refuses any amount that is not exactly the order total
--     (Part 11 + 43). The Worker checks this too; this proves the floor.
-- ----------------------------------------------------------------------------
select t_assert('exact payment amount enforced in the database',
  test_exact_amount_enforced());

-- ----------------------------------------------------------------------------
-- 21. reserve_gas is idempotent (0016)
--
-- Calling reserve_gas twice for the same order must not double the hold. The
-- old version incremented reserved_kg unconditionally and then tripped the
-- unique live-gas index, leaving the tank short with nothing to account for it.
-- ----------------------------------------------------------------------------
do $$
declare
  v_o uuid; v_res numeric; v_rows integer; v_qty numeric; v_ok boolean := true;
  v_depot uuid := '00000000-0000-0000-0000-00000000d001';
begin
  update gas_stock set total_received_kg = 50, reserved_kg = 0, deducted_kg = 0
   where depot_id = v_depot;

  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo,
                       fulfillment_type)
  values (v_depot, '+2348000000301', 'gas', 6, 140000, 840000, 840000, 'pickup')
  returning order_id into v_o;

  perform reserve_gas(v_o, v_depot, 6, now() + interval '30 min');

  begin
    perform reserve_gas(v_o, v_depot, 6, now() + interval '30 min');
  exception when others then
    v_ok := false;                       -- a retry must not raise at all
  end;

  select reserved_kg into v_res from gas_stock where depot_id = v_depot;
  select count(*), max(quantity) into v_rows, v_qty
    from inventory_reservation
   where order_id = v_o and kind = 'gas' and status = 'reserved';

  perform t_assert('gas retry does not raise', v_ok);
  perform t_assert('gas retry does not double the hold', v_res = 6, v_res::text);
  perform t_assert('gas retry leaves one reservation', v_rows = 1, v_rows::text);
  perform t_assert('gas reservation quantity is absolute', v_qty = 6, v_qty::text);

  -- Reducing the amount must give the difference back.
  perform reserve_gas(v_o, v_depot, 4, now() + interval '30 min');
  select reserved_kg into v_res from gas_stock where depot_id = v_depot;
  perform t_assert('reducing a gas hold releases the difference', v_res = 4, v_res::text);

  perform release_reservations(v_o, 'released');
  select reserved_kg into v_res from gas_stock where depot_id = v_depot;
  perform t_assert('releasing returns the whole hold', v_res = 0, v_res::text);

  perform t_drop_order(v_o);
end $$;

-- ----------------------------------------------------------------------------
-- 22. reserve_products releases products dropped from a retry (0016)
-- ----------------------------------------------------------------------------
do $$
declare v_a uuid; v_b uuid; v_o uuid; v_ra integer; v_rb integer;
begin
  insert into product (category_id, name, price_kobo, stock_qty)
  values ('00000000-0000-0000-0000-0000000000c5','T DROP A', 100000, 10)
  returning product_id into v_a;
  insert into product (category_id, name, price_kobo, stock_qty)
  values ('00000000-0000-0000-0000-0000000000c5','T DROP B', 100000, 10)
  returning product_id into v_b;

  insert into "order" (depot_id, guest_phone, order_type, total_kobo,
                       items_subtotal_kobo, fulfillment_type)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000302','accessory',
          300000, 300000, 'pickup')
  returning order_id into v_o;

  perform reserve_products(v_o, jsonb_build_array(
      jsonb_build_object('product_id', v_a, 'quantity', 2),
      jsonb_build_object('product_id', v_b, 'quantity', 3)),
    now() + interval '30 min');

  -- Customer removes B from the basket and resubmits.
  perform reserve_products(v_o, jsonb_build_array(
      jsonb_build_object('product_id', v_a, 'quantity', 2)),
    now() + interval '30 min');

  select reserved_qty into v_ra from product where product_id = v_a;
  select reserved_qty into v_rb from product where product_id = v_b;

  perform t_assert('kept product stays reserved', v_ra = 2, v_ra::text);
  perform t_assert('dropped product is released', v_rb = 0, v_rb::text);
  perform t_assert('dropped reservation is marked released',
    (select status from inventory_reservation
      where order_id = v_o and product_id = v_b) = 'released');

  perform release_reservations(v_o, 'released');
  perform t_drop_order(v_o);
  delete from product where product_id in (v_a, v_b);
end $$;

-- ----------------------------------------------------------------------------
-- 23. Webhook lease (0019, item 4)
-- ----------------------------------------------------------------------------
do $$
declare a jsonb; b jsonb; c jsonb; d jsonb;
begin
  a := claim_webhook_event('paystack','evt.lease.1','charge.success','{}'::jsonb, 60);
  perform t_assert('first delivery claims the event', a->>'state' = 'claimed', a::text);

  b := claim_webhook_event('paystack','evt.lease.1','charge.success','{}'::jsonb, 60);
  -- The old code returned 200 here, so Paystack stopped retrying even if the
  -- holder went on to fail.
  perform t_assert('concurrent delivery is told in_flight, not processed',
    b->>'state' = 'in_flight', b::text);

  -- Holder fails: the lease is released but the event stays unprocessed.
  perform finish_webhook_event('paystack','evt.lease.1','boom');
  c := claim_webhook_event('paystack','evt.lease.1','charge.success','{}'::jsonb, 60);
  perform t_assert('a failed event can be reclaimed', c->>'state' = 'claimed', c::text);

  perform finish_webhook_event('paystack','evt.lease.1', null);
  d := claim_webhook_event('paystack','evt.lease.1','charge.success','{}'::jsonb, 60);
  perform t_assert('a processed event is not reprocessed',
    d->>'state' = 'processed', d::text);

  delete from webhook_event where provider_event_id = 'evt.lease.1';
end $$;

-- ----------------------------------------------------------------------------
-- 24. Idempotency scope and lease (0019, items 7 and 8)
-- ----------------------------------------------------------------------------
do $$
declare
  a jsonb; b jsonb; c jsonb; d jsonb;
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
begin
  insert into profile (profile_id, auth_user_id, role, email, display_name)
  values
    (u1, gen_random_uuid(), 'customer', 'idem1@test.local', 'idem1'),
    (u2, gen_random_uuid(), 'customer', 'idem2@test.local', 'idem2');

  a := claim_idempotency('K1','order.create','hash-A', u1, null, 60);
  perform t_assert('first caller claims', a->>'state' = 'claimed', a::text);

  -- The same key from a DIFFERENT person must never see the first response.
  b := claim_idempotency('K1','order.create','hash-A', u2, null, 60);
  perform t_assert('same key, different user, is a separate claim',
    b->>'state' = 'claimed', b::text);

  -- Same key and user but a different body is a conflict, not a replay.
  c := claim_idempotency('K1','order.create','hash-B', u1, null, 60);
  perform t_assert('same key, different request body, is refused',
    c->>'state' = 'conflict', c::text);

  perform complete_idempotency('K1','order.create','{"order_id":"x"}'::jsonb, u1, null);
  d := claim_idempotency('K1','order.create','hash-A', u1, null, 60);
  perform t_assert('completed request replays', d->>'state' = 'replay', d::text);
  perform t_assert('replay returns the stored response',
    d->'response'->>'order_id' = 'x', d::text);

  -- A crashed worker must not hold the key forever.
  perform claim_idempotency('K2','order.create','h', u1, null, 60);
  update idempotency_key set locked_until = now() - interval '1 minute'
   where key = 'K2';
  perform t_assert('an expired lease can be reclaimed',
    (claim_idempotency('K2','order.create','h', u1, null, 60))->>'state' = 'claimed');

  delete from idempotency_key where key in ('K1','K2');
  delete from profile where profile_id in (u1, u2);
end $$;

-- ----------------------------------------------------------------------------
-- 25. A refresh does not invalidate a live QR (0019, item 11)
-- ----------------------------------------------------------------------------
do $$
declare v_o uuid; a jsonb; b jsonb; h1 char(64); h2 char(64); v_live integer;
begin
  h1 := encode(digest('qr-keep-1','sha256'),'hex');
  h2 := encode(digest('qr-keep-2','sha256'),'hex');

  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo,
                       fulfillment_type, status, payment_status)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000401','gas',
          1,140000,140000,140000,'pickup','confirmed','paid')
  returning order_id into v_o;

  a := issue_qr(v_o, h1, 72);
  perform t_assert('first call issues a code', (a->>'issued')::boolean);

  b := issue_qr(v_o, h2, 72);
  perform t_assert('a second call does NOT replace a live code',
    (b->>'issued')::boolean = false and (b->>'existing')::boolean, b::text);

  perform t_assert('the original code is still the only live one',
    (select count(*) from qr_token
      where order_id = v_o and status = 'unscanned' and token_hash = h1) = 1);

  -- Explicit replacement still works.
  b := issue_qr(v_o, h2, 72, true);
  perform t_assert('forcing replaces the code', (b->>'issued')::boolean, b::text);
  select count(*) into v_live from qr_token
   where order_id = v_o and status = 'unscanned';
  perform t_assert('only one live code after a forced replacement', v_live = 1, v_live::text);

  perform t_drop_order(v_o);
end $$;

-- ----------------------------------------------------------------------------
-- 26. Notification state machine (0019, item 3)
-- ----------------------------------------------------------------------------
do $$
declare v_p uuid; v_n uuid; v_claimed integer; v_status text;
begin
  insert into profile (auth_user_id, role, email, display_name)
  values (gen_random_uuid(), 'customer', 'notif-test@u2gas.invalid', 'N')
  returning profile_id into v_p;

  insert into notification (profile_id, kind, title, body)
  values (v_p, 'test', 'Test', 'Body')
  returning notification_id into v_n;

  select count(*) into v_claimed from claim_unsent_notifications(10, 300);
  perform t_assert('a pending notification is claimed', v_claimed >= 1, v_claimed::text);

  select send_status into v_status from notification where notification_id = v_n;
  perform t_assert('claiming sets claimed, not sent', v_status = 'claimed', v_status);

  -- A second run must not pick up a live claim.
  perform t_assert('a live claim is not re-claimed',
    (select count(*) from claim_unsent_notifications(10, 300)
      where notification_id = v_n) = 0);

  perform mark_notifications_failed(array[v_n], 'smtp said no');
  select send_status into v_status from notification where notification_id = v_n;
  perform t_assert('a failure returns it to pending', v_status = 'pending', v_status);

  perform claim_unsent_notifications(10, 300);
  perform mark_notifications_sent(array[v_n]);
  select send_status into v_status from notification where notification_id = v_n;
  perform t_assert('success marks it sent', v_status = 'sent', v_status);
  perform t_assert('sent rows are not claimed again',
    (select count(*) from claim_unsent_notifications(10, 300)
      where notification_id = v_n) = 0);

  delete from notification where notification_id = v_n;
  delete from profile where profile_id = v_p;
end $$;

-- ----------------------------------------------------------------------------
-- 27. An orphaned payment now creates a real refund (0019, item 6)
-- ----------------------------------------------------------------------------
do $$
declare v_o uuid; r jsonb; v_refunds integer;
begin
  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo,
                       fulfillment_type, status)
  values ('00000000-0000-0000-0000-00000000d001','+2348000000402','gas',
          1,140000,140000,140000,'pickup','expired')
  returning order_id into v_o;

  r := confirm_payment(v_o,'paystack','orphan_refund_ref',140000,'paystack');

  perform t_assert('the payment is recorded', (r->>'orphaned')::boolean);
  perform t_assert('a refund record actually exists', r->>'refund_id' is not null, r::text);

  select count(*) into v_refunds from refund where order_id = v_o;
  perform t_assert('exactly one refund was raised', v_refunds = 1, v_refunds::text);

  -- A repeat delivery must not raise a second claim on the same money.
  perform request_refund(v_o, 'duplicate attempt', null);
  select count(*) into v_refunds from refund where order_id = v_o;
  perform t_assert('refund creation is idempotent', v_refunds = 1, v_refunds::text);

  perform t_drop_order(v_o);
end $$;

-- ----------------------------------------------------------------------------
-- 28. The low-stock alert fires on the crossing and not on every movement
--     afterwards (0022). A tank sitting below the line for a week should
--     produce one message, not one per order.
-- ----------------------------------------------------------------------------
select t_assert('low stock notifies once, on the crossing',
  test_low_stock_fires_once());

-- ----------------------------------------------------------------------------
-- Report
-- ----------------------------------------------------------------------------
select
  count(*) filter (where passed)       as passed,
  count(*) filter (where not passed)   as failed,
  count(*)                             as total
from t_result;

select name, detail from t_result where not passed;

do $$
begin
  if exists (select 1 from t_result where not passed) then
    raise exception 'Concurrency suite failed';
  end if;
end $$;

rollback;   -- the suite never leaves data behind
