import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type AdminProduct } from "../../lib/api";
import {
  Empty, ErrorState, Input, LoadBar, Modal, Pill, ProductImage, Stamp, money,
} from "../../components/primitives";
import { ImagePicker } from "../../components/ImagePicker";
import { Ticker } from "../../components/terminal";

/**
 * Accessories inventory. The prototype had no admin view of this at all, which
 * left the whole accessory side of the business unmanageable.
 *
 * Stock is adjusted by a delta, never by typing an absolute figure — setting
 * stock_qty directly would silently corrupt reservation accounting if an order
 * landed between the read and the write.
 */
export default function Products() {
  const nav = useNavigate();
  const [params] = useSearchParams();

  const [items, setItems] = useState<AdminProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [delta, setDelta] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", price: "", stock: "", category_id: "" });
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [draftPreview, setDraftPreview] = useState<string | null>(null);
  const loadSeq = useRef(0);

  /**
   * Add a product that is not part of a bundle.
   *
   * The backend has always accepted this; until now the only way to create a
   * product was through the three-slot bundle upload, so a depot that started
   * stocking one new hose had to invent a bundle to list it.
   */
  async function create() {
    setBusy(true);
    setModalError(null);
    try {
      await api.admin.createProduct({
        name: draft.name.trim(),
        price_kobo: Math.round(Number(draft.price) * 100),
        stock_qty: draft.stock ? Number(draft.stock) : 0,
        category_id: draft.category_id || undefined,
        image_asset: draftImage ?? undefined,
      });
      setCreating(false);
      setDraft({ name: "", price: "", stock: "", category_id: "" });
      setDraftImage(null);
      setDraftPreview(null);
      load();
    } catch (e) {
      setModalError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  /** Upload before create, so the id exists when the product is inserted. */
  async function pickDraftImage(blob: Blob, preview: string) {
    setImageBusy(true);
    setModalError(null);
    try {
      const { asset_id } = await api.uploads.image(blob, "product");
      setDraftImage(asset_id);
      setDraftPreview(preview);
    } catch (e) {
      setModalError((e as ApiError).message);
    } finally {
      setImageBusy(false);
    }
  }

  /**
   * Attach a picture to the product being edited.
   *
   * Uploaded and linked immediately rather than on Save: the upload is the
   * slow part, and holding it until Save means a failed network call loses
   * both the picture and the price change the person also made.
   */
  async function saveImage(blob: Blob) {
    if (!editing) return;
    setImageBusy(true);
    setModalError(null);
    try {
      const { asset_id } = await api.uploads.image(blob, "product");
      await api.admin.updateProduct(editing.product_id, { image_asset: asset_id });
      load();
    } catch (e) {
      setModalError((e as ApiError).message);
    } finally {
      setImageBusy(false);
    }
  }

  const published = params.get("published");

  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    setError(null);
    api.admin.products()
      .then((r) => { if (seq === loadSeq.current) setItems(r.products); })
      .catch((e: ApiError) => { if (seq === loadSeq.current) setError(e.message); });
  }, []);

  useEffect(load, [load]);

  function open(p: AdminProduct) {
    setEditing(p);
    setDelta("");
    setPrice(String(p.price_kobo / 100));
    setModalError(null);
  }

  async function save() {
    setBusy(true);
    setModalError(null);
    try {
      await api.admin.updateProduct(editing.product_id, {
        price_kobo: Math.round(Number(price) * 100),
        stock_delta: delta ? Number(delta) : undefined,
        stock_note: delta ? "Adjusted from the inventory screen" : undefined,
      });
      setEditing(null);
      load();
    } catch (e) {
      setModalError((e as ApiError).message);
    } finally { setBusy(false); }
  }

  async function toggleActive(p: AdminProduct) {
    try {
      await api.admin.updateProduct(p.product_id, { active: !p.active });
      load();
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  if (error && !items) return <div className="screen"><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div className="screen">
      <Ticker static>
        {items ? `${items.filter((i) => i.active).length} ITEMS ON SALE` : "LOADING"}
      </Ticker>

      <div style={{ height: "var(--s-5)" }} />

      <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
        <h1 className="screen-title" style={{ flex: 1, fontSize: 20 }}>ACCESSORIES</h1>
      </div>

      {published && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-4)" }}>
          <Stamp tone="ok">BUNDLE PUBLISHED</Stamp>
        </div>
      )}

      <div style={{ marginTop: "var(--s-5)" }}>
        <Pill onClick={() => { setCreating(true); setModalError(null); }}>
          NEW PRODUCT
        </Pill>
        <Pill variant="ghost" onClick={() => nav("/admin/bundles/new")}>
          NEW BUNDLE
        </Pill>
      </div>

      <div style={{ height: "var(--s-6)" }} />

      {!items && (
        <div style={{ minHeight: 240, display: "grid", placeItems: "center" }}>
          <LoadBar label="COUNTING THE SHELVES" />
        </div>
      )}

      {items?.length === 0 && <Empty>NOTHING IN THE CATALOGUE</Empty>}

      <div>
        {items?.map((p) => (
          <div className="card" key={p.product_id}>
            <ProductImage basePath={p.image_asset?.base_path} alt={p.name}
                          tier="thumb" height={36} />
            <div className="card-body">
              <p className="card-title">{p.name}</p>
              <p className="card-sub">{money(p.price_kobo)}</p>
              {/* The three numbers that matter, always together. Showing stock
                  alone hides the fact that some of it is already promised. */}
              <p className="card-sub">
                STOCK {p.stock_qty} · RSVD {p.reserved_qty} · AVAIL {p.available}
              </p>
              {!p.active && <Stamp>HIDDEN</Stamp>}
              {p.active && p.available <= 0 && <Stamp>OUT OF STOCK</Stamp>}
            </div>
            <button className="card-go" onClick={() => open(p)} aria-label={`Edit ${p.name}`} />
          </div>
        ))}
      </div>

      <div className="spacer" />

      <Modal open={creating} onClose={() => setCreating(false)} label="New product">
        <p className="label">NEW PRODUCT</p>

        <div style={{ marginTop: "var(--s-4)" }}>
          <ImagePicker
            size={120}
            label="ADD A PICTURE"
            busy={imageBusy}
            preview={draftPreview}
            onPicked={(blob, preview) => void pickDraftImage(blob, preview)}
          />
        </div>

        <div className="stack is-tight" style={{ marginTop: "var(--s-5)" }}>
          <Input placeholder="WHAT IS IT CALLED" value={draft.name}
                 onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Input type="number" placeholder="PRICE IN NAIRA" value={draft.price}
                 onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
          <Input type="number" placeholder="HOW MANY IN STOCK" value={draft.stock}
                 onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
        </div>

        {modalError && (
          <div className="stamp-wrap" style={{ marginTop: "var(--s-4)" }}>
            <Stamp>{modalError}</Stamp>
          </div>
        )}

        <div style={{ marginTop: "var(--s-5)" }}>
          <Pill
            onClick={create}
            disabled={busy || imageBusy
                      || draft.name.trim().length < 2
                      || !(Number(draft.price) > 0)}
          >
            {busy ? "SAVING" : "ADD IT"}
          </Pill>
          <Pill variant="ghost" onClick={() => setCreating(false)}>CANCEL</Pill>
        </div>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)}
             label={`Edit ${editing?.name ?? ""}`}>
        {editing && (
          <>
            <p className="label">{editing.name.toUpperCase()}</p>

            {/* The picture the shop grid and the receipt line both use.
                Uploaded through uploads.image with owner_type "product". */}
            <div style={{ marginTop: "var(--s-4)" }}>
              <ImagePicker
                size={120}
                label="ADD A PICTURE"
                busy={imageBusy}
                preview={
                  editing.image_asset?.base_path
                    ? `${import.meta.env.VITE_MEDIA_BASE}/${editing.image_asset.base_path}/grid.webp`
                    : null
                }
                onPicked={(blob) => void saveImage(blob)}
              />
            </div>

            <div className="stack is-tight" style={{ marginTop: "var(--s-5)" }}>
              <div>
                <p className="label" style={{ textAlign: "left" }}>PRICE IN NAIRA</p>
                <Input type="number" value={price}
                       onChange={(e) => setPrice(e.target.value)} />
              </div>

              <div>
                <p className="label" style={{ textAlign: "left" }}>
                  ADD OR REMOVE STOCK
                </p>
                <Input type="number" placeholder="+10 OR -3" value={delta}
                       onChange={(e) => setDelta(e.target.value)} />
                <p className="label" style={{ textAlign: "left", marginTop: "var(--s-2)" }}>
                  {editing.reserved_qty} ARE ALREADY RESERVED
                </p>
              </div>
            </div>

            {modalError && (
              <div className="stamp-wrap" style={{ marginTop: "var(--s-4)" }}>
                <Stamp>{modalError}</Stamp>
              </div>
            )}

            <div style={{ marginTop: "var(--s-5)" }}>
              <Pill onClick={save} disabled={busy}>{busy ? "SAVING" : "SAVE"}</Pill>
              <Pill variant={editing.active ? "danger" : "ghost"}
                    onClick={() => toggleActive(editing)}>
                {editing.active ? "HIDE FROM THE SHOP" : "PUT BACK ON SALE"}
              </Pill>
              <Pill variant="ghost" onClick={() => setEditing(null)}>CANCEL</Pill>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
