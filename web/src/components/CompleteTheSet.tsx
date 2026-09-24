import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type BundleOffer } from "../lib/api";
import { useCart } from "../lib/cart";
import { Pill, ProductImage, money } from "./primitives";

/**
 * "Complete the set" (Item 9).
 *
 * Shown on a product page and in the cart when a published bundle contains
 * what the customer already has and costs less than buying the parts. Renders
 * nothing at all when there is no such bundle — an upsell slot that is always
 * filled is an advert, and this design has none.
 */
export function CompleteTheSet({ productIds, onAdded }: {
  productIds: string[];
  onAdded?: () => void;
}) {
  const nav = useNavigate();
  const { add } = useCart();
  const [offers, setOffers] = useState<BundleOffer[]>([]);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    if (!productIds.length) { setOffers([]); return; }

    let cancelled = false;
    api.completeTheSet(productIds)
      .then((r) => { if (!cancelled) setOffers(r.bundles); })
      // A failed upsell must never disturb the page it sits on.
      .catch(() => { if (!cancelled) setOffers([]); });

    return () => { cancelled = true; };
  }, [productIds.join(",")]);

  if (!offers.length) return null;

  return (
    <section style={{ marginTop: "var(--s-8)" }}>
      <p className="label" style={{ textAlign: "left" }}>COMPLETE THE SET</p>

      {offers.map((o) => (
        <div className="card is-open" key={o.bundle_id} style={{ marginTop: "var(--s-3)" }}>
          {/* The members overlapping, as the shop grid shows a bundle tile. */}
          <div style={{
            display: "flex", gap: "var(--s-2)", justifyContent: "center",
            alignItems: "center", marginBottom: "var(--s-3)",
          }}>
            {o.members.slice(0, 3).map((m) => (
              <ProductImage key={m.product_id} basePath={m.image_path}
                            alt={m.name} tier="thumb" height={48} />
            ))}
          </div>

          <p className="card-title" style={{ textAlign: "center" }}>{o.name}</p>

          {o.adds.length > 0 && (
            <p className="card-sub" style={{ textAlign: "center" }}>
              ADDS {o.adds.join(" · ").toUpperCase()}
            </p>
          )}

          <div style={{ marginTop: "var(--s-3)" }}>
            <div className="row"><span>SEPARATELY</span><b>{money(o.separately_kobo)}</b></div>
            <div className="row"><span>AS A KIT</span><b>{money(o.price_kobo)}</b></div>
            <div className="row is-total"><span>YOU SAVE</span><b>{money(o.saving_kobo)}</b></div>
          </div>

          <div style={{ marginTop: "var(--s-4)" }}>
            <Pill
              disabled={added === o.bundle_id}
              onClick={() => {
                add({
                  kind: "bundle",
                  id: o.bundle_id,
                  name: o.name,
                  price_kobo: o.price_kobo,
                  image_path: o.image_path,
                  available_at_add: o.available,
                });
                setAdded(o.bundle_id);
                onAdded?.();
              }}
            >
              {added === o.bundle_id ? "IN YOUR BASKET" : "ADD THE KIT"}
            </Pill>
            <Pill variant="ghost" onClick={() => nav(`/shop/bundle/${o.bundle_id}`)}>
              SEE WHAT'S IN IT
            </Pill>
          </div>
        </div>
      ))}
    </section>
  );
}
