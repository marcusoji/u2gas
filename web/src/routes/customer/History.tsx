import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Order } from "../../lib/api";
import { BackButton, ErrorState, LoadBar, money } from "../../components/primitives";
import {
  HistoryMonthChip, HistoryReceiptCard, HistoryStatusStrip,
} from "../../components/HistoryReceipt";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Live orders the depot is still working, which the drawing banners (1:2199). */
const LIVE = ["pending", "confirmed", "processing"];

/** The drawing writes the date as `17 MAR` — day first, no leading zero. */
function receiptDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * TRANS HISTORY (1:2107).
 *
 * The artboard is rendered exactly — its HISTORY heading, its month strip, the
 * white panel, the top fade, the watermark and the copyright — and the live
 * receipts are painted over the two card boxes the file reserves, at the file's
 * own coordinates. The drawing's rows carry no `data-node` id, so `FigmaScreen`
 * cannot bind real orders into them; `HistoryReceiptCard` is the row template
 * with the drawing's measurements and type.
 */
export default function History() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>("");

  useEffect(() => {
    api.orders()
      .then((r) => setOrders(r.orders))
      .catch((e: ApiError) => setError(e.message));
  }, []);

  // Only months the person actually has orders in. The drawing's strip is nine
  // fixed sample months; showing twelve tabs when eleven are empty is noise.
  const months = useMemo(() => {
    if (!orders) return [];
    const seen = new Map<string, string>();
    for (const o of orders) {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      seen.set(key, MONTHS[d.getMonth()]);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [orders]);

  const shown = useMemo(() => {
    if (!orders) return [];
    if (!month) return orders;
    return orders.filter((o) => o.created_at.slice(0, 7) === month);
  }, [orders, month]);

  if (error) {
    return <div className="screen"><ErrorState message={error} onRetry={() => location.reload()} /></div>;
  }

  if (!orders) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="PULLING YOUR RECEIPTS" />
      </div>
    );
  }

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:2107" className="is-history">
        <BackButton to="/profile" />

        {/* The drawn strip is nine sample months in a fixed row; the person's
            own months take its place at the same coordinates and chip design. */}
        <div className="history-months">
          {months.map((m) => (
            <HistoryMonthChip
              key={m.value}
              label={m.label}
              active={month === m.value}
              onClick={() => setMonth(month === m.value ? "" : m.value)}
            />
          ))}
        </div>

        <div className="history-rail">
          {shown.length === 0 && (
            <p className="history-empty">NOTHING PRINTED YET</p>
          )}
          {shown.map((o, i) => (
            <Link key={o.order_id} to={`/orders/${o.order_id}`} className="history-col">
              {/* The file draws the strip once, over the first receipt only
                  (1:2199 at x=60). The other columns reserve the same band so
                  the cards keep one baseline. */}
              {i === 0 && LIVE.includes(o.status) && (
                <HistoryStatusStrip>
                  {o.fulfillment_type === "delivery"
                    ? "DELIVERY IN PROGRESS"
                    : "READY AT THE DEPOT"}
                </HistoryStatusStrip>
              )}
              <HistoryReceiptCard
                date={receiptDate(o.created_at)}
                lines={[
                  ...(o.gas_amount_kg > 0
                    ? [{ label: `GAS ${o.gas_amount_kg}KG`, value: money(o.gas_subtotal_kobo) }]
                    : []),
                  ...(o.items_subtotal_kobo > 0
                    ? [{ label: "ACCESSORIES", value: money(o.items_subtotal_kobo) }]
                    : []),
                  {
                    label: o.fulfillment_type === "delivery" ? "DELIVERY" : "PICKUP",
                    value: o.delivery_fee_kobo > 0 ? money(o.delivery_fee_kobo) : money(0),
                  },
                ]}
              />
            </Link>
          ))}
        </div>
      </FigmaRouteFrame>
    </div>
  );
}
