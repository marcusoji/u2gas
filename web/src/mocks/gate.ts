import type { Role } from "../lib/auth";

/* ---------------------------------------------------------------------------
   The demo switch, and the identity it carries.

   Kept apart from ./index.ts, which pulls in every fixture. Only the flag and
   a few localStorage reads live here, so the rest of the app can ask "are we
   in demo mode?" and "which role?" without dragging the fixtures into a
   production bundle. The fixtures are reached by dynamic import, and only
   after MOCKS_ENABLED is known to be true.
   --------------------------------------------------------------------------- */

export const MOCKS_ENABLED = import.meta.env.VITE_USE_MOCKS === "true";

export const MOCK_ROLES: Role[] = ["customer", "staff", "driver", "manager", "admin"];

export const ROLE_KEY = "u2gas.mock.role";

export const ROLE_HOME: Record<Role, string> = {
  customer: "/", staff: "/staff", manager: "/staff", driver: "/driver", admin: "/admin",
};

export function getMockRole(): Role {
  const raw = localStorage.getItem(ROLE_KEY);
  return (MOCK_ROLES as string[]).includes(raw ?? "") ? (raw as Role) : "customer";
}

export function setMockRole(role: Role): void {
  localStorage.setItem(ROLE_KEY, role);
  window.dispatchEvent(new Event("u2gas:mock-role"));
}

export function onMockRoleChange(fn: () => void): () => void {
  window.addEventListener("u2gas:mock-role", fn);
  return () => window.removeEventListener("u2gas:mock-role", fn);
}

export function mockHome(): string {
  return ROLE_HOME[getMockRole()] ?? "/";
}

/** A Supabase-shaped session, enough for `session ? … : …` to be true. */
export function mockSession(): any {
  const role = getMockRole();
  return {
    access_token: `mock-token-${role}`,
    refresh_token: "mock-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: `mock-user-${role}`,
      aud: "authenticated",
      role: "authenticated",
      email: `${role}@u2gas.ng`,
      app_metadata: {}, user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

/**
 * `?as=staff` picks a role and drops the parameter, so the four apps can be
 * linked to directly. Purely a demo convenience — nothing reads this on the
 * real path.
 */
export function bootstrapRoleFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const wanted = url.searchParams.get("as");
  if (!wanted) return;

  if (!(MOCK_ROLES as string[]).includes(wanted)) {
    url.searchParams.delete("as");
    window.history.replaceState({}, "", url.toString());
    return;
  }

  const role = wanted as Role;
  localStorage.setItem(ROLE_KEY, role);

  // `/` always renders the customer app, so a link that lands there has to
  // move to the chosen role's own root. A link that already names a route is
  // left alone — the parameter is dropped so a reload stays put.
  if (url.pathname === "/" || url.pathname === "") {
    window.location.replace(ROLE_HOME[role]);
    return;
  }
  url.searchParams.delete("as");
  window.history.replaceState({}, "", url.toString());
}
