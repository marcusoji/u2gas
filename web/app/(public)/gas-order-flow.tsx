"use client";

import { useState, useEffect } from "react";
import GasTerminal from "./gas-terminal";
import PaymentModal from "@/components/home/PaymentModal";
import { ReceiptModal } from "@/components/modals/ReceiptModal";
import { HistoryModal } from "@/components/modals/HistoryModal";
import { ProfileModal } from "@/components/modals/ProfileModal";
import { useAuthStore } from "@/stores/authStore";
import type { GasOrder, Notification, ReceiptItem } from "@/types";
import { dummyReceiptItems } from "@/data";

export default function GasOrderFlow() {
  const [showPayment, setShowPayment] = useState(false);
  const [order, setOrder] = useState<GasOrder | null>(null);
  const [terminalStatus, setTerminalStatus] = useState<
    "idle" | "processing" | "success" | "failed"
  >("idle");

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);

  const handlePaymentComplete = (outcome: "success" | "failed") => {
    setTerminalStatus(outcome);

    if (outcome === "success") {
      // Create confirmed order notification using Notification type
      const newNotif: Notification = {
        notification_id: `notif-${Date.now()}`,
        kind: "order.confirmed",
        title: "Gas Refill Receipt",
        body: `${order?.gas_amount_kg || 1}KG Refill Confirmed`,
        order_id: `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      setNotifications((prev) => [newNotif, ...prev]);

      // Set receipt items for this purchase
      setReceiptItems([
        {
          id: "gas-refill",
          title: `${order?.gas_amount_kg || 1}kg Cooking Gas Refill`,
          image: "/images/image1.png",
          priceNaira: order?.total_naira || 1400,
        },
      ]);
    }
  };

  const handleDismissStatus = () => {
    setTerminalStatus("idle");
  };

  const handleNotificationClick = () => {
    // Mark notifications as read
    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        read_at: n.read_at || new Date().toISOString(),
      }))
    );

    if (isLoggedIn) {
      // Logged in user -> Open History Modal
      setShowHistoryModal(true);
      setShowReceipt(false);
    } else {
      // Guest / Not logged in -> Open single Receipt Modal only
      if (!receiptItems || receiptItems.length === 0) {
        setReceiptItems(dummyReceiptItems);
      }
      setShowReceipt(true);
      setShowHistoryModal(false);
    }
  };

  return (
    <>
      <GasTerminal
        initialValue="1KG"
        status={terminalStatus}
        notifications={notifications}
        onNotificationClick={handleNotificationClick}
        onProfileClick={() => setShowProfileModal(true)}
        onDismissStatus={handleDismissStatus}
        onPay={(currentOrder) => {
          setOrder(currentOrder);
          setShowPayment(true);
        }}
      >
        <PaymentModal
          open={showPayment}
          onOpenChange={setShowPayment}
          order={order}
          onPaymentComplete={handlePaymentComplete}
        />
      </GasTerminal>

      {/* Reusable Receipt Modal for Guests */}
      <ReceiptModal
        open={showReceipt}
        onOpenChange={setShowReceipt}
        items={receiptItems}
      />

      {/* History Modal for Logged-In Users */}
      <HistoryModal
        open={showHistoryModal}
        onOpenChange={setShowHistoryModal}
      />

      {/* User Profile Modal */}
      <ProfileModal
        open={showProfileModal}
        onOpenChange={setShowProfileModal}
      />
    </>
  );
}
