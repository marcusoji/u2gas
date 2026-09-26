import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCart } from "../../lib/cart";
import { useAddFromQuery } from "../../lib/useAddFromQuery";
import { BasketLine } from "../../components/BasketLine";
import { money } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * The basket, as 1:1517 CART - ITEM UNAVAILABLE and 1:1624 CART - EMPTY draw it.
 *
 * Both artboards are the whole screen — the basket, the `SHOP OTHER
 * ACCESSORIES` strip, the Checkout button, the watermark and the copyright — so
 * the route renders the drawing and adds only what it has no node for: the back
 * arrow, the Checkout button, and the live basket rows.
 *
 * The rows are the one place the drawing cannot carry the data. The artboard
 * paints its basket as a single 356x516 illustration of three dashed cards, so
 * there is no text leaf to bind; `BasketLine` is the row template built from
 * the drawn measurements and the live lines are painted over the card boxes the
 * file reserves (see BasketLine.tsx). 1:1589's `ITEM UNAVAILABLE` stamp is a
 * state, not copy, so it stays hidden until the server actually refuses a line.
 *
 * Checkout itself is `/checkout`, which renders 1:1703 / 1:1827 / 1:1952 — the
 * frames that draw the sheet over this basket.
 */
export default function Cart() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { lines, count, subtotalKobo, setQuantity, remove } = useCart();
  useAddFromQuery();

  /** Which line the server refused, so the basket can stamp exactly that one.
   *  Checkout hands it back as `?short=<id>` rather than the basket guessing. */
  const [shortId, setShortId] = useState<string | null>(null);
  useEffect(() => {
    const id = params.get("short");
    if (!id) return;
    setShortId(id);
    const next = new URLSearchParams(params);
    next.delete("short");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const backToShop = () => nav("/shop");

  if (count === 0) {
    return (
      <div className="screen figma-route-scroll">
        <FigmaRouteFrame node="1:1624" className="is-cart">
          {/* The artboard draws its own back arrow at (12,28) and (8,30);
              this hotspot sits over it. */}
          <button
            type="button"
            className="figma-route-interactive"
            aria-label="Back to shop"
            onClick={backToShop}
            style={{ left: 8, top: 15, width: 70, height: 90 }}
          />
        </FigmaRouteFrame>
      </div>
    );
  }

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:1517" className={`is-cart${shortId ? " is-short" : ""}`}>
        <button
          type="button"
          className="figma-route-interactive"
          aria-label="Back to shop"
          onClick={backToShop}
          style={{ left: 32, top: 80, width: 52, height: 52 }}
        />

        <button
          type="button"
          className="figma-route-interactive"
          aria-label="Checkout"
          onClick={() => nav("/checkout")}
          style={{ left: 118, top: 774, width: 200, height: 90 }}
        />

        {/* The drawing reserves three card boxes but paints no live text in
            them; the real lines are the template rows at the same coordinates.
            The spare boxes keep their drawn artwork underneath. */}
        <div className="basket-lines">
          {lines.slice(0, 3).map((l) => (
            <BasketLine
              key={l.id}
              line={l}
              onAdd={() => setQuantity(l.id, l.quantity + 1)}
              onRemove={() => (l.quantity > 1 ? setQuantity(l.id, l.quantity - 1) : remove(l.id))}
            />
          ))}
        </div>

        {/* The drawing has no slot for the running total, so it sits in the
            band the file leaves empty between the basket and the strip. */}
        <div className="cart-total">
          <span>{count} {count === 1 ? "ITEM" : "ITEMS"}</span>
          <b>{money(subtotalKobo)}</b>
        </div>

        {shortId && (
          <div className="cart-short">
            <span>THAT ITEM RAN SHORT</span>
            <button type="button" onClick={() => { remove(shortId); setShortId(null); }}>
              REMOVE IT
            </button>
          </div>
        )}
      </FigmaRouteFrame>
    </div>
  );
}
