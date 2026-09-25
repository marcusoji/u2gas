import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type AdminStaff, type AdminDriver } from "../../lib/api";
import { Empty, ErrorState, LoadBar, Pill, Tabs } from "../../components/primitives";
import { Ticker } from "../../components/terminal";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

type View = "staff" | "drivers";
type Person = AdminStaff | AdminDriver;

/**
 * People uses the supplied Figma staff artboards as the visual source of truth.
 * The artboards are frozen examples, so live records drive the selection/detail
 * state while the designed geometry itself is left untouched.
 */
export default function People() {
  const [view, setView] = useState<View>("staff");
  const [rows, setRows] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Person | null>(null);

  const load = useCallback(() => {
    setRows(null);
    setSelected(null);
    setError(null);
    const req = view === "staff" ? api.admin.staff() : api.admin.drivers();
    req
      .then((r) => setRows((view === "staff" ? r.staff : r.drivers) as Person[]))
      .catch((e: ApiError) => setError(e.message));
  }, [view]);

  useEffect(load, [load]);

  if (error) return <div className="screen"><ErrorState message={error} onRetry={load} /></div>;

  const avatar = (p: Person) =>
    p.profile?.avatar_asset?.base_path
      ? `${import.meta.env.VITE_MEDIA_BASE}/${p.profile.avatar_asset.base_path}/grid.webp`
      : null;

  const available = rows?.filter((p) =>
    view === "drivers" ? p.status === "available" : p.status === "active",
  ).length ?? 0;

  // `1:2750` is the tank's AVAILABLE QUANTITY figure (laid out as three spans:
  // `<span>6</span><span>.5</span><span>4</span>`) and `1:2627` is the same
  // drawing on the other staff artboard. Neither is a count of people, and
  // neither is a single text node, so a headcount written into them would
  // prepend to the quantity ("3" + "6.54"). The file's own figure is left as
  // drawn; the real headcount is shown in the ticker below the artboard.

  if (selected) {
    const isDriver = view === "drivers";
    const values = {
      "1:2825": selected.profile?.display_name?.toUpperCase() ?? "—",
      "1:2827": isDriver
        ? (selected.status?.toUpperCase() ?? "—")
        : (selected.profile?.role?.toUpperCase() ?? "—"),
      "1:2840": isDriver
        ? (selected.phone ?? "—")
        : (selected.account_number ?? "—"),
      "1:2846": isDriver
        ? (selected.vehicle_info ?? "—")
        : (selected.bank_name ?? "—"),
    };

    return (
      <div className="screen figma-route-scroll">
        <FigmaRouteFrame node="1:2803" values={values}>
          <button
            className="figma-hit"
            aria-label="Close person details"
            style={{ left: 135, top: 735, width: 175, height: 90 }}
            onClick={() => setSelected(null)}
          />
        </FigmaRouteFrame>
      </div>
    );
  }

  if (!rows) {
    return <div className="screen" style={{ justifyContent: "center" }}><LoadBar label="LOADING STAFF" /></div>;
  }

  if (rows.length === 0) {
    return <div className="screen"><Ticker static>0 ON THE BOOKS</Ticker><Empty>NOBODY HERE YET</Empty></div>;
  }

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:2747">
        <div className="figma-people-hit-grid">
          {rows.slice(0, 6).map((person, index) => (
            <button
              key={person.staff_id ?? person.driver_id}
              className="figma-hit"
              aria-label={`Open ${person.profile?.display_name ?? "person"}`}
              style={{
                left: 50 + (index % 3) * 116,
                top: 140 + Math.floor(index / 3) * 175,
                width: 108,
                height: 140,
              }}
              onClick={() => setSelected(person)}
            />
          ))}
        </div>
      </FigmaRouteFrame>

      <div style={{ marginTop: 18 }}>
        <Ticker static>{rows.length} {view === "staff" ? "STAFF" : "DRIVERS"} · {available} ACTIVE</Ticker>
        <Tabs
          label="Who"
          value={view}
          onChange={setView}
          options={[{ value: "staff", label: "STAFF" }, { value: "drivers", label: "DRIVERS" }]}
        />
        {rows.length > 6 && (
          <p className="label" style={{ marginTop: 14 }}>
            {rows.length - 6} MORE RECORDS AVAILABLE BELOW THE DESIGNED SIX-PERSON Figma GRID.
          </p>
        )}
      </div>
    </div>
  );
}
