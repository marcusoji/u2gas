import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import {
  Chip, ErrorState, Input, LoadBar, Pill, Segmented, Sheet, Stamp, money, BackButton,
} from "../../components/primitives";
import { Ticker } from "../../components/terminal";

type Reason = "no_answer" | "wrong_address" | "refused" | "unsafe" | "other";

// Two lines where the design's chips wrap, one where they don't.
const REASONS: { value: Reason; lines: string[] }[] = [
  { value: "no_answer",     lines: ["NO", "ANSWER"] },
  { value: "wrong_address", lines: ["WRONG", "ADDRESS"] },
  { value: "refused",       lines: ["REFUSED"] },
  { value: "unsafe",        lines: ["UNSAFE"] },
];

/**
 * Delivery detail (spec 25). The prototype only ever showed a successful drop
 * inline in the list; every state below the happy path is new, and every one
 * of them is required by the spec.
 */
export default function Drop() {
  const { id } = useParams();
  const nav = useNavigate();

  const [drop, setDrop] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [failSheet, setFailSheet] = useState(false);
  const [reason, setReason] = useState<Reason>("no_answer");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<"reschedule" | "return">("reschedule");

  async function load(signal?: { cancelled: boolean }) {
    if (!id) return;
    setError(null);
    try {
      const r = await api.driver.delivery(id);
      if (!signal?.cancelled) setDrop(r.delivery);
    } catch (e) {
      if (!signal?.cancelled) setError((e as ApiError).message);
    }
  }

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => { signal.cancelled = true; };
  }, [id]);

  if (error && !drop) return <div className="screen"><ErrorState message={error} onRetry={load} /></div>;

  if (!drop) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="OPENING THE DROP" />
      </div>
    );
  }

  const order = drop.order ?? {};
  const customer = order.profile?.display_name ?? order.guest_name ?? "CUSTOMER";
  const phone = order.profile?.phone ?? order.guest_phone;
  const settled = ["delivered", "returned"].includes(drop.status);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await api.driver.enRoute(drop.delivery_id);
      await load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally { setBusy(false); }
  }

  async function markFailed() {
    setBusy(true);
    setError(null);
    try {
      await api.driver.failed(drop.delivery_id, { reason, note: note || undefined, outcome });
      setFailSheet(false);
      await load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="screen">
      <BackButton to="/driver" label="BACK TO DROPS" />

      <Ticker static={drop.status !== "en_route"}>
        {drop.status === "en_route" ? "EN ROUTE"
         : drop.status === "delivered" ? "DELIVERED — THANK YOU"
         : drop.status === "returned" ? "RETURNED TO THE DEPOT"
         : drop.status === "rescheduled" ? "WE'LL TRY AGAIN"
         : "READY TO GO"}
      </Ticker>

      <div style={{ height: "var(--s-5)" }} />

      <h1 className="screen-title" style={{ fontSize: 20 }}>{order.order_number}</h1>

      <div style={{ marginTop: "var(--s-5)" }}>
        <p className="label" style={{ textAlign: "left" }}>DELIVER TO</p>
        <p style={{ color: "var(--blue)", fontSize: "var(--t-body)", marginTop: "var(--s-1)" }}>
          {customer.toUpperCase()}
        </p>
        <p className="card-sub">{drop.delivery_address}</p>
        {drop.zone?.name && <p className="card-sub">{drop.zone.name}</p>}
      </div>

      {/* A driver at a door needs to call, not copy a number out of a list. */}
      {phone && (
        <a href={`tel:${phone}`} className="pill is-ghost"
           style={{ marginTop: "var(--s-4)", textDecoration: "none",
                    display: "grid", placeItems: "center" }}>
          CALL {phone}
        </a>
      )}

      <div style={{ marginTop: "var(--s-6)" }}>
        {order.gas_amount_kg > 0 && (
          <div className="row"><span>GAS</span><b>{order.gas_amount_kg}KG</b></div>
        )}
        {(order.order_item ?? []).map((it: any, i: number) => (
          <div className="row" key={i}>
            <span>{it.product?.name ?? "ITEM"}</span><b>×{it.quantity}</b>
          </div>
        ))}
        <div className="row is-total">
          <span>{order.payment_status === "paid" ? "PAID" : "UNPAID"}</span>
          <b>{money(order.total_kobo ?? 0)}</b>
        </div>
      </div>

      {order.payment_status !== "paid" && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-4)" }}>
          <Stamp>DON'T HAND OVER — NOT PAID</Stamp>
        </div>
      )}

      {drop.failure_reason && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-4)" }}>
          <Stamp>{drop.failure_reason.toUpperCase()}</Stamp>
          {drop.attempt_count > 1 && (
            <p className="label" style={{ marginTop: "var(--s-2)" }}>
              ATTEMPT {drop.attempt_count}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp>{error}</Stamp>
        </div>
      )}

      <div className="spacer" />

      {!settled && (
        <div className="stack is-tight">
          {drop.status === "assigned" && (
            <Pill onClick={start} disabled={busy}>{busy ? "STARTING" : "START TRIP"}</Pill>
          )}
          {drop.status === "en_route" && (
            <Pill onClick={() => nav("/driver/scan")}>SCAN TO DELIVER</Pill>
          )}
          <Pill variant="ghost" onClick={() => setFailSheet(true)}>
            COULDN'T DELIVER
          </Pill>
        </div>
      )}

      {settled && <Pill variant="ghost" onClick={() => nav("/driver/scan")}>SCAN THE NEXT ONE</Pill>}

      {/* --- Failure. Reason chips in the dashed hand-cut style. ------------ */}
      <Sheet open={failSheet} onClose={() => setFailSheet(false)} label="What went wrong">
        <p className="label">WHAT HAPPENED</p>
        <div className="chips" style={{ margin: "var(--s-4) 0" }}>
          {REASONS.map((r) => (
            <Chip key={r.value} pressed={reason === r.value} onClick={() => setReason(r.value)}>
              {r.lines.map((line, i) => (
                <span key={line}>{i > 0 && <br />}{line}</span>
              ))}
            </Chip>
          ))}
        </div>

        <Input placeholder="ANYTHING ELSE (OPTIONAL)" value={note}
               onChange={(e) => setNote(e.target.value)} />

        <div style={{ marginTop: "var(--s-5)" }}>
          <p className="label">WHAT NOW</p>
          <div style={{ marginTop: "var(--s-3)" }}>
            <Segmented
              label="Outcome"
              value={outcome}
              onChange={setOutcome}
              options={[
                { value: "reschedule", label: "TRY AGAIN" },
                { value: "return", label: "BACK TO DEPOT" },
              ]}
            />
          </div>
        </div>

        {/* Returning ends the order and releases the stock, which is not
            reversible from here. Say so before they press it. */}
        <p className="label" style={{ marginTop: "var(--s-4)", lineHeight: 2 }}>
          {outcome === "return"
            ? "THIS CANCELS THE ORDER AND PUTS THE STOCK BACK"
            : "THE ORDER STAYS OPEN FOR ANOTHER ATTEMPT"}
        </p>

        <div style={{ marginTop: "var(--s-5)" }}>
          <Pill variant={outcome === "return" ? "danger" : "primary"}
                onClick={markFailed} disabled={busy}>
            {busy ? "SAVING" : outcome === "return" ? "RETURN TO DEPOT" : "RESCHEDULE"}
          </Pill>
        </div>
      </Sheet>
    </div>
  );
}
