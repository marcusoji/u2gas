import { env } from "./env";
import { ensureFreshSession } from "./supabase";

/**
 * One error type for every failed call, so screens never inspect raw
 * `Response` objects. The shape mirrors §1 of docs/FRONTEND-API-CONTRACT.md.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: Record<string, unknown>;
  /** For INSUFFICIENT_GAS: the kg actually available, else null. */
  readonly partialGasAvailable: number | null;
  /** `detail.fields` mapped to `{ field: message }`, for form highlighting. */
  readonly fieldErrors: Record<string, string> | null;
  readonly isRetryable: boolean;

  constructor(init: {
    code: string;
    status: number;
    message: string;
    detail?: Record<string, unknown>;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.detail = init.detail ?? {};

    const available = this.detail.partial_gas_available;
    this.partialGasAvailable =
      typeof available === "number" ? available : null;

    const fields = this.detail.fields;
    this.fieldErrors =
      fields && typeof fields === "object"
        ? (fields as Record<string, string>)
        : null;

    this.isRetryable = this.status >= 500 || this.code === "RETRY";
  }
}

/**
 * The bearer token is held here rather than read from Supabase on every call:
 * authStore keeps it in step with the session, and the client stays free of any
 * dependency on the auth library.
 */
let bearerToken: string | null = null;

export function setApiToken(token: string | null): void {
  bearerToken = token;
}

export function getApiToken(): string | null {
  return bearerToken;
}

/** A stable key per attempt: a retry replays instead of creating a second order. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query, guestToken?: string): string {
  const base = env.apiBase.replace(/\/$/, "");
  const url = new URL(
    `${base}${path.startsWith("/") ? path : `/${path}`}`,
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  if (guestToken) url.searchParams.set("t", guestToken);
  return url.toString();
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  token?: string | null;
  idempotencyKey?: string;
  guestToken?: string;
  signal?: AbortSignal;
  /** Internal: set on the retry so a 401 cannot loop. */
  _retried?: boolean;
}

/**
 * The single network entry point. Sends the bearer token when there is one,
 * an idempotency key when the caller supplies one, and translates a failed
 * response into an ApiError carrying the Worker's own display copy.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    query,
    token,
    idempotencyKey,
    guestToken,
    signal,
    _retried,
  } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const auth = token === undefined ? bearerToken : token;
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query, guestToken), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    // A network failure is retryable by definition: nothing was committed.
    throw new ApiError({
      code: "NETWORK",
      status: 0,
      message: "COULD NOT REACH THE SERVER — CHECK YOUR CONNECTION",
      detail: { cause: String(cause) },
    });
  }

  // An expired access token is the one failure worth retrying silently: the
  // refresh token can mint a new one, and the caller never sees the blip.
  if (response.status === 401 && !_retried && auth) {
    const session = await ensureFreshSession();
    if (session) {
      setApiToken(session.access_token);
      return apiFetch<T>(path, { ...options, token: session.access_token, _retried: true });
    }
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const envelope = (payload as { error?: Record<string, unknown> } | null)
      ?.error;
    throw new ApiError({
      code: typeof envelope?.code === "string" ? envelope.code : "INTERNAL",
      status: response.status,
      message:
        typeof envelope?.message === "string"
          ? envelope.message
          : "SOMETHING WENT WRONG",
      detail:
        envelope?.detail && typeof envelope.detail === "object"
          ? (envelope.detail as Record<string, unknown>)
          : {},
    });
  }

  return payload as T;
}

/**
 * Resolve an asset reference (a bucket-relative path or a bare filename) to a
 * URL the browser can load. Absolute URLs pass through untouched.
 */
export function mediaUrl(path?: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  const base = env.mediaBase || `${env.apiOrigin}/storage/v1/object/public/public-media`;
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
