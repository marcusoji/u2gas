import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type GasStock } from "../../lib/api";
import {
  BackButton, ErrorState, Input, LoadBar, Modal, Pill, Segmented, Sheet, Stamp, money,
} from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * The tank (1:3887 GAS LVL CHECK).
 *
 * `available_kg` is read from the server, never computed here and never
 * editable — it is derived from received minus reserved minus used, and the
 * only way to move it is a stock entry. (Spec 29)
 *
 * The board draws the gauge, the big available figure, the days-left line and
 * an UPDATE control, so those are bound to the live tank and the drawing's
 * geometry is kept. The drawing collapses the accounting into one number and
 * gives the rate no control at all; both stay as app chrome below the board,
 * because the number is reconciled against a delivery note and the rate still
 * has to be changeable.
 */
export default function Tank() {
  const nav = useNavigate();
  const [stock, setStock] = useState<GasStock | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [moving, setMoving] = useState(false);
  const [move, setMove] = useState<"addition" | "removal">("addition");
  const [tons, setTons] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [rateOpen, setRateOpen] = useState(false);
  const [rate, setRate] = useState("");

  const load = useCallback(() => {
    setError(null);
    api.admin.stock()
      .then((r) => { setStock(r.stock); setRate(String(r.stock.rate_kobo_per_kg / 100)); })
      .catch((e: ApiError) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const parsedTons = Number(tons);
  const amountKg = Number.isFinite(parsedTons) && parsedTons > 0
    ? Math.round(parsedTons * 1000)
    : 0;

  async function submitStock() {
    if (amountKg <= 0) { setMoveError("ENTER AN AMOUNT"); return; }
    setBusy(true);
    setMoveError(null);
    try {
      await api.admin.addStock({ move, amount_kg: amountKg, note: note.trim() || undefined });
      setMoving(false);
      setTons("1");
      setNote("");
      load();
    } catch (e) {
      // Removing stock customers have already reserved is refused by the
      // gas_never_oversold constraint. That refusal is correct, so show it.
      setMoveError((e as ApiError).message);
    } finally { setBusy(false); }
  }

  async function submitRate() {
    const kobo = Math.round(Number(rate) * 100);
    if (!Number.isFinite(kobo) || kobo <= 0) return;
    setBusy(true);
    try {
      await api.admin.setRate(kobo);
      setRateOpen(false);
      load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally { setBusy(false); }
  }

  if (error && !stock) return <div className="screen"><ErrorState message={error} onRetry={load} /></div>;

  if (!stock) return (
    <div className="screen" style={{ justifyContent: "center" }}>
      <LoadBar label="READING THE TANK" />
    </div>
  );

  const tonsAvailable = stock.available_kg / 1000;
  const asTons = (kg: number) => `${(kg / 1000).toFixed(1)}T`;
  // 1:3902 is one `<p>` split by a `<br>`, so the days are replaced inside the
  // line rather than by rewriting the node: replacing the whole string would
  // drop the `<br>` and change the drawn structure.
  const textReplacements: Record<string, string | string[]> = stock.days_remaining === null
    ? { "TO LAST 34 MORE DAYS*": "TO LAST AN UNKNOWN NUMBER OF DAYS*" }
    : { "34 MORE DAYS": `${stock.days_remaining} MORE DAYS` };

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame
        node="1:3887"
        values={{ "1:3904": String(Math.floor(tonsAvailable)) }}
        textReplacements={textReplacements}
      >
        <BackButton to="/admin" />
        <button className="figma-route-interactive" aria-label="Update stock"
          onClick={() => nav("/admin/tank/update")}
          style={{ left: 40, top: 656, width: 200, height: 70 }} />
        <button className="figma-route-interactive" aria-label="Staff"
          onClick={() => nav("/admin/people")}
          style={{ left: 40, top: 834, width: 476, height: 161 }} />
        <button className="figma-route-interactive" aria-label="Notifications"
          onClick={() => nav("/admin/notifs")}
          style={{ left: 362, top: 63, width: 50, height: 56 }} />
      </FigmaRouteFrame>

      {stock.available_kg <= 0 && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp loud>THE TANK IS EMPTY</Stamp>
        </div>
      )}

      {/* The gauge draws one number. The three that produce it are what a
          manager actually reconciles against a delivery note. */}
      <div style={{ marginTop: "var(--s-8)" }}>
        <div className="row"><span>RECEIVED</span><b>{asTons(stock.total_received_kg)}</b></div>
        <div className="row"><span>RESERVED</span><b>{asTons(stock.reserved_kg)}</b></div>
        <div className="row"><span>USED</span><b>{asTons(stock.deducted_kg)}</b></div>
        <div className="row is-total"><span>AVAILABLE</span><b>{asTons(stock.available_kg)}</b></div>
      </div>

      <div style={{ marginTop: "var(--s-8)" }}>
        <p className="label" style={{ textAlign: "left" }}>RATE</p>
        <div style={{ marginTop: "var(--s-3)" }}>
          <div className="row"><span>PER KG</span><b>{money(stock.rate_kobo_per_kg)}</b></div>
        </div>
        {/* Existing orders keep rate_at_purchase. Nobody gets re-priced. */}
        <p className="label" style={{ marginTop: "var(--s-3)", textAlign: "left" }}>
          A NEW RATE ONLY AFFECTS NEW ORDERS
        </p>
      </div>

      {error && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp>{error}</Stamp>
        </div>
      )}

      <div className="spacer" />

      <div className="stack is-tight">
        <Pill onClick={() => { setMove("addition"); setMoveError(null); setMoving(true); }}>
          MOVE STOCK
        </Pill>
        <Pill variant="ghost" onClick={() => setRateOpen(true)}>CHANGE THE RATE</Pill>
        <Link to="/admin/tank/history" className="pill is-ghost" style={{
          textDecoration: "none", display: "grid", placeItems: "center",
        }}>
          STOCK HISTORY
        </Link>
      </div>

      <Sheet open={moving} onClose={() => setMoving(false)} label="Move stock">
        <p className="label">WHAT ARE YOU DOING</p>
        <div style={{ marginTop: "var(--s-4)" }}>
          <Segmented
            label="Direction"
            value={move}
            onChange={(v) => { setMove(v); setMoveError(null); }}
            options={[
              { value: "addition", label: "TAKE IN" },
              { value: "removal", label: "TAKE OUT" },
            ]}
          />
        </div>

        <div style={{ marginTop: "var(--s-5)" }}>
          <p className="label">HOW MANY TONS</p>
          <div style={{ marginTop: "var(--s-3)" }}>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder="TONS"
              value={tons}
              onChange={(e) => { setTons(e.target.value); setMoveError(null); }}
            />
          </div>
          <p className="label" style={{ marginTop: "var(--s-3)" }}>
            {amountKg > 0
              ? `THAT IS ${amountKg.toLocaleString("en-NG")}KG`
              : "ENTER A NUMBER OF TONS"}
          </p>
        </div>

        <div style={{ marginTop: "var(--s-5)" }}>
          <p className="label">NOTE (OPTIONAL)</p>
          <div style={{ marginTop: "var(--s-3)" }}>
            <Input
              placeholder="DELIVERY NOTE OR REASON"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        {/* Taking stock out cannot touch what customers have already reserved,
            so say which way the tank moves before they press it. */}
        <p className="label" style={{ marginTop: "var(--s-4)", lineHeight: 2 }}>
          {move === "removal"
            ? "THIS CANNOT TOUCH STOCK ALREADY RESERVED"
            : "THIS IS ADDED ON TOP OF WHAT IS ALREADY THERE"}
        </p>

        {moveError && (
          <div className="stamp-wrap" style={{ marginTop: "var(--s-4)" }}>
            <Stamp>{moveError}</Stamp>
          </div>
        )}

        <div style={{ marginTop: "var(--s-5)" }}>
          <Pill onClick={submitStock} disabled={busy || amountKg <= 0}>
            {busy ? "SAVING" : move === "removal" ? "TAKE OUT" : "TAKE IN"}
          </Pill>
        </div>
      </Sheet>

      <Modal open={rateOpen} onClose={() => setRateOpen(false)} label="Change the rate">
        <p className="label">NAIRA PER KG</p>
        <div style={{ marginTop: "var(--s-4)" }}>
          <Input type="number" inputMode="decimal" value={rate}
                 onChange={(e) => setRate(e.target.value)} />
        </div>
        {/* Existing orders keep rate_at_purchase. Nobody gets re-priced. */}
        <p className="label" style={{ marginTop: "var(--s-4)", lineHeight: 2 }}>
          THIS ONLY AFFECTS NEW ORDERS
        </p>
        <div style={{ marginTop: "var(--s-5)" }}>
          <Pill onClick={submitRate} disabled={busy || !rate}>SAVE THE RATE</Pill>
          <Pill variant="ghost" onClick={() => setRateOpen(false)}>CANCEL</Pill>
        </div>
      </Modal>
    </div>
  );
}
