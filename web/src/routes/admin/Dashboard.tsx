import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type AdminStaff, type GasStock } from "../../lib/api";
import { LoadBar } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * Admin home (1:2454 DASHBOARD, 1:2299 HOME BLUEPRINT).
 *
 * The file draws two layouts of the same office home: the blueprint (one
 * UPDATE control) and the dashboard (UPDATE and HISTORY, and a staff preview
 * strip). The dashboard is the default; ?layout=blueprint shows the earlier
 * drawing. Both boards carry the tank gauge, the bell and the staff strip, so
 * their controls are the same and the frame is the only thing that changes.
 */
export default function Dashboard() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [stock, setStock] = useState<GasStock | null>(null);
  const [staff, setStaff] = useState<AdminStaff[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const blueprint = params.get("layout") === "blueprint";

  useEffect(() => {
    api.admin.stock()
      .then((r) => setStock(r.stock))
      .catch((e: ApiError) => setError(e.message));
    api.admin.staff()
      .then((r) => setStaff(r.staff))
      .catch(() => setStaff([]));
  }, []);

  if (error && !stock) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <div className="stamp-wrap"><div className="stamp">{error}</div></div>
      </div>
    );
  }

  if (!stock || !staff) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="READING THE TANK" />
      </div>
    );
  }

  const lead = staff[0];
  const name = (lead?.profile?.display_name ?? "STAFF").toUpperCase();
  const role = (lead?.role ?? "STAFF").toUpperCase();

  // The staff strip and the tank figure carry no node ids; they are bound by
  // their exact drawn text. The gauge is a drawing and keeps its own values.
  const textReplacements: Record<string, string | string[]> = {
    SMITH: name,
    MANAGER: role,
  };

  const setLayout = (next: string | null) => {
    const q = new URLSearchParams(params);
    if (next) q.set("layout", next); else q.delete("layout");
    nav({ search: q.toString() });
  };

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node={blueprint ? "1:2299" : "1:2454"} textReplacements={textReplacements}>
        {/* The bell the file draws top-right is the notification counter. */}
        <button className="figma-route-interactive" aria-label="Notifications"
          onClick={() => nav("/admin/notifs")}
          style={{ left: 362, top: 63, width: 50, height: 56 }} />
        {/* The gauge itself is the tank. */}
        <button className="figma-route-interactive" aria-label="Tank level"
          onClick={() => nav("/admin/tank")}
          style={{ left: 40, top: 126, width: 280, height: 510 }} />
        {/* UPDATE opens the drawn stock panel (1:3075). */}
        <button className="figma-route-interactive" aria-label="Update stock"
          onClick={() => nav("/admin/tank/update")}
          style={{ left: blueprint ? 40 : 35, top: 656, width: blueprint ? 200 : 176, height: 70 }} />
        {/* HISTORY is only drawn on the dashboard layout. */}
        {!blueprint && (
          <button className="figma-route-interactive" aria-label="Gas history"
            onClick={() => nav("/admin/tank/history")}
            style={{ left: 223, top: 656, width: 181, height: 70 }} />
        )}
        {/* The staff strip. */}
        <button className="figma-route-interactive" aria-label="Staff"
          onClick={() => nav("/admin/people")}
          style={{ left: 40, top: 834, width: 476, height: 161 }} />
        {/* The file keeps both home layouts; this is how the other one is seen. */}
        <button className="figma-route-interactive"
          aria-label={blueprint ? "Dashboard layout" : "Blueprint layout"}
          onClick={() => setLayout(blueprint ? null : "blueprint")}
          style={{ left: 12, top: 6, width: 48, height: 44 }} />
      </FigmaRouteFrame>
    </div>
  );
}
