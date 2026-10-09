"use client";

import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import AdminPageShell, { AdminChip } from "./AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import type { AdminZone } from "@/lib/types";

const naira = (kobo: number) =>
  Math.round(kobo / 100).toLocaleString("en-US");

/**
 * Delivery zones and their fees.
 *
 * A zone is what the checkout sheet prices a delivery against, so `active`
 * matters: a deactivated zone stops being offered rather than becoming free.
 */
export default function AdminZonesView({ onBack }: { onBack: () => void }) {
  const { data, loading, error, reload } = useAsync(() => api.admin.zones(), []);
  const [editing, setEditing] = useState<AdminZone | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [feeNaira, setFeeNaira] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const zones = data?.zones ?? [];

  const openEdit = (z: AdminZone) => {
    setCreating(false);
    setName(z.name);
    setFeeNaira(String(Math.round(z.fee_kobo / 100)));
    setNote(z.coverage_note ?? "");
    setFormError(null);
    setEditing(z);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setFormError(null);
  };

  const openCreate = () => {
    setEditing(null);
    setName("");
    setFeeNaira("");
    setNote("");
    setFormError(null);
    setCreating(true);
  };

  const submit = async () => {
    const trimmed = name.trim();
    const fee = Number(feeNaira);
    if (!trimmed) return setFormError("NAME THE ZONE");
    if (!Number.isFinite(fee) || fee < 0) return setFormError("ENTER A FEE");
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.admin.updateZone(editing.zone_id, {
          name: trimmed,
          fee_kobo: Math.round(fee * 100),
        });
      } else {
        await api.admin.createZone({
          name: trimmed,
          fee_kobo: Math.round(fee * 100),
          coverage_note: note.trim() || undefined,
        });
      }
      closeForm();
      reload();
    } catch (e) {
      setFormError(
        e instanceof ApiError ? e.message : "COULDN'T SAVE THAT ZONE",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (z: AdminZone) => {
    try {
      await api.admin.updateZone(z.zone_id, { active: !z.active });
      reload();
    } catch {
      /* reload re-asserts the server state */
    }
  };

  return (
    <AdminPageShell
      title="DELIVERY"
      subtitle="ZONES & FEES"
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
              {editing ? "EDIT ZONE" : "NEW ZONE"}
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ZONE NAME"
            className="w-full rounded-lg border border-[#838EF8]/40 bg-white px-3 py-2 font-mono text-[12px] text-[#1317E4] outline-none focus:border-[#1317E4]"
          />
          <input
            value={feeNaira}
            inputMode="numeric"
            onChange={(e) => setFeeNaira(e.target.value)}
            placeholder="DELIVERY FEE ₦"
            className="w-full rounded-lg border border-[#838EF8]/40 bg-white px-3 py-2 font-mono text-[12px] text-[#1317E4] outline-none focus:border-[#1317E4]"
          />
          {creating && (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="COVERAGE NOTE (OPTIONAL)"
              className="w-full rounded-lg border border-[#838EF8]/40 bg-white px-3 py-2 font-mono text-[12px] text-[#1317E4] outline-none focus:border-[#1317E4]"
            />
          )}
          {formError && (
            <p className="font-mono text-[10px] tracking-wider text-red-500 uppercase">
              {formError}
            </p>
          )}
          <AdminChip onClick={submit} disabled={saving} className="self-center">
            {saving ? "SAVING…" : editing ? "SAVE CHANGES" : "CREATE ZONE"}
          </AdminChip>
        </div>
      )}

      {loading && <Loading label="LOADING ZONES…" />}
      {error && !loading && <ScreenNotice tone="error">{error.message}</ScreenNotice>}
      {!loading && !error && zones.length === 0 && (
        <ScreenNotice>NO ZONES SET</ScreenNotice>
      )}

      <div className="w-full flex flex-col gap-3">
        {zones.map((z) => (
          <div
            key={z.zone_id}
            className={`w-full rounded-2xl border p-3 flex items-center gap-3 ${
              z.active
                ? "border-[#838EF8]/40 bg-white"
                : "border-neutral-200 bg-neutral-50 opacity-70"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[12px] font-bold tracking-wide text-[#1317E4] uppercase truncate">
                {z.name}
              </p>
              <p className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase">
                FEE ₦{naira(z.fee_kobo)}
                {z.coverage_note ? ` · ${z.coverage_note}` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <AdminChip
                onClick={() => openEdit(z)}
                className="!px-3 !py-1 !text-[9px]"
              >
                EDIT
              </AdminChip>
              <AdminChip
                onClick={() => toggleActive(z)}
                className="!px-3 !py-1 !text-[9px]"
              >
                {z.active ? "DEACTIVATE" : "ACTIVATE"}
              </AdminChip>
            </div>
          </div>
        ))}
      </div>
    </AdminPageShell>
  );
}
