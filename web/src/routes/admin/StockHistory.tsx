import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type StockEntry } from "../../lib/api";
import { BackButton, LoadBar, Tabs } from "../../components/primitives";
import { Ticker } from "../../components/terminal";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/** `2026-03` -> `MAR 2026`, and anything else left as the server sent it. */
function label(value: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value.toUpperCase();
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * Stock history (1:2847 GAS HISTORY).
 *
 * The board draws three movement rows and no month control, so the three rows
 * are the newest entries and the month filter stays app chrome below the
 * drawing. Rows carry no node ids and repeat samples, so they are bound by
 * their exact drawn strings.
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

  const months = [
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

  // Drawn samples, in document order, paired with the tail sample. Each row is
  // one text node holding the head, a `<br>`, then the tail, so two keys per
  // row keep the file's own `<br>` instead of a replacement carrying markup.
  const samples: [string, string][] = [
    ["+2 TONS", "17 MAR \u00b7 SMITH"],
    ["\u22120.86 TONS", "16 MAR \u00b7 sold"],
    ["RATE \u20a61,400/KG", "16 MAR \u00b7 SMITH"],
  ];
  const textReplacements: Record<string, string | string[]> = {};
  entries.slice(0, 3).forEach((e, i) => {
    const day = new Date(e.entry_date)
      .toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      .toUpperCase();
    const who = (e.admin?.display_name ?? "STAFF").toUpperCase();
    const head = e.move === "removal"
      ? `\u2212${(e.amount_kg / 1000).toFixed(2)} TONS`
      : `+${(e.amount_kg / 1000).toFixed(2)} TONS`;
    textReplacements[samples[i][0]] = head;
    textReplacements[samples[i][1]] = `${day} \u00b7 ${who}`;
  });

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:2847" textReplacements={textReplacements}>
        <BackButton to="/admin/tank" />
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

      <div style={{ marginTop: 18 }}>
        <Ticker static>
          {entries.length} {entries.length === 1 ? "ENTRY" : "ENTRIES"}
          {month ? ` IN ${label(month)}` : ""}
        </Ticker>
        <Tabs label="Month" value={month} onChange={setMonth} options={months} />
      </div>
    </div>
  );
}

