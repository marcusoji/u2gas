import { type ReactNode, useEffect, useRef, useState } from "react";
import { money } from "./primitives";

/* ---------------------------------------------------------------------------
   The gas terminal. This is the hero of the customer app and the LCP element
   on the home route, so it is CSS and markup only — no raster on the critical
   path. (Addendum 73.2)
   --------------------------------------------------------------------------- */

/**
 * The LED strip suspended above the terminal on two wires.
 *
 * Scrolls by default. A countdown passes `static` so it does not slide off
 * mid-read — watching a number you need disappear is worse than no motion.
 */
export function Ticker({ children, static: isStatic }: {
  children: ReactNode;
  static?: boolean;
}) {
  return (
    <>
      <div className="ticker-wires" aria-hidden="true"><i /><i /></div>
      <div className="ticker">
        <span className={`ticker-text${isStatic ? " is-static" : ""}`}>{children}</span>
      </div>
    </>
  );
}

/**
 * Live hold countdown.
 *
 * Recomputed from the expiry timestamp on every tick rather than decremented.
 * A decrementing counter drifts whenever the tab is backgrounded and the
 * interval is throttled, which would show a customer time they don't have.
 */
export function HoldCountdown({ expiresAt, onExpire }: {
  expiresAt: string;
  onExpire?: () => void;
}) {
  const remaining = () =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));

  const [left, setLeft] = useState(remaining);
  const fired = useRef(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    fired.current = false;

    const tick = () => {
      const next = remaining();
      setLeft(next);
      // Guarded so a re-render after zero cannot fire the callback twice.
      if (next <= 0 && !fired.current) {
        fired.current = true;
        expireRef.current?.();
      }
    };

    tick();
    const t = setInterval(tick, 1000);

    // Coming back from a backgrounded tab must show the truth immediately.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [expiresAt]);

  if (left <= 0) return <Ticker static>HOLD EXPIRED</Ticker>;

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return <Ticker static>HOLD EXPIRES IN {mm}:{ss} — PAY AT THE DEPOT</Ticker>;
}

export function LedWindow({ value, tone = "red", small }: {
  value: string;
  tone?: "red" | "green";
  small?: boolean;
}) {
  return (
    <div className="led-window">
      <span className={`led-value${small ? " is-small" : ""}${tone === "green" ? " is-change" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function Terminal({ metal, caption = "AMOUNT IN NAIRA", children }: {
  metal?: boolean;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <div className={`terminal${metal ? " is-metal" : ""}`}>
      <div className="terminal-caption">{caption}</div>
      {children}
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "×", "0", "PAY"];

/**
 * The physical keypad. `×` clears the last digit, `PAY` submits.
 *
 * Disabled state dims the keys rather than hiding them — the machine is still
 * there, it just isn't taking input, which is what the insufficient-stock
 * screen needs to communicate.
 */
export function Keypad({ onDigit, onClear, onSubmit, disabled, submitDisabled }: {
  onDigit: (d: string) => void;
  onClear: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitDisabled?: boolean;
}) {
  return (
    <div className="keypad">
      {KEYS.map((k) => {
        const isPay = k === "PAY";
        const isClear = k === "×";
        return (
          <button
            key={k}
            className="key"
            disabled={disabled || (isPay && submitDisabled)}
            aria-label={isPay ? "Pay" : isClear ? "Delete last digit" : k}
            onClick={() => isPay ? onSubmit() : isClear ? onClear() : onDigit(k)}
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}

export function ReceiptSlot() {
  return <div className="receipt-slot" aria-hidden="true" />;
}

export interface ReceiptLine { label: string; value: string; }

/**
 * The paper receipt. Feeds out of the slot on mount, which is the one place
 * the design uses entrance motion and earns it.
 */
export function Receipt({ date, lines, total, children, voided }: {
  date: string;
  lines: ReceiptLine[];
  total?: number;
  children?: ReactNode;
  voided?: boolean;
}) {
  return (
    <div className={`receipt${voided ? " is-void" : ""}`}>
      <div className="receipt-head">RECEIPT</div>
      <div className="receipt-date">{date}</div>

      {lines.map((l, i) => (
        <div className="row" key={i}>
          <span>{l.label}</span>
          <b>{l.value}</b>
        </div>
      ))}

      {total !== undefined && (
        <div className="row is-total">
          <span>TOTAL</span>
          <b>{money(total)}</b>
        </div>
      )}

      {children}
    </div>
  );
}

/** Formats the receipt date the way the design shows it: `17 MAR`. */
export function receiptDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" }).toUpperCase()}`;
}
