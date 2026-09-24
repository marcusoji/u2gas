import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { rpc, select } from "../lib/db";
import { appError } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/ratelimit";

/**
 * Saved addresses (Item 7).
 *
 * Mounted at /api/me/addresses. Everything here runs through the caller's own
 * RLS-scoped client rather than the service role: the policy already restricts
 * rows to the owner, and using the admin client would mean re-implementing
 * that check by hand in four places.
 */
const addresses = new Hono<AppEnv>();

addresses.use("*", requireAuth);

const body = z.object({
  label: z.string().trim().min(1).max(40),
  line: z.string().trim().min(6).max(500),
  zone_id: z.string().uuid().optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  is_default: z.boolean().optional(),
});

function fields(e: z.ZodError) {
  return { fields: e.issues.map((i) => ({ field: i.path.join("."), message: i.message })) };
}

addresses.get("/", async (c) => {
  const rows = await select<any[]>(
    c.get("db").from("saved_address")
      .select(`
        address_id, label, line, latitude, longitude, is_default, created_at,
        zone:zone_id ( zone_id, name, fee_kobo, active )
      `)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
  );
  return c.json({ ok: true, addresses: rows });
});

addresses.post("/", rateLimit("address", 30, 60_000), async (c) => {
  const parsed = body.safeParse(await c.req.json());
  if (!parsed.success) throw appError("VALIDATION_FAILED", fields(parsed.error));

  const caller = c.get("caller")!;
  const { is_default, ...rest } = parsed.data;

  const created = await select<any>(
    c.get("db").from("saved_address")
      .insert({ ...rest, profile_id: caller.profileId })
      .select("address_id, label, line, is_default")
      .single(),
  );

  // Set the default afterwards so the unique partial index never sees two.
  if (is_default) {
    await rpc(c.get("db"), "set_default_address", { p_address_id: created.address_id });
    created.is_default = true;
  }

  return c.json({ ok: true, address: created }, 201);
});

addresses.patch("/:id", async (c) => {
  const parsed = body.partial().safeParse(await c.req.json());
  if (!parsed.success) throw appError("VALIDATION_FAILED", fields(parsed.error));

  const id = c.req.param("id");
  const { is_default, ...rest } = parsed.data;

  if (Object.keys(rest).length > 0) {
    // RLS scopes this to the owner, so no ownership check is needed here —
    // a row belonging to someone else simply is not visible to update.
    const updated = await select<any[]>(
      c.get("db").from("saved_address").update(rest).eq("address_id", id).select("address_id"),
    );
    if (!updated.length) throw appError("ADDRESS_NOT_FOUND");
  }

  if (is_default === true) {
    await rpc(c.get("db"), "set_default_address", { p_address_id: id });
  }

  return c.json({ ok: true });
});

addresses.delete("/:id", async (c) => {
  const deleted = await select<any[]>(
    c.get("db").from("saved_address")
      .delete().eq("address_id", c.req.param("id")).select("address_id"),
  );
  if (!deleted.length) throw appError("ADDRESS_NOT_FOUND");
  return c.json({ ok: true });
});

export default addresses;
