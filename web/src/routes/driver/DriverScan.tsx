import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { Input, OptionalBack, Pill, Sheet, Stamp } from "../../components/primitives";
import { Scanner, type ScanState } from "../../components/illustrated";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * Doorstep scan. Identical to the counter scanner except the server pins the
 * fulfilment type to delivery, so a pickup code cannot be burned out here.
 *
 * The hand the file draws beside SCAN works on both boards: a QR on a phone
 * with a cracked screen or no signal is exactly where a driver needs to type
 * the code in instead, and there is nowhere else on this screen to do it.
 */
export default function DriverScan() {
  const nav = useNavigate();
  const [state, setState] = useState<ScanState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState("");

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

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-node]")?.dataset.node;
    // The hand sits beside SCAN on all three boards: idle (1:4946), successful
    // (1:4916) and failed (1:4967). A QR on a cracked screen or with no signal
    // is exactly where a driver needs to type the code in instead.
    if (id === "1:4946" || id === "1:4916" || id === "1:4967") {
      setManual(""); setManualOpen(true);
      return;
    }
    // The drawing's own SCAN button is the one scan control on this screen. It
    // drives the camera directly, and toggles off while the camera is running,
    // so the route never has to draw a second control carrying the same word.
    if (id === "1:4944" || id === "1:4914" || id === "1:4945" || id === "1:4915") {
      if (state === "scanning") { setState("idle"); return; }
      setMessage(null);
      setOrderNumber(null);
      setState("scanning");
    }
  };

  return (
    <div className="screen figma-route-scroll">
      <OptionalBack to="/driver" />
      <FigmaRouteFrame node={node} values={values} onClick={handleClick}>
        <div style={{ position: "absolute", left: 50, top: 140, width: 340, height: 400, zIndex: 15, borderRadius: 64, overflow: "hidden" }}>
          <Scanner state={state} active={state === "scanning"} onResult={onResult} onError={onError} />
        </div>
        <div className="scan-actions" style={{ position: "absolute", left: 35, top: 700, width: 370, zIndex: 20 }}>
          {message && <div className="stamp-wrap"><Stamp tone={state === "ok" ? "ok" : "danger"} loud>{message}</Stamp>{orderNumber && <p className="label" style={{ marginTop: 12 }}>{orderNumber}</p>}</div>}
          {/* The drawing already draws the scan control (1:4943), and the route
              makes that drawn button live rather than stacking a second one on
              top of it. What is left for this band is only what the drawing
              does not have: a way to leave a finished drop, and a way to stop
              a camera that is running. Two SCAN controls for one act is what
              this band used to be; there is one now, and it is the drawn one. */}
          {state === "ok" && <Pill onClick={() => nav("/driver")}>NEXT DROP</Pill>}
          {state === "scanning" && (
            <Pill variant="ghost" onClick={() => setState("idle")}>STOP THE CAMERA</Pill>
          )}
        </div>
      </FigmaRouteFrame>

      <Sheet open={manualOpen} onClose={() => setManualOpen(false)} label="Enter the code by hand">
        <p className="label">TYPE THE CODE UNDER THEIR QR</p>
        <div style={{ marginTop: "var(--s-4)" }}>
          <Input
            autoFocus
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="COLLECTION CODE"
            onKeyDown={(e) => {
              if (e.key === "Enter" && manual.trim()) {
                setManualOpen(false);
                void onResult(manual.trim());
              }
            }}
          />
        </div>
        <p className="label" style={{ marginTop: "var(--s-4)", lineHeight: 2 }}>
          IT IS THE SHORT CODE ON THE CUSTOMER'S RECEIPT, NOT THE ORDER NUMBER.
        </p>
        <div style={{ marginTop: "var(--s-5)" }}>
          <Pill
            disabled={!manual.trim()}
            onClick={() => { setManualOpen(false); void onResult(manual.trim()); }}
          >
            MARK IT DELIVERED
          </Pill>
          <Pill variant="ghost" onClick={() => setManualOpen(false)}>CANCEL</Pill>
        </div>
      </Sheet>
    </div>
  );
}