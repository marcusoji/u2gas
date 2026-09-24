// ============================================================================
// U2GAS — scheduled Edge Function: cleanup-assets
//
// Removes storage objects for images that were soft-deleted more than an hour
// ago, then clears their rows.
//
// This used to be bolted onto the end of expire-order-holds. Two jobs in one
// function meant a storage outage could eat the time budget of the job that
// releases customers' stock, and neither could be rescheduled independently.
// They are separate now. (Part 25)
//
// Schedule: hourly. Nothing here is urgent — the delay is deliberate, so an
// admin who deletes a product image by mistake has an hour to undo it.
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const BATCH = 200;
const TIERS = ["thumb", "grid", "detail", "source"] as const;

interface DeletedAsset {
  asset_id: string;
  bucket: string;
  base_path: string;
}

Deno.serve(async (req) => {
  // The scheduler authenticates with the service-role key. Nothing else may
  // invoke a function that deletes files.
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
  let purged = 0;
  let objectsRemoved = 0;

  try {
    for (;;) {
      const { data, error } = await db.rpc("claim_deleted_assets", { p_limit: BATCH });
      if (error) throw error;

      const assets = (data ?? []) as DeletedAsset[];
      if (!assets.length) break;

      // Group by bucket — a deployment may add a private bucket later and
      // assuming one would silently skip those files forever.
      const byBucket = new Map<string, DeletedAsset[]>();
      for (const a of assets) {
        const bucket = a.bucket || "public-media";
        (byBucket.get(bucket) ?? byBucket.set(bucket, []).get(bucket)!).push(a);
      }

      const cleared: string[] = [];

      for (const [bucket, group] of byBucket) {
        const paths = group.flatMap((a) => TIERS.map((t) => `${a.base_path}/${t}.webp`));

        const { error: rmErr } = await db.storage.from(bucket).remove(paths);

        if (rmErr) {
          // Leave the rows alone so the next run retries. Deleting the record
          // while the file survives would orphan it permanently — nothing
          // would ever know to look for it again.
          console.error("storage remove failed; rows left for retry", {
            bucket, count: paths.length, message: rmErr.message,
          });
          continue;
        }

        objectsRemoved += paths.length;
        cleared.push(...group.map((a) => a.asset_id));
      }

      if (cleared.length) {
        const { data: count, error: purgeErr } = await db.rpc("purge_assets", {
          p_ids: cleared,
        });
        if (purgeErr) throw purgeErr;
        purged += count ?? 0;
      }

      // Stop short of the function timeout; the next run picks up the rest.
      if (assets.length < BATCH || Date.now() - started > 45_000) break;
    }

    // Housekeeping that belongs on the same hourly tick. idempotency_key
    // grows by one row per unsafe request and nothing else removes them, so
    // without this the table only ever gets bigger. 24 hours is far longer
    // than any client will retry, and the lease in claim_idempotency is
    // measured in seconds.
    let keysPurged = 0;
    try {
      const { data, error } = await db.rpc("purge_idempotency_keys", {
        p_older_than: "24 hours",
      });
      if (error) throw error;
      keysPurged = data ?? 0;
    } catch (e) {
      // Not worth failing the run for; the assets are the urgent part.
      console.error("purge_idempotency_keys failed",
        e instanceof Error ? e.message : String(e));
    }

    return json({ ok: true, purged, objects_removed: objectsRemoved,
                  idempotency_keys_purged: keysPurged,
                  ms: Date.now() - started });
  } catch (err) {
    console.error("cleanup-assets failed", err instanceof Error ? err.message : String(err));
    // 500 so the schedule's own retry and alerting pick it up. Every step is
    // idempotent, so a retry resumes rather than duplicating work.
    return json({ ok: false, purged, objects_removed: objectsRemoved }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
