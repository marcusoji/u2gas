import { useEffect, useState } from "react";
import { type Role } from "../lib/auth";
import { EMBEDDED_API, MOCK_ROLES, getMockRole, setMockRole } from "../mocks/gate";

/**
 * Role switch for a build with no login.
 *
 * The four apps sit behind four role gates that a real deployment authorises
 * at the server. This build has no server and no sign-in, so the switch stands
 * in for the session: it chooses which profile the embedded API answers with.
 * Without it the staff, driver and admin screens would be unreachable.
 *
 * It reads as ordinary app chrome rather than a floating badge — the point of this
 * build is to show the screens as they ship, and a banner announcing that the
 * data is fake works against that. It carries no production styling and never
 * appears in a real build.
 *
 * It sits outside the router so it is reachable from every screen, including
 * the 404, which is also why it navigates by URL rather than through router
 * context it does not have.
 */
export function MockBar() {
  const [role, setRole] = useState<Role>(getMockRole);
  const [open, setOpen] = useState(false);

  // The role can also change from a sign-out inside an app.
  useEffect(() => {
    const t = setInterval(() => setRole(getMockRole()), 500);
    return () => clearInterval(t);
  }, []);

  if (!EMBEDDED_API) return null;

  function go(next: Role) {
    setMockRole(next);
    setRole(next);
    setOpen(false);
    // Full navigation, so the guard for the app you are leaving cannot bounce
    // you back before the new role takes effect.
    const home = next === "admin" ? "/admin"
      : next === "driver" ? "/driver"
      : next === "customer" ? "/home"
      : "/staff";
    window.location.href = home;
  }

  return (
    <div className="mockbar">
      {open && (
        <div className="mockbar-panel" role="group" aria-label="View as role">
          <p className="mockbar-title">VIEW AS</p>
          <p className="mockbar-note">
            Each role opens its own app. The API answers locally, so no sign-in
            is needed.
          </p>
          {MOCK_ROLES.map((r) => (
            <button
              key={r}
              className={`mockbar-role${r === role ? " is-active" : ""}`}
              onClick={() => go(r)}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      <button
        className="mockbar-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="View as role"
      >
        <span className="mockbar-dot" aria-hidden="true" />
        {role.toUpperCase()}
      </button>
    </div>
  );
}
