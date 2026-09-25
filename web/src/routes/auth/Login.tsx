import { useState, type MouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { safeNext, signInWithEmail, signInWithProvider, mockLanding } from "../../lib/auth";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import { BackButton } from "../../components/primitives";

/** Login uses the exact Figma LOG IN 2 artboard; only live input/interaction is overlaid. */
export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const trimmed = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError("THAT DOESN'T LOOK LIKE AN EMAIL");
      return;
    }
    setBusy(true); setError(null);
    const { error: authError } = await signInWithEmail(trimmed, next ?? undefined);
    setBusy(false);
    if (authError) { setError("WE COULDN'T SEND THAT — TRY AGAIN"); return; }
    nav(`/auth/sent?email=${encodeURIComponent(trimmed)}`);
  }

  async function provider(which: "google" | "apple") {
    setBusy(true); setError(null);
    const { error: authError } = await signInWithProvider(which, next ?? undefined);
    if (authError) { setBusy(false); setError("WE COULDN'T OPEN THAT — TRY AGAIN"); return; }
    nav(mockLanding(next), { replace: true });
  }

  function click(e: MouseEvent<HTMLDivElement>) {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-node]")?.dataset.node;
    if (id === "1:1341") void send();
    if (id === "1:1330") void provider("google");
    if (id === "1:1332") void provider("apple");
  }

  return (
    <div className="screen figma-route-scroll" style={{ paddingTop: 0 }}>
      <FigmaRouteFrame
        node="1:1281"
        values={{ "1:1329": email || "EXAMPLE@GMAIL.COM", "1:1342": busy ? "SENDING" : "CONTINUE" }}
        onClick={click}
      >
        <BackButton to="/" label="BACK" />
        <input
          className="figma-route-input"
          aria-label="Email address"
          type="email"
          autoComplete="email"
          value={email}
          disabled={busy}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
          style={{ left: 48, top: 441, width: 344, height: 54, opacity: 0, cursor: "text" }}
        />
        {error && (
          <div style={{ position: "absolute", left: 48, top: 510, width: 344, zIndex: 30, textAlign: "center", color: "#f30b0b", fontSize: 13, lineHeight: 1.3 }}>
            {error}
          </div>
        )}
        {busy && (
          <div style={{ position: "absolute", left: 48, top: 512, width: 344, zIndex: 30, textAlign: "center", color: "#1317e4", fontSize: 12 }}>
            CHECKING YOUR EMAIL…
          </div>
        )}
      </FigmaRouteFrame>
    </div>
  );
}
