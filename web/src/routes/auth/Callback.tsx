import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { safeNext, supabase, useAuth } from "../../lib/auth";
import { LoadBar, Pill, Stamp } from "../../components/primitives";
import { LedWindow, Terminal, Ticker } from "../../components/terminal";

type State = "working" | "expired" | "failed";

/**
 * Where the magic link and the OAuth providers land.
 *
 * Supabase parses the token out of the URL fragment itself, so the job here is
 * to wait for the session, then send the person to their own app root — or to
 * the deep link they were originally after, if it passed validation.
 */
export default function Callback() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { session, loading, home } = useAuth();
  const [state, setState] = useState<State>("working");

  const next = safeNext(params.get("next"));

  useEffect(() => {
    // Supabase puts link errors in the fragment, not the query string.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const err = hash.get("error_code") ?? params.get("error_code");

    if (err) {
      setState(err.includes("expired") ? "expired" : "failed");
      return;
    }

    if (loading) return;

    if (session) { nav(next ?? home, { replace: true }); return; }

    // No session and no error means the link was already consumed elsewhere.
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) nav(next ?? home, { replace: true });
      else setState("expired");
    }, 1500);

    return () => clearTimeout(t);
  }, [loading, session, home, next, nav, params]);

  if (state === "working") {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="LETTING YOU IN" />
      </div>
    );
  }

  return (
    <div className="screen">
      <Ticker static>{state === "expired" ? "LINK EXPIRED" : "LINK DIDN'T WORK"}</Ticker>
      <div style={{ height: "var(--s-4)" }} />

      <Terminal>
        <LedWindow value={state === "expired" ? "EXPIRED" : "FAILED"} small />
        <div style={{ height: "var(--s-4)" }} />
      </Terminal>

      <div className="stamp-wrap" style={{ marginTop: "var(--s-8)" }}>
        <Stamp loud>
          {state === "expired" ? "THAT LINK HAS RUN OUT" : "WE COULDN'T USE THAT LINK"}
        </Stamp>
      </div>

      <div style={{ marginTop: "var(--s-8)" }}>
        <Pill onClick={() => nav("/auth/login")}>SEND A NEW LINK</Pill>
      </div>

      <div className="spacer" />
    </div>
  );
}
