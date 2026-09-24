import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { Empty, LoadBar, Pill, Stamp, money } from "../../components/primitives";
import { Keypad, LedWindow, Terminal } from "../../components/terminal";

/**
 * Order lookup. The keypad doubles as a search pad — the cashier is already
 * holding this machine, so a separate search bar would be a second thing to
 * learn for no gain.
 */
export default function Lookup() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

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

  return (
    <div className="screen">
      <Terminal metal caption="ORDER NUMBER OR PHONE">
        <LedWindow value={term || "—"} small />
        <Keypad
          onDigit={(d) => setTerm((t) => (t.length < 15 ? t + d : t))}
          onClear={() => setTerm((t) => t.slice(0, -1))}
          onSubmit={() => void search()}
          submitDisabled={term.trim().length < 3 || searching}
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
                {o.guest_name ?? "CUSTOMER"} · {money(o.total_kobo)}
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
