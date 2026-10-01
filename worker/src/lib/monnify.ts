import type { AppEnv } from "../types";
import { appError } from "./errors";

/**
 * Monnify gateway helpers, shared by the payments route and the admin refund
 * route. Both need a token and both need the same amount convention, and
 * duplicating either is how the two paths drift apart.
 */

const MONNIFY = "https://api.monnify.com";

/** Monnify's host. `MONNIFY_BASE_URL` overrides it to point at sandbox. */
export function monnifyBase(env: AppEnv["Bindings"]): string {
  return (env.MONNIFY_BASE_URL ?? MONNIFY).replace(/\/$/, "");
}

/**
 * Amounts.
 *
 * Monnify's API speaks **naira as a decimal**, where Paystack spoke kobo as an
 * integer — `5000.00`, not `500000`. Every amount that crosses the boundary
 * goes through these two, and nowhere else, so a kobo/naira mix-up cannot hide
 * in a stray call site. This is the most dangerous difference in the migration:
 * passing kobo straight through would charge one hundred times the total.
 */
export const koboToNaira = (kobo: number): number => Math.round(kobo) / 100;

export const nairaToKobo = (naira: number | string): number =>
  Math.round(Number(naira) * 100);

/**
 * Monnify access token.
 *
 * Monnify has no static bearer key. It mints a short-lived token from the
 * API-key/secret pair via HTTP Basic, and every other call carries it. The
 * token lasts an hour, so it is cached in KV for slightly less than that
 * rather than re-minted per request — the auth endpoint is rate-limited and a
 * token per checkout would burn it.
 */
export async function monnifyToken(
  env: AppEnv["Bindings"],
  cache: KVNamespace,
): Promise<string> {
  const CACHE_KEY = "monnify:token";

  const cached = await cache.get(CACHE_KEY).catch(() => null);
  if (cached) return cached;

  const credentials = btoa(`${env.MONNIFY_API_KEY}:${env.MONNIFY_SECRET_KEY}`);
  const res = await fetch(`${monnifyBase(env)}/api/v1/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}` },
  });

  const json = await res.json() as any;
  const token = json?.responseBody?.accessToken;
  if (!res.ok || !token) {
    console.error("monnify auth failed", { status: res.status });
    throw appError("MONNIFY_INIT_FAILED");
  }

  // Monnify issues 3600s. Renew a minute early so a token cannot expire
  // mid-flight; KV's minimum TTL is 60s, so this is safe either way.
  await cache.put(CACHE_KEY, token, { expirationTtl: 3540 }).catch(() => {});
  return token;
}

/**
 * Monnify's response envelope is `{ requestSuccessful, responseBody }` and it
 * answers 200 with `requestSuccessful: false` for a business rejection, so the
 * status code alone never tells you whether the call worked.
 */
export function monnifyOk(res: Response, json: any): boolean {
  return res.ok && json?.requestSuccessful !== false;
}

/**
 * Monnify's own id for a transaction.
 *
 * A refund is requested with `transactionReference` (Monnify's id), not with
 * the `paymentReference` we created — the merchant reference is not accepted
 * there. The verify payload carries `transactionReference`; the webhook's
 * eventData does not, so for a webhook-sourced payment the id is recovered
 * from the stored raw payload.
 */
export function monnifyTransactionReference(data: any): string | null {
  const direct = data?.transactionReference;
  if (typeof direct === "string" && direct) return direct;

  const product = data?.product;
  if (product && typeof product.reference === "string" && product.reference) {
    return product.reference;
  }
  return null;
}

/**
 * Whether Monnify will refund a payment, given how it was made.
 *
 * Monnify refunds bank transfers only. Its error table is explicit: R2,
 * "Refund not permitted for specified transaction — Refund is currently only
 * possible for payments via Account_Transfer." A card payment is therefore
 * refused outright, however healthy the wallet is, so there is no point
 * spending a gateway call to be told so.
 *
 * The rule lives here rather than inline in the route so the route and its
 * test cannot drift apart.
 *
 * An unknown method answers `true`. A payload that does not say how the
 * customer paid must not block a refund that would have gone through — the
 * gateway stays the authority when we do not know.
 */
export function monnifyRefundable(paymentMethod: unknown): boolean {
  if (typeof paymentMethod !== "string" || !paymentMethod) return true;
  return paymentMethod.toUpperCase() === "ACCOUNT_TRANSFER";
}

/** `metaData` arrives as an object of strings, or as a JSON string. Accept both. */
export function monnifyMeta(data: any): any {
  const raw = data?.metaData;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
