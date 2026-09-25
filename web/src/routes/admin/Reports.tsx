import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ReportSummary } from "../../lib/api";
import { ErrorState, LoadBar, Stamp, Tabs, money } from "../../components/primitives";
import { TankGauge } from "../../components/illustrated";
import { Ticker } from "../../components/terminal";

/**
 * Admin reports (Item 10). Previously a tab inside the audit screen, which
 * buried it — the numbers a manager checks daily should not live behind a
 * screen labelled LOG.
 *
 * The design has no charts anywhere, so this reuses the tank gauge's
 * fill-and-ruler language. A charting library would also cost more than the
 * entire initial JS budget.
 */
export default function Reports() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [flagged, setFlagged] = useState<{ refunds: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestSeq = useRef(0);

  const load = useCallback(() => {
    const seq = ++requestSeq.current;
    setError(null);
    setReport(null);
    setFlagged(null);
    api.admin.report(days)
      .then((value) => {
        if (seq === requestSeq.current) setReport(value);
      })
      .catch((e: ApiError) => {
        if (seq === requestSeq.current) setError(e.message);
      });

    // Refunds owed and failed drops belong next to revenue: they are the two
    // numbers that mean someone has to do something today.
    api.admin.flagged()
      .then((r) => {
        if (seq === requestSeq.current) {
          setFlagged({
            refunds: r.flagged.refunds_owed.length,
            failed: r.flagged.failed_deliveries.length,
          });
        }
      })
      .catch((e: ApiError) => {
        // The summary is still useful when the optional action queue fails,
        // but surface the failure rather than silently hiding it.
        if (seq === requestSeq.current) setError(e.message);
      });
  }, [days]);

  useEffect(load, [load]);

  if (error) return <div className="screen"><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div className="screen">
      <Ticker static>
        {report ? `${money(report.revenue_kobo)} IN ${days} DAYS` : "ADDING IT UP"}
      </Ticker>

      <div style={{ height: "var(--s-5)" }} />
      <h1 className="screen-title">REPORTS</h1>
      <div style={{ height: "var(--s-4)" }} />

      <Tabs
        label="Period"
        value={String(days)}
        onChange={(v) => setDays(Number(v))}
        options={[
          { value: "7", label: "WEEK" },
          { value: "30", label: "MONTH" },
          { value: "90", label: "QUARTER" },
        ]}
      />

      <div style={{ height: "var(--s-6)" }} />

      {!report && (
        <div style={{ minHeight: 260, display: "grid", placeItems: "center" }}>
          <LoadBar label="ADDING IT UP" />
        </div>
      )}

      {report && (
        <>
          <TankGauge
            availableKg={report.orders_fulfilled}
            totalKg={Math.max(report.orders_total, 1)}
            unit="DONE"
            labelLines={["ORDERS", "FULFILLED"]}
            ariaLabel={`${report.orders_fulfilled} of ${report.orders_total} orders fulfilled`}
            note={`${report.orders_fulfilled} OF ${report.orders_total} ORDERS FULFILLED`}
          />

          <div style={{ marginTop: "var(--s-8)" }}>
            <div className="row is-total"><span>REVENUE</span><b>{money(report.revenue_kobo)}</b></div>
            <div className="row"><span>GAS SOLD</span><b>{report.gas_sold_kg.toFixed(1)}KG</b></div>
            <div className="row"><span>EXPIRED HOLDS</span><b>{report.orders_expired}</b></div>
            <div className="row"><span>CANCELLED</span><b>{report.orders_cancelled}</b></div>
            <div className="row">
              <span>PICKUP SHARE</span><b>{Math.round(report.pickup_share * 100)}%</b>
            </div>
          </div>

          {flagged && (flagged.refunds > 0 || flagged.failed > 0) && (
            <div style={{ marginTop: "var(--s-6)" }}>
              <p className="label" style={{ textAlign: "left" }}>NEEDS SOMEONE</p>
              <div style={{ marginTop: "var(--s-3)" }}>
                {flagged.refunds > 0 && (
                  <div className="row"><span>REFUNDS PENDING</span><b>{flagged.refunds}</b></div>
                )}
                {flagged.failed > 0 && (
                  <div className="row"><span>FAILED DROPS</span><b>{flagged.failed}</b></div>
                )}
              </div>
            </div>
          )}

          <div style={{ marginTop: "var(--s-8)" }}>
            <p className="label" style={{ textAlign: "left" }}>HOW THEY PAID</p>
            <div style={{ marginTop: "var(--s-3)" }}>
              {Object.entries(report.revenue_by_method ?? {}).map(([method, kobo]) => (
                <div className="row" key={method}>
                  <span>{method.replace(/_/g, " ").toUpperCase()}</span>
                  <b>{money(Number(kobo))}</b>
                </div>
              ))}
            </div>
          </div>

          {report.orders_total > 0 &&
           report.orders_expired / report.orders_total > 0.15 && (
            <div className="stamp-wrap" style={{ marginTop: "var(--s-6)" }}>
              <Stamp>
                {Math.round((report.orders_expired / report.orders_total) * 100)}% EXPIRE
                — THE HOLD MAY BE TOO SHORT
              </Stamp>
            </div>
          )}
        </>
      )}

      <div className="spacer" />
    </div>
  );
}
