import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type SavedAddress, type Zone } from "../../lib/api";
import {
  BackButton, Empty, ErrorState, Input, LoadBar, Modal, PageShell, Pill, Stamp, money,
} from "../../components/primitives";

/**
 * Saved addresses (Item 7). The profile menu listed this with nothing behind
 * it; this is the screen it was pointing at.
 */
export default function Addresses() {
  const [rows, setRows] = useState<SavedAddress[] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ label: "", line: "", zone_id: "" });
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.addresses.list()
      .then((r) => setRows(r.addresses))
      .catch((e: ApiError) => setError(e.message));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    let active = true;
    api.zones()
      .then((r) => { if (active) setZones(r.zones); })
      .catch((e: ApiError) => { if (active) setZoneError(e.message); });
    return () => { active = false; };
  }, []);

  function open(a: SavedAddress | null) {
    setModalError(null);
    if (a) {
      setEditing(a);
      setDraft({ label: a.label, line: a.line, zone_id: a.zone?.zone_id ?? "" });
    } else {
      setCreating(true);
      setDraft({ label: "", line: "", zone_id: "" });
    }
  }

  function close() { setEditing(null); setCreating(false); }

  async function save() {
    if (!draft.label.trim() || !draft.line.trim()) {
      setModalError("LABEL AND ADDRESS ARE REQUIRED");
      return;
    }
    if (zoneError) {
      setModalError("DELIVERY ZONES COULD NOT BE LOADED. TRY AGAIN.");
      return;
    }
    setBusy(true);
    setModalError(null);
    try {
      if (editing) {
        await api.addresses.update(editing.address_id, {
          label: draft.label,
          line: draft.line,
          zone_id: draft.zone_id || null,
        });
      } else {
        await api.addresses.create({
          label: draft.label,
          line: draft.line,
          zone_id: draft.zone_id || null,
          is_default: (rows?.length ?? 0) === 0,   // the first one is the default
        });
      }
      close();
      load();
    } catch (e) {
      setModalError((e as ApiError).message);
    } finally { setBusy(false); }
  }

  async function makeDefault(a: SavedAddress) {
    try {
      await api.addresses.update(a.address_id, { is_default: true });
      load();
    } catch (e) { setError((e as ApiError).message); }
  }

  async function remove(a: SavedAddress) {
    setBusy(true);
    try {
      await api.addresses.remove(a.address_id);
      close();
      load();
    } catch (e) {
      setModalError((e as ApiError).message);
    } finally { setBusy(false); }
  }

  if (error && !rows) {
    return <PageShell><ErrorState message={error} onRetry={load} /></PageShell>;
  }

  return (
    <PageShell>
      <BackButton to="/profile" />
      <h1 className="screen-title">SAVED<br />ADDRESSES</h1>
      <div style={{ height: "var(--s-6)" }} />

      {zoneError && (
        <div className="stamp-wrap" style={{ marginBottom: "var(--s-4)" }}>
          <Stamp>{zoneError}</Stamp>
        </div>
      )}

      {!rows && (
        <div style={{ minHeight: 200, display: "grid", placeItems: "center" }}>
          <LoadBar label="LOADING" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <Empty action={<Pill onClick={() => open(null)}>ADD ONE</Pill>}>
          NOWHERE SAVED YET
        </Empty>
      )}

      {rows?.map((a) => (
        <div className="card" key={a.address_id}>
          <div className="card-body">
            <p className="card-title">
              {a.label.toUpperCase()}{a.is_default ? " · DEFAULT" : ""}
            </p>
            <p className="card-sub">{a.line}</p>
            {a.zone && (
              <p className="card-sub">
                {a.zone.name.toUpperCase()} — {money(a.zone.fee_kobo)}
              </p>
            )}
            {a.zone && !a.zone.active && <Stamp>WE DON'T DELIVER HERE NOW</Stamp>}
            {!a.is_default && (
              <button
                className="card-action"
                onClick={() => makeDefault(a)}
              >
                MAKE THIS THE DEFAULT
              </button>
            )}
          </div>
          <button className="card-go" aria-label={`Edit ${a.label}`} onClick={() => open(a)} />
        </div>
      ))}

      {rows && rows.length > 0 && (
        <div style={{ marginTop: "var(--s-5)" }}>
          <Pill variant="ghost" onClick={() => open(null)}>ADD ANOTHER</Pill>
        </div>
      )}

      <div className="spacer" />
      <Link to="/profile" style={{
        display: "block", textAlign: "center", color: "var(--blue-faint)",
        textDecoration: "none", padding: "var(--s-6) 0",
      }}>
        BACK TO YOUR PROFILE
      </Link>

      <Modal open={Boolean(editing || creating)} onClose={close}
             label={editing ? "Edit address" : "New address"}>
        <div className="stack is-tight">
          <p className="label">{editing ? "EDIT" : "NEW ADDRESS"}</p>
          <Input placeholder="CALL IT SOMETHING — HOME, SHOP" value={draft.label}
                 onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <Input placeholder="THE ADDRESS ITSELF" value={draft.line}
                 onChange={(e) => setDraft({ ...draft, line: e.target.value })} />
          <select className="input" value={draft.zone_id} aria-label="Delivery zone"
                  onChange={(e) => setDraft({ ...draft, zone_id: e.target.value })}>
            <option value="">CHOOSE YOUR AREA</option>
            {zones.map((z) => (
              <option key={z.zone_id} value={z.zone_id}>
                {z.name.toUpperCase()} — {money(z.fee_kobo)}
              </option>
            ))}
          </select>

          {modalError && (
            <div className="stamp-wrap"><Stamp>{modalError}</Stamp></div>
          )}

          <Pill onClick={save}
                disabled={busy || draft.label.trim().length < 1 || draft.line.trim().length < 6}>
            {busy ? "SAVING" : "SAVE"}
          </Pill>
          {editing && (
            <Pill variant="danger" onClick={() => remove(editing)} disabled={busy}>
              DELETE
            </Pill>
          )}
          <Pill variant="ghost" onClick={close}>CANCEL</Pill>
        </div>
      </Modal>
    </PageShell>
  );
}
