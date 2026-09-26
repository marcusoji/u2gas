import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "./api";
import { useCart } from "./cart";

/**
 * `?add=<id>` puts one catalogue item in the basket, so a basket state can be
 * linked to directly. Without it a deep link could only ever show the empty
 * artboard, which is what the parity harness's "filled cart" target silently
 * did. The parameter is dropped once applied so a reload does not re-add.
 *
 * Shared by the basket and checkout routes. Returns whether a seed is still in
 * flight: checkout must not read the momentarily empty basket as "nothing to
 * check out" and bounce back to `/cart` before the item lands.
 */
export function useAddFromQuery(): boolean {
  const [params, setParams] = useSearchParams();
  const { add } = useCart();
  const [seeding, setSeeding] = useState(() => params.has("add"));
  // Dev StrictMode runs an effect twice on one mount, and the second run still
  // sees the pre-`setParams` query — without this the item is added twice.
  const applied = useRef<string | null>(null);

  useEffect(() => {
    const id = params.get("add");
    if (!id || applied.current === id) return;
    applied.current = id;
    setSeeding(true);
    const next = new URLSearchParams(params);
    next.delete("add");
    setParams(next, { replace: true });
    api.product(id)
      .then(({ product }) => add({
        kind: "product",
        id: product.product_id,
        name: product.name,
        price_kobo: product.price_kobo,
        image_path: product.image_asset?.base_path ?? null,
        available_at_add: product.available,
      }))
      // An unknown id leaves the basket as it was; the route then shows the
      // empty state rather than hanging on a pending seed.
      .catch(() => {})
      .finally(() => setSeeding(false));
  }, [params, setParams, add]);

  return seeding;
}
