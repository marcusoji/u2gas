import { useEffect, useState } from "react";
import { type Role } from "../lib/auth";
import {
  MOCKS_ENABLED, MOCK_ROLES, ROLE_HOME, getMockRole, setMockRole,
} from "../mocks/gate";

/**
 * Demo control. Renders only when VITE_USE_MOCKS=true.
 *
 * Four apps live behind four role gates that a real deployment authorises at
 * the server. There is no server here, so this is the switch that signs you in
 * as each one — otherwise the staff, driver and admin screens are unreachable.
 *
 * It sits outside the router so it is reachable from every screen, including
 * the 404, and so it does not depend on router context.
 */
export function MockBar() {
  const [role, setRole] = useState<Role>(getMockRole);
  const [open, setOpen] = useState(false);

  // The role can also change from a sign-out inside an app.
  useEffect(() => {
    const t = setInterval(() => setRole(getMockRole()), 500);
    return () => clearInterval(t);
  }, []);

  if (!MOCKS_ENABLED) return null;

  function go(next: Role) {
    setMockRole(next);
    setRole(next);
    setOpen(false);
    // Full navigation, so the guard for the app you are leaving cannot bounce
    // you back before the new role takes effect.
    window.location.href = ROLE_HOME[next];
  }

  return (
    <div className="mockbar">
      {open && (
        <div className="mockbar-panel" role="group" aria-label="Demo role">
          <p className="mockbar-title">DEMO DATA — NOT A REAL BACKEND</p>
          <p className="mockbar-note">
            Pick who you are. Each role lands in its own app; the API, stock and
            orders are simulated in the browser.
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
        aria-label="Demo role switcher"
      >
        <span className="mockbar-dot" aria-hidden="true" />
        DEMO · {role.toUpperCase()}
      </button>
    </div>
  );
}
