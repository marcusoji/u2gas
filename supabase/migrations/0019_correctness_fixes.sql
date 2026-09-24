-- ============================================================================
-- U2GAS — 0019 correctness fixes
--
-- Items 3, 6, 7, 8, 9, 10, 11 and 12 from the review.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- ITEM 3 — the notification state machine was never finished
--
-- claim_unsent_notifications moved rows to 'claimed', but nothing called
-- mark_notifications_sent or mark_notifications_failed. The Edge Function set
-- emailed_at by hand on the way out and reset it to null on failure, which
-- bypasses the state machine entirely: a crash between claim and that manual
-- write left the row claimed forever, invisible to every later run.
--
-- The claim now carries a lease. A claim older than the lease is fair game
-- again, so a crashed worker delays a message rather than losing it.
-- ----------------------------------------------------------------------------

alter table notification
  add column if not exists claimed_at timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text,
  add column if not exists send_status text not null default 'pending';

alter table notification
  drop constraint if exists notification_send_status_check;
alter table notification
  add constraint notification_send_status_check
  check (send_status in ('pending','claimed','sent','failed','abandoned'));

create index if not exists notification_claimable_idx
  on notification (send_status, claimed_at)
  where send_status in ('pending','claimed');

/**
 * Claim a batch for sending.
 *
 * Reclaims anything whose lease has expired, so a worker that died mid-send
 * does not strand its batch. Gives up after five attempts rather than
 * retrying a permanently bad address forever.
 */
create or replace function claim_unsent_notifications(
  p_limit integer default 50,
  p_lease_seconds integer default 300
)
returns table (
  notification_id uuid,
  email text,
  title text,
  body text,
  kind text,
  order_number text
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with claimable as (
    select n.notification_id
      from notification n
      join profile p on p.profile_id = n.profile_id
     where p.email is not null
       and n.created_at > now() - interval '2 days'   -- do not send stale news
       and n.attempts < 5
       and (
         n.send_status = 'pending'
         -- Lease expired: the worker that held this is gone.
         or (n.send_status = 'claimed'
             and n.claimed_at < now() - make_interval(secs => p_lease_seconds))
       )
     order by n.created_at
     limit p_limit
     for update of n skip locked
  ),
  taken as (
    update notification n
       set send_status = 'claimed',
           claimed_at  = now(),
           attempts    = n.attempts + 1
      from claimable c
     where n.notification_id = c.notification_id
    returning n.notification_id, n.profile_id, n.title, n.body, n.kind, n.order_id
  )
  select t.notification_id,
         p.email::text,
         t.title,
         t.body,
         t.kind,
         (select o.order_number from "order" o where o.order_id = t.order_id)
  from taken t
  join profile p on p.profile_id = t.profile_id;
end $$;

create or replace function mark_notifications_sent(p_ids uuid[])
returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update notification
     set send_status = 'sent',
         emailed_at  = now(),
         last_error  = null,
         claimed_at  = null
   where notification_id = any(p_ids)
     and send_status = 'claimed';      -- only our own claim
  get diagnostics v_count = row_count;
  return v_count;
end $$;

/**
 * Hand a failed batch back.
 *
 * Returns to 'pending' so the next run retries, unless it has burned through
 * its attempts — then 'abandoned', because a message that has failed five
 * times is not going to succeed on the sixth and will otherwise block the
 * queue forever.
 */
create or replace function mark_notifications_failed(p_ids uuid[], p_error text)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update notification
     set send_status = case when attempts >= 5 then 'abandoned' else 'pending' end,
         last_error  = left(coalesce(p_error, 'send failed'), 500),
         claimed_at  = null
   where notification_id = any(p_ids)
     and send_status = 'claimed';
  get diagnostics v_count = row_count;
  return v_count;
end $$;


-- ----------------------------------------------------------------------------
-- ITEM 6 — an orphaned payment promised a refund that did not exist
--
-- confirm_payment recorded the payment, wrote the audit line and told the
-- customer a refund was coming — but created no refund row, so nothing ever
-- appeared in the admin queue and nobody was ever going to action it.
--
-- 0018 added the refund workflow. This wires the orphan branch into it.
-- ----------------------------------------------------------------------------

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
      using detail = json_build_object('expected','NGN','received',p_currency)::text;
  end if;

  select * into v_order from "order" where order_id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  -- Money for a dead order.
  if v_order.status in ('cancelled','expired') then
    insert into payment (order_id, provider, provider_reference, amount_kobo,
                         method, status, currency, raw_payload, paid_at,
                         recorded_by_staff_id)
    values (p_order_id, p_provider, p_reference, p_amount_kobo,
            p_method, 'paid', p_currency, p_payload, now(), p_staff_id)
    returning payment.payment_id into v_payment_id;

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

  insert into payment (order_id, provider, provider_reference, amount_kobo,
                       method, status, amount_tendered_kobo, change_due_kobo,
                       currency, raw_payload, paid_at, recorded_by_staff_id)
  values (p_order_id, p_provider, p_reference, p_amount_kobo,
          p_method, 'paid', p_tendered, v_change,
          p_currency, p_payload, now(), p_staff_id)
  returning payment.payment_id into v_payment_id;

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


-- ----------------------------------------------------------------------------
-- ITEMS 7 and 8 — idempotency matched on the key alone, and could jam
--
-- A key is supplied by the client. Matching on it alone means a key reused by
-- a different person, for a different endpoint, or with a different body would
-- have returned the first caller's response — a cross-user data leak dressed
-- as a replay.
--
-- And a crash between claim and complete left the row 'in_progress' forever,
-- blocking that key permanently.
--
-- Both are fixed here: identity and request hash are part of the match, and
-- the claim carries a lease.
-- ----------------------------------------------------------------------------

alter table idempotency_key
  add column if not exists guest_token_hash char(64),
  add column if not exists locked_until timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists id uuid default gen_random_uuid();

do $$ begin
  if exists (
    select 1 from pg_constraint
     where conname = 'idempotency_key_pkey' and conrelid = 'idempotency_key'::regclass
  ) then
    alter table idempotency_key drop constraint idempotency_key_pkey;
  end if;
end $$;
update idempotency_key set id = gen_random_uuid() where id is null;
alter table idempotency_key alter column id set not null;
alter table idempotency_key add primary key (id);

create unique index if not exists idempotency_scope_idx
  on idempotency_key (key, scope, coalesce(profile_id::text, coalesce(guest_token_hash, 'anon')));

create index if not exists idempotency_locked_idx
  on idempotency_key (locked_until) where status = 'in_progress';

/**
 * Claim a key for this exact request.
 *
 * Returns one of:
 *   claimed   — go ahead and do the work
 *   replay    — completed before; the stored response is returned verbatim
 *   conflict  — same key, different request. Refused rather than answered
 *               with someone else's result.
 *   in_flight — another worker holds a live lease on it
 */
create or replace function claim_idempotency(
  p_key          text,
  p_scope        text,
  p_request_hash text,
  p_profile_id   uuid default null,
  p_guest_hash   char(64) default null,
  p_lease_seconds integer default 60
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row idempotency_key;
  v_identity text := coalesce(p_profile_id::text, coalesce(p_guest_hash, 'anon'));
begin
  select * into v_row
    from idempotency_key
   where key = p_key
     and scope = p_scope
     and coalesce(profile_id::text, coalesce(guest_token_hash, 'anon')) = v_identity
   for update;

  if found then
    -- Same key and identity, different body. Never answer this with the
    -- earlier response.
    if v_row.request_hash is distinct from p_request_hash then
      return jsonb_build_object('state','conflict');
    end if;

    if v_row.status = 'completed' then
      return jsonb_build_object('state','replay','response', v_row.response);
    end if;

    if v_row.status = 'in_progress'
       and v_row.locked_until is not null
       and v_row.locked_until > now() then
      return jsonb_build_object('state','in_flight',
                                'retry_after_seconds',
                                greatest(1, extract(epoch from v_row.locked_until - now())::int));
    end if;

    -- Lease expired or the previous attempt failed: take it over.
    update idempotency_key
       set status = 'in_progress',
           locked_until = now() + make_interval(secs => p_lease_seconds),
           attempts = attempts + 1,
           response = null
     where id = v_row.id;

    return jsonb_build_object('state','claimed','reclaimed', true);
  end if;

  insert into idempotency_key
    (key, scope, profile_id, guest_token_hash, request_hash, status, locked_until, attempts)
  values
    (p_key, p_scope, p_profile_id, p_guest_hash, p_request_hash,
     'in_progress', now() + make_interval(secs => p_lease_seconds), 1);

  return jsonb_build_object('state','claimed','reclaimed', false);
exception
  -- Two callers raced the insert. The loser reports in_flight rather than
  -- doing the work twice.
  when unique_violation then
    return jsonb_build_object('state','in_flight','retry_after_seconds', 2);
end $$;

create or replace function complete_idempotency(
  p_key text, p_scope text, p_response jsonb,
  p_profile_id uuid default null, p_guest_hash char(64) default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update idempotency_key
     set status = 'completed', response = p_response, locked_until = null
   where key = p_key and scope = p_scope
     and coalesce(profile_id::text, coalesce(guest_token_hash,'anon'))
         = coalesce(p_profile_id::text, coalesce(p_guest_hash,'anon'));
end $$;

create or replace function release_idempotency(
  p_key text, p_scope text,
  p_profile_id uuid default null, p_guest_hash char(64) default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Released, not deleted: the attempt count survives so a request that fails
  -- repeatedly is visible rather than looking fresh every time.
  update idempotency_key
     set status = 'failed', locked_until = null
   where key = p_key and scope = p_scope
     and coalesce(profile_id::text, coalesce(guest_token_hash,'anon'))
         = coalesce(p_profile_id::text, coalesce(p_guest_hash,'anon'));
end $$;


-- ----------------------------------------------------------------------------
-- ITEM 10 — the gas rate update was three separate writes
--
-- The rate, its history row and the audit entry were written one after
-- another. A failure between them left the rate changed with no record of who
-- changed it or what it was before — the exact question asked when a customer
-- disputes a price.
-- ----------------------------------------------------------------------------

create or replace function set_gas_rate(
  p_depot_id uuid,
  p_rate_kobo bigint,
  p_actor_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before bigint;
begin
  if p_rate_kobo is null or p_rate_kobo <= 0 then
    raise exception 'INVALID_RATE' using detail = '{"field":"rate_kobo_per_kg"}';
  end if;

  select rate_kobo_per_kg into v_before
    from gas_stock where depot_id = p_depot_id for update;

  if not found then raise exception 'DEPOT_NOT_FOUND'; end if;

  update gas_stock
     set rate_kobo_per_kg = p_rate_kobo, updated_at = now()
   where depot_id = p_depot_id;

  insert into gas_rate_history (depot_id, rate_kobo_per_kg, changed_by)
  values (p_depot_id, p_rate_kobo, p_actor_id);

  insert into audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (p_actor_id, 'rate.changed', 'gas_stock', p_depot_id,
          json_build_object('rate_kobo_per_kg', v_before)::jsonb,
          json_build_object('rate_kobo_per_kg', p_rate_kobo)::jsonb);

  return jsonb_build_object('before_kobo', v_before, 'after_kobo', p_rate_kobo);
end $$;


-- ----------------------------------------------------------------------------
-- ITEM 11 — issuing a QR raced, and a refresh killed a valid code
--
-- issue_qr voided any live token and minted a new one every time it was
-- called. The order status screen calls it on mount, so a customer who
-- screenshotted their code and then reopened the page was holding a QR the
-- depot would reject.
--
-- Now: the order is locked first, and an existing live token is left alone
-- unless the caller explicitly asks for a replacement.
-- ----------------------------------------------------------------------------

create or replace function issue_qr(
  p_order_id    uuid,
  p_token_hash  char(64),
  p_valid_hours integer default 72,
  p_force       boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order "order";
  v_live  qr_token;
  v_qr    uuid;
begin
  -- Serialise against a concurrent issue for the same order.
  select * into v_order from "order" where order_id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status in ('cancelled','expired') then
    raise exception 'ORDER_ALREADY_CLOSED'
      using detail = json_build_object('order_status', v_order.status)::text;
  end if;

  select * into v_live
    from qr_token
   where order_id = p_order_id
     and status = 'unscanned'
     and (expires_at is null or expires_at > now())
   limit 1;

  if found and not p_force then
    -- A valid code is already out there. Do not invalidate it; tell the caller
    -- to keep showing the one it has.
    return jsonb_build_object(
      'qr_id', v_live.qr_id, 'issued', false, 'existing', true,
      'expires_at', v_live.expires_at);
  end if;

  update qr_token set status = 'void'
   where order_id = p_order_id and status = 'unscanned';

  insert into qr_token (order_id, token_hash, expires_at)
  values (p_order_id, p_token_hash, now() + make_interval(hours => p_valid_hours))
  returning qr_id into v_qr;

  if found then
    -- A deliberate replacement is worth recording: it invalidated a code the
    -- customer may still be holding.
    insert into audit_log (actor_id, action, entity_type, entity_id, note)
    values (v_order.user_id, 'qr.replaced', 'order', p_order_id,
            'Previous code voided at the customer''s request');
  end if;

  return jsonb_build_object('qr_id', v_qr, 'issued', true, 'existing', false);
end $$;


-- ----------------------------------------------------------------------------
-- ITEM 12 — driver and delivery state drifted apart
--
-- Starting a trip wrote delivery.status then driver.status; failing one wrote
-- the delivery, then maybe cancelled the order, then maybe freed the driver.
-- Any gap left a driver marked busy with no live drop, or a delivery marked
-- returned on an order still holding stock.
-- ----------------------------------------------------------------------------

create or replace function start_delivery(p_delivery_id uuid, p_driver_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row delivery;
begin
  select * into v_row from delivery where delivery_id = p_delivery_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_row.driver_id is distinct from p_driver_id then raise exception 'FORBIDDEN'; end if;
  if v_row.status <> 'assigned' then
    raise exception 'DELIVERY_NOT_STARTABLE'
      using detail = json_build_object('status', v_row.status)::text;
  end if;

  update delivery
     set status = 'en_route', en_route_at = now()
   where delivery_id = p_delivery_id;

  update driver set status = 'busy' where driver_id = p_driver_id;

  insert into audit_log (action, entity_type, entity_id, note)
  values ('delivery.en_route', 'delivery', p_delivery_id, 'Driver started the trip');

  return jsonb_build_object('status','en_route');
end $$;

/**
 * A failed drop, settled in one transaction: the delivery, the order, the
 * stock and the driver's availability all move together or not at all.
 */
create or replace function fail_delivery(
  p_delivery_id uuid,
  p_driver_id   uuid,
  p_reason      text,
  p_outcome     text,              -- 'reschedule' | 'return'
  p_actor_id    uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row    delivery;
  v_status delivery_status;
  v_open   integer;
begin
  if p_outcome not in ('reschedule','return') then
    raise exception 'INVALID_OUTCOME';
  end if;

  select * into v_row from delivery where delivery_id = p_delivery_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_row.driver_id is distinct from p_driver_id then raise exception 'FORBIDDEN'; end if;
  if v_row.status in ('delivered','returned') then raise exception 'ALREADY_FULFILLED'; end if;

  v_status := case when p_outcome = 'return' then 'returned' else 'rescheduled' end;

  update delivery
     set status = v_status,
         failure_reason = p_reason,
         attempt_count = v_row.attempt_count + 1,
         driver_id = case when p_outcome = 'return' then null else v_row.driver_id end
   where delivery_id = p_delivery_id;

  -- Returning to the depot ends the order, so the stock goes back in the same
  -- breath rather than in a second request that might never arrive.
  if p_outcome = 'return' then
    perform cancel_order(v_row.order_id, p_actor_id,
                         'Returned to depot: ' || p_reason);
  end if;

  select count(*) into v_open
    from delivery
   where driver_id = p_driver_id and status in ('assigned','en_route');

  if v_open = 0 then
    update driver set status = 'available' where driver_id = p_driver_id;
  end if;

  insert into audit_log (actor_id, action, entity_type, entity_id, note)
  values (p_actor_id, 'delivery.' || v_status, 'delivery', p_delivery_id, p_reason);

  return jsonb_build_object('status', v_status, 'driver_freed', v_open = 0);
end $$;

/** Assignment: delivery row and driver availability in one step. */
create or replace function assign_delivery(
  p_order_id uuid, p_driver_id uuid, p_actor_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_order "order"; v_delivery_id uuid;
begin
  select * into v_order from "order" where order_id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.fulfillment_type <> 'delivery' then
    raise exception 'WRONG_FULFILLMENT_TYPE'
      using detail = json_build_object('actual', v_order.fulfillment_type)::text;
  end if;

  insert into delivery (order_id, driver_id, delivery_address, zone_id,
                        status, assigned_at)
  values (p_order_id, p_driver_id, v_order.delivery_address, v_order.zone_id,
          'assigned', now())
  on conflict (order_id) do update
    set driver_id = excluded.driver_id,
        status = 'assigned',
        assigned_at = now()
  returning delivery_id into v_delivery_id;

  update driver set status = 'busy'
   where driver_id = p_driver_id and status = 'available';

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (p_actor_id, 'delivery.assigned', 'order', p_order_id,
          json_build_object('driver_id', p_driver_id)::jsonb);

  return jsonb_build_object('delivery_id', v_delivery_id, 'status','assigned');
end $$;


-- ----------------------------------------------------------------------------
-- ITEM 9 — the Worker's own role must be able to call these
--
-- 0012 revoked EXECUTE from public, anon and authenticated, which is right:
-- a browser holding the publishable key must not call business functions.
--
-- But the Worker connects with the secret key, which authenticates as
-- service_role, and that role was never granted anything explicitly. It works
-- today only because service_role happens to bypass RLS and inherits from
-- postgres in a stock Supabase project — a detail that is not guaranteed and
-- produces "permission denied for function" in production the moment it
-- changes.
--
-- Granting explicitly makes the intent visible and the behaviour stable.
-- ----------------------------------------------------------------------------

do $$
declare
  fn text;
  backend_functions text[] := array[
    'create_gas_order','create_accessory_order','reserve_gas','reserve_products',
    'release_reservations','fulfill_reservations','confirm_payment','issue_qr',
    'redeem_qr','cancel_order','expire_order_holds','publish_bundle',
    'adjust_product_stock','record_stock_entry','check_bundle_compatibility',
    'set_guest_token','order_for_guest_token','claim_idempotency',
    'complete_idempotency','release_idempotency','claim_unsent_notifications',
    'mark_notifications_sent','mark_notifications_failed','claim_deleted_assets',
    'purge_assets','request_refund','claim_refund','settle_refund',
    'set_request_id','set_gas_rate','start_delivery','fail_delivery',
    'assign_delivery','set_default_address','expand_bundle_items'
  ];
begin
  foreach fn in array backend_functions loop
    -- Every overload of each name. Signatures have changed across migrations,
    -- so matching by name is deliberate.
    execute (
      select coalesce(string_agg(
        format('grant execute on function %s(%s) to service_role;',
               p.oid::regproc, pg_get_function_identity_arguments(p.oid)), ' '), '')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
    );
  end loop;
end $$;

-- Restated so a fresh database is unambiguous: browsers get nothing.
do $$
declare fn text;
begin
  foreach fn in array array[
    'create_gas_order','create_accessory_order','reserve_gas','reserve_products',
    'release_reservations','fulfill_reservations','confirm_payment','issue_qr',
    'redeem_qr','cancel_order','publish_bundle','adjust_product_stock',
    'request_refund','claim_refund','settle_refund','set_gas_rate',
    'start_delivery','fail_delivery','assign_delivery',
    'claim_idempotency','complete_idempotency','release_idempotency'
  ] loop
    execute (
      select coalesce(string_agg(
        format('revoke all on function %s(%s) from public, anon, authenticated;',
               p.oid::regproc, pg_get_function_identity_arguments(p.oid)), ' '), '')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
    );
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- ITEM 4 — a concurrent webhook acknowledged an event it did not process
--
-- The Worker checked for the event, inserted it, and on a unique violation
-- assumed a sibling was handling it and returned 200. Paystack takes a 200 as
-- "handled" and stops retrying — so if the sibling then failed, the charge was
-- lost with nothing left to retry it.
--
-- A lease fixes it. One caller claims the event and processes it; a concurrent
-- caller is told the claim is live and returns a retryable status. If the
-- holder dies, the lease expires and the next delivery picks it up.
-- ----------------------------------------------------------------------------

alter table webhook_event
  add column if not exists locked_until timestamptz,
  add column if not exists attempts integer not null default 0;

create index if not exists webhook_event_lock_idx
  on webhook_event (locked_until) where processed_at is null;

/**
 * Returns one of:
 *   processed  — already done; acknowledge and stop
 *   claimed    — this caller owns it, do the work
 *   in_flight  — someone else holds a live lease; do NOT acknowledge
 */
create or replace function claim_webhook_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_lease_seconds integer default 60
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row webhook_event;
begin
  select * into v_row
    from webhook_event
   where provider = p_provider and provider_event_id = p_event_id
   for update;

  if found then
    if v_row.processed_at is not null then
      return jsonb_build_object('state','processed');
    end if;

    if v_row.locked_until is not null and v_row.locked_until > now() then
      return jsonb_build_object('state','in_flight');
    end if;

    -- Lease expired, or a previous attempt failed. Take it over.
    update webhook_event
       set locked_until = now() + make_interval(secs => p_lease_seconds),
           attempts = attempts + 1
     where event_id = v_row.event_id;

    return jsonb_build_object('state','claimed','attempts', v_row.attempts + 1);
  end if;

  insert into webhook_event
    (provider, provider_event_id, event_type, signature_valid, payload,
     locked_until, attempts)
  values
    (p_provider, p_event_id, p_event_type, true, p_payload,
     now() + make_interval(secs => p_lease_seconds), 1);

  return jsonb_build_object('state','claimed','attempts', 1);
exception
  -- Lost the insert race. The winner holds the lease.
  when unique_violation then
    return jsonb_build_object('state','in_flight');
end $$;

create or replace function finish_webhook_event(
  p_provider text, p_event_id text, p_error text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_error is null then
    update webhook_event
       set processed_at = now(), locked_until = null, processing_error = null
     where provider = p_provider and provider_event_id = p_event_id;
  else
    -- Release the lease but leave processed_at null, so a retry is possible.
    update webhook_event
       set locked_until = null, processing_error = left(p_error, 500)
     where provider = p_provider and provider_event_id = p_event_id;
  end if;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['claim_webhook_event','finish_webhook_event'] loop
    execute (
      select coalesce(string_agg(
        format('revoke all on function %s(%s) from public, anon, authenticated;
                grant execute on function %s(%s) to service_role;',
               p.oid::regproc, pg_get_function_identity_arguments(p.oid),
               p.oid::regproc, pg_get_function_identity_arguments(p.oid)), ' '), '')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
    );
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- Found during the follow-up audit
-- ----------------------------------------------------------------------------

-- The new issue_qr takes a fourth argument with a default, which does NOT
-- replace the old three-argument version — it creates a second overload. A
-- three-argument call then matches both and Postgres refuses with
-- "function issue_qr(...) is not unique". The test suite calls it that way.
drop function if exists issue_qr(uuid, char, integer);

-- The old signature returned uuid; the new one returns jsonb. Any leftover
-- copy would also break callers expecting the new shape.
drop function if exists issue_qr(uuid, character, integer);


-- redeem_qr completed a delivery but left the driver marked busy. The Worker
-- patched that up with a second request afterwards, so a crash in between left
-- a driver unable to take another drop with nothing open. Folding it in means
-- the delivery, the stock, the order and the driver all settle together.
-- (Item 12)
create or replace function redeem_qr(
  p_token_hash char(64),
  p_scanner_id uuid,
  p_expected   fulfillment_type default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_qr       qr_token;
  v_order    "order";
  v_claimed  uuid;
  v_delivery uuid;
  v_driver   uuid;
  v_open     integer;
begin
  select * into v_qr from qr_token where token_hash = p_token_hash;
  if not found then raise exception 'QR_INVALID'; end if;

  select * into v_order from "order" where "order".order_id = v_qr.order_id for update;

  if v_order.status in ('cancelled','expired') then
    raise exception 'ORDER_ALREADY_CLOSED'
      using detail = json_build_object('order_status', v_order.status,
                                       'order_number', v_order.order_number)::text;
  end if;

  if v_order.status = 'fulfilled' then
    raise exception 'ALREADY_FULFILLED'
      using detail = json_build_object('order_number', v_order.order_number,
                                       'fulfilled_at', v_order.fulfilled_at)::text;
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'UNPAID'
      using detail = json_build_object('order_number', v_order.order_number,
                                       'total_kobo', v_order.total_kobo)::text;
  end if;

  if p_expected is not null and v_order.fulfillment_type <> p_expected then
    raise exception 'WRONG_FULFILLMENT_TYPE'
      using detail = json_build_object('expected', p_expected,
                                       'actual', v_order.fulfillment_type)::text;
  end if;

  if v_qr.expires_at is not null and v_qr.expires_at < now() then
    update qr_token set status = 'expired' where qr_id = v_qr.qr_id;
    raise exception 'QR_EXPIRED';
  end if;

  -- The atomic claim. A second scanner matches zero rows.
  update qr_token
     set status = 'scanned', scanned_at = now(), scanned_by = p_scanner_id
   where qr_id = v_qr.qr_id and status = 'unscanned'
   returning qr_id into v_claimed;

  if v_claimed is null then
    raise exception 'QR_ALREADY_SCANNED'
      using detail = json_build_object('order_number', v_order.order_number,
                                       'scanned_at', v_qr.scanned_at)::text;
  end if;

  perform fulfill_reservations(v_order.order_id);

  update "order"
     set status = 'fulfilled', fulfilled_at = now()
   where "order".order_id = v_order.order_id;

  if v_order.fulfillment_type = 'delivery' then
    select delivery_id, driver_id into v_delivery, v_driver
      from delivery where delivery.order_id = v_order.order_id;

    if v_delivery is null then
      -- No assignment was ever made. Record the handover and flag it rather
      -- than losing who took it.
      select d.driver_id into v_driver from driver d
       where d.profile_id = p_scanner_id;

      insert into delivery (order_id, driver_id, delivery_address, zone_id,
                            status, assigned_at, delivered_at)
      values (v_order.order_id, v_driver,
              coalesce(v_order.delivery_address, 'Not recorded'),
              v_order.zone_id, 'delivered', now(), now());

      insert into audit_log (actor_id, action, entity_type, entity_id, note)
      values (p_scanner_id, 'delivery.unassigned_fulfilment', 'order',
              v_order.order_id,
              'Delivered with no prior driver assignment. Check dispatch.');
    else
      update delivery
         set status = 'delivered', delivered_at = now()
       where delivery_id = v_delivery;
    end if;

    if v_driver is not null then
      update driver
         set completed_deliveries = completed_deliveries + 1
       where driver_id = v_driver;

      -- Free the driver here rather than in a follow-up request, which could
      -- be lost and leave them busy with nothing open.
      select count(*) into v_open
        from delivery
       where driver_id = v_driver and status in ('assigned','en_route');

      if v_open = 0 then
        update driver set status = 'available' where driver_id = v_driver;
      end if;
    end if;
  end if;

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (p_scanner_id, 'qr.fulfilled', 'order', v_order.order_id,
          json_build_object('order_number', v_order.order_number)::jsonb);

  return jsonb_build_object(
    'order_id',         v_order.order_id,
    'order_number',     v_order.order_number,
    'fulfillment_type', v_order.fulfillment_type,
    'driver_freed',     coalesce(v_open = 0, false),
    'fulfilled',        true);
end $$;

revoke all on function redeem_qr(char, uuid, fulfillment_type)
  from public, anon, authenticated;
grant execute on function redeem_qr(char, uuid, fulfillment_type) to service_role;
grant execute on function issue_qr(uuid, char, integer, boolean) to service_role;
revoke all on function issue_qr(uuid, char, integer, boolean)
  from public, anon, authenticated;
