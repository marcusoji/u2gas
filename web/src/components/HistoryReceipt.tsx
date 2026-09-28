import { type ReactNode } from "react";
import * as A from "../figma/assets";

/* ---------------------------------------------------------------------------
   The receipt card and month chip, as the TRANS HISTORY artboard draws them
   (1:2107).

   `FigmaScreen` replaces text on a fixed set of nodes, so it cannot render a
   variable number of real orders, and the drawing's own rows carry no
   `data-node` id to bind. These are the same measurements, type and shadow as
   the drawing, filled from live records: the equivalent of the row template the
   HTML build used. Change the drawing and this must change with it.

   Drawn values, for reference:
     1:2134 / 1:2170   card   241 wide, #fff, drop-shadow(0 4px 24px rgba(0,0,0,.18))
                       RECEIPT  14px, letter-spacing -0.56px, centred, top 17
                       date     32px, letter-spacing -1.28px, centred, top 37
                       rows     left 9, top 87, 223 wide, 37 tall, 45 apart:
                                product image 33x37 (opacity .7), 2-line label
                                10px -0.4px at x33, dotted leader at x128,
                                `₦` at x177 and the amount 14px -0.56px at x183
                       QR       100x100 at x70, 32px below the last row
     1:2199            strip  241x70, #1317e4, 1px #797bf4, label 16px #fff
     445:16125         bar    left 40, top 38, 158x20: four 38x6 segments 40 apart,
                                the last unfilled, `In motion` 10px beneath
     1:2115            chips  height 24, radius 8, 1px #1317e4, 24px, -0.96px
   --------------------------------------------------------------------------- */

export interface ReceiptCardLine { label: string; value: string; }

/** One month chip from the drawing's own strip (1:2115). */
export function HistoryMonthChip({ label, active, onClick }: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="history-chip"
      onClick={onClick}
      aria-pressed={active}
      style={{
        background: active ? "#1317e4" : "transparent",
        color: active ? "#fff" : "#1317e4",
      }}
    >
      {label}
    </button>
  );
}

/** The QR code the re-issued drawing stamps on every receipt (373:11504). */
function ReceiptQr() {
  return (
    <span className="history-card-qr" aria-hidden="true"
          style={{ backgroundImage: `url('${A.a12}')` }} />
  );
}

/** The receipt paper. `date` is drawn at 32px, the rows at 10/14px, 45 apart. */
export function HistoryReceiptCard({ date, lines }: {
  date: string;
  lines: ReceiptCardLine[];
}) {
  return (
    <div className="history-card">
      <p className="history-card-head">RECEIPT</p>
      <p className="history-card-date">{date}</p>
      <div className="history-card-rows">
        {lines.map((l, i) => (
          <div className="history-card-row" key={i} style={{ top: i * 45 }}>
            <span className="history-card-row-img" aria-hidden="true"
                  style={{ backgroundImage: `url('${A.a1}')` }} />
            <span className="history-card-row-label">{l.label}</span>
            <span className="history-card-row-leader">.........</span>
            <span className="history-card-row-naira">&#8358;</span>
            <b className="history-card-row-value">{l.value}</b>
          </div>
        ))}
      </div>
      {/* The QR sits 32px below the last row (373:11502 at y=201 with two rows,
          373:11733 at y=156 with one), so it follows the row count. */}
      <span style={{ position: "absolute", left: 70, top: 111 + lines.length * 45 }}>
        <ReceiptQr />
      </span>
    </div>
  );
}

/** One of the drawing's four 38x6 delivery-progress segments (447:16132..4). */
function ProgressSegment({ index, filled }: { index: number; filled: boolean }) {
  return (
    <span
      className="history-strip-seg"
      style={{
        left: index * 40,
        ...(filled
          ? null
          : { background: "rgba(255,255,255,.2)", border: "1px solid #0609bc" }),
      }}
    />
  );
}

/**
 * The live-order strip the drawing puts above a receipt (1:2199). Drawn over
 * the paper at the same x, so it is rendered as one unit with the card. The
 * re-issued file replaced the dashed slot with a four-segment progress bar.
 */
export function HistoryStatusStrip({ children }: { children: ReactNode }) {
  return (
    <div className="history-strip">
      <p className="history-strip-label">{children}</p>
      <div className="history-strip-bar">
        <p className="history-strip-motion">In motion</p>
        <ProgressSegment index={0} filled />
        <ProgressSegment index={1} filled />
        <ProgressSegment index={2} filled />
        <ProgressSegment index={3} filled={false} />
      </div>
    </div>
  );
}
