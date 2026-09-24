import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, newIdempotencyKey } from "../../lib/api";
import { ErrorState, Input, LoadBar, Pill, Stamp, money } from "../../components/primitives";
import { Receipt, Ticker, receiptDate } from "../../components/terminal";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Cash reconciliation (spec 33). The expected figure is computed server-side
 * from the payments this cashier actually recorded — it is never typed in, so
 * the count is the only number under the cashier's control.
 */
export default function Shift() {
  const [date] = useState(today);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const closeKeyRef = useRef<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    setError(null);
    api.staff.reconciliation(date)
      .then((r) => {
        if (seq !== loadSeq.current) return;
        setData(r);
        if (r.reconciliation) setCounted(String(r.reconciliation.counted_kobo / 100));
      })
      .catch((e: ApiError) => { if (seq === loadSeq.current) setError(e.message); });
  }, [date]);

  useEffect(load, [load]);

  const parsedCounted = Number(counted);
  const countedKobo = Number.isFinite(parsedCounted) && parsedCounted >= 0
    ? Math.round(parsedCounted * 100)
    : 0;
  const variance = data ? countedKobo - data.expected_kobo : 0;
  const validCount = counted.trim() !== "" && Number.isFinite(parsedCounted) && parsedCounted >= 0;
  const closed = Boolean(data?.reconciliation?.closed_at);

  async function close() {
    setBusy(true);
    setError(null);
    try {
      if (!closeKeyRef.current) closeKeyRef.current = newIdempotencyKey();
      await api.staff.closeShift({
        shift_date: date,
        counted_kobo: countedKobo,
        note: note.trim() || undefined,
      }, closeKeyRef.current);
      load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <div className="screen"><ErrorState message={error} onRetry={load} /></div>;

  if (!data) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="COUNTING UP" />
      </div>
    );
  }

  return (
    <div className="screen">
      <Ticker static>{closed ? "SHIFT CLOSED" : "SHIFT OPEN"}</Ticker>
      <div style={{ height: "var(--s-5)" }} />

      <Receipt
        date={receiptDate(`${date}T12:00:00Z`)}
        lines={[
          { label: "CASH TAKEN", value: String(data.transaction_count) },
          { label: "EXPECTED", value: money(data.expected_kobo) },
          { label: "COUNTED", value: money(countedKobo) },
        ]}
      >
        <div className="row is-total">
          <span>VARIANCE</span>
          <b style={{ color: variance === 0 ? "var(--blue)" : "var(--danger)" }}>
            {variance > 0 ? "+" : ""}{money(variance)}
          </b>
        </div>

        {/* A variance of zero is the normal case and needs no decoration. Any
            other number is stamped, because it needs explaining. */}
        {variance !== 0 && (
          <div className="stamp-wrap" style={{ marginTop: "var(--s-3)" }}>
            <Stamp>{variance > 0 ? "OVER" : "SHORT"}</Stamp>
          </div>
        )}
      </Receipt>

      {!closed && (
        <div className="stack is-tight" style={{ marginTop: "var(--s-6)" }}>
          <p className="label">WHAT DID YOU COUNT</p>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="NAIRA IN THE DRAWER"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
          />
          {variance !== 0 && (
            <Input
              placeholder="WHY THE DIFFERENCE"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
          <Pill onClick={close} disabled={busy || !validCount || (variance !== 0 && !note.trim())}>
            {busy ? "CLOSING" : "CLOSE SHIFT"}
          </Pill>
        </div>
      )}

      {closed && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-6)" }}>
          <Stamp tone="ok">CLOSED AND FILED</Stamp>
        </div>
      )}

      {error && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp>{error}</Stamp>
        </div>
      )}

      <div className="spacer" />
    </div>
  );
}
