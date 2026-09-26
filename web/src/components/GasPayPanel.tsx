import { useRef } from "react";
import { Hot, useDrawnBoxes, type Rect } from "./figma-hotspots";

export type Fulfillment = "pickup" | "delivery";
export type Method = "bank_transfer" | "opay" | "card" | "depot";

/**
 * The gas terminal's payment panel, as 1:1344 PAY - WALK-IN, 1:326 PAY -
 * DELIVERY and 1:583 ORDER SUMMARY draw it.
 *
 * These are full screens — the terminal with the ticker, LED readout and
 * keypad, then the sheet over it — so the route renders the drawing and this
 * adds only the controls. Nothing here paints: every control is a transparent
 * box on a node the artboard already draws (see figma-hotspots.tsx), which
 * keeps the artwork the visual source of truth.
 *
 * The flow the drawings describe: the sheet picks fulfilment and method, then
 * 1:583 is the summary that confirms it, and its `Continue to Pay` is the
 * submit. Unlike the checkout sheet, all three boards carry ids on their
 * controls, so every hotspot is a measured node.
 */

/** The panel each frame draws, and the nodes that carry a control. */
export const GAS_PANEL: Record<string, { panel: string; toggle?: [string, string]; tiles: string[]; depot?: string; confirm?: string; cta?: string }> = {
  // 1:1422 is the selected WALK-IN chip, 1:1424 the unselected DELIVERY one.
  "1:1344": { panel: "1:1419", toggle: ["1:1422", "1:1424"], tiles: ["1:1429", "1:1431"], depot: "1:1434" },
  "1:326": { panel: "1:401", toggle: ["1:404", "1:406"], tiles: ["1:411", "1:413", "1:415"], confirm: "1:417" },
  "1:583": { panel: "1:656", tiles: [], cta: "1:658" },
};

/** The method each tile draws, in the order the boards list them. `1:326`
 *  draws CARD third; `1:1344` draws no card tile at all. */
const TILE_METHODS: Record<string, Method[]> = {
  "1:1344": ["bank_transfer", "opay"],
  "1:326": ["bank_transfer", "opay", "card"],
};

const METHOD_NAME: Record<Method, string> = {
  bank_transfer: "BANK TRANS", opay: "OPAY", card: "CARD", depot: "PAY IN THE DEPOT",
};

/** 1:662's `via:` leaf draws `OPAY` — one word, not the tile's two-line label. */
const METHOD_SHORT: Record<Method, string> = {
  bank_transfer: "BANK", opay: "OPAY", card: "CARD", depot: "DEPOT",
};

export function methodShort(m: Method | null): string {
  return m ? METHOD_SHORT[m] : "";
}

export function GasPayPanel({
  node, fulfillment, method, address, busy, error,
  onFulfillment, onMethod, onAddress, onContinue, onBack,
}: {
  node: string;
  fulfillment: Fulfillment;
  method: Method | null;
  address: string;
  busy: boolean;
  error?: string | null;
  onFulfillment: (f: Fulfillment) => void;
  onMethod: (m: Method) => void;
  onAddress: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const spec = GAS_PANEL[node];
  const ids = [spec.panel, ...(spec.toggle ?? []), ...spec.tiles,
    ...(spec.depot ? [spec.depot] : []), ...(spec.confirm ? [spec.confirm] : []),
    ...(spec.cta ? [spec.cta] : [])];
  const boxes = useDrawnBoxes(ref, ids, `${node}|${address}`);
  const panel = boxes[spec.panel];

  const tileMethods = TILE_METHODS[node] ?? [];
  const isSummary = node === "1:583";

  return (
    <div ref={ref} className="figma-route-layer">
      {/* The sheet's grab handle doubles as the way back: these frames draw no
          back arrow, and the handle is what a reader reaches for to dismiss a
          sheet. On the summary it returns to the sheet it confirms. */}
      {panel && (
        <Hot box={[panel[0] + (panel[2] - 44) / 2, panel[1] + 12, 44, 4]}
             label={isSummary ? "Back to payment options" : "Back to the terminal"}
             onClick={onBack} />
      )}

      {spec.toggle && (
        <>
          <Hot box={boxes[spec.toggle[0]]} label="Walk-in" tone="chip"
               pressed={fulfillment === "pickup"} onClick={() => onFulfillment("pickup")} />
          <Hot box={boxes[spec.toggle[1]]} label="Delivery" tone="chip"
               pressed={fulfillment === "delivery"} onClick={() => onFulfillment("delivery")} />
        </>
      )}

      {spec.tiles.map((id, i) => (
        <Hot key={id} box={boxes[id]} label={METHOD_NAME[tileMethods[i]]} tone="tile"
             pressed={method === tileMethods[i]} onClick={() => onMethod(tileMethods[i])} />
      ))}

      {spec.depot && (
        <Hot box={boxes[spec.depot]} label={METHOD_NAME.depot} tone="cta"
             pressed={method === "depot"} onClick={() => onMethod("depot")} />
      )}

      {spec.confirm && (
        <Hot box={boxes[spec.confirm]} label={`Delivery address: ${address || "not set"}`}
             onClick={onAddress} />
      )}

      {spec.cta && (
        <Hot box={boxes[spec.cta]} label="Continue to pay" tone="cta"
             disabled={busy} onClick={onContinue} />
      )}

      {/* The drawing has no slot for a server message, so it sits in the band
          the file leaves empty between the sheet and the accessories strip. */}
      {error && panel && (
        <div className="checkout-foot" style={{ left: panel[0], top: panel[1] + panel[3] + 12, width: panel[2] }}>
          <p className="checkout-err">{error}</p>
        </div>
      )}
    </div>
  );
}
