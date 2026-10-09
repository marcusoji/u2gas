"use client";

import React, { useState } from "react";
import AdminPageShell, { AdminChip } from "./AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

const naira = (kobo: number) =>
  Math.round(kobo / 100).toLocaleString("en-US");

/**
 * The gas rate, in naira per kilogram.
 *
 * The Worker writes the rate and its history row and its audit entry in one
 * transaction, so this screen only sends the number. A guard step keeps a
 * fat-fingered rate from going live on the first tap — the price feeds every
 * quote and every order total.
 */
export default function AdminRateView({ onBack }: { onBack: () => void }) {
  const { data, loading, error, reload } = useAsync(
    () => api.admin.stock(),
    [],
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const current = data?.stock.rate_kobo_per_kg ?? 0;
  const value = draft ?? String(Math.round(current / 100));
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const dirty = draft !== null && Math.round(parsed * 100) !== current;

  const save = async () => {
    if (!valid) return setSaveError("ENTER A RATE");
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await api.admin.setRate(Math.round(parsed * 100));
      setDraft(null);
      setConfirmed(false);
      reload();
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "COULDN'T SAVE THE RATE");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPageShell title="GAS RATE" subtitle="NAIRA PER KG" onBack={onBack}>
      {loading && <Loading label="LOADING RATE…" />}
      {error && !loading && <ScreenNotice tone="error">{error.message}</ScreenNotice>}

      {data && !loading && (
        <div className="w-full flex flex-col items-center gap-4">
          <div className="w-full rounded-2xl border border-[#838EF8]/40 bg-white p-4 flex flex-col items-center">
            <span className="font-mono text-[10px] tracking-widest text-[#838EF8] uppercase">
              CURRENT
            </span>
            <span
              className="text-[36px] font-bold text-[#1317E4] leading-none mt-1"
              style={{
                fontFamily:
                  'var(--font-barlow-semi-condensed), "Barlow Semi Condensed", sans-serif',
              }}
            >
              ₦{naira(current)}
            </span>
            <span className="font-mono text-[9px] tracking-wider text-[#838EF8] uppercase mt-1">
              PER KG
            </span>
          </div>

          <input
            value={value}
            inputMode="numeric"
            onChange={(e) => {
              setDraft(e.target.value);
              setConfirmed(false);
              setSaveError(null);
            }}
            className="w-full rounded-xl border border-[#838EF8]/50 bg-white px-4 py-3 text-center font-mono text-[16px] tracking-wider text-[#1317E4] outline-none focus:border-[#1317E4]"
          />

          {saveError && (
            <p className="font-mono text-[10px] tracking-wider text-red-500 uppercase">
              {saveError}
            </p>
          )}

          {dirty && confirmed && (
            <p className="font-mono text-[11px] tracking-wider text-[#D70000] uppercase text-center">
              TAP AGAIN TO SET ₦{naira(Math.round(parsed * 100))}/KG
            </p>
          )}

          <AdminChip
            onClick={save}
            disabled={saving || !dirty}
            className="!px-6 !py-2 !text-[11px]"
          >
            {saving
              ? "SAVING…"
              : confirmed
                ? "CONFIRM RATE"
                : "SET RATE"}
          </AdminChip>
        </div>
      )}
    </AdminPageShell>
  );
}
