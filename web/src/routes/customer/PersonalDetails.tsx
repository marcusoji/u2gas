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

  const replacements = profile ? {
    "Caleb Adeyemi": name || "NOT SET",
    "+234 801 234 5678": profile.phone || "NOT SET",
    "caleb@gmail.com": profile.email || "NOT SET",
  } : undefined;

  if (error && !profile) return <div className="screen"><p role="alert">{error}</p></div>;

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame node="1:2210" textReplacements={replacements}>
        <BackButton to="/profile" />
      </FigmaRouteFrame>
      {error && <div className="error-state" role="alert">{error}</div>}
    </div>
  );
}
