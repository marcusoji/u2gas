-- ============================================================================
-- U2GAS — 0015 audit correlation and rate-limit support
--
-- PART 44 — an audit entry recorded who, what, when and the before/after
-- values, but nothing tying it to the request that caused it. When a customer
-- reports a problem you have a Worker log line with a request id and an audit
-- row with no way to connect them, which is exactly when you need the link.
-- ============================================================================

alter table audit_log
  add column if not exists request_id text;

comment on column audit_log.request_id is
  'Correlates this entry with the Worker log line for the same request
   (X-Request-Id). Never contains a token or key — it is a random 16-hex id.';

create index if not exists audit_request_idx
  on audit_log (request_id) where request_id is not null;

-- ----------------------------------------------------------------------------
-- Let the Worker attach the request id without every call site remembering.
--
-- Postgres has no per-connection "current request", so the Worker sets it as a
-- session GUC on the transaction and the trigger reads it back. If nothing set
-- it, the column stays null rather than failing the write — an audit row with
-- no correlation id is still worth far more than no audit row.
-- ----------------------------------------------------------------------------

create or replace function audit_attach_request_id() returns trigger
language plpgsql as $$
begin
  if new.request_id is null then
    begin
      new.request_id := nullif(current_setting('u2gas.request_id', true), '');
    exception when others then
      new.request_id := null;
    end;
  end if;

  -- Fill in the actor's role so a later role change cannot rewrite history.
  if new.actor_role is null and new.actor_id is not null then
    select role into new.actor_role from profile where profile_id = new.actor_id;
  end if;

  return new;
end $$;

drop trigger if exists audit_request_id on audit_log;
create trigger audit_request_id
  before insert on audit_log
  for each row execute function audit_attach_request_id();

-- ----------------------------------------------------------------------------
-- Helper the Worker calls once per request that is going to write.
-- ----------------------------------------------------------------------------

create or replace function set_request_id(p_request_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Bounded and sanitised: this value is echoed into audit rows, so it must
  -- not become a place to smuggle content.
  if p_request_id is null or p_request_id !~ '^[a-f0-9]{8,64}$' then
    return;
  end if;
  perform set_config('u2gas.request_id', p_request_id, true);  -- true = transaction-local
end $$;

revoke all on function set_request_id(text) from public;
revoke all on function set_request_id(text) from anon, authenticated;

-- ----------------------------------------------------------------------------
-- PART 42 — the audit log is read by the admin screen filtered and ordered by
-- time, and increasingly by action when chasing a specific event.
-- ----------------------------------------------------------------------------

create index if not exists audit_action_time_idx
  on audit_log (action, created_at desc);
