import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type NotificationRow, type OrderSummary } from "../../lib/api";
import { LoadBar } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * Cashier notifications (1:4114 / 1:4192 / 1:4285).
 *
 * The file draws three states of one screen: the in-person order list, the
 * completed list, and one card expanded over it. They are a filter and a
 * disclosure, not three screens, so the route renders the frame for the state
 * it is in and keeps the drawn lists as the visual source of truth.
 *
 * The cards carry no node ids and repeat the same drawn sample, so live rows
 * are bound by their exact drawn strings — the same left-to-right replacement
 * `FigmaScreen` uses elsewhere. A sample that has no record behind it is left
 * as drawn rather than filled with an invented order.
 */
export default function Notifications() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // IN-PERSON (1:4114) is the default; COMPLETED (1:4192) is the second filter
  // the file draws; the expanded card (1:4285) is the same in-person list with
  // one card opened.
  const state = params.get("state");
  const mode: "in-person" | "completed" = state === "completed" ? "completed" : "in-person";
  const expanded = state === "expanded";

  useEffect(() => {
    api.notifications()
      .then((r) => setRows(r.notifications))
      .catch((e: ApiError) => setError(e.message));
    api.staff.queue(mode === "completed" ? "paid" : "unpaid")
      .then((r) => setOrders(r.orders))
      .catch(() => setOrders([]));
    void api.markRead().catch(() => {});
  }, [mode]);

  if (error) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <div className="stamp-wrap"><div className="stamp">{error}</div></div>
      </div>
    );
  }

  if (!rows || !orders) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="CHECKING THE TILL" />
      </div>
    );
  }

  const node = expanded ? "1:4285" : mode === "completed" ? "1:4192" : "1:4114";

  // Three rows are drawn. Bind each to a live record, or leave the file's own
  // sample in place — never repeat one record into a spare row.
  const textReplacements: Record<string, string | string[]> = {};
  const samples = ["U2 \u201cEnergizer Ignition Bay\u201d<br>ORDER FROM ONLINE STORE"];
  const orderRows = orders.slice(0, 3);
  const labels = orderRows.map((o) =>
    `${o.order_number}<br>${mode === "completed" ? "COMPLETED" : "ORDER FROM ONLINE STORE"}`);
  if (labels.length) textReplacements[samples[0]] = labels;
  if (mode === "in-person" && orderRows[0]?.guest_name) {
    textReplacements["AJAINO CALEB"] = orderRows[0].guest_name.toUpperCase();
  }

  const setState = (next: string | null) => {
    const q = new URLSearchParams(params);
    if (next) q.set("state", next); else q.delete("state");
    nav({ search: q.toString() });
  };

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node={node} textReplacements={textReplacements}>
        {/* The drawn filter chips and bell are transparent controls over the
            artwork; the file paints the selected chip itself. */}
        <button className="figma-route-interactive" aria-label="Completed orders"
          onClick={() => setState(mode === "completed" ? null : "completed")}
          style={{ left: 233, top: 149, width: 84, height: 28 }} />
        <button className="figma-route-interactive" aria-label="In-person orders"
          onClick={() => setState(null)}
          style={{ left: 39, top: 149, width: 116, height: 28 }} />
        {orderRows[0] && (
          <button className="figma-route-interactive"
            aria-label={`Open ${orderRows[0].order_number}`}
            onClick={() => setState(expanded ? (mode === "completed" ? "completed" : null) : "expanded")}
            style={{ left: 26, top: mode === "completed" ? 262 : 262, width: 387, height: 109 }} />
        )}
        {expanded && orderRows[0] && (
          <button className="figma-route-interactive" aria-label="Confirm order"
            onClick={() => nav(`/staff/collect/${orderRows[0].order_id}`)}
            style={{ left: 26, top: 620, width: 387, height: 109 }} />
        )}
        {orderRows[1] && (
          <button className="figma-route-interactive" aria-label={`Open ${orderRows[1].order_number}`}
            onClick={() => nav(`/staff/lookup?q=${orderRows[1].order_number}`)}
            style={{ left: 26, top: mode === "completed" ? 388 : 387, width: 387, height: 109 }} />
        )}
        {orderRows[2] && (
          <button className="figma-route-interactive" aria-label={`Open ${orderRows[2].order_number}`}
            onClick={() => nav(`/staff/lookup?q=${orderRows[2].order_number}`)}
            style={{ left: 26, top: mode === "completed" ? 513 : 512, width: 387, height: 109 }} />
        )}
        {/* The bell the drawing puts top-right is the notification counter. */}
        <button className="figma-route-interactive" aria-label="Notifications"
          onClick={() => setState(expanded ? null : "expanded")}
          style={{ left: 362, top: 63, width: 50, height: 56 }} />
      </FigmaRouteFrame>
    </div>
  );
}
