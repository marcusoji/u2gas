import {
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  forwardRef, useEffect, useRef, useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { mediaUrl } from "../lib/media";

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

/**
 * Text input. `forwardRef` so a screen can focus or select it — the lookup
 * screen's hand opens a field and moves the caret into it.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, id, ...rest }, ref,
) {
  return (
    <div>
      <input
        ref={ref}
        id={id}
        className="input"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error && id ? `${id}-error` : undefined}
        {...rest}
      />
      {error && <p className="field-error" id={id ? `${id}-error` : undefined}>{error}</p>}
    </div>
  );
});

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

export function Tabs<T extends string>({ options, value, onChange, label, secondary, rail }: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  secondary?: boolean;
  /** Scroll sideways instead of wrapping. Use when the row can outgrow its
   *  width — a year of months is 13 chips, which wrap into two ragged lines. */
  rail?: boolean;
}) {
  return (
    <div
      className={`tabs${secondary ? " is-secondary" : ""}${rail ? " is-rail h-rail is-snap" : ""}`}
      role="tablist"
      aria-label={label}
    >
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

/**
 * The hold every screen shows before its content settles.
 *
 * One place rather than one per route: a screen that resolves instantly used to
 * paint in the same frame it was asked for, so moving between screens read as a
 * flicker rather than a place being loaded. Two seconds is the deliberate
 * figure. A screen that spends longer fetching keeps the same bar up — this is
 * a floor, never a cap — so it is one continuous load either way.
 *
 * The children stay mounted underneath a fixed veil rather than replacing them.
 * Replacing would unmount the route on every navigation, so each screen would
 * refetch and lose its state, and the app shell's flex layout would change from
 * under it. `resetKey` restarts the hold on navigation; two screens that share
 * one component instance (product to product) each get their own hold.
 */
const PAGE_HOLD_MS = 2000;

export function PageLoading({ children, label = "LOADING", resetKey, holdMs = PAGE_HOLD_MS }: {
  children: ReactNode;
  label?: string;
  resetKey?: string;
  /** Exposed so a test can shorten the hold without reaching into the module. */
  holdMs?: number;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const t = window.setTimeout(() => setReady(true), holdMs);
    return () => window.clearTimeout(t);
  }, [holdMs, resetKey]);

  return (
    <>
      {children}
      <div className="page-hold" aria-hidden={ready ? "true" : undefined}>
        {!ready && (
          <div className="page-hold-veil" role="status" aria-live="polite">
            <LoadBar label={label} />
          </div>
        )}
      </div>
    </>
  );
}

/**
 * A list section's heading. The admin screens are long; a heading and one
 * sentence saying what the list holds is what makes them scannable. `tone`
 * marks the sections that are somebody's problem today.
 */
export function SectionHead({ title, hint, count, tone }: {
  title: string;
  hint?: string;
  count?: number | string;
  tone?: "urgent";
}) {
  return (
    <div className={`section-head${tone === "urgent" ? " is-urgent" : ""}`}>
      <h2>{title}</h2>
      {hint && <p>{hint}</p>}
      {count !== undefined && (
        <span className={`section-head-count${tone === "urgent" ? " is-urgent" : ""}`}>{count}</span>
      )}
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
 * Body scroll lock that survives nesting. A sheet can open another sheet
 * (change the rate from a stock sheet). Each one used to clear `overflow` on
 * close unconditionally, so the inner one closing unlocked the page while the
 * outer one was still open. Count the open overlays instead.
 */
let openOverlays = 0;
function lockBodyScroll() {
  if (openOverlays++ === 0) document.body.style.overflow = "hidden";
  return () => {
    if (--openOverlays === 0) document.body.style.overflow = "";
  };
}

/**
 * Bottom sheet. Traps focus and closes on Escape — the design shows neither,
 * but a sheet you cannot leave with a keyboard is broken.
 *
 * `blur` blurs the page behind the scrim. Use it when the overlay is opened
 * from a control on the screen (the tank gauge, say): the blur is what tells
 * the eye the sheet is a layer over that screen rather than a new page.
 */
export function Sheet({ open, onClose, children, label, blur }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  blur?: boolean;
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
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`sheet-scrim${blur ? " is-blurred" : ""}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        <div className="sheet-grab" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, children, label, blur }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  blur?: boolean;
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
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className={`sheet-scrim${blur ? " is-blurred" : ""}`}
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

  const url = (t: string) => mediaUrl(basePath, t as "thumb" | "grid" | "detail");

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
  // A negative amount is a shortfall, and it reads as a sign in front of the
  // whole figure. Naively prefixing the symbol to a negative number gave
  // "₦-37,600" on the shift reconciliation — the minus belongs before the ₦.
  const n = Math.round(kobo / 100);
  return `${n < 0 ? "-" : ""}₦${Math.abs(n).toLocaleString("en-NG")}`;
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
    //
    // `idx` is the stronger signal. `key !== "default"` alone is not enough:
    // when a screen navigates with `nav(to, { replace: true })` — the cart
    // bouncing an emptied basket to the shop, a route swapping a query state —
    // the replacement entry keeps a non-default key but is still the *first*
    // entry in the session, so popping it would leave the app. The router
    // tracks the index within the session on `history.state.idx`; 0 means
    // there is nothing of ours behind us. Where that is unavailable the
    // original check is kept.
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    const cold = location.key === "default" || (typeof idx === "number" && idx <= 0);
    if (!cold) nav(-1);
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
 * A back affordance for the tab roots and the screens that draw their own.
 *
 * Every screen the app pushes carries its own BackButton, which knows the
 * screen it belongs to. The tab roots are the top of their own stack: reached
 * cold — a deep link, a reload, an installed shortcut — there is nothing of
 * ours behind them, so an arrow there would either leave the site or point at
 * the screen it is already on. Reached by tapping a tab there is, and that is
 * exactly when "back" means "the tab I came from". This renders the arrow only
 * in that case, and it pops rather than naming a destination.
 *
 * `to` is for a screen that must always show a way back — a deep link into a
 * queue or a report has no history to pop, and leaving the reader with only the
 * browser button is the dead end this exists to remove. When there is nothing
 * to pop it goes to `to` instead, replacing the entry so back does not bounce.
 * With no `to` the original behaviour is kept: nothing to pop means no arrow.
 */
export function OptionalBack({ label = "BACK", to }: { label?: string; to?: string }) {
  const nav = useNavigate();
  const location = useLocation();
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  const canGoBack = location.key !== "default" && !(typeof idx === "number" && idx <= 0);
  if (!canGoBack && !to) return null;
  return (
    <button className="screen-back" onClick={() => (canGoBack ? nav(-1) : nav(to!, { replace: true }))}>
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
