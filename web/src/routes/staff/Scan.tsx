import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { Scanner, type ScanState } from "../../components/illustrated";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/** Cashier QR scanner. The Figma artboards are the visual source of truth. */
export default function Scan() {
  const nav = useNavigate();
  const [state, setState] = useState<ScanState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<string | null>(null);

  const onResult = useCallback(async (token: string) => {
    setState("idle"); setMessage(null); setFlagged(null);
    try {
      const r = await api.staff.scan(token);
      setState("ok"); setOrderNumber(r.order_number); setMessage("HANDED OVER");
    } catch (e) {
      const err = e as ApiError;
      setState("fail"); setMessage(err.message);
      if (["QR_ALREADY_SCANNED", "ALREADY_FULFILLED", "UNPAID", "ORDER_ALREADY_CLOSED"].includes(err.code)) {
        setFlagged(err.code);
        setOrderNumber(err.detail.order_number ?? null);
      }
    }
  }, []);

  const onError = useCallback((m: string) => { setState("fail"); setMessage(m); }, []);
  const node = state === "ok" ? "1:4377" : state === "fail" ? "1:4407" : "1:4437";

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const nodeEl = target.closest<HTMLElement>("[data-node]");
    const id = nodeEl?.dataset.node;
    if (id === "1:4443" || id === "1:4383" || id === "1:4413") {
      if (state === "ok") { nav("/staff/queue"); return; }
      setMessage(null); setFlagged(null); setOrderNumber(null); setState("scanning");
    }
    if (id === "1:4465" || id === "1:4406" || id === "1:4436") nav("/staff/shift");
  };
  const values = orderNumber ? { "1:4444": orderNumber, "1:4384": orderNumber, "1:4414": orderNumber } : undefined;

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node={node} values={values} onClick={handleClick}>
        {/* The drawing's bell is the notification counter. It has no node id of
            its own, so the target sits on the group the file draws at (362,63). */}
        <button className="figma-route-interactive" aria-label="Notifications"
          onClick={(e) => { e.stopPropagation(); nav("/staff/notifs"); }}
          style={{ left: 362, top: 63, width: 50, height: 56, zIndex: 25 }} />
        {(state === "scanning" || state === "idle") && (
          <div style={{ position: "absolute", left: 50, top: 140, width: 340, height: 400, zIndex: 15, borderRadius: 64, overflow: "hidden" }}>
            <Scanner state={state} active={state === "scanning"} onResult={onResult} onError={onError} />
          </div>
        )}
        {(message || flagged) && (
          <div style={{ position: "absolute", left: 45, top: 690, width: 350, zIndex: 30, textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 18, letterSpacing: ".04em", lineHeight: 1.5 }}>
              {message}{orderNumber ? ` · ${orderNumber}` : ""}
            </div>
            {flagged === "UNPAID" && orderNumber && (
              <button className="figma-route-interactive" style={{ position: "relative", marginTop: 18, width: 240, height: 54, color: "transparent" }} onClick={() => nav(`/staff/lookup?q=${orderNumber}`)} aria-label="Take payment now" />
            )}
          </div>
        )}
      </FigmaRouteFrame>
    </div>
  );
}
