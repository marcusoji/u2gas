"use client";

import { useState } from "react";
import GasTerminal from "./gas-terminal";
import PaymentModal from "@/components/home/PaymentModal";
import { ReceiptModal } from "@/components/modals/ReceiptModal";
import { HistoryModal } from "@/components/modals/HistoryModal";
import { ProfileModal } from "@/components/modals/ProfileModal";
import { useAuthStore } from "@/stores/authStore";
import {
  createGasOrder,
  getAvailability,
} from "@/lib/endpoints";
import { homeToStock, useHome, useNotifications } from "@/hooks/useApiData";
import type { GasOrder, Notification, ReceiptItem } from "@/types";

export default function GasOrderFlow() {
  const [showPayment, setShowPayment] = useState(false);
  const [order, setOrder] = useState<GasOrder | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [guestToken, setGuestToken] = useState<string | undefined>();
  const [terminalStatus, setTerminalStatus] = useState<
    "idle" | "processing" | "success" | "failed"
  >("idle");

  const [showReceipt, setShowReceipt] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);

  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const { data: home, reload: reloadHome } = useHome();
  const { data: notificationData, reload: reloadNotifications } =
    useNotifications(isLoggedIn);

  const notifications: Notification[] = notificationData?.notifications ?? [];

  const handlePaymentComplete = (outcome: "success" | "failed") => {
    setTerminalStatus(outcome);
    reloadHome();
    if (outcome === "success") {
      setReceiptItems([
        {
          id: "gas-refill",
          title: `${order?.gas_amount_kg || 1}kg Cooking Gas Refill`,
          image: "/images/image1.png",
          priceNaira: order?.total_naira || 0,
        },
      ]);
    }
  };

  const handleNotificationClick = () => {
    reloadNotifications();
    if (isLoggedIn) {
      setShowHistoryModal(true);
      setShowReceipt(false);
    } else {
      setShowReceipt(true);
      setShowHistoryModal(false);
    }
  };

  /** PAY: confirm the depot can cover the amount, then hold it with a real order. */
  const handlePay = async (draft: GasOrder) => {
    try {
      const availability = await getAvailability(draft.gas_amount_kg);
      if (!availability.sufficient) {
        // The drawn terminal already owns the refusal state; surface it there.
        setTerminalStatus("failed");
        return;
      }
      const { order: created, guest_token } = await createGasOrder({
        kg: draft.gas_amount_kg,
        fulfillment: "pickup",
      });
      setOrder(draft);
      setOrderId(created.order_id);
      setGuestToken(guest_token);
      setShowPayment(true);
    } catch {
      setTerminalStatus("failed");
    }
  };

  return (
    <>
      <GasTerminal
        initialValue="1KG"
        status={terminalStatus}
        stock={homeToStock(home)}
        notifications={notifications}
        notificationCount={home?.unread_notifications ?? 0}
        onNotificationClick={handleNotificationClick}
        onProfileClick={() => setShowProfileModal(true)}
        onDismissStatus={() => setTerminalStatus("idle")}
        onPay={handlePay}
      >
        <PaymentModal
          open={showPayment}
          onOpenChange={setShowPayment}
          order={order}
          orderId={orderId}
          guestToken={guestToken}
          onPaymentComplete={handlePaymentComplete}
        />
      </GasTerminal>

      <ReceiptModal
        open={showReceipt}
        onOpenChange={setShowReceipt}
        items={receiptItems}
      />

      <HistoryModal
        open={showHistoryModal}
        onOpenChange={setShowHistoryModal}
      />

      <ProfileModal
        open={showProfileModal}
        onOpenChange={setShowProfileModal}
      />
    </>
  );
}
