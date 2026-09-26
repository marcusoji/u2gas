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
  { route: "/home", role: "customer", artboards: ["1:251", "1:175", "1:1344", "1:326", "1:583"], notes: "1:251 HOME, 1:175 INSUFFICIENT GAS INPUT when the depot cannot cover the amount, then the pay flow the file draws as three more boards: 1:1344 PAY - WALK-IN and 1:326 PAY - DELIVERY are the sheet over the terminal, and 1:583 ORDER SUMMARY is the confirmation whose Continue to Pay submits." },
  { route: "/shop", role: "customer", artboards: ["1:1438"] },
  { route: "/shop/:kind/:id", role: "customer", artboards: ["1:1462", "1:1488"] },
  { route: "/cart", role: "customer", artboards: ["1:1517", "1:1624"], notes: "1:1517 the filled basket, 1:1624 the empty one. The artboard paints its basket as one illustration, so the live lines are the BasketLine template over the card boxes the file reserves; 1:1589's ITEM UNAVAILABLE stamp is a state and stays hidden until the server refuses a line." },
  { route: "/checkout", role: "customer", artboards: ["1:1703", "1:1827", "1:1952"], notes: "1:1703 WALK-IN, 1:1827 DELIVERY with the address confirmed, 1:1952 DELIVERY with none yet. The sheet 1:1517 draws over the basket is this screen, so checkout is a route rather than a modal and each state renders the frame that already draws it." },
  { route: "/orders/:id", role: "customer", artboards: ["1:502", "1:762", "1:989", "1:421", "1:669"], notes: "1:762 RECEIPT DISPLAY once paid, 1:989 RECEIPT DISPLAY ALT the file's second drawing of the same receipt, 1:421 PAYMENT SUCCESSFUL as the payment lands, 1:669 RECEIPT PRINTING while the till prints, 1:502 PAYMENT FAILED while a verification is failing. The paid boards are one route that advances success → printing → receipt; ?receipt= picks a state directly." },
  { route: "/orders/verify", role: "customer", artboards: ["1:502", "1:421"], notes: "Verification returns to the order screen; arriving from Paystack shows 1:421 PAYMENT SUCCESSFUL first, then the receipt. 1:502 covers a failed verification." },
  { route: "/history", role: "customer", artboards: ["1:2107"], notes: "TRANS HISTORY. The drawing's receipt rows carry no data-node id, so the route renders the artboard and paints live receipts over the two card boxes the file reserves, using HistoryReceiptCard — the row template built from the drawing's measurements." },
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
  { route: "/staff/shift", role: "staff", artboards: [], notes: "No shift-reconciliation artboard; retain the functional screen. 1:4665 is STAFF PROFILE, not the shift." },
  { route: "/staff/notifs", role: "staff", artboards: ["1:4114", "1:4192", "1:4285"], notes: "1:4114 NOTIFS STATE 1 (in-person list), 1:4192 NOTIFS STATE 2 (completed list), 1:4285 NOTIFS STATE 1 (EXPANDED). One route: ?state=completed picks the second list, ?state=expanded opens the drawn card." },
  { route: "/staff/me", role: "staff", artboards: ["1:4665"], notes: "STAFF PROFILE. Same drawing as the driver profile with the role line naming the counter." },
  { route: "/admin", role: "admin", artboards: ["1:2454", "1:2299"], notes: "1:2454 DASHBOARD is the office home; 1:2299 HOME BLUEPRINT is the earlier drawing of the same screen and is shown with ?layout=blueprint. The gauge, bell and staff strip are bound to the live tank and staff." },
  { route: "/admin/tank", role: "admin", artboards: ["1:3887"], notes: "1:3887 GAS LVL CHECK. The gauge, the big available figure, the days-left line and UPDATE are bound to the live tank; the drawing's geometry is kept." },
  { route: "/admin/tank/update", role: "admin", artboards: ["1:3075"], notes: "1:3075 UPDATE GAS. The drawn stepper is the control: the figure submits, minus/plus step by a ton, and the direction is app chrome below the board." },
  { route: "/admin/tank/history", role: "admin", artboards: ["1:2847"], notes: "1:2847 GAS HISTORY. The three drawn rows are the newest entries, bound by their exact strings; the month filter is app chrome below the board because the file draws no control for it." },
  { route: "/admin/products", role: "admin", artboards: [], notes: "1:3075 is UPDATE GAS; no dedicated product-list artboard." },
  { route: "/admin/bundles/new", role: "admin", artboards: [], notes: "1:3075 is UPDATE GAS; no dedicated bundle-upload artboard." },
  { route: "/admin/orders", role: "admin", artboards: [], notes: "1:2454 is DASHBOARD; no dedicated order-list artboard." },
  { route: "/admin/people", role: "admin", artboards: ["1:2747", "1:2686", "1:2624", "1:2803"], notes: "1:2747 STAFF LAYOUT 2 is the six-up grid, 1:2686 ADD STAFF the same grid with its drawn empty slot and plus (?state=add), 1:2624 STAFF LAYOUT 1 the row of avatars with the selected person's ROLE/ACCOUNT/BANK and the drawn REMOVE STAFF (?layout=1), and 1:2803 STAFF LAYOUT 2 DETAILS the full profile of one person. All four are the file's own drawings of the roster, so each is rendered rather than approximated." },
  { route: "/admin/settings", role: "admin", artboards: [], notes: "1:3075 is UPDATE GAS; no dedicated settings artboard." },
  { route: "/admin/reports", role: "admin", artboards: [], notes: "No dedicated reports artboard; retain the functional reporting screen." },
  { route: "/admin/audit", role: "admin", artboards: [], notes: "These artboards are notification states, not the audit log; retain the functional audit screen." },
  { route: "/admin/notifs", role: "admin", artboards: ["1:3245", "1:3461", "83:246"], notes: "1:3245 NOTIF STATE 1 (list), 1:3461 NOTIF STATE 2 (empty), 83:246 Admin stock notification expanded. One route: ?state=expanded opens the drawn stock card." },
  { route: "/admin/staff/:staffId/history", role: "admin", artboards: ["1:3675", "1:3781"], notes: "1:3675 STAFF HISTORY - DRIVER (1) completed run, 1:3781 (2) the run still in progress. One screen with a scope switch, reached from a driver's detail sheet." },
];
