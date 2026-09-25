import { useEffect, useState } from "react";
import { api, ApiError, type StockEntry } from "../../lib/api";
import {
  BackButton, Empty, ErrorState, LoadBar, Stamp, Tabs,
} from "../../components/primitives";
import { Ticker } from "../../components/terminal";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/** `2026-03` -> `MAR 2026`, and anything else left as the server sent it. */
function label(value: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value.toUpperCase();
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * Stock history. Every entry that has moved the tank, newest first, because
 * the question this screen answers is "why is the number what it is" — which
 * needs the movements, not a single running total.
 *
 * It lived inside the tank screen behind a toggle that re-rendered a different
 * artboard in place, so the list had no URL of its own, could not be linked
 * to, and scrolled inside a drawing.
 */
export default function StockHistory() {
  const [month, setMonth] = useState("");
  const [entries, setEntries] = useState<StockEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const thisYear = new Date().getFullYear();

  useEffect(() => {
    setEntries(null);
    setError(null);
    api.admin.stockHistory(month || undefined)
      .then((r) => setEntries(r.entries))
      .catch((e: ApiError) => setError(e.message));
  }, [month]);

  const months = [
    { value: "", label: "ALL" },
    ...MONTHS.slice(0, new Date().getMonth() + 1).map((m, i) => ({
      value: `${thisYear}-${String(i + 1).padStart(2, "0")}`,
      label: m,
    })),
  ].reverse();

  return (
    <div className="screen">
      <BackButton to="/admin" label="BACK TO THE TANK" />

      <Ticker static>
        {entries ? `${entries.length} ${entries.length === 1 ? "ENTRY" : "ENTRIES"}` : "PULLING ENTRIES"}
      </Ticker>

      <div style={{ height: "var(--s-5)" }} />
      <h1 className="screen-title">STOCK HISTORY</h1>
      <div style={{ height: "var(--s-4)" }} />

      <Tabs
        label="Month"
        value={month}
        onChange={setMonth}
        options={months}
      />

      <div style={{ height: "var(--s-6)" }} />

      {error && <ErrorState message={error} onRetry={() => setMonth((m) => m)} />}

      {!error && !entries && (
        <div style={{ minHeight: 220, display: "grid", placeItems: "center" }}>
          <LoadBar label="PULLING ENTRIES" />
        </div>
      )}

      {entries && entries.length === 0 && (
        <Empty>{month ? `NOTHING MOVED IN ${label(month)}` : "NOTHING HAS MOVED YET"}</Empty>
      )}

      {entries?.map((e) => (
        <div className="card" key={e.entry_id}>
          <div className="card-body">
            <p className="card-title">
              {e.move === "addition" ? "+" : e.move === "removal" ? "−" : ""}
              {(e.amount_kg / 1000).toFixed(1)} TONS
            </p>
            <p className="card-sub">
              {new Date(e.entry_date).toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric",
              }).toUpperCase()}
              {e.admin?.display_name ? ` · ${e.admin.display_name}` : ""}
            </p>
            {e.note && <p className="card-sub">{e.note}</p>}
          </div>
        </div>
      ))}

      {entries && entries.length > 0 && month && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-6)" }}>
          <Stamp tone="ok">{label(month)}</Stamp>
        </div>
      )}

      <div className="spacer" />
    </div>
  );
}
