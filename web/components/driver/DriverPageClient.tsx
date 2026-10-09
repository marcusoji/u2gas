"use client";

import Navbar from "@/components/layout/Navbar";
import DriverScanner from "@/components/driver/DriverScanner";
import DriverHistoryModal from "@/components/driver/DriverHistoryModal";
import DriverDeliveriesView from "@/components/driver/DriverDeliveriesView";
import DriverProfileView from "@/components/driver/DriverProfileView";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { dropsToDriverHistory } from "@/lib/receipts";

type View = "scan" | "drops" | "profile";

export default function DriverPageClient() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scanNonce, setScanNonce] = useState(0);
  const [view, setView] = useState<View>("scan");

  // The driver's own deliveries, for the history list. Reloaded after a scan
  // so a just-completed drop moves from active to completed in place.
  const deliveries = useAsync(() => api.driver.deliveries("all"), [scanNonce]);

  const orders = dropsToDriverHistory(deliveries.data?.deliveries ?? []);

  return (
    <main className="w-full flex-1 bg-white flex flex-col items-center overflow-x-hidden relative select-none pb-8">
      <div className="w-full max-w-105 flex flex-col items-center px-3">
        <Navbar
          showProfile={false}
          className="px-3 pt-3 pb-1"
          notificationCount={orders.length}
          onNotificationClick={() => setHistoryOpen(true)}
        />

        {/* Scan / drops / profile, the three things a driver does in the field */}
        <div className="w-full flex items-center justify-center gap-2 px-2 pt-1 pb-1 flex-wrap">
          {[
            { id: "scan", label: "SCAN" },
            { id: "drops", label: "MY DROPS" },
            { id: "profile", label: "PROFILE" },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setView(m.id as View)}
              className={`px-3 py-1 rounded-full border text-[11px] font-mono font-semibold uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-2xs ${
                view === m.id
                  ? "bg-[#1317E4] text-white border-[#1317E4]"
                  : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border-neutral-200"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="w-full flex flex-col items-center mt-3 sm:mt-5">
          {view === "scan" ? (
            <DriverScanner onVerified={() => setScanNonce((n) => n + 1)} />
          ) : view === "drops" ? (
            <DriverDeliveriesView />
          ) : (
            <DriverProfileView />
          )}
        </div>
      </div>

      {/* Driver History Modal - opens on notification click */}
      <DriverHistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        orders={orders}
      />
    </main>
  );
}
