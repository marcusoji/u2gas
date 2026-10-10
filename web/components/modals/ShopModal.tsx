"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import type { Product, Zone } from "@/types";
import { products } from "@/data";
import { useCartStore, type CartItem } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import {
  createCartOrder,
  getOrder,
  getZones,
  initializePayment,
} from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import { rememberPaymentAttempt } from "@/lib/paymentSession";
import FullScreenView from "@/components/ui/FullScreenView";
import { paths } from "@/utils/paths";
import {
  ShopBasketView,
  ShopProductDetail,
  ShopGridView,
  ShopPaymentOverlay,
} from "./shop";

export type ShopModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProduct?: Product | null;
  /** Backwards compatibility alias for initialProduct */
  initialItem?: Product | null;
  /** Live catalogue. Falls back to the bundled fixtures when omitted. */
  products?: Product[];
  onCheckout?: (cart: CartItem[]) => void;
};

export type ViewMode = "grid" | "detail" | "basket";

type PaymentStatus = "idle" | "processing" | "success" | "held";

export function ShopModal({
  open,
  onOpenChange,
  initialProduct,
  initialItem,
  products: productsProp,
  onCheckout,
}: ShopModalProps) {
  const router = useRouter();
  const catalogue = productsProp ?? products;
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<"delivery" | "walk-in">(
    "delivery",
  );
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
    string | null
  >(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  // Real checkout state: the order the Worker created, the guest capability
  // token, the delivery zone, and the guest's own details.
  const [orderId, setOrderId] = useState<string | null>(null);
  const [guestToken, setGuestToken] = useState<string | undefined>();
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);

  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const needsGuest = !isLoggedIn;

  // Cart Store
  const cartItems = useCartStore((state) => state.items);
  const addToCart = useCartStore((state) => state.addToCart);
  const clearCart = useCartStore((state) => state.clearCart);

  const activeInitial = initialProduct ?? initialItem;

  // Sync initial item/product
  useEffect(() => {
    if (open) {
      if (activeInitial) {
        const found =
          catalogue.find(
            (p) =>
              p.product_id === activeInitial.product_id ||
              p.image === activeInitial.image ||
              (p.name || "").toLowerCase() ===
                (activeInitial.name || "").toLowerCase(),
          ) || activeInitial;
        setSelectedProduct(found);
        setViewMode("detail");
      }
    } else {
      setIsSearchOpen(false);
      setSearchQuery("");
      setShowPayment(false);
      setIsProcessing(false);
      setPaymentStatus("idle");
      setError(null);
      setBlockedUrl(null);
    }
  }, [open, activeInitial]);

  // Delivery zones are only needed when the customer chooses delivery.
  useEffect(() => {
    if (!open || checkoutMode !== "delivery" || zones.length > 0) return;
    let cancelled = false;
    getZones()
      .then(({ zones: list }) => {
        if (cancelled) return;
        setZones(list);
        if (list.length && !zoneId) setZoneId(list[0].zone_id);
      })
      .catch(() => {
        // The select stays empty; the Worker will refuse a delivery without a
        // zone, and the error is shown on checkout.
      });
    return () => {
      cancelled = true;
    };
  }, [open, checkoutMode, zones.length, zoneId]);

  // The gateway is the authority. `initialize` returns its URL and the webhook
  // settles the order; polling the order is what closes the sheet, so a closed
  // tab or a late webhook still resolves.
  useEffect(() => {
    if (
      paymentStatus !== "processing" ||
      !orderId ||
      selectedPaymentMethod === "DEPOT"
    ) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    const tick = async () => {
      try {
        const { order: current } = await getOrder(orderId, guestToken);
        if (cancelled) return;
        if (current.payment_status === "paid") {
          setIsProcessing(false);
          setPaymentStatus("success");
          return;
        }
        if (
          current.payment_status === "failed" ||
          current.payment_status === "refunded" ||
          current.status === "cancelled" ||
          current.status === "expired"
        ) {
          setIsProcessing(false);
          setPaymentStatus("idle");
          setSelectedPaymentMethod(null);
          setError("THE PAYMENT DID NOT GO THROUGH");
          return;
        }
      } catch {
        // A transient read failure must not cancel a live payment attempt.
      }
      if (!cancelled && Date.now() - startedAt > 180_000) {
        setIsProcessing(false);
        setPaymentStatus("idle");
        setSelectedPaymentMethod(null);
        setError("THE PAYMENT IS STILL PENDING — CHECK YOUR ORDERS");
        return;
      }
      if (!cancelled) window.setTimeout(tick, 3000);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [paymentStatus, orderId, guestToken, selectedPaymentMethod]);

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  const handleCloseSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  const resetCheckout = () => {
    setShowPayment(false);
    setIsProcessing(false);
    setPaymentStatus("idle");
    setSelectedPaymentMethod(null);
    setError(null);
    setBlockedUrl(null);
    setOrderId(null);
    setGuestToken(undefined);
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
    setIsSearchOpen(false);
    setSearchQuery("");
    setViewMode("grid");
    resetCheckout();
    onOpenChange(false);
  };

  const handleAddToCart = () => {
    if (!selectedProduct) return;
    addToCart(selectedProduct);
    setViewMode("basket");
  };

  /**
   * Place the order and hand the customer to the gateway.
   *
   * `PAY IN THE DEPOT` is not a Monnify method: the order is created and left
   * unpaid for a cashier to settle, so the sheet closes on a held order rather
   * than a paid one.
   */
  const handleSelectPayment = async (method: string) => {
    if (isProcessing) return;
    setSelectedPaymentMethod(method);
    setError(null);
    setBlockedUrl(null);

    if (cartItems.length === 0) {
      setError("YOUR BASKET IS EMPTY");
      return;
    }
    if (checkoutMode === "delivery") {
      if (!zoneId) {
        setError("CHOOSE A DELIVERY ZONE");
        return;
      }
      if (!deliveryAddress.trim()) {
        setError("ENTER A DELIVERY ADDRESS");
        return;
      }
    }
    if (needsGuest) {
      if (!guestName.trim()) {
        setError("ENTER YOUR NAME");
        return;
      }
      if (!guestPhone.trim()) {
        setError("ENTER YOUR PHONE NUMBER");
        return;
      }
    }

    setIsProcessing(true);
    setPaymentStatus("processing");

    const lines = cartItems.map((item) => ({
      kind: "product" as const,
      product_id: item.id,
      quantity: item.quantity,
    }));

    try {
      const { order, guest_token } = await createCartOrder({
        lines,
        fulfillment: checkoutMode === "delivery" ? "delivery" : "pickup",
        ...(checkoutMode === "delivery"
          ? { zone_id: zoneId, address: deliveryAddress.trim() }
          : {}),
        ...(needsGuest
          ? { guest_name: guestName.trim(), guest_phone: guestPhone.trim() }
          : {}),
      });

      setOrderId(order.order_id);
      setGuestToken(guest_token);

      if (method === "DEPOT") {
        setIsProcessing(false);
        setPaymentStatus("held");
        return;
      }

      // Open the destination tab synchronously, before the network call: after
      // an `await` the browser treats `window.open` as an unsolicited popup and
      // blocks it, stranding the customer on a spinner.
      const gatewayTab = window.open("about:blank", "_blank");
      if (gatewayTab) {
        try {
          gatewayTab.opener = null;
        } catch {
          // Some browsers refuse the assignment; navigation still proceeds.
        }
      }

      try {
        const { authorization_url, reference, already_paid } =
          await initializePayment(order.order_id, guest_token);
        if (already_paid) {
          gatewayTab?.close();
          return; // the poll settles it on the next tick
        }
        rememberPaymentAttempt({
          orderId: order.order_id,
          reference,
          guestToken: guest_token,
        });

        // The gateway return lands in the tab that opened it, which snapshotted
        // sessionStorage before this attempt existed, so copy the record in.
        if (gatewayTab) {
          try {
            gatewayTab.sessionStorage.setItem(
              "u2gas_payment_attempts_v1",
              JSON.stringify({
                [order.order_id]: {
                  orderId: order.order_id,
                  reference,
                  createdAt: Date.now(),
                },
              }),
            );
            if (guest_token) {
              gatewayTab.sessionStorage.setItem(
                "u2gas_payment_guest_v1",
                guest_token,
              );
            }
          } catch {
            // The webhook still settles the order and the opener tab polls it.
          }
        }

        if (authorization_url && gatewayTab) {
          gatewayTab.location.href = authorization_url;
        } else if (authorization_url) {
          setBlockedUrl(authorization_url);
          setIsProcessing(false);
        }
      } catch (err) {
        gatewayTab?.close();
        setIsProcessing(false);
        setPaymentStatus("idle");
        setSelectedPaymentMethod(null);
        setError(
          err instanceof ApiError ? err.message : "COULD NOT START THE PAYMENT",
        );
      }
    } catch (err) {
      setIsProcessing(false);
      setPaymentStatus("idle");
      setSelectedPaymentMethod(null);
      setError(
        err instanceof ApiError ? err.message : "COULD NOT PLACE THE ORDER",
      );
    }
  };

  const handleDismissSuccess = () => {
    clearCart();
    resetCheckout();
    handleCloseModal();
    router.push(paths.home);
  };

  // A pay-at-depot order is a real, held order: the basket is settled by a
  // cashier, so it is cleared here rather than left to be ordered again.
  const handleDismissHeld = () => {
    clearCart();
    resetCheckout();
    handleCloseModal();
    router.push(paths.home);
  };

  const handleBack = () => {
    if (viewMode === "basket") {
      setViewMode(selectedProduct ? "detail" : "grid");
    } else if (viewMode === "detail") {
      setViewMode("grid");
    } else {
      handleCloseModal();
    }
  };

  return (
    <FullScreenView
      open={open}
      onClose={handleBack}
      headerRight={
        <div className="flex items-center gap-2">
          {viewMode !== "basket" && cartItems.length > 0 && (
            <button
              type="button"
              onClick={() => setViewMode("basket")}
              className="text-[11px] font-mono font-bold text-[#1317E4] bg-neutral-100 hover:bg-neutral-200 px-3 py-1 rounded-full uppercase tracking-wider transition-all cursor-pointer"
            >
              BASKET ({cartItems.reduce((acc, i) => acc + i.quantity, 0)})
            </button>
          )}
        </div>
      }
      contentClassName="pt-2 pb-12 w-full max-w-105"
    >
      <div className="w-full flex-1 flex flex-col items-center">
        <AnimatePresence mode="wait">
          {viewMode === "basket" ? (
            <ShopBasketView
              onGoShopping={() => setViewMode("grid")}
              onCheckout={() => {
                setShowPayment(true);
                onCheckout?.(cartItems);
              }}
            />
          ) : selectedProduct && viewMode === "detail" ? (
            <ShopProductDetail
              selectedProduct={selectedProduct}
              onSelectProduct={setSelectedProduct}
              onAddToCart={handleAddToCart}
              products={catalogue}
            />
          ) : (
            <ShopGridView
              products={catalogue}
              onSelectProduct={(item) => {
                setSelectedProduct(item);
                setViewMode("detail");
              }}
              isSearchOpen={isSearchOpen}
              setIsSearchOpen={setIsSearchOpen}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onCloseSearch={handleCloseSearch}
              inputRef={inputRef}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Floating Checkout & Payment Options Overlay (Group B: Stays as payment drawer) */}
      <ShopPaymentOverlay
        showPayment={showPayment}
        onClosePayment={() => setShowPayment(false)}
        checkoutMode={checkoutMode}
        setCheckoutMode={setCheckoutMode}
        selectedPaymentMethod={selectedPaymentMethod}
        onSelectPayment={handleSelectPayment}
        isProcessing={isProcessing}
        paymentStatus={paymentStatus}
        onDismissSuccess={handleDismissSuccess}
        needsGuest={needsGuest}
        guestName={guestName}
        guestPhone={guestPhone}
        onGuestNameChange={setGuestName}
        onGuestPhoneChange={setGuestPhone}
        error={error}
        blockedUrl={blockedUrl}
        zones={zones}
        zoneId={zoneId}
        onZoneChange={setZoneId}
        deliveryAddress={deliveryAddress}
        onDeliveryAddressChange={setDeliveryAddress}
        onDismissHeld={handleDismissHeld}
      />
    </FullScreenView>
  );
}

export default ShopModal;
