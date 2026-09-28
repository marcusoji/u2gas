import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type AdminDriver, type AdminOrder } from "../../lib/api";
import { BackButton, LoadBar, Segmented } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import { mediaUrl } from "../../lib/media";

type Scope = "active" | "history";

/**
 * One staff member's delivery history (1:3675 driver / 1:3781 cashier).
 *
 * The re-issued file draws the same sheet twice with a role subtitle —
 * `DRIVER - HISTORY` and `CASHIER - HISTORY` — and a four-row receipt template
 * (product thumbnail, `1x`, the order line, the LED). The plain rows the app
 * carried were redrawn, so the panel is rebuilt from the file and the route
 * binds the order line by the ids the rebuild adds (`<panel>-row<i>-line`),
 * four per board.
 */
export default function StaffHistory() {
  const { staffId } = useParams();
  const nav = useNavigate();
  const [drivers, setDrivers] = useState<AdminDriver[] | null>(null);
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [scope, setScope] = useState<Scope>("history");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.admin.drivers(), api.admin.orders()])
      .then(([d, o]) => { setDrivers(d.drivers); setOrders(o.orders); })
      .catch((e: ApiError) => setError(e.message));
  }, []);

  const driver = drivers?.find((d) => d.driver_id === staffId) ?? null;

  const drops = useMemo(() => {
    if (!orders || !driver) return [];
    return orders.filter((o) =>
      o.fulfillment_type === "delivery" && o.delivery?.driver_id === driver.driver_id);
  }, [orders, driver]);

  const active = drops.filter((o) => o.delivery?.status === "assigned" || o.delivery?.status === "en_route");
  const finished = drops.filter((o) => !["assigned", "en_route"].includes(o.delivery?.status ?? ""));

  if (error) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <BackButton to="/admin/people" label="STAFF" />
        <div className="stamp-wrap"><div className="stamp">{error}</div></div>
      </div>
    );
  }

  if (!drivers || !orders) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <BackButton to="/admin/people" label="STAFF" />
        <LoadBar label="PULLING THE RUN" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <BackButton to="/admin/people" label="STAFF" />
        <div className="stamp-wrap"><div className="stamp">NO SUCH DRIVER</div></div>
      </div>
    );
  }

  const name = (driver.profile?.display_name ?? "DRIVER").toUpperCase();
  const history = scope === "history";
  const rows = (history ? finished : active).slice(0, 4);

  const tail = (o: AdminOrder) => {
    const status = o.delivery?.status ?? "assigned";
    const where = o.delivery?.delivery_address ?? "";
    if (status === "en_route") return where ? `En route \u00b7 ${where}` : "En route";
    if (status === "assigned") return where ? `Assigned \u00b7 ${where}` : "Assigned";
    if (status === "delivered") return `Delivered \u00b7 ${where || "delivered"}`;
    return `${status === "returned" ? "Returned" : "Failed"} \u00b7 ${where || "no answer"}`;
  };

  // Each drawn receipt row is `<p>PRODUCT<br>STATUS</p>`; the splice gives the
  // line leaf an id (`<panel>-row<i>-line`), so the route binds four rows per
  // board by id. The board's same sample line is also drawn blurred on the
  // scanner behind it, where an id would be ambiguous — id scoping keeps the
  // live record off that decorative copy. Ids are the splice's own, from
  // `.figdiff/patch_staffhist_panel.py`, not live Figma ids.
  const panel = history ? "1:3726" : "1:3832";
  const values: Record<string, string> = {
    [history ? "1:3729" : "1:3835"]: `${name}\u2019S`,
  };
  rows.forEach((o, i) => {
    values[`${panel}-row${i}-line`] = `${o.order_number}<br>${tail(o)}`;
  });

  const setScopeAndKeep = (next: Scope) => setScope(next);

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node={history ? "1:3675" : "1:3781"} values={values}>
        {/* The drawing's avatar frame (1:3679 / 1:3785 camera feed) is the
            driver's picture slot. */}
        {driver.profile?.avatar_asset?.base_path && (
          <img
            src={mediaUrl(driver.profile.avatar_asset.base_path, "detail")}
            alt=""
            style={{ position: "absolute", left: 53, top: 126, width: 340, height: 400, objectFit: "cover", borderRadius: 64, zIndex: 10 }}
          />
        )}
        {rows.map((o, i) => (
          <button
            key={o.order_id}
            className="figma-route-interactive"
            aria-label={`Open ${o.order_number}`}
            onClick={() => nav("/admin/orders")}
            style={{ left: 26, top: 271 + i * 125, width: 387, height: 109 }} />
        ))}
        <BackButton to="/admin/people" label="STAFF" />
      </FigmaRouteFrame>
      <div style={{ marginTop: 18 }}>
        <Segmented
          label="Delivery scope"
          value={scope}
          onChange={setScopeAndKeep}
          options={[
            { value: "history", label: "HISTORY" },
            { value: "active", label: "ACTIVE" },
          ]}
        />
      </div>
    </div>
  );
}
