import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { AppEnv, Role } from "../src/types";
import admin from "../src/routes/admin";

/**
 * Staff lifecycle through the real admin route (migration 0024).
 *
 * The last-admin guard and the account-must-exist rule live in SQL; what these
 * prove is the route's half:
 *
 *  * add names the actor and posts a role from the assignable set only;
 *  * a role change goes through the same `admin_add_staff` upsert the ADD
 *    control uses, so the SQL rules stay in force rather than a bare `.update`
 *    writing `profile.role` directly;
 *  * remove is a DELETE that names the actor and the staff row;
 *  * a plain customer cannot reach any of it.
 */

const STAFF_ID = "22222222-2222-4222-8222-222222222222";

type Recorded = { fn: string; args: Record<string, unknown> };

function makeAdmin(profile: Record<string, unknown> | null = {
  profile_id: "p-existing",
  email: "cashier@u2gas.test",
  display_name: "ADA",
}) {
  const calls: Recorded[] = [];
  const updates: Array<Record<string, unknown>> = [];

  const admin: any = {
    from(table: string) {
      if (table === "staff_member") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: profile ? {
                  staff_id: STAFF_ID,
                  profile,
                } : null, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "admin_add_staff") {
        return { data: { staff_id: STAFF_ID, profile_id: "p-1", role: args.p_role, created: true }, error: null };
      }
      if (fn === "admin_remove_staff") {
        return { data: { staff_id: STAFF_ID, status: "removed" }, error: null };
      }
      return { data: null, error: null };
    },
  };
  return { admin, calls, updates };
}

const rateLimiter = {
  idFromName: (name: string) => name,
  get: () => ({ fetch: async () => Response.json({ allowed: true, remaining: 299 }) }),
};

function buildApp(adminClient: any, callerRole: Role) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("admin", adminClient);
    c.set("db", adminClient);
    c.set("caller", {
      authUserId: "auth-1",
      profileId: "p-actor",
      role: callerRole,
      email: "actor@u2gas.test",
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
  app.route("/admin", admin);
  return app;
}

function env() {
  return { DEPOT_ID: "depot-1", RATE_LIMITER: rateLimiter } as any;
}

async function call(callerRole: Role, method: string, path: string, body?: unknown) {
  const { admin, calls, updates } = makeAdmin();
  const app = buildApp(admin, callerRole);
  const res = await app.request(
    `/admin${path}`,
    {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
      headers: body ? { "content-type": "application/json" } : {},
    },
    env(),
  );
  return { res, calls, updates };
}

describe("staff add", () => {
  it("posts the actor and the role through admin_add_staff", async () => {
    const { res, calls } = await call("admin", "POST", "/staff", {
      email: "new@u2gas.test",
      display_name: "NEW PERSON",
      role: "staff",
    });
    expect(res.status).toBe(201);
    const add = calls.find((c) => c.fn === "admin_add_staff")!;
    expect(add.args.p_actor).toBe("p-actor");
    expect(add.args.p_role).toBe("staff");
    expect(add.args.p_email).toBe("new@u2gas.test");
  });

  it("refuses a role outside the assignable set before touching the database", async () => {
    const { res, calls } = await call("admin", "POST", "/staff", {
      email: "x@u2gas.test",
      display_name: "X",
      role: "customer",
    });
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.fn === "admin_add_staff")).toBe(false);
  });

  it("refuses a malformed account number", async () => {
    const { res } = await call("admin", "POST", "/staff", {
      email: "x@u2gas.test",
      display_name: "X",
      role: "staff",
      account_number: "123",
    });
    expect(res.status).toBe(400);
  });
});

describe("staff role change", () => {
  it("routes a role change through the upsert, not a bare profile update", async () => {
    const { res, calls, updates } = await call("admin", "PATCH", `/staff/${STAFF_ID}`, {
      role: "driver",
    });
    expect(res.status).toBe(200);
    const add = calls.find((c) => c.fn === "admin_add_staff")!;
    expect(add.args.p_role).toBe("driver");
    // The upsert is where the last-admin and account checks live; a direct
    // staff_member update here would bypass them.
    expect(updates).toHaveLength(0);
  });

  it("keeps the existing role and name when only bank fields change", async () => {
    const { res, calls, updates } = await call("admin", "PATCH", `/staff/${STAFF_ID}`, {
      bank_name: "GTB",
      account_number: "0123456789",
    });
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.fn === "admin_add_staff")).toBe(false);
    expect(updates[0]).toMatchObject({
      bank_name: "GTB",
      account_number: "0123456789",
    });
  });

  it("rejects a role outside the assignable set", async () => {
    const { res } = await call("admin", "PATCH", `/staff/${STAFF_ID}`, {
      role: "customer",
    });
    expect(res.status).toBe(400);
  });
});

describe("staff remove", () => {
  it("names the actor and the row through admin_remove_staff", async () => {
    const { res, calls } = await call("admin", "DELETE", `/staff/${STAFF_ID}`);
    expect(res.status).toBe(200);
    const del = calls.find((c) => c.fn === "admin_remove_staff")!;
    expect(del.args.p_actor).toBe("p-actor");
    expect(del.args.p_staff_id).toBe(STAFF_ID);
  });
});

describe("staff route authorisation", () => {
  it("keeps a customer off every staff control", async () => {
    for (const [method, path, body] of [
      ["GET", "/staff", undefined],
      ["POST", "/staff", { email: "x@u2gas.test", display_name: "X", role: "staff" }],
      ["PATCH", `/staff/${STAFF_ID}`, { role: "driver" }],
      ["DELETE", `/staff/${STAFF_ID}`, undefined],
    ] as const) {
      const { res } = await call("customer", method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("keeps a cashier off the roster controls", async () => {
    const { res } = await call("staff", "DELETE", `/staff/${STAFF_ID}`);
    expect(res.status).toBe(403);
  });
});
