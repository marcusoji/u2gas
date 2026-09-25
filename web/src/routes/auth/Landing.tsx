import { useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithProvider, mockLanding } from "../../lib/auth";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import { Stamp } from "../../components/primitives";

/**
 * The first screen.
 *
 * figma 1:1219 LOG IN 1 — the file's own entry frame, with the wordmark, the
 * email pill and the two provider buttons. It is the front door rather than
 * the terminal: someone arriving at u2gas.ng has no order in progress, so
 * opening on a keypad asked them to type a quantity before the app had said
 * what it was.
 *
 * Three ways out, matching the three things the frame draws: the email pill
 * goes to LOG IN 2 (1:1281) for the address, the provider buttons start OAuth,
 * and a guest can go straight to the terminal. Guest checkout stays first-class
 * — a depot queue is exactly where someone will not stop to make an account.
 */
export default function Landing() {
  const nav = useNavigate();
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function provider(which: "google" | "apple") {
    setBusy(which);
    setError(null);
    const { error: authError } = await signInWithProvider(which);
    if (authError) { setBusy(null); setError("THAT DIDN'T WORK — TRY AGAIN"); return; }
    // Demo mode resolves synchronously above; land the way /auth/callback does.
    nav(mockLanding(), { replace: true });
  }

  function click(e: MouseEvent<HTMLDivElement>) {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-node]")?.dataset.node;
    if (id === "1:1271") nav("/auth/login");
    if (id === "1:1267") void provider("google");
    if (id === "1:1269") void provider("apple");
  }

  return (
    <div className="screen figma-route-scroll" style={{ paddingTop: 0 }}>
      <FigmaRouteFrame node="1:1219" onClick={click}>
        {/* The three drawn targets, sized from the frame's own boxes. */}
        <button className="figma-hit" aria-label="Log in" onClick={() => nav("/auth/login")}
                style={{ left: 74, top: 451, width: 292, height: 60, borderRadius: 64 }} />
        <button className="figma-hit" aria-label="Continue with Google"
                disabled={busy !== null} onClick={() => void provider("google")}
                style={{ left: 150, top: 614, width: 62, height: 60, borderRadius: 8 }} />
        <button className="figma-hit" aria-label="Continue with Apple"
                disabled={busy !== null} onClick={() => void provider("apple")}
                style={{ left: 228, top: 614, width: 62, height: 60, borderRadius: 8 }} />
        {busy && (
          <div style={{ position: "absolute", left: 48, top: 690, width: 344, zIndex: 30,
                        textAlign: "center", color: "#1317e4", fontSize: 12 }}>
            {busy === "google" ? "OPENING GOOGLE…" : "OPENING APPLE…"}
          </div>
        )}
      </FigmaRouteFrame>

      {error && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp>{error}</Stamp>
        </div>
      )}

      {/* Guest checkout. The frame has no room for it — it draws three actions
          and this is a fourth — so it sits under the artboard rather than
          being painted over it. */}
      <div style={{ width: 440, maxWidth: "100%", marginTop: "var(--s-5)" }}>
        <Link to="/home" className="pill is-ghost" style={{
          textDecoration: "none", display: "grid", placeItems: "center",
          width: "100%", maxWidth: 344, margin: "0 auto",
        }}>
          CONTINUE WITHOUT AN ACCOUNT
        </Link>
      </div>
    </div>
  );
}
