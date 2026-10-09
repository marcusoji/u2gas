"use client";

import { api } from "@/lib/api";
import { toViewStockEntry, type ViewStockEntry } from "@/lib/adapters";
import { useAsync } from "@/lib/hooks";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";

interface AdminGasHistoryViewProps {
  onBack: () => void;
}

export default function AdminGasHistoryView({
  onBack,
}: AdminGasHistoryViewProps) {
  const { data, loading, error } = useAsync(
    () => api.admin.stockHistory(),
    [],
  );

  const records: ViewStockEntry[] = useMemo(
    () => (data?.entries ?? []).map(toViewStockEntry),
    [data],
  );

  const [activeMonth, setActiveMonth] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"ADDITION" | "REMOVAL">(
    "ADDITION",
  );

  // The three months the strip shows, ending on the current one. A month with
  // no entries stays visible and muted rather than disappearing, so the strip
  // does not jump around as records land.
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - i), 1),
      );
      const label = d
        .toLocaleString("en-US", { month: "long", timeZone: "UTC" })
        .toUpperCase();
      return { id: label, label };
    });
  }, []);

  const active = activeMonth || months[months.length - 1]?.id || "";

  const displayRecords = records.filter((r) => {
    if (r.month !== active) return false;
    // The drawing only reserves two tabs, so a correction is shown under the
    // removal tab rather than dropping it.
    return activeTab === "ADDITION"
      ? r.move === "addition"
      : r.move !== "addition";
  });

  return (
    <div className="w-full max-w-[440px] flex-1 flex flex-col items-center justify-start px-6 pt-6 pb-12 select-none">
      {/* Back Button */}
      <div className="w-full flex items-center justify-start mb-4 sm:mb-6">
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

      {/* Main Title: GAS HISTORY */}
      <h1 className="text-[#1317E4] text-4xl font-bold tracking-wider leading-none text-center select-none uppercase mb-6">
        GAS HISTORY
      </h1>

      {/* Month Filters */}
      <div className="w-full flex items-center justify-center gap-3 sm:gap-4 mb-6 overflow-x-auto no-scrollbar py-1">
        {months.map((m) => {
          const isSelected = active === m.id;
          const muted = !records.some((r) => r.month === m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveMonth(m.id)}
              style={{
                fontFamily: 'var(--font-jgs7), "jgs7", monospace',
              }}
              className={`text-base uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap rounded-[8px] py-2 px-3 ${
                isSelected
                  ? "bg-[#1317E4] text-white shadow-xs active:scale-95"
                  : muted
                    ? "text-[#A4A6E8] hover:text-[#1317E4]"
                    : "text-[#1317E4] hover:opacity-80 active:scale-95"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tabs: ADDITION | REMOVAL */}
      <div className="flex items-center justify-center gap-8 mb-8">
        <button
          type="button"
          onClick={() => setActiveTab("ADDITION")}
          className={`font-mono text-[13px] sm:text-[14px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
            activeTab === "ADDITION"
              ? "text-[#1317E4] active:scale-95"
              : "text-[#A4A6E8] hover:text-[#1317E4]"
          }`}
        >
          ADDITION
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("REMOVAL")}
          className={`font-mono text-[13px] sm:text-[14px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
            activeTab === "REMOVAL"
              ? "text-[#1317E4] active:scale-95"
              : "text-[#A4A6E8] hover:text-[#1317E4]"
          }`}
        >
          REMOVAL
        </button>
      </div>

      {/* Gas History Receipt Cards Carousel */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${active}-${activeTab}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full flex items-stretch gap-6 overflow-x-auto snap-x snap-mandatory pt-2 pb-6 px-4 no-scrollbar"
        >
          {loading && (
            <p className="w-full text-center font-mono text-xs text-[#A4A6E8] py-16">
              LOADING…
            </p>
          )}
          {!loading && error && (
            <p className="w-full text-center font-mono text-xs text-[#D50000] py-16">
              {error.message}
            </p>
          )}
          {!loading && !error && displayRecords.length === 0 && (
            <p className="w-full text-center font-mono text-xs text-[#A4A6E8] py-16 uppercase">
              No {activeTab.toLowerCase()}s in {active.toLowerCase()}
            </p>
          )}
          {!loading &&
            !error &&
            displayRecords.map((item) => (
              <div
                key={item.id}
                className="w-[210px] sm:w-[225px] shrink-0 snap-center filter drop-shadow-[0_12px_28px_rgba(0,0,0,0.08)] flex flex-col items-center select-none"
              >
                {/* Card Body */}
                <div className="w-full bg-white pt-7 pb-6 px-4 flex flex-col items-center rounded-t-sm">
                  {/* Day Number (e.g. 23rd) */}
                  <span
                    className="text-[#1317E4] text-[38px] sm:text-[42px] font-bold leading-none select-none tracking-tight"
                    style={{
                      fontFamily: 'var(--font-jgs7), "jgs7", monospace',
                    }}
                  >
                    {item.day}
                  </span>

                  {/* Subtitle / Operator Info */}
                  <div
                    className="text-[#1317E4] text-[10px] font-bold tracking-widest uppercase text-center mt-3 mb-6 py-2 leading-snug select-none"
                    style={{
                      fontFamily: 'var(--font-jgs7), "jgs7", monospace',
                    }}
                  >
                    <div>{item.amountKg}KG -</div>
                    <div>
                      {item.move === "addition" ? "ADDED" : item.move === "removal" ? "REMOVED" : "CORRECTED"} BY{" "}
                      {item.operator}
                    </div>
                  </div>

                  {/* QR Code */}
                  <div className="w-[105px] h-[105px] sm:w-[115px] sm:h-[115px] relative flex items-center justify-center">
                    <Image
                      src="/images/qr-code.png"
                      alt="Receipt QR Code"
                      width={115}
                      height={115}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>

                {/* Serrated Zigzag Edge */}
                <div className="w-full overflow-hidden leading-none -mt-px">
                  <svg
                    viewBox="0 0 225 10"
                    className="w-full h-2.5 block text-white fill-white"
                    preserveAspectRatio="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <polygon
                      points="0,0 5.625,10 11.25,0 16.875,10 22.5,0 28.125,10 33.75,0 39.375,10 45,0 50.625,10 56.25,0 61.875,10 67.5,0 73.125,10 78.75,0 84.375,10 90,0 95.625,10 101.25,0 106.875,10 112.5,0 118.125,10 123.75,0 129.375,10 135,0 140.625,10 146.25,0 151.875,10 157.5,0 163.125,10 168.75,0 174.375,10 180,0 185.625,10 191.25,0 196.875,10 202.5,0 208.125,10 213.75,0 219.375,10 225,0"
                      fill="#FFFFFF"
                    />
                  </svg>
                </div>
              </div>
            ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
