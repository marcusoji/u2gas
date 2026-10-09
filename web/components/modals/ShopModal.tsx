"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import type { Product } from "@/types";
import { products } from "@/data";
import { useCartStore, type CartItem } from "@/stores/cartStore";
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
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "processing" | "success"
  >("idle");
  const inputRef = useRef<HTMLInputElement>(null);

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
    }
  }, [open, activeInitial]);

  // Payment processing timer (2.4s)
  useEffect(() => {
    if (isProcessing) {
      const timer = setTimeout(() => {
        setIsProcessing(false);
        setPaymentStatus("success");
      }, 2400);

      return () => clearTimeout(timer);
    }
  }, [isProcessing]);

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

  const handleSelectPayment = (method: string) => {
    setSelectedPaymentMethod(method);
    setIsProcessing(true);
    setPaymentStatus("processing");
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
      />
    </FullScreenView>
  );
}

export default ShopModal;
