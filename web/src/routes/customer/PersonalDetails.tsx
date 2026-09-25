import { useEffect, useState } from "react";
import { api, ApiError, type Profile as ProfileData } from "../../lib/api";
import { BackButton } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * PERSONAL DETAILS (figma 1:2210), reached from the profile menu.
 *
 * The menu row navigated to `/profile` — the screen it was already on — so it
 * looked dead. This is the artboard it names: the three fields the profile
 * actually holds, read-only.
 */
export default function PersonalDetails() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.me().then((r) => setProfile(r.profile)).catch((e: ApiError) => setError(e.message));
  }, []);

  // The three value spans in the artboard carry no data-node ids, so the
  // designed samples are swapped by their exact text instead.
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")
    || profile?.display_name || "";

  // `1:2240` is the handwritten signature. It *does* have an id, so it is bound
  // by node like every other value. It is a first name, not the full name: the
  // file draws it at 36px Homemade Apple in a 160px nowrap box, so anything
  // longer runs past the box and off the 440px artboard. The brackets are the
  // design's own signature motif (the profile screen draws `[ Ade ]` the same
  // way), so they are kept rather than stripped.
  const signature = profile?.first_name || profile?.display_name || "";
  const values = profile && signature ? { "1:2240": `[ ${signature} ]` } : undefined;

  const replacements = profile ? {
    "Caleb Adeyemi": name || "NOT SET",
    "+234 801 234 5678": profile.phone || "NOT SET",
    "caleb@gmail.com": profile.email || "NOT SET",
  } : undefined;

  if (error && !profile) return <div className="screen"><p role="alert">{error}</p></div>;

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:2210" values={values} textReplacements={replacements}>
        <BackButton to="/profile" />
      </FigmaRouteFrame>
      {error && <div className="error-state" role="alert">{error}</div>}
    </div>
  );
}
