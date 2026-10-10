import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { z } from "zod";
import { readJson, validationError } from "../src/lib/body";
import { AppError } from "../src/lib/errors";

/**
 * Body parsing and structured validation (contract §1).
 *
 * Every POST/PATCH took `await c.req.json()` straight, and an empty or
 * malformed body threw a SyntaxError that escaped to `onError` and came back as
 * a 500 — a client mistake reported as a server fault. These lock in the
 * contract: a body that cannot be parsed is VALIDATION_FAILED, and a schema
 * failure carries `detail.fields` so the form can highlight the input.
 */

function appWith(handler: (c: any) => Promise<Response> | Response) {
  const app = new Hono();
  app.post("/x", async (c) => {
    try {
      return await handler(c);
    } catch (err) {
      if (err instanceof AppError) {
        return c.json(
          { ok: false, error: { code: err.code, message: err.userMessage, detail: err.detail } },
          err.status as any,
        );
      }
      throw err;
    }
  });
  return app;
}

function post(app: Hono, body?: string, contentType = "application/json") {
  return app.request("/x", {
    method: "POST",
    body,
    headers: body === undefined ? {} : { "content-type": contentType },
  });
}

describe("readJson", () => {
  it("parses a well-formed object", async () => {
    const app = appWith(async (c) => c.json({ got: await readJson(c) }));
    const res = await post(app, JSON.stringify({ a: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ got: { a: 1 } });
  });

  it("answers VALIDATION_FAILED, not 500, for an empty body", async () => {
    const app = appWith(async (c) => c.json({ got: await readJson(c) }));
    const res = await post(app, undefined);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.detail.fields).toEqual([
      { field: "body", message: expect.any(String) },
    ]);
  });

  it("answers VALIDATION_FAILED for malformed JSON", async () => {
    const app = appWith(async (c) => c.json({ got: await readJson(c) }));
    const res = await post(app, "{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
  });

  it("answers VALIDATION_FAILED for whitespace only", async () => {
    const app = appWith(async (c) => c.json({ got: await readJson(c) }));
    const res = await post(app, "   ");
    expect(res.status).toBe(400);
  });
});

describe("validationError", () => {
  const schema = z.object({
    phone: z.string().min(11),
    quantity: z.number().int().positive(),
  });

  it("names the offending field and the reason", async () => {
    const app = appWith(async (c) => {
      const parsed = schema.safeParse(await readJson(c));
      if (!parsed.success) throw validationError(parsed.error);
      return c.json({ ok: true });
    });

    const res = await post(app, JSON.stringify({ phone: "1", quantity: 0 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");

    const fields = body.error.detail.fields;
    expect(Array.isArray(fields)).toBe(true);
    const byField = Object.fromEntries(fields.map((f: any) => [f.field, f.message]));
    expect(Object.keys(byField).sort()).toEqual(["phone", "quantity"]);
    expect(byField.phone).toBeTruthy();
    expect(byField.quantity).toBeTruthy();
  });

  it("falls back to the field name body when a path is empty", () => {
    const parsed = z.string().safeParse(42);
    if (parsed.success) throw new Error("expected a failure");
    const error = validationError(parsed.error);
    expect(error.detail.fields).toEqual([
      { field: "body", message: expect.any(String) },
    ]);
  });
});
