"use client";

import React, { useState } from "react";
import { AdminChip } from "@/components/admin/AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError } from "@/lib/api";
import type { OrderSummary } from "@/lib/types";

const naira = (kobo: number) =>
  Math.round(kobo / 100).toLocaleString("en-US");

/**
 * Order lookup by number or phone.
 *
 * The keypad doubles as the search pad, so the input takes either. The Worker
 * enforces a three-character minimum and an order/phone-only alphabet, and
 * answers with the same refusal it would give a bad scan — the screen shows it
 * rather than trimming the query into something that silently matches nothing.
 */
export default function CashierLookupView() {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<OrderSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const q = term.trim();
    if (q.length < 3) {
      setError("ENTER AT LEAST THREE CHARACTERS");
      setResults(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.staff.lookup(q);
      setResults(res.results);
    } catch (e) {
      setResults(null);
      setError(e instanceof ApiError ? e.message : "COULDN'T SEARCH");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div className="w-full flex items-stretch gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
          placeholder="ORDER NO. OR PHONE"
          inputMode="text"
          className="min-w-0 flex-1 rounded-xl border border-[#838EF8]/50 bg-white px-4 py-3 font-mono text-[13px] tracking-wider text-[#1317E4] uppercase outline-none focus:border-[#1317E4]"
        />
        <AdminChip
          onClick={() => void search()}
          disabled={loading}
          className="!px-5 !rounded-xl !text-[11px]"
        >
          {loading ? "…" : "SEARCH"}
        </AdminChip>
      </div>

      {loading && <Loading label="SEARCHING…" />}
      {error && !loading && <ScreenNotice tone="error">{error}</ScreenNotice>}
      {results && !loading && results.length === 0 && (
        <ScreenNotice>NO SUCH ORDER</ScreenNotice>
      )}

      <div className="w-full flex flex-col gap-3">
        {(results ?? []).map((o) => (
          <div
            key={o.order_id}
            className="w-full rounded-2xl border border-[#838EF8]/40 bg-white p-3 flex flex-col"
          >
            <p className="font-mono text-[12px] font-bold tracking-wide text-[#1317E4] uppercase">
              {o.order_number}
            </p>
            <p className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase">
              {o.guest_name || o.profile?.display_name || "GUEST"}
              {o.guest_phone ? ` · ${o.guest_phone}` : ""}
            </p>
            <p className="font-mono text-[10px] tracking-wider text-[#1317E4] uppercase mt-0.5">
              ₦{naira(o.total_kobo)} · {o.status} · {o.payment_status}
              {o.fulfillment_type ? ` · ${o.fulfillment_type}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
