// ============================================================================
// U2GAS — scheduled Edge Function: expire-order-holds
//
// Schedule: every minute.
//   select cron.schedule('expire-order-holds', '* * * * *', $$
//     select net.http_post(
//       url     := '<project>/functions/v1/expire-order-holds',
//       headers := jsonb_build_object('Authorization','Bearer <service_role>')
//     )$$);
//
// The function itself holds no logic. Everything that touches stock lives in
// expire_order_holds() (migration 0005, corrected in 0011), so running this
// twice at once is safe — the database does the serialising, not this file.
//
// Storage cleanup used to live here too. It is now cleanup-assets, so a
// storage outage cannot eat the time budget of the job that releases
// customers' reserved stock. (Part 25)
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const BATCH = 500;

Deno.serve(async (req) => {
  // Only the scheduler and the service role may invoke this.
  const auth = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (auth !== expected) {
    return json({ error: "forbidden" }, 403);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const started = Date.now();
  const result = { expired_orders: 0, released_reservations: 0 };

  try {
    // Loop until a batch comes back short, so a backlog drains in one run
    // rather than one batch per minute.
    for (;;) {
      const { data, error } = await db.rpc("expire_order_holds", { p_limit: BATCH });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const expired = row?.expired_orders ?? 0;
      result.expired_orders += expired;
      result.released_reservations += row?.released_reservations ?? 0;

      if (expired < BATCH) break;
      if (Date.now() - started > 45_000) break;   // leave room under the timeout
    }

    return json({ ok: true, ...result, ms: Date.now() - started });
  } catch (err) {
    // Logged in full server-side; never returned. A database error string can
    // carry table names, constraint names and values. (Parts 35, 36)
    console.error("expire-order-holds failed",
      err instanceof Error ? err.message : String(err));
    // 500 so the scheduler's own retry and alerting pick it up. Partial work
    // already committed stays committed — every step is idempotent and the
    // next run continues where this one stopped.
    return json({ ok: false, ...result }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
