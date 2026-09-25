import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { signOut } from "../../lib/auth";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import {
  ErrorState, LoadBar, Pill, Segmented, Stamp, U2Mark,
} from "../../components/primitives";

type Status = "available" | "busy" | "offline";

/**
 * Driver profile and the availability toggle (spec 40).
 *
 * Going offline with an open drop is refused by the API — the order would be
 * stranded with nobody assigned — and the reason is shown here rather than
 * leaving the switch mysteriously stuck.
 */
export default function DriverMe() {
  const nav = useNavigate();
  const [driver, setDriver] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.driver.me()
      .then((r) => setDriver(r.driver))
      .catch((e: ApiError) => setError(e.message));
  }, []);

  async function change(status: Status) {
    setBusy(true);
    setBlocked(null);
    const previous = driver.status;
    setDriver({ ...driver, status });   // optimistic

    try {
      await api.driver.setStatus(status);
    } catch (e) {
      const err = e as ApiError;
      setDriver({ ...driver, status: previous });   // roll back
      setBlocked(err.fieldErrors.status ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !driver) return <div className="screen"><ErrorState message={error} /></div>;

  if (!driver) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="LOADING" />
      </div>
    );
  }

  const name = driver.profile?.display_name ?? "DRIVER";

  const values = {
    "1:4974": `[ ${name} ] - Driver`,
    "1:4975": `COMPLETED ${driver.completed_deliveries} DELIVERIES`,
  };

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:4968" values={values}>
        {driver.profile?.avatar_asset?.base_path && (
          <img
            src={`${import.meta.env.VITE_MEDIA_BASE}/${driver.profile.avatar_asset.base_path}/detail.webp`}
            alt=""
            style={{ position: "absolute", left: 149, top: 106, width: 142, height: 139, objectFit: "cover", zIndex: 10 }}
          />
        )}
        <div style={{ position: "absolute", left: 24, top: 500, width: 392, zIndex: 20 }}>
          <p className="label">ARE YOU TAKING DROPS</p>
          <div style={{ marginTop: 12 }}>
            <Segmented
              label="Availability"
              value={driver.status as Status}
              onChange={(v) => { if (!busy) void change(v); }}
              options={[
                { value: "available", label: "AVAILABLE" },
                { value: "busy", label: "BUSY" },
                { value: "offline", label: "OFFLINE" },
              ]}
            />
          </div>
          {blocked && <div className="stamp-wrap" style={{ marginTop: 16 }}><Stamp>{blocked.toUpperCase()}</Stamp></div>}
          {driver.vehicle_info && <p className="label" style={{ marginTop: 16 }}>{driver.vehicle_info.toUpperCase()}</p>}
          <div style={{ marginTop: 24 }}>
            <Pill variant="ghost" onClick={async () => { await signOut(); nav("/"); }}>SIGN OUT</Pill>
          </div>
        </div>
      </FigmaRouteFrame>
    </div>
  );
}