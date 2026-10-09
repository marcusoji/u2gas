"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import GasTerminal from "./gas-terminal";
import { useAuthStore } from "@/stores/authStore";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { saveGuestToken, savePendingReference } from "@/lib/payment-return";
import { useAsync } from "@/lib/hooks";
import { toHomeView } from "@/lib/adapters";
import { toHistoryReceipt } from "@/lib/receipts";
import type { GasOrderDraft, HistoryReceipt, ReceiptItem } from "@/types";

/**
 * The four sheets are interaction-only: none of them paints until a click, so
 * they are split out of the entry chunk. The home terminal is the landing route
 * and must stay light — a visitor should not download the receipt, history and
 * profile sheets before touching anything.
 */
const PaymentModal = dynamic(() => import("@/components/home/PaymentModal"), {
  ssr: false,
});
const ReceiptModal = dynamic(
  () => import("@/components/modals/ReceiptModal").then((m) => m.ReceiptModal),
  { ssr: false },
);
const HistoryModal = dynamic(
  () => import("@/components/modals/HistoryModal").then((m) => m.HistoryModal),
  { ssr: false },
);
const NotificationsModal = dynamic(
  () =>
    import("@/components/modals/NotificationsModal").then(
      (m) => m.NotificationsModal,
    ),
  { ssr: false },
);
const ProfileModal = dynamic(() => import("@/components/modals/ProfileModal"), {
  ssr: false,
});

/** Which payment route the customer chose in the sheet. */
type PaymentChoice = "BANK" | "OPAY" | "DEPOT" | "CARD";

export default function GasOrderFlow() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  const [showPayment, setShowPayment] = useState(false);
  const [draft, setDraft] = useState<GasOrderDraft | null>(null);
  const [terminalStatus, setTerminalStatus] = useState<
    "idle" | "processing" | "success" | "failed"
  >("idle");
  const [showReceipt, setShowReceipt] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The rate and stock come from the Worker, which reads the live rate from
  // `app_setting` and the depot's remaining gas.
  const home = useAsync(() => api.home(), []);
  const homeView = useMemo(
    () => (home.data ? toHomeView(home.data) : null),
    [home.data],
  );

  // A customer's own past orders, for the history sheet. A guest has none, so
  // the call is skipped entirely without a session.
  const history = useAsync(() => api.orders(), [isLoggedIn], {
    enabled: isLoggedIn,
  });

  // Notifications power the bell's unread count. A guest has none.
  const notifications = useAsync(() => api.notifications(), [isLoggedIn], {
    enabled: isLoggedIn,
  });

  const receipts: HistoryReceipt[] = useMemo(() => {
    if (!history.data?.orders) return [];
    return history.data.orders.map(toHistoryReceipt);
  }, [history.data]);

  /** Place the order, then hand off to the gateway. */
  const startPayment = useCallback(
    async (choice: PaymentChoice) => {
      if (!draft || draft.gas_amount_kg <= 0) return;
      setError(null);
      setTerminalStatus("processing");

      try {
        const fulfillment = choice === "DEPOT" ? "pickup" : "delivery";
        const created = await api.createGasOrder(
          { kg: draft.gas_amount_kg, fulfillment },
          newIdempotencyKey(),
        );

        // A guest's capability token is a bearer value, so it lives in session
        // storage and never in a URL the customer might share.
        if (created.guest_token) {
          saveGuestToken(created.order.order_id, created.guest_token);
        }

        // "Pay in the depot" needs no gateway: the order is placed and the gas
        // reserved, and the cashier collects at the counter. This is the one
        // branch that does not redirect.
        if (choice === "DEPOT") {
          setTerminalStatus("success");
          setReceiptItems([
            {
              id: created.order.order_id,
              title: `${draft.gas_amount_kg}kg Cooking Gas`,
              subtitle: "PAY IN THE DEPOT",
              image: "/images/image1.png",
              priceNaira: draft.total_naira,
              quantity: 1,
            },
          ]);
          setShowPayment(false);
          history.reload();
          return;
        }

        const init = await api.payInit(created.order.order_id);
        if (init.authorization_url) {
          // Monnify returns only the order id, so the reference the verify
          // step needs is remembered here before we leave the page.
          savePendingReference(created.order.order_id, init.reference);
          window.location.href = init.authorization_url;
          return;
        }
        // No redirect came back, but the order may already be settled.
        setTerminalStatus("success");
        setShowPayment(false);
        history.reload();
      } catch (e) {
        setTerminalStatus("failed");
        setError(
          e instanceof ApiError ? e.message : "WE COULDN'T PLACE THAT ORDER",
        );
      }
    },
    [draft, history],
  );

  const handleDismissStatus = () => {
    setTerminalStatus("idle");
    setError(null);
  };

  const handleNotificationClick = () => {
    if (isLoggedIn) {
      setShowNotifications(true);
      setShowReceipt(false);
      setShowHistoryModal(false);
    } else {
      setShowReceipt(true);
      setShowNotifications(false);
      setShowHistoryModal(false);
    }
  };

  const unread = notifications.data?.notifications
    ? notifications.data.notifications.filter((n) => !n.read_at).length
    : homeView?.unread ?? 0;

  return (
    <>
      {error && (
        <div
          role="alert"
          className="w-full max-w-90 mx-auto mb-2 rounded-[10px] border border-red-200 bg-red-50 px-4 py-2 text-center text-[11px] font-mono tracking-wider text-red-600 uppercase"
        >
          {error}
        </div>
      )}

      <GasTerminal
        initialValue="1KG"
        status={terminalStatus}
        ratePerKg={homeView?.rateNaira ?? 1400}
        notifications={notifications.data?.notifications}
        notificationCount={unread}
        onNotificationClick={handleNotificationClick}
        onProfileClick={() => setShowProfileModal(true)}
        onDismissStatus={handleDismissStatus}
        onPay={(currentDraft) => {
          setDraft(currentDraft);
          setShowPayment(true);
        }}
      >
        <PaymentModal
          open={showPayment}
          onOpenChange={setShowPayment}
          order={draft}
          onSelectMethod={(m) => void startPayment(m as PaymentChoice)}
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
        receipts={receipts}
      />

      <NotificationsModal
        open={showNotifications}
        onOpenChange={setShowNotifications}
        onRead={notifications.reload}
      />

      <ProfileModal
        open={showProfileModal}
        onOpenChange={setShowProfileModal}
        onSignedOut={() => router.push("/login")}
        onOpenHistory={() => setShowHistoryModal(true)}
      />
    </>
  );
}
