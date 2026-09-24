import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type Profile as ProfileData } from "../../lib/api";
import { signOut } from "../../lib/auth";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";
import { ImagePicker } from "../../components/ImagePicker";

export default function Profile() {
  const nav = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    api.me().then((r) => setProfile(r.profile)).catch((e: ApiError) => setError(e.message));
  }, []);

  async function saveAvatar(blob: Blob) {
    setAvatarBusy(true);
    try {
      await api.uploads.avatar(blob);
      const fresh = await api.me();
      setProfile(fresh.profile);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  // Both hooks run before the early returns below: a hook after a return is
  // skipped on the first pass and then called on the next, which React reports
  // as "rendered more hooks than during the previous render".
  const name = profile ? (profile.display_name || profile.first_name || "YOU") : "YOU";
  const values = useMemo(() => ({
    "1:2096": `[ ${name} ]`,
    "1:2097": "EDIT PROFILE",
  }), [name]);

  if (error && !profile) return <div className="screen"><p role="alert">{error}</p></div>;
  if (!profile) return <div className="screen"><div className="sr-only">Loading profile…</div></div>;

  const avatar = profile.avatar_asset?.base_path
    ? `${import.meta.env.VITE_MEDIA_BASE}/${profile.avatar_asset.base_path}/detail.webp`
    : null;

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:2090" values={values}>
        {avatar && <img src={avatar} alt="" style={{ position: "absolute", left: 149, top: 106, width: 142, height: 139, objectFit: "cover", zIndex: 10 }} />}
        <div style={{ position: "absolute", left: 149, top: 106, width: 142, height: 139, zIndex: 22 }}>
          <ImagePicker
            size={142}
            shape="square"
            label="CHANGE PROFILE PHOTO"
            busy={avatarBusy}
            preview={null}
            onPicked={(blob) => void saveAvatar(blob)}
          />
        </div>
        <button className="figma-route-interactive" style={{ left: 0, top: 350, width: 440, height: 70 }} onClick={() => nav("/history")} aria-label="History" />
        <button className="figma-route-interactive" style={{ left: 0, top: 425, width: 440, height: 70 }} onClick={() => nav("/profile")} aria-label="Personal details" />
        <button className="figma-route-interactive" style={{ left: 0, top: 500, width: 440, height: 70 }} onClick={() => nav("/addresses")} aria-label="Saved addresses" />
        <button className="figma-route-interactive" style={{ left: 0, top: 575, width: 440, height: 70 }} onClick={() => nav("/notifications")} aria-label="Notifications" />
        <button className="figma-route-interactive" style={{ left: 20, top: 700, width: 400, height: 70 }} onClick={async () => { await signOut(); nav("/"); }} aria-label="Log out" />
      </FigmaRouteFrame>
      {error && <div className="error-state" role="alert">{error}</div>}
    </div>
  );
}
