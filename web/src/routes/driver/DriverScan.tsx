import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { Pill, Stamp } from "../../components/primitives";
import { Scanner, type ScanState } from "../../components/illustrated";
import { Ticker } from "../../components/terminal";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * Doorstep scan. Identical to the counter scanner except the server pins the
 * fulfilment type to delivery, so a pickup code cannot be burned out here.
 */
export default function DriverScan() {
  const nav = useNavigate();
  const [state, setState] = useState<ScanState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const onResult = useCallback(async (token: string) => {
    setState("idle");
    setMessage(null);
    try {
      const r = await api.driver.scan(token);
      setState("ok");
      setOrderNumber(r.order_number);
      setMessage("DELIVERED");
    } catch (e) {
      const err = e as ApiError;
      setState("fail");
      setMessage(err.message);
      setOrderNumber(err.detail.order_number ?? null);
    }
  }, []);

  const onError = useCallback((m: string) => { setState("fail"); setMessage(m); }, []);

  const node = state === "ok" ? "1:4908" : "1:4938";
  const values: Record<string, string> =
    state === "ok" ? { "1:4915": "SCAN SUCCESSFUL" } : { "1:4945": state === "fail" ? "SCAN FAILED" : "SCAN" };

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node={node} values={values}>
        <div style={{ position: "absolute", left: 50, top: 140, width: 340, height: 400, zIndex: 15, borderRadius: 64, overflow: "hidden" }}>
          <Scanner state={state} active={state === "scanning"} onResult={onResult} onError={onError} />
        </div>
        <div style={{ position: "absolute", left: 35, top: 600, width: 370, zIndex: 20 }}>
          {message && <div className="stamp-wrap"><Stamp tone={state === "ok" ? "ok" : "danger"} loud>{message}</Stamp>{orderNumber && <p className="label" style={{ marginTop: 12 }}>{orderNumber}</p>}</div>}
          {state === "ok" ? (
            <Pill onClick={() => nav("/driver")}>NEXT DROP</Pill>
          ) : (
            <Pill onClick={() => { setState("scanning"); setMessage(null); }} disabled={state === "scanning"}>
              {message ? "SCAN AGAIN" : "SCAN"}
            </Pill>
          )}
          {state === "scanning" && <Pill variant="ghost" onClick={() => setState("idle")}>STOP</Pill>}
        </div>
      </FigmaRouteFrame>
    </div>
  );
}