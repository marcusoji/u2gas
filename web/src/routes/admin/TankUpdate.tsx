import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, newIdempotencyKey, type GasStock } from "../../lib/api";
import { BackButton, ErrorState, Input, LoadBar, Segmented, Stamp } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * Move stock (1:3075 UPDATE GAS).
 *
 * The board draws the tank gauge and a stepper: a big figure, a TONS badge and
 * minus/plus. Those are the controls, so the drawn figure submits and the
 * drawn circles step by a ton. The drawing has no note field and no direction
 * control, so both sit below the board rather than inside it.
 */
export default function TankUpdate() {
  const nav = useNavigate();
  const [stock, setStock] = useState<GasStock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [move, setMove] = useState<"addition" | "removal">("addition");
  const [tons, setTons] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    api.admin.stock()
      .then((r) => setStock(r.stock))
      .catch((e: ApiError) => setError(e.message));
  }, []);

  async function submit() {
    if (busy || tons <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const key = keyRef.current ?? (keyRef.current = newIdempotencyKey());
      await api.admin.addStock({ move, amount_kg: tons * 1000, note: note.trim() || undefined });
      keyRef.current = null;
      nav("/admin/tank");
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  }

  if (error && !stock) return <div className="screen"><ErrorState message={error} /></div>;

  if (!stock) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="READING THE TANK" />
      </div>
    );
  }

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:3075" values={{ "1:3231": String(tons) }}>
        <BackButton to="/admin/tank" />
        {/* The minus and plus the file draws at (120,612) and (202,612). */}
        <button className="figma-route-interactive" aria-label="One ton less"
          onClick={() => setTons((v) => Math.max(0, v - 1))}
          style={{ left: 150, top: 612, width: 58, height: 58 }} />
        <button className="figma-route-interactive" aria-label="One ton more"
          onClick={() => setTons((v) => v + 1)}
          style={{ left: 232, top: 612, width: 58, height: 58 }} />
        {/* The figure itself is the submit. */}
        <button className="figma-route-interactive"
          aria-label={move === "removal" ? "Take stock out" : "Take stock in"}
          disabled={busy || tons <= 0}
          onClick={submit}
          style={{ left: 151, top: 487, width: 123, height: 73 }} />
      </FigmaRouteFrame>

      <div style={{ marginTop: 18 }}>
        <Segmented
          label="Direction"
          value={move}
          onChange={setMove}
          options={[
            { value: "addition", label: "TAKE IN" },
            { value: "removal", label: "TAKE OUT" },
          ]}
        />
        {/* Taking stock out cannot touch what customers have already reserved,
            so say which way the tank moves before they press it. */}
        <p className="label" style={{ marginTop: 12, lineHeight: 2 }}>
          {move === "removal"
            ? "THIS CANNOT TOUCH STOCK ALREADY RESERVED"
            : "THIS IS ADDED ON TOP OF WHAT IS ALREADY THERE"}
        </p>
        <Input
          placeholder="DELIVERY NOTE OR REASON"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ marginTop: 12 }}
        />
        <p className="label" style={{ marginTop: 12 }}>
          {busy ? "SAVING…" : `${move === "removal" ? "REMOVING" : "ADDING"} ${tons} TONS`}
        </p>
        {error && (
          <div className="stamp-wrap" style={{ marginTop: 12 }}>
            <Stamp>{error}</Stamp>
          </div>
        )}
      </div>
    </div>
  );
}
