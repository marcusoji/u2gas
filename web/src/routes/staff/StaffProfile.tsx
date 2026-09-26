import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type Profile } from "../../lib/api";
import { signOut } from "../../lib/auth";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import { mediaUrl } from "../../lib/media";
import { ErrorState, LoadBar, Pill } from "../../components/primitives";

/**
 * Cashier profile (1:4665).
 *
 * The file draws the same header, avatar and back control as the driver's
 * profile, with the role line naming the counter. The live person and role come
 * from the session; the drawing supplies every measurement.
 */
export default function StaffProfile() {
  const nav = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.me()
      .then((r) => setProfile(r.profile))
      .catch((e: ApiError) => setError(e.message));
  }, []);

  if (error && !profile) return <div className="screen"><ErrorState message={error} /></div>;

  if (!profile) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <LoadBar label="LOADING" />
      </div>
    );
  }

  const name = profile.display_name ?? "STAFF";
  const role = profile.role === "manager" ? "Manager" : "Cashier";

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:4665" values={{ "1:4671": `[ ${name} ] - ${role}` }}>
        {profile.avatar_asset?.base_path && (
          <img
            src={mediaUrl(profile.avatar_asset.base_path, "detail")}
            alt=""
            style={{ position: "absolute", left: 149, top: 106, width: 142, height: 139, objectFit: "cover", zIndex: 10 }}
          />
        )}
        {/* The drawing puts its back control at (32,80) 52x52, on the header. */}
        <button
          className="figma-route-interactive"
          aria-label="Back"
          onClick={() => nav(-1)}
          style={{ left: 32, top: 80, width: 52, height: 52 }}
        />
        <div style={{ position: "absolute", left: 24, top: 360, width: 392, zIndex: 20 }}>
          <Pill variant="ghost" onClick={async () => { await signOut(); nav("/"); }}>SIGN OUT</Pill>
        </div>
      </FigmaRouteFrame>
    </div>
  );
}
