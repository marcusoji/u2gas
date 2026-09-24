import type { Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Env {
  // Secrets — set with `wrangler secret put`, never in wrangler.toml.
  SUPABASE_URL: string;

  // Current Supabase key model (Part 5). sb_publishable_... is safe in a
  // browser; sb_secret_... must never leave the Worker.
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;

  // Legacy fallbacks. Set these only on a project that predates the new keys;
  // the client factory prefers the modern pair when both are present.
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;

  // Legacy HS256 projects only. Modern projects verify through JWKS and need
  // no shared secret at all.
  SUPABASE_JWT_SECRET?: string;
  PAYSTACK_SECRET_KEY: string;
  MAIL_FROM: string;
  PAYSTACK_PUBLIC_KEY: string;
  RESEND_API_KEY: string;
  QR_SIGNING_KEY: string;

  // Public vars
  ENVIRONMENT: "development" | "production";
  APP_ORIGIN: string;
  DEPOT_ID: string;
  PAYSTACK_CALLBACK_PATH: string;

  // Bindings
  RATE_LIMITER: DurableObjectNamespace;
  CACHE: KVNamespace;
}

export type Role = "customer" | "staff" | "driver" | "manager" | "admin";

export interface Caller {
  authUserId: string;
  profileId: string;
  role: Role;
  email?: string;
  /** JWT as presented, so we can build an RLS-scoped client from it. */
  token: string;
}

/** Hono context variables. */
export interface Vars {
  caller?: Caller;
  /** Service-role client. Bypasses RLS — only use where the route has already
   *  checked the caller's role itself. */
  admin: SupabaseClient;
  /** Client scoped to the caller's JWT, so RLS applies. Prefer this. */
  db: SupabaseClient;
  requestId: string;
}

export type AppEnv = { Bindings: Env; Variables: Vars };

/**
 * The Hono context, typed once.
 *
 * Helpers that take a context were written as `c: any`, which silently gave up
 * checking on `c.env`, `c.get()` and `c.req` — the three things most likely to
 * be wrong after a refactor. Import this instead.
 */
export type Ctx = Context<AppEnv>;

/** A KV list entry. `keys.map((k: KVKey) => ...)` hid this shape. */
export interface KVKey {
  name: string;
  expiration?: number;
  metadata?: unknown;
}
