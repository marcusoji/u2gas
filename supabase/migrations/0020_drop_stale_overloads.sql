-- ============================================================================
-- U2GAS — 0020 drop obsolete function overloads
--
-- 0019 redefined four functions with new argument lists. CREATE OR REPLACE
-- only replaces a function with an identical signature — a different argument
-- list creates a second overload and leaves the old one in place.
--
-- That matters for two reasons:
--
--   1. Ambiguity. claim_unsent_notifications(integer) and the new
--      claim_unsent_notifications(integer, integer default 300) both match a
--      one-argument call, and Postgres refuses with "function is not unique".
--
--   2. The old bodies are the bugs 0019 fixed. claim_idempotency's old
--      signature matched on the key alone, which returned one caller's
--      response to another. Leaving it callable leaves that hole open.
--
-- Argument types below are the identity arguments as Postgres records them:
-- char(64) is reported as `character`.
-- ============================================================================

-- Old: matched on key alone, no request hash, no lease.
-- New: (text, text, text, uuid, character, integer)
drop function if exists claim_idempotency(text, text, character, uuid);

-- Old: no scope and no caller, so it could complete another endpoint's row.
-- New: (text, text, jsonb, uuid, character)
drop function if exists complete_idempotency(text, jsonb);

-- Not in the original list, but the same leftover: the old one-argument form
-- deleted by key alone, across every scope and caller.
-- New: (text, text, uuid, character)
drop function if exists release_idempotency(text);

-- Old: set emailed_at while claiming, and returned a different column list.
-- New: (integer, integer)
drop function if exists claim_unsent_notifications(integer);

-- ----------------------------------------------------------------------------
-- Guard: fail loudly if any of these names still has more than one overload.
--
-- A silent duplicate is exactly the failure this migration exists to prevent,
-- and it would otherwise only surface as a runtime "function is not unique"
-- on a live request.
-- ----------------------------------------------------------------------------

do $$
declare
  r record;
  problems text := '';
begin
  for r in
    select p.proname, count(*) as n
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'claim_idempotency','complete_idempotency','release_idempotency',
         'claim_unsent_notifications','issue_qr','confirm_payment',
         'reserve_products','reserve_gas','cancel_order','redeem_qr'
       )
     group by p.proname
    having count(*) > 1
  loop
    problems := problems || format('%s has %s overloads; ', r.proname, r.n);
  end loop;

  if problems <> '' then
    raise exception 'Duplicate function overloads remain: %', problems;
  end if;
end $$;
