import { type ReactNode, useEffect, useRef, useState } from "react";

/* ---------------------------------------------------------------------------
   The three illustrated components: the admin tank, the customer basket, and
   the scanner shared by staff and drivers.
   --------------------------------------------------------------------------- */

/**
 * Gas tank with its measuring ruler. The fill height is the live availability
 * as a share of total received — the same derivation the database uses.
 *
 * `labelLines` and `ariaLabel` exist because Reports reuses the same
 * fill-and-ruler language for a different quantity. Left hardcoded, the meter
 * announced "Gas remaining: 1 percent" and printed "AVAILABLE QUANTITY" above
 * an order count, which reads as a stock figure on a fulfilment screen.
 */
export function TankGauge({ availableKg, totalKg, unit = "TONS", note,
  labelLines = ["AVAILABLE", "QUANTITY"], ariaLabel }: {
  availableKg: number;
  totalKg: number;
  unit?: string;
  note?: string;
  labelLines?: [string, string];
  ariaLabel?: string;
}) {
  const percent = totalKg > 0
    ? Math.min(100, Math.max(0, Math.round((availableKg / totalKg) * 100)))
    : 0;

  // The artboard draws its own figure as a big whole number with a smaller
  // decimal beside it — `6` then `.5` — so one decimal place is the design's
  // convention, not an invention. Rounding to a whole ton here made the gauge
  // disagree with the ticker and the breakdown on the same screen: 3,590kg
  // read as "3 TONS" above "3.5 TONS" and "3.5T", three numbers for one value.
  const display = unit === "TONS"
    ? (availableKg / 1000).toFixed(1)
    : String(Math.round(availableKg));

  return (
    <div>
      <div className="tank-row">
        <div
          className="tank"
          role="meter"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={ariaLabel ?? `Gas remaining: ${percent} percent`}
        >
          <div className="tank-cap" aria-hidden="true" />
          <div className="tank-label">{labelLines[0]}<br />{labelLines[1]}</div>
          <div className="tank-fill" style={{ height: `${percent}%` }}>
            <span className="tank-numeral">{display}</span>
            <span className="tank-unit">{unit}</span>
          </div>
        </div>

        <div className="ruler" aria-hidden="true">
          {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => (
            <div key={n}><i />{String(n).padStart(2, "0")}</div>
          ))}
        </div>
      </div>

      {note && <p className="label" style={{ marginTop: "var(--s-4)" }}>{note}</p>}
    </div>
  );
}

/** The line-drawn basket. Items sit inside it as cut-outs. */
export function WireBasket({ children, empty }: { children?: ReactNode; empty?: ReactNode }) {
  return (
    <div className="basket">
      <svg className="basket-frame" viewBox="0 0 220 190" fill="none" aria-hidden="true">
        {/* Rim */}
        <path d="M14 28 H206 L188 172 Q186 182 176 182 H44 Q34 182 32 172 Z"
              stroke="#8A8A8D" strokeWidth="1.6" />
        <ellipse cx="110" cy="28" rx="96" ry="11" stroke="#8A8A8D" strokeWidth="1.6" />
        {/* Mesh */}
        {Array.from({ length: 11 }, (_, i) => {
          const x = 14 + i * 19.2;
          const dx = (x - 110) * 0.09;
          return <line key={`v${i}`} x1={x} y1="30" x2={x - dx * 1.6} y2="180"
                       stroke="#C2C2C5" strokeWidth="1" />;
        })}
        {Array.from({ length: 7 }, (_, i) => {
          const y = 46 + i * 20;
          const inset = (y - 28) * 0.115;
          return <line key={`h${i}`} x1={14 + inset} y1={y} x2={206 - inset} y2={y}
                       stroke="#C2C2C5" strokeWidth="1" />;
        })}
      </svg>

      <div className="basket-items">{children}</div>
      {empty && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          {empty}
        </div>
      )}
    </div>
  );
}

export function BasketItem({ children, onAdd, onRemove, canAdd = true }: {
  children: ReactNode;
  onAdd: () => void;
  onRemove: () => void;
  canAdd?: boolean;
}) {
  return (
    <div className="basket-item">
      {children}
      <button className="basket-step is-plus" onClick={onAdd} disabled={!canAdd}
              aria-label="Add one">+</button>
      <button className="basket-step is-minus" onClick={onRemove}
              aria-label="Remove one">−</button>
    </div>
  );
}

export type ScanState = "idle" | "scanning" | "ok" | "fail";

/**
 * QR scanner.
 *
 * The decoder is loaded lazily on first use — it is roughly 300KB of WASM and
 * has no business being in the initial bundle. Until then the square shows the
 * idle dithered fill from the design.
 */
export function Scanner({ state, onResult, onError, active }: {
  state: ScanState;
  onResult: (text: string) => void;
  onError: (message: string) => void;
  active: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [denied, setDenied] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) { stopRef.current?.(); return; }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let frame = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const { readBarcodesFromImageData } = await import("zxing-wasm/reader");

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          const v = videoRef.current;

          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);

            try {
              const results = await readBarcodesFromImageData(
                ctx.getImageData(0, 0, canvas.width, canvas.height),
                { formats: ["QRCode"], maxNumberOfSymbols: 1 },
              );
              if (results.length && results[0].text) {
                onResult(results[0].text);
                return;   // stop scanning until the caller re-arms
              }
            } catch { /* a frame that fails to decode is normal */ }
          }
          frame = requestAnimationFrame(() => { void tick(); });
        };

        void tick();
      } catch (err: unknown) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "NotFoundError") {
          setDenied(true);
          onError("CAMERA BLOCKED");
        } else {
          onError("SCANNER WOULDN'T START");
        }
      }
    })();

    stopRef.current = () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
    return stopRef.current;
  }, [active, onResult, onError]);

  const tone = state === "ok" ? " is-ok" : state === "fail" ? " is-fail" : "";

  return (
    <div className={`scanner${tone}`} role="img"
         aria-label={
           denied ? "Camera is blocked"
           : state === "ok" ? "Scan accepted"
           : state === "fail" ? "Scan rejected"
           : "Point the camera at the code"
         }>
      {active && state === "scanning" && !denied && (
        <video ref={videoRef} muted playsInline />
      )}
      {/* The halftone glyphs are a Figma export that may not be in place yet.
          The tinted square already carries the result, so a missing file is
          hidden rather than shown as a broken-image icon. (Item 13) */}
      {(state === "ok" || state === "fail") && (
        <img
          className="scanner-glyph"
          src={state === "ok" ? "/img/thumb-up.webp" : "/img/thumb-down.webp"}
          alt=""
          width={160}
          height={160}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
    </div>
  );
}
