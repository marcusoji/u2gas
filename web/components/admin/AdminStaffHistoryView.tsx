"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useAdminStaffStore } from "@/stores/adminStaffStore";
import { paths } from "@/utils/paths";
import type {
  TimeFilter,
  DriverStatusTab,
  CashierStatusTab,
} from "@/types/types";
import { dummyStaffDriverRecords, dummyStaffCashierRecords } from "@/data";

interface AdminStaffHistoryViewProps {
  onBack?: () => void;
}

export default function AdminStaffHistoryView({
  onBack,
}: AdminStaffHistoryViewProps) {
  const router = useRouter();
  const { staffList, selectedStaffId } = useAdminStaffStore();

  const selectedStaff =
    staffList.find((s) => s.id === selectedStaffId) || staffList[0];

  // Determine role type (Driver or Cashier based on email/role or state)
  const isDriverRole =
    selectedStaff?.role?.toUpperCase().includes("DRIVER") ||
    selectedStaff?.email?.toUpperCase().includes("DRIVER");

  const [roleType, setRoleType] = useState<"DRIVER" | "CASHIER">(
    isDriverRole ? "DRIVER" : "CASHIER",
  );
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("TODAY");
  const [driverTab, setDriverTab] = useState<DriverStatusTab>("COMPLETE");
  const [cashierTab, setCashierTab] = useState<CashierStatusTab>("IN—PERSON");

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.push(paths.adminStaff);
    }
  };

  const staffDisplayName = selectedStaff?.firstName?.toUpperCase() || "SMITH";

  const driverRecords = dummyStaffDriverRecords;
  const cashierRecords = dummyStaffCashierRecords;

  return (
    <div className="w-full max-w-[420px] flex-1 flex flex-col items-center px-6 pt-4 pb-8 select-none min-h-[90vh]">
      {/* HEADER / BACK BUTTON */}
      <div className="w-full flex items-center justify-start mb-3">
        <button
          type="button"
          onClick={handleBack}
          className="bg-[#1317E4] text-white font-mono text-[11px] font-bold px-3 py-1.5 rounded-[6px] tracking-wider uppercase flex items-center gap-1.5 shadow-xs hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer select-none"
          aria-label="Go Back"
        >
          <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="leading-none">BACK</span>
        </button>
      </div>

      <div className="w-full flex flex-col items-center gap-6">
        {/* TITLE SECTION */}
        <div className="flex flex-col items-center text-center">
          <h1
            style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
            className="text-[36px] sm:text-[42px] font-bold tracking-wider text-[#1317E4] uppercase leading-none"
          >
            {staffDisplayName}&apos;S
          </h1>
          <h2
            style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
            className="text-[16px] sm:text-[18px] font-bold tracking-[0.14em] text-[#1317E4] uppercase mt-1.5 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() =>
              setRoleType((prev) => (prev === "DRIVER" ? "CASHIER" : "DRIVER"))
            }
            title="Click to toggle Driver/Cashier history"
          >
            {roleType} — HISTORY
          </h2>
        </div>

        {/* TIME FILTERS */}
        <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 flex-wrap">
          {(["TODAY", "THIS MONTH", "MAY", "JUNE"] as TimeFilter[]).map(
            (tab) => {
              const isActive = timeFilter === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTimeFilter(tab)}
                  style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                  className={`text-[12px] font-bold px-3 py-1 tracking-wider uppercase transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#1317E4] text-white rounded-[8px] shadow-xs"
                      : tab === "MAY"
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

        {/* STATUS / MODE TABS */}
        <div className="flex items-center justify-center gap-4 sm:gap-5">
          {roleType === "DRIVER" ? (
            <>
              {(
                ["COMPLETE", "UNFULFILLED", "CANCELLED"] as DriverStatusTab[]
              ).map((tab) => {
                const isActive = driverTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDriverTab(tab)}
                    style={{
                      fontFamily: 'var(--font-jgs7), "jgs7", monospace',
                    }}
                    className={`font-bold tracking-wider uppercase transition-all cursor-pointer ${
                      isActive
                        ? "text-[18px] sm:text-[20px] text-[#1317E4]"
                        : "text-[12px] sm:text-[13px] text-[#838EF8]/80 hover:text-[#1317E4]"
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {(["IN—PERSON", "ONLINE"] as CashierStatusTab[]).map((tab) => {
                const isActive = cashierTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCashierTab(tab)}
                    style={{
                      fontFamily: 'var(--font-jgs7), "jgs7", monospace',
                    }}
                    className={`font-bold tracking-wider uppercase transition-all cursor-pointer ${
                      isActive
                        ? "text-[18px] sm:text-[20px] text-[#1317E4]"
                        : "text-[12px] sm:text-[13px] text-[#838EF8]/80 hover:text-[#1317E4]"
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* DASHED RECORD CARD CONTAINER */}
        <div className="w-full rounded-[24px] border-2 border-dashed border-[#C5CAE9] p-5 sm:p-6 flex flex-col gap-4 bg-white/50 shadow-xs max-w-[380px]">
          {roleType === "DRIVER" ||
          (roleType === "CASHIER" && cashierTab === "ONLINE") ? (
            // ONLINE / DRIVER GAS ORDERS (NO PAYMENT BADGES)
            <div className="flex flex-col gap-4">
              {driverRecords.map((item) => (
                <div key={item.id} className="flex items-center gap-3.5 py-1">
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
              ))}
            </div>
          ) : (
            // IN-PERSON CASHIER TRANSACTIONS (WITH BADGES)
            <div className="flex flex-col gap-4">
              {cashierRecords.map((item) => (
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
          )}

          {/* SEE ALL LINK */}
          <div className="flex items-center justify-center pt-2">
            <button
              type="button"
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
