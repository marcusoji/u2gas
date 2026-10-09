"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import AdminTankGauge from "./AdminTankGauge";
import AdminUpdateModal from "./AdminUpdateModal";
import AdminMenuModal from "./AdminMenuModal";
import { api } from "@/lib/api";
import { useAsync, useMutation } from "@/lib/hooks";
import { useAdminTankStore } from "@/stores/adminTankStore";
import { paths } from "@/utils/paths";

export default function AdminPageClient() {
  const router = useRouter();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const setTankData = useAdminTankStore((s) => s.setTankData);
  const tons = useAdminTankStore((s) => s.tons);

  // The level the server last confirmed. The modal moves the gauge in the store
  // before it reports back, so the old value cannot be read from the store; the
  // delta has to be measured against this baseline.
  const baselineRef = useRef<number | null>(null);

  const { data, reload } = useAsync(() => api.admin.stock(), []);
  const saveEntry = useMutation(
    (delta_kg: number, move: "addition" | "removal") =>
      api.admin.addStock({
        move,
        amount_kg: Math.abs(delta_kg),
        note: "Tank level set from the gauge",
      }),
  );

  // Push the server's authoritative figures into the shared store the gauge
  // and its readout both read. The store setter is external to React, so this
  // is a side effect, not a render-time state update.
  useEffect(() => {
    if (!data) return;
    const s = data.stock;
    setTankData({
      level: s.fill_percent,
      tons: Number((s.available_kg / 1000).toFixed(1)),
      daysLeft: s.days_remaining ?? undefined,
    });
    baselineRef.current = s.fill_percent;
  }, [data, setTankData]);

  // Persist what the operator set as a stock entry when the sheet closes. The
  // modal moves the gauge on every tap, so committing per tap would write an
  // entry for each press; the entry belongs to the adjustment, not the tap.
  const commitTankChange = async () => {
    const before = baselineRef.current;
    const after = useAdminTankStore.getState().level;
    if (before === null || after === before) return;
    const capacityKg = data?.stock.total_received_kg || tons * 1000;
    const delta_kg = ((after - before) / 100) * capacityKg;
    baselineRef.current = after;
    await saveEntry.run(delta_kg, delta_kg >= 0 ? "addition" : "removal");
    reload();
  };

  const handleUpdateOpenChange = (isOpen: boolean) => {
    setUpdateOpen(isOpen);
    if (!isOpen) void commitTankChange();
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
            onOpenChange={handleUpdateOpenChange}
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
