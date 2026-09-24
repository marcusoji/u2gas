/**
 * Guest order access.
 *
 * Someone who checks out without an account gets a capability token. It is
 * kept on the device so they can reopen the order later, and it is in the URL
 * so the link survives being sent to another phone.
 *
 * Held for 30 days, matching the server-side expiry.
 */

const KEY = "u2gas.guest-orders.v1";

type Store = Record<string, { token: string; at: number }>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

export function rememberGuestOrder(orderId: string, token: string) {
  try {
    const store = read();
    store[orderId] = { token, at: Date.now() };

    // Drop anything past the server's own 30-day window rather than letting
    // this grow forever.
    const cutoff = Date.now() - 30 * 864e5;
    for (const [id, entry] of Object.entries(store)) {
      if (entry.at < cutoff) delete store[id];
    }
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Private browsing. The URL still carries the token, so the current
    // session works; only returning later is lost.
  }
}

export function guestTokenFor(orderId: string): string | undefined {
  return read()[orderId]?.token;
}

export function guestOrderIds(): string[] {
  return Object.entries(read())
    .sort((a, b) => b[1].at - a[1].at)
    .map(([id]) => id);
}
