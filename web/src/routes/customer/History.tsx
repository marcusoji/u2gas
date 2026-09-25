import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Order } from "../../lib/api";
import {
  BackButton, Empty, ErrorState, LoadBar, PageShell, Pill, Stamp, Tabs, money,
} from "../../components/primitives";
import { Receipt, receiptDate } from "../../components/terminal";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export default function History() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>("");

  useEffect(() => {
    api.orders()
      .then((r) => setOrders(r.orders))
      .catch((e: ApiError) => setError(e.message));
  }, []);

  // Only months the person actually has orders in. Showing twelve tabs when
  // eleven are empty is noise.
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
    return <PageShell><ErrorState message={error} /></PageShell>;
  }

  return (
    <PageShell>
      <BackButton to="/profile" />
      <h1 className="screen-title">HISTORY</h1>
      <div style={{ height: "var(--s-4)" }} />

      {months.length > 1 && (
        <Tabs
          label="Month"
          value={month}
          onChange={setMonth}
          options={[{ value: "", label: "ALL" }, ...months]}
        />
      )}

      <div style={{ height: "var(--s-6)" }} />

      {!orders && (
        <div style={{ minHeight: 240, display: "grid", placeItems: "center" }}>
          <LoadBar label="PULLING YOUR RECEIPTS" />
        </div>
      )}

      {orders && shown.length === 0 && (
        <Empty action={<Link to="/home" className="pill" style={{
          textDecoration: "none", display: "grid", placeItems: "center",
        }}>ORDER SOME GAS</Link>}>
          NOTHING PRINTED YET
        </Empty>
      )}

      <div className="stack">
        {shown.map((o) => (
          <Link key={o.order_id} to={`/orders/${o.order_id}`}
                style={{ textDecoration: "none" }}>
            {/* Live orders get the status strip from the design; finished ones
                are just the receipt. */}
            {["pending", "confirmed", "processing"].includes(o.status) && (
              <div style={{
                background: "var(--blue)", color: "var(--white)",
                textAlign: "center", padding: "var(--s-2)",
                fontSize: "var(--t-caption)", letterSpacing: ".1em",
                borderRadius: "4px 4px 0 0", margin: "0 var(--s-6)",
              }}>
                {o.fulfillment_type === "delivery" ? "DELIVERY IN PROGRESS" : "READY AT THE DEPOT"}
              </div>
            )}

            <Receipt
              date={receiptDate(o.created_at)}
              voided={["expired", "cancelled"].includes(o.status)}
              lines={[
                ...(o.gas_amount_kg > 0
                  ? [{ label: `GAS ${o.gas_amount_kg}KG`, value: money(o.gas_subtotal_kobo) }]
                  : []),
                ...(o.items_subtotal_kobo > 0
                  ? [{ label: "ACCESSORIES", value: money(o.items_subtotal_kobo) }]
                  : []),
                { label: o.fulfillment_type === "delivery" ? "DELIVERY" : "PICKUP",
                  value: o.delivery_fee_kobo > 0 ? money(o.delivery_fee_kobo) : "—" },
              ]}
              total={o.total_kobo}
            >
              {["expired", "cancelled"].includes(o.status) && (
                <div className="stamp-wrap" style={{ marginTop: "var(--s-3)" }}>
                  <Stamp>{o.status.toUpperCase()}</Stamp>
                </div>
              )}
              {o.payment_status === "pending" && o.status !== "expired" && (
                <div className="stamp-wrap" style={{ marginTop: "var(--s-3)" }}>
                  <Stamp>UNPAID</Stamp>
                </div>
              )}
            </Receipt>
          </Link>
        ))}
      </div>

      <div className="spacer" />
      <Link to="/profile" style={{
        display: "block", textAlign: "center", color: "var(--blue-faint)",
        textDecoration: "none", padding: "var(--s-6) 0",
      }}>
        BACK TO YOUR PROFILE
      </Link>
    </PageShell>
  );
}
