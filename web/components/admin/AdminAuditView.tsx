"use client";

import React, { useState } from "react";
import AdminPageShell from "./AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

/**
 * The audit log: a dense, dashed list of what changed, who changed it and when.
 *
 * Each row is a monospace entry in the design's list language. `before`/`after`
 * are shown as the changed keys only, so a long record is still readable at
 * 440px.
 */
export default function AdminAuditView({ onBack }: { onBack: () => void }) {
  const [entity, setEntity] = useState<string>("");
  const { data, loading, error } = useAsync(
    () => api.admin.audit(entity || undefined),
    [entity],
  );

  const entries = data?.entries ?? [];
  const entityTypes = Array.from(
    new Set(entries.map((e) => e.entity_type).filter(Boolean)),
  ).slice(0, 8);

  return (
    <AdminPageShell title="AUDIT" subtitle="WHO CHANGED WHAT" onBack={onBack}>
      {entityTypes.length > 1 && (
        <div className="w-full flex flex-wrap items-center justify-center gap-2 mb-5">
          {["", ...entityTypes].map((t) => (
            <button
              key={t || "all"}
              type="button"
              onClick={() => setEntity(t)}
              style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
              className={`text-[9px] font-bold px-2.5 py-1 tracking-wider uppercase rounded-[8px] transition-all cursor-pointer ${
                entity === t
                  ? "bg-[#1317E4] text-white shadow-xs"
                  : "text-[#1317E4] hover:opacity-75"
              }`}
            >
              {t || "ALL"}
            </button>
          ))}
        </div>
      )}

      {loading && <Loading label="LOADING LOG…" />}
      {error && !loading && <ScreenNotice tone="error">{error.message}</ScreenNotice>}
      {!loading && !error && entries.length === 0 && (
        <ScreenNotice>NOTHING RECORDED YET</ScreenNotice>
      )}

      <div className="w-full flex flex-col">
        {entries.map((e) => {
          const changed = diffKeys(e.before, e.after);
          return (
            <div
              key={e.audit_id}
              className="w-full border-b border-dashed border-[#838EF8]/40 py-2.5"
            >
              <div className="w-full flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold tracking-wide text-[#1317E4] uppercase">
                  {e.action}
                </span>
                <span className="font-mono text-[9px] tracking-wider text-[#838EF8] uppercase shrink-0">
                  {stamp(e.created_at)}
                </span>
              </div>
              <p className="font-mono text-[9px] tracking-wider text-[#838EF8] uppercase mt-0.5">
                {e.entity_type}
                {e.entity_id ? ` · ${e.entity_id.slice(0, 8)}` : ""}
                {e.actor?.display_name ? ` · ${e.actor.display_name}` : ""}
                {e.actor?.role ? ` (${e.actor.role})` : ""}
              </p>
              {changed.length > 0 && (
                <p className="font-mono text-[9px] tracking-wider text-[#1317E4] mt-0.5 break-words">
                  {changed.join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </AdminPageShell>
  );
}

function diffKeys(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  if (!after) return [];
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after),
  ]);
  const out: string[] = [];
  keys.forEach((k) => {
    const b = before?.[k];
    const a = after[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      out.push(`${k}: ${JSON.stringify(a)}`);
    }
  });
  return out.slice(0, 4);
}

function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
