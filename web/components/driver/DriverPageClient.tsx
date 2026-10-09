"use client";

import Navbar from "@/components/layout/Navbar";
import DriverScanner from "@/components/driver/DriverScanner";
import DriverHistoryModal from "@/components/driver/DriverHistoryModal";
import { useState } from "react";

export default function DriverPageClient() {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <main className="w-full flex-1 bg-white flex flex-col items-center overflow-x-hidden relative select-none pb-8">
      <div className="w-full max-w-105 flex flex-col items-center px-3">
        <Navbar
          showProfile={false}
          className="px-3 pt-3 pb-1"
          onNotificationClick={() => setHistoryOpen(true)}
        />
        <div className="w-full flex flex-col items-center mt-3 sm:mt-5">
          <DriverScanner />
        </div>
      </div>

      {/* Driver History Modal - opens on notification click */}
      <DriverHistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </main>
  );
}
