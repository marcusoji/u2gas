"use client";

import React, { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import AdminPageShell, { AdminChip } from "./AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

const naira = (kobo: number) =>
  Math.round(kobo / 100).toLocaleString("en-US");

/** One upload slot. `product_id` is null until the admin picks an item. */
type Slot = { product_id: string | null };

const EMPTY_SLOTS: Slot[] = [
  { product_id: null },
  { product_id: null },
  { product_id: null },
];

/**
 * The three-slot compatible bundle upload (spec addendum 71.6).
 *
 * Slots hold existing catalogue items. As soon as two are chosen the form asks
 * the server whether they physically work together and shows the answer as a
 * strip — green COMPATIBLE, or a red stamp carrying the rule's own message.
 * The server re-checks under a row lock inside `publish_bundle`, so a member
 * edited between the check and the publish cannot slip a bad bundle through;
 * the strip is the live preview, not the enforcement.
 *
 * A conflict is a block, not a warning. Publishing anyway is an explicit
 * override (addendum 71.2) with a reason that is written to the audit log, and
 * the RPC refuses the override for anyone who is not an admin.
 */
export default function AdminBundlesView({ onBack }: { onBack: () => void }) {
  const products = useAsync(() => api.admin.products(), []);
  const [slots, setSlots] = useState<Slot[]>(EMPTY_SLOTS);
  const [name, setName] = useState("");
  const [priceNaira, setPriceNaira] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [override, setOverride] = useState<{
    ruleId: string;
    message: string;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [published, setPublished] = useState<string | null>(null);

  const list = useMemo(
    () => products.data?.products ?? [],
    [products.data],
  );
  const byId = useMemo(
    () => new Map(list.map((p) => [p.product_id, p])),
    [list],
  );

  const chosen = slots
    .map((s) => s.product_id)
    .filter((id): id is string => Boolean(id));

  // The live compatibility check. Runs once two distinct members are chosen.
  const check = useAsync(
    () =>
      chosen.length >= 2
        ? api.admin.checkBundle(chosen)
        : Promise.resolve({ compatible: true, violations: [] }),
    [chosen.join(",")],
    { enabled: chosen.length >= 2 && !override },
  );

  const violations = check.data?.violations ?? [];
  const compatible = chosen.length < 2 ? null : (check.data?.compatible ?? null);

  const setSlot = (index: number, productId: string | null) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { product_id: productId } : s)),
    );
    setOverride(null);
    setOverrideReason("");
    setPublished(null);
  };

  const reset = () => {
    setSlots(EMPTY_SLOTS);
    setName("");
    setPriceNaira("");
    setDescription("");
    setFormError(null);
    setOverride(null);
    setOverrideReason("");
  };

  const buildBody = (ruleId?: string) => {
    const price = Number(priceNaira);
    return {
      name: name.trim(),
      description: description.trim() || undefined,
      price_kobo: Math.round(price * 100),
      items: chosen.map((product_id, i) => ({
        product_id,
        quantity: 1,
        slot_index: i + 1,
      })),
      override_rule_id: ruleId,
      override_reason: ruleId ? overrideReason.trim() : undefined,
    };
  };

  /** The client-side gate. The server validates the same things again. */
  const validate = (): string | null => {
    if (!name.trim()) return "GIVE THE BUNDLE A NAME";
    const price = Number(priceNaira);
    if (!Number.isFinite(price) || price <= 0) return "ENTER A BUNDLE PRICE";
    if (chosen.length < 2) return "PICK AT LEAST TWO ITEMS";
    if (new Set(chosen).size !== chosen.length)
      return "EACH SLOT MUST BE A DIFFERENT ITEM";
    return null;
  };

  const submit = async (withOverride = false) => {
    const invalid = validate();
    if (invalid) return setFormError(invalid);

    if (!withOverride && violations.length > 0) {
      // Capture the rule so the override can name it on the next attempt.
      const ruleId = (violations[0] as { rule_id?: string }).rule_id;
      if (ruleId) {
        setOverride({ ruleId, message: violations[0].message });
        return;
      }
      return setFormError(violations[0].message);
    }
    if (withOverride && overrideReason.trim().length < 10) {
      return setFormError("EXPLAIN WHY THIS BUNDLE MAY SHIP");
    }

    setSaving(true);
    setFormError(null);
    try {
      await api.admin.createBundle(
        buildBody(withOverride ? override?.ruleId : undefined),
      );
      setPublished(name.trim());
      reset();
    } catch (e) {
      if (e instanceof ApiError) {
        // The server re-checked and refused. Keep the rule so the admin can
        // still choose to override it.
        const ruleId = e.detail.rule_id as string | undefined;
        if (e.code === "INCOMPATIBLE_ITEMS" && ruleId) {
          setOverride({ ruleId, message: e.message });
        } else {
          setFormError(e.message);
        }
      } else {
        setFormError("COULDN'T PUBLISH THAT — TRY AGAIN");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPageShell
      title="BUNDLES"
      subtitle="COMPATIBLE SETS"
      onBack={onBack}
      action={
        <AdminChip onClick={reset}>
          <span className="inline-flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            NEW
          </span>
        </AdminChip>
      }
    >
      {published && (
        <p className="w-full mb-4 rounded-xl border border-[#1FCD12] bg-[#F2FDF1] px-4 py-2 text-center font-mono text-[11px] font-bold tracking-wider text-[#1a7113] uppercase">
          {published} IS LIVE
        </p>
      )}

      {products.loading && <Loading label="LOADING CATALOGUE…" />}
      {products.error && !products.loading && (
        <ScreenNotice tone="error">{products.error.message}</ScreenNotice>
      )}

      {!products.loading && !products.error && (
        <>
          {/* Bundle name, price, description */}
          <div className="w-full rounded-2xl border border-[#838EF8]/40 bg-[#F7F8FF] p-4 mb-5 flex flex-col gap-3">
            <Field
              label="BUNDLE NAME"
              value={name}
              onChange={(v) => {
                setName(v);
                setPublished(null);
              }}
            />
            <Field
              label="BUNDLE PRICE ₦"
              value={priceNaira}
              inputMode="numeric"
              onChange={(v) => {
                setPriceNaira(v);
                setPublished(null);
              }}
            />
            <Field
              label="DESCRIPTION (OPTIONAL)"
              value={description}
              onChange={setDescription}
            />
          </div>

          {/* Three slots */}
          <div className="w-full flex flex-col gap-3">
            {slots.map((slot, i) => {
              const product = slot.product_id
                ? byId.get(slot.product_id)
                : undefined;
              return (
                <div
                  key={i}
                  className={`w-full rounded-2xl border border-dashed p-3 flex items-center gap-3 ${
                    product
                      ? "border-[#1317E4]/50 bg-white"
                      : "border-[#838EF8]/50 bg-[#F7F8FF]"
                  }`}
                >
                  <span className="w-6 shrink-0 text-center font-mono text-[11px] font-bold text-[#838EF8]">
                    {i + 1}
                  </span>
                  {product ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[12px] font-bold tracking-wide text-[#1317E4] uppercase truncate">
                          {product.name}
                        </p>
                        <p className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase">
                          {product.product_category?.name ?? "UNCATEGORISED"} · ₦
                          {naira(product.price_kobo)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSlot(i, null)}
                        aria-label="Clear slot"
                        className="text-[#1317E4] hover:opacity-70 cursor-pointer shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <select
                      value=""
                      onChange={(e) => setSlot(i, e.target.value || null)}
                      className="flex-1 rounded-lg border border-[#838EF8]/40 bg-white px-3 py-2 font-mono text-[12px] text-[#1317E4] outline-none focus:border-[#1317E4] cursor-pointer"
                    >
                      <option value="">
                        {i < 2 ? "PICK AN ITEM…" : "SLOT 3 (OPTIONAL)"}
                      </option>
                      {list.map((p) => (
                        <option key={p.product_id} value={p.product_id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>

          {/* Compatibility strip: appears once two members are chosen. */}
          {chosen.length >= 2 && !override && (
            <div className="w-full mt-4">
              {check.loading && (
                <p className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase">
                  CHECKING…
                </p>
              )}
              {check.error && !check.loading && (
                <p className="font-mono text-[10px] tracking-wider text-red-500 uppercase">
                  {check.error.message}
                </p>
              )}
              {!check.loading && !check.error && compatible === true && (
                <span className="inline-block rounded-md bg-[#1FCD12] text-white font-mono text-[11px] font-bold tracking-wider uppercase px-4 py-1.5 shadow-xs">
                  COMPATIBLE
                </span>
              )}
              {!check.loading && !check.error && violations.length > 0 && (
                <div className="w-full rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3">
                  <span className="block font-mono text-[10px] font-bold tracking-widest text-red-600 uppercase mb-1">
                    INCOMPATIBLE
                  </span>
                  {violations.map((v, i) => (
                    <p
                      key={i}
                      className="font-mono text-[11px] font-bold tracking-wide text-red-600 uppercase"
                    >
                      {v.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Override panel: only after a real conflict. */}
          {override && (
            <div className="w-full mt-4 rounded-xl border border-amber-400 bg-amber-50 p-4 flex flex-col gap-2">
              <span className="font-mono text-[10px] font-bold tracking-widest text-amber-700 uppercase">
                OVERRIDE REQUIRED
              </span>
              <p className="font-mono text-[11px] font-bold tracking-wide text-red-600 uppercase">
                {override.message}
              </p>
              <Field
                label="REASON (WRITTEN TO THE AUDIT LOG)"
                value={overrideReason}
                onChange={setOverrideReason}
              />
              <AdminChip
                onClick={() => submit(true)}
                disabled={saving}
                className="self-center mt-1 !border-amber-500 !text-amber-700"
              >
                {saving ? "PUBLISHING…" : "OVERRIDE & PUBLISH"}
              </AdminChip>
            </div>
          )}

          {formError && (
            <p className="w-full mt-4 text-center font-mono text-[10px] tracking-wider text-red-500 uppercase">
              {formError}
            </p>
          )}

          {!override && (
            <AdminChip
              onClick={() => submit(false)}
              disabled={saving || chosen.length < 2}
              className="self-center mt-5"
            >
              {saving ? "PUBLISHING…" : "PUBLISH BUNDLE"}
            </AdminChip>
          )}
        </>
      )}
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
