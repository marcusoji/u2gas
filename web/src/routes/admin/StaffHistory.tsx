import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type AdminDriver, type AdminOrder } from "../../lib/api";
import { LoadBar, Segmented } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import { mediaUrl } from "../../lib/media";

type Scope = "active" | "history";

/**
 * One driver's delivery history (1:3675 / 1:3781).
 *
 * The file draws the same sheet twice — the completed run and the one still in
 * progress — so the route is one screen with a scope switch, and each scope
 * renders the board the file draws for it. The rows carry no node ids and
 * repeat samples, so live drops are bound by their exact drawn strings.
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
        <div className="stamp-wrap"><div className="stamp">{error}</div></div>
      </div>
    );
  }

  if (!drivers || !orders) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="PULLING THE RUN" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <div className="stamp-wrap"><div className="stamp">NO SUCH DRIVER</div></div>
      </div>
    );
  }

  const name = (driver.profile?.display_name ?? "DRIVER").toUpperCase();
  const history = scope === "history";
  const rows = (history ? finished : active).slice(0, history ? 3 : 2);

  // Drawn samples per board, in document order, paired with the tail sample.
  const samples = history
    ? [["U2-100042", "Delivered 14:22 \u00b7 Ikoyi"], ["U2-100039", "Delivered 11:08 \u00b7 Marina"], ["U2-100031", "Returned \u00b7 no answer"]]
    : [["U2-100051", "En route \u00b7 Yaba"], ["U2-100048", "Delivered 09:40 \u00b7 Surulere"]];

  const textReplacements: Record<string, string | string[]> = {
    "SMITH\u2019S": `${name}\u2019S`,
  };
  rows.forEach((o, i) => {
    const status = o.delivery?.status ?? "assigned";
    const tail = status === "en_route"
      ? `En route \u00b7 ${o.delivery?.delivery_address ?? "on the way"}`
      : status === "assigned"
        ? `Assigned \u00b7 ${o.delivery?.delivery_address ?? "waiting"}`
        : status === "delivered"
          ? `Delivered \u00b7 ${o.delivery?.delivery_address ?? "delivered"}`
          : `${status === "returned" ? "Returned" : "Failed"} \u00b7 ${o.delivery?.delivery_address ?? "no answer"}`;
    textReplacements[samples[i][0]] = o.order_number;
    textReplacements[samples[i][1]] = tail;
  });

  const setScopeAndKeep = (next: Scope) => setScope(next);

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node={history ? "1:3675" : "1:3781"} textReplacements={textReplacements}>
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
        <button className="figma-route-interactive" aria-label="Back to staff"
          onClick={() => nav("/admin/people")}
          style={{ left: 32, top: 80, width: 52, height: 52 }} />
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
