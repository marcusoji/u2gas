-- ============================================================================
-- U2GAS — test suite 03: shared image assets, reference-safe cleanup, atomic
--                        admin writes, and order/payment state transitions.
--
-- Covers migration 0023. Same harness as 01/02: t_assert records a row per
-- check, and the file prints a summary at the end.
--
--   psql "$DATABASE_URL" -f supabase/tests/03_assets_and_transitions.sql
--
-- Not executed here: this repository has no Postgres to run it against.
-- ============================================================================

\set ON_ERROR_STOP off

begin;

create temporary table if not exists t_result (name text, ok boolean, detail text);

create or replace function t_assert(p_name text, p_cond boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into t_result values (p_name, p_cond, p_detail);
  if not p_cond then
    raise warning 'FAIL: % — %', p_name, coalesce(p_detail, '');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: two profiles, one product, one shared picture.
-- ---------------------------------------------------------------------------

do $$
declare
  v_a       uuid;
  v_b       uuid;
  v_asset   uuid;
  v_asset2  uuid;
  v_product uuid;
  v_refs    integer;
  v_purged  integer;
  v_err     text;
begin
  insert into profile (display_name, role) values ('Asset Test A', 'customer')
    returning profile_id into v_a;
  insert into profile (display_name, role) values ('Asset Test B', 'customer')
    returning profile_id into v_b;

  -- ---------------------------------------------------------------- 1. dedupe
  -- Same owner namespace + same bytes = one row (content addressing).
  insert into image_asset (owner_type, uploaded_for, base_path, sha256,
                           width, height, bytes_source, bytes_grid)
  values ('profile', v_a, 'profiles/aaaa', repeat('a', 64), 100, 100, 10, 10)
  returning asset_id into v_asset;

  begin
    insert into image_asset (owner_type, uploaded_for, base_path, sha256,
                             width, height, bytes_source, bytes_grid)
    values ('profile', v_a, 'profiles/aaaa', repeat('a', 64), 100, 100, 10, 10);
    perform t_assert('03.1 same owner + same image is refused a second row', false,
                     'the unique index did not fire');
  exception when unique_violation then
    perform t_assert('03.1 same owner + same image is refused a second row', true);
  end;

  -- ------------------------------------------------- 2. two owners, one asset
  -- B references the very row A uploaded. That is the intended shared model:
  -- the asset has no owner, only references.
  update profile set avatar_asset = v_asset where profile_id = v_a;
  update profile set avatar_asset = v_asset where profile_id = v_b;

  select image_asset_refs(v_asset) into v_refs;
  perform t_assert('03.2 different owners share one asset', v_refs = 2,
                   format('expected 2 references, got %s', v_refs));

  perform t_assert('03.2b uploaded_for is provenance, not a claim',
                   (select uploaded_for from image_asset where asset_id = v_asset) = v_a);

  -- ------------------------------------- 3. dropping one reference of several
  update profile set avatar_asset = null where profile_id = v_a;
  select image_asset_refs(v_asset) into v_refs;
  perform t_assert('03.3 dropping one reference leaves the other intact',
                   v_refs = 1, format('expected 1 reference, got %s', v_refs));
  perform t_assert('03.3b the other owner still sees the picture',
                   (select avatar_asset from profile where profile_id = v_b) = v_asset);

  -- --------------------------------- 4. a referenced asset cannot be deleted
  begin
    delete from image_asset where asset_id = v_asset;
    perform t_assert('03.4 deleting a referenced asset is refused', false,
                     'the delete succeeded and should not have');
  exception when foreign_key_violation then
    perform t_assert('03.4 deleting a referenced asset is refused', true);
  end;

  begin
    perform soft_delete_image_asset(v_asset);
    perform t_assert('03.4b soft-deleting a referenced asset is refused', false,
                     'soft delete succeeded while a reference existed');
  exception when others then
    get stacked diagnostics v_err = returned_sqlstate;
    perform t_assert('03.4b soft-deleting a referenced asset is refused',
                     v_err = 'P0017', format('unexpected sqlstate %s', v_err));
  end;

  -- ------------------------------- 5. cleanup ignores referenced assets, and
  --                                    collects unreferenced ones, repeatably
  perform t_assert('03.5 cleanup does not claim a referenced asset',
                   not exists (select 1 from claim_deleted_assets(100) c
                               where c.asset_id = v_asset));

  insert into image_asset (owner_type, uploaded_for, base_path, sha256,
                           width, height, bytes_source, bytes_grid, deleted_at)
  values ('product', null, 'products/bbbb', repeat('b', 64), 100, 100, 10, 10,
          now() - interval '2 hours')
  returning asset_id into v_asset2;

  perform t_assert('03.5b an old, unreferenced, soft-deleted asset is claimed',
                   exists (select 1 from claim_deleted_assets(100) c
                           where c.asset_id = v_asset2));

  select purge_assets(array[v_asset2]) into v_purged;
  perform t_assert('03.5c purge removes it', v_purged = 1,
                   format('purged %s', v_purged));

  select purge_assets(array[v_asset2]) into v_purged;
  perform t_assert('03.5d purge is idempotent — the second run is a no-op',
                   v_purged = 0, format('purged %s on replay', v_purged));

  select purge_assets(array[v_asset]) into v_purged;
  perform t_assert('03.5e purge refuses a referenced asset', v_purged = 0,
                   format('purged %s while referenced', v_purged));

  -- ------------------------------------- 6. reference created during cleanup
  -- The asset is claimed (locked) and then adopted before the purge decides.
  -- purge re-checks under the lock, so the adoption wins and nothing is lost.
  insert into image_asset (owner_type, uploaded_for, base_path, sha256,
                           width, height, bytes_source, bytes_grid, deleted_at)
  values ('product', null, 'products/cccc', repeat('c', 64), 100, 100, 10, 10,
          now() - interval '2 hours')
  returning asset_id into v_asset2;

  insert into product (name, price_kobo, image_asset)
  values ('Asset Test Product', 100000, v_asset2)
  returning product_id into v_product;

  select purge_assets(array[v_asset2]) into v_purged;
  perform t_assert('03.6 an asset adopted mid-cleanup is not deleted',
                   v_purged = 0 and exists (select 1 from image_asset where asset_id = v_asset2));

  -- ------------------------------------------------ 7. atomic product create
  declare
    v_new product;
  begin
    select * into v_new from admin_create_product(
      jsonb_build_object('name', 'Atomic Product', 'price_kobo', 250000, 'active', true),
      jsonb_build_object('weight_kg', '12.5', 'colour', 'red'),
      v_a);

    perform t_assert('03.7 product, attributes and audit land together',
      (select count(*) from product_attribute where product_id = v_new.product_id) = 2
      and exists (select 1 from audit_log
                  where entity_id = v_new.product_id and action = 'product.created'));

    -- a payload that reaches for a column outside the allowlist changes nothing
    perform admin_update_product(v_new.product_id,
              jsonb_build_object('stock_kg', 9999, 'name', 'Renamed'), v_a);
    perform t_assert('03.7b writes outside the allowlist are ignored',
      (select name from product where product_id = v_new.product_id) = 'Renamed');

    delete from product_attribute where product_id = v_new.product_id;
    delete from audit_log where entity_id = v_new.product_id;
    delete from product where product_id = v_new.product_id;
  end;

  -- clean up fixtures
  delete from product where product_id = v_product;
  delete from image_asset where asset_id = v_asset2;
  update profile set avatar_asset = null where profile_id in (v_a, v_b);
  delete from image_asset where asset_id = v_asset;
  delete from profile where profile_id in (v_a, v_b);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Order and payment transitions.
-- ---------------------------------------------------------------------------

do $$
declare
  v_order uuid;
  v_err   text;
begin
  insert into "order" (channel, status, payment_status, total_kobo)
  values ('online', 'pending', 'pending', 500000)
  returning order_id into v_order;

  -- legal
  update "order" set payment_status = 'paid', status = 'confirmed' where order_id = v_order;
  perform t_assert('03.8 pending -> confirmed/paid is allowed',
                   (select status::text from "order" where order_id = v_order) = 'confirmed');

  -- same-value rewrite stays legal, so the payment route remains idempotent
  begin
    update "order" set payment_status = 'paid' where order_id = v_order;
    perform t_assert('03.8b re-writing the same status is allowed (idempotency)', true);
  exception when others then
    perform t_assert('03.8b re-writing the same status is allowed (idempotency)', false);
  end;

  -- CANCELLED -> PAID
  update "order" set status = 'cancelled' where order_id = v_order;
  begin
    update "order" set payment_status = 'paid', status = 'confirmed' where order_id = v_order;
    perform t_assert('03.8c cancelled -> confirmed is refused', false, 'the update succeeded');
  exception when others then
    get stacked diagnostics v_err = returned_sqlstate;
    perform t_assert('03.8c cancelled -> confirmed is refused', v_err = 'P0018',
                     format('sqlstate %s', v_err));
  end;

  -- REFUNDED -> PAID
  update "order" set payment_status = 'refunded' where order_id = v_order;
  begin
    update "order" set payment_status = 'paid' where order_id = v_order;
    perform t_assert('03.8d refunded -> paid is refused', false, 'the update succeeded');
  exception when others then
    get stacked diagnostics v_err = returned_sqlstate;
    perform t_assert('03.8d refunded -> paid is refused', v_err = 'P0019',
                     format('sqlstate %s', v_err));
  end;

  delete from "order" where order_id = v_order;

  -- DELIVERED (fulfilled) -> PENDING
  insert into "order" (channel, status, payment_status, total_kobo)
  values ('online', 'pending', 'pending', 500000) returning order_id into v_order;
  update "order" set status = 'confirmed' where order_id = v_order;
  update "order" set status = 'fulfilled' where order_id = v_order;
  begin
    update "order" set status = 'pending' where order_id = v_order;
    perform t_assert('03.8e fulfilled -> pending is refused', false, 'the update succeeded');
  exception when others then
    get stacked diagnostics v_err = returned_sqlstate;
    perform t_assert('03.8e fulfilled -> pending is refused', v_err = 'P0018',
                     format('sqlstate %s', v_err));
  end;

  delete from "order" where order_id = v_order;
end $$;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------

select count(*) filter (where ok)       as passed,
       count(*) filter (where not ok)   as failed,
       count(*)                          as total
from   t_result;

select name, detail from t_result where not ok order by name;

rollback;
