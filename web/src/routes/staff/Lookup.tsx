import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { Empty, Input, LoadBar, OptionalBack, Pill, Stamp, money } from "../../components/primitives";
import { Keypad, LedWindow, Terminal } from "../../components/terminal";

/**
 * Order lookup. The keypad doubles as a search pad — the cashier is already
 * holding this machine, so a separate search bar would be a second thing to
 * learn for no gain.
 *
 * The last key says FIND, not PAY. This is not a till and the action is a
 * search; the key's size and position are the drawing's.
 */
export default function Lookup() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(false);
  const manualRef = useRef<HTMLInputElement>(null);

  async function search(q = term) {
    if (q.trim().length < 3) {
      setError("ENTER AT LEAST THREE CHARACTERS");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const r = await api.staff.lookup(q.trim());
      setResults(r.results);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setSearching(false);
    }
  }

  // Arriving from a flagged scan with the order number already in hand.
  useEffect(() => {
    const q = params.get("q");
    if (q) void search(q);
  }, []);

  // The hand opens a real text field, for a phone number copied off a
  // customer's screen — typing fifteen digits on the keypad is the slow way.
  useEffect(() => {
    if (manual) manualRef.current?.focus();
  }, [manual]);

  return (
    <div className="screen">
      <OptionalBack to="/staff" />
      <Terminal metal caption="ORDER NUMBER OR PHONE">
        <LedWindow value={term || "—"} small />
        {manual && (
          <div className="stack is-tight" style={{ marginTop: "var(--s-4)" }}>
            <Input
              ref={manualRef}
              inputMode="text"
              placeholder="TYPE IT IN"
              value={term}
              onChange={(e) => setTerm(e.target.value.slice(0, 15))}
              onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            />
            <p className="label" style={{ textAlign: "left" }}>
              PRESS ENTER OR FIND WHEN IT IS RIGHT
            </p>
          </div>
        )}
        <Keypad
          onDigit={(d) => setTerm((t) => (t.length < 15 ? t + d : t))}
          onClear={() => setTerm((t) => t.slice(0, -1))}
          onSubmit={() => void search()}
          submitLabel="FIND"
          submitDisabled={term.trim().length < 3 || searching}
          onManual={() => setManual((v) => !v)}
        />
      </Terminal>

      {error && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp>{error}</Stamp>
        </div>
      )}

      {searching && (
        <div style={{ marginTop: "var(--s-6)" }}><LoadBar label="LOOKING" /></div>
      )}

      {results && results.length === 0 && !searching && <Empty>NO SUCH ORDER</Empty>}

      <div style={{ marginTop: "var(--s-5)" }}>
        {results?.map((o) => (
          <button key={o.order_id} className="card"
                  onClick={() => nav(`/staff/collect/${o.order_id}`)}>
            <div className="card-body">
              <p className="card-title">{o.order_number}</p>
              <p className="card-sub">
                {o.profile?.display_name ?? o.guest_name ?? "CUSTOMER"} · {money(o.total_kobo)}
              </p>
              <p className="card-sub">
                {o.status.toUpperCase()} · {o.payment_status.toUpperCase()}
              </p>
            </div>
            <span className="card-go" aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="spacer" />
      <Pill variant="ghost" onClick={() => { setTerm(""); setResults(null); setError(null); }}>
        CLEAR
      </Pill>
    </div>
  );
}
