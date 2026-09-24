import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type AuditEntry } from "../../lib/api";
import { Empty, ErrorState, LoadBar, Stamp, Tabs } from "../../components/primitives";
import { Ticker } from "../../components/terminal";

const FILTERS = [
  { value: "", label: "ALL" },
  { value: "order", label: "ORDERS" },
  { value: "product", label: "STOCK" },
  { value: "bundle", label: "BUNDLES" },
  { value: "gas_stock", label: "TANK" },
];

/**
 * The audit log.
 *
 * Reports used to share this screen as a tab, which buried the numbers a
 * manager checks daily behind something labelled LOG. They are their own
 * route now (Item 10); this is the trail.
 */
export default function Audit() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const loadSeq = useRef(0);

  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    setError(null);
    setEntries(null);
    api.admin.audit(filter || undefined)
      .then((r) => { if (seq === loadSeq.current) setEntries(r.entries); })
      .catch((e: ApiError) => { if (seq === loadSeq.current) setError(e.message); });
  }, [filter]);

  useEffect(load, [load]);

  if (error) return <div className="screen"><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div className="screen">
      <Ticker static>{entries ? `${entries.length} RECORDED` : "READING THE LOG"}</Ticker>

      <div style={{ height: "var(--s-5)" }} />
      <h1 className="screen-title">AUDIT LOG</h1>
      <div style={{ height: "var(--s-4)" }} />

      <Tabs label="Entity" value={filter} onChange={setFilter} options={FILTERS} />

      <div style={{ height: "var(--s-6)" }} />

      {!entries && (
        <div style={{ minHeight: 240, display: "grid", placeItems: "center" }}>
          <LoadBar label="READING THE LOG" />
        </div>
      )}

      {entries?.length === 0 && <Empty>NOTHING RECORDED YET</Empty>}

      {entries?.map((e) => (
        <div className="card" key={e.audit_id}>
          <div className="card-body">
            <p className="card-title">{e.action.replace(/[._]/g, " ").toUpperCase()}</p>
            <p className="card-sub">
              {e.actor?.display_name ?? "SYSTEM"}
              {e.actor?.role ? ` · ${e.actor.role.toUpperCase()}` : ""}
            </p>
            <p className="card-sub">{new Date(e.created_at).toLocaleString("en-GB")}</p>
            {e.note && <p className="card-sub">{e.note}</p>}
            {/* The correlation id from migration 0015 — what ties an entry to
                a Worker log line when chasing a customer report. */}
            {e.request_id && (
              <p className="card-sub" style={{ opacity: .7 }}>REQ {e.request_id}</p>
            )}
          </div>
          {/* The three an admin most needs to spot at a glance. */}
          {e.action.includes("override") && <Stamp>OVERRIDE</Stamp>}
          {e.action === "payment.orphaned" && <Stamp>REFUND</Stamp>}
          {e.action === "payment.amount_mismatch" && <Stamp>MISMATCH</Stamp>}
        </div>
      ))}

      <div className="spacer" />
    </div>
  );
}
