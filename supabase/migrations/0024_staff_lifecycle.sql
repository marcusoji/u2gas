-- ============================================================================
-- U2GAS — 0024 staff lifecycle
--
-- The admin's STAFF screens draw ADD STAFF and REMOVE STAFF as controls, and
-- nothing behind them existed. A manager could see the roster and change a
-- person's bank details, but could not bring somebody onto the till or take
-- them off it. The two functions here are those controls.
--
-- Adding is two rows, and both are required before the person can act:
--
--   * a `profile` with the role. The role is what `requireRole` reads, and the
--     auth middleware deliberately loads it from this table rather than from
--     the JWT, so a role change takes effect on the next request and a stale
--     token cannot carry a revoked role.
--   * a `staff_member` row. Every till write is attributed to one (see
--     `staffId` in routes/staff.ts); without it a cashier can sign in and then
--     gets STAFF_RECORD_MISSING on the first sale.
--
-- The account itself is not created here. A profile row with no auth user is
-- one nobody can sign in as, so the function requires the account to already
-- exist — the documented way is a Supabase invite (docs/DEPLOY-NO-CLI.md) — and
-- says so when it does not. That keeps the roster from listing colleagues who
-- can never reach the till.
--
-- Removing is a soft delete, because the person is referenced by every sale
-- they rang up. `staff_member.status` goes to 'removed' (the roster query
-- already filters that out) and `removed_at` is stamped; the profile and its
-- history stay. Hard-deleting would cascade the staff row away and leave the
-- order's `recorded_by_staff_id` dangling.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The enums the admin may assign through this screen. Deliberately excludes
-- 'customer': this endpoint brings someone onto the till, and a customer is
-- made by the auth trigger at signup, not here.
-- ---------------------------------------------------------------------------
create or replace function staff_assignable_roles()
returns text[] language sql immutable as $$
  select array['staff', 'manager', 'admin', 'driver']::text[]
$$;

-- ---------------------------------------------------------------------------
-- 1. Add (or re-role) a staff member.
-- ---------------------------------------------------------------------------
create or replace function admin_add_staff(
  p_actor   uuid,
  p_email   text,
  p_name    text,
  p_role    text,
  p_bank    text default null,
  p_account text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_auth    uuid;
  v_profile uuid;
  v_staff   uuid;
  v_created boolean := false;
begin
  if p_role <> all (staff_assignable_roles()) then
    raise exception 'VALIDATION_FAILED'
      using detail = json_build_object('field', 'role', 'value', p_role)::text;
  end if;

  if p_account is not null and p_account <> '' and p_account !~ '^[0-9]{10}$' then
    raise exception 'VALIDATION_FAILED'
      using detail = json_build_object('field', 'account_number')::text;
  end if;

  -- The account has to exist before it can be put on the roster: a profile row
  -- without an auth user is one nobody can sign in as, so the roster would list
  -- a colleague who can never reach the till. The documented way to create the
  -- account is a Supabase invite (docs/DEPLOY-NO-CLI.md), so the admin is told
  -- to send one rather than being left with a dead row.
  select id into v_auth from auth.users where email = p_email;
  select profile_id into v_profile from profile where email = p_email;

  if v_profile is null and v_auth is null then
    raise exception 'STAFF_ACCOUNT_MISSING'
      using detail = json_build_object('email', p_email)::text;
  end if;

  if v_profile is null then
    -- Signed up, but the profile trigger never ran (e.g. it was added in 0012,
    -- after this account existed). Link the real auth user.
    v_profile := gen_random_uuid();
    insert into profile (profile_id, auth_user_id, role, display_name, email)
    values (v_profile, v_auth, p_role::app_role, p_name, p_email);
    v_created := true;
  else
    -- An existing account keeps its identity; only the role changes.
    update profile set role = p_role::app_role,
                       display_name = coalesce(nullif(p_name, ''), display_name),
                       updated_at = now()
     where profile_id = v_profile;
  end if;

  -- Reactivate a previously removed record rather than inserting a second one:
  -- profile_id is unique on staff_member.
  insert into staff_member (profile_id, status, bank_name, account_number)
  values (v_profile, 'active', nullif(p_bank, ''), nullif(p_account, ''))
  on conflict (profile_id) do update
    set status = 'active',
        removed_at = null,
        bank_name = coalesce(excluded.bank_name, staff_member.bank_name),
        account_number = coalesce(excluded.account_number, staff_member.account_number)
  returning staff_id into v_staff;

  -- A driver is also a driver row, or the delivery app has nothing to act as.
  if p_role = 'driver' then
    insert into driver (profile_id, phone, status)
    values (v_profile, '0000000000', 'offline')
    on conflict (profile_id) do nothing;
  end if;

  insert into audit_log (action, entity_type, entity_id, after, actor_id, note)
  values ('staff.added', 'staff_member', v_staff,
          jsonb_build_object('profile_id', v_profile, 'role', p_role, 'email', p_email),
          p_actor, case when v_created then 'New staff account created' else 'Existing account added to staff' end);

  return jsonb_build_object(
    'staff_id', v_staff, 'profile_id', v_profile,
    'role', p_role, 'created', v_created);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Remove a staff member.
--
-- Refuses to remove the last active admin: a roster with nobody who can manage
-- it is unrecoverable through the app. The check counts other admins, so an
-- admin removing themselves is allowed only while somebody else remains.
-- ---------------------------------------------------------------------------
create or replace function admin_remove_staff(
  p_actor    uuid,
  p_staff_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
  v_role    app_role;
  v_others  integer;
begin
  select s.profile_id, p.role into v_profile, v_role
    from staff_member s join profile p on p.profile_id = s.profile_id
   where s.staff_id = p_staff_id
     for update of s;

  if v_profile is null then
    raise exception 'STAFF_NOT_FOUND'
      using detail = json_build_object('staff_id', p_staff_id)::text;
  end if;

  if v_role = 'admin' then
    select count(*) into v_others
      from staff_member s join profile p on p.profile_id = s.profile_id
     where p.role = 'admin' and s.status = 'active' and s.staff_id <> p_staff_id;
    if v_others = 0 then
      raise exception 'LAST_ADMIN'
        using detail = json_build_object('staff_id', p_staff_id)::text;
    end if;
  end if;

  update staff_member
     set status = 'removed', removed_at = now()
   where staff_id = p_staff_id;

  -- Off the roster and off the delivery board.
  update driver set status = 'offline' where profile_id = v_profile;

  -- Back to a plain account. Keeping the staff role would leave them able to
  -- read the till through RLS even though they are off the roster.
  update profile set role = 'customer', updated_at = now()
   where profile_id = v_profile;

  insert into audit_log (action, entity_type, entity_id, before, actor_id, note)
  values ('staff.removed', 'staff_member', p_staff_id,
          jsonb_build_object('profile_id', v_profile, 'role', v_role),
          p_actor, 'Removed from staff');

  return jsonb_build_object('staff_id', p_staff_id, 'status', 'removed');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Callable only by the Worker's service role.
--
-- The same rule the hardening migration applies to every other business write:
-- the browser's Supabase client must not reach these. `security definer` runs
-- them as the owner, so without this grant a signed-in admin's own JWT could
-- call them through PostgREST and bypass the Worker entirely.
-- ---------------------------------------------------------------------------
revoke all on function admin_add_staff(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function admin_remove_staff(uuid, uuid) from public, anon, authenticated;
