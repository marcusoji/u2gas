import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { signInWithEmail } from "../../lib/auth";
import { Pill, Stamp, U2Mark } from "../../components/primitives";
import { LedWindow, Terminal, Ticker } from "../../components/terminal";

const COOLDOWN = 60;

/**
 * "Check your mail." The prototype had no screen between submitting an email
 * and being logged in, which left people staring at a dead form.
 */
export default function VerifySent() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";

  const [left, setLeft] = useState(COOLDOWN);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);

  async function resend() {
    if (left > 0 || !email) return;
    setSending(true);
    const { error } = await signInWithEmail(email);
    setSending(false);
    setNote(error ? "WE COULDN'T SEND THAT" : "SENT AGAIN");
    setLeft(COOLDOWN);
  }

  return (
    <div className="screen">
      <Ticker static>
        {left > 0 ? `YOU CAN ASK AGAIN IN ${left}S` : "READY TO SEND ANOTHER"}
      </Ticker>

      <div style={{ height: "var(--s-4)" }} />

      <Terminal>
        <LedWindow value="CHECK YOUR MAIL" small />
        <div style={{ height: "var(--s-4)" }} />
      </Terminal>

      <div className="center" style={{ marginTop: "var(--s-8)" }}>
        <p className="label">WE SENT A LINK TO</p>
        <p style={{ color: "var(--blue)", fontSize: "var(--t-body)", marginTop: "var(--s-2)" }}>
          {email.toUpperCase()}
        </p>
        <p className="label" style={{ marginTop: "var(--s-5)", lineHeight: 2 }}>
          OPEN IT ON THIS DEVICE<br />AND YOU'RE IN
        </p>
      </div>

      {note && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp tone={note === "SENT AGAIN" ? "ok" : "danger"}>{note}</Stamp>
        </div>
      )}

      <div style={{ marginTop: "var(--s-8)" }}>
        <Pill variant="ghost" onClick={resend} disabled={left > 0 || sending}>
          {left > 0 ? `RESEND IN ${left}S` : sending ? "SENDING" : "RESEND"}
        </Pill>
      </div>

      <div className="spacer" />
      <Link to="/auth/login" style={{
        display: "block", textAlign: "center", color: "var(--blue-faint)",
        textDecoration: "none", padding: "var(--s-5) 0",
      }}>
        USE A DIFFERENT ADDRESS
      </Link>
      <U2Mark />
    </div>
  );
}
