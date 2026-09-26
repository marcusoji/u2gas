import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Product, type Bundle } from "../../lib/api";
import { useCart } from "../../lib/cart";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import { CompleteTheSet } from "../../components/CompleteTheSet";
import { useBackTo } from "../../components/primitives";
import { mediaUrl } from "../../lib/media";

const imageUrl = (basePath?: string | null) => mediaUrl(basePath, "detail");

/** The two catalogue detail shapes share a drawing but not a field set. */
type Detail =
  | { kind: "product"; product: Product }
  | { kind: "bundle"; bundle: Bundle };

export default function ProductPage() {
  const { kind, id } = useParams<{ kind: "product" | "bundle"; id: string }>();
  const nav = useNavigate();
  const backToShop = useBackTo("/shop");
  const { add } = useCart();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!id || !kind) return;
    setError(null);
    setData(null);
    setAdded(false);
    if (kind === "bundle") {
      api.bundle(id)
        .then((r) => setData({ kind: "bundle", bundle: r.bundle }))
        .catch((e: ApiError) => setError(e.message));
    } else {
      api.product(id)
        .then((r) => setData({ kind: "product", product: r.product }))
        .catch((e: ApiError) => setError(e.message));
    }
  }, [kind, id]);

  const item = data?.kind === "product" ? data.product : data?.bundle ?? null;
  const subtitle = data?.kind === "product"
    ? data.product.subtitle
    : data?.kind === "bundle" ? "KIT" : null;
  const imagePath = data?.kind === "bundle"
    ? data.bundle.image?.base_path
    : data?.kind === "product" ? data.product.image_asset?.base_path : null;
  const soldOut = (item?.available ?? 0) <= 0;
  const node = soldOut && kind === "product" ? "1:1488" : "1:1462";

  const values = useMemo(() => {
    if (!item) return undefined;
    return {
      "1:1473": item.name,
      "1:1474": subtitle ?? "ACCESSORY",
      "1:1476": added ? "IN CART" : "ADD to Cart",
      "1:1499": item.name,
      "1:1500": subtitle ?? "ACCESSORY",
      "1:1502": "ITEM UNAVAILABLE",
    };
  }, [item, subtitle, added]);

  const images = useMemo(() => {
    const src = imageUrl(imagePath);
    return src ? {
      "1:1477": src,
      "1:1503": src,
    } : undefined;
  }, [imagePath]);

  if (error) return <div className="screen"><p role="alert">{error}</p><button onClick={() => nav(0)}>RETRY</button></div>;
  if (!data || !item) return <div className="screen"><div className="sr-only">Fetching product…</div></div>;

  const itemId = data.kind === "bundle" ? data.bundle.bundle_id : data.product.product_id;

  function addToCart() {
    if (!data || !item || soldOut || added) return;
    add({
      kind: data.kind,
      id: itemId,
      name: item.name,
      price_kobo: item.price_kobo,
      image_path: imagePath ?? null,
      available_at_add: item.available,
    });
    setAdded(true);
    setTimeout(() => nav("/cart"), 400);
  }

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node={node} values={values} images={images}>
        {/* 1:1483 draws the back button at (32,80) 52x52. The hotspot matches
            those coordinates so the tap lands on the button a person can see. */}
        <button
          className="figma-route-interactive"
          style={{ left: 32, top: 80, width: 52, height: 52 }}
          aria-label="Back to the shop"
          onClick={backToShop}
        />
        <button
          className="figma-route-interactive"
          style={{ left: 110, top: 620, width: 220, height: 120 }}
          aria-label={soldOut ? "Unavailable" : "Add to cart"}
          disabled={soldOut || added}
          onClick={addToCart}
        />
      </FigmaRouteFrame>

      {!soldOut && !added && data.kind === "product" && (
        <div className="sr-only">
          <CompleteTheSet productIds={[data.product.product_id]} onAdded={() => nav("/cart")} />
        </div>
      )}
    </div>
  );
}
