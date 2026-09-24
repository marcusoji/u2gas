-- ============================================================================
-- U2GAS — 0017 saved addresses
--
-- Item 7. The delivery sheet made every customer retype their address on every
-- order, and the profile screen listed "Saved addresses" with nothing behind
-- it.
-- ============================================================================

create table if not exists saved_address (
  address_id   uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profile(profile_id) on delete cascade,
  label        text not null,                   -- HOME, SHOP, MUM'S PLACE
  line         text not null,
  zone_id      uuid references delivery_zone(zone_id) on delete set null,
  latitude     numeric(9,6),
  longitude    numeric(9,6),
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint saved_address_label_len check (length(trim(label)) between 1 and 40),
  constraint saved_address_line_len  check (length(trim(line))  between 6 and 500),
  constraint saved_address_lat_range check (latitude  is null or latitude  between -90  and 90),
  constraint saved_address_lng_range check (longitude is null or longitude between -180 and 180)
);

-- One label per person. Two addresses both called HOME is a bug, not a choice.
create unique index if not exists saved_address_label_idx
  on saved_address (profile_id, lower(trim(label)));

-- At most one default, enforced by the database rather than by remembering to
-- clear the old one every time.
create unique index if not exists saved_address_one_default_idx
  on saved_address (profile_id) where is_default;

create index if not exists saved_address_profile_idx
  on saved_address (profile_id, created_at desc);

-- A person with a dozen saved addresses is a data-entry accident.
create or replace function saved_address_cap() returns trigger
language plpgsql as $$
begin
  if (select count(*) from saved_address where profile_id = new.profile_id) > 20 then
    raise exception 'TOO_MANY_ADDRESSES'
      using detail = '{"max":20}';
  end if;
  return null;
end $$;

drop trigger if exists saved_address_ceiling on saved_address;
create constraint trigger saved_address_ceiling
  after insert on saved_address
  deferrable initially deferred
  for each row execute function saved_address_cap();

create or replace function touch_saved_address() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists saved_address_touch on saved_address;
create trigger saved_address_touch before update on saved_address
  for each row execute function touch_saved_address();

-- ----------------------------------------------------------------------------
-- RLS — owner only, and unlike the business tables the owner may write.
--
-- This is one of the few tables where that is right: an address book belongs
-- to the person, carries no financial or inventory meaning, and routing it
-- through the Worker would add a hop for nothing. Staff cannot read it — a
-- cashier has no reason to browse where customers live.
-- ----------------------------------------------------------------------------

alter table saved_address enable row level security;
alter table saved_address force row level security;

drop policy if exists saved_address_owner on saved_address;
create policy saved_address_owner on saved_address
  for all
  using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());

grant select, insert, update, delete on saved_address to authenticated;

-- ----------------------------------------------------------------------------
-- Setting one address as the default clears the previous one, in a single
-- statement so the unique index can never see two.
-- ----------------------------------------------------------------------------

create or replace function set_default_address(p_address_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
begin
  select profile_id into v_profile
    from saved_address where address_id = p_address_id;

  if v_profile is null then
    raise exception 'ADDRESS_NOT_FOUND';
  end if;

  if v_profile <> current_profile_id() then
    raise exception 'FORBIDDEN';
  end if;

  update saved_address
     set is_default = (address_id = p_address_id)
   where profile_id = v_profile
     and is_default <> (address_id = p_address_id);
end $$;

revoke all on function set_default_address(uuid) from public;
grant execute on function set_default_address(uuid) to authenticated;
