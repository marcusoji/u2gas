/**
 * Route -> Figma artboard/state registry.
 *
 * This is the single source of truth for visual parity work. A route may map
 * to more than one artboard because Figma represents loading/success/failure
 * states as separate frames. The route implementation remains responsible
 * for choosing the state from real application data.
 */
export type FigmaRouteDefinition = {
  route: string;
  role: "customer" | "auth" | "staff" | "driver" | "admin";
  artboards: string[];
  notes?: string;
};

export const figmaRouteRegistry: FigmaRouteDefinition[] = [
  { route: "/", role: "auth", artboards: ["1:1219"], notes: "LOG IN 1 — the entry screen" },
  { route: "/home", role: "customer", artboards: ["1:251", "1:175"], notes: "HOME / insufficient gas" },
  { route: "/shop", role: "customer", artboards: ["1:1438"] },
  { route: "/shop/:kind/:id", role: "customer", artboards: ["1:1462", "1:1488"] },
  { route: "/cart", role: "customer", artboards: ["1:1517", "1:1624"] },
  { route: "/orders/:id", role: "customer", artboards: ["1:1344", "1:326", "1:583", "1:421", "1:502", "1:669", "1:762", "1:989"] },
  { route: "/orders/verify", role: "customer", artboards: ["1:421", "1:502"] },
  { route: "/history", role: "customer", artboards: ["1:2107"] },
  { route: "/profile", role: "customer", artboards: ["1:2090"] },
  { route: "/profile/details", role: "customer", artboards: ["1:2210"] },
  { route: "/notifications", role: "customer", artboards: [], notes: "88:55 is a FILE icon asset, not a screen artboard; keep the functional notification screen until a matching customer notification artboard is supplied."},
  { route: "/addresses", role: "customer", artboards: [], notes: "1:1952 is CHECKOUT NO DELIVERY ADDRESS, not the saved-address management screen."},
  { route: "/auth/login", role: "auth", artboards: ["1:1281"], notes: "LOG IN 2 — email entry" },
  { route: "/auth/sent", role: "auth", artboards: [], notes: "No dedicated verification-sent artboard." },
  { route: "/auth/callback", role: "auth", artboards: [], notes: "Callback is a transient routing state; do not use the login artboard as a visual substitute." },
  { route: "/driver", role: "driver", artboards: ["1:2274", "1:4683", "1:4803"] },
  { route: "/driver/drops/:id", role: "driver", artboards: [], notes: "1:4803 is the completed-deliveries list, not the delivery detail screen." },
  { route: "/driver/scan", role: "driver", artboards: ["1:4908", "1:4938"] },
  { route: "/driver/me", role: "driver", artboards: ["1:4968"] },
  { route: "/staff", role: "staff", artboards: ["1:4437", "1:4377", "1:4407"] },
  { route: "/staff/queue", role: "staff", artboards: [], notes: "No dedicated queue artboard; retain functional queue until a dynamic Figma row template is extracted." },
  { route: "/staff/walk-in", role: "staff", artboards: ["1:4466", "1:4592", "1:4047", "1:4527"] },
  { route: "/staff/collect/:orderId", role: "staff", artboards: ["1:4592", "1:4047", "1:4527"] },
  { route: "/staff/lookup", role: "staff", artboards: [], notes: "No dedicated lookup artboard; retain functional lookup until a matching Figma state is provided." },
  { route: "/staff/shift", role: "staff", artboards: [], notes: "1:4665 is STAFF PROFILE, not shift reconciliation; do not use it as a visual substitute." },
  { route: "/admin", role: "admin", artboards: ["1:2299", "1:2454", "1:3887"] },
  { route: "/admin/products", role: "admin", artboards: [], notes: "1:3075 is UPDATE GAS; no dedicated product-list artboard." },
  { route: "/admin/bundles/new", role: "admin", artboards: [], notes: "1:3075 is UPDATE GAS; no dedicated bundle-upload artboard." },
  { route: "/admin/orders", role: "admin", artboards: [], notes: "1:2454 is DASHBOARD; no dedicated order-list artboard." },
  { route: "/admin/people", role: "admin", artboards: ["1:2624", "1:2747", "1:2686", "1:2803"] },
  { route: "/admin/settings", role: "admin", artboards: [], notes: "1:3075 is UPDATE GAS; no dedicated settings artboard." },
  { route: "/admin/reports", role: "admin", artboards: [], notes: "No dedicated reports artboard; retain the functional reporting screen." },
  { route: "/admin/audit", role: "admin", artboards: [], notes: "These artboards are notification states, not the audit log; retain the functional audit screen." },
];
