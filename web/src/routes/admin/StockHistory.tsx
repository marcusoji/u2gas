import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type StockEntry } from "../../lib/api";
import { BackButton, LoadBar, Tabs } from "../../components/primitives";
import { Ticker } from "../../components/terminal";
import { HistoryMonthChip } from "../../components/HistoryReceipt";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import * as A from "../../figma/assets";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/** `2026-03` -> `MAR 2026`, and anything else left as the server sent it. */
function label(value: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value.toUpperCase();
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** The drawing writes the day as `23rd` / `30th` — ordinal, lower-case suffix. */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Stock history (1:2847 GAS HISTORY).
 *
 * The re-issued file overlays a history panel on the blurred tank: the panel,
 * the HISTORY ADDITION/REMOVAL legend and the two sample cards it draws. The
 * cards carry the file's example movements and the month strip its sample
 * months, so the route hides both and paints the depot's real entries at the
 * same coordinates — the same row template the drawing reserves. The legend,
 * the heading and the blurred tank stay exactly as drawn.
 */
export default function StockHistory() {
  const nav = useNavigate();
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

  // Only months the depot actually moved gas in. The drawing's strip is a fixed
  // sample; showing twelve tabs when eleven are empty is noise.
  const months = useMemo(() => {
    if (!entries) return [];
    const seen = new Map<string, string>();
    for (const e of entries) {
      const d = new Date(e.entry_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      seen.set(key, MONTHS[d.getMonth()]);
    }
    return [...seen.entries()].map(([value, l]) => ({ value, label: l }));
  }, [entries]);

  const tabs = [
    { value: "", label: "ALL" },
    ...MONTHS.slice(0, new Date().getMonth() + 1).map((m, i) => ({
      value: `${thisYear}-${String(i + 1).padStart(2, "0")}`,
      label: m,
    })),
  ].reverse();

  if (error) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <div className="stamp-wrap"><div className="stamp">{error}</div></div>
      </div>
    );
  }

  if (!entries) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="PULLING ENTRIES" />
      </div>
    );
  }

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:2847" className="is-gas-history" after={
        <>
          <Ticker static>
            {entries.length} {entries.length === 1 ? "ENTRY" : "ENTRIES"}
            {month ? ` IN ${label(month)}` : ""}
          </Ticker>
          <Tabs label="Month" value={month} onChange={setMonth} options={tabs} rail />
        </>
      }>
        <BackButton to="/admin/tank" />

        {/* The drawn strip is the file's sample months; the depot's own months
            take its place at the same coordinates and chip design. */}
        <div className="gas-history-months">
          {months.map((m) => (
            <HistoryMonthChip
              key={m.value}
              label={m.label}
              active={month === m.value}
              onClick={() => setMonth(month === m.value ? "" : m.value)}
            />
          ))}
        </div>

        <div className="gas-history-rail">
          {entries.length === 0 && (
            <p className="gas-history-empty">NOTHING MOVED YET</p>
          )}
          {entries.map((e) => {
            // The drawing writes whole tons bare (`2 TONS`) and keeps the
            // fraction only when there is one (`0.86 TONS`).
            const tons = Number((e.amount_kg / 1000).toFixed(2));
            const who = (e.admin?.display_name ?? "STAFF").toUpperCase();
            return (
              <div className="gas-history-card" key={e.entry_id}>
                <p className="gas-history-day">{ordinal(new Date(e.entry_date).getDate())}</p>
                <p className="gas-history-note">
                  {tons} TONS -{" "}
                  {e.move === "removal" ? "REMOVED BY" : "ADDED BY"} <u>{who}</u>
                </p>
                <span className="gas-history-qr" aria-hidden="true"
                      style={{ backgroundImage: `url('${A.a12}')` }} />
              </div>
            );
          })}
        </div>

        <button className="figma-route-interactive" aria-label="Update stock"
          onClick={() => nav("/admin/tank/update")}
          style={{ left: 35, top: 656, width: 176, height: 70 }} />
        <button className="figma-route-interactive" aria-label="Tank level"
          onClick={() => nav("/admin/tank")}
          style={{ left: 223, top: 656, width: 181, height: 70 }} />
        <button className="figma-route-interactive" aria-label="Notifications"
          onClick={() => nav("/admin/notifs")}
          style={{ left: 362, top: 63, width: 50, height: 56 }} />
      </FigmaRouteFrame>
    </div>
  );
}

