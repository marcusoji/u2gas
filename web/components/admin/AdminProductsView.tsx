"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { Plus, X } from "lucide-react";
import AdminPageShell, { AdminChip } from "./AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { mediaUrl, productFallback } from "@/lib/media";
import type { AdminProduct, ProductDraft, ProductPatch } from "@/lib/types";

const naira = (kobo: number) =>
  Math.round(kobo / 100).toLocaleString("en-US");

interface Draft {
  name: string;
  subtitle: string;
  priceNaira: string;
  stockQty: string;
  imageAsset: string;
}

const EMPTY: Draft = {
  name: "",
  subtitle: "",
  priceNaira: "",
  stockQty: "",
  imageAsset: "",
};

/**
 * Accessories inventory: the shop grid re-skinned with the stock strip the
 * design gives the admin, plus create / edit / deactivate.
 *
 * Every write goes through the Worker, which records the audit row in the same
 * transaction, so nothing here mutates a product locally and hopes the server
 * agreed. Stock is adjusted as a *delta* (`stock_delta`) because the Worker
 * applies it under a row lock — sending an absolute count would restore stock a
 * concurrent scan had already taken.
 */
export default function AdminProductsView({ onBack }: { onBack: () => void }) {
  const { data, loading, error, reload } = useAsync(
    () => api.admin.products(),
    [],
  );
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const products = data?.products ?? [];

  const openEdit = (p: AdminProduct) => {
    setCreating(false);
    setDraft({
      name: p.name,
      subtitle: p.subtitle ?? "",
      priceNaira: String(Math.round(p.price_kobo / 100)),
      stockQty: "",
      imageAsset: p.image_asset?.base_path ?? "",
    });
    setFormError(null);
    setEditing(p);
  };

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY);
    setFormError(null);
    setCreating(true);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setFormError(null);
  };

  const upload = async (file: File) => {
    const res = await api.uploads.image(file, "product");
    setDraft((d) => ({ ...d, imageAsset: res.base_path }));
  };

  const submit = async () => {
    const name = draft.name.trim();
    const priceNaira = Number(draft.priceNaira);
    if (!name) return setFormError("GIVE THE ITEM A NAME");
    if (!Number.isFinite(priceNaira) || priceNaira <= 0)
      return setFormError("ENTER A PRICE");

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const body: ProductPatch = {
          name,
          subtitle: draft.subtitle.trim() || undefined,
          price_kobo: Math.round(priceNaira * 100),
          image_asset: draft.imageAsset || undefined,
        };
        const delta = Number(draft.stockQty);
        if (draft.stockQty.trim() && Number.isFinite(delta) && delta !== 0) {
          body.stock_delta = delta;
          body.stock_note = "Adjusted from the accessories inventory";
        }
        await api.admin.updateProduct(editing.product_id, body);
      } else {
        const body: ProductDraft = {
          name,
          subtitle: draft.subtitle.trim() || undefined,
          price_kobo: Math.round(priceNaira * 100),
          image_asset: draft.imageAsset || undefined,
        };
        const qty = Number(draft.stockQty);
        if (draft.stockQty.trim() && Number.isFinite(qty) && qty > 0) {
          body.stock_qty = qty;
        }
        await api.admin.createProduct(body);
      }
      closeForm();
      reload();
    } catch (e) {
      setFormError(
        e instanceof ApiError ? e.message : "COULDN'T SAVE THAT — TRY AGAIN",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: AdminProduct) => {
    try {
      await api.admin.updateProduct(p.product_id, { active: !p.active });
      reload();
    } catch {
      /* the list reload will re-assert the server's state */
    }
  };

  return (
    <AdminPageShell
      title="ACCESSORIES"
      subtitle="INVENTORY"
      onBack={onBack}
      action={
        <AdminChip onClick={openCreate}>
          <span className="inline-flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            ADD
          </span>
        </AdminChip>
      }
    >
      {(creating || editing) && (
        <div className="w-full rounded-2xl border border-[#838EF8]/40 bg-[#F7F8FF] p-4 mb-5 flex flex-col gap-3">
          <div className="w-full flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold tracking-wider text-[#1317E4] uppercase">
              {editing ? "EDIT ITEM" : "NEW ITEM"}
            </span>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Close"
              className="text-[#1317E4] hover:opacity-70 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <Field
            label="NAME"
            value={draft.name}
            onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
          />
          <Field
            label="SUBTITLE"
            value={draft.subtitle}
            onChange={(v) => setDraft((d) => ({ ...d, subtitle: v }))}
          />
          <Field
            label="PRICE ₦"
            value={draft.priceNaira}
            inputMode="numeric"
            onChange={(v) => setDraft((d) => ({ ...d, priceNaira: v }))}
          />
          <Field
            label={editing ? "STOCK CHANGE ±" : "STOCK QTY"}
            value={draft.stockQty}
            inputMode="numeric"
            onChange={(v) => setDraft((d) => ({ ...d, stockQty: v }))}
          />

          <div className="w-full flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-white border border-[#838EF8]/40 shrink-0">
              <Image
                src={
                  mediaUrl(draft.imageAsset) ??
                  productFallback(draft.name)
                }
                alt=""
                width={48}
                height={48}
                className="w-full h-full object-cover"
                unoptimized
              />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void upload(f).catch(() =>
                    setFormError("COULDN'T UPLOAD THAT PICTURE"),
                  );
                e.target.value = "";
              }}
            />
            <AdminChip onClick={() => fileRef.current?.click()}>
              {draft.imageAsset ? "CHANGE PICTURE" : "ADD PICTURE"}
            </AdminChip>
          </div>

          {formError && (
            <p className="font-mono text-[10px] tracking-wider text-red-500 uppercase">
              {formError}
            </p>
          )}

          <AdminChip onClick={submit} disabled={saving} className="self-center mt-1">
            {saving ? "SAVING…" : editing ? "SAVE CHANGES" : "CREATE ITEM"}
          </AdminChip>
        </div>
      )}

      {loading && <Loading label="LOADING INVENTORY…" />}
      {error && !loading && (
        <ScreenNotice tone="error">{error.message}</ScreenNotice>
      )}
      {!loading && !error && products.length === 0 && (
        <ScreenNotice>NO ACCESSORIES YET — ADD ONE</ScreenNotice>
      )}

      <div className="w-full flex flex-col gap-3">
        {products.map((p) => {
          const image =
            mediaUrl(p.image_asset) ?? productFallback(p.name);
          return (
            <div
              key={p.product_id}
              className={`w-full rounded-2xl border p-3 flex items-center gap-3 ${
                p.active
                  ? "border-[#838EF8]/40 bg-white"
                  : "border-neutral-200 bg-neutral-50 opacity-70"
              }`}
            >
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-neutral-100 shrink-0">
                <Image
                  src={image}
                  alt={p.name}
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[12px] font-bold tracking-wide text-[#1317E4] uppercase truncate">
                  {p.name}
                </p>
                <p className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase">
                  STOCK {p.stock_qty} · RSVD {p.reserved_qty} · AVAIL{" "}
                  {p.available}
                </p>
                <p className="font-mono text-[11px] text-[#1317E4] mt-0.5">
                  ₦{naira(p.price_kobo)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <AdminChip onClick={() => openEdit(p)} className="!px-3 !py-1 !text-[9px]">
                  EDIT
                </AdminChip>
                <AdminChip
                  onClick={() => toggleActive(p)}
                  className="!px-3 !py-1 !text-[9px]"
                >
                  {p.active ? "DEACTIVATE" : "ACTIVATE"}
                </AdminChip>
              </div>
            </div>
          );
        })}
      </div>
    </AdminPageShell>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="w-full flex flex-col gap-1">
      <span className="font-mono text-[9px] font-bold tracking-widest text-[#838EF8] uppercase">
        {label}
      </span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#838EF8]/40 bg-white px-3 py-2 font-mono text-[12px] text-[#1317E4] outline-none focus:border-[#1317E4]"
      />
    </label>
  );
}
