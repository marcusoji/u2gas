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
  { route: "/home", role: "customer", artboards: ["1:251"], notes: "HOME. 1:175 INSUFFICIENT GAS INPUT is not rendered: the shortfall is handled on 1:251 with the file's own stamp and pill, so the terminal stays on screen." },
  { route: "/shop", role: "customer", artboards: ["1:1438"] },
  { route: "/shop/:kind/:id", role: "customer", artboards: ["1:1462", "1:1488"] },
  { route: "/cart", role: "customer", artboards: ["1:1624"], notes: "1:1517 CART - ITEM UNAVAILABLE is not rendered: an item that ran short is stamped in place on 1:1624 and can be removed, which keeps the basket visible." },
  { route: "/orders/:id", role: "customer", artboards: ["1:502", "1:762"], notes: "1:762 RECEIPT PRINTING once paid, 1:502 PAYMENT FAILED while a verification is failing. The intermediate checkout frames (1:1344 PAY - WALK-IN, 1:326 PAY - DELIVERY, 1:583 ORDER SUMMARY, 1:421 PAYMENT SUCCESSFUL, 1:669 RECEIPT PRINTING, 1:989 RECEIPT DISPLAY ALT) are not rendered — the order screen is reached after payment, and 1:762 already covers the receipt state." },
  { route: "/orders/verify", role: "customer", artboards: ["1:502"], notes: "1:421 PAYMENT SUCCESSFUL is not rendered: verification redirects to the order screen, which shows the real result from the API rather than a fixed success frame." },
  { route: "/history", role: "customer", artboards: [], notes: "1:2107 TRANS HISTORY is a fixed list of sample receipts with no data-node ids on its rows, so it cannot carry a real month-filtered history. Retain the functional list until a row template is extracted." },
  { route: "/profile", role: "customer", artboards: ["1:2090"] },
  { route: "/profile/details", role: "customer", artboards: ["1:2244"] },
  { route: "/notifications", role: "customer", artboards: [], notes: "88:55 is a FILE icon asset, not a screen artboard; keep the functional notification screen until a matching customer notification artboard is supplied."},
  { route: "/addresses", role: "customer", artboards: [], notes: "1:1952 is CHECKOUT NO DELIVERY ADDRESS, not the saved-address management screen."},
  { route: "/auth/login", role: "auth", artboards: ["1:1281"], notes: "LOG IN 2 — email entry" },
  { route: "/auth/sent", role: "auth", artboards: [], notes: "No dedicated verification-sent artboard." },
  { route: "/auth/callback", role: "auth", artboards: [], notes: "Callback is a transient routing state; do not use the login artboard as a visual substitute." },
  { route: "/driver", role: "driver", artboards: ["1:4683", "1:4803"], notes: "1:4683 open deliveries, 1:4803 the completed list. 1:2274 DRIVER HOME is not rendered: the same record list is the home screen." },
  { route: "/driver/drops/:id", role: "driver", artboards: [], notes: "1:4803 is the completed-deliveries list, not the delivery detail screen." },
  { route: "/driver/scan", role: "driver", artboards: ["1:4908", "1:4938"] },
  { route: "/driver/me", role: "driver", artboards: ["1:4968"] },
  { route: "/staff", role: "staff", artboards: ["1:4437", "1:4377", "1:4407"] },
  { route: "/staff/queue", role: "staff", artboards: [], notes: "No dedicated queue artboard; retain functional queue until a dynamic Figma row template is extracted." },
  { route: "/staff/walk-in", role: "staff", artboards: ["1:4466", "1:4592", "1:4527"], notes: "1:4047 WALK-IN PAYMENT 2 is not rendered: 1:4592 already carries the keypad and the confirmation sheet as one composite, and the route toggles between them." },
  { route: "/staff/collect/:orderId", role: "staff", artboards: ["1:4592", "1:4527"] },
  { route: "/staff/lookup", role: "staff", artboards: [], notes: "No dedicated lookup artboard; retain functional lookup until a matching Figma state is provided." },
  { route: "/staff/shift", role: "staff", artboards: [], notes: "1:4665 is STAFF PROFILE, not shift reconciliation; do not use it as a visual substitute." },
  { route: "/admin", role: "admin", artboards: [], notes: "1:3887 GAS LVL CHECK and 1:3075 UPDATE GAS were used here and recovered interaction by hit-testing click coordinates against the drawing, so the controls that moved stock had no accessible names and the rate and history were unreachable. Rebuilt as a functional screen that reuses TankGauge; the artboards are no longer rendered. See Tank.tsx." },
  { route: "/admin/tank/history", role: "admin", artboards: [], notes: "1:2847 GAS HISTORY is a static list of two sample rows with no data-node ids, so it cannot carry a real month-filtered history. Retain the functional list until a row template is extracted." },
  { route: "/admin/products", role: "admin", artboards: [], notes: "1:3075 is UPDATE GAS; no dedicated product-list artboard." },
  { route: "/admin/bundles/new", role: "admin", artboards: [], notes: "1:3075 is UPDATE GAS; no dedicated bundle-upload artboard." },
  { route: "/admin/orders", role: "admin", artboards: [], notes: "1:2454 is DASHBOARD; no dedicated order-list artboard." },
  { route: "/admin/people", role: "admin", artboards: ["1:2747", "1:2803"], notes: "1:2747 STAFF LAYOUT 2 is the grid and 1:2803 STAFF LAYOUT 2 DETAILS the selected person. 1:2624 STAFF LAYOUT 1 and 1:2686 ADD STAFF are alternative layouts for the same data, not states the screen moves between." },
  { route: "/admin/settings", role: "admin", artboards: [], notes: "1:3075 is UPDATE GAS; no dedicated settings artboard." },
  { route: "/admin/reports", role: "admin", artboards: [], notes: "No dedicated reports artboard; retain the functional reporting screen." },
  { route: "/admin/audit", role: "admin", artboards: [], notes: "These artboards are notification states, not the audit log; retain the functional audit screen." },
];
