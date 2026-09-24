import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../types";
import { fromDbError } from "./errors";

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Use only where the route has already established the caller's role, or where
 * there is no caller at all (webhooks, scheduled work). Never construct one
 * from anything the browser sent.
 */
function secretKey(env: Env): string {
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    // Refuse to start rather than run unauthenticated against Postgres.
    throw new Error("SUPABASE_SECRET_KEY is not configured");
  }
  return key;
}

function publishableKey(env: Env): string {
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;
  if (!key) throw new Error("SUPABASE_PUBLISHABLE_KEY is not configured");
  return key;
}

export function adminClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, secretKey(env), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-u2gas": "worker-service" } },
  });
}

/**
 * Client carrying the caller's JWT, so every query runs under RLS. This is the
 * default for anything acting on behalf of a person.
 */
export function userClient(env: Env, token?: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, publishableKey(env), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}

/**
 * Call a database function and translate failures on the way out.
 *
 * Every write path in this API goes through here rather than through .from().
 * That is deliberate: the transactional logic lives in Postgres, and a route
 * that reaches for .update() on an inventory table is a bug.
 */
export async function rpc<T = unknown>(
  db: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw fromDbError(error);
  return data as T;
}

/**
 * Tag the connection with this request's id so any audit row written by the
 * database carries it. (Part 44)
 *
 * Best effort on purpose: a correlation id is a diagnostic, and failing the
 * customer's order because the tag did not stick would be the wrong trade.
 * PostgREST pools connections, so this is set per call rather than once.
 */
export async function tagRequest(db: SupabaseClient, requestId: string): Promise<void> {
  try {
    await db.rpc("set_request_id", { p_request_id: requestId });
  } catch {
    // Diagnostics only. Never block the request.
  }
}

/** Read helper with the same error translation. */
export async function select<T = unknown>(
  promise: PromiseLike<{ data: T | null; error: any }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw fromDbError(error);
  return data as T;
}
