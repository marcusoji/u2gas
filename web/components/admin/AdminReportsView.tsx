"use client";

import React, { useState } from "react";
import AdminPageShell from "./AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

const naira = (kobo: number) =>
  Math.round(kobo / 100).toLocaleString("en-US");

const RANGES = [7, 30, 90];

/**
 * Reports, drawn in the tank gauge's language rather than charts: a column of
 * labelled readouts and a per-day bar strip the design already uses for trend.
 * The figures come from `reports/summary` unchanged — no screen computes a
 * total the server did not send.
 */
export default function AdminReportsView({ onBack }: { onBack: () => void }) {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useAsync(
    () => api.admin.report(days),
    [days],
  );

  const byDay = data?.revenue_by_day ?? [];
  const peak = Math.max(1, ...byDay.map((d) => d.revenue_kobo));

  return (
    <AdminPageShell title="REPORTS" onBack={onBack}>
      <div className="w-full flex items-center justify-center gap-2 mb-5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setDays(r)}
            style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
            className={`text-[10px] font-bold px-3 py-1 tracking-wider uppercase rounded-[8px] transition-all cursor-pointer ${
              days === r
                ? "bg-[#1317E4] text-white shadow-xs"
                : "text-[#1317E4] hover:opacity-75"
            }`}
          >
            {r} DAYS
          </button>
        ))}
      </div>

      {loading && <Loading label="CRUNCHING…" />}
      {error && !loading && <ScreenNotice tone="error">{error.message}</ScreenNotice>}

      {data && !loading && (
        <div className="w-full flex flex-col items-center">
          <div
            className="flex items-baseline justify-center text-[#1317E4]"
            style={{
              fontFamily:
                'var(--font-barlow-semi-condensed), "Barlow Semi Condensed", sans-serif',
            }}
          >
            <span className="text-[28px] font-bold leading-none mr-1">₦</span>
            <span className="text-[52px] font-extrabold leading-none tracking-tight">
              {naira(data.revenue_kobo)}
            </span>
          </div>
          <span className="font-mono text-[10px] tracking-widest text-[#838EF8] uppercase mt-1">
            REVENUE · LAST {data.period_days} DAYS
          </span>

          {byDay.length > 0 && (
            <div className="w-full mt-6 mb-6 flex items-end justify-between gap-1 h-24">
              {byDay.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 rounded-t-sm bg-[#1317E4]"
                  style={{
                    height: `${Math.max(4, (d.revenue_kobo / peak) * 96)}px`,
                    opacity: 0.85,
                  }}
                  title={`${d.date}: ₦${naira(d.revenue_kobo)}`}
                />
              ))}
            </div>
          )}

          <div className="w-full grid grid-cols-2 gap-3">
            <Stat label="ORDERS" value={String(data.orders_total)} />
            <Stat label="FULFILLED" value={String(data.orders_fulfilled)} />
            <Stat label="EXPIRED" value={String(data.orders_expired)} />
            <Stat label="CANCELLED" value={String(data.orders_cancelled)} />
            <Stat label="GAS SOLD" value={`${data.gas_sold_kg} KG`} />
            <Stat
              label="PICKUP SHARE"
              value={`${Math.round(data.pickup_share * 100)}%`}
            />
          </div>

          {Object.keys(data.revenue_by_method).length > 0 && (
            <div className="w-full mt-5">
              <span
                style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                className="text-[11px] font-bold tracking-[0.2em] text-[#1317E4] uppercase"
              >
                BY METHOD
              </span>
              <div className="w-full flex flex-col gap-1.5 mt-2">
                {Object.entries(data.revenue_by_method).map(([method, kobo]) => (
                  <div
                    key={method}
                    className="w-full flex items-center justify-between border-b border-dashed border-[#838EF8]/40 pb-1"
                  >
                    <span className="font-mono text-[10px] tracking-wider text-[#1317E4] uppercase">
                      {method}
                    </span>
                    <span className="font-mono text-[11px] text-[#1317E4]">
                      ₦{naira(kobo)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AdminPageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#838EF8]/40 bg-white p-3 flex flex-col items-center">
      <span className="font-mono text-[9px] font-bold tracking-widest text-[#838EF8] uppercase">
        {label}
      </span>
      <span className="font-mono text-[16px] font-bold text-[#1317E4] mt-1">
        {value}
      </span>
    </div>
  );
}
