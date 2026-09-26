import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { api, ApiError, type Order } from "../../lib/api";
import { guestTokenFor, rememberGuestOrder } from "../../lib/guest";
import { ErrorState, LoadBar, Pill, Stamp, money, BackButton } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import {
  HoldCountdown, LedWindow, Receipt, ReceiptSlot, Terminal, Ticker, receiptDate,
} from "../../components/terminal";

/**
 * Order status. One screen covering every state the order can be in, because
 * they are the same receipt with a different stamp on it:
 *
 *   unpaid hold  → countdown ticker, UNPAID stamp
 *   expired      → EXPIRED stamp, order again
 *   paid         → QR, ready for collection or delivery tracking
 *   fulfilled    → collected
 *   cancelled    → cancelled stamp
 *
 * The prototype had none of these apart from the paid receipt.
 */
export default function OrderStatus({ verifying }: { verifying?: boolean }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();

  const orderId = id ?? params.get("order") ?? "";
  const paymentRetry = params.get("payment") === "retry";
  const paymentReference = params.get("reference") ?? params.get("trxref");

  // The token arrives in the link, or from this device if they are coming
  // back to an order they placed earlier.
  const guestToken = params.get("t") ?? guestTokenFor(orderId);
  useEffect(() => {
    if (params.get("t")) rememberGuestOrder(orderId, params.get("t")!);
  }, [orderId, params]);

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refundNote, setRefundNote] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const qrRequested = useRef(false);
  const verifiedPaymentRef = useRef<string | null>(null);

  /**
   * Which of the file's four paid states is on screen. They are the same
   * receipt at four moments, so they are one route that advances rather than
   * four routes: PAYMENT SUCCESSFUL (1:421) as the payment lands, RECEIPT
   * PRINTING (1:669) while the till prints, then the receipt itself in either
   * of the two drawings the file keeps (1:762 / 1:989).
   */
  const [receiptStage, setReceiptStage] = useState<"success" | "printing" | "receipt" | "alt">(
    params.get("receipt") === "printing" ? "printing"
      : params.get("receipt") === "alt" ? "alt"
      : params.get("receipt") === "success" ? "success"
      : params.get("receipt") === "receipt" ? "receipt"
      // Arriving straight from Paystack, the first board the file draws is the
      // success one; a revisit goes straight to the receipt.
      : verifying ? "success" : "receipt");

  const load = useCallback(async () => {
    setError(null);
    try {
      const { order } = await api.order(orderId, guestToken);
      setOrder(order);
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, [orderId, guestToken]);

  // Returning from Paystack. Never trust the redirect saying it worked —
  // verify server-side first. (Spec 12)
  useEffect(() => {
    if (!verifying || !paymentReference) { void load(); return; }
    const verificationKey = `${orderId}:${paymentReference}:${guestToken ?? ""}`;
    if (verifiedPaymentRef.current === verificationKey) return;
    verifiedPaymentRef.current = verificationKey;

    api.payVerify(paymentReference, orderId, guestToken)
      .then(() => load())
      .catch((e: ApiError) => { setError(e.message); void load(); });
  }, [verifying, paymentReference, orderId, guestToken, load]);

  /**
   * The collection code.
   *
   * The plaintext token is returned once, when it is issued, and never stored
   * server-side. So it is cached here per order: a refresh reuses the cached
   * copy rather than minting a new code, which would invalidate the one the
   * customer may already have screenshotted. Only if nothing is cached does
   * it ask for a replacement. (Item 11)
   */
  useEffect(() => {
    if (!order || qrRequested.current) return;
    if (order.payment_status !== "paid") return;
    if (!["confirmed", "processing"].includes(order.status)) return;

    qrRequested.current = true;
    setQrError(null);
    const cacheKey = `u2gas.qr.${order.order_id}`;
    let active = true;

    const render = (token: string) =>
      QRCode.toDataURL(token, {
        margin: 1, width: 320, color: { dark: "#1317D1", light: "#FFFFFF" },
      }).then((data) => {
        if (active) setQrDataUrl(data);
      });

    let cached: string | null = null;
    try { cached = sessionStorage.getItem(cacheKey); } catch { /* private mode */ }

    if (cached) {
      void render(cached).catch((e) => {
        if (active) setQrError((e as Error).message || "COULD NOT RENDER COLLECTION CODE");
      });
      return () => { active = false; };
    }

    // No cached copy. Ask, and force a new code only if the server says one
    // already exists that we cannot display.
    api.issueQr(order.order_id, guestToken)
      .then(async (r) => {
        if (r.token) return r.token;
        const forced = await api.issueQr(order.order_id, guestToken, true);
        return forced.token;
      })
      .then((token) => {
        if (!token || !active) return;
        try { sessionStorage.setItem(cacheKey, token); } catch { /* ignore */ }
        return render(token);
      })
      .catch((e: ApiError) => {
        if (!active) return;
        qrRequested.current = false;
        setQrError(e.message || "COULD NOT ISSUE COLLECTION CODE");
      });

    return () => { active = false; };
  }, [order, guestToken]);

  /**
   * Walk the paid states the way the till does: success, then printing, then
   * the receipt. Only from the success board and only once, so a person who
   * deep-links a receipt state stays there.
   */
  useEffect(() => {
    if (receiptStage !== "success") return;
    const t = window.setTimeout(() => setReceiptStage("printing"), 2200);
    return () => window.clearTimeout(t);
  }, [receiptStage]);

  useEffect(() => {
    if (receiptStage !== "printing") return;
    const t = window.setTimeout(() => setReceiptStage("receipt"), 2600);
    return () => window.clearTimeout(t);
  }, [receiptStage]);

  async function retryQr() {
    if (!order || busy) return;
    setBusy(true);
    setQrError(null);
    qrRequested.current = false;
    try {
      const r = await api.issueQr(order.order_id, guestToken, true);
      if (!r.token) throw new ApiError("QR_FAILED", 502, "COULD NOT ISSUE COLLECTION CODE");
      const data = await QRCode.toDataURL(r.token, {
        margin: 1, width: 320, color: { dark: "#1317D1", light: "#FFFFFF" },
      });
      try { sessionStorage.setItem(`u2gas.qr.${order.order_id}`, r.token); } catch { /* private mode */ }
      setQrDataUrl(data);
      qrRequested.current = true;
    } catch (e) {
      setQrError((e as ApiError).message || "COULD NOT ISSUE COLLECTION CODE");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!order) return;
    setBusy(true);
    try {
      const res = await api.cancelOrder(order.order_id, guestToken);
      try { sessionStorage.removeItem(`u2gas.qr.${order.order_id}`); } catch { /* private mode */ }
      setQrDataUrl(null);
      // Careful wording: the money has not moved yet, and saying otherwise
      // would be a promise we cannot keep until Paystack confirms.
      if (res.refund) {
        setRefundNote("REFUND REQUESTED — WE'LL EMAIL YOU WHEN IT'S SENT");
      }
      await load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !order) {
    return (
      <div className="screen">
        {verifying ? (
          <FigmaRouteFrame
            node="1:502"
            values={{ "1:576": "FAILED" }}
          >
            <button
              className="figma-route-interactive"
              aria-label="Retry payment verification"
              onClick={() => { setError(null); void load(); }}
              style={{ left: 120, top: 600, width: 200, height: 90 }}
            />
            <div className="figma-route-overlay-text" style={{ left: 50, top: 520, width: 340 }}>
              {error}
            </div>
          </FigmaRouteFrame>
        ) : (
          <ErrorState message={error} onRetry={load} />
        )}
      </div>
    );
  }

  if (!order) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label={verifying ? "CONFIRMING YOUR PAYMENT" : "FINDING YOUR ORDER"} />
      </div>
    );
  }

  const expired = order.status === "expired";
  const cancelled = order.status === "cancelled";
  const fulfilled = order.status === "fulfilled";
  const paid = order.payment_status === "paid";
  const holding = !paid && !expired && !cancelled && order.hold_expires_at;

  const lines = [
    ...(order.gas_amount_kg > 0
      ? [{ label: `GAS ${order.gas_amount_kg}KG`, value: money(order.gas_subtotal_kobo) }]
      : []),
    ...(order.items ?? []).map((it) => ({
      label: `${it.product?.name ?? "ITEM"} ×${it.quantity}`,
      value: money(it.unit_price_kobo * it.quantity),
    })),
    ...(order.delivery_fee_kobo > 0
      ? [{ label: "DELIVERY", value: money(order.delivery_fee_kobo) }]
      : []),
  ];

  // The payment/receipt states are dedicated Figma artboards. Keep the real
  // order API, QR issuance and payment state machine above, but let the
  // generated Figma artwork own the visual layer instead of rebuilding it
  // with the legacy terminal/receipt primitives.
  if (paid && !expired && !cancelled && !fulfilled) {
    // The receipt artboard has two fixed sample rows with no data-node ids.
    // Keep its geometry untouched, but replace those samples with the actual
    // paid order contents. Repeated sample strings are supported as ordered
    // replacements by FigmaScreen.
    const receiptLines: Array<{ label: string; value: string }> = [];
    if (order.gas_amount_kg > 0) {
      receiptLines.push({
        label: `GAS ${order.gas_amount_kg}KG`,
        value: money(order.gas_subtotal_kobo),
      });
    }
    for (const item of order.items ?? []) {
      receiptLines.push({
        label: `${item.product?.name ?? "ITEM"} ×${item.quantity}`,
        value: money(item.unit_price_kobo * item.quantity),
      });
    }
    if (order.delivery_fee_kobo > 0) {
      receiptLines.push({ label: "DELIVERY", value: money(order.delivery_fee_kobo) });
    }
    if (!receiptLines.length) {
      receiptLines.push({ label: "ORDER", value: money(order.total_kobo) });
    }
    if (receiptLines.length > 2) {
      const extra = receiptLines.slice(1).reduce((sum, line) => sum + Number(line.value.replace(/[^0-9]/g, "")), 0);
      receiptLines.splice(1, receiptLines.length - 1, {
        label: `+${receiptLines.length - 1} MORE ITEMS`,
        value: `₦${extra.toLocaleString("en-NG")}`,
      });
    }
    while (receiptLines.length < 2) receiptLines.push({ label: "—", value: "₦0" });

    const textReplacements: Record<string, string | string[]> = {
      "6-pack Energizer<br>ignition batteries": receiptLines.map((line) => line.label),
      "₦1,400": receiptLines.map((line) => line.value),
    };
    const amount = money(order.total_kobo);

    if (receiptStage === "success") {
      return (
        <div className="screen">
          <FigmaRouteFrame node="1:421" values={{ "1:421f": order.gas_amount_kg > 0 ? `${order.gas_amount_kg}KG` : amount }}>
            <BackButton to="/history" />
          </FigmaRouteFrame>
        </div>
      );
    }

    if (receiptStage === "printing") {
      return (
        <div className="screen">
          <FigmaRouteFrame node="1:669" values={{ "1:713": amount }}>
            <BackButton to="/history" />
          </FigmaRouteFrame>
        </div>
      );
    }

    // RECEIPT DISPLAY (1:762) and RECEIPT DISPLAY ALT (1:989) are the same
    // receipt drawn twice. The file keeps both, so the display offers both
    // rather than dropping one.
    const alt = receiptStage === "alt";
    const node = alt ? "1:989" : "1:762";
    const displayValues: Record<string, string> = alt
      ? { "1:1000": "TOTAL PAID", "1:1033": amount, "1:1096": receiptDate(order.created_at) }
      : { "1:773": "TOTAL PAID", "1:806": amount, "1:866": receiptDate(order.created_at) };
    return (
      <div className="screen">
        <FigmaRouteFrame node={node} values={displayValues} textReplacements={textReplacements}>
          <BackButton to="/history" />
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="Collection code"
              className="figma-route-qr"
              style={{ left: 70.5, top: 200.71, width: 100, height: 100 }}
            />
          )}
          <button
            className="figma-route-interactive"
            aria-label="Keep receipt"
            onClick={() => nav("/home")}
            style={{ left: 168, top: 705, width: 103, height: 60 }}
          />
          <button
            className="figma-route-interactive"
            aria-label={alt ? "Standard receipt" : "Alternate receipt display"}
            onClick={() => setReceiptStage(alt ? "receipt" : "alt")}
            style={{ left: 150, top: 645, width: 140, height: 34 }}
          />
        </FigmaRouteFrame>
      </div>
    );
  }

  return (
    <div className="screen">
      <BackButton to="/history" />

      {holding ? (
        <HoldCountdown expiresAt={order.hold_expires_at!} onExpire={load} />
      ) : (
        <Ticker static={expired || cancelled}>
          {expired ? `HOLD EXPIRED — ${order.gas_amount_kg}KG RETURNED TO STOCK`
           : cancelled ? "ORDER CANCELLED"
           : fulfilled ? "COLLECTED — THANK YOU"
           : order.fulfillment_type === "delivery"
             ? deliveryTicker(order)
             : "READY AT THE DEPOT"}
        </Ticker>
      )}

      <div style={{ height: "var(--s-4)" }} />

      <Terminal>
        <LedWindow
          small
          value={
            expired ? "EXPIRED"
            : cancelled ? "CANCELLED"
            : fulfilled ? "COLLECTED"
            : paid ? "SUCCESS"
            : "UNPAID"
          }
        />
        <ReceiptSlot />
      </Terminal>

      <Receipt
        date={receiptDate(order.created_at)}
        lines={lines}
        total={order.total_kobo}
        voided={expired || cancelled}
      >
        {qrDataUrl && !expired && !cancelled && !fulfilled && (
          <div className="center" style={{ marginTop: "var(--s-4)" }}>
            <img src={qrDataUrl} alt="Collection code" width={150} height={150} />
          </div>
        )}

        {(expired || cancelled) && (
          <div className="stamp-wrap" style={{ marginTop: "var(--s-4)" }}>
            <Stamp loud>{expired ? "EXPIRED" : "CANCELLED"}</Stamp>
          </div>
        )}

        {holding && (
          <div className="stamp-wrap" style={{ marginTop: "var(--s-4)" }}>
            <Stamp>UNPAID — HOLD</Stamp>
          </div>
        )}
      </Receipt>

      {order.fulfillment_type === "delivery" && order.delivery && (
        <DeliveryCard delivery={order.delivery} />
      )}

      <div style={{ height: "var(--s-5)" }} />

      {holding && (
        <>
          <p className="label">SHOW THIS AT THE DEPOT, OR PAY NOW</p>
          <div style={{ marginTop: "var(--s-4)" }}>
            <Pill
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const init = await api.payInit(order.order_id, guestToken);
                  if (init.already_paid) { await load(); return; }
                  window.location.href = init.authorization_url;
                } catch (e) {
                  setError((e as ApiError).message);
                } finally { setBusy(false); }
              }}
            >
              PAY NOW
            </Pill>
            <Pill variant="ghost" onClick={cancel} disabled={busy}>CANCEL ORDER</Pill>
          </div>
        </>
      )}

      {qrError && paid && !expired && !cancelled && !fulfilled && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp>{qrError}</Stamp>
          <Pill variant="ghost" onClick={retryQr} disabled={busy}>RETRY COLLECTION CODE</Pill>
        </div>
      )}

      {paid && !fulfilled && (
        <p className="label">
          {order.fulfillment_type === "pickup"
            ? "SHOW THIS CODE AT THE COUNTER"
            : "SHOW THIS CODE TO YOUR DRIVER"}
        </p>
      )}

      {(expired || cancelled) && (
        <Pill onClick={() => nav("/home")}>ORDER AGAIN</Pill>
      )}

      {refundNote && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp tone="ok">{refundNote}</Stamp>
        </div>
      )}

      {paymentRetry && !paid && !expired && !cancelled && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp>PAYMENT DID NOT START — RETRY BELOW</Stamp>
        </div>
      )}

      {error && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp>{error}</Stamp>
        </div>
      )}

      <div className="spacer" />
    </div>
  );
}

/**
 * The delivery card. Status strip, driver, address, ETA — and a call button
 * only while the drop is live.
 *
 * No live map in v1: there is no GPS feed, and a map showing a static pin
 * dressed up as tracking would be a lie. The address and status are true.
 */
function DeliveryCard({ delivery }: { delivery: NonNullable<Order["delivery"]> }) {
  const STRIP: Record<string, string> = {
    assigned: "ASSIGNED", en_route: "EN ROUTE", delivered: "DELIVERED",
    failed: "COULDN'T DELIVER", rescheduled: "TRYING AGAIN", returned: "RETURNED",
  };

  const live = delivery.status === "assigned" || delivery.status === "en_route";
  const bad = ["failed", "returned"].includes(delivery.status);

  return (
    <div style={{ marginTop: "var(--s-5)" }}>
      <div style={{
        background: bad ? "var(--danger)" : "var(--blue)",
        color: "var(--white)", textAlign: "center",
        padding: "var(--s-2)", fontSize: "var(--t-caption)",
        letterSpacing: ".1em", borderRadius: "4px 4px 0 0",
      }}>
        {STRIP[delivery.status] ?? delivery.status.toUpperCase()}
        {delivery.eta_minutes !== null && delivery.eta_minutes !== undefined
          ? ` — ABOUT ${delivery.eta_minutes} MIN`
          : ""}
      </div>

      <div className="card" style={{
        borderRadius: "0 0 var(--r-card) var(--r-card)",
        borderTop: "none", flexDirection: "column", alignItems: "stretch",
      }}>
        <div className="card-body">
          <p className="card-title">
            {(delivery.driver?.profile?.display_name ?? "WAITING FOR A DRIVER").toUpperCase()}
          </p>
          <p className="card-sub">{delivery.delivery_address}</p>
          {delivery.zone?.name && (
            <p className="card-sub">{delivery.zone.name.toUpperCase()}</p>
          )}
          {delivery.failure_reason && (
            <div style={{ marginTop: "var(--s-2)" }}>
              <Stamp>{delivery.failure_reason.toUpperCase()}</Stamp>
            </div>
          )}
        </div>

        {live && delivery.driver?.phone && (
          <a
            href={`tel:${delivery.driver.phone}`}
            className="pill is-ghost"
            style={{
              textDecoration: "none", display: "grid", placeItems: "center",
              marginTop: "var(--s-3)",
            }}
          >
            CALL YOUR DRIVER
          </a>
        )}
      </div>
    </div>
  );
}

function deliveryTicker(order: Order): string {
  const d = order.delivery;
  if (!d) return "WAITING FOR A DRIVER";

  switch (d.status) {
    case "assigned":    return `${driverName(d)} IS PICKING IT UP`;
    case "en_route":
      return d.eta_minutes
        ? `${driverName(d)} IS ON THE WAY — ABOUT ${d.eta_minutes} MIN`
        : `${driverName(d)} IS ON THE WAY`;
    case "delivered":   return "DELIVERED — THANK YOU";
    case "failed":      return d.failure_reason?.toUpperCase() ?? "DELIVERY FAILED";
    case "rescheduled": return "WE'LL TRY AGAIN";
    case "returned":    return "RETURNED TO THE DEPOT";
    default:            return "WAITING FOR A DRIVER";
  }
}

function driverName(d: NonNullable<Order["delivery"]>): string {
  return (d.driver?.profile?.display_name ?? "YOUR DRIVER").toUpperCase();
}
