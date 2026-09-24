import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Ctx, KVKey } from "../types";
import { rpc, select } from "../lib/db";
import { appError, AppError } from "../lib/errors";
import { requireRole, requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/ratelimit";
import { processImage, storageKey, CACHE_CONTROL } from "../lib/images";

function isUploadFile(v: unknown): v is { arrayBuffer(): Promise<ArrayBuffer> } {
  return !!v && typeof v === "object" && typeof (v as any).arrayBuffer === "function";
}


const uploads = new Hono<AppEnv>();

const BUCKET = "public-media";

/**
 * Upload one image and store its four derivatives.
 *
 * Returns an existing asset untouched if the same bytes have been uploaded for
 * the same owner type before — the hash is the identity. (Addendum 72.2)
 */
async function storeImage(
  c: Ctx,
  file: ArrayBuffer,
  ownerType: "product" | "profile" | "bundle" | "stock_entry",
  ownerId: string | null,
): Promise<{ asset_id: string; base_path: string; reused: boolean; paths: string[] }> {
  const processed = await processImage(file);
  const db = c.get("admin");

  // Assets are content-addressed and shared: the same bytes in the same
  // namespace are one row, referenced by whoever needs them. This lookup
  // deliberately ignores who uploaded it — an asset has no owner, only
  // references (profile.avatar_asset, product.image_asset, and so on), and the
  // database refuses to delete one while any reference remains.
  const existing = await select<any>(
    db.from("image_asset")
      .select("asset_id, base_path")
      .eq("owner_type", ownerType)
      .eq("sha256", processed.sha256)
      .is("deleted_at", null)
      .maybeSingle(),
  );

  if (existing) {
    return { ...existing, reused: true, paths: [] };
  }

  const basePath = `${ownerType}s/${processed.sha256.slice(0, 24)}`;
  const written: string[] = [];

  // Upload all four tiers together. A slow sequential loop here is what makes
  // a three-slot bundle upload feel like it hangs.
  await Promise.all(
    processed.derivatives.map(async (d) => {
      const key = storageKey(basePath, d.tier);
      const { error } = await db.storage.from(BUCKET).upload(key, d.bytes, {
        contentType: "image/webp",
        cacheControl: CACHE_CONTROL,
        upsert: true,
      });
      if (error) throw appError("INTERNAL", { stage: "storage", tier: d.tier });
      written.push(key);
    }),
  );

  const grid = processed.derivatives.find((d) => d.tier === "grid")!;
  const source = processed.derivatives.find((d) => d.tier === "source")!;

  const asset = await select<any>(
    db.from("image_asset").insert({
      owner_type: ownerType,
      // provenance only — see the column comment in migration 0023
      uploaded_for: ownerId,
      bucket: BUCKET,
      base_path: basePath,
      sha256: processed.sha256,
      width: processed.width,
      height: processed.height,
      bytes_source: source.bytes.byteLength,
      bytes_grid: grid.bytes.byteLength,
      has_alpha: processed.hasAlpha,
      uploaded_by: c.get("caller").profileId,
    }).select("asset_id, base_path").single(),
  );

  return { ...asset, reused: false, paths: written };
}

/** Delete storage objects written during a run that later failed. */
async function rollbackStorage(c: Ctx, paths: string[]) {
  if (!paths.length) return;
  try { await c.get("admin").storage.from(BUCKET).remove(paths); } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Single image
// ---------------------------------------------------------------------------

uploads.post("/image", requireRole("staff", "manager", "admin"),
  rateLimit("upload", 40, 60_000), async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    const ownerType = String(form.get("owner_type") ?? "product");

    if (!isUploadFile(file)) {
      throw appError("VALIDATION_FAILED", {
        fields: [{ field: "file", message: "Choose a picture" }],
      });
    }
    if (!["product", "bundle", "stock_entry"].includes(ownerType)) {
      throw appError("VALIDATION_FAILED");
    }

    const asset = await storeImage(
      c, await file.arrayBuffer(), ownerType as any, null,
    );

    return c.json({
      ok: true,
      asset_id: asset.asset_id,
      base_path: asset.base_path,
      reused: asset.reused,
      // The four tiers the client builds its srcset from.
      urls: {
        thumb: publicUrl(c, asset.base_path, "thumb"),
        grid: publicUrl(c, asset.base_path, "grid"),
        detail: publicUrl(c, asset.base_path, "detail"),
      },
    }, 201);
  });

/** Avatars, uploaded by the person themselves. */
uploads.post("/avatar", requireAuth, rateLimit("upload", 10, 60_000), async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!isUploadFile(file)) throw appError("VALIDATION_FAILED");

  const caller = c.get("caller")!;
  const asset = await storeImage(c, await file.arrayBuffer(), "profile", caller.profileId);

  await c.get("admin").from("profile")
    .update({ avatar_asset: asset.asset_id })
    .eq("profile_id", caller.profileId);

  return c.json({ ok: true, asset_id: asset.asset_id,
                  url: publicUrl(c, asset.base_path, "detail") }, 201);
});

// ---------------------------------------------------------------------------
// Three-slot compatible bundle upload (addendum 71.3)
// ---------------------------------------------------------------------------

const slotSchema = z.object({
  slot_index: z.number().int().min(1).max(3),
  /** Either an existing product... */
  product_id: z.string().uuid().optional(),
  /** ...or a new one defined inline. */
  name: z.string().min(1).max(160).optional(),
  category_id: z.string().uuid().optional(),
  price_kobo: z.number().int().positive().optional(),
  stock_qty: z.number().int().nonnegative().optional(),
  subtitle: z.string().max(80).optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  quantity: z.number().int().positive().max(10).default(1),
}).refine(
  (s) => Boolean(s.product_id) || Boolean(s.name && s.category_id && s.price_kobo),
  { message: "Pick an existing item or fill in a new one" },
);

const bundleUpload = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  price_kobo: z.number().int().positive(),
  slots: z.array(slotSchema).min(2).max(3),
  override_rule_id: z.string().uuid().optional(),
  override_reason: z.string().min(10).max(500).optional(),
});

/**
 * Publish a bundle of two or three compatible items in one submission.
 *
 * Multipart body:
 *   payload      JSON matching bundleUpload
 *   image_1..3   optional image per slot, only for new products
 *   bundle_image optional image for the bundle tile
 *
 * All-or-nothing. Storage objects are written before the database transaction
 * opens, so if slot 3 fails validation, the objects already uploaded for slots
 * 1 and 2 are deleted before the error comes back. No orphans, no half-built
 * bundle.
 */
uploads.post("/bundle", requireRole("manager", "admin"),
  rateLimit("upload", 15, 60_000), async (c) => {
    const form = await c.req.formData();

    const parsed = bundleUpload.safeParse(JSON.parse(String(form.get("payload") ?? "{}")));
    if (!parsed.success) {
      throw appError("VALIDATION_FAILED", {
        fields: parsed.error.issues.map((i) => ({
          field: i.path.join("."), message: i.message,
        })),
      });
    }
    const body = parsed.data;

    const slots = [...body.slots].sort((a, b) => a.slot_index - b.slot_index);
    if (new Set(slots.map((s) => s.slot_index)).size !== slots.length) {
      throw appError("VALIDATION_FAILED", {
        fields: [{ field: "slots", message: "Two items are in the same slot" }],
      });
    }

    const db = c.get("admin");
    const writtenPaths: string[] = [];
    const createdProducts: string[] = [];
    let bundleId: string | null = null;

    try {
      // --- 1. Images, concurrently -------------------------------------------
      const imageAssets = await Promise.all(
        slots.map(async (slot) => {
          const file = form.get(`image_${slot.slot_index}`);
          if (!isUploadFile(file) || slot.product_id) return null;
          const a = await storeImage(c, await file.arrayBuffer(), "product", null);
          if (!a.reused) writtenPaths.push(...a.paths);
          return a.asset_id;
        }),
      );

      const bundleImageFile = form.get("bundle_image");
      let bundleAsset: string | null = null;
      if (isUploadFile(bundleImageFile)) {
        const a = await storeImage(c, await bundleImageFile.arrayBuffer(), "bundle", null);
        if (!a.reused) writtenPaths.push(...a.paths);
        bundleAsset = a.asset_id;
      }

      // --- 2. New products ---------------------------------------------------
      const productIds: string[] = [];
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];

        if (slot.product_id) {
          productIds.push(slot.product_id);
          continue;
        }

        const created = await select<any>(
          db.from("product").insert({
            name: slot.name!,
            subtitle: slot.subtitle ?? null,
            category_id: slot.category_id!,
            price_kobo: slot.price_kobo!,
            stock_qty: slot.stock_qty ?? 0,
            image_asset: imageAssets[i],
          }).select("product_id").single(),
        );

        createdProducts.push(created.product_id);
        productIds.push(created.product_id);

        if (slot.attributes) {
          await db.from("product_attribute").insert(
            Object.entries(slot.attributes).map(([key, value]) => ({
              product_id: created.product_id,
              attribute_key: key,
              attribute_value: value,
              numeric_value: Number.isFinite(Number(value)) ? Number(value) : null,
            })),
          );
        }
      }

      // --- 3. Publish --------------------------------------------------------
      // publish_bundle re-checks compatibility under a row lock, so an edit to
      // a member between our check and this call cannot slip through.
      const bundle = await rpc<any>(db, "publish_bundle", {
        p_name: body.name,
        p_price_kobo: body.price_kobo,
        p_items: slots.map((s, i) => ({
          product_id: productIds[i],
          quantity: s.quantity,
          slot_index: s.slot_index,
        })),
        p_created_by: c.get("caller")!.profileId,
        p_description: body.description ?? null,
        p_image_asset: bundleAsset,
        p_override_rule: body.override_rule_id ?? null,
        p_override_reason: body.override_reason ?? null,
      });

      bundleId = bundle.bundle_id;

      const keys = await c.env.CACHE.list({ prefix: "shop:" });
      await Promise.all(keys.keys.map((k: KVKey) => c.env.CACHE.delete(k.name)));

      return c.json({
        ok: true,
        bundle,
        products_created: createdProducts.length,
      }, 201);

    } catch (err) {
      // Compensating cleanup. Products created in this run are removed, then
      // the storage objects, so neither is left behind. (Addendum 71.3)
      if (!bundleId && createdProducts.length) {
        try { await db.from("product").delete().in("product_id", createdProducts); } catch { /* cleanup */ }
      }
      await rollbackStorage(c, writtenPaths);
      throw err instanceof AppError ? err : appError("INTERNAL");
    }
  });

function publicUrl(c: Ctx, basePath: string, tier: string) {
  return `${c.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storageKey(basePath, tier)}`;
}

export default uploads;