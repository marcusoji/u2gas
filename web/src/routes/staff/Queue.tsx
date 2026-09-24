import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import {
  Empty, ErrorState, LoadBar, Segmented, money,
} from "../../components/primitives";
import { Ticker } from "../../components/terminal";

type Kind = "paid" | "unpaid";

/**
 * The two pickup queues, as the design's tabs: already paid and waiting for
 * collection, versus waiting to pay at the counter.
 */
export default function Queue() {
  const nav = useNavigate();
  const [kind, setKind] = useState<Kind>("paid");
  const [orders, setOrders] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setOrders(null);
    setError(null);
    try {
      const r = await api.staff.queue(kind);
      if (requestId !== requestRef.current) return;
      setOrders(r.orders);
    } catch (e) {
      if (requestId !== requestRef.current) return;
      setError((e as ApiError).message);
    }
  }, [kind]);

  useEffect(load, [load]);

  // A depot counter is a live surface. Refresh while it's on screen, and stop
  // the moment it isn't — a tab left open overnight should not keep polling.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 20_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="screen">
      <Ticker static>
        {orders ? `${orders.length} ${kind === "paid" ? "WAITING TO COLLECT" : "WAITING TO PAY"}` : "LOADING"}
      </Ticker>

      <div style={{ height: "var(--s-5)" }} />

      <Segmented
        label="Queue"
        value={kind}
        onChange={setKind}
        options={[
          { value: "paid", label: "PAID" },
          { value: "unpaid", label: "AWAITING PAYMENT" },
        ]}
      />

      <div style={{ height: "var(--s-6)" }} />

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && !orders && (
        <div style={{ minHeight: 220, display: "grid", placeItems: "center" }}>
          <LoadBar label="CHECKING THE QUEUE" />
        </div>
      )}

      {orders && orders.length === 0 && (
        <Empty>{kind === "paid" ? "NOBODY TO SERVE" : "NO ONE WAITING TO PAY"}</Empty>
      )}

      <div>
        {orders?.map((o) => (
          <button key={o.order_id} className="card"
                  onClick={() => nav(`/staff/collect/${o.order_id}`)}>
            <div className="card-body">
              <p className="card-title">{o.order_number}</p>
              <p className="card-sub">
                {o.profile?.display_name ?? o.guest_name ?? "WALK-IN"}
                {o.guest_phone ? ` · ${o.guest_phone}` : ""}
              </p>
              <p className="card-sub">
                {o.gas_amount_kg > 0 ? `${o.gas_amount_kg}KG · ` : ""}
                {money(o.total_kobo)}
              </p>
            </div>
            <span className="card-go" aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="spacer" />
    </div>
  );
}
