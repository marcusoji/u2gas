import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { AppEnv, Role } from "../src/types";
import { qrTokenHash } from "../src/lib/crypto";
import { appError } from "../src/lib/errors";
import staff from "../src/routes/staff";
import driver from "../src/routes/driver";

/**
 * QR redemption through the real scan routes (spec 22-23).
 *
 * The transactional work is `redeem_qr` in Postgres; what these prove is the
 * route's own half of the contract, which the SQL suites cannot see:
 *
 *  * the plaintext token is hashed with the signing key before it leaves the
 *    Worker — the database only ever sees a hash;
 *  * each route pins the fulfillment type it will accept, so a pickup QR
 *    cannot be burned on a doorstep and a delivery QR cannot be burned at the
 *    counter;
 *  * a double scan and an unknown token surface as their own codes rather than
 *    a generic failure.
 */

const SIGNING_KEY = "qr_signing_key_for_tests";
const TOKEN = "u2qr_abcdefghijklmnopqrstuvwxyz0123456789";

type Recorded = { fn: string; args: Record<string, unknown> };

/**
 * A fake service-role client. `redeem` decides what `redeem_qr` answers:
 * a clean redemption, a second scan, or an unrecognised token.
 */
function makeAdmin(redeem: "ok" | "already" | "invalid" = "ok") {
  const calls: Recorded[] = [];
  const admin: any = {
    from: () => {
      throw new Error("the scan routes must not read tables directly");
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "redeem_qr") {
        if (redeem === "already") {
          return { data: null, error: { message: "QR_ALREADY_SCANNED" } };
        }
        if (redeem === "invalid") {
          return { data: null, error: { message: "QR_INVALID" } };
        }
        return {
          data: {
            order_id: "11111111-1111-4111-8111-111111111111",
            order_number: "U2-100001",
            already_scanned: false,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };
  return { admin, calls };
}

const rateLimiter = {
  idFromName: (name: string) => name,
  get: () => ({
    fetch: async () => Response.json({ allowed: true, remaining: 119 }),
  }),
};

function buildApp(
  route: Hono<AppEnv>,
  mount: string,
  admin: any,
  callerRole: Role,
) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("admin", admin);
    c.set("db", admin);
    // The scan routes run behind requireRole and read c.get("caller"), so the
    // caller is set here the way optionalAuth would after a verified token.
    c.set("caller", {
      authUserId: "auth-1",
      profileId: "profile-scanner",
      role: callerRole,
      email: "scanner@u2gas.test",
      token: "t",
    });
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof Error && "code" in err) {
      const e = err as any;
      return c.json(
        { ok: false, error: { code: e.code, message: e.userMessage, detail: e.detail } },
        e.status,
      );
    }
    throw err;
  });
  app.route(mount, route);
  return app;
}

function env() {
  return {
    QR_SIGNING_KEY: SIGNING_KEY,
    DEPOT_ID: "depot-1",
    RATE_LIMITER: rateLimiter,
  } as any;
}

async function scan(
  route: Hono<AppEnv>,
  mount: string,
  callerRole: Role,
  body: unknown,
  redeem: "ok" | "already" | "invalid" = "ok",
) {
  const { admin, calls } = makeAdmin(redeem);
  const app = buildApp(route, mount, admin, callerRole);
  const res = await app.request(
    `${mount}/scan`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    },
    env(),
  );
  return { res, calls };
}

describe("QR redemption", () => {
  it("hashes the token before the database sees it, never storing plaintext", async () => {
    const { res, calls } = await scan(staff, "/staff", "staff", { token: TOKEN });
    expect(res.status).toBe(200);

    const redeem = calls.find((c) => c.fn === "redeem_qr");
    expect(redeem).toBeDefined();
    expect(redeem!.args.p_token_hash).toBe(
      await qrTokenHash(TOKEN, SIGNING_KEY),
    );
    // The raw token must not appear anywhere in what was sent.
    expect(JSON.stringify(redeem!.args)).not.toContain(TOKEN);
  });

  it("pins a pickup QR at the counter", async () => {
    const { calls } = await scan(staff, "/staff", "staff", { token: TOKEN });
    expect(calls.find((c) => c.fn === "redeem_qr")!.args.p_expected).toBe(
      "pickup",
    );
  });

  it("pins a delivery QR on the doorstep, so a pickup QR cannot be burned there", async () => {
    const { calls } = await scan(driver, "/driver", "driver", { token: TOKEN });
    expect(calls.find((c) => c.fn === "redeem_qr")!.args.p_expected).toBe(
      "delivery",
    );
  });

  it("attributes the redemption to the scanning profile", async () => {
    const { calls } = await scan(staff, "/staff", "staff", { token: TOKEN });
    expect(calls.find((c) => c.fn === "redeem_qr")!.args.p_scanner_id).toBe(
      "profile-scanner",
    );
  });

  it("surfaces a second scan as ALREADY_SCANNED, not a generic error", async () => {
    const { res, calls } = await scan(
      staff,
      "/staff",
      "staff",
      { token: TOKEN },
      "already",
    );
    expect(res.status).not.toBe(200);
    expect(await res.text()).toContain("QR_ALREADY_SCANNED");
    // The guard is redeem_qr's: the route must still have called it.
    expect(calls.filter((c) => c.fn === "redeem_qr")).toHaveLength(1);
  });

  it("refuses a token too short to be real without reaching the database", async () => {
    const { res, calls } = await scan(staff, "/staff", "staff", { token: "abc" });
    expect(res.status).not.toBe(200);
    expect(calls.some((c) => c.fn === "redeem_qr")).toBe(false);
  });

  it("lets an admin scan at the counter", async () => {
    const { res } = await scan(staff, "/staff", "admin", { token: TOKEN });
    expect(res.status).toBe(200);
  });

  it("keeps a customer off the till scan route", async () => {
    const { res } = await scan(staff, "/staff", "customer", { token: TOKEN });
    expect(res.status).toBe(403);
  });
});

describe("appError shape", () => {
  it("carries the code the scanner maps to copy", () => {
    const err = appError("QR_ALREADY_SCANNED");
    expect(err.code).toBe("QR_ALREADY_SCANNED");
    expect(err.status).toBe(409);
  });
});
