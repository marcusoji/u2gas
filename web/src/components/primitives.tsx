import {
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  useEffect, useRef,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

/* ---------------------------------------------------------------------------
   Primitives. Each maps to one component in the Figma file. Nothing here
   invents a variant the design doesn't have.
   --------------------------------------------------------------------------- */

type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

export function Pill({ variant = "primary", className = "", ...rest }: PillProps) {
  const v = variant === "primary" ? "" : ` is-${variant}`;
  return <button type="button" className={`pill${v} ${className}`} {...rest} />;
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { error?: string };

export function Input({ error, id, ...rest }: InputProps) {
  return (
    <div>
      <input
        id={id}
        className="input"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error && id ? `${id}-error` : undefined}
        {...rest}
      />
      {error && <p className="field-error" id={id ? `${id}-error` : undefined}>{error}</p>}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ options, value, onChange, label, secondary }: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  secondary?: boolean;
}) {
  return (
    <div className={`tabs${secondary ? " is-secondary" : ""}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Payment method chips. Rotation comes from CSS position, so it is stable. */
export function Chip({ pressed, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  pressed?: boolean;
}) {
  return (
    <button className="chip" aria-pressed={pressed} {...rest}>
      {children}
    </button>
  );
}

export function Stamp({ tone = "danger", loud, children }: {
  tone?: "danger" | "ok";
  loud?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`stamp${tone === "ok" ? " is-ok" : ""}${loud ? " is-loud" : ""}`}>
      {children}
    </span>
  );
}

/**
 * Loading. The design has no spinner — it has an LED bar. Callers must reserve
 * the final height around it so nothing shifts when content arrives.
 */
export function LoadBar({ label }: { label?: string }) {
  return (
    <div role="status" aria-live="polite">
      <div className="loadbar" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => <i key={i} />)}
      </div>
      {label && <p className="label" style={{ marginTop: "var(--s-3)" }}>{label}</p>}
      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  );
}

/** Empty states are an invitation, stamped in the cart's style. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Stamp>{children}</Stamp>
      {action && <div style={{ marginTop: "var(--s-6)" }}>{action}</div>}
    </div>
  );
}

/** Errors name the cause and offer the way out. They never apologise. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty" role="alert">
      <Stamp loud>{message}</Stamp>
      {onRetry && (
        <div style={{ marginTop: "var(--s-6)" }}>
          <Pill onClick={onRetry}>TRY AGAIN</Pill>
        </div>
      )}
    </div>
  );
}

/**
 * Bottom sheet. Traps focus and closes on Escape — the design shows neither,
 * but a sheet you cannot leave with a keyboard is broken.
 */
export function Sheet({ open, onClose, children, label }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input, [tabindex]")?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !ref.current) return;

      const focusable = ref.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="sheet-scrim"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        <div className="sheet-grab" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, children, label }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    )?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !ref.current) return;

      const focusable = ref.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="sheet-scrim"
      style={{ alignItems: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export function U2Mark() {
  return (
    <footer className="u2">
      <div className="u2-mark">U2</div>
      <div className="u2-copy">COPYRIGHT 2026 U2 OIL AND GAS LTD.</div>
    </footer>
  );
}

/**
 * Product image. Always contained, never cropped — the design places cut-outs
 * directly on the page with no card behind them, so a `cover` crop would slice
 * a cylinder in half. Explicit dimensions keep CLS at zero.
 */
export function ProductImage({ basePath, alt, tier = "grid", eager, height = 120 }: {
  basePath?: string | null;
  alt: string;
  tier?: "thumb" | "grid" | "detail";
  eager?: boolean;
  height?: number;
}) {
  if (!basePath) {
    return <div className="product-image" style={{ height }} aria-hidden="true" />;
  }

  const url = (t: string) => `${import.meta.env.VITE_MEDIA_BASE}/${basePath}/${t}.webp`;

  return (
    <img
      className="product-image"
      src={url(tier)}
      srcSet={`${url("thumb")} 96w, ${url("grid")} 320w, ${url("detail")} 800w`}
      sizes="(max-width: 720px) 45vw, 200px"
      alt={alt}
      height={height}
      loading={eager ? "eager" : "lazy"}
      // The first few tiles are the LCP candidates; the rest can wait.
      // Lowercase: React 18 passes unknown all-lowercase attributes straight
      // through, while the camelCase `fetchPriority` is unrecognised on 18 and
      // logs a warning per render without reaching the DOM.
      {...(eager ? { fetchpriority: "high" } : {})}
      decoding="async"
    />
  );
}

export function money(kobo: number): string {
  return "₦" + Math.round(kobo / 100).toLocaleString("en-NG");
}

/**
 * Back navigation.
 *
 * Deep screens are reached from a list and previously had no way back but the
 * browser button — which an installed PWA does not show. `to` is the list the
 * screen belongs to, used when there is no history to pop: a deep link opened
 * cold, or a reload, land on the router's initial entry rather than on a
 * screen this app pushed, so popping would leave the site entirely.
 */
export function useBackTo(to: string) {
  const nav = useNavigate();
  const location = useLocation();
  return () => {
    // `location.key` is "default" only for the entry the router booted on.
    // That is the signal that this screen was opened cold — a deep link or a
    // reload — where popping history would leave the app, so the known parent
    // is used instead. Every other entry was reached by a tap, and popping can
    // only return to a screen this app pushed. `history.length` is deliberately
    // not consulted: it already counts the entry the tab booted on, so it reads
    // as "there is somewhere to go back to" in a brand-new tab.
    if (location.key !== "default") nav(-1);
    else nav(to, { replace: true });
  };
}

export function BackButton({ to, label = "BACK" }: { to: string; label?: string }) {
  const back = useBackTo(to);
  return (
    <button className="screen-back" onClick={back}>
      {label}
    </button>
  );
}

/**
 * The scrollable column the hand-built screens sit in.
 *
 * Artboards place their own footer at a fixed y, so they need no scroll
 * container. Screens built from live data do — a long receipt list simply ran
 * off the bottom with no way to reach the rest. The drawing's own safe area is
 * kept at the end so the last row clears the home indicator.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="screen page-shell">
      <div className="page-shell-inner">{children}</div>
    </div>
  );
}
