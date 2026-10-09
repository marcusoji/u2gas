"use client";

import Navbar from "@/components/layout/Navbar";
import DriverScanner from "@/components/driver/DriverScanner";
import DriverHistoryModal from "@/components/driver/DriverHistoryModal";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { dropsToDriverHistory } from "@/lib/receipts";

export default function DriverPageClient() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scanNonce, setScanNonce] = useState(0);

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
        <div className="w-full flex flex-col items-center mt-3 sm:mt-5">
          <DriverScanner onVerified={() => setScanNonce((n) => n + 1)} />
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
