"use client";

import React, { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type {
  CashierTransactionItem,
  CashierStatusTab,
  CashierPaymentFilter,
} from "@/types";

export interface CashierHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions?: CashierTransactionItem[];
}

export default function CashierHistoryModal({
  open,
  onOpenChange,
  transactions = [],
}: CashierHistoryModalProps) {
  const [activeMode, setActiveMode] = useState<CashierStatusTab>("IN—PERSON");
  const [activeFilter, setActiveFilter] = useState<CashierPaymentFilter>("CASH");
  const [showAll, setShowAll] = useState(false);

  // SEE ALL lists every transaction the till has, across both modes and all
  // payment filters; the filtered view is the default. Reset when closed so
  // the sheet opens on the drawn state.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setShowAll(false);
  }

  const paymentFilters: CashierPaymentFilter[] = [
    "ALL",
    "CASH",
    "POS",
    "TRANSFER",
  ];

  const filteredTransactions = showAll
    ? transactions
    : transactions.filter((tx) => {
        if (tx.mode !== activeMode) return false;
        if (activeFilter === "ALL") return true;
        if (activeFilter === "TRANSFER") {
          return tx.paymentMethod === "TRANS" || tx.paymentMethod === "TRANSFER";
        }
        return tx.paymentMethod === activeFilter;
      });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cashier-history-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-white overflow-y-auto no-scrollbar flex flex-col items-center select-none px-6 pt-5 pb-10"
        >
          <div className="w-full max-w-[420px] flex flex-col items-center">
            {/* HEADER: BACK BUTTON */}
            <div className="w-full flex items-center justify-start mb-6">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="bg-[#1317E4] text-white font-mono text-[11px] font-bold px-3 py-1.5 rounded-[6px] tracking-wider uppercase flex items-center gap-1.5 shadow-xs hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer select-none"
                aria-label="Go Back"
              >
                <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="leading-none">BACK</span>
              </button>
            </div>

            {/* PRIMARY MODE TABS (IN—PERSON | ONLINE) */}
            <div className="flex items-center justify-center gap-6 mb-5">
              {(["IN—PERSON", "ONLINE"] as CashierStatusTab[]).map((mode) => {
                const isActive = activeMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setActiveMode(mode)}
                    className={`text-[12px] font-mono font-bold px-3.5 py-1 tracking-wider uppercase transition-all cursor-pointer ${
                      isActive
                        ? "bg-[#1317E4] text-white rounded-[8px] shadow-xs"
                        : "text-[#1317E4] hover:opacity-75"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>

            {/* PAYMENT METHOD SUB-FILTERS (ALL | CASH | POS | TRANSFER) */}
            <div className="flex items-center justify-center gap-5 sm:gap-7 mb-6 flex-wrap">
              {paymentFilters.map((filter) => {
                const isActive = activeFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={`font-mono font-bold tracking-wider uppercase transition-all cursor-pointer select-none ${
                      isActive
                        ? "text-[#1317E4] text-lg sm:text-[19px] scale-105"
                        : "text-[#838EF8] text-sm sm:text-base hover:text-[#1317E4]"
                    }`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>

            {/* DASHED CONTAINER FOR SALES / TRANSACTIONS */}
            <div className="w-full max-w-[360px] sm:max-w-[380px] rounded-[28px] border-2 border-dashed border-[#C5CAE9] p-5 sm:p-6 flex flex-col gap-4 bg-white shadow-xs">
              <div className="flex flex-col gap-4">
                {filteredTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="w-full flex items-center justify-between py-1"
                  >
                    {/* LEFT: Cylinder Icon + Amount & Liters + Timestamp */}
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
                          {tx.title}
                        </span>
                        <span className="text-sm font-medium text-[#1317E4] mt-1 font-[family-name:var(--font-barlow-semi-condensed)]">
                          {format(tx.date, "HH:mm, yy/MM/dd")}
                        </span>
                      </div>
                    </div>

                    {/* RIGHT: Payment Method Outline Badge */}
                    <div className="border border-[#838EF8] text-[#838EF8] font-mono text-[10px] font-bold px-2 py-0.5 rounded-[6px] uppercase tracking-wider shrink-0 select-none">
                      {tx.paymentMethod}
                    </div>
                  </div>
                ))}

                {filteredTransactions.length === 0 && (
                  <div className="w-full py-10 text-center text-xs text-[#838EF8] font-bold uppercase tracking-wider font-mono">
                    NO {showAll ? "MATCHING" : activeFilter} TRANSACTIONS
                  </div>
                )}
              </div>

              {/* SEE ALL LINK */}
              <div className="flex items-center justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="text-[11px] font-bold tracking-wider uppercase text-[#838EF8] hover:text-[#1317E4] transition-colors cursor-pointer select-none"
                >
                  SEE {showAll ? "LESS" : "ALL"}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
