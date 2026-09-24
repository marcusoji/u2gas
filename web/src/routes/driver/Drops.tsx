import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { ErrorState, LoadBar } from "../../components/primitives";
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

  useEffect(load, [load]);

  const first = drops?.[0];
  const second = drops?.[1];
  const third = drops?.[2];

  const completed = scope === "completed";
  const textReplacements: Record<string, string> = {};
  if (completed) {
    const rows = [first, second, third];
    const samples = [
      ["U2-100039", "Delivered 14:22 · 6KG"],
      ["U2-100037", "Delivered 11:08 · 10KG"],
      ["U2-100031", "Returned to depot · no answer"],
    ];
    rows.forEach((d, i) => {
      if (!d) return;
      textReplacements[samples[i][0]] = d.order?.order_number ?? "DELIVERY";
      const when = d.completed_at ?? d.updated_at ?? d.created_at;
      const time = when ? new Date(when).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
      const status = d.status === "returned" ? `Returned to depot · ${d.failure_reason ?? "returned"}` : `Delivered ${time} · ${d.order?.gas_amount_kg ?? 0}KG`;
      textReplacements[samples[i][1]] = status;
    });
  } else {
    if (first) {
      textReplacements["U2-100042"] = first.order?.order_number ?? "DELIVERY";
      textReplacements["12 Awolowo Road, Ikoyi · 10KG"] = `${first.delivery_address ?? "ADDRESS"} · ${first.order?.gas_amount_kg ?? 0}KG`;
      textReplacements["AJAINO CALEB"] = (first.order?.profile?.display_name ?? first.order?.guest_name ?? "CUSTOMER").toUpperCase();
    }
    if (second) {
      textReplacements["U2-100044"] = second.order?.order_number ?? "DELIVERY";
      textReplacements["4 Marina Street · 5KG"] = `${second.delivery_address ?? "ADDRESS"} · ${second.order?.gas_amount_kg ?? 0}KG`;
    }
    if (third) {
      textReplacements["U2-100045"] = third.order?.order_number ?? "DELIVERY";
      textReplacements["19 Bode Thomas · 12KG"] = `${third.delivery_address ?? "ADDRESS"} · ${third.order?.gas_amount_kg ?? 0}KG`;
    }
  }

  return (
    <div className="screen">
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
