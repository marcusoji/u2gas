import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./types";
import { AppError, errorBody, appError } from "./lib/errors";
import { requestId } from "./lib/crypto";
import { withClients, optionalAuth, requireAuth } from "./middleware/auth";
import { rateLimit } from "./middleware/ratelimit";
import { select, tagRequest } from "./lib/db";

import catalog from "./routes/catalog";
import orders from "./routes/orders";
import payments from "./routes/payments";
import staff from "./routes/staff";
import driver from "./routes/driver";
import admin from "./routes/admin";
import uploads from "./routes/uploads";
import addresses from "./routes/addresses";

export { RateLimiter } from "./middleware/ratelimit";

const app = new Hono<AppEnv>();

// --- Request plumbing --------------------------------------------------------

app.use("*", async (c, next) => {
  const id = requestId();
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  await next();
});

/**
 * Security headers (Part 29). The API returns JSON only, so the CSP can be
 * maximally restrictive — nothing here is ever rendered as a document.
 */
app.use("*", secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
  },
  strictTransportSecurity: "max-age=31536000; includeSubDomains; preload",
  xContentTypeOptions: "nosniff",
  // Part 30: guest capability tokens travel in query strings, so no referrer
  // may leave this origin or the token leaks to every third party linked to.
  referrerPolicy: "no-referrer",
  permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
  xFrameOptions: "DENY",
}));

/**
 * Nothing this API returns is cacheable by a shared cache: every response is
 * either someone's order or their session. Guest tokens in URLs make an
 * intermediary cache a disclosure risk. (Parts 29, 30)
 */
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
  c.header("Pragma", "no-cache");
  c.header("Vary", "Authorization, Origin");
});

/**
 * CORS (Part 28). Pinned to exactly the configured app origin — a wildcard
 * would let any page on the internet make authenticated calls with the user's
 * token. Development origins are permitted only outside production.
 */
app.use("*", (c, next) => {
  const allowed = [c.env.APP_ORIGIN];
  if (c.env.ENVIRONMENT !== "production") {
    allowed.push("http://127.0.0.1:5173", "http://localhost:5173");
  }
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Guest-Token"],
    exposeHeaders: ["X-Request-Id", "Idempotency-Replayed", "Retry-After"],
    credentials: true,
    maxAge: 86400,
  })(c, next);
});

/**
 * Fail fast and loudly on missing configuration rather than serving a broken
 * API. A missing MAIL_FROM used to fall back to a placeholder
 * sender on an unverified domain, which silently sent nothing. (Part 23)
 */
app.use("*", async (c, next) => {
  const required = ["SUPABASE_URL", "APP_ORIGIN", "DEPOT_ID", "MAIL_FROM"] as const;
  const missing = required.filter((k) => !c.env[k]);
  if (missing.length) {
    console.error("startup configuration missing", { missing });
    return c.json({ ok: false, error: { code: "MISCONFIGURED",
      message: "THIS SERVICE IS NOT CONFIGURED" } }, 503);
  }
  if (c.env.ENVIRONMENT === "production" && c.env.MAIL_FROM.includes("YOUR-DOMAIN")) {
    console.error("MAIL_FROM still contains a placeholder");
    return c.json({ ok: false, error: { code: "MISCONFIGURED",
      message: "THIS SERVICE IS NOT CONFIGURED" } }, 503);
  }
  await next();
});

app.use("*", withClients);

/**
 * Tag writes with the request id so audit rows can be traced back to a log
 * line. Only for methods that change something — a GET writes no audit row,
 * and the extra round trip would be pure latency on the read path. (Part 44)
 */
app.use("/api/*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    await tagRequest(c.get("admin"), c.get("requestId"));
  }
  await next();
});

// The webhook authenticates by signature, not by JWT, and Paystack does not
// send an Origin header — so it is mounted before the auth middleware.
app.route("/api/payments", payments);

app.use("/api/*", optionalAuth);

// --- Routes ------------------------------------------------------------------

app.get("/api/health", (c) =>
  c.json({ ok: true, environment: c.env.ENVIRONMENT, time: new Date().toISOString() }));

app.route("/api/catalog", catalog);
app.route("/api/orders", orders);
app.route("/api/staff", staff);
app.route("/api/driver", driver);
app.route("/api/admin", admin);
app.route("/api/uploads", uploads);
app.route("/api/me/addresses", addresses);

/** Who am I, and therefore which app root belongs to me. */
app.get("/api/me", requireAuth, async (c) => {
  const caller = c.get("caller")!;
  const profile = await select<any>(
    c.get("admin").from("profile")
      .select(`
        profile_id, role, display_name, first_name, last_name, email, phone,
        email_verified_at, avatar_asset ( base_path )
      `)
      .eq("profile_id", caller.profileId).single(),
  );

  const home: Record<string, string> = {
    customer: "/", staff: "/staff", manager: "/staff",
    driver: "/driver", admin: "/admin",
  };

  return c.json({ ok: true, profile, home: home[caller.role] ?? "/" });
});

app.get("/api/notifications", requireAuth, async (c) => {
  const list = await select<any[]>(
    c.get("db").from("notification")
      .select("notification_id, kind, title, body, order_id, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(Number(c.req.query("limit") ?? 50)),
  );
  return c.json({ ok: true, notifications: list });
});

app.post("/api/notifications/read", requireAuth, async (c) => {
  const caller = c.get("caller")!;
  await c.get("admin").from("notification")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", caller.profileId).is("read_at", null);
  return c.json({ ok: true });
});

// Authentication is passwordless: magic link, Google or Apple, all handled by
// Supabase Auth directly from the browser. There is deliberately no password
// reset endpoint here, because there is no password to reset. (Part 21)

// --- Errors ------------------------------------------------------------------

app.notFound((c) =>
  c.json(errorBody(appError("ORDER_NOT_FOUND"), c.get("requestId")), 404));

app.onError((err, c) => {
  const id = c.get("requestId") ?? "unknown";

  if (err instanceof AppError) {
    // Client errors are expected traffic, not incidents. Only log the rest.
    if (err.status >= 500) console.error(`[${id}] ${err.code}`, err.detail);
    return c.json(errorBody(err, id), err.status as any);
  }

  // Anything unrecognised is logged in full and reported generically. Stack
  // traces never reach the browser. (Spec 51)
  console.error(`[${id}] unhandled`, err);
  return c.json(errorBody(appError("INTERNAL"), id), 500);
});

export default app;
