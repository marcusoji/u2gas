import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, newIdempotencyKey, type Zone } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { toOrderLines, useCart } from "../../lib/cart";
import { rememberGuestOrder } from "../../lib/guest";
import { AddressPicker, maybeSaveAddress } from "../../components/AddressPicker";
import {
  Chip, Input, Pill, ProductImage, Segmented, Sheet, Stamp, money,
  BackButton,
} from "../../components/primitives";
import { BasketItem, WireBasket } from "../../components/illustrated";
import { CompleteTheSet } from "../../components/CompleteTheSet";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

type Fulfillment = "pickup" | "delivery";
type Method = "bank_transfer" | "opay" | "card" | "depot";

export default function Cart() {
  const nav = useNavigate();
  const { session } = useAuth();
  const { lines, count, subtotalKobo, setQuantity, remove, clear } = useCart();

  const [sheetOpen, setSheetOpen] = useState(false);
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

  /** Which line the server refused, so the basket can stamp exactly that one. */
  const [shortId, setShortId] = useState<string | null>(null);

  useEffect(() => {
    if (fulfillment !== "delivery" || zones.length) return;
    let active = true;
    setZoneError(null);
    api.zones()
      .then((r) => { if (active) setZones(r.zones); })
      .catch((e: ApiError) => { if (active) setZoneError(e.message); });
    return () => { active = false; };
  }, [fulfillment, zones.length]);

  const zone = zones.find((z) => z.zone_id === zoneId);
  const feeKobo = fulfillment === "delivery" ? (zone?.fee_kobo ?? 0) : 0;

  async function checkout() {
    if (!method) return;
    if (fulfillment === "delivery" && (!zoneId || !address.trim() || zoneError)) {
      setError(new ApiError("VALIDATION", 400, "SELECT A VALID DELIVERY ZONE AND ADDRESS FIRST"));
      return;
    }
    setSubmitting(true);
    setError(null);
    setShortId(null);

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
      } catch (e) {
        // The order is already real and its stock hold is active. Never leave
        // the customer stranded on an emptied cart just because Paystack
        // initialization failed. Send them to the order receipt, where the
        // server-backed PAY NOW action can retry the same payment attempt.
        nav(`/orders/${order.order_id}${suffix ? `${suffix}&payment=retry` : "?payment=retry"}`);
        return;
      }

    } catch (e) {
      const err = e as ApiError;
      setError(err);
      setSubmitting(false);

      // Spec 27: name the exact item. The server tells us which product ran
      // short, so the basket stamps that item rather than failing vaguely.
      if (err.code === "INSUFFICIENT_STOCK" && err.detail.product_id) {
        setShortId(String(err.detail.product_id));
        setSheetOpen(false);
      }
    }
  }

  if (count === 0) {
    return (
      <div className="screen">
        <FigmaRouteFrame node="1:1624">
          <button
            className="figma-route-interactive"
            aria-label="Back to shop"
            onClick={() => nav("/shop")}
            style={{ left: 20, top: 20, width: 52, height: 52 }}
          />
        </FigmaRouteFrame>
      </div>
    );
  }

  return (
    <div className="screen">
      <button
        className="card-go"
        style={{ width: 28, height: 28, background: "var(--field)", border: "none" }}
        aria-label="Close"
        onClick={() => nav("/shop")}
      >
        ×
      </button>

      <WireBasket empty={count === 0 ? <Stamp>GO FOR A LIL MORE SHOPPING</Stamp> : undefined}>
        {lines.map((l) => (
          <BasketItem
            key={l.id}
            onAdd={() => setQuantity(l.id, l.quantity + 1)}
            onRemove={() => setQuantity(l.id, l.quantity - 1)}
          >
            <ProductImage basePath={l.image_path} alt={l.name} tier="thumb" height={54} />
            {l.quantity > 1 && (
              <span className="card-sub" style={{ textAlign: "center" }}>×{l.quantity}</span>
            )}
            {shortId === l.id && (
              <span style={{ position: "absolute", bottom: -18, left: "50%",
                             transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
                <Stamp>ITEM UNAVAILABLE</Stamp>
              </span>
            )}
          </BasketItem>
        ))}
      </WireBasket>

      {error && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp>{error.message}</Stamp>
        </div>
      )}

      {count > 0 && (
        <div style={{ marginTop: "var(--s-5)" }}>
          <div className="row is-total">
            <span>{count} {count === 1 ? "ITEM" : "ITEMS"}</span>
            <b>{money(subtotalKobo)}</b>
          </div>
        </div>
      )}

      {count > 0 && (
        <CompleteTheSet
          productIds={lines.filter((l) => l.kind === "product").map((l) => l.id)}
        />
      )}

      <div className="spacer" />

      <Pill onClick={() => { setError(null); setSheetOpen(true); }} disabled={count === 0}>
        Checkout
      </Pill>

      {shortId && (
        <Pill variant="ghost" style={{ marginTop: "var(--s-2)" }}
              onClick={() => { remove(shortId); setShortId(null); setError(null); }}>
          REMOVE THAT ITEM
        </Pill>
      )}

      {/* --- Checkout sheet ------------------------------------------------ */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} label="Checkout">
        <Segmented
          label="How you want it"
          value={fulfillment}
          onChange={(v) => { setFulfillment(v); setMethod(null); }}
          options={[
            { value: "pickup", label: "WALK-IN" },
            { value: "delivery", label: "DELIVERY" },
          ]}
        />

        {fulfillment === "delivery" && zoneError && (
          <div className="stamp-wrap" style={{ marginTop: "var(--s-4)" }}>
            <Stamp>{zoneError}</Stamp>
          </div>
        )}

        {fulfillment === "delivery" && (
          <div style={{ marginTop: "var(--s-5)" }}>
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
          </div>
        )}

        {!session && (
          <div className="stack is-tight" style={{ marginTop: "var(--s-5)" }}>
            <p className="label">SO WE CAN REACH YOU</p>
            <Input placeholder="YOUR NAME" value={guestName}
                   onChange={(e) => setGuestName(e.target.value)} />
            <Input placeholder="PHONE NUMBER" type="tel" value={guestPhone}
                   onChange={(e) => setGuestPhone(e.target.value)} />
          </div>
        )}

        <div style={{ margin: "var(--s-6) 0 var(--s-4)" }}>
          <div className="row"><span>ITEMS</span><b>{money(subtotalKobo)}</b></div>
          {fulfillment === "delivery" && (
            <div className="row"><span>DELIVERY</span><b>{money(feeKobo)}</b></div>
          )}
          <div className="row is-total">
            <span>TOTAL</span><b>{money(subtotalKobo + feeKobo)}</b>
          </div>
        </div>

        <p className="label">PAYMENT OPTIONS</p>
        <div className="chips" style={{ margin: "var(--s-4) 0" }}>
          <Chip pressed={method === "bank_transfer"} onClick={() => setMethod("bank_transfer")}>
            BANK<br />TRANS
          </Chip>
          <Chip pressed={method === "opay"} onClick={() => setMethod("opay")}>OPAY</Chip>
          {fulfillment === "delivery" && (
            <Chip pressed={method === "card"} onClick={() => setMethod("card")}>CARD</Chip>
          )}
        </div>

        {fulfillment === "pickup" && (
          <>
            <p className="label" style={{ margin: "var(--s-3) 0" }}>OR</p>
            <div className="chips">
              <Chip pressed={method === "depot"} onClick={() => setMethod("depot")}>
                PAY IN THE DEPOT
              </Chip>
            </div>
          </>
        )}

        {error && (
          <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
            <Stamp>{error.message}</Stamp>
          </div>
        )}

        <div style={{ marginTop: "var(--s-6)" }}>
          <Pill onClick={checkout} disabled={!method || submitting}>
            {submitting ? "HOLD ON" : method === "depot" ? "RESERVE MY ORDER" : "Continue to Pay"}
          </Pill>
        </div>
      </Sheet>
    </div>
  );
}
