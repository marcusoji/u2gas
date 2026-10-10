-- ============================================================================
-- 0027 — confirm_payment must not treat a pre-created pending row as a replay
--
-- `POST /payments/initialize` inserts the `payment` row as soon as Monnify
-- hands back a checkout URL, precisely so the webhook has a row to settle:
--
--     insert into payment (..., provider_reference, status)
--     values (..., $reference, 'pending');
--
-- The unique index is `(provider, provider_reference)`, so that row is the
-- one the webhook's `confirm_payment(p_provider, p_reference, ...)` resolves.
--
-- The duplicate-delivery guard at the top of confirm_payment, however, matched
-- on *existence alone*. It therefore found that pending row, returned
-- `already_processed: true` without touching the order, and the webhook —
-- which treats a 200 as "done" — closed the event as processed.
--
-- Observable result: every online payment ran `initialize` → customer pays at
-- Monnify → webhook 200 → order still `payment_status: 'pending'`,
-- `status: 'pending'`, and the customer's gas never confirmed. A repeat
-- delivery hit the same guard and also did nothing (and, because the event was
-- already marked processed, the route answered `duplicate: true` before it
-- even reached confirm_payment). Money in, order not fulfilled.
--
-- The fix is to only short-circuit when the existing row is actually settled.
-- A row still `pending` is not a replay — it is precisely the attempt this call
-- exists to settle — so the function falls through, takes the order lock, and
-- runs the normal amount check and confirmation. The `payment_one_paid_per_order`
-- unique index plus the "order already paid" branch keep a genuine duplicate
-- delivery idempotent:
--
--   * row exists and is paid  → replay (returned above)
--   * order already paid      → replay (returned below)
--   * row exists and pending  → settle it in place (new behaviour)
--
-- Settling in place is also what keeps the orphan branch off the
-- (provider, reference) unique index: it would otherwise insert a second row
-- for a reference initialize already created.
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
  v_order      "order";
  v_payment_id uuid;
  v_existing   payment;
  v_change     bigint;
  v_refund     jsonb;
begin
  -- Duplicate delivery: answer before taking any write locks — but only when
  -- the row we would be reusing has in fact been settled. A `pending` row is
  -- the in-flight attempt (created by initialize), not a replay.
  if p_reference is not null then
    select * into v_existing from payment
     where provider = p_provider and provider_reference = p_reference;
    if v_existing.payment_id is not null and v_existing.status = 'paid' then
      return jsonb_build_object(
        'payment_id', v_existing.payment_id,
        'already_processed', true,
        'orphaned', exists (select 1 from "order" o
                            where o.order_id = v_existing.order_id
                              and o.status in ('cancelled','expired')));
    end if;
  end if;

  if p_currency <> 'NGN' then
    raise exception 'CURRENCY_MISMATCH'
      using detail = json_build_object('expected','NGN','received',p_currency)::text;
  end if;

  select * into v_order from "order" where order_id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  -- A pending initialize row for this same reference, if any. Settled in place
  -- below rather than re-inserted, so the (provider, reference) unique index
  -- is never asked for a duplicate.
  v_existing := null;
  if p_reference is not null then
    select * into v_existing from payment
     where provider = p_provider and provider_reference = p_reference;
  end if;

  -- Money for a dead order.
  if v_order.status in ('cancelled','expired') then
    if v_existing.payment_id is not null then
      update payment
         set status = 'paid', amount_kobo = p_amount_kobo, method = p_method,
             currency = p_currency, raw_payload = p_payload, paid_at = now(),
             recorded_by_staff_id = p_staff_id
       where payment_id = v_existing.payment_id
       returning payment.payment_id into v_payment_id;
    else
      insert into payment (order_id, provider, provider_reference, amount_kobo,
                           method, status, currency, raw_payload, paid_at,
                           recorded_by_staff_id)
      values (p_order_id, p_provider, p_reference, p_amount_kobo,
              p_method, 'paid', p_currency, p_payload, now(), p_staff_id)
      returning payment.payment_id into v_payment_id;
    end if;

    -- The refund the customer is about to be promised. request_refund is
    -- idempotent, so a repeat delivery cannot raise a second claim on the
    -- same money.
    v_refund := request_refund(
      p_order_id,
      'Payment arrived after the order was ' || v_order.status,
      p_staff_id);

    insert into audit_log (actor_id, action, entity_type, entity_id, after, note)
    values (p_staff_id, 'payment.orphaned', 'order', p_order_id,
            json_build_object('payment_id', v_payment_id,
                              'refund_id', v_refund->>'refund_id',
                              'amount_kobo', p_amount_kobo,
                              'order_status', v_order.status)::jsonb,
            'Payment captured for an order already ' || v_order.status);

    insert into notification (profile_id, order_id, kind, title, body)
    select o.user_id, o.order_id, 'payment.orphaned',
           'We owe you a refund',
           'Your payment for ' || o.order_number ||
           ' arrived after the order closed. A refund has been raised.'
    from "order" o
    where o.order_id = p_order_id and o.user_id is not null;

    return jsonb_build_object(
      'payment_id', v_payment_id,
      'already_processed', false,
      'orphaned', true,
      'refund_id', v_refund->>'refund_id',
      'order_status', v_order.status,
      'refund_required', true);
  end if;

  if v_order.payment_status = 'paid' then
    select * into v_existing from payment
     where order_id = p_order_id and status = 'paid' limit 1;
    return jsonb_build_object(
      'payment_id', v_existing.payment_id, 'already_processed', true);
  end if;

  if p_amount_kobo <> v_order.total_kobo then
    raise exception 'AMOUNT_MISMATCH'
      using detail = json_build_object(
        'expected_kobo', v_order.total_kobo,
        'received_kobo', p_amount_kobo,
        'direction', case when p_amount_kobo < v_order.total_kobo
                          then 'under' else 'over' end)::text;
  end if;

  if p_method = 'cash' then
    if p_tendered is null or p_tendered < v_order.total_kobo then
      raise exception 'INSUFFICIENT_TENDER'
        using detail = json_build_object(
          'expected_kobo', v_order.total_kobo, 'tendered_kobo', p_tendered)::text;
    end if;
    v_change := p_tendered - v_order.total_kobo;
  end if;

  if v_existing.payment_id is not null then
    -- Settle the initialize row in place. `paid_at` is what the
    -- payment_paid_has_timestamp constraint requires; it was null while the
    -- row waited for the gateway.
    update payment
       set status = 'paid', amount_kobo = p_amount_kobo, method = p_method,
           amount_tendered_kobo = p_tendered, change_due_kobo = v_change,
           currency = p_currency, raw_payload = p_payload, paid_at = now(),
           recorded_by_staff_id = p_staff_id
     where payment_id = v_existing.payment_id
     returning payment.payment_id into v_payment_id;
  else
    insert into payment (order_id, provider, provider_reference, amount_kobo,
                         method, status, amount_tendered_kobo, change_due_kobo,
                         currency, raw_payload, paid_at, recorded_by_staff_id)
    values (p_order_id, p_provider, p_reference, p_amount_kobo,
            p_method, 'paid', p_tendered, v_change,
            p_currency, p_payload, now(), p_staff_id)
    returning payment.payment_id into v_payment_id;
  end if;

  update "order"
     set payment_status = 'paid', status = 'confirmed', hold_expires_at = null
   where order_id = p_order_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (p_staff_id, 'payment.confirmed', 'order', p_order_id,
          json_build_object('payment_id', v_payment_id, 'method', p_method,
                            'amount_kobo', p_amount_kobo)::jsonb);

  return jsonb_build_object('payment_id', v_payment_id,
                            'already_processed', false, 'orphaned', false);
end $$;

-- Redefining a function resets its grants, and a business function executable
-- by PUBLIC is how a browser client ends up marking its own order paid.
revoke all on function confirm_payment(uuid, text, text, bigint, payment_method,
                                       jsonb, uuid, bigint, char) from public;
revoke all on function confirm_payment(uuid, text, text, bigint, payment_method,
                                       jsonb, uuid, bigint, char) from anon, authenticated;
