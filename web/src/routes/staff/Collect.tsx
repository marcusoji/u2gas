import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, newIdempotencyKey, type Order } from "../../lib/api";
import { BackButton, money, Pill } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import "../../styles/figma-route.css";

type Method = "cash" | "card_terminal" | "bank_transfer" | "opay";

/**
 * Counter collection/payment flow.
 *
 * The artwork is the exact Figma cashier payment frame and the mutable
 * controls are React-owned transparent overlays, so payment semantics,
 * validation and API behaviour are unchanged.
 *
 * The frame is a *till*: it is drawn for an order that still owes money. An
 * order that has already been paid — which is what the PAID queue is — used to
 * reach this screen and be shown a keypad with nothing to type into it, over a
 * headline that read PAID. The drawing stays (it is the file's own board for
 * this route) but for a paid order the till is inert and the hand-over details
 * are painted where the empty keypad was: who to give it to, what they bought,
 * and the one thing left to do.
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
  const [sheet, setSheet] = useState(false);
  const [done, setDone] = useState<{ change: number | null; number: string; orphaned?: boolean } | null>(null);
  const paymentKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!orderId) return;
    api.order(orderId).then(r => setOrder(r.order)).catch((e: ApiError) => setError(e.message));
  }, [orderId]);

  if (error && !order) {
    return (
      <div className="screen">
        <button className="screen-back" onClick={() => nav("/staff/queue")}>
          BACK TO THE QUEUE
        </button>
        <div className="stamp-wrap"><div className="stamp">{error}</div></div>
      </div>
    );
  }
  if (!order) return <div className="screen"><div style={{ minHeight: 240, display: "grid", placeItems: "center" }}>FETCHING THE ORDER…</div></div>;

  const current = order;
  const paid = current.payment_status === "paid";
  const tenderedKobo = Number(tendered || 0) * 100;
  const changeKobo = tenderedKobo - current.total_kobo;
  const enough = method !== "cash" || tenderedKobo >= current.total_kobo;

  /* --- Already paid: this is a hand-over, not a till. -------------------- */
  const paidInfo = paid ? (
    <div className="collect-handover">
      <p className="label">GIVE TO</p>
      <p className="collect-handover-name">
        {current.profile?.display_name ?? current.guest_name ?? "WALK-IN"}
      </p>
      {(current.guest_phone ?? current.profile?.phone) && (
        <p className="card-sub">
          {current.guest_phone ?? current.profile?.phone}
        </p>
      )}
      <p className="label" style={{ marginTop: "var(--s-4)" }}>WHAT THEY BOUGHT</p>
      {current.gas_amount_kg > 0 && (
        <p className="card-sub">{current.gas_amount_kg}KG OF GAS</p>
      )}
      {(current.items ?? []).map((it, i) => (
        <p className="card-sub" key={i}>{it.product?.name ?? "ITEM"} ×{it.quantity}</p>
      ))}
      <p className="card-sub">PAID {money(current.total_kobo)}</p>
      <p className="label" style={{ marginTop: "var(--s-4)", lineHeight: 2 }}>
        NOTHING IS LEFT TO CHARGE.
      </p>
      <div style={{ marginTop: "var(--s-4)" }}>
        <Pill onClick={() => nav("/staff")}>SCAN THEIR CODE</Pill>
      </div>
    </div>
  ) : null;

  async function takePayment() {
    const fingerprint = [current.order_id, method, tenderedKobo, reference.trim()].join("|");
    const key = paymentKeyRef.current?.fingerprint === fingerprint
      ? paymentKeyRef.current.key
      : newIdempotencyKey();
    paymentKeyRef.current = { fingerprint, key };
    setBusy(true); setError(null);
    try {
      const r = await api.staff.recordPayment({
        order_id: current.order_id,
        method,
        tendered_kobo: method === "cash" ? tenderedKobo : undefined,
        terminal_reference: method === "card_terminal" ? reference || undefined : undefined,
      }, key);
      setDone({ change: r.change_due_kobo, number: r.order_number, orphaned: r.orphaned });
      paymentKeyRef.current = null;
      const fresh = await api.order(current.order_id);
      setOrder(fresh.order);
    } catch (e) { setError((e as ApiError).message); }
    finally { setBusy(false); }
  }

  if (done?.orphaned) {
    return (
      <div className="screen">
        <FigmaRouteFrame node="1:4527" values={{ "1:4530": "COPYRIGHT 2026 U2 OIL AND GAS LTD." }}>
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
    "1:4595": "COPYRIGHT 2026 U2 OIL AND GAS LTD.",
  };
  const led = paid ? "PAID" : tendered ? `${tendered}NGN` : `${(order.total_kobo / 100).toLocaleString("en-NG")}NGN`;
  // The board's LED is captioned `AMOUNT IN KG`, which is a lie once the order
  // is settled — there is no amount left to key. The caption is the file's own
  // text with no data-node id, so it is rebound by value like the LED.
  //
  // The drawn LED sample is `1KG` and the live value is painted by the overlay
  // above it, so the sample has to go: left in place it stayed legible *under*
  // the live figure, and the till read `14,000NGN` over a stray `1KG`. It is
  // bound by value for the same reason as the caption.
  const textReplacements: Record<string, string> = { "1KG": "" };
  if (paid) textReplacements["AMOUNT IN KG"] = "ALREADY PAID";

  function handleArtworkClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    // The hand the file draws beside CONFIRM. Every other screen with a hand
    // opens manual entry from it; at the till there is no code to key, so it
    // opens the finder — the "type it in instead" for an order that was reached
    // by tapping a queue row. It worked on no state of this route before.
    if (target.closest('[data-node="1:4641"]')) { nav("/staff/lookup"); return; }
    // Nothing else on the drawn till applies once the order is paid: it has no
    // amount to key in and no payment to take.
    if (paid) return;
    const el = target.closest(".key") as HTMLElement | null;
    if (!el) return;
    const key = el.textContent?.trim();
    if (key === "PAY" || !key) {
      // PAY opens the confirmation sheet on the same frame (1:4643), matching
      // the second Figma state; the sheet's own Continue to Pay records it.
      if (!busy) setSheet(true);
      return;
    }
    if (key === "0" || /^[1-9]$/.test(key)) {
      setTendered(v => v.length < 8 ? `${v}${key}` : v);
    }
  }

  return (
    <div className="screen">
      <FigmaRouteFrame
        node="1:4592"
        values={values}
        textReplacements={textReplacements}
        onClick={handleArtworkClick}
        className={sheet ? undefined : "is-keypad"}
      >
        {/* Live LED value: the Figma LED geometry remains untouched. */}
        <div className="figma-route-overlay-text" style={{ left: 138, top: 198, width: 164, color: "#ff0303", fontFamily: "jgs5, monospace", fontSize: 38, lineHeight: 1 }}>
          {led}
        </div>

        {/* The Figma keypad has no per-key node ids; delegated interaction keeps its exact geometry. */}
        {sheet && (
          <button className="figma-route-interactive" aria-label="Confirm payment" disabled={!enough || busy} style={{ left: 89, top: 580, width: 173, height: 72 }} onClick={takePayment} />
        )}
        {/* The artboard draws no back control and its topmost element starts at
            y=52, so the button sits in the clear band above the artwork. It is
            the app's own visible BackButton rather than a transparent hotspot:
            a hotspot with nothing drawn under it looks like empty space, and a
            cashier mid-transaction needs to see the way out. */}
        <BackButton to="/staff/queue" />

        {/* Already paid. The frame is a till — it is drawn for an order that
            still owes money — so for a paid order it would show a keypad with
            nothing to type into it. It stays on screen (it is the file's own
            drawing of this route), with the hand-over details painted over the
            empty keypad area and the PAY action made inert. */}
        {paidInfo}

        {/* Payment-method controls are intentionally invisible: the artwork's visual selector stays authoritative.
            They sit over the sheet's drawn PAY CASH / TRANSFER row (1:4643), not over the keypad (1:4601). */}
        {sheet && (
          <div style={{ position: "absolute", left: 145, top: 418, width: 150, height: 30, zIndex: 30, display: "flex" }}>
            <button aria-label="Cash" onClick={() => setMethod("cash")} style={{ flex: 1, opacity: 0, cursor: "pointer" }} />
            <button aria-label="Bank transfer" onClick={() => setMethod("bank_transfer")} style={{ flex: 1, opacity: 0, cursor: "pointer" }} />
          </div>
        )}

        {method === "cash" && !paid && (
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
