"use client";

import React, { useState } from "react";
import AdminPageShell, { AdminChip } from "./AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

interface Setting {
  key: string;
  value: unknown;
  updated_at: string;
}

/** The keys the interface knows the meaning of; anything else is shown raw. */
const LABELS: Record<string, string> = {
  hold_expiry_minutes: "HOLD EXPIRY (MINUTES)",
  low_stock_threshold_kg: "LOW STOCK THRESHOLD (KG)",
  low_stock_threshold: "LOW STOCK THRESHOLD",
};

function asInput(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function coerce(raw: string): unknown {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isFinite(n) ? n : raw;
}

/**
 * Settings the order path reads. The Worker enforces these inside the
 * transaction, so a value saved here changes behaviour on the next order
 * without a deploy — which is why the screen exists at all.
 */
export default function AdminSettingsView({ onBack }: { onBack: () => void }) {
  const { data, loading, error, reload, mutate } = useAsync(
    () => api.admin.settings(),
    [],
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const settings: Setting[] = data?.settings ?? [];

  const valueFor = (s: Setting) => drafts[s.key] ?? asInput(s.value);

  const save = async (s: Setting) => {
    setSavingKey(s.key);
    setSaveError(null);
    try {
      await api.admin.setSetting(s.key, coerce(valueFor(s)));
      // Reflect the saved value locally; the server is the source of truth and
      // a reload folds in anything it normalised.
      mutate({
        settings: settings.map((x) =>
          x.key === s.key ? { ...x, value: coerce(valueFor(s)) } : x,
        ),
      });
      setDrafts((d) => {
        const next = { ...d };
        delete next[s.key];
        return next;
      });
      reload();
    } catch (e) {
      setSaveError(
        e instanceof ApiError ? e.message : "COULDN'T SAVE THAT SETTING",
      );
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <AdminPageShell title="SETTINGS" onBack={onBack}>
      {loading && <Loading label="LOADING SETTINGS…" />}
      {error && !loading && <ScreenNotice tone="error">{error.message}</ScreenNotice>}
      {!loading && !error && settings.length === 0 && (
        <ScreenNotice>NO SETTINGS EXPOSED</ScreenNotice>
      )}

      {saveError && (
        <p className="w-full font-mono text-[10px] tracking-wider text-red-500 uppercase mb-3 text-center">
          {saveError}
        </p>
      )}

      <div className="w-full flex flex-col gap-3">
        {settings.map((s) => (
          <div
            key={s.key}
            className="w-full rounded-2xl border border-[#838EF8]/40 bg-white p-3 flex items-end gap-3"
          >
            <label className="min-w-0 flex-1 flex flex-col gap-1">
              <span className="font-mono text-[9px] font-bold tracking-widest text-[#838EF8] uppercase truncate">
                {LABELS[s.key] ?? s.key}
              </span>
              <input
                value={valueFor(s)}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                }
                className="w-full rounded-lg border border-[#838EF8]/40 bg-white px-3 py-2 font-mono text-[12px] text-[#1317E4] outline-none focus:border-[#1317E4]"
              />
            </label>
            <AdminChip
              onClick={() => save(s)}
              disabled={savingKey === s.key}
              className="!px-4 !py-1.5 !text-[10px] shrink-0"
            >
              {savingKey === s.key ? "…" : "SAVE"}
            </AdminChip>
          </div>
        ))}
      </div>
    </AdminPageShell>
  );
}
