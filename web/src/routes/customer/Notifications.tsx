import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type NotificationRow } from "../../lib/api";
import { Empty, ErrorState, LoadBar, Tabs } from "../../components/primitives";

type Filter = "all" | "orders" | "delivery" | "stock";

const GROUPS: Record<Filter, string[]> = {
  all: [],
  orders: ["order.confirmed", "order.expired", "payment.confirmed"],
  delivery: ["delivery.assigned", "delivery.en_route", "delivery.delivered"],
  stock: ["stock.addition", "stock.low"],
};

export default function Notifications() {
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    api.notifications()
      .then((r) => {
        setItems(r.notifications);
        // Marking read is deliberately fire-and-forget. A failure here should
        // never block the person from reading what they came for.
        void api.markRead().catch(() => {});
      })
      .catch((e: ApiError) => setError(e.message));
  }, []);

  const shown = items?.filter(
    (n) => filter === "all" || GROUPS[filter].includes(String(n.kind))) ?? [];

  if (error) return <div className="screen"><ErrorState message={error} /></div>;

  return (
    <div className="screen">
      <h1 className="screen-title">NOTIFS</h1>
      <div style={{ height: "var(--s-4)" }} />

      <Tabs
        label="Notification type"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "ALL" },
          { value: "orders", label: "ORDERS" },
          { value: "delivery", label: "DELIVERY" },
          { value: "stock", label: "STOCK" },
        ]}
      />

      <div style={{ height: "var(--s-6)" }} />

      {!items && (
        <div style={{ minHeight: 220, display: "grid", placeItems: "center" }}>
          <LoadBar label="CHECKING" />
        </div>
      )}

      {items && shown.length === 0 && <Empty>NOTHING TO TELL YOU</Empty>}

      <div>
        {shown.map((n) => {
          const body = (
            <>
              <div className="card-thumb" style={{
                background: "linear-gradient(160deg,#CFCFD2,#8D8D90)",
                borderRadius: 4,
              }} />
              <div className="card-body">
                <p className="card-title">{n.title}</p>
                <p className="card-sub">{n.body}</p>
              </div>
              <span className="card-go" aria-hidden="true" />
            </>
          );

          return n.order_id ? (
            <Link key={n.notification_id} to={`/orders/${n.order_id}`}
                  className="card" style={{ textDecoration: "none" }}>
              {body}
            </Link>
          ) : (
            <div key={n.notification_id} className="card">{body}</div>
          );
        })}
      </div>

      <div className="spacer" />
      <Link to="/profile" style={{
        display: "block", textAlign: "center", color: "var(--blue-faint)",
        textDecoration: "none", padding: "var(--s-6) 0",
      }}>
        BACK
      </Link>
    </div>
  );
}
