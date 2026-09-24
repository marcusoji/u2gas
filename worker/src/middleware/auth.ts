import type { MiddlewareHandler } from "hono";
import type { AppEnv, Caller, Role } from "../types";
import { appError, AppError } from "../lib/errors";
import { adminClient, userClient } from "../lib/db";

/**
 * Authentication and authorisation.
 *
 * Path prefixes are navigation, not security (addendum 74.2). Every protected
 * route runs requireRole here, and RLS enforces the same boundary again at the
 * database. Hiding a button is never the thing stopping anyone.
 */

import { verifyAccessToken } from "../lib/jwt";

/** Attaches clients to every request, authenticated or not. */
export const withClients: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("admin", adminClient(c.env));
  c.set("db", userClient(c.env));
  await next();
};

/**
 * Reads the bearer token if present. Does not reject anonymous callers — the
 * shop catalogue is public.
 */
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return next();

  const token = header.slice(7);
  let payload: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    payload = await verifyAccessToken(token, c.env);
  } catch {
    return next();   // a bad token is treated as no token
  }

  // The role lives in our profile table, not in the JWT, so a stale token
  // cannot carry a role that has since been revoked.
  const admin = c.get("admin");
  const { data } = await admin
    .from("profile")
    .select("profile_id, role, email, email_verified_at")
    .eq("auth_user_id", payload.sub)
    .maybeSingle();

  if (data) {
    const caller: Caller = {
      authUserId: payload.sub,
      profileId: data.profile_id,
      role: data.role as Role,
      email: data.email ?? payload.email,
      token,
    };
    c.set("caller", caller);
    c.set("db", userClient(c.env, token));
  }
  await next();
};

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("caller")) throw appError("UNAUTHENTICATED");
  await next();
};

/** Role gate. Managers and admins inherit staff access. */
export function requireRole(...allowed: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const caller = c.get("caller");
    if (!caller) throw appError("UNAUTHENTICATED");

    const effective: Role[] = [caller.role];
    if (caller.role === "manager") effective.push("staff");
    if (caller.role === "admin") effective.push("staff", "manager");

    if (!effective.some((r) => allowed.includes(r))) {
      throw appError("FORBIDDEN", { required: allowed, actual: caller.role });
    }
    await next();
  };
}

/** For flows that must not proceed on an unverified address. */
export const requireVerifiedEmail: MiddlewareHandler<AppEnv> = async (c, next) => {
  const caller = c.get("caller");
  if (!caller) throw appError("UNAUTHENTICATED");

  const { data } = await c.get("admin")
    .from("profile").select("email_verified_at")
    .eq("profile_id", caller.profileId).maybeSingle();

  if (!data?.email_verified_at) throw appError("EMAIL_NOT_VERIFIED");
  await next();
};

export { AppError };
