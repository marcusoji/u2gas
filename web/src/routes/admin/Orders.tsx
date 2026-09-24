import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Refund, type AdminOrder, type AdminDriver } from "../../lib/api";
import {
  Empty, ErrorState, Input, LoadBar, Modal, Pill, Stamp, Tabs, money,
} from "../../components/primitives";
import { Ticker } from "../../components/terminal";

type View = "all" | "flagged";

/**
 * Orders and the flagged queue.
 *
 * Flagged is ordered by who is owed something: captured payments against dead
 * orders come first, because someone is out of pocket until that is resolved.
 */
export default function Orders() {
  const [view, setView] = useState<View>("flagged");
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [flagged, setFlagged] = useState<any>(null);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [driverError, setDriverError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [refunds, setRefunds] = useState<Refund[] | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [manual, setManual] = useState<Refund | null>(null);
  const [manualNote, setManualNote] = useState("");
  const [cancelling, setCancelling] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    if (view === "flagged") {
      setFlagged(null);
      api.admin.flagged().then((r) => setFlagged(r.flagged))
        .catch((e: ApiError) => setError(e.message));
      // Refunds sit alongside the flagged queue: both are "somebody has to
      // do something today".
      api.admin.refunds().then((r) => setRefunds(r.refunds))
        .catch(() => setRefunds([]));
    } else {
      setOrders(null);
      api.admin.orders().then((r) => setOrders(r.orders))
        .catch((e: ApiError) => setError(e.message));
    }
  }, [view]);

  useEffect(load, [load]);
  useEffect(() => {
    let cancelled = false;
    setDriverError(null);
    api.admin.drivers()
      .then((r) => { if (!cancelled) setDrivers(r.drivers); })
      .catch((e: ApiError) => { if (!cancelled) setDriverError(e.message); });
    return () => { cancelled = true; };
  }, []);

  async function doCancel() {
    setBusy(true);
    try {
      await api.admin.cancelOrder(cancelling.order_id, reason);
      setCancelling(null);
      setReason("");
      load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally { setBusy(false); }
  }

  async function processRefund(r: Refund) {
    setWorking(r.refund_id);
    setError(null);
    try {
      const res = await api.admin.processRefund(r.refund_id);
      if (res.already) setError("PAYSTACK HAD ALREADY REFUNDED THIS ONE");
      load();
    } catch (e) {
      // The refund goes back to pending on failure, so it stays in the queue.
      setError((e as ApiError).message);
      load();
    } finally { setWorking(null); }
  }

  async function settleManually() {
    if (!manual) return;
    setWorking(manual.refund_id);
    try {
      await api.admin.settleRefundManually(manual.refund_id, manualNote);
      setManual(null);
      setManualNote("");
      load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally { setWorking(null); }
  }

  async function assign(orderId: string, driverId: string) {
    try {
      await api.admin.assign(orderId, driverId);
      load();
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  return (
    <div className="screen">
      <Ticker static>
        {flagged ? `${flagged.total} NEED ATTENTION` : "ORDERS"}
      </Ticker>

      <div style={{ height: "var(--s-5)" }} />

      <Tabs label="View" value={view} onChange={setView}
            options={[
              { value: "flagged", label: "FLAGGED" },
              { value: "all", label: "EVERYTHING" },
            ]} />

      <div style={{ height: "var(--s-6)" }} />

      {error && <ErrorState message={error} onRetry={load} />}

      {view === "flagged" && !flagged && !error && (
        <div style={{ minHeight: 220, display: "grid", placeItems: "center" }}>
          <LoadBar label="CHECKING FOR PROBLEMS" />
        </div>
      )}

      {view === "flagged" && flagged && (
        <>
          {flagged.total === 0 && <Empty>NOTHING NEEDS YOU</Empty>}

          {/* Money owed comes first. Everything else can wait a day. */}
          {refunds && refunds.filter((r) => r.status !== "refunded" && r.status !== "manual").length > 0 && (
            <section style={{ marginBottom: "var(--s-8)" }}>
              <h2 className="screen-title" style={{ fontSize: 16 }}>REFUNDS</h2>
              <p className="label" style={{ textAlign: "left", margin: "var(--s-2) 0 var(--s-4)" }}>
                THE CUSTOMER IS TOLD ONLY AFTER PAYSTACK CONFIRMS
              </p>

              {refunds
                .filter((r) => r.status !== "refunded" && r.status !== "manual")
                .map((r) => (
                <div className="card is-open" key={r.refund_id}>
                  <div className="card-body">
                    <p className="card-title">
                      {money(r.amount_kobo)} · {r.order?.order_number ?? "—"}
                    </p>
                    <p className="card-sub">
                      {r.order?.profile?.display_name ?? r.order?.guest_phone ?? "WALK-IN"}
                    </p>
                    {r.reason && <p className="card-sub">{r.reason}</p>}
                    {r.attempts > 0 && (
                      <p className="card-sub">TRIED {r.attempts}×</p>
                    )}
                    {r.last_error && <Stamp>{r.last_error.toUpperCase()}</Stamp>}
                  </div>

                  <div style={{ marginTop: "var(--s-3)" }}>
                    <Pill
                      onClick={() => processRefund(r)}
                      disabled={working === r.refund_id || r.status === "processing"}
                    >
                      {working === r.refund_id ? "ASKING PAYSTACK"
                       : r.status === "processing" ? "IN PROGRESS"
                       : "PROCESS REFUND"}
                    </Pill>
                    <Pill variant="ghost"
                          onClick={() => { setManual(r); setManualNote(""); }}
                          disabled={working === r.refund_id}>
                      I REFUNDED THIS IN PERSON
                    </Pill>
                  </div>
                </div>
              ))}
            </section>
          )}

          {flagged.refunds_owed.length > 0 && (
            <section style={{ marginBottom: "var(--s-8)" }}>
              <h2 className="screen-title" style={{ fontSize: 16 }}>REFUNDS OWED</h2>
              <p className="label" style={{ textAlign: "left", margin: "var(--s-2) 0 var(--s-4)" }}>
                MONEY ARRIVED AFTER THE ORDER CLOSED
              </p>
              {flagged.refunds_owed.map((r) => (
                <div className="card" key={r.audit_id}>
                  <div className="card-body">
                    <p className="card-title">{money(r.after?.amount_kobo ?? 0)}</p>
                    <p className="card-sub">{r.note}</p>
                    <p className="card-sub">
                      {new Date(r.created_at).toLocaleString("en-GB")}
                    </p>
                  </div>
                  <Stamp>REFUND</Stamp>
                </div>
              ))}
            </section>
          )}

          {flagged.failed_deliveries.length > 0 && (
            <section style={{ marginBottom: "var(--s-8)" }}>
              <h2 className="screen-title" style={{ fontSize: 16 }}>FAILED DROPS</h2>
              <div style={{ height: "var(--s-4)" }} />
              {flagged.failed_deliveries.map((d) => (
                <div className="card" key={d.delivery_id}>
                  <div className="card-body">
                    <p className="card-title">{d.order?.order_number}</p>
                    <p className="card-sub">{d.failure_reason}</p>
                    <p className="card-sub">ATTEMPT {d.attempt_count}</p>
                    {driverError && (
                      <Stamp>{driverError}</Stamp>
                    )}
                    <select
                      className="input"
                      style={{ height: 30, fontSize: 8, marginTop: 6 }}
                      aria-label="Reassign driver"
                      defaultValue=""
                      onChange={(e) => e.target.value && assign(d.order?.order_id, e.target.value)}
                    >
                      <option value="">REASSIGN TO</option>
                      {drivers.filter((dr) => dr.status !== "offline").map((dr) => (
                        <option key={dr.driver_id} value={dr.driver_id}>
                          {dr.profile?.display_name ?? "DRIVER"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </section>
          )}

          {flagged.stale_unpaid.length > 0 && (
            <section>
              <h2 className="screen-title" style={{ fontSize: 16 }}>UNPAID OVER A DAY</h2>
              <div style={{ height: "var(--s-4)" }} />
              {flagged.stale_unpaid.map((o) => (
                <div className="card" key={o.order_id}>
                  <div className="card-body">
                    <p className="card-title">{o.order_number}</p>
                    <p className="card-sub">{money(o.total_kobo)}</p>
                  </div>
                  <button className="card-go" aria-label="Cancel order"
                          onClick={() => setCancelling(o)} />
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {view === "all" && (
        <>
          {!orders && !error && <LoadBar label="PULLING ORDERS" />}
          {orders?.length === 0 && <Empty>NO ORDERS YET</Empty>}
          {orders?.map((o) => (
            <div className="card" key={o.order_id}>
              <div className="card-body">
                <p className="card-title">{o.order_number}</p>
                <p className="card-sub">
                  {o.profile?.display_name ?? "WALK-IN"} · {money(o.total_kobo)}
                </p>
                <p className="card-sub">
                  {o.status.toUpperCase()} · {o.payment_status.toUpperCase()} ·
                  {" "}{o.fulfillment_type.toUpperCase()}
                </p>
              </div>
              {!["fulfilled", "cancelled", "expired"].includes(o.status) && (
                <button className="card-go" aria-label="Cancel order"
                        onClick={() => setCancelling(o)} />
              )}
            </div>
          ))}
        </>
      )}

      <div className="spacer" />

      <Modal open={Boolean(manual)} onClose={() => setManual(null)}
             label="Settle refund by hand">
        <p className="label">
          {manual ? `${money(manual.amount_kobo)} · ${manual.order?.order_number ?? ""}` : ""}
        </p>
        <p className="label" style={{ marginTop: "var(--s-3)", lineHeight: 2 }}>
          ONLY IF YOU HAVE ACTUALLY GIVEN THE MONEY BACK
        </p>
        <div style={{ marginTop: "var(--s-4)" }}>
          <Input placeholder="HOW DID YOU REFUND IT" value={manualNote}
                 onChange={(e) => setManualNote(e.target.value)} />
        </div>
        <div style={{ marginTop: "var(--s-5)" }}>
          <Pill onClick={settleManually}
                disabled={manualNote.trim().length < 3 || Boolean(working)}>
            MARK IT REFUNDED
          </Pill>
          <Pill variant="ghost" onClick={() => setManual(null)}>CANCEL</Pill>
        </div>
      </Modal>

      <Modal open={Boolean(cancelling)} onClose={() => setCancelling(null)} label="Cancel order">
        <p className="label">CANCEL {cancelling?.order_number}</p>
        <p className="label" style={{ marginTop: "var(--s-3)", lineHeight: 2 }}>
          THE STOCK GOES BACK TO THE POOL
        </p>
        <div style={{ marginTop: "var(--s-5)" }}>
          <Input placeholder="WHY" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div style={{ marginTop: "var(--s-5)" }}>
          <Pill variant="danger" onClick={doCancel} disabled={busy || reason.trim().length < 3}>
            {busy ? "CANCELLING" : "CANCEL THE ORDER"}
          </Pill>
          <Pill variant="ghost" onClick={() => setCancelling(null)}>KEEP IT</Pill>
        </div>
      </Modal>
    </div>
  );
}
