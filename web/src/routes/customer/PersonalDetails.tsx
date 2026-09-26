import { useEffect, useState } from "react";
import { api, ApiError, type Profile as ProfileData } from "../../lib/api";
import { BackButton } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * PERSONAL DETAILS (figma 1:2244), reached from the profile menu.
 *
 * The menu row navigated to `/profile` — the screen it was already on — so it
 * looked dead. This is the artboard it names: the fields the profile actually
 * holds, read-only.
 *
 * The route used to render `1:2210 PERSONAL DTS`, which the file marks hidden
 * (`visible: false`) and which Figma therefore does not draw at all. `1:2244
 * PERSONAL DTS 2` is its visible sibling and the only personal-details artboard
 * the file shows, so that is what is rendered.
 */
export default function PersonalDetails() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.me().then((r) => setProfile(r.profile)).catch((e: ApiError) => setError(e.message));
  }, []);

  // The two name values are drawn with the same sample text and carry no
  // data-node ids, so they are swapped by their exact text with an array, which
  // `FigmaScreen` consumes in document order: `1:2254` FIRST NAME, then
  // `1:2257` LAST NAME.
  const values = profile ? {
    "1:2260": profile.phone || "NOT SET",
    // `1:2263` is the handwritten signature. It *does* have an id, so it is
    // bound by node like every other value. It is a first name, not the full
    // name: the file draws it at 36px Homemade Apple in a 160px nowrap box, so
    // anything longer runs past the box and off the 440px artboard. The
    // brackets are the design's own signature motif (the profile screen draws
    // `[ Ade ]` the same way), so they are kept rather than stripped.
    "1:2263": `[ ${profile.first_name || profile.display_name || ""} ]`,
  } : undefined;

  const replacements = profile ? {
    "YOUR BEAUTIFUL NAME": [
      profile.first_name || "NOT SET",
      profile.last_name || "NOT SET",
    ],
  } : undefined;

  if (error && !profile) return <div className="screen"><p role="alert">{error}</p></div>;

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:2244" values={values} textReplacements={replacements}>
        <BackButton to="/profile" />
      </FigmaRouteFrame>
      {error && <div className="error-state" role="alert">{error}</div>}
    </div>
  );
}
