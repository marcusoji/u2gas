import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type AdminStaff, type AdminDriver } from "../../lib/api";
import {
  ErrorState, Input, LoadBar, Pill, Segmented, Sheet, Stamp,
} from "../../components/primitives";
import { Ticker } from "../../components/terminal";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

type View = "staff" | "drivers";
type Person = AdminStaff | AdminDriver;

/**
 * The counter's own vocabulary for a role. The `staff` role is what the
 * database calls a cashier, which is the word every drawing uses.
 */
const ROLE_LABEL: Record<string, string> = {
  staff: "CASHIER", manager: "MANAGER", admin: "ADMIN", driver: "DRIVER",
};

const roleOf = (p: Person | null, view: View): string | null => {
  if (!p) return null;
  if (view === "drivers") return "DRIVER";
  const r = (p as AdminStaff).profile?.role ?? (p as AdminStaff).role;
  return r ? (ROLE_LABEL[r] ?? r.toUpperCase()) : "STAFF";
};

/**
 * The office roster. The file draws the same data three ways and the route
 * renders each drawing rather than approximating one:
 *
 *   1:2747 STAFF LAYOUT 2         the six-up grid                    /admin/people
 *   1:2686 ADD STAFF              the grid with its empty add slot    ?state=add
 *   1:2624 STAFF LAYOUT 1         a row of avatars, the selected
 *                                 person's ROLE / ACCOUNT / BANK and
 *                                 the drawn REMOVE STAFF              ?layout=1
 *   1:2803 STAFF LAYOUT 2 DETAILS the full profile of one person      a selection
 *
 * The grid tiles and the two boards' name/role texts carry no `data-node` id,
 * so live records are bound by their exact drawn strings, consumed in document
 * order (see `FigmaScreen`). The ADD board's empty slot is left exactly as the
 * file draws it — it is the affordance, not a missing record.
 */
export default function People() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>("staff");
  const [rows, setRows] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Person | null>(null);

  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Person | null>(null);

  const layoutOne = params.get("layout") === "1";
  const addState = params.get("state") === "add";

  const load = useCallback(() => {
    setRows(null);
    setSelected(null);
    setError(null);
    if (view === "staff") {
      api.admin.staff()
        .then((r) => setRows(r.staff))
        .catch((e: ApiError) => setError(e.message));
    } else {
      api.admin.drivers()
        .then((r) => setRows(r.drivers))
        .catch((e: ApiError) => setError(e.message));
    }
  }, [view]);

  useEffect(load, [load]);

  // The drawn grid has six slots. `null` means "leave the file's own text" —
  // used for the ADD board's empty slot, which is the add affordance and must
  // not be overwritten with a record.
  const slots = useMemo<(Person | null)[]>(() => {
    const people = (rows ?? []).slice(0, 6);
    if (addState) {
      return [people[0] ?? null, people[1] ?? null, null, people[2] ?? null, people[3] ?? null, people[4] ?? null];
    }
    return [0, 1, 2, 3, 4, 5].map((i) => people[i] ?? null);
  }, [rows, addState]);

  // The samples the file draws, and the slots that draw each one. 1:2747 and
  // 1:2686 differ only in the third tile, so both are covered by one table.
  const gridValues = useMemo(() => {
    const text: Record<string, string | string[]> = {};
    const slotsFor = (sample: string, at: number[], pick: (p: Person) => string) => {
      const filled = at.map((i) => {
        const p = slots[i];
        return p ? pick(p) : sample;
      });
      if (filled.every((v) => v === sample)) return;   // nothing bound
      text[sample] = filled;
    };
    slotsFor("SMITH",   [0, 3], (p) => (p.profile?.display_name ?? "—").toUpperCase());
    slotsFor("SARA",    [1, 2, 4], (p) => (p.profile?.display_name ?? "—").toUpperCase());
    slotsFor("JOHN",    [5], (p) => (p.profile?.display_name ?? "—").toUpperCase());
    slotsFor("MANAGER", [0, 3], (p) => roleOf(p, view) ?? "STAFF");
    slotsFor("CASHIER", [1, 2, 4], (p) => roleOf(p, view) ?? "STAFF");
    slotsFor("DRIVER",  [5], (p) => roleOf(p, view) ?? "STAFF");
    return text;
  }, [slots, view]);

  // 1:2624's row of four, then its ROLE / ACCOUNT NUMBER / BANK block. Every
  // one of those nodes has an id, so they bind by value rather than by text.
  // A slot with no record keeps the file's own sample — the drawing's MICAH is
  // the honest state for "nobody in this slot", not a dash standing in for one.
  const rowValues = useMemo(() => {
    const people = (rows ?? []).slice(0, 4);
    const name = (p: Person) => (p.profile?.display_name ?? "—").toUpperCase();
    const role = (p: Person) => roleOf(p, view) ?? "STAFF";
    const slots: [nameNode: string, roleNode: string][] = [
      ["1:2648", "1:2649"], ["1:2653", "1:2654"],
      ["1:2658", "1:2659"], ["1:2663", "1:2664"],
    ];
    const out: Record<string, string> = {};
    slots.forEach(([nameNode, roleNode], i) => {
      const p = people[i];
      if (!p) return;
      out[nameNode] = name(p);
      out[roleNode] = role(p);
    });
    const sel = (selected as AdminStaff | null) ?? people[0] ?? null;
    if (sel) {
      out["1:2677"] = role(sel);
      out["1:2670"] = (sel as AdminStaff).account_number ?? "—";
      out["1:2683"] = (sel as AdminStaff).bank_name ?? "—";
    }
    return out;
  }, [rows, view, selected]);

  if (error) return <div className="screen"><ErrorState message={error} onRetry={load} /></div>;

  const setQuery = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v) q.set(k, v); else q.delete(k); }
    setParams(q, { replace: true });
  };

  /* --- One person, full profile (1:2803) ---------------------------------- */
  if (selected) {
    const isDriver = view === "drivers";
    const driver = isDriver ? (selected as AdminDriver) : null;
    const staff = isDriver ? null : (selected as AdminStaff);
    const values = {
      "1:2825": selected.profile?.display_name?.toUpperCase() ?? "—",
      "1:2827": isDriver ? (driver!.status?.toUpperCase() ?? "—") : (roleOf(selected, view) ?? "—"),
      // The board is the staff drawing, so a driver's two figures are shown
      // under their own labels rather than under ACCOUNT NUMBER and BANK.
      "1:2839": isDriver ? "PHONE" : "ACCOUNT NUMBER",
      "1:2840": isDriver ? (driver!.phone ?? "—") : (staff!.account_number ?? "—"),
      "1:2845": isDriver ? "VEHICLE" : "BANK",
      "1:2846": isDriver ? (driver!.vehicle_info ?? "—") : (staff!.bank_name ?? "—"),
    };

    return (
      <div className="screen figma-route-scroll">
        <button className="screen-back" onClick={() => setSelected(null)}>BACK TO THE ROSTER</button>
        <FigmaRouteFrame node="1:2803" values={values}>
          {/* The drawn REMOVE STAFF. A driver is not a staff_member row, so the
              same control is inert for them rather than removing the wrong thing. */}
          <button
            className="figma-route-interactive"
            aria-label="Remove from staff"
            disabled={!staff}
            onClick={() => staff && setRemoving(staff)}
            style={{ left: 144, top: 750, width: 152, height: 51 }}
          />
          {isDriver && (
            <button
              className="figma-route-interactive"
              aria-label="Open delivery history"
              onClick={() => nav(`/admin/staff/${(selected as AdminDriver).driver_id}/history`)}
              style={{ left: 120, top: 165, width: 200, height: 200 }}
            />
          )}
        </FigmaRouteFrame>
        <RemoveSheet person={removing} onClose={() => setRemoving(null)}
          onDone={() => { setRemoving(null); setSelected(null); load(); }} />
      </div>
    );
  }

  if (!rows) {
    return <div className="screen" style={{ justifyContent: "center" }}><LoadBar label="LOADING STAFF" /></div>;
  }

  const available = rows.filter((p) =>
    view === "drivers" ? (p as AdminDriver).status === "available" : (p as AdminStaff).status === "active",
  ).length;

  /* --- The ADD STAFF board (1:2686) --------------------------------------- */
  if (addState && view === "staff") {
    return (
      <div className="screen figma-route-scroll">
        <FigmaRouteFrame node="1:2686" textReplacements={gridValues}>
          <button className="figma-route-interactive" aria-label="Back to the roster"
            onClick={() => setQuery({ state: null })} style={{ left: 12, top: 6, width: 48, height: 44 }} />
          <button className="figma-route-interactive" aria-label="Notifications"
            onClick={() => nav("/admin/notifs")} style={{ left: 362, top: 63, width: 50, height: 56 }} />
          {/* The plus the file draws at (351,145) in the empty slot. */}
          <button className="figma-route-interactive" aria-label="Add a staff member"
            onClick={() => setAdding(true)} style={{ left: 345, top: 139, width: 40, height: 40 }} />
        </FigmaRouteFrame>
        <div style={{ marginTop: 18 }}>
          <Ticker static>{rows.length} ON THE BOOKS · {available} ACTIVE</Ticker>
        </div>
        <AddSheet open={adding} onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); setQuery({ state: null }); load(); }} />
      </div>
    );
  }

  /* --- The row layout (1:2624 STAFF LAYOUT 1) ----------------------------- */
  if (layoutOne && view === "staff") {
    const tiles = [[28, 162], [144, 162], [260, 162], [376, 162]];
    return (
      <div className="screen figma-route-scroll">
        <FigmaRouteFrame node="1:2624" values={rowValues}>
          <button className="figma-route-interactive" aria-label="Back to the grid"
            onClick={() => setQuery({ layout: null })} style={{ left: 12, top: 6, width: 48, height: 44 }} />
          <button className="figma-route-interactive" aria-label="Notifications"
            onClick={() => nav("/admin/notifs")} style={{ left: 362, top: 63, width: 50, height: 56 }} />
          {rows.slice(0, 4).map((person, i) => (
            <button
              key={(person as AdminStaff).staff_id}
              className="figma-route-interactive"
              aria-label={`Open ${person.profile?.display_name ?? "person"}`}
              onClick={() => setSelected(person)}
              style={{ left: tiles[i][0], top: tiles[i][1], width: 100, height: 100 }}
            />
          ))}
          {/* The drawn REMOVE STAFF applies to whoever the block shows. */}
          <button className="figma-route-interactive" aria-label="Remove from staff"
            disabled={!rows.length}
            onClick={() => rows[0] && setRemoving(rows[0])}
            style={{ left: 144, top: 670, width: 152, height: 51 }} />
        </FigmaRouteFrame>
        <div style={{ marginTop: 18 }}>
          <Ticker static>{rows.length} ON THE BOOKS · {available} ACTIVE</Ticker>
        </div>
        <RemoveSheet person={removing} onClose={() => setRemoving(null)}
          onDone={() => { setRemoving(null); load(); }} />
      </div>
    );
  }

  /* --- The grid (1:2747 STAFF LAYOUT 2) ----------------------------------- */
  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:2747" textReplacements={gridValues}>
        <button className="figma-route-interactive" aria-label="Notifications"
          onClick={() => nav("/admin/notifs")} style={{ left: 362, top: 63, width: 50, height: 56 }} />
        {rows.slice(0, 6).map((person, index) => (
          <button
            key={(person as AdminStaff).staff_id ?? (person as AdminDriver).driver_id}
            className="figma-route-interactive"
            aria-label={`Open ${person.profile?.display_name ?? "person"}`}
            onClick={() => setSelected(person)}
            style={{
              left: 54 + (index % 3) * 116,
              top: 147 + Math.floor(index / 3) * 175,
              width: 100,
              height: 100,
            }}
          />
        ))}
      </FigmaRouteFrame>

      <div style={{ marginTop: 18 }}>
        <Ticker static>{rows.length} {view === "staff" ? "STAFF" : "DRIVERS"} · {available} ACTIVE</Ticker>
        <Segmented
          label="Who"
          value={view}
          onChange={setView}
          options={[{ value: "staff", label: "STAFF" }, { value: "drivers", label: "DRIVERS" }]}
        />
        {view === "staff" && (
          <div style={{ marginTop: 12 }}>
            <Pill onClick={() => setQuery({ state: "add" })}>ADD STAFF</Pill>
            {/* The file draws the row layout too (1:2624); this is how it is seen. */}
            <Pill variant="ghost" onClick={() => setQuery({ layout: "1" })}>ROW LAYOUT</Pill>
          </div>
        )}
        {rows.length > 6 && (
          <p className="label" style={{ marginTop: 14 }}>
            {rows.length - 6} MORE RECORDS AVAILABLE BELOW THE DESIGNED SIX-PERSON Figma GRID.
          </p>
        )}
      </div>
    </div>
  );
}

/** The drawn plus opens this. The board has no fields, so the form is app chrome. */
function AddSheet({ open, onClose, onDone }: {
  open: boolean; onClose: () => void; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "manager" | "admin" | "driver">("staff");
  const [bank, setBank] = useState("");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await api.admin.addStaff({
        email: email.trim(),
        display_name: name.trim(),
        role,
        bank_name: bank.trim() || undefined,
        account_number: account.trim() || undefined,
      });
      setName(""); setEmail(""); setBank(""); setAccount(""); setRole("staff");
      onDone();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally { setBusy(false); }
  }

  const valid = name.trim().length > 0 && /.+@.+\..+/.test(email.trim())
    && (!account.trim() || /^[0-9]{10}$/.test(account.trim()));

  return (
    <Sheet open={open} onClose={onClose} label="Add a staff member">
      <p className="label">WHO IS JOINING</p>
      <div style={{ marginTop: 12 }}>
        <Input placeholder="FULL NAME" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Input type="email" inputMode="email" placeholder="EMAIL" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div style={{ marginTop: 16 }}>
        <Segmented
          label="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: "staff", label: "CASHIER" },
            { value: "manager", label: "MANAGER" },
            { value: "admin", label: "ADMIN" },
            { value: "driver", label: "DRIVER" },
          ]}
        />
      </div>
      <div style={{ marginTop: 16 }}>
        <Input placeholder="BANK (OPTIONAL)" value={bank} onChange={(e) => setBank(e.target.value)} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Input inputMode="numeric" placeholder="ACCOUNT NUMBER (OPTIONAL)" value={account} onChange={(e) => setAccount(e.target.value)} />
      </div>
      <p className="label" style={{ marginTop: 14, lineHeight: 2 }}>
        THEY MUST HAVE AN ACCOUNT FIRST — SEND A SUPABASE INVITE TO THIS EMAIL,
        THEN ADD THEM HERE AND THE ROLE TAKES EFFECT IMMEDIATELY
      </p>
      {err && <div className="stamp-wrap" style={{ marginTop: 12 }}><Stamp>{err}</Stamp></div>}
      <div style={{ marginTop: 16 }}>
        <Pill onClick={submit} disabled={busy || !valid}>{busy ? "ADDING" : "ADD TO THE ROSTER"}</Pill>
        <Pill variant="ghost" onClick={onClose}>CANCEL</Pill>
      </div>
    </Sheet>
  );
}

/** The drawn REMOVE STAFF confirms first: the row keeps the person's sales. */
function RemoveSheet({ person, onClose, onDone }: {
  person: Person | null; onClose: () => void; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!person || busy) return;
    setBusy(true); setErr(null);
    try {
      await api.admin.removeStaff((person as AdminStaff).staff_id);
      onDone();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally { setBusy(false); }
  }

  const name = person?.profile?.display_name?.toUpperCase() ?? "";
  return (
    <Sheet open={!!person} onClose={onClose} label="Remove from staff">
      <p className="label">TAKE {name || "THIS PERSON"} OFF THE ROSTER</p>
      <p className="label" style={{ marginTop: 14, lineHeight: 2 }}>
        THEIR SALES AND HISTORY STAY. THEY LOSE TILL ACCESS STRAIGHT AWAY.
      </p>
      {err && <div className="stamp-wrap" style={{ marginTop: 12 }}><Stamp>{err}</Stamp></div>}
      <div style={{ marginTop: 16 }}>
        <Pill variant="danger" onClick={submit} disabled={busy}>{busy ? "REMOVING" : "REMOVE STAFF"}</Pill>
        <Pill variant="ghost" onClick={onClose}>KEEP THEM</Pill>
      </div>
    </Sheet>
  );
}
