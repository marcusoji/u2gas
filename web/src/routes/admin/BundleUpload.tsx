import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type AdminProduct } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useImageCompressor } from "../../lib/useImageCompressor";
import {
  Input, LoadBar, Pill, Stamp, money,
} from "../../components/primitives";

type SlotMode = "empty" | "existing" | "new";

interface Slot {
  index: 1 | 2 | 3;
  mode: SlotMode;
  productId?: string;
  name: string;
  categoryId: string;
  priceKobo: number;
  stockQty: number;
  attributes: Record<string, string>;
  file?: File;
  compressed?: Blob;
  previewUrl?: string;
  /** Compression progress, 0 to 1. */
  progress: number;
  error?: string;
}

const blank = (index: 1 | 2 | 3): Slot => ({
  index, mode: "empty", name: "", categoryId: "",
  priceKobo: 0, stockQty: 0, attributes: {}, progress: 0,
});

/**
 * Three-slot compatible bundle upload (addendum 71).
 *
 * Two things make this screen worth its complexity:
 *
 *   1. Compatibility is checked live as soon as two slots are filled, against
 *      the same database rules the publish call enforces. The admin finds out
 *      before they've filled in a price, not after.
 *   2. The whole submission is atomic. If slot 3 fails, the server deletes the
 *      products and storage objects already created for slots 1 and 2. There
 *      is no half-built bundle to clean up by hand.
 */
export default function BundleUpload() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { compress } = useImageCompressor();

  const [slots, setSlots] = useState<Slot[]>([blank(1), blank(2), blank(3)]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [violations, setViolations] = useState<{ message: string }[]>([]);
  const [checked, setChecked] = useState(false);

  const [overriding, setOverriding] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    api.admin.products()
      .then((r) => { if (!cancelled) setProducts(r.products); })
      .catch((e: ApiError) => { if (!cancelled) setProductsError(e.message); });
    return () => { cancelled = true; };
  }, []);

  const filled = slots.filter((s) => s.mode !== "empty");
  const hasExistingProducts = products.length > 0;
  const canCheck = filled.length >= 2;

  /** Product ids for the compatibility call — new slots have none yet. */
  const existingIds = useMemo(
    () => filled.filter((s) => s.productId).map((s) => s.productId!),
    [filled],
  );

  const separatelyKobo = filled.reduce((sum, s) => {
    if (s.productId) {
      const p = products.find((x) => x.product_id === s.productId);
      return sum + (p?.price_kobo ?? 0);
    }
    return sum + s.priceKobo;
  }, 0);

  const priceKobo = Math.round(Number(price || 0) * 100);
  const savingKobo = Math.max(separatelyKobo - priceKobo, 0);

  // --- Live compatibility check -------------------------------------------
  useEffect(() => {
    if (!canCheck || existingIds.length < 2) {
      setChecked(false);
      setViolations([]);
      return;
    }

    let cancelled = false;
    setChecking(true);

    api.admin.checkBundle(existingIds)
      .then((r) => {
        if (cancelled) return;
        setViolations(r.violations);
        setChecked(true);
      })
      .catch(() => { if (!cancelled) setChecked(false); })
      .finally(() => { if (!cancelled) setChecking(false); });

    return () => { cancelled = true; };
  }, [existingIds.join(","), canCheck]);

  const compatible = checked && violations.length === 0;
  const isManager = profile?.role === "manager" || profile?.role === "admin";

  // Only a *known* conflict blocks publishing. A bundle made entirely of new
  // items cannot be checked here — they have no product_id yet — so requiring
  // a green check would make those bundles impossible to publish. The server
  // runs the same rules inside the transaction and refuses there if they fail.
  const blocked = violations.length > 0;

  function update(index: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s) => (s.index === index ? { ...s, ...patch } : s)));
  }

  async function pickFile(index: 1 | 2 | 3, file: File) {
    update(index, { file, progress: 0.1, error: undefined });

    try {
      // Off the main thread, so filling three slots doesn't lock the form.
      const result = await compress(file);
      update(index, {
        compressed: result.blob,
        previewUrl: URL.createObjectURL(result.blob),
        progress: 1,
      });
    } catch (e) {
      update(index, { progress: 0, error: (e as Error).message });
    }
  }

  function chooseExisting(index: 1 | 2 | 3, productId: string) {
    if (!productId) { setSlots((p) => p.map((s) => (s.index === index ? blank(index) : s))); return; }
    const p = products.find((x) => x.product_id === productId);
    update(index, {
      mode: "existing",
      productId,
      name: p?.name ?? "",
      priceKobo: p?.price_kobo ?? 0,
      previewUrl: p?.image_asset?.base_path
        ? `${import.meta.env.VITE_MEDIA_BASE}/${p.image_asset.base_path}/thumb.webp`
        : undefined,
      progress: 1,
    });
  }

  async function publish() {
    setBusy(true);
    setError(null);

    try {
      const form = new FormData();

      form.append("payload", JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        price_kobo: priceKobo,
        slots: filled.map((s) => s.productId
          ? { slot_index: s.index, product_id: s.productId, quantity: 1 }
          : {
              slot_index: s.index,
              name: s.name.trim(),
              category_id: s.categoryId,
              price_kobo: s.priceKobo,
              stock_qty: s.stockQty,
              attributes: s.attributes,
              quantity: 1,
            }),
        override_reason: overriding ? overrideReason.trim() : undefined,
      }));

      for (const s of filled) {
        if (s.compressed) form.append(`image_${s.index}`, s.compressed, `slot${s.index}.webp`);
      }

      const r = await api.uploads.bundle(form);
      nav(`/admin/products?published=${r.bundle.bundle_id}`);

    } catch (e) {
      setError(e as ApiError);
      setBusy(false);
    }
  }

  const readyToPublish =
    filled.length >= 2 &&
    name.trim().length > 0 &&
    priceKobo > 0 &&
    filled.every((s) => s.productId || (s.name && s.categoryId && s.priceKobo > 0)) &&
    (!blocked || (overriding && overrideReason.trim().length >= 10));

  return (
    <div className="screen">
      {productsError && <Stamp>{productsError}</Stamp>}
      <h1 className="screen-title">NEW BUNDLE</h1>
      <div style={{ height: "var(--s-5)" }} />

      {/* --- The three slots ----------------------------------------------- */}
      <div className="slots">
        {slots.map((s) => {
          const conflicted = violations.length > 0 && s.mode !== "empty";
          return (
            <div
              key={s.index}
              className={`slot${s.mode !== "empty" ? " is-filled" : ""}${conflicted ? " is-conflict" : ""}`}
            >
              <span className="slot-index">{String(s.index).padStart(2, "0")}</span>

              {s.mode === "empty" ? (
                <>
                  <span className="slot-plus">+</span>
                  <span className="slot-caption">
                    {s.index === 3 ? "ADD ITEM\nOPTIONAL" : "ADD ITEM"}
                  </span>
                  <select
                    className="input"
                    style={{ height: 26, fontSize: 7, padding: "0 6px", marginTop: 4 }}
                    aria-label={`Slot ${s.index} product`}
                    onChange={(e) => {
                      if (e.target.value === "__new__") update(s.index, { mode: "new" });
                      else chooseExisting(s.index, e.target.value);
                    }}
                    defaultValue=""
                  >
                    <option value="">PICK</option>
                    <option value="__new__">NEW ITEM</option>
                    {products.map((p) => (
                      <option key={p.product_id} value={p.product_id}>{p.name}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  {s.previewUrl
                    ? <img src={s.previewUrl} alt="" />
                    : <div className="slot-plus">▣</div>}

                  <span className="slot-caption">
                    {(s.name || "NEW ITEM").toUpperCase()}
                  </span>

                  {s.mode === "new" && (
                    <>
                      <input
                        ref={(el) => { fileInputs.current[s.index] = el; }}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void pickFile(s.index, f);
                        }}
                      />
                      <button
                        onClick={() => fileInputs.current[s.index]?.click()}
                        style={{
                          background: "none", border: "none",
                          fontSize: 6, color: "var(--blue)", marginTop: 2,
                        }}
                      >
                        {s.compressed ? "CHANGE PHOTO" : "ADD PHOTO"}
                      </button>
                    </>
                  )}

                  {s.progress > 0 && s.progress < 1 && (
                    <div className="meter"><i style={{ width: `${s.progress * 100}%` }} /></div>
                  )}
                  {s.progress === 1 && <div className="meter"><i style={{ width: "100%" }} /></div>}

                  <button
                    onClick={() => setSlots((p) => p.map((x) => (x.index === s.index ? blank(s.index) : x)))}
                    aria-label={`Clear slot ${s.index}`}
                    style={{
                      position: "absolute", top: 4, right: 6,
                      background: "none", border: "none",
                      fontSize: 10, color: "var(--grey)",
                    }}
                  >×</button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* --- Compatibility strip ------------------------------------------- */}
      <div className="stamp-wrap" style={{ marginTop: "var(--s-4)", minHeight: 26 }}>
        {checking && <LoadBar />}
        {!checking && compatible && (
          <Stamp tone="ok">COMPATIBLE — {filled.length} ITEMS</Stamp>
        )}
        {!checking && blocked && <Stamp>{violations[0].message}</Stamp>}
        {!checking && canCheck && existingIds.length < 2 && (
          <p className="label">NEW ITEMS ARE CHECKED WHEN YOU PUBLISH</p>
        )}
      </div>

      {/* --- New-item details ---------------------------------------------- */}
      {slots.filter((s) => s.mode === "new").map((s) => (
        <div key={s.index} className="stack is-tight" style={{ marginTop: "var(--s-5)" }}>
          <p className="label" style={{ textAlign: "left" }}>
            SLOT {s.index} — NEW ITEM
          </p>
          <Input placeholder="ITEM NAME" value={s.name}
                 onChange={(e) => update(s.index, { name: e.target.value })} />
          <select className="input" value={s.categoryId} aria-label="Category"
                  onChange={(e) => update(s.index, { categoryId: e.target.value })}>
            <option value="">CATEGORY</option>
            <option value="00000000-0000-0000-0000-0000000000c1">CYLINDER</option>
            <option value="00000000-0000-0000-0000-0000000000c2">HOSE</option>
            <option value="00000000-0000-0000-0000-0000000000c3">REGULATOR</option>
            <option value="00000000-0000-0000-0000-0000000000c4">CLAMP</option>
            <option value="00000000-0000-0000-0000-0000000000c5">BATTERY</option>
            <option value="00000000-0000-0000-0000-0000000000c6">BURNER</option>
          </select>
          <Input type="number" placeholder="PRICE IN NAIRA"
                 onChange={(e) => update(s.index, { priceKobo: Math.round(Number(e.target.value) * 100) })} />
          <Input type="number" placeholder="HOW MANY IN STOCK"
                 onChange={(e) => update(s.index, { stockQty: Number(e.target.value) })} />
          {/* Attributes are what the compatibility rules read. Without them a
              new item cannot be checked against anything. */}
          <Input placeholder="BORE IN MM (IF IT HAS ONE)"
                 onChange={(e) => update(s.index, {
                   attributes: { ...s.attributes, bore_mm: e.target.value },
                 })} />
          {s.error && <p className="field-error">{s.error}</p>}
        </div>
      ))}

      {/* --- Bundle details ------------------------------------------------ */}
      <div className="stack is-tight" style={{ marginTop: "var(--s-6)" }}>
        <Input placeholder="BUNDLE NAME" value={name}
               onChange={(e) => setName(e.target.value)} />
        <Input type="number" inputMode="decimal" placeholder="₦ BUNDLE PRICE"
               value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input placeholder="DESCRIPTION (OPTIONAL)" value={description}
               onChange={(e) => setDescription(e.target.value)} />
      </div>

      {separatelyKobo > 0 && (
        <div style={{ marginTop: "var(--s-5)" }}>
          <div className="row"><span>SEPARATELY</span><b>{money(separatelyKobo)}</b></div>
          {priceKobo > 0 && (
            <div className="row"><span>THEY SAVE</span><b>{money(savingKobo)}</b></div>
          )}
        </div>
      )}

      {error && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp>{error.message}</Stamp>
        </div>
      )}

      {/* --- Manager override ---------------------------------------------- */}
      {blocked && isManager && (
        <div style={{ marginTop: "var(--s-5)" }}>
          {!overriding ? (
            <Pill variant="ghost" onClick={() => setOverriding(true)}>
              OVERRIDE — MANAGER ONLY
            </Pill>
          ) : (
            <div className="stack is-tight">
              <p className="label">WHY ARE YOU OVERRIDING THIS</p>
              <Input
                placeholder="AT LEAST TEN CHARACTERS"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
              <p className="label" style={{ lineHeight: 2 }}>
                THIS GOES IN THE AUDIT LOG WITH YOUR NAME ON IT
              </p>
            </div>
          )}
        </div>
      )}

      {blocked && !isManager && (
        <p className="label" style={{ marginTop: "var(--s-4)", lineHeight: 2 }}>
          ONLY A MANAGER CAN PUBLISH THIS ANYWAY
        </p>
      )}

      <div style={{ marginTop: "var(--s-6)" }}>
        <Pill onClick={publish} disabled={!readyToPublish || busy}>
          {busy ? "PUBLISHING" : "PUBLISH BUNDLE"}
        </Pill>
        <Pill variant="ghost" onClick={() => nav("/admin/products")}>CANCEL</Pill>
      </div>

      <p className="label" style={{ marginTop: "var(--s-3)", lineHeight: 2 }}>
        PICTURES ARE COMPRESSED HERE BEFORE THEY'RE SENT
      </p>

      <div className="spacer" />
    </div>
  );
}
