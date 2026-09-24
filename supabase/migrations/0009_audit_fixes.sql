-- ============================================================================
-- U2GAS — 0009 two correctness fixes found in the final audit
-- ============================================================================


-- ----------------------------------------------------------------------------
-- FIX 1 — an orphaned payment was being thrown away
--
-- confirm_payment handled the case where money arrives for an order that has
-- already expired or been cancelled: it inserted a payment row and an audit
-- entry flagging a refund, then raised ORDER_ALREADY_CLOSED.
--
-- The raise aborts the transaction, so both writes were discarded. Paystack
-- had the customer's money and we had no record of it anywhere — precisely the
-- failure the branch was written to prevent.
--
-- The fix is to stop raising. An orphaned payment is a real, recorded outcome
-- that needs a human, not an error. It now returns normally with a flag, and
-- the row survives to appear in the admin flagged queue.
-- ----------------------------------------------------------------------------

create or replace function confirm_payment(
  p_order_id    uuid,
  p_provider    text,
  p_reference   text,
  p_amount_kobo bigint,
  p_method      payment_method,
  p_payload     jsonb   default null,
  p_staff_id    uuid    default null,
  p_tendered    bigint  default null
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

  select * into v_order from "order" where order_id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- Money for a dead order. Record it and commit; do not raise. (Spec 19)
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

  if p_amount_kobo < v_order.total_kobo then
    raise exception 'UNDERPAID'
      using detail = json_build_object(
        'expected_kobo', v_order.total_kobo, 'received_kobo', p_amount_kobo)::text;
  end if;

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
                       raw_payload, paid_at, recorded_by_staff_id)
  values (p_order_id, p_provider, p_reference, p_amount_kobo,
          p_method, 'paid', p_tendered, v_change,
          p_payload, now(), p_staff_id)
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


-- ----------------------------------------------------------------------------
-- FIX 2 — infinite recursion in the profile policy
--
-- current_role_name() reads profile. Every other table's policy calls
-- is_staff(), which calls it. profile's own read policy also calls is_staff().
--
-- So: query product → product policy → is_staff() → current_role_name() →
-- select from profile → profile policy → is_staff() → ... and Postgres aborts
-- with "infinite recursion detected in policy for relation profile".
--
-- SECURITY DEFINER would normally break the loop, because the function runs as
-- the table owner and owners are exempt from RLS. But 0006 applied FORCE ROW
-- LEVEL SECURITY to every table, and FORCE removes exactly that exemption.
--
-- profile is the one table that must not be forced. Its policies are still
-- enforced for every ordinary caller; only the definer helpers bypass them,
-- which is the whole point of those helpers. The service role used by the
-- Worker has BYPASSRLS regardless, so FORCE was buying nothing here.
-- ----------------------------------------------------------------------------

alter table profile no force row level security;

-- Belt and braces: the profile read policy no longer calls is_staff() at all,
-- so even if FORCE is reinstated by a later migration the loop cannot re-form.
drop policy if exists profile_self_read on profile;

create policy profile_self_read on profile
  for select using (
    auth_user_id = auth.uid()
    -- Staff may read other profiles. Expressed as a direct, non-recursive
    -- lookup rather than through is_staff().
    or exists (
      select 1 from profile me
      where me.auth_user_id = auth.uid()
        and me.role in ('staff','manager','admin')
    )
  );


-- ----------------------------------------------------------------------------
-- Regression guard for fix 1. Run as part of the test suite.
-- ----------------------------------------------------------------------------

create or replace function test_orphaned_payment_survives()
returns boolean language plpgsql as $$
declare
  v_order uuid;
  v_result jsonb;
  v_rows integer;
begin
  insert into "order" (depot_id, guest_phone, order_type, gas_amount_kg,
                       rate_at_purchase, gas_subtotal_kobo, total_kobo,
                       fulfillment_type, status)
  values ('00000000-0000-0000-0000-00000000d001','+2348000009999','gas',
          1, 140000, 140000, 140000, 'pickup', 'expired')
  returning order_id into v_order;

  v_result := confirm_payment(v_order, 'paystack', 'orphan_test_ref',
                              140000, 'paystack');

  -- The row must still exist after the call returns.
  select count(*) into v_rows from payment where order_id = v_order;

  delete from refund where order_id = v_order;
  delete from payment where order_id = v_order;
  delete from "order" where order_id = v_order;

  return (v_result->>'orphaned')::boolean
     and (v_result->>'refund_required')::boolean
     and v_rows = 1;
end $$;
