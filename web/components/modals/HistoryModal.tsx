"use client";

import React, { useMemo, useState } from "react";
import type { HistoryModalProps } from "@/types";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import FullScreenView from "@/components/ui/FullScreenView";
import { ReceiptCard } from "@/components/receipt/ReceiptCard";

export function HistoryModal({
  open,
  onOpenChange,
  receipts = [],
}: HistoryModalProps) {
  // The month strip is built from the months the customer actually has, so it
  // never offers a month that cannot be opened.
  const months = useMemo(() => {
    const seen: string[] = [];
    for (const r of receipts) {
      const m = r.month.toUpperCase();
      if (!seen.includes(m)) seen.push(m);
    }
    if (seen.length === 0) {
      const now = new Date().toLocaleDateString("en-US", {
        month: "long",
      });
      seen.push(now.toUpperCase());
    }
    return seen;
  }, [receipts]);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const activeMonth =
    selectedMonth && months.includes(selectedMonth)
      ? selectedMonth
      : months[0];

  // Filter receipts by selected month
  const filteredReceipts = receipts.filter(
    (r) => r.month.toUpperCase() === activeMonth,
  );

  const logout = useAuthStore((state) => state.logout);
  const handleLogout = () => {
    logout();
    onOpenChange(false);
  };

  return (
    <FullScreenView
      open={open}
      onClose={() => onOpenChange(false)}
      title="HISTORY"
      headerRight={
        <button
          type="button"
          onClick={handleLogout}
          className="text-[11px] text-[#838EF8] hover:text-[#1317E4] font-mono font-bold uppercase tracking-wider px-2 py-1 rounded-md hover:bg-neutral-50 transition-colors cursor-pointer"
        >
          LOG OUT
        </button>
      }
      contentClassName="pt-2 pb-6"
    >
      {/* Month Filter Tabs (Flexbox) */}
      <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-2 mb-4 w-full justify-start sm:justify-center touch-pan-x">
        {months.map((month) => {
          const isActive = month === activeMonth;
          const hasReceipts = receipts.some(
            (r) => r.month.toUpperCase() === month.toUpperCase(),
          );

          return (
            <button
              key={month}
              type="button"
              onClick={() => setSelectedMonth(month)}
              className={cn(
                "text-[12px] font-mono font-bold tracking-wider select-none shrink-0 transition-all cursor-pointer uppercase",
                isActive
                  ? "bg-[#1317E4] text-white px-3.5 py-1 rounded-[8px] shadow-xs"
                  : hasReceipts
                    ? "text-[#1317E4] hover:opacity-80 px-1 py-1"
                    : "text-[#A2A9EE] px-1 py-1",
              )}
            >
              {month}
            </button>
          );
        })}
      </div>

      {/* Horizontal Receipts Slider / Cards */}
      <div className="w-full flex-1 overflow-x-auto overflow-y-hidden no-scrollbar py-2 flex items-start justify-center touch-pan-x">
        {filteredReceipts.length > 0 ? (
          <div className="flex gap-5 items-start snap-x snap-mandatory px-1 pt-1 pb-4">
            {filteredReceipts.map((receipt) => (
              <ReceiptCard
                key={receipt.id}
                receipt={receipt}
                showDeliveryHeader={false}
              />
            ))}
          </div>
        ) : (
          <div className="w-full py-20 flex flex-col items-center justify-center text-center">
            <p className="text-[16px] text-[#1317E4] font-mono font-bold tracking-wider uppercase mb-1">
              NO RECEIPTS IN {activeMonth}
            </p>
            <span className="text-[12px] text-[#838EF8] font-mono uppercase">
              Refill orders will show here
            </span>
          </div>
        )}
      </div>
    </FullScreenView>
  );
}

export default HistoryModal;
