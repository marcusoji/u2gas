-- ============================================================================
-- U2GAS — 0014 exact payment amount, enforced in the database
--
-- PART 11 + PART 43.
--
-- The Worker already rejects a Paystack amount that does not equal the order
-- total. The database did not: confirm_payment only refused an UNDERPAYMENT,
-- so an overpayment confirmed the order silently and the customer was
-- quietly out of pocket with no record of the discrepancy.
--
-- Part 43 is explicit that application validation is not enough for financial
-- integrity. Any path that reaches confirm_payment — the webhook, the return
-- from checkout, a cashier, or a future integration nobody has written yet —
-- must be held to the same rule.
--
-- Currency is now checked here too, for the same reason.
-- ============================================================================

create or replace function confirm_payment(
  p_order_id    uuid,
  p_provider    text,
  p_reference   text,
  p_amount_kobo bigint,
  p_method      payment_method,
  p_payload     jsonb   default null,
  p_staff_id    uuid    default null,
  p_tendered    bigint  default null,
  p_currency    char(3) default 'NGN'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order       "order";
  v_payment_id  uuid;
  v_existing    payment;
  v_change      bigint;
begin
  -- Duplicate delivery: answer before taking any write locks.
  if p_reference is not null then
    select * into v_existing from payment
     where provider = p_provider and provider_reference = p_reference;
    if found then
      return jsonb_build_object(
        'payment_id', v_existing.payment_id,
        'already_processed', true,
        'orphaned', v_existing.status = 'paid'
                    and exists (select 1 from "order" o
                                where o.order_id = v_existing.order_id
                                  and o.status in ('cancelled','expired')));
    end if;
  end if;

  if p_currency <> 'NGN' then
    raise exception 'CURRENCY_MISMATCH'
      using detail = json_build_object('expected', 'NGN', 'received', p_currency)::text;
  end if;

  select * into v_order from "order" where order_id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- Money for a dead order. Record it and commit; do not raise, or the record
  -- rolls back with the transaction. (Fixed in 0009, preserved here.)
  if v_order.status in ('cancelled','expired') then
    insert into payment (order_id, provider, provider_reference, amount_kobo,
                         method, status, raw_payload, paid_at, recorded_by_staff_id)
    values (p_order_id, p_provider, p_reference, p_amount_kobo,
            p_method, 'paid', p_payload, now(), p_staff_id)
    returning payment.payment_id into v_payment_id;

    insert into audit_log (action, entity_type, entity_id, after, note)
    values ('payment.orphaned', 'order', p_order_id,
            json_build_object('payment_id', v_payment_id,
                              'amount_kobo', p_amount_kobo,
                              'order_status', v_order.status)::jsonb,
            'Payment captured for an order already ' || v_order.status
              || '. Refund required.');

    insert into notification (profile_id, order_id, kind, title, body)
    select o.user_id, o.order_id, 'payment.orphaned',
           'We owe you a refund',
           'Your payment for ' || o.order_number ||
           ' arrived after the order closed. We are refunding it.'
    from "order" o
    where o.order_id = p_order_id and o.user_id is not null;

    return jsonb_build_object(
      'payment_id', v_payment_id,
      'already_processed', false,
      'orphaned', true,
      'order_status', v_order.status,
      'refund_required', true);
  end if;

  if v_order.payment_status = 'paid' then
    select * into v_existing from payment
     where order_id = p_order_id and status = 'paid' limit 1;
    return jsonb_build_object(
      'payment_id', v_existing.payment_id, 'already_processed', true);
  end if;

  -- PART 11 — exact, not "at least".
  --
  -- An overpayment is as much an anomaly as an underpayment: it means the
  -- amount was computed somewhere other than from this order, which is
  -- exactly the condition worth refusing. The discrepancy is written to the
  -- audit log before the raise, in its own transaction-safe way: the insert
  -- would roll back with the exception, so it is deliberately NOT attempted
  -- here. The caller logs it instead, where the write survives.
  if p_amount_kobo <> v_order.total_kobo then
    raise exception 'AMOUNT_MISMATCH'
      using detail = json_build_object(
        'expected_kobo', v_order.total_kobo,
        'received_kobo', p_amount_kobo,
        'direction', case when p_amount_kobo < v_order.total_kobo
                          then 'under' else 'over' end)::text;
  end if;

  -- Cash is the one method where the customer hands over more than the total.
  -- That difference is change, not overpayment: amount_kobo stays equal to the
  -- order total and the surplus is recorded separately.
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
                       currency, raw_payload, paid_at, recorded_by_staff_id)
  values (p_order_id, p_provider, p_reference, p_amount_kobo,
          p_method, 'paid', p_tendered, v_change,
          p_currency, p_payload, now(), p_staff_id)
  returning payment.payment_id into v_payment_id;

  update "order"
     set payment_status = 'paid',
         status = 'confirmed',
         hold_expires_at = null
   where order_id = p_order_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (p_staff_id, 'payment.confirmed', 'order', p_order_id,
          json_build_object('payment_id', v_payment_id,
                            'method', p_method,
                            'amount_kobo', p_amount_kobo)::jsonb);

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'already_processed', false,
    'orphaned', false);
end $$;

-- Re-apply the execute grants from 0012. Redefining a function resets them,
-- and a business function executable by PUBLIC is how a browser client ends
-- up marking its own order paid.
revoke all on function confirm_payment(uuid, text, text, bigint, payment_method,
                                       jsonb, uuid, bigint, char) from public;
revoke all on function confirm_payment(uuid, text, text, bigint, payment_method,
                                       jsonb, uuid, bigint, char) from anon, authenticated;

-- The old 8-argument signature would otherwise linger and stay callable.
drop function if exists confirm_payment(uuid, text, text, bigint, payment_method,
                                        jsonb, uuid, bigint);

-- ----------------------------------------------------------------------------
-- Regression guard
-- ----------------------------------------------------------------------------

create or replace function test_exact_amount_enforced()
returns boolean language plpgsql as $$
declare
  v_order uuid;
  v_over boolean := false;
  v_under boolean := false;
  v_paid integer;
begin
  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo,
                       fulfillment_type)
  values ('00000000-0000-0000-0000-00000000d001','+2348000009998','gas',
          1, 140000, 140000, 140000, 'pickup')
  returning order_id into v_order;

  begin
    perform confirm_payment(v_order, 'paystack', 'over_ref', 200000, 'paystack');
  exception when others then
    v_over := sqlerrm = 'AMOUNT_MISMATCH';
  end;

  begin
    perform confirm_payment(v_order, 'paystack', 'under_ref', 100000, 'paystack');
  exception when others then
    v_under := sqlerrm = 'AMOUNT_MISMATCH';
  end;

  select count(*) into v_paid from payment where order_id = v_order;

  delete from "order" where order_id = v_order;

  -- Both refused, and neither wrote a payment row.
  return v_over and v_under and v_paid = 0;
end $$;
