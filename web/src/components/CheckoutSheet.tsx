import { useRef } from "react";
import { Hot, useDrawnBoxes, type Rect } from "./figma-hotspots";

export type Fulfillment = "pickup" | "delivery";
export type Method = "bank_transfer" | "opay" | "card" | "depot";

/**
 * The checkout sheet, as 1:1703 WALK-IN / 1:1827 DELIVERY / 1:1952 NO ADDRESS
 * draw it.
 *
 * Each of those artboards paints the whole screen — the basket, the sheet over
 * it, the watermark and the copyright — so the route renders the drawing and
 * this adds only the controls the file has no node for. Nothing here paints:
 * every control is a transparent box on a node the artboard already draws (see
 * figma-hotspots.tsx), so the artwork stays the visual source of truth.
 */

/** The sheet panel each artboard draws. */
export const SHEET_PANEL: Record<string, string> = {
  "1:1703": "1:1800", "1:1827": "1:1924", "1:1952": "1:2049",
};

/** The nodes that carry a control, per artboard. `1:1952` draws its toggle and
 *  its `PAYMENT OPTIONS` heading without ids, so those are placed from the
 *  panel box with the offsets the other two boards do share. */
const CONTROLS: Record<string, { toggle?: [string, string]; tiles: string[]; extras: string[] }> = {
  "1:1703": { toggle: ["1:1803", "1:1805"], tiles: ["1:1810", "1:1812"], extras: ["1:1815"] },
  "1:1827": { toggle: ["1:1929", "1:1927"], tiles: ["1:1934", "1:1936", "1:1938"], extras: ["1:1940"] },
  "1:1952": { tiles: ["1:2059", "1:2061"], extras: [] },
};

/** Where 1:1952's un-idded toggle and handle sit, read from 1:1926/1:1943. */
const DERIVED = { toggleTop: 35, toggleRow: 204, chipH: 34, chipGap: 10, handleTop: 12, handleW: 44, handleH: 4 };

export function CheckoutSheet({
  node, fulfillment, method, address, subtotal, fee, busy, error,
  onFulfillment, onMethod, onAddress, onPay, onClose,
}: {
  node: string;
  fulfillment: Fulfillment;
  method: Method | null;
  address: string;
  subtotal: string;
  fee?: string | null;
  busy: boolean;
  error?: string | null;
  onFulfillment: (f: Fulfillment) => void;
  onMethod: (m: Method) => void;
  onAddress: () => void;
  onPay: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const panelId = SHEET_PANEL[node];
  const spec = CONTROLS[node];
  const boxes = useDrawnBoxes(ref, [panelId, ...(spec.toggle ?? []), ...spec.tiles, ...spec.extras], `${node}|${address}`);
  const panel = boxes[panelId];

  // 1:1952 has no ids on its toggle, so the two chips are placed from the
  // panel with 1:1926's offsets: a 204px row centred, 35px down, 34px tall.
  const toggle = panel && !spec.toggle
    ? ([panel[0] + (panel[2] - DERIVED.toggleRow) / 2, panel[1] + DERIVED.toggleTop, DERIVED.toggleRow / 2 - DERIVED.chipGap / 2, DERIVED.chipH] as Rect)
    : undefined;
  const toggle2 = toggle
    ? ([toggle[0] + toggle[2] + DERIVED.chipGap, toggle[1], toggle[2], toggle[3]] as Rect)
    : undefined;
  const handle = panel
    ? ([panel[0] + (panel[2] - DERIVED.handleW) / 2, panel[1] + DERIVED.handleTop, DERIVED.handleW, DERIVED.handleH] as Rect)
    : undefined;

  const toggleBoxes = spec.toggle
    ? ([boxes[spec.toggle[0]], boxes[spec.toggle[1]]] as [Rect | undefined, Rect | undefined])
    : ([toggle, toggle2] as [Rect | undefined, Rect | undefined]);

  return (
    <div ref={ref} className="figma-route-layer">
      <Hot box={toggleBoxes[0]} label="Walk-in" tone="chip" pressed={fulfillment === "pickup"}
           onClick={() => onFulfillment("pickup")} />
      <Hot box={toggleBoxes[1]} label="Delivery" tone="chip" pressed={fulfillment === "delivery"}
           onClick={() => onFulfillment("delivery")} />
      <Hot box={handle} label="Close checkout" onClick={onClose} />

      {spec.tiles.map((id, i) => (
        <Hot key={id} box={boxes[id]} label={METHOD_LABEL[i]} tone="tile"
             pressed={method === METHOD_VALUE[i]} onClick={() => onMethod(METHOD_VALUE[i])} />
      ))}

      {spec.extras.map((id) =>
        id === "1:1815"
          ? <Hot key={id} box={boxes[id]} label="Pay in the depot" tone="cta"
                 pressed={method === "depot"} onClick={() => onMethod("depot")} />
          : <Hot key={id} box={boxes[id]} label={`Change delivery address: ${address}`}
                 onClick={onAddress} />,
      )}

      {/* Below the panel: the drawing leaves this band empty and the sheet has
          no slot for the amount the customer is about to pay. */}
      {panel && (
        <div className="checkout-foot"
             style={{ left: panel[0], top: panel[1] + panel[3] + 16, width: panel[2] }}>
          <div className="checkout-sum">
            <span>ITEMS {subtotal}</span>
            {fee ? <span>DELIVERY {fee}</span> : null}
          </div>
          {error ? <p className="checkout-err">{error}</p> : null}
          <button type="button" className="checkout-pay" onClick={onPay} disabled={!method || busy}>
            {busy ? "HOLD ON" : method === "depot" ? "RESERVE MY ORDER" : "CONTINUE TO PAY"}
          </button>
        </div>
      )}
    </div>
  );
}

const METHOD_VALUE: Method[] = ["bank_transfer", "opay", "card"];
const METHOD_LABEL = ["Bank transfer", "Opay", "Card"];
