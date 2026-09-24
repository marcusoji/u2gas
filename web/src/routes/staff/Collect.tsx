import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, newIdempotencyKey, type Order } from "../../lib/api";
import { money } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import "../../styles/figma-route.css";

type Method = "cash" | "card_terminal" | "bank_transfer" | "opay";

/**
 * Counter collection/payment flow.
 *
 * The artwork is now the exact Figma cashier payment frame. All mutable
 * controls remain React-owned transparent overlays so payment semantics,
 * validation and API behaviour are unchanged.
 */
export default function Collect() {
  const { orderId } = useParams();
  const nav = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>("cash");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ change: number | null; number: string; orphaned?: boolean } | null>(null);
  const paymentKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!orderId) return;
    api.order(orderId).then(r => setOrder(r.order)).catch((e: ApiError) => setError(e.message));
  }, [orderId]);

  if (error && !order) return <div className="screen"><div className="stamp-wrap"><div className="stamp">{error}</div></div></div>;
  if (!order) return <div className="screen"><div style={{ minHeight: 240, display: "grid", placeItems: "center" }}>FETCHING THE ORDER…</div></div>;

  const paid = order.payment_status === "paid";
  const tenderedKobo = Number(tendered || 0) * 100;
  const changeKobo = tenderedKobo - order.total_kobo;
  const enough = method !== "cash" || tenderedKobo >= order.total_kobo;

  async function takePayment() {
    const fingerprint = [order.order_id, method, tenderedKobo, reference.trim()].join("|");
    const key = paymentKeyRef.current?.fingerprint === fingerprint
      ? paymentKeyRef.current.key
      : newIdempotencyKey();
    paymentKeyRef.current = { fingerprint, key };
    setBusy(true); setError(null);
    try {
      const r = await api.staff.recordPayment({
        order_id: order.order_id,
        method,
        tendered_kobo: method === "cash" ? tenderedKobo : undefined,
        terminal_reference: method === "card_terminal" ? reference || undefined : undefined,
      }, key);
      setDone({ change: r.change_due_kobo, number: r.order_number, orphaned: r.orphaned });
      paymentKeyRef.current = null;
      const fresh = await api.order(order.order_id);
      setOrder(fresh.order);
    } catch (e) { setError((e as ApiError).message); }
    finally { setBusy(false); }
  }

  if (done?.orphaned) {
    return (
      <div className="screen">
        <FigmaRouteFrame node="1:4527" values={{ "1:4530": "C0PYRIGHT 2026 U2 OIL AND GAS LTD." }}>
          <div className="figma-route-overlay-text" style={{ left: 55, top: 700, width: 330, fontSize: 22 }}>HOLD EXPIRED — {done.number}</div>
          <button className="figma-route-interactive" aria-label="Start a new order" style={{ left: 90, top: 580, width: 262, height: 72 }} onClick={() => nav("/staff/walk-in")} />
          <button className="figma-route-interactive" aria-label="Back to queue" style={{ left: 90, top: 670, width: 262, height: 72 }} onClick={() => nav("/staff/queue")} />
        </FigmaRouteFrame>
      </div>
    );
  }

  if (done) {
    return (
      <div className="screen">
        <FigmaRouteFrame node="1:4527">
          <div className="figma-route-overlay-text" style={{ left: 55, top: 700, width: 330, fontSize: 22 }}>
            {done.change && done.change > 0 ? `GIVE ${money(done.change)} BACK` : "EXACT — NO CHANGE"}
          </div>
          <button className="figma-route-interactive" aria-label="Scan to hand over" style={{ left: 89, top: 580, width: 173, height: 72 }} onClick={() => nav("/staff")} />
          <button className="figma-route-interactive" aria-label="Back to queue" style={{ left: 89, top: 670, width: 173, height: 72 }} onClick={() => nav("/staff/queue")} />
        </FigmaRouteFrame>
      </div>
    );
  }

  const values = {
    "1:4595": "C0PYRIGHT 2026 U2 OIL AND GAS LTD.",
  };

  function handleArtworkClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest(".key") as HTMLElement | null;
    if (!el) return;
    const key = el.textContent?.trim();
    if (!key) return;
    if (key === "PAY") {
      if (enough && !busy) void takePayment();
      return;
    }
    if (key === "0" || /^[1-9]$/.test(key)) {
      setTendered(v => v.length < 8 ? `${v}${key}` : v);
    }
  }

  return (
    <div className="screen">
      <FigmaRouteFrame node="1:4592" values={values} onClick={handleArtworkClick}>
        {/* Live LED value: the Figma LED geometry remains untouched. */}
        <div className="figma-route-overlay-text" style={{ left: 138, top: 198, width: 164, color: "#ff0303", fontFamily: "jgs5, monospace", fontSize: 38, lineHeight: 1 }}>
          {paid ? "PAID" : tendered ? `${tendered}NGN` : `${(order.total_kobo / 100).toLocaleString("en-NG")}NGN`}
        </div>

        {/* The Figma keypad has no per-key node ids; delegated interaction keeps its exact geometry. */}
        <button className="figma-route-interactive" aria-label="Confirm payment" disabled={!enough || busy} style={{ left: 89, top: 580, width: 173, height: 72 }} onClick={takePayment} />
        <button className="figma-route-interactive" aria-label="Back" style={{ left: 25, top: 760, width: 100, height: 60 }} onClick={() => nav(-1)} />

        {/* Payment-method controls are intentionally invisible: the artwork's visual selector stays authoritative. */}
        <div style={{ position: "absolute", left: 110, top: 420, width: 220, height: 150, zIndex: 30 }}>
          <button aria-label="Cash" onClick={() => setMethod("cash")} style={{ position: "absolute", left: 0, top: 0, width: 105, height: 70, opacity: 0, cursor: "pointer" }} />
          <button aria-label="Bank transfer" onClick={() => setMethod("bank_transfer")} style={{ position: "absolute", left: 105, top: 0, width: 115, height: 70, opacity: 0, cursor: "pointer" }} />
          <button aria-label="POS" onClick={() => setMethod("card_terminal")} style={{ position: "absolute", left: 0, top: 70, width: 105, height: 70, opacity: 0, cursor: "pointer" }} />
          <button aria-label="OPAY" onClick={() => setMethod("opay")} style={{ position: "absolute", left: 105, top: 70, width: 115, height: 70, opacity: 0, cursor: "pointer" }} />
        </div>

        {method === "cash" && (
          <div className="figma-route-overlay-text" style={{ left: 80, top: 910, width: 280, fontSize: 20 }}>
            TENDERED ₦{Number(tendered || 0).toLocaleString("en-NG")} · CHANGE {changeKobo >= 0 ? money(changeKobo) : "SHORT"}
          </div>
        )}
        {method === "card_terminal" && (
          <input className="figma-route-input" aria-label="Terminal reference" placeholder="TERMINAL REFERENCE" value={reference} onChange={e => setReference(e.target.value)} style={{ left: 75, top: 850, width: 290, height: 52, fontSize: 18 }} />
        )}
        {error && <div className="figma-route-overlay-text" role="alert" style={{ left: 50, top: 1040, width: 340, fontSize: 20 }}>{error}</div>}
        <div className="figma-route-overlay-text" style={{ left: 55, top: 1100, width: 330, fontSize: 17 }}>
          {busy ? "RECORDING PAYMENT…" : paid ? "PAID — READY TO HAND OVER" : `${money(order.total_kobo)} DUE · ${method.toUpperCase()}`}
        </div>
      </FigmaRouteFrame>
    </div>
  );
}
