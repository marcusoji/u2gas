"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import AdminTankGauge from "./AdminTankGauge";
import AdminUpdateModal from "./AdminUpdateModal";
import AdminMenuModal from "./AdminMenuModal";
import type { TankHistoryRecord } from "@/types";
import { dummyTankHistory } from "@/data";
import { useAdminTankStore } from "@/stores/adminTankStore";
import { paths } from "@/utils/paths";

export default function AdminPageClient() {
  const router = useRouter();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { level, setLevel } = useAdminTankStore();

  const [, setHistoryRecords] =
    useState<TankHistoryRecord[]>(dummyTankHistory);

  const handleLevelUpdate = (newLevel: number) => {
    setLevel(newLevel);
    const newRecord: TankHistoryRecord = {
      id: `REC-${Math.floor(9000 + Math.random() * 900)}`,
      timestamp: "JUST NOW",
      level: newLevel,
      type: "MANUAL_UPDATE",
      volumeLiters: Math.round((newLevel / 100) * 5000),
      operator: "Admin",
    };
    setHistoryRecords((prev) => [newRecord, ...prev]);
  };

  return (
    <main className="w-full flex-1 bg-white flex flex-col items-center select-none pt-4 pb-8">
      <div className="w-full max-w-105 flex flex-col items-center px-4">
        <div className="w-full flex items-center justify-end py-1">
          <button
            type="button"
            onClick={() => router.push(paths.adminMenu)}
            style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
            className="border-2 border-[#1317E4] text-[#1317E4] text-[18px] sm:text-[20px] font-bold px-3 py-1 rounded-[14px] tracking-wider uppercase hover:bg-[#1317E4]/5 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs select-none"
            aria-label="Open Navigation Menu"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.5] text-[#1317E4]" />
            <span>MENU</span>
          </button>
        </div>

        <div className="w-full flex items-center justify-center mt-6 sm:mt-10 relative">
          <AdminTankGauge />

          <AdminUpdateModal
            open={updateOpen}
            onOpenChange={setUpdateOpen}
            onLevelUpdate={handleLevelUpdate}
          />
        </div>

        <div className="w-full flex items-center justify-center gap-4 mt-8 sm:mt-10">
          <button
            type="button"
            onClick={() => setUpdateOpen(true)}
            className="px-9 py-4 rounded-full bg-[#1317E4] text-white font-mono text-lg leading-none tracking-normal flex items-center justify-center uppercase shadow-[0_4px_16px_rgba(19,23,228,0.38)] hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer select-none"
          >
            UPDATE
          </button>

          <button
            type="button"
            onClick={() => router.push(paths.adminHistory)}
            className="px-6 py-4 rounded-full bg-white text-[#1317E4] border border-[#838EF8] font-mono text-lg leading-none tracking-normal flex items-center justify-center uppercase hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer select-none"
          >
            HISTORY
          </button>
        </div>
      </div>

      <AdminMenuModal
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onUpdateHistoryClick={() => {
          setMenuOpen(false);
          router.push(paths.adminHistory);
        }}
      />
    </main>
  );
}
