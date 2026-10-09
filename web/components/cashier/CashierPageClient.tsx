"use client";

import { useMemo, useState } from "react";

import Navbar from "@/components/layout/Navbar";
import CashierTerminal from "@/components/cashier/CashierTerminal";
import CashierScanner from "@/components/cashier/CashierScanner";
import CashierHistoryModal from "@/components/cashier/CashierHistoryModal";
import CashierLookupView from "@/components/cashier/CashierLookupView";
import CashierReconciliationView from "@/components/cashier/CashierReconciliationView";
import ProfileModal from "@/components/modals/ProfileModal";
import ManualEntryModal from "@/components/driver/ManualEntryModal";
import { ReceiptModal } from "@/components/modals/ReceiptModal";
import type { WalkInOrderData } from "@/components/cashier/WalkInPaymentDrawer";
import type { ReceiptItem } from "@/types";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { toCashierTransactions } from "@/lib/receipts";

export default function CashierPageClient() {
  // Default to scanner so the scan box is seen first
  const [view, setView] = useState<"scanner" | "terminal" | "lookup" | "shift">(
    "scanner",
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<WalkInOrderData | null>(
    null,
  );
  const [scanNonce, setScanNonce] = useState(0);

  // The cashier's own queue, drawn into the history sheet. Every sale they ring
  // up is attributed to them, so this is their record and not the depot's.
  const queue = useAsync(() => api.staff.queue("paid"), [scanNonce, historyOpen]);
  const transactions = useMemo(
    () => toCashierTransactions(queue.data?.orders.map((o) => o as never) ?? []),
    [queue.data],
  );

  const unread = queue.data?.orders.length ?? 0;

  const handlePaymentSuccess = (order: WalkInOrderData) => {
    setCompletedOrder(order);
    setReceiptOpen(true);
    setScanNonce((n) => n + 1);
  };

  /**
   * A manually entered code is verified by the server, exactly as a scanned
   * one is — the pen is a convenience, not a bypass.
   */
  const handleManualConfirm = async (code: string) => {
    setManualOpen(false);
    try {
      await api.staff.scan(code.trim().toUpperCase());
      setScanNonce((n) => n + 1);
      setView("scanner");
    } catch (e) {
      // Surface the server's refusal in the receipt sheet's place: the code did
      // not belong to this depot, or was already redeemed.
      setManualError(
        e instanceof ApiError ? e.message : "COULDN'T VERIFY THAT CODE",
      );
      setView("scanner");
    }
  };

  const [manualError, setManualError] = useState<string | null>(null);

  const receiptItems: ReceiptItem[] = completedOrder
    ? [
        {
          id: completedOrder.orderId,
          title: `${completedOrder.kg}kg Cooking Gas`,
          subtitle: `Walk-in • ${completedOrder.method}`,
          image: "/images/image1.png",
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
          notificationCount={unread}
          className="px-3 pt-3 pb-1"
          onProfileClick={() => setProfileOpen(true)}
          onNotificationClick={() => setHistoryOpen(true)}
        />

        {/* Mode switch: scan, walk in, look up an order, or close the shift */}
        <div className="w-full flex items-center justify-center gap-2 px-2 pt-1 pb-1 flex-wrap">
          {[
            { id: "scanner", label: "SCANNER" },
            { id: "terminal", label: "WALK IN" },
            { id: "lookup", label: "LOOKUP" },
            { id: "shift", label: "SHIFT" },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setView(m.id as typeof view)}
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

        {/* Main View: Scan Box First, or Walk-in Terminal */}
        <div className="w-full flex flex-col items-center mt-1 sm:mt-2">
          {view === "scanner" ? (
            <CashierScanner />
          ) : view === "lookup" ? (
            <CashierLookupView />
          ) : view === "shift" ? (
            <CashierReconciliationView />
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
        transactions={transactions}
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
        serverError={manualError}
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
