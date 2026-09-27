import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, newIdempotencyKey } from "../../lib/api";
import { ErrorState, Input, LoadBar, OptionalBack, Pill, Stamp, money } from "../../components/primitives";
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
  // The variance is the number the whole screen exists to show, and the one a
  // cashier signs their name against. Three states, and the words a manager
  // uses for them — balanced, over, short — rather than a bare signed figure.
  const varianceState: "balanced" | "over" | "short" =
    variance === 0 ? "balanced" : variance > 0 ? "over" : "short";
  const varianceWord = { balanced: "BALANCED", over: "OVER", short: "SHORT" }[varianceState];
  // Once the drawer is closed the count is history, not a form field. The
  // input used to stay mounted and editable after filing, which let a cashier
  // retype a number that could never be saved.
  const displayCountedKobo = closed && data?.reconciliation
    ? Number(data.reconciliation.counted_kobo)
    : countedKobo;
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
      <OptionalBack to="/staff" />
      <Ticker static>{closed ? "SHIFT CLOSED" : "SHIFT OPEN"}</Ticker>
      <div style={{ height: "var(--s-5)" }} />

      <Receipt
        date={receiptDate(`${date}T12:00:00Z`)}
        lines={[
          { label: "CASH TAKEN", value: String(data.transaction_count) },
          { label: "EXPECTED", value: money(data.expected_kobo) },
          { label: "COUNTED", value: money(displayCountedKobo) },
        ]}
      />

      {/* The variance gets its own instrument rather than a fourth line on the
          receipt. It is the one figure on this screen a cashier is answerable
          for, and a signed number in a list is not read the way a colour-coded
          tally is. */}
      <div className={`shift-variance is-${varianceState}`}>
        <span>{varianceWord}</span>
        <b>{variance > 0 ? "+" : ""}{money(variance)}</b>
        <i>
          {varianceState === "balanced"
            ? "THE DRAWER MATCHES THE TILL"
            : varianceState === "over"
              ? "MORE IN THE DRAWER THAN THE TILL RECORDED"
              : "LESS IN THE DRAWER THAN THE TILL RECORDED"}
        </i>
      </div>

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
          {/* The button is inert until the difference is explained. Say so,
              rather than leaving a cashier pressing a dead key. */}
          {validCount && variance !== 0 && !note.trim() && (
            <p className="label" style={{ textAlign: "left" }}>
              WRITE WHY THE DRAWER DIFFERS, THEN YOU CAN CLOSE
            </p>
          )}
        </div>
      )}

      {closed && data?.reconciliation && (
        <div className="shift-closed">
          <Stamp tone="ok">CLOSED AND FILED</Stamp>
          <p className="label">
            FILED {new Date(data.reconciliation.closed_at!).toLocaleString("en-GB", {
              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
            })}
          </p>
          {data.reconciliation.note && (
            <p className="card-sub" style={{ marginTop: "var(--s-2)" }}>
              {data.reconciliation.note}
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
    </div>
  );
}
