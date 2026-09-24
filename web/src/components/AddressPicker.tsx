import { useEffect, useState } from "react";
import { api, ApiError, type SavedAddress, type Zone } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Input, LoadBar, Stamp, money } from "./primitives";

/**
 * Delivery address entry, shared by the gas sheet and the cart sheet.
 *
 * A signed-in customer picks a saved address and never retypes it. A guest, or
 * someone adding a new one, types it once and can keep it. The parent only
 * ever receives the resolved line and zone — it does not care which route the
 * customer took. (Item 7)
 */
export function AddressPicker({ line, zoneId, onChange, zones, error }: {
  line: string;
  zoneId: string;
  onChange: (next: { line: string; zoneId: string; save?: boolean; label?: string }) => void;
  zones: Zone[];
  error?: string;
}) {
  const { session } = useAuth();

  const [saved, setSaved] = useState<SavedAddress[] | null>(null);
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [save, setSave] = useState(false);
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!session) { setSaved([]); setMode("new"); return; }

    api.addresses.list()
      .then((r) => {
        setSaved(r.addresses);
        // Nothing saved yet means there is nothing to pick from.
        setMode(r.addresses.length ? "pick" : "new");

        // Preselect the default so the common case is zero taps.
        const preferred = r.addresses.find((a) => a.is_default) ?? r.addresses[0];
        if (preferred && !line) {
          onChange({ line: preferred.line, zoneId: preferred.zone?.zone_id ?? "" });
        }
      })
      .catch(() => { setSaved([]); setMode("new"); });
  }, [session]);

  if (session && saved === null) {
    return <div style={{ padding: "var(--s-4) 0" }}><LoadBar label="YOUR ADDRESSES" /></div>;
  }

  const hasSaved = (saved?.length ?? 0) > 0;

  return (
    <div className="stack is-tight">
      <p className="label">WHERE ARE WE TAKING IT</p>

      {hasSaved && mode === "pick" && (
        <>
          <div>
            {saved!.map((a) => {
              const picked = a.line === line;
              return (
                <button
                  key={a.address_id}
                  className={`card${picked ? " is-open" : ""}`}
                  style={{ flexDirection: "row", alignItems: "center" }}
                  onClick={() => onChange({ line: a.line, zoneId: a.zone?.zone_id ?? "" })}
                >
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
                    {/* A zone turned off since it was saved must not silently
                        price the order at zero. */}
                    {a.zone && !a.zone.active && <Stamp>WE DON'T DELIVER HERE NOW</Stamp>}
                  </div>
                  <span className="card-go" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <button
            onClick={() => { setMode("new"); onChange({ line: "", zoneId: "" }); }}
            style={{
              background: "none", border: "none", color: "var(--blue-faint)",
              fontSize: "var(--t-caption)", padding: "var(--s-3) 0",
            }}
          >
            SOMEWHERE ELSE
          </button>
        </>
      )}

      {mode === "new" && (
        <>
          <Input
            placeholder="DELIVERY ADDRESS"
            value={line}
            onChange={(e) => onChange({ line: e.target.value, zoneId, save, label })}
            error={error}
          />

          <select
            className="input"
            value={zoneId}
            aria-label="Delivery zone"
            onChange={(e) => onChange({ line, zoneId: e.target.value, save, label })}
          >
            <option value="">CHOOSE YOUR AREA</option>
            {zones.map((z) => (
              <option key={z.zone_id} value={z.zone_id}>
                {z.name.toUpperCase()} — {money(z.fee_kobo)}
              </option>
            ))}
          </select>

          {session && (
            <label style={{
              display: "flex", alignItems: "center", gap: "var(--s-3)",
              fontSize: "var(--t-caption)", color: "var(--grey)",
              padding: "var(--s-2) var(--s-2) 0",
            }}>
              <input
                type="checkbox"
                checked={save}
                onChange={(e) => { setSave(e.target.checked); onChange({ line, zoneId, save: e.target.checked, label }); }}
              />
              KEEP THIS ADDRESS
            </label>
          )}

          {session && save && (
            <Input
              placeholder="CALL IT SOMETHING — HOME, SHOP"
              value={label}
              onChange={(e) => { setLabel(e.target.value); onChange({ line, zoneId, save, label: e.target.value }); }}
            />
          )}

          {hasSaved && (
            <button
              onClick={() => setMode("pick")}
              style={{
                background: "none", border: "none", color: "var(--blue-faint)",
                fontSize: "var(--t-caption)", padding: "var(--s-3) 0",
              }}
            >
              USE A SAVED ADDRESS
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Persist an address the customer asked to keep.
 *
 * Deliberately never throws: failing to save an address must not fail the
 * order the customer actually came to place.
 */
export async function maybeSaveAddress(
  save: boolean | undefined,
  label: string | undefined,
  line: string,
  zoneId: string,
) {
  if (!save || !line) return;
  try {
    await api.addresses.create({
      label: (label || "ADDRESS").slice(0, 40),
      line,
      zone_id: zoneId || null,
    });
  } catch (e) {
    // A duplicate label is the usual cause and is not worth interrupting for.
    if ((e as ApiError).code !== "DUPLICATE") {
      console.warn("could not save address", (e as ApiError).code);
    }
  }
}
