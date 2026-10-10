import type { Role } from "../types";

/**
 * Who may act on one order.
 *
 * `authoriseOrderAccess` in routes/orders.ts reads the order row and the guest
 * token, then asks this. Kept pure and exported so the decision itself is
 * covered by a unit test rather than only by the route.
 *
 * The rule: a signed-in caller must own the order, or be staff/admin acting
 * for the counter. A guest presents the capability token for THIS order.
 * Being signed in is not ownership — a customer must not be able to reach
 * another person's order by virtue of having any account at all.
 */
export function mayAccessOrder(opts: {
  callerProfileId: string | null;
  callerRole: Role | null;
  orderUserId: string | null;
  guestTokenMatches: boolean;
}): boolean {
  if (opts.callerProfileId) {
    if (opts.orderUserId === opts.callerProfileId) return true;
    if (opts.callerRole === "staff" || opts.callerRole === "admin") return true;
    // A customer who does not own it may still be the guest who placed it,
    // and the token is what proves that.
  }
  return Boolean(opts.orderUserId === null && opts.guestTokenMatches);
}
