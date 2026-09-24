import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type ShopItem } from "../../lib/api";
import { useCart } from "../../lib/cart";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import { CompleteTheSet } from "../../components/CompleteTheSet";

function imageUrl(basePath?: string | null) {
  return basePath ? `${import.meta.env.VITE_MEDIA_BASE}/${basePath}/detail.webp` : "";
}

export default function ProductPage() {
  const { kind, id } = useParams<{ kind: "product" | "bundle"; id: string }>();
  const nav = useNavigate();
  const { add } = useCart();
  const [data, setData] = useState<ShopItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!id || !kind) return;
    setError(null);
    (kind === "bundle" ? api.bundle(id) : api.product(id))
      .then((r) => setData(kind === "bundle" ? r.bundle : r.product))
      .catch((e: ApiError) => setError(e.message));
  }, [kind, id]);

  const imagePath = kind === "bundle" ? data?.image?.base_path : data?.image_asset?.base_path;
  const soldOut = (data?.available ?? 0) <= 0;
  const node = soldOut && kind === "product" ? "1:1488" : "1:1462";

  const values = useMemo(() => {
    if (!data) return undefined;
    return {
      "1:1473": data.name,
      "1:1474": data.subtitle ?? (kind === "bundle" ? "KIT" : "ACCESSORY"),
      "1:1476": added ? "IN CART" : "ADD to Cart",
      "1:1499": data.name,
      "1:1500": data.subtitle ?? (kind === "bundle" ? "KIT" : "ACCESSORY"),
      "1:1502": "ITEM UNAVAILABLE",
    };
  }, [data, kind, added]);

  const images = useMemo(() => {
    const src = imageUrl(imagePath);
    return src ? {
      "1:1477": src,
      "1:1503": src,
    } : undefined;
  }, [imagePath]);

  if (error) return <div className="screen"><p role="alert">{error}</p><button onClick={() => nav(0)}>RETRY</button></div>;
  if (!data) return <div className="screen"><div className="sr-only">Fetching product…</div></div>;

  function addToCart() {
    if (soldOut || added) return;
    add({
      kind: kind!,
      id: data.bundle_id ?? data.product_id,
      name: data.name,
      price_kobo: data.price_kobo,
      image_path: imagePath ?? null,
      available_at_add: data.available,
    });
    setAdded(true);
    setTimeout(() => nav("/cart"), 400);
  }

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node={node} values={values} images={images}>
        <button
          className="figma-route-interactive"
          style={{ left: 25, top: 70, width: 70, height: 70 }}
          aria-label="Back"
          onClick={() => nav(-1)}
        />
        <button
          className="figma-route-interactive"
          style={{ left: 110, top: 620, width: 220, height: 120 }}
          aria-label={soldOut ? "Unavailable" : "Add to cart"}
          disabled={soldOut || added}
          onClick={addToCart}
        />
      </FigmaRouteFrame>

      {!soldOut && !added && kind === "product" && (
        <div className="sr-only"><CompleteTheSet productIds={[data.product_id]} onAdded={() => nav("/cart")} /></div>
      )}
    </div>
  );
}
