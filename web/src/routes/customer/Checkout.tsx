import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, newIdempotencyKey, type Zone } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { toOrderLines, useCart } from "../../lib/cart";
import { useAddFromQuery } from "../../lib/useAddFromQuery";
import { rememberGuestOrder } from "../../lib/guest";
import { AddressPicker, maybeSaveAddress } from "../../components/AddressPicker";
import { money, Sheet } from "../../components/primitives";
import { CheckoutSheet, type Fulfillment, type Method } from "../../components/CheckoutSheet";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * Checkout, as the file draws it three times.
 *
 * 1:1703 shows the sheet over the basket with WALK-IN selected, 1:1827 the same
 * sheet with DELIVERY selected and the address confirmed, and 1:1952 DELIVERY
 * with no address yet — the confirm card is absent and only the two methods
 * that need no card are drawn. Each is a complete screen, so the route picks
 * the frame that already shows the state rather than restyling one panel.
 *
 * The sheet's controls are transparent boxes on the drawn chips and tiles
 * (CheckoutSheet.tsx). The two things the drawing has no place for — the amount
 * and the submit — sit in the empty band below the panel.
 */
export default function Checkout() {
  const nav = useNavigate();
  const { session } = useAuth();
  const { lines, count, subtotalKobo, clear } = useCart();
  const seeding = useAddFromQuery();

  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [method, setMethod] = useState<Method | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState("");
  const [address, setAddress] = useState("");
  const [saveAddr, setSaveAddr] = useState<{ save?: boolean; label?: string }>({});
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [addressOpen, setAddressOpen] = useState(false);

  useEffect(() => {
    if (fulfillment !== "delivery" || zones.length) return;
    let active = true;
    setZoneError(null);
    api.zones()
      .then((r) => { if (active) setZones(r.zones); })
      .catch((e: ApiError) => { if (active) setZoneError(e.message); });
    return () => { active = false; };
  }, [fulfillment, zones.length]);

  // An emptied basket has nothing to check out; the basket is where that is
  // explained, and 1:1624 draws it. A `?add=` seed counts as non-empty while it
  // is still in flight, so a cold `/checkout?add=…` does not bounce first.
  useEffect(() => {
    if (count === 0 && !seeding) nav("/cart", { replace: true });
  }, [count, seeding, nav]);

  const zone = zones.find((z) => z.zone_id === zoneId);
  const feeKobo = fulfillment === "delivery" ? (zone?.fee_kobo ?? 0) : 0;
  const hasAddress = Boolean(address.trim());
  const node = fulfillment === "pickup" ? "1:1703" : hasAddress ? "1:1827" : "1:1952";

  async function pay() {
    if (!method) return;
    if (fulfillment === "delivery" && (!zoneId || !hasAddress || zoneError)) {
      setAddressOpen(true);
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const idempotencyKey = newIdempotencyKey();
      const { order, guest_token } = await api.createCartOrder({
        lines: toOrderLines(lines),
        fulfillment,
        zone_id: fulfillment === "delivery" ? zoneId : undefined,
        address: fulfillment === "delivery" ? address : undefined,
        guest_name: session ? undefined : guestName || undefined,
        guest_phone: session ? undefined : guestPhone || undefined,
      }, idempotencyKey);

      clear();

      // Only once the order is real. Saving first would leave an address
      // behind for an order that failed.
      if (fulfillment === "delivery") {
        await maybeSaveAddress(saveAddr.save, saveAddr.label, address, zoneId);
      }
      if (guest_token) rememberGuestOrder(order.order_id, guest_token);
      const suffix = guest_token ? `?t=${encodeURIComponent(guest_token)}` : "";

      if (method === "depot") { nav(`/orders/${order.order_id}${suffix}`); return; }

      try {
        const init = await api.payInit(order.order_id, guest_token);
        if (init.already_paid) { nav(`/orders/${order.order_id}${suffix}`); return; }
        window.location.href = init.authorization_url;
      } catch {
        // The order is already real and its stock hold is active. Never leave
        // the customer stranded on an emptied cart just because Paystack
        // initialization failed. Send them to the order receipt, where the
        // server-backed PAY NOW action can retry the same payment attempt.
        nav(`/orders/${order.order_id}${suffix ? `${suffix}&payment=retry` : "?payment=retry"}`);
      }
    } catch (e) {
      const err = e as ApiError;
      // Spec 27: name the exact item. The server says which product ran short,
      // so the basket stamps that line rather than failing vaguely — and only
      // the basket can, since the stamp is drawn into 1:1517.
      if (err.code === "INSUFFICIENT_STOCK" && err.detail.product_id) {
        nav(`/cart?short=${encodeURIComponent(String(err.detail.product_id))}`);
        return;
      }
      setError(err);
      setSubmitting(false);
    }
  }

  if (count === 0) return null;

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node={node} className="is-cart is-checkout">
        <button
          type="button"
          className="figma-route-interactive"
          aria-label="Back to basket"
          onClick={() => nav("/cart")}
          style={{ left: 32, top: 80, width: 52, height: 52 }}
        />

        <CheckoutSheet
          node={node}
          fulfillment={fulfillment}
          method={method}
          address={address}
          subtotal={money(subtotalKobo)}
          fee={feeKobo ? money(feeKobo) : null}
          busy={submitting}
          error={error?.message ?? null}
          onFulfillment={(f) => { setFulfillment(f); setMethod(null); }}
          onMethod={setMethod}
          onAddress={() => setAddressOpen(true)}
          onPay={pay}
          onClose={() => nav("/cart")}
        />
      </FigmaRouteFrame>

      {/* Delivery needs an address before the sheet can draw it confirmed, so
          the picker is a real sheet of its own rather than a fake drawn one. */}
      <Sheet open={addressOpen} onClose={() => setAddressOpen(false)} label="Delivery address">
        {zoneError && <p className="label" style={{ color: "#ff0303" }}>{zoneError}</p>}
        <AddressPicker
          line={address}
          zoneId={zoneId}
          zones={zones}
          error={error?.fieldErrors?.address}
          onChange={(next) => {
            setAddress(next.line);
            setZoneId(next.zoneId);
            setSaveAddr({ save: next.save, label: next.label });
          }}
        />
        {!session && (
          <div className="stack is-tight" style={{ marginTop: "var(--s-5)" }}>
            <p className="label">SO WE CAN REACH YOU</p>
            <input className="input" placeholder="YOUR NAME" value={guestName}
                   onChange={(e) => setGuestName(e.target.value)} />
            <input className="input" placeholder="PHONE NUMBER" type="tel" value={guestPhone}
                   onChange={(e) => setGuestPhone(e.target.value)} />
          </div>
        )}
        <button type="button" className="checkout-pay" style={{ marginTop: "var(--s-5)", width: "100%" }}
                onClick={() => setAddressOpen(false)}>
          USE THIS ADDRESS
        </button>
      </Sheet>
    </div>
  );
}
