-- ============================================================================
-- U2GAS — 0008 atomic product stock adjustment
--
-- Fixes a read-modify-write race found during the final audit.
--
-- The admin product route previously read stock_qty, added the delta in
-- JavaScript, and wrote the result back as an absolute number. If a QR was
-- redeemed in between, fulfill_reservations had already decremented stock_qty,
-- and the admin's write — computed from the stale value — silently put that
-- stock back. The tank would show gas that had already left the building.
--
-- Applying the delta inside the database, under a row lock, removes the window
-- entirely. This is the same rule the rest of the system already follows:
-- nothing outside these functions touches inventory columns.
-- ============================================================================

create or replace function adjust_product_stock(
  p_product_id uuid,
  p_delta      integer,
  p_actor_id   uuid default null,
  p_note       text default null
) returns product
language plpgsql security definer set search_path = public as $$
declare
  v_before product;
  v_after  product;
begin
  if p_delta = 0 then
    raise exception 'INVALID_QUANTITY' using detail = '{"field":"stock_delta"}';
  end if;

  select * into v_before from product
   where product_id = p_product_id
   for update;

  if not found then
    raise exception 'PRODUCT_NOT_FOUND'
      using detail = json_build_object('product_id', p_product_id)::text;
  end if;

  -- Stock may never fall below what is already promised to customers.
  -- product_reserved_lte_stock would catch this anyway, but raising here
  -- gives the admin the two numbers they need rather than a constraint name.
  if v_before.stock_qty + p_delta < v_before.reserved_qty then
    raise exception 'INSUFFICIENT_STOCK'
      using detail = json_build_object(
        'product_id',   p_product_id,
        'product_name', v_before.name,
        'requested',    abs(p_delta),
        'available',    v_before.stock_qty - v_before.reserved_qty
      )::text;
  end if;

  update product
     set stock_qty  = stock_qty + p_delta,
         updated_at = now()
   where product_id = p_product_id
  returning * into v_after;

  insert into audit_log (actor_id, action, entity_type, entity_id, before, after, note)
  values (p_actor_id,
          case when p_delta > 0 then 'product.stock_added' else 'product.stock_removed' end,
          'product', p_product_id,
          json_build_object('stock_qty', v_before.stock_qty)::jsonb,
          json_build_object('stock_qty', v_after.stock_qty, 'delta', p_delta)::jsonb,
          p_note);

  return v_after;
end $$;
