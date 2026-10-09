"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { TimeFilter } from "@/types/types";
import { api } from "@/lib/api";
import { salesHistoryFor } from "@/lib/adapters";
import { useAsync } from "@/lib/hooks";
import { paths } from "@/utils/paths";

interface AdminSalesHistoryViewProps {
  onBack: () => void;
  totalLiters?: string;
}

export default function AdminSalesHistoryView({
  onBack,
  totalLiters: customTotalLiters,
}: AdminSalesHistoryViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TimeFilter>("TODAY");
  const { data, loading, error } = useAsync(() => api.admin.orders(), []);

  const currentData = useMemo(
    () => salesHistoryFor(data?.orders ?? [], activeTab),
    [data, activeTab],
  );
  const displayTotalLiters =
    activeTab === "TODAY" && customTotalLiters
      ? customTotalLiters
      : currentData.totalLiters;

  return (
    <div className="w-full max-w-[420px] flex-1 flex flex-col items-center px-6 pt-6 sm:pt-8 pb-8 select-none">
      {/* HEADER / BACK BUTTON */}
      <div className="w-full flex items-center justify-start mb-6 sm:mb-8">
        <button
          type="button"
          onClick={onBack}
          className="bg-[#1317E4] text-white font-mono text-[11px] font-bold px-3 py-1.5 rounded-[6px] tracking-wider uppercase flex items-center gap-1.5 shadow-xs hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer select-none"
          aria-label="Go Back"
        >
          <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="leading-none">BACK</span>
        </button>
      </div>

      <div className="w-full flex flex-col items-center">
        {/* TITLE */}
        <span
          style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
          className="text-[13px] sm:text-[14px] font-bold tracking-[0.2em] text-[#1317E4] uppercase mt-3"
        >
          TOTAL SALES
        </span>

        {/* BIG LITERS DISPLAY */}
        <div
          className="flex items-baseline justify-center text-[#1317E4] mt-1 mb-4 select-none"
          style={{
            fontFamily:
              'var(--font-barlow-semi-condensed), "Barlow Semi Condensed", sans-serif',
          }}
        >
          <span className="text-[76px] sm:text-[88px] font-bold leading-none tracking-tight">
            {displayTotalLiters}
          </span>
          <span className="text-[44px] sm:text-[50px] font-bold leading-none ml-1">
            L
          </span>
        </div>

        {/* TIME FILTERS */}
        <div className="flex items-center justify-center gap-2 sm:gap-3.5 mb-5 flex-wrap">
          {(["TODAY", "THIS MONTH", "MAY", "JUNE"] as TimeFilter[]).map(
            (tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                  className={`text-[12px] font-bold px-3 py-1 tracking-wider uppercase transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#1317E4] text-white rounded-[8px] shadow-xs"
                      : tab === "MAY" && activeTab !== "MAY"
                        ? "text-[#C5CAE9] hover:text-[#1317E4]"
                        : "text-[#1317E4] hover:opacity-75"
                  }`}
                >
                  {tab}
                </button>
              );
            },
          )}
        </div>

        {/* DASHED TRANSACTION CARD CONTAINER */}
        <div className="w-full max-w-[340px] sm:max-w-[360px] rounded-[28px] border-2 border-dashed border-[#C5CAE9] p-5 sm:p-6 flex flex-col gap-5 bg-white/40 shadow-xs">
          <div className="flex flex-col gap-4">
            {loading && (
              <p className="text-center font-mono text-xs text-[#A4A6E8] py-8">
                LOADING…
              </p>
            )}
            {!loading && error && (
              <p className="text-center font-mono text-xs text-[#D50000] py-8">
                {error.message}
              </p>
            )}
            {!loading && !error && currentData.items.length === 0 && (
              <p className="text-center font-mono text-xs text-[#A4A6E8] py-8 uppercase">
                No sales {activeTab.toLowerCase()}
              </p>
            )}
            {!loading &&
              !error &&
              currentData.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 py-1"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="relative w-[30px] h-[38px] shrink-0 flex items-center justify-center filter drop-shadow-[0_4px_6px_rgba(0,0,0,0.25)]">
                      <Image
                        src="/images/image1.png"
                        alt="Gas Cylinder"
                        fill
                        className="object-contain"
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[20px] font-bold text-[#1317E4] leading-none font-[family-name:var(--font-barlow-semi-condensed)] tracking-tight">
                        {item.title}
                      </span>
                      <span className="text-sm font-medium text-[#1317E4] mt-1 font-[family-name:var(--font-barlow-semi-condensed)]">
                        {format(item.date, "HH:mm, yy/MM/dd")}
                      </span>
                    </div>
                  </div>

                  <div className="border border-[#838EF8] text-[#838EF8] text-[9px] font-mono font-bold px-2 py-0.5 rounded-[4px] tracking-wider uppercase shrink-0">
                    {item.paymentMethod}
                  </div>
                </div>
              ))}
          </div>

          {/* SEE ALL LINK */}
          <div className="flex items-center justify-center pt-2">
            <button
              type="button"
              onClick={() => router.push(paths.adminSalesHistory)}
              style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
              className="text-[11px] font-bold tracking-wider uppercase text-[#838EF8] hover:text-[#1317E4] transition-colors cursor-pointer select-none"
            >
              SEE ALL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
