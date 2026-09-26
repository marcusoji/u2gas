import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type NotificationRow, type StockEntry } from "../../lib/api";
import { LoadBar } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * Admin notifications (1:3245 / 1:3461 / 83:246).
 *
 * The file draws the list, the empty state, and one stock notification opened
 * over it. They are the same screen in three states, so the route renders the
 * frame it is in. The drawn rows carry no node ids and repeat samples, so live
 * notifications are bound by their exact drawn strings; a row with no record
 * keeps the file's own text rather than showing an invented one.
 */
export default function Notifications() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [entries, setEntries] = useState<StockEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expanded = params.get("state") === "expanded";

  useEffect(() => {
    api.notifications()
      .then((r) => setItems(r.notifications))
      .catch((e: ApiError) => setError(e.message));
    api.admin.stockHistory()
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
    void api.markRead().catch(() => {});
  }, []);

  if (error) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <div className="stamp-wrap"><div className="stamp">{error}</div></div>
      </div>
    );
  }

  if (!items || !entries) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="CHECKING THE OFFICE" />
      </div>
    );
  }

  const setState = (next: string | null) => {
    const q = new URLSearchParams(params);
    if (next) q.set("state", next); else q.delete("state");
    nav({ search: q.toString() });
  };

  const latest = entries[0];

  if (expanded && latest) {
    // The expanded board is the stock notification. Bind its fields from the
    // newest stock entry — the record this notification is about. The running
    // level is not stored on an entry, so it is the signed sum of the entries
    // up to and including this one; the level before it is that minus this
    // entry's own move.
    const signed = (e: StockEntry) => (e.move === "removal" ? -e.amount_kg : e.amount_kg);
    const newKg = entries.reduce((sum, e) => sum + signed(e), 0);
    const previousKg = newKg - signed(latest);
    const moveWord = latest.move === "removal" ? "REMOVED" : "ADDED";
    const when = new Date(latest.entry_date)
      .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      .toUpperCase();
    return (
      <div className="screen figma-route-scroll">
        <FigmaRouteFrame node="83:246" textReplacements={{
          "2 TONS ADDED \u2014 MARCH 23RD, 2026": `${latest.amount_kg / 1000} TONS ${moveWord} \u2014 ${when}`,
          "4.54 TONS": `${(previousKg / 1000).toFixed(2)} TONS`,
          "6.54 TONS": `${(newKg / 1000).toFixed(2)} TONS`,
          "MARC A.": (latest.admin?.display_name ?? "STAFF").toUpperCase(),
          "STK-032326": latest.entry_id.slice(0, 8).toUpperCase(),
        }}>
          <button className="figma-route-interactive" aria-label="Back to notifications"
            onClick={() => setState(null)}
            style={{ left: 24, top: 270, width: 392, height: 40 }} />
          <button className="figma-route-interactive" aria-label="View stock entry"
            onClick={() => nav("/admin/tank/history")}
            style={{ left: 52, top: 499, width: 290, height: 48 }} />
        </FigmaRouteFrame>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="screen figma-route-scroll">
        <FigmaRouteFrame node="1:3461" />
      </div>
    );
  }

  // Three rows are drawn. Bind each to a live notification, leaving the file's
  // own sample in a row that has no record behind it.
  const samples = [
    "LOW STOCK<br>6.54 tons \u00b7 14 days left",
    "SHIFT CLOSED SHORT<br>SARA \u00b7 \u2212\u20a62,500",
    "RATE CHANGED<br>SMITH \u00b7 \u20a61,400/kg",
  ];
  const textReplacements: Record<string, string | string[]> = {};
  items.slice(0, 3).forEach((n, i) => {
    if (n.title) textReplacements[samples[i]] = `${n.title}${n.body ? `<br>${n.body}` : ""}`;
  });

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:3245" textReplacements={textReplacements}>
        {items.slice(0, 3).map((n, i) => (
          <button
            key={n.notification_id}
            className="figma-route-interactive"
            aria-label={`Open ${n.title}`}
            onClick={() => (n.kind.startsWith("stock") ? setState("expanded") : nav("/admin/tank/history"))}
            style={{ left: 26, top: 151 + i * 125, width: 387, height: 109 }} />
        ))}
      </FigmaRouteFrame>
    </div>
  );
}
