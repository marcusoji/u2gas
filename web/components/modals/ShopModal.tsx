"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import type { Product } from "@/types";
import { useCartStore, type CartItem } from "@/stores/cartStore";
import FullScreenView from "@/components/ui/FullScreenView";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { saveGuestToken, savePendingReference } from "@/lib/payment-return";
import { useAsync } from "@/lib/hooks";
import { toViewProduct } from "@/lib/adapters";
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
  onCheckout?: (cart: CartItem[]) => void;
};

export type ViewMode = "grid" | "detail" | "basket";

/** The basket's payment words mapped to the Worker's methods. */
const METHOD_TO_API: Record<string, "monnify" | "cash" | "bank_transfer"> = {
  "BANK\nTRANS": "bank_transfer",
  BANK: "bank_transfer",
  CARD: "monnify",
  OPAY: "monnify",
  CASH: "cash",
};

export function ShopModal({
  open,
  onOpenChange,
  initialProduct,
  initialItem,
  onCheckout,
}: ShopModalProps) {
  const router = useRouter();
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
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "processing" | "success"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The catalogue, live. Only fetched while the sheet is open — a closed sheet
  // should not spend a request.
  const shop = useAsync(() => api.shop(), [], { enabled: open });
  const products: Product[] = useMemo(
    () =>
      (shop.data?.items ?? []).map(
        (i) => toViewProduct(i) as unknown as Product,
      ),
    [shop.data],
  );

  // Cart Store
  const cartItems = useCartStore((state) => state.items);
  const addToCart = useCartStore((state) => state.addToCart);
  const clearCart = useCartStore((state) => state.clearCart);

  const activeInitial = initialProduct ?? initialItem;

  // Sync the sheet's view with the initial product, and clear transient state
  // when it closes. Done during render (guarded) rather than in an effect so
  // the detail view is correct on the opening commit, with no extra render.
  const syncKey = `${open}|${
    activeInitial?.product_id ?? activeInitial?.image ?? ""
  }|${products.length}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (open) {
      if (activeInitial) {
        const found =
          products.find(
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
    }
  }

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  const handleCloseSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
    setIsSearchOpen(false);
    setSearchQuery("");
    setViewMode("grid");
    setShowPayment(false);
    setIsProcessing(false);
    setPaymentStatus("idle");
    onOpenChange(false);
  };

  const handleAddToCart = () => {
    if (!selectedProduct) return;
    addToCart(selectedProduct);
    setViewMode("basket");
  };

  /**
   * Place the basket, then hand off to the gateway.
   *
   * The order is created server-side, which is where stock is reserved and the
   * price is recomputed — never from the cart's own numbers, which a client can
   * edit.
   */
  const handleSelectPayment = async (method: string) => {
    setSelectedPaymentMethod(method);
    setError(null);
    setIsProcessing(true);
    setPaymentStatus("processing");

    const apiMethod = METHOD_TO_API[method] ?? "monnify";

    try {
      const lines = cartItems.map((item) => ({
        kind: "product" as const,
        product_id: item.id,
        quantity: item.quantity,
      }));

      const created = await api.createCartOrder(
        {
          lines,
          fulfillment: checkoutMode === "walk-in" ? "pickup" : "delivery",
        },
        newIdempotencyKey(),
      );

      if (created.guest_token) {
        saveGuestToken(created.order.order_id, created.guest_token);
      }

      // Cash on collection settles at the counter, so there is nothing to
      // redirect to; the order is placed and the stock reserved.
      if (apiMethod === "cash") {
        setPaymentStatus("success");
        setIsProcessing(false);
        return;
      }

      const init = await api.payInit(created.order.order_id);
      if (init.authorization_url) {
        // Monnify returns only the order id, so the reference the verify step
        // needs is remembered here before we leave the page.
        savePendingReference(created.order.order_id, init.reference);
        window.location.href = init.authorization_url;
        return;
      }
      setPaymentStatus("success");
      setIsProcessing(false);
    } catch (e) {
      setPaymentStatus("idle");
      setIsProcessing(false);
      setError(
        e instanceof ApiError ? e.message : "WE COULDN'T PLACE THAT ORDER",
      );
    }
  };

  const handleDismissSuccess = () => {
    clearCart();
    setPaymentStatus("idle");
    setShowPayment(false);
    setSelectedPaymentMethod(null);
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
        {error && (
          <p
            role="alert"
            className="w-full text-center text-[11px] font-mono tracking-wider text-red-500 uppercase mb-2"
          >
            {error}
          </p>
        )}

        {shop.loading && products.length === 0 ? (
          <Loading label="LOADING ACCESSORIES…" />
        ) : shop.error ? (
          <ScreenNotice tone="error">{shop.error.message}</ScreenNotice>
        ) : (
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
                catalogue={products}
                onSelectProduct={setSelectedProduct}
                onAddToCart={handleAddToCart}
              />
            ) : (
              <ShopGridView
                products={products}
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
        )}
      </div>

      {/* Floating Checkout & Payment Options Overlay */}
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
      />
    </FullScreenView>
  );
}

export default ShopModal;
