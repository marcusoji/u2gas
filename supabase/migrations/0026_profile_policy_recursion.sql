-- ----------------------------------------------------------------------------
-- FIX — the profile read policy recursed into itself
--
-- 0009 replaced `profile_self_read` with a "non-recursive" lookup that reads
-- `profile` inside its own USING clause:
--
--     or exists (select 1 from profile me where me.auth_user_id = auth.uid() …)
--
-- A policy on `profile` is evaluated for every row the subquery reads, so that
-- subquery re-enters `profile_self_read` and Postgres aborts with
--
--     ERROR: 42P17 infinite recursion detected in policy for relation "profile"
--
-- The 0009 comment said this could not loop "because FORCE is reinstated" — but
-- the subquery runs as the *querying* role (authenticated), not as the table
-- owner, so turning FORCE off does nothing for it. Only a SECURITY DEFINER
-- helper runs exempt, which is exactly what `is_staff()` is.
--
-- The consequence was broad: the Worker reads the order with an embedded
-- `profile:user_id (…)`, so RLS on the embedded relation made every signed-in
-- `GET /api/orders/:id` answer 500 INTERNAL, and a browser session could not
-- read its own profile at all.
--
-- Restore the 0006 form. `is_staff()` calls `current_role_name()`, which is
-- SECURITY DEFINER and reads `profile` with RLS bypassed, so the loop cannot
-- form. `profile` keeps FORCE off (0009) so that definer read stays exempt.
-- ----------------------------------------------------------------------------

drop policy if exists profile_self_read on profile;

create policy profile_self_read on profile
  for select using (auth_user_id = auth.uid() or is_staff());
