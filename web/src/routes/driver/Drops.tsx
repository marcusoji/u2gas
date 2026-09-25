import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { ErrorState, LoadBar, Segmented } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

type Scope = "active" | "completed";

export default function Drops() {
  const nav = useNavigate();
  const [scope, setScope] = useState<Scope>("active");
  const [drops, setDrops] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setDrops(null);
    setError(null);
    try {
      const r = await api.driver.deliveries(scope);
      if (requestId !== requestRef.current) return;
      setDrops(r.deliveries);
    } catch (e) {
      if (requestId !== requestRef.current) return;
      setError((e as ApiError).message);
    }
  }, [scope]);

  // Not `useEffect(load, …)`: load is async, so it returns a Promise, which
  // React would take as the cleanup function and call on unmount.
  useEffect(() => { void load(); }, [load]);

  const first = drops?.[0];
  const second = drops?.[1];
  const third = drops?.[2];

  const completed = scope === "completed";
  const textReplacements: Record<string, string | string[]> = {};

  // Each drawn row is one text node holding the order number, a `<br>`, then
  // the address or the delivered line. Two keys per row — the number and the
  // tail — keep the file's own `<br>` instead of a replacement having to carry
  // markup. That is safe because `FigmaScreen` applies every key in one
  // left-to-right pass: binding row 1 to "U2-100045" is not re-matched by row
  // 3's key, which is what used to make the first and third rows identical.
  // Sample keys must be the file's own strings, because that is what the drawn
  // markup contains before a route rewrites it.
  const activeRows = [
    ["U2-100042", "12 Awolowo Road, Ikoyi · 10KG"],
    ["U2-100044", "4 Marina Street · 5KG"],
    ["U2-100045", "19 Bode Thomas · 12KG"],
  ];
  const completedRows = [
    ["U2-100039", "Delivered 14:22 · 6KG"],
    ["U2-100037", "Delivered 11:08 · 10KG"],
    ["U2-100031", "Returned to depot · no answer"],
  ];

  const rows = [first, second, third];
  const samples = completed ? completedRows : activeRows;

  // The drawing always carries three rows. With fewer live drops the spare rows
  // must not keep the file's sample record — that is a real order number and a
  // real address belonging to someone else, which is worse than an empty row.
  samples.forEach((sample, i) => {
    const d = rows[i];
    if (!d) {
      textReplacements[sample[0]] = "—";
      textReplacements[sample[1]] = completed ? "No earlier drop" : "No active drop";
      return;
    }
    const kg = d.order?.gas_amount_kg ?? 0;
    textReplacements[sample[0]] = d.order?.order_number ?? "DELIVERY";
    if (completed) {
      // A delivery has no `completed_at`/`updated_at`; the completion time is
      // `delivered_at` (or when it went en route / was assigned). Reading the
      // fields that do not exist left the time empty, so every finished drop
      // read "Delivered  · 6KG".
      const when = d.delivered_at ?? d.en_route_at ?? d.assigned_at;
      const time = when
        ? new Date(when).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
        : "";
      textReplacements[sample[1]] = d.status === "returned"
        ? `Returned to depot · ${d.failure_reason ?? "returned"}`
        : `Delivered${time ? ` ${time}` : ""} · ${kg}KG`;
    } else {
      textReplacements[sample[1]] = `${d.delivery_address ?? "ADDRESS"} · ${kg}KG`;
    }
  });

  if (!completed && first) {
    textReplacements["AJAINO CALEB"] =
      (first.order?.profile?.display_name ?? first.order?.guest_name ?? "CUSTOMER").toUpperCase();
  }

  return (
    <div className="screen">
      {/* The file has no control to switch lists, and the route never called
          setScope, so the completed artboard was unreachable. This toggle is
          app-rendered chrome outside `.frame`; the drawing is untouched. */}
      <div className="driver-scope">
        <Segmented
          label="Delivery list"
          value={scope}
          onChange={setScope}
          options={[
            { value: "active", label: "ACTIVE" },
            { value: "completed", label: "COMPLETED" },
          ]}
        />
      </div>
      <FigmaRouteFrame node={completed ? "1:4803" : "1:4683"} textReplacements={textReplacements}>
        {/* The extracted artboard is the visual source of truth. These hit
            targets are deliberately transparent: the Figma pixels remain
            untouched while the real delivery records stay interactive. */}
        {first && (
          <button className="figma-route-interactive" aria-label={`Open ${first.order?.order_number ?? "delivery"}`}
            onClick={() => nav(`/driver/drops/${first.delivery_id}`)}
            style={{ left: 26, top: 300, width: 387, height: completed ? 109 : 190 }} />
        )}
        {second && (
          <button className="figma-route-interactive" aria-label={`Open ${second.order?.order_number ?? "delivery"}`}
            onClick={() => nav(`/driver/drops/${second.delivery_id}`)}
            style={{ left: 26, top: completed ? 425 : 771, width: 387, height: 109 }} />
        )}
        {third && (
          <button className="figma-route-interactive" aria-label={`Open ${third.order?.order_number ?? "delivery"}`}
            onClick={() => nav(`/driver/drops/${third.delivery_id}`)}
            style={{ left: 26, top: completed ? 550 : 896, width: 387, height: 109 }} />
        )}
        {!completed && (
          <button className="figma-route-interactive" aria-label="Scan delivery"
            onClick={() => nav("/driver/scan")}
            style={{ left: 136, top: 510, width: 173, height: 72, zIndex: 40 }} />
        )}
      </FigmaRouteFrame>
    </div>
  );
}
