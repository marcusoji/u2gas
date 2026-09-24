-- ============================================================================
-- U2GAS — 0012 production hardening
--
-- Parts 3, 6, 7, 8, 16, 17, 19, 24, 42 and 43 of the hardening brief.
-- ============================================================================


-- ============================================================================
-- PART 3 — auth.users → profile synchronisation
--
-- This lived only in the deployment guide, which meant a fresh project had no
-- trigger: every new signup produced an auth user with no profile, no role,
-- and a 401 on every API call. It belongs in the migration sequence so the
-- database is reproducible.
-- ============================================================================

create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Role is hardcoded to 'customer'. It is never read from the signup payload,
  -- because raw_user_meta_data is attacker-controlled: a browser can put
  -- {"role":"admin"} in it during registration.
  insert into profile (auth_user_id, email, role, email_verified_at)
  values (new.id, new.email, 'customer', new.email_confirmed_at)
  on conflict (auth_user_id) do nothing;    -- idempotent
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();


create or replace function sync_auth_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profile
     set email = new.email,
         email_verified_at = new.email_confirmed_at
   where auth_user_id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function sync_auth_user_email();


-- Backfill anyone who signed up before the trigger existed.
insert into profile (auth_user_id, email, role, email_verified_at)
select u.id, u.email, 'customer', u.email_confirmed_at
from auth.users u
left join profile p on p.auth_user_id = u.id
where p.profile_id is null
on conflict (auth_user_id) do nothing;


-- ============================================================================
-- PART 7 — a customer must not be able to edit their own role
--
-- The previous policy pinned role through a WITH CHECK comparison, which is
-- fragile: it depends on a function reading the pre-update snapshot. Column
-- privileges are enforced by the engine and cannot be reasoned around.
-- ============================================================================

revoke update on profile from authenticated, anon;

-- Exactly the fields a person may change about themselves.
grant update (first_name, last_name, display_name, phone, avatar_asset)
  on profile to authenticated;

-- role, email, email_verified_at, auth_user_id and created_at are now
-- unwritable from any browser session, whatever the policy says.

drop policy if exists profile_self_update on profile;
drop policy if exists profile_self_update on profile;
create policy profile_self_update on profile
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());


-- ============================================================================
-- PART 6 — RLS: the Worker is the write boundary
--
-- Every table had a `FOR ALL` policy granting staff or admins direct write
-- access through the browser Supabase client. That bypasses the Worker
-- entirely: an admin's own JWT could UPDATE order.payment_status to 'paid',
-- or set product.reserved_qty to zero, with no transaction, no audit entry and
-- no reservation accounting.
--
-- Business writes now go through the Worker on the secret key. Browser
-- sessions keep read access appropriate to their role.
-- ============================================================================

do $$
declare p record;
begin
  -- Drop every write-granting policy. Reads are re-created below.
  for p in
    select policyname, tablename from pg_policies
     where schemaname = 'public'
       and cmd in ('ALL','INSERT','UPDATE','DELETE')
       and tablename in (
         'order','order_item','payment','delivery','driver','product','bundle',
         'bundle_item','inventory_reservation','gas_stock','stock_entry',
         'delivery_zone','staff_member','compatibility_rule','product_attribute',
         'product_category','image_asset','cash_reconciliation','app_setting',
         'gas_rate_history','audit_log')
  loop
    execute format('drop policy if exists %I on %I', p.policyname, p.tablename);
  end loop;
end $$;

-- Read policies only. Nothing below grants INSERT, UPDATE or DELETE.
drop policy if exists order_read on "order";
create policy order_read on "order" for select using (
  user_id = current_profile_id()
  or is_staff()
  or (is_driver() and exists (
        select 1 from delivery d
        join driver dr on dr.driver_id = d.driver_id
       where d.order_id = "order".order_id
         and dr.profile_id = current_profile_id()))
);

drop policy if exists order_item_read on order_item;
create policy order_item_read on order_item for select using (
  is_staff()
  or exists (select 1 from "order" o
              where o.order_id = order_item.order_id
                and o.user_id = current_profile_id())
);

drop policy if exists payment_read on payment;
create policy payment_read on payment for select using (
  is_staff()
  or exists (select 1 from "order" o
              where o.order_id = payment.order_id
                and o.user_id = current_profile_id())
);

-- PART 46 — a driver sees only their own deliveries, and cannot write any.
drop policy if exists delivery_read on delivery;
create policy delivery_read on delivery for select using (
  is_staff()
  or exists (select 1 from driver dr
              where dr.driver_id = delivery.driver_id
                and dr.profile_id = current_profile_id())
  or exists (select 1 from "order" o
              where o.order_id = delivery.order_id
                and o.user_id = current_profile_id())
);

drop policy if exists driver_read on driver;
create policy driver_read on driver for select using (
  is_staff() or profile_id = current_profile_id()
);

drop policy if exists staff_read on staff_member;
create policy staff_read on staff_member for select using (is_staff());
drop policy if exists reservation_read on inventory_reservation;
create policy reservation_read on inventory_reservation for select using (is_staff());
drop policy if exists recon_read on cash_reconciliation;
create policy recon_read on cash_reconciliation for select using (
  is_admin() or exists (select 1 from staff_member s
                         where s.staff_id = cash_reconciliation.staff_id
                           and s.profile_id = current_profile_id())
);
drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log for select using (is_admin());
drop policy if exists stock_entry_read on stock_entry;
create policy stock_entry_read on stock_entry for select using (is_staff());
drop policy if exists rate_history_read on gas_rate_history;
create policy rate_history_read on gas_rate_history for select using (is_staff());
drop policy if exists reservation_admin_read on inventory_reservation;
create policy reservation_admin_read on inventory_reservation for select using (is_admin());

-- Catalogue stays publicly readable; the shop must work signed out.
drop policy if exists product_read on product;
create policy product_read on product for select using (active or is_staff());
drop policy if exists category_read on product_category;
create policy category_read on product_category for select using (true);
drop policy if exists attribute_read on product_attribute;
create policy attribute_read on product_attribute for select using (true);
drop policy if exists rule_read on compatibility_rule;
create policy rule_read on compatibility_rule for select using (is_staff());
drop policy if exists bundle_read on bundle;
create policy bundle_read on bundle for select using (active or is_staff());
drop policy if exists bundle_item_read on bundle_item;
create policy bundle_item_read on bundle_item for select using (true);
drop policy if exists image_read on image_asset;
create policy image_read on image_asset for select using (deleted_at is null);
drop policy if exists gas_stock_read on gas_stock;
create policy gas_stock_read on gas_stock for select using (true);
drop policy if exists zone_read on delivery_zone;
create policy zone_read on delivery_zone for select using (active or is_staff());
drop policy if exists setting_read on app_setting;
create policy setting_read on app_setting for select using (true);

-- Belt and braces: revoke the table privileges themselves, so a future policy
-- added by mistake still cannot grant a write.
revoke insert, update, delete on
  "order", order_item, payment, delivery, driver, product, bundle, bundle_item,
  inventory_reservation, gas_stock, stock_entry, delivery_zone, staff_member,
  compatibility_rule, product_attribute, product_category, image_asset,
  cash_reconciliation, app_setting, gas_rate_history, audit_log, qr_token,
  webhook_event
from anon, authenticated;

-- Notifications are the one exception: marking your own as read is harmless
-- and saves a round trip through the Worker.
grant update (read_at) on notification to authenticated;


-- ============================================================================
-- PART 8 — SECURITY DEFINER functions were executable by anyone
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default. PostgREST
-- exposes every function in the public schema as an RPC endpoint. Combined,
-- that meant an anonymous browser could POST to /rest/v1/rpc/confirm_payment
-- and mark any order paid, or call adjust_product_stock, or redeem_qr.
--
-- These functions run as the definer, so RLS did not stop them either.
--
-- This is the most serious finding in the audit.
-- ============================================================================

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Grant back only what RLS policies and views evaluate on the caller's behalf.
-- These are read-only and leak nothing beyond what the policies already allow.
grant execute on function current_profile_id()      to anon, authenticated;
grant execute on function current_role_name()       to anon, authenticated;
grant execute on function is_staff()                to anon, authenticated;
grant execute on function is_admin()                to anon, authenticated;
grant execute on function is_driver()               to anon, authenticated;
grant execute on function gas_available_kg(uuid)    to anon, authenticated;
grant execute on function product_available_qty(uuid) to anon, authenticated;
grant execute on function bundle_available_qty(uuid)  to anon, authenticated;

-- Everything else — create_gas_order, create_accessory_order, reserve_gas,
-- reserve_products, release_reservations, fulfill_reservations,
-- confirm_payment, issue_qr, redeem_qr, cancel_order, expire_order_holds,
-- publish_bundle, adjust_product_stock, record_stock_entry, set_guest_token,
-- order_for_guest_token, claim_unsent_notifications, purge_assets — is now
-- reachable only by the service role the Worker and Edge Functions use.


-- ============================================================================
-- PART 19 + 20 — admin settings must actually bind
--
-- max_gas_kg_per_order and qr_valid_hours were editable in the admin UI and
-- read by nothing. An admin could cap orders at 50kg and the Worker would
-- happily accept 500. Walk-in orders hardcoded a 30-minute hold regardless of
-- the configured value.
--
-- Settings are now read inside the database functions, so no code path can
-- skip them, and they are range-checked so a typo cannot disable the cap.
-- ============================================================================

alter table app_setting
  drop constraint if exists app_setting_sane;

alter table app_setting add constraint app_setting_sane check (
  case key
    when 'hold_minutes'         then (value::text)::numeric between 5 and 1440
    when 'qr_valid_hours'       then (value::text)::numeric between 1 and 720
    when 'max_gas_kg_per_order' then (value::text)::numeric between 1 and 1000
    when 'low_stock_warn_kg'    then (value::text)::numeric >= 0
    else true
  end
);

create or replace function setting_number(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (value::text)::numeric from app_setting where key = p_key),
                  p_default)
$$;

/**
 * Hold duration, from configuration. Every order-creation path calls this
 * rather than accepting a number from its caller, so the walk-in counter and
 * the website cannot drift apart.
 */
create or replace function effective_hold_minutes(p_requested integer default null)
returns integer language sql stable security definer set search_path = public as $$
  select setting_number('hold_minutes', 30)::integer
$$;

create or replace function assert_gas_within_limit(p_kg numeric)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_max numeric;
begin
  v_max := setting_number('max_gas_kg_per_order', 50);
  if p_kg > v_max then
    raise exception 'OVER_MAX_GAS'
      using detail = json_build_object('requested_kg', p_kg, 'max_kg', v_max)::text;
  end if;
end $$;


-- ============================================================================
-- PART 17 — idempotency for order creation and payment recording
--
-- A double-tap, a mobile reconnect, or a Cloudflare retry could create two
-- orders and reserve stock twice. The client sends an Idempotency-Key; the
-- first request stores its result, and a replay returns that result instead of
-- doing the work again.
-- ============================================================================

create table if not exists idempotency_key (
  key           text primary key,
  scope         text not null,               -- 'order.create', 'payment.record'
  profile_id    uuid references profile(profile_id) on delete set null,
  request_hash  char(64) not null,           -- body fingerprint
  response      jsonb,
  status        text not null default 'in_progress',
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  constraint idempotency_status check (status in ('in_progress','completed','failed'))
);

create index if not exists idempotency_created_idx on idempotency_key (created_at);

alter table idempotency_key enable row level security;
-- No policy: service role only.

/**
 * Claim a key. Returns the stored response on a replay, null on first sight.
 * Raises if the same key arrives with a different body, which means a client
 * bug rather than a retry.
 */
create or replace function claim_idempotency(
  p_key text, p_scope text, p_hash char(64), p_profile uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row idempotency_key;
begin
  select * into v_row from idempotency_key where key = p_key;

  if found then
    if v_row.request_hash <> p_hash then
      raise exception 'IDEMPOTENCY_MISMATCH'
        using detail = json_build_object('key', p_key)::text;
    end if;
    if v_row.status = 'completed' then
      return v_row.response;
    end if;
    -- Still running, or previously failed. Treat as in-flight so the caller
    -- can tell the user to wait rather than duplicating the work.
    raise exception 'IDEMPOTENCY_IN_PROGRESS'
      using detail = json_build_object('key', p_key)::text;
  end if;

  insert into idempotency_key (key, scope, profile_id, request_hash)
  values (p_key, p_scope, p_profile, p_hash);
  return null;
end $$;

create or replace function complete_idempotency(p_key text, p_response jsonb)
returns void language sql security definer set search_path = public as $$
  update idempotency_key
     set status = 'completed', response = p_response, completed_at = now()
   where key = p_key
$$;

create or replace function release_idempotency(p_key text)
returns void language sql security definer set search_path = public as $$
  delete from idempotency_key where key = p_key and status = 'in_progress'
$$;


-- ============================================================================
-- PART 24 — notification queue was marking messages sent before sending them
--
-- claim_unsent_notifications set emailed_at = now() as it claimed the batch.
-- A Resend outage therefore lost the batch silently: rows looked sent and were
-- never retried. The Edge Function requeued failures by nulling the column,
-- which fails if the function itself crashes mid-run.
--
-- Proper states: pending → claimed → sent, with an attempt count and the last
-- error kept. A claim that never completes is reclaimed after five minutes.
-- ============================================================================

alter table notification
  add column if not exists send_status text not null default 'pending',
  add column if not exists attempts integer not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists last_error text;

alter table notification drop constraint if exists notification_send_status;
alter table notification add constraint notification_send_status
  check (send_status in ('pending','claimed','sent','failed','skipped'));

create index if not exists notification_sendable_idx
  on notification (send_status, created_at)
  where send_status in ('pending','claimed');

-- Existing rows: anything already emailed is sent.
update notification set send_status = 'sent' where emailed_at is not null;

-- Return type changed since an earlier migration; CREATE OR REPLACE
-- cannot change it, so the old one has to go first. (Item 3)
drop function if exists claim_unsent_notifications(integer);
create or replace function claim_unsent_notifications(p_limit integer default 50)
returns table (
  notification_id uuid, email text, title text, body text,
  kind text, order_number text, attempts integer
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with claimable as (
    select n.notification_id
      from notification n
      join profile p on p.profile_id = n.profile_id
     where p.email is not null
       and n.created_at > now() - interval '2 days'
       and n.attempts < 5
       and (
         n.send_status = 'pending'
         -- Reclaim a stalled batch: the worker that took it never finished.
         or (n.send_status = 'claimed' and n.claimed_at < now() - interval '5 minutes')
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
    returning n.notification_id, n.profile_id, n.title, n.body, n.kind,
              n.order_id, n.attempts
  )
  select t.notification_id, p.email::text, t.title, t.body, t.kind,
         o.order_number, t.attempts
    from taken t
    join profile p on p.profile_id = t.profile_id
    left join "order" o on o.order_id = t.order_id;
end $$;

create or replace function mark_notifications_sent(p_ids uuid[])
returns integer language sql security definer set search_path = public as $$
  with done as (
    update notification
       set send_status = 'sent', emailed_at = now(), last_error = null
     where notification_id = any(p_ids)
    returning 1)
  select count(*)::integer from done
$$;

/** Put a failure back for the next run, or give up after five attempts. */
create or replace function mark_notifications_failed(p_ids uuid[], p_error text)
returns integer language sql security definer set search_path = public as $$
  with done as (
    update notification
       set send_status = case when attempts >= 5 then 'failed' else 'pending' end,
           claimed_at = null,
           last_error = left(p_error, 500)
     where notification_id = any(p_ids)
    returning 1)
  select count(*)::integer from done
$$;


-- ============================================================================
-- PART 16 — cancelling a paid order released stock and said nothing about money
--
-- cancel_order released the reservation and closed the order regardless of
-- payment status. A customer who had paid got their gas un-reserved and no
-- refund, with nothing recorded to say they were owed one.
--
-- A paid order now moves to a refund-pending state. The stock is released —
-- they are not getting it — but the order stays open in the admin flagged
-- queue until someone actually processes the money.
--
-- Automated Paystack refunds are not implemented, so nothing here tells the
-- customer their refund is complete.
-- ============================================================================

alter table "order"
  add column if not exists refund_status text,
  add column if not exists refund_requested_at timestamptz;

alter table "order" drop constraint if exists order_refund_status;
alter table "order" add constraint order_refund_status
  check (refund_status is null
         or refund_status in ('pending','processing','refunded','declined'));

create index if not exists order_refund_pending_idx
  on "order" (refund_requested_at) where refund_status = 'pending';

drop function if exists cancel_order(uuid, uuid, text);
create or replace function cancel_order(
  p_order_id uuid,
  p_actor_id uuid default null,
  p_reason   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order    "order";
  v_released integer;
  v_paid     bigint;
begin
  select * into v_order from "order" where order_id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status = 'fulfilled' then
    raise exception 'ALREADY_FULFILLED';
  end if;
  if v_order.status in ('cancelled','expired') then
    return jsonb_build_object('released', 0, 'refund_required', false,
                              'already_closed', true);
  end if;

  v_released := release_reservations(p_order_id, 'released');

  update qr_token set status = 'void'
   where order_id = p_order_id and status = 'unscanned';

  if v_order.payment_status = 'paid' then
    select coalesce(sum(amount_kobo), 0) into v_paid
      from payment where order_id = p_order_id and status = 'paid';

    update "order"
       set status = 'cancelled',
           cancelled_at = now(),
           cancel_reason = p_reason,
           refund_status = 'pending',
           refund_requested_at = now()
     where order_id = p_order_id;

    insert into audit_log (actor_id, action, entity_type, entity_id, after, note)
    values (p_actor_id, 'order.cancelled_refund_due', 'order', p_order_id,
            json_build_object('amount_kobo', v_paid)::jsonb,
            coalesce(p_reason, 'Cancelled after payment'));

    insert into notification (profile_id, order_id, kind, title, body)
    select o.user_id, o.order_id, 'refund.requested',
           'Refund requested',
           'Order ' || o.order_number || ' was cancelled. Your refund has been '
           || 'requested and is waiting to be processed.'
      from "order" o
     where o.order_id = p_order_id and o.user_id is not null;

    return jsonb_build_object('released', v_released, 'refund_required', true,
                              'refund_amount_kobo', v_paid);
  end if;

  update "order"
     set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
   where order_id = p_order_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, note)
  values (p_actor_id, 'order.cancelled', 'order', p_order_id, p_reason);

  return jsonb_build_object('released', v_released, 'refund_required', false);
end $$;


-- ============================================================================
-- PART 15 + 43 — non-Paystack payments could be recorded twice
--
-- Only Paystack references were unique. A cashier double-tapping CONFIRM CASH
-- RECEIVED created two paid rows against one order, so reconciliation expected
-- twice the cash that was in the drawer.
-- ============================================================================

create unique index if not exists payment_one_paid_per_order
  on payment (order_id) where status = 'paid';


-- ============================================================================
-- PART 42 — indexes the new access patterns need
-- ============================================================================

create index if not exists profile_auth_user_idx on profile (auth_user_id);
create index if not exists order_guest_lookup_idx
  on "order" (guest_token_hash) where guest_token_hash is not null;
create index if not exists notification_attempts_idx
  on notification (send_status, attempts) where send_status = 'failed';
create index if not exists idempotency_scope_idx on idempotency_key (scope, created_at desc);


-- ============================================================================
-- Housekeeping: idempotency keys are only useful for a day.
-- ============================================================================

create or replace function purge_idempotency_keys(p_older_than interval default '24 hours')
returns integer language sql security definer set search_path = public as $$
  with gone as (
    delete from idempotency_key where created_at < now() - p_older_than returning 1)
  select count(*)::integer from gone
$$;
