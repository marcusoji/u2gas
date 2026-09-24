import {
  Component, useEffect, useState, type ErrorInfo, type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { Pill, Stamp, U2Mark } from "./primitives";
import { LedWindow, Terminal, Ticker } from "./terminal";

/* ---------------------------------------------------------------------------
   The states every screen needs and the prototype had none of. (Spec 42)
   --------------------------------------------------------------------------- */

/**
 * Offline banner.
 *
 * The ticker going dark is the design's own vocabulary for "the machine isn't
 * talking to anything" — better than a toast, which would cover the terminal.
 *
 * navigator.onLine only reports whether there is a network interface, not
 * whether anything is reachable, so a failed request also flips this.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const down = () => setOffline(true);
    const up = () => setOffline(false);

    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    // The API client dispatches this when a fetch fails outright.
    window.addEventListener("u2gas:offline", down);
    window.addEventListener("u2gas:online", up);

    return () => {
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
      window.removeEventListener("u2gas:offline", down);
      window.removeEventListener("u2gas:online", up);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "var(--ink)", color: "var(--grey)",
        textAlign: "center", padding: "var(--s-2)",
        fontSize: "var(--t-caption)", letterSpacing: ".12em",
      }}
    >
      NO SIGNAL — WE'LL RECONNECT
    </div>
  );
}

/** Wrong role for this prefix. Sends them to their own root, not a dead end. */
export function PermissionDenied({ home = "/" }: { home?: string }) {
  return (
    <div className="screen">
      <Ticker static>NOT YOUR DOOR</Ticker>
      <div style={{ height: "var(--s-5)" }} />

      <Terminal>
        <LedWindow value="LOCKED" small />
        <div style={{ height: "var(--s-4)" }} />
      </Terminal>

      <div className="stamp-wrap" style={{ marginTop: "var(--s-8)" }}>
        <Stamp loud>THIS PART ISN'T YOURS</Stamp>
      </div>

      <div className="spacer" />

      <Link
        to={home}
        className="pill"
        style={{ textDecoration: "none", display: "grid", placeItems: "center" }}
      >
        TAKE ME BACK
      </Link>
      <U2Mark />
    </div>
  );
}

/**
 * Catches a render crash so one broken screen doesn't blank the whole app.
 *
 * Written as a class because React has no hook equivalent — componentDidCatch
 * is the only way to stop an error propagating to the root.
 */
export class ScreenBoundary extends Component<
  { children: ReactNode; home?: string },
  { crashed: boolean }
> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Goes to the browser console in development and to whatever error
    // reporter is wired up in production. Never shown to the person.
    console.error("screen crashed", error, info.componentStack);
  }

  render() {
    if (!this.state.crashed) return this.props.children;

    return (
      <div className="screen">
        <Ticker static>SOMETHING JAMMED</Ticker>
        <div style={{ height: "var(--s-5)" }} />

        <Terminal>
          <LedWindow value="ERROR" small />
          <div style={{ height: "var(--s-4)" }} />
        </Terminal>

        <div className="stamp-wrap" style={{ marginTop: "var(--s-8)" }}>
          <Stamp loud>THIS SCREEN STOPPED WORKING</Stamp>
        </div>

        <div className="spacer" />

        <Pill onClick={() => this.setState({ crashed: false })}>TRY AGAIN</Pill>
        <Pill variant="ghost" onClick={() => window.location.assign(this.props.home ?? "/")}>
          START OVER
        </Pill>
      </div>
    );
  }
}
