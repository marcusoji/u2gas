"use client";

import { useState } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import CashierTerminal from "@/components/cashier/CashierTerminal";
import CashierScanner from "@/components/cashier/CashierScanner";
import CashierHistoryModal from "@/components/cashier/CashierHistoryModal";
import ProfileModal from "@/components/modals/ProfileModal";
import ManualEntryModal from "@/components/driver/ManualEntryModal";
import { ReceiptModal } from "@/components/modals/ReceiptModal";
import type { WalkInOrderData } from "@/components/cashier/WalkInPaymentDrawer";
import type { ReceiptItem } from "@/types";

export default function CashierPageClient() {
  // Default to scanner so the scan box is seen first
  const [view, setView] = useState<"scanner" | "terminal">("scanner");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<WalkInOrderData | null>(
    null,
  );

  const handlePaymentSuccess = (order: WalkInOrderData) => {
    setCompletedOrder(order);
    setReceiptOpen(true);
  };

  const handleManualConfirm = (_code: string) => {
    // If cashier manually submits an order code
    setManualOpen(false);
    setView("scanner");
  };

  const receiptItems: ReceiptItem[] = completedOrder
    ? [
        {
          id: completedOrder.orderId,
          title: `${completedOrder.kg}kg Cooking Gas`,
          subtitle: `Walk-in • ${completedOrder.method}`,
          image: "/images/cylinder.png",
          priceNaira: completedOrder.totalNaira,
          quantity: 1,
        },
      ]
    : [];

  return (
    <main className="w-full flex-1 bg-white flex flex-col items-center overflow-x-hidden relative select-none pb-8">
      <div className="w-full max-w-105 flex flex-col items-center px-3">
        {/* Cashier Navbar with Profile Avatar & Notification Bell */}
        <Navbar
          showProfile={true}
          notificationCount={1}
          className="px-3 pt-3 pb-1"
          onProfileClick={() => setProfileOpen(true)}
          onNotificationClick={() => setHistoryOpen(true)}
        />

        {/* Minimal Walk-In / Scanner Navigation Switch Button at the Top */}
        <div className="w-full flex items-center justify-end px-2 pt-1 pb-1">
          {view === "scanner" ? (
            <button
              type="button"
              onClick={() => setView("terminal")}
              className="px-3 py-1 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-black border border-neutral-200 text-[11px] font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              <span>WALK IN</span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-black" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setView("scanner")}
              className="px-3 py-1 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-black border border-neutral-200 text-[11px] font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-neutral-500 group-hover:text-black" />
              <span>SCANNER</span>
            </button>
          )}
        </div>

        {/* Main View: Scan Box First, or Walk-in Terminal */}
        <div className="w-full flex flex-col items-center mt-1 sm:mt-2">
          {view === "scanner" ? (
            <CashierScanner />
          ) : (
            <CashierTerminal
              initialValue="1KG"
              ratePerKg={1000}
              onScanClick={() => setView("scanner")}
              onManualEntryClick={() => setManualOpen(true)}
              onPaymentSuccess={handlePaymentSuccess}
            />
          )}
        </div>
      </div>

      {/* Cashier History Modal */}
      <CashierHistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />

      {/* Profile Modal */}
      <ProfileModal
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />

      {/* Manual Entry Sheet Modal */}
      <ManualEntryModal
        open={manualOpen}
        onOpenChange={setManualOpen}
        onConfirm={handleManualConfirm}
      />

      {/* Receipt Modal (Shown upon completing walk-in payment) */}
      <ReceiptModal
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        orderId={completedOrder?.orderId || "ORD-89421"}
        items={receiptItems}
      />
    </main>
  );
}
