import { type ReactNode } from "react";

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
                       rows     12px, letter-spacing -0.48px, 9px apart, top 90
     1:2199            strip  241x70, #1317e4, 1px #797bf4, label 16px #fff
     1:2115            chips  height 24, radius 8, 1px #1317e4, 16px, -0.64px
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

/** The receipt paper. `date` is drawn at 32px, the lines at 12px, 9px apart. */
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
          <div className="history-card-row" key={i}>
            <span>{l.label}</span>
            <b>{l.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The live-order strip the drawing puts above a receipt (1:2199). Drawn over
 * the paper at the same x, so it is rendered as one unit with the card.
 */
export function HistoryStatusStrip({ children }: { children: ReactNode }) {
  return (
    <div className="history-strip">
      <p className="history-strip-label">{children}</p>
      <div className="history-strip-slot" />
    </div>
  );
}
