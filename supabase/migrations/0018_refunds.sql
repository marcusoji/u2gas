-- ============================================================================
-- U2GAS — 0018 refunds
--
-- Item 14. Cancelling a paid order moved it to refund-pending and stopped
-- there, which was honest but left every refund to be chased by hand in the
-- Paystack dashboard with nothing linking it back to the order.
--
-- This adds the state machine. The Worker drives Paystack; the database owns
-- the transitions and makes double-refunding impossible.
-- ============================================================================

create type refund_status as enum (
  'pending',      -- owed, nobody has acted
  'processing',   -- handed to Paystack, awaiting their answer
  'refunded',     -- Paystack confirmed
  'declined',     -- Paystack refused
  'manual'        -- settled outside the system; closed by a manager
);

create table if not exists refund (
  refund_id     uuid primary key default gen_random_uuid(),
  order_id      uuid not null references "order"(order_id) on delete restrict,
  payment_id    uuid not null references payment(payment_id) on delete restrict,
  amount_kobo   bigint not null,
  currency      char(3) not null default 'NGN',
  status        refund_status not null default 'pending',
  reason        text,
  provider      text not null default 'paystack',
  provider_refund_id text,
  provider_payload jsonb,
  requested_by  uuid references profile(profile_id),
  approved_by   uuid references profile(profile_id),
  last_error    text,
  attempts      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  settled_at    timestamptz,

  constraint refund_amount_positive check (amount_kobo > 0),
  constraint refund_attempts_nonneg check (attempts >= 0),
  constraint refund_settled_has_timestamp check (
    status not in ('refunded','declined','manual') or settled_at is not null
  )
);

-- One live refund per payment. This is the constraint that makes double
-- refunding impossible rather than merely unlikely: two concurrent approvals
-- race, and exactly one inserts.
create unique index if not exists refund_one_live_per_payment
  on refund (payment_id) where status in ('pending','processing');

-- Paystack's own id, once we have it. Their retries cannot create a second row.
create unique index if not exists refund_provider_id_idx
  on refund (provider, provider_refund_id) where provider_refund_id is not null;

create index if not exists refund_status_idx on refund (status, created_at);
create index if not exists refund_order_idx  on refund (order_id);

create or replace function touch_refund() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists refund_touch on refund;
create trigger refund_touch before update on refund
  for each row execute function touch_refund();

alter table refund enable row level security;
alter table refund force row level security;

drop policy if exists refund_read on refund;
create policy refund_read on refund for select using (
  is_admin()
  or order_owned_by_current(refund.order_id)
);

grant select on refund to authenticated;

-- ----------------------------------------------------------------------------
-- Raise a refund. Called when a paid order is cancelled, and by an admin
-- acting on the flagged queue.
--
-- Idempotent: a second call while one is live returns the existing row rather
-- than creating a second claim on the same money.
-- ----------------------------------------------------------------------------

create or replace function request_refund(
  p_order_id   uuid,
  p_reason     text,
  p_actor_id   uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_payment payment;
  v_existing refund;
  v_refund_id uuid;
begin
  select * into v_payment
    from payment
   where order_id = p_order_id and status = 'paid'
   order by paid_at
   limit 1
   for update;

  if not found then
    raise exception 'NOTHING_TO_REFUND'
      using detail = json_build_object('order_id', p_order_id)::text;
  end if;

  select * into v_existing
    from refund
   where payment_id = v_payment.payment_id
     and status in ('pending','processing','refunded');

  if found then
    return jsonb_build_object(
      'refund_id', v_existing.refund_id,
      'status', v_existing.status,
      'already_requested', true);
  end if;

  insert into refund (order_id, payment_id, amount_kobo, currency,
                      reason, requested_by)
  values (p_order_id, v_payment.payment_id, v_payment.amount_kobo,
          v_payment.currency, p_reason, p_actor_id)
  returning refund_id into v_refund_id;

  -- 0012 already models this on the order as refund_status. Reusing it keeps
  -- one source of truth and avoids altering the payment_status enum, which
  -- cannot be extended and used in the same transaction.
  update "order"
     set refund_status = 'pending',
         refund_requested_at = now()
   where order_id = p_order_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, after, note)
  values (p_actor_id, 'refund.requested', 'order', p_order_id,
          json_build_object('refund_id', v_refund_id,
                            'amount_kobo', v_payment.amount_kobo)::jsonb,
          p_reason);

  return jsonb_build_object(
    'refund_id', v_refund_id, 'status', 'pending', 'already_requested', false);
end $$;

-- ----------------------------------------------------------------------------
-- Claim a refund for processing. Returns the row only if this call won the
-- claim, so two admins pressing the button at once cannot both call Paystack.
-- ----------------------------------------------------------------------------

-- claim_refund also advances the order's own marker so the flagged queue
-- shows work in progress rather than appearing untouched.
create or replace function claim_refund(p_refund_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v refund;
  v_reference text;
begin
  update refund
     set status = 'processing',
         approved_by = p_actor_id,
         attempts = attempts + 1
   where refund_id = p_refund_id
     and status = 'pending'          -- the guard: only one caller matches
  returning * into v;

  if not found then
    select * into v from refund where refund_id = p_refund_id;
    if not found then
      raise exception 'REFUND_NOT_FOUND';
    end if;
    raise exception 'REFUND_NOT_CLAIMABLE'
      using detail = json_build_object('status', v.status)::text;
  end if;

  update "order" set refund_status = 'processing' where order_id = v.order_id;

  select provider_reference into v_reference
    from payment where payment_id = v.payment_id;

  return jsonb_build_object(
    'refund_id', v.refund_id,
    'amount_kobo', v.amount_kobo,
    'currency', v.currency,
    'provider_reference', v_reference,
    'attempts', v.attempts);
end $$;

-- ----------------------------------------------------------------------------
-- Settle. The customer is told "refunded" only after this runs with
-- 'refunded' — never on the strength of having asked Paystack.
-- ----------------------------------------------------------------------------

create or replace function settle_refund(
  p_refund_id  uuid,
  p_status     refund_status,
  p_provider_refund_id text default null,
  p_payload    jsonb default null,
  p_error      text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v refund;
begin
  if p_status not in ('refunded','declined','manual','pending') then
    raise exception 'INVALID_REFUND_STATUS';
  end if;

  update refund
     set status = p_status,
         provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
         provider_payload = coalesce(p_payload, provider_payload),
         last_error = p_error,
         settled_at = case when p_status in ('refunded','declined','manual')
                           then now() else null end
   where refund_id = p_refund_id
  returning * into v;

  if not found then
    raise exception 'REFUND_NOT_FOUND';
  end if;

  if p_status = 'refunded' then
    update payment set status = 'refunded' where payment_id = v.payment_id;
    update "order"
       set payment_status = 'refunded',      -- a real enum value
           refund_status  = 'refunded'
     where order_id = v.order_id;
  elsif p_status = 'declined' then
    update "order" set refund_status = 'declined' where order_id = v.order_id;
  elsif p_status = 'manual' then
    update "order"
       set payment_status = 'refunded',
           refund_status  = 'refunded'
     where order_id = v.order_id;

    insert into notification (profile_id, order_id, kind, title, body)
    select o.user_id, o.order_id, 'refund.completed',
           'Your refund is on its way',
           'We have refunded ' || (v.amount_kobo / 100)::text ||
           ' naira for ' || o.order_number ||
           '. Your bank may take a few days to show it.'
    from "order" o
    where o.order_id = v.order_id and o.user_id is not null;
  end if;

  insert into audit_log (actor_id, action, entity_type, entity_id, after, note)
  values (v.approved_by, 'refund.' || p_status, 'order', v.order_id,
          json_build_object('refund_id', v.refund_id,
                            'provider_refund_id', v.provider_refund_id,
                            'amount_kobo', v.amount_kobo)::jsonb,
          p_error);

  return jsonb_build_object('refund_id', v.refund_id, 'status', p_status);
end $$;

revoke all on function request_refund(uuid, text, uuid) from public, anon, authenticated;
revoke all on function claim_refund(uuid, uuid)          from public, anon, authenticated;
revoke all on function settle_refund(uuid, refund_status, text, jsonb, text)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- cancel_order raises the refund itself, so a paid cancellation can never be
-- completed without one existing.
-- ----------------------------------------------------------------------------

create or replace function cancel_order(
  p_order_id uuid,
  p_actor_id uuid default null,
  p_reason   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order "order";
  v_released integer;
  v_refund jsonb := null;
begin
  select * into v_order from "order" where order_id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status = 'fulfilled' then
    raise exception 'ALREADY_FULFILLED';
  end if;
  if v_order.status in ('cancelled','expired') then
    return jsonb_build_object('reservations_released', 0, 'refund', null);
  end if;

  v_released := release_reservations(p_order_id, 'released');

  update qr_token set status = 'void'
   where order_id = p_order_id and status = 'unscanned';

  update "order"
     set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
   where order_id = p_order_id;

  -- Money already taken means a refund is owed. Raising it here rather than
  -- leaving it to the caller means no cancellation path can forget.
  if v_order.payment_status = 'paid' then
    v_refund := request_refund(p_order_id,
                  coalesce(p_reason, 'Order cancelled'), p_actor_id);
  end if;

  insert into audit_log (actor_id, action, entity_type, entity_id, note)
  values (p_actor_id, 'order.cancelled', 'order', p_order_id, p_reason);

  return jsonb_build_object(
    'reservations_released', v_released,
    'refund', v_refund);
end $$;

revoke all on function cancel_order(uuid, uuid, text) from public, anon, authenticated;
