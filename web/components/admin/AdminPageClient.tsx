"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import AdminTankGauge from "./AdminTankGauge";
import AdminUpdateModal from "./AdminUpdateModal";
import AdminMenuModal from "./AdminMenuModal";
import { useAdminTankStore } from "@/stores/adminTankStore";
import { getAdminStock, addStockEntry } from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import { paths } from "@/utils/paths";

export default function AdminPageClient() {
  const router = useRouter();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setTankData = useAdminTankStore((s) => s.setTankData);
  const tons = useAdminTankStore((s) => s.tons);
  // The last figure the server confirmed, so an adjustment records the delta
  // rather than the whole tank as a fresh delivery.
  const syncedTonsRef = useRef(tons);

  const loadStock = useCallback(async () => {
    try {
      const stock = await getAdminStock();
      const tankTons = stock.available_kg / 1000;
      // `fill_percent` is measured against the depot's capacity, so it is what
      // converts back to a usable total when one is not returned directly.
      const capacityTons =
        stock.fill_percent > 0
          ? tankTons / (stock.fill_percent / 100)
          : undefined;
      setTankData({
        tons: tankTons,
        ...(capacityTons ? { totalCapacityTons: capacityTons } : {}),
        daysLeft: stock.days_remaining ?? undefined,
      });
      syncedTonsRef.current = tankTons;
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "COULD NOT LOAD STOCK");
    }
  }, [setTankData]);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  /**
   * Record a manual tank adjustment against the server. Raising the level is an
   * addition, lowering it a removal; the delta in kg is what the stock ledger
   * stores, not the new absolute level.
   */
  const handleLevelUpdate = async (newLevel: number) => {
    if (busy) return;
    const capacity = useAdminTankStore.getState().totalCapacityTons;
    const newTons = (newLevel / 100) * capacity;
    const deltaKg = Math.round((newTons - syncedTonsRef.current) * 1000);
    if (deltaKg === 0) return;

    setBusy(true);
    setError(null);
    try {
      await addStockEntry({
        move: deltaKg > 0 ? "addition" : "removal",
        amount_kg: Math.abs(deltaKg),
        note: "Manual tank adjustment",
      });
      syncedTonsRef.current = newTons;
      await loadStock();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "COULD NOT SAVE STOCK");
      await loadStock(); // snap the gauge back to the server's figure
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="w-full flex-1 bg-white flex flex-col items-center select-none pt-4 pb-8">
      <div className="w-full max-w-105 flex flex-col items-center px-4">
        <div className="w-full flex items-center justify-between py-1">
          <span
            aria-live="polite"
            className="text-[11px] font-mono uppercase tracking-wider text-neutral-500"
          >
            {busy ? "Saving…" : (error ?? "")}
          </span>
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
