import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type ReportSummary } from "../../lib/api";
import { ErrorState, LoadBar, OptionalBack, Pill, Stamp, Tabs, money } from "../../components/primitives";
import { TankGauge } from "../../components/illustrated";
import { Ticker } from "../../components/terminal";

/**
 * Admin reports.
 *
 * Three loose rows under one gauge was "tank enough" that a manager had to read
 * every line to find the two figures that need a person today. The numbers are
 * grouped now — today's problems, what came in, how it was paid, what it was —
 * each with the change against the period before it, because a figure with no
 * comparison is a figure nobody can act on.
 *
 * The design has no charts anywhere, so the trend reuses the tank gauge's
 * fill-and-ruler language rather than pulling in a charting library that would
 * cost more than the entire initial JS budget.
 */

/** Change against the previous period, as a signed percentage. */
function delta(current: number, previous: number | undefined): { label: string; up: boolean } | null {
  if (previous === undefined) return null;
  if (previous === 0) return current === 0 ? null : { label: "NEW", up: true };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { label: "LEVEL", up: true };
  return { label: `${pct > 0 ? "+" : ""}${pct}%`, up: pct > 0 };
}

/** The periods a manager actually files, named for the printed sheet. */
const PERIOD_NAME: Record<number, string> = {
  1: "DAILY",
  7: "WEEKLY",
  30: "MONTHLY",
  90: "QUARTERLY",
};

const periodWindow = (days: number) => {
  const end = new Date();
  const start = new Date(end.getTime() - days * 864e5);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
  return { start: fmt(start), end: fmt(end) };
};

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

  /**
   * The printed sheet is a separate DOM tree from the screen. The screen is a
   * dashboard — gauges, trend bars, tap targets — none of which survives paper.
   * Printing it would give a manager a page of empty boxes and a chart they
   * cannot read, so a plain table is rendered for the printer only and the
   * screen is hidden for that one moment.
   */
  const printReport = useCallback(() => {
    if (!report) return;
    window.print();
  }, [report]);

  if (error) return <div className="screen"><ErrorState message={error} onRetry={load} /></div>;

  const outstanding = (flagged?.refunds ?? 0) + (flagged?.failed ?? 0);
  const expireShare = report && report.orders_total > 0
    ? report.orders_expired / report.orders_total
    : 0;
  const fulfilmentShare = report && report.orders_total > 0
    ? report.orders_fulfilled / report.orders_total
    : 0;
  const byMethod = Object.entries(report?.revenue_by_method ?? {})
    .map(([method, kobo]) => [method, Number(kobo)] as const)
    .sort((a, b) => b[1] - a[1]);
  const methodPeak = Math.max(1, ...byMethod.map(([, kobo]) => kobo));
  const revenueDelta = report ? delta(report.revenue_kobo, report.previous?.revenue_kobo) : null;
  const gasDelta = report ? delta(report.gas_sold_kg, report.previous?.gas_sold_kg) : null;
  const ordersDelta = report ? delta(report.orders_fulfilled, report.previous?.orders_fulfilled) : null;
  const average = report && report.orders_fulfilled > 0
    ? Math.round(report.revenue_kobo / report.orders_fulfilled)
    : 0;
  const trend = report?.revenue_by_day ?? [];
  const trendPeak = Math.max(1, ...trend.map((d) => d.revenue_kobo));
  const best = trend.reduce(
    (top, d) => (d.revenue_kobo > top.revenue_kobo ? d : top),
    { date: "", revenue_kobo: 0, orders: 0 },
  );

  const reportWindow = periodWindow(days);
  const printed = new Date().toLocaleString("en-NG", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="screen report-screen">
      <OptionalBack to="/admin" />
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
          { value: "1", label: "TODAY" },
          { value: "7", label: "WEEK" },
          { value: "30", label: "MONTH" },
          { value: "90", label: "QUARTER" },
        ]}
      />

      <div style={{ height: "var(--s-5)" }} />

      {/* Printing is the reason the daily period exists: a manager signs off a
          day, files a week, or sends a month to the accountant. The button is
          inert until the figures are in, so a half-loaded report is never what
          comes out of the printer. */}
      <div className="report-actions-row">
        <Pill
          onClick={printReport}
          disabled={!report}
        >
          PRINT {PERIOD_NAME[days] ?? `${days} DAYS`}
        </Pill>
      </div>

      <div style={{ height: "var(--s-6)" }} />

      {!report && (
        <div style={{ minHeight: 260, display: "grid", placeItems: "center" }}>
          <LoadBar label="ADDING IT UP" />
        </div>
      )}

      {report && (
        <>
          {/* The four figures a manager reads first, before the detail. Each
              carries its change against the period before it — a number with
              no comparison is a number nobody can act on. */}
          <div className="report-hero">
            <div className="report-hero-main">
              <p className="report-hero-label">REVENUE</p>
              <p className="report-hero-value">{money(report.revenue_kobo)}</p>
              {revenueDelta && (
                <p className={`report-delta${revenueDelta.up ? " is-up" : " is-down"}`}>
                  {revenueDelta.label} VS PREVIOUS {days} DAYS
                </p>
              )}
            </div>
            <dl className="report-hero-side">
              <div>
                <dt>AVERAGE ORDER</dt>
                <dd>{money(average)}</dd>
              </div>
              <div>
                <dt>GAS SOLD</dt>
                <dd>{report.gas_sold_kg.toFixed(1)}<small>KG</small></dd>
              </div>
            </dl>
          </div>

          <div className="report-strip">
            <div className="report-strip-cell">
              <span>ORDERS</span>
              <b>{report.orders_total}</b>
              <em>{report.orders_fulfilled} FULFILLED</em>
            </div>
            <div className="report-strip-cell">
              <span>FULFILMENT</span>
              <b>{ordersDelta?.label ?? "—"}</b>
              <em>VS LAST {days} DAYS</em>
            </div>
            <div className="report-strip-cell">
              <span>GAS SOLD</span>
              <b>{gasDelta?.label ?? "—"}</b>
              <em>VS LAST {days} DAYS</em>
            </div>
          </div>

          {/* Today's problems first. These are the only figures on the screen
              that mean somebody has to act, so they sit at the top rather than
              after the revenue, and each opens the queue that resolves it. */}
          {flagged && (
            <section className="report-section">
              <h2>NEEDS SOMEONE TODAY</h2>
              <div className="report-actions">
                <Link className={`report-action${flagged.refunds > 0 ? " is-urgent" : ""}`} to="/admin/orders">
                  <span>REFUNDS PENDING</span>
                  <b>{flagged.refunds}</b>
                  <i>{flagged.refunds > 0 ? "OPEN THE QUEUE" : "NONE OWED"}</i>
                </Link>
                <Link className={`report-action${flagged.failed > 0 ? " is-urgent" : ""}`} to="/admin/orders">
                  <span>FAILED DROPS</span>
                  <b>{flagged.failed}</b>
                  <i>{flagged.failed > 0 ? "REASSIGN A DRIVER" : "ALL CLEAR"}</i>
                </Link>
              </div>
              {outstanding === 0 && (
                <p className="label" style={{ textAlign: "left", marginTop: "var(--s-3)" }}>
                  NOTHING IS WAITING ON ANYONE
                </p>
              )}
            </section>
          )}

          {/* The trend, drawn with the gauge's own language: one bar per day,
              the busiest day labelled so the shape has a scale. A quarter is 90
              bars, which cannot fit 334px at any readable width — past a month
              the rail scrolls sideways instead of shrinking the bars into a
              smear or pushing the page wider than the screen. */}
          {trend.length > 1 && (
            <section className="report-section">
              <h2>DAY BY DAY</h2>
              <div className={trend.length > 31 ? "h-rail-wrap" : undefined}>
                <div
                  className={`report-trend${trend.length > 31 ? " is-dense h-rail" : ""}`}
                  role="img"
                  aria-label={`Daily revenue for the last ${days} days`}
                >
                  {trend.map((d) => (
                    <i
                      key={d.date}
                      className={d.revenue_kobo > 0 ? "has-value" : ""}
                      style={{ height: `${Math.max(2, (d.revenue_kobo / trendPeak) * 100)}%` }}
                      title={`${d.date} · ${money(d.revenue_kobo)} · ${d.orders} orders`}
                    />
                  ))}
                </div>
              </div>
              <p className="report-trend-note">
                <span>{trend[0]?.date}</span>
                {best.revenue_kobo > 0 && <span>BEST {best.date} · {money(best.revenue_kobo)}</span>}
                <span>{trend[trend.length - 1]?.date}</span>
              </p>
            </section>
          )}

          <section className="report-section">
            <h2>WHAT CAME IN</h2>
            <TankGauge
              availableKg={report.orders_fulfilled}
              totalKg={Math.max(report.orders_total, 1)}
              unit="DONE"
              labelLines={["ORDERS", "FULFILLED"]}
              ariaLabel={`${report.orders_fulfilled} of ${report.orders_total} orders fulfilled`}
              note={`${report.orders_fulfilled} OF ${report.orders_total} ORDERS FULFILLED`}
            />

            <dl className="report-grid" style={{ marginTop: "var(--s-5)" }}>
              <div className="report-cell">
                <dt>PICKUP SHARE</dt>
                <dd>{Math.round(report.pickup_share * 100)}<small style={{ fontSize: 14 }}>%</small></dd>
              </div>
              <div className="report-cell">
                <dt>CANCELLED</dt>
                <dd>{report.orders_cancelled}</dd>
              </div>
              <div className={`report-cell${expireShare > 0.15 ? " is-accent" : ""}`}>
                <dt>EXPIRED HOLDS</dt>
                <dd>{report.orders_expired}</dd>
              </div>
              <div className="report-cell">
                <dt>LOST TO EXPIRY</dt>
                <dd>{Math.round(expireShare * 100)}<small style={{ fontSize: 14 }}>%</small></dd>
              </div>
            </dl>
          </section>

          {byMethod.length > 0 && (
            <section className="report-section">
              <h2>HOW THEY PAID</h2>
              <div className="report-bars">
                {byMethod.map(([method, kobo]) => (
                  <div className="report-bar" key={method}>
                    <span>{method.replace(/_/g, " ").toUpperCase()}</span>
                    <i
                      style={{ width: `${Math.max(2, (kobo / methodPeak) * 100)}%` }}
                      role="presentation"
                    />
                    <em>{money(kobo)}</em>
                  </div>
                ))}
              </div>
            </section>
          )}

          {report.orders_by_type && (
            <section className="report-section">
              <h2>WHAT THEY BOUGHT</h2>
              <div className="report-bars">
                {(["gas", "accessory", "mixed"] as const).map((kind) => {
                  const n = report.orders_by_type![kind];
                  const peak = Math.max(1, ...Object.values(report.orders_by_type!));
                  return (
                    <div className="report-bar" key={kind}>
                      <span>{kind.toUpperCase()}</span>
                      <i style={{ width: `${Math.max(2, (n / peak) * 100)}%` }} role="presentation" />
                      <em>{n} {n === 1 ? "ORDER" : "ORDERS"}</em>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {expireShare > 0.15 && (
            <div className="stamp-wrap" style={{ marginTop: "var(--s-6)" }}>
              <Stamp>
                {Math.round(expireShare * 100)}% EXPIRE
                — THE HOLD MAY BE TOO SHORT
              </Stamp>
            </div>
          )}
        </>
      )}

      <div className="spacer" />

      {/* Printer only — see printReport. Hidden on screen by CSS, and the whole
          interactive screen is hidden in its place. It is laid out as a
          document a depot signs off: masthead, the figures read first, the
          breakdowns, the day book, and a signature block. */}
      {report && (
        <section className="report-print" aria-hidden="true">
          <header className="report-print-head">
            <div className="report-print-brand">
              <span className="report-print-mark" aria-hidden="true">U2</span>
              <div>
                <h1>U2 OIL AND GAS LTD.</h1>
                <p>DEPOT PERFORMANCE REPORT</p>
              </div>
            </div>
            <table className="report-print-meta">
              <tbody>
                <tr><th>PERIOD</th><td>{PERIOD_NAME[days] ?? `${days} DAYS`}</td></tr>
                <tr><th>FROM</th><td>{reportWindow.start}</td></tr>
                <tr><th>TO</th><td>{reportWindow.end}</td></tr>
                <tr><th>PRINTED</th><td>{printed}</td></tr>
              </tbody>
            </table>
          </header>

          <div className="report-print-kpis">
            <div>
              <span>REVENUE</span>
              <b>{money(report.revenue_kobo)}</b>
              <em>{revenueDelta?.label ?? "NO COMPARISON"} VS PREVIOUS {days} DAYS</em>
            </div>
            <div>
              <span>GAS SOLD</span>
              <b>{report.gas_sold_kg.toFixed(1)} KG</b>
              <em>{gasDelta?.label ?? "NO COMPARISON"} VS PREVIOUS {days} DAYS</em>
            </div>
            <div>
              <span>ORDERS</span>
              <b>{report.orders_total}</b>
              <em>{report.orders_fulfilled} FULFILLED</em>
            </div>
            <div>
              <span>AVERAGE ORDER</span>
              <b>{money(average)}</b>
              <em>PER FULFILLED ORDER</em>
            </div>
          </div>

          <h2>1 · HEADLINE FIGURES</h2>
          <table className="report-print-table">
            <tbody>
              <tr><th>REVENUE</th><td>{money(report.revenue_kobo)}</td><td>{revenueDelta?.label ?? "—"}</td></tr>
              <tr><th>AVERAGE ORDER</th><td>{money(average)}</td><td>—</td></tr>
              <tr><th>GAS SOLD</th><td>{report.gas_sold_kg.toFixed(1)} KG</td><td>{gasDelta?.label ?? "—"}</td></tr>
              <tr><th>ORDERS</th><td>{report.orders_total}</td><td>—</td></tr>
              <tr><th>ORDERS FULFILLED</th><td>{report.orders_fulfilled}</td><td>{ordersDelta?.label ?? "—"}</td></tr>
            </tbody>
          </table>

          <h2>2 · ORDER OUTCOMES</h2>
          <table className="report-print-table">
            <tbody>
              <tr><th>FULFILMENT RATE</th><td>{Math.round(fulfilmentShare * 100)}%</td></tr>
              <tr><th>CANCELLED</th><td>{report.orders_cancelled}</td></tr>
              <tr><th>EXPIRED HOLDS</th><td>{report.orders_expired}</td></tr>
              <tr><th>LOST TO EXPIRY</th><td>{Math.round(expireShare * 100)}%</td></tr>
              <tr><th>PICKUP SHARE</th><td>{Math.round(report.pickup_share * 100)}%</td></tr>
            </tbody>
          </table>

          {byMethod.length > 0 && (
            <>
              <h2>3 · PAYMENTS BY METHOD</h2>
              <table className="report-print-table">
                <thead>
                  <tr><th>METHOD</th><th>REVENUE</th><th>SHARE</th></tr>
                </thead>
                <tbody>
                  {byMethod.map(([method, kobo]) => (
                    <tr key={method}>
                      <th>{method.replace(/_/g, " ").toUpperCase()}</th>
                      <td>{money(kobo)}</td>
                      <td>{report.revenue_kobo > 0 ? Math.round((kobo / report.revenue_kobo) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>TOTAL</th>
                    <td>{money(report.revenue_kobo)}</td>
                    <td>100%</td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}

          {report.orders_by_type && (
            <>
              <h2>4 · WHAT WAS BOUGHT</h2>
              <table className="report-print-table">
                <thead>
                  <tr><th>TYPE</th><th>ORDERS</th><th>SHARE</th></tr>
                </thead>
                <tbody>
                  {(["gas", "accessory", "mixed"] as const).map((kind) => (
                    <tr key={kind}>
                      <th>{kind.toUpperCase()}</th>
                      <td>{report.orders_by_type![kind]}</td>
                      <td>
                        {report.orders_total > 0
                          ? Math.round((report.orders_by_type![kind] / report.orders_total) * 100)
                          : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h2>5 · DAY BY DAY</h2>
          <table className="report-print-table is-daily">
            <thead>
              <tr><th>DATE</th><th>REVENUE</th><th>ORDERS</th></tr>
            </thead>
            <tbody>
              {trend.map((d) => (
                <tr key={d.date}>
                  <th>{d.date}</th>
                  <td>{money(d.revenue_kobo)}</td>
                  <td>{d.orders}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>TOTAL</th>
                <td>{money(trend.reduce((s, d) => s + d.revenue_kobo, 0))}</td>
                <td>{trend.reduce((s, d) => s + d.orders, 0)}</td>
              </tr>
            </tfoot>
          </table>

          {/* A figure nobody signs is a figure nobody owns. The lines are blank
              on purpose: the manager writes the name, as on a delivery note. */}
          <section className="report-print-signoff">
            <div><span>PREPARED BY</span><i /></div>
            <div><span>CHECKED BY</span><i /></div>
            <div><span>DATE</span><i /></div>
          </section>

          <footer className="report-print-foot">
            <p>
              U2 OIL AND GAS LTD. — DEPOT PERFORMANCE REPORT FOR{" "}
              {PERIOD_NAME[days] ?? `${days} DAYS`} ({reportWindow.start} TO {reportWindow.end})
            </p>
            <p>GENERATED BY THE U2 GAS DEPOT SYSTEM · NOT VALID WITHOUT A SIGNATURE</p>
          </footer>
        </section>
      )}
    </div>
  );
}
