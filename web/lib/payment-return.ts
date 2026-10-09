/**
 * The browser state the gateway round trip needs.
 *
 * Two things must survive the full-page redirect to Monnify's checkout and
 * back, and neither belongs in the URL:
 *
 *   * the guest capability token — a bearer credential, so it lives in session
 *     storage (scoped to the tab, gone when it closes) rather than in a link
 *     the customer might share;
 *   * the merchant reference `/payments/verify` requires alongside the order id.
 *
 * Monnify redirects back with the order id in the query string but not our
 * reference, so the reference is remembered here at initialize time. It is not
 * a secret (the Worker's ownership check is what actually authorises the call),
 * but it is still kept out of the URL so a returned page does not depend on a
 * tamperable parameter.
 *
 * The key formats live here and nowhere else, so the two checkout paths that
 * write them and the return page that reads them cannot drift apart.
 */
const guestKey = (orderId: string) => `u2gas:guest:${orderId}`;
const refKey = (orderId: string) => `u2gas:payref:${orderId}`;

function store(): Storage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

export function saveGuestToken(orderId: string, token: string): void {
  store()?.setItem(guestKey(orderId), token);
}

export function readGuestToken(orderId: string): string | undefined {
  return store()?.getItem(guestKey(orderId)) ?? undefined;
}

export function savePendingReference(orderId: string, reference: string): void {
  store()?.setItem(refKey(orderId), reference);
}

export function readPendingReference(orderId: string): string | undefined {
  return store()?.getItem(refKey(orderId)) ?? undefined;
}

export function clearPendingReference(orderId: string): void {
  store()?.removeItem(refKey(orderId));
}
