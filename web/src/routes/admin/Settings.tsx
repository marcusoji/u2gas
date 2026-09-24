import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type AdminZone, type AdminSetting } from "../../lib/api";
import {
  ErrorState, Input, LoadBar, Modal, Pill, Stamp, money,
} from "../../components/primitives";
import { Ticker } from "../../components/terminal";

/**
 * Delivery zones, fees, and the timings the business runs on.
 *
 * Changing a fee never re-prices an existing order — delivery_fee_kobo is
 * copied onto the order at purchase. (Spec 34)
 */
export default function Settings() {
  const [zones, setZones] = useState<AdminZone[] | null>(null);
  const [settings, setSettings] = useState<AdminSetting[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<any>(null);
  const [fee, setFee] = useState("");
  const [creating, setCreating] = useState(false);
  const [newZone, setNewZone] = useState({ name: "", fee: "" });
  const [busy, setBusy] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    setError(null);
    Promise.all([api.admin.zones(), api.admin.settings()])
      .then(([z, s]) => {
        if (seq !== loadSeq.current) return;
        setZones(z.zones);
        setSettings(s.settings);
      })
      .catch((e: ApiError) => {
        if (seq === loadSeq.current) setError(e.message);
      });
  }, []);

  useEffect(load, [load]);

  const setting = (key: string) =>
    Number(settings?.find((s) => s.key === key)?.value ?? 0);

  async function saveFee() {
    setBusy(true);
    try {
      await api.admin.updateZone(editing.zone_id, {
        fee_kobo: Math.round(Number(fee) * 100),
      });
      setEditing(null);
      load();
    } catch (e) { setError((e as ApiError).message); }
    finally { setBusy(false); }
  }

  async function createZone() {
    setBusy(true);
    try {
      await api.admin.createZone({
        name: newZone.name,
        fee_kobo: Math.round(Number(newZone.fee) * 100),
      });
      setCreating(false);
      setNewZone({ name: "", fee: "" });
      load();
    } catch (e) { setError((e as ApiError).message); }
    finally { setBusy(false); }
  }

  async function bumpSetting(key: string, delta: number, min: number, max: number) {
    if (busy) return;
    const next = Math.min(max, Math.max(min, setting(key) + delta));
    setBusy(true);
    try {
      await api.admin.setSetting(key, next);
      load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !zones) return <div className="screen"><ErrorState message={error} onRetry={load} /></div>;

  if (!zones || !settings) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="LOADING SETUP" />
      </div>
    );
  }

  return (
    <div className="screen">
      <Ticker static>{zones.filter((z) => z.active).length} ZONES ACTIVE</Ticker>
      <div style={{ height: "var(--s-5)" }} />

      <h1 className="screen-title">DELIVERY<br />ZONES</h1>
      <div style={{ height: "var(--s-5)" }} />

      {zones.map((z) => (
        <div className="card" key={z.zone_id}>
          <div className="card-body">
            <p className="card-title">{z.name}</p>
            <p className="card-sub">{money(z.fee_kobo)}</p>
            {z.coverage_note && <p className="card-sub">{z.coverage_note}</p>}
            {!z.active && <Stamp>OFF</Stamp>}
          </div>
          <button className="card-go" aria-label={`Edit ${z.name}`}
                  onClick={() => { setEditing(z); setFee(String(z.fee_kobo / 100)); }} />
        </div>
      ))}

      <div style={{ marginTop: "var(--s-4)" }}>
        <Pill variant="ghost" onClick={() => setCreating(true)}>ADD A ZONE</Pill>
      </div>

      <h2 className="screen-title" style={{ fontSize: 18, marginTop: "var(--s-10)" }}>
        TIMINGS
      </h2>
      <div style={{ height: "var(--s-4)" }} />

      <Stepper
        label="HOW LONG A HOLD LASTS"
        value={`${setting("hold_minutes")} MIN`}
        onDown={() => bumpSetting("hold_minutes", -5, 5, 240)}
        onUp={() => bumpSetting("hold_minutes", 5, 5, 240)}
        disabled={busy}
      />
      <Stepper
        label="HOW LONG A QR STAYS GOOD"
        value={`${setting("qr_valid_hours")} HRS`}
        onDown={() => bumpSetting("qr_valid_hours", -12, 12, 336)}
        onUp={() => bumpSetting("qr_valid_hours", 12, 12, 336)}
        disabled={busy}
      />
      <Stepper
        label="MOST GAS IN ONE ORDER"
        value={`${setting("max_gas_kg_per_order")} KG`}
        onDown={() => bumpSetting("max_gas_kg_per_order", -5, 5, 500)}
        onUp={() => bumpSetting("max_gas_kg_per_order", 5, 5, 500)}
        disabled={busy}
      />

      <div className="spacer" />

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} label="Edit zone">
        <p className="label">{editing?.name?.toUpperCase()}</p>
        <div style={{ marginTop: "var(--s-4)" }}>
          <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <p className="label" style={{ marginTop: "var(--s-3)", lineHeight: 2 }}>
          OLD ORDERS KEEP THE FEE THEY WERE CHARGED
        </p>
        <div style={{ marginTop: "var(--s-5)" }}>
          <Pill onClick={saveFee} disabled={busy}>SAVE</Pill>
          <Pill variant={editing?.active ? "danger" : "ghost"}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.admin.updateZone(editing.zone_id, { active: !editing.active });
                    setEditing(null);
                    load();
                  } catch (e) {
                    setError((e as ApiError).message);
                  } finally {
                    setBusy(false);
                  }
                }}>
            {editing?.active ? "TURN THIS ZONE OFF" : "TURN IT BACK ON"}
          </Pill>
          <Pill variant="ghost" onClick={() => setEditing(null)}>CANCEL</Pill>
        </div>
      </Modal>

      <Modal open={creating} onClose={() => setCreating(false)} label="New zone">
        <div className="stack is-tight">
          <Input placeholder="ZONE NAME" value={newZone.name}
                 onChange={(e) => setNewZone({ ...newZone, name: e.target.value })} />
          <Input type="number" placeholder="FEE IN NAIRA" value={newZone.fee}
                 onChange={(e) => setNewZone({ ...newZone, fee: e.target.value })} />
          <Pill onClick={createZone} disabled={busy || !newZone.name || !newZone.fee}>
            ADD IT
          </Pill>
          <Pill variant="ghost" onClick={() => setCreating(false)}>CANCEL</Pill>
        </div>
      </Modal>
    </div>
  );
}

/** The −/+ control from the tank modal, reused rather than reinvented. */
function Stepper({ label, value, onUp, onDown, disabled }: {
  label: string; value: string; onUp: () => void; onDown: () => void; disabled?: boolean;
}) {
  return (
    <div style={{ marginBottom: "var(--s-5)" }}>
      <p className="label" style={{ textAlign: "left" }}>{label}</p>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: "var(--s-2)",
      }}>
        <button disabled={disabled} onClick={onDown} aria-label={`Less: ${label}`} style={stepStyle("var(--danger)")}>−</button>
        <span style={{ color: "var(--blue)", fontSize: "var(--t-body)" }}>{value}</span>
        <button disabled={disabled} onClick={onUp} aria-label={`More: ${label}`} style={stepStyle("var(--blue)")}>+</button>
      </div>
    </div>
  );
}

const stepStyle = (bg: string) => ({
  width: 36, height: 36, borderRadius: "50%", border: "none",
  background: bg, color: "#fff", fontSize: 18,
});
