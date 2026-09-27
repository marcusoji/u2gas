import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type Profile } from "../../lib/api";
import { signOut } from "../../lib/auth";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import { mediaUrl } from "../../lib/media";
import { AvatarUpload } from "../../components/AvatarUpload";
import { ErrorState, LoadBar, OptionalBack, Pill } from "../../components/primitives";

/**
 * Office profile (1:4665).
 *
 * The file draws one person profile — the driver's (1:4968) and the cashier's
 * (1:4665) are the same screen with the role line changed — and the office is
 * the third person who signs in, so it is the same drawing again. There is no
 * separate admin artboard to render, and inventing a fifth layout would put the
 * office outside the design the rest of the product is drawn from.
 *
 * The avatar slot is why the route exists at all: every signed-in user owns a
 * profile row with an `avatar_asset`, and the office had nowhere to set theirs.
 * The drawing has the frame but no control to fill it, so `AvatarUpload` sits
 * on the drawn slot.
 */
export default function AdminProfile() {
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

  const name = profile.display_name ?? "ADMIN";
  const role = "Admin";

  return (
    <div className="screen figma-route-scroll">
      <OptionalBack to="/admin" />
      <FigmaRouteFrame node="1:4665" values={{ "1:4671": `[ ${name} ] - ${role}` }}>
        {profile.avatar_asset?.base_path && (
          <img
            src={mediaUrl(profile.avatar_asset.base_path, "detail")}
            alt=""
            style={{ position: "absolute", left: 149, top: 106, width: 142, height: 139, objectFit: "cover", zIndex: 10 }}
          />
        )}
        <AvatarUpload basePath={profile.avatar_asset?.base_path} left={149} top={106} />
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
