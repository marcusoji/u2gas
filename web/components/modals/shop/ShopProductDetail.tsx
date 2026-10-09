"use client";

import { useMemo } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { Product } from "@/types";
import { products } from "@/data";

export type ShopProductDetailProps = {
  selectedProduct: Product;
  onSelectProduct: (product: Product) => void;
  onAddToCart: () => void;
};

export function ShopProductDetail({
  selectedProduct,
  onSelectProduct,
  onAddToCart,
}: ShopProductDetailProps) {
  // Size variants for the currently selected product family (matched by name or image)
  const variants = useMemo(() => {
    if (!selectedProduct) return [];
    const matched = products.filter(
      (p) =>
        (selectedProduct.name &&
          p.name?.toLowerCase().trim() ===
            selectedProduct.name?.toLowerCase().trim()) ||
        p.image === selectedProduct.image,
    );
    return matched.length > 0 ? matched : [selectedProduct];
  }, [selectedProduct?.name, selectedProduct?.image]);

  const activeIndex = useMemo(() => {
    if (!selectedProduct) return 0;
    const idx = variants.findIndex(
      (v) => v.product_id === selectedProduct.product_id,
    );
    return idx >= 0 ? idx : 0;
  }, [variants, selectedProduct?.product_id]);

  const prevVariant =
    variants.length > 1
      ? variants[(activeIndex - 1 + variants.length) % variants.length]
      : null;
  const nextVariant =
    variants.length > 1 ? variants[(activeIndex + 1) % variants.length] : null;

  const handleSwipeVariant = (direction: number) => {
    if (variants.length <= 1) return;
    if (direction > 0) {
      const nextIdx = (activeIndex + 1) % variants.length;
      onSelectProduct(variants[nextIdx]);
    } else {
      const prevIdx = (activeIndex - 1 + variants.length) % variants.length;
      onSelectProduct(variants[prevIdx]);
    }
  };

  const otherProducts = useMemo(() => {
    const seenImages = new Set<string>();
    if (selectedProduct?.image) {
      seenImages.add(selectedProduct.image);
    }
    const result: Product[] = [];
    for (const p of products) {
      if (!seenImages.has(p.image)) {
        seenImages.add(p.image);
        result.push(p);
      }
    }
    return result.slice(0, 4);
  }, [selectedProduct?.image]);

  return (
    <motion.div
      key="product-detail-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center w-full min-h-0"
    >
      {/* Swipable 3-Item Carousel (Left Prev + Center Active + Right Next) */}
      <div className="w-full relative flex flex-col items-center py-2 my-2 select-none overflow-visible">
        {/* Soft gradient edge overlays so the blur laps seamlessly into the white background */}
        <div className="absolute left-0 inset-y-0 w-10 bg-gradient-to-r from-white via-white/80 to-transparent pointer-events-none z-20" />
        <div className="absolute right-0 inset-y-0 w-10 bg-gradient-to-l from-white via-white/80 to-transparent pointer-events-none z-20" />

        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, { offset, velocity }) => {
            const swipeThreshold = 35;
            if (offset.x < -swipeThreshold || velocity.x < -250) {
              handleSwipeVariant(1);
            } else if (offset.x > swipeThreshold || velocity.x > 250) {
              handleSwipeVariant(-1);
            }
          }}
          style={{
            maskImage:
              "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
          }}
          className="w-full relative flex items-center justify-center h-52 cursor-grab active:cursor-grabbing touch-pan-y"
        >
          {/* Left: Previous Variant (peeking from left edge, clickable) */}
          {prevVariant && (
            <motion.button
              type="button"
              key={`prev-${prevVariant.product_id}`}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 0.5, x: 0 }}
              whileHover={{ opacity: 0.8 }}
              whileTap={{ scale: 0.7 }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectProduct(prevVariant);
              }}
              aria-label={`View ${prevVariant.subtitle || prevVariant.name}`}
              className="absolute -left-6 sm:-left-3 top-1/2 -translate-y-1/2 w-28 h-28 shrink-0 z-0 cursor-pointer flex items-center justify-center transition-all"
              style={{
                transform: `translateY(-50%) scale(${(prevVariant.sizeScale ?? 1) * 0.72})`,
              }}
            >
              <div className="relative w-full h-full flex items-center justify-center">
                <Image
                  src={prevVariant.image}
                  alt={prevVariant.subtitle || ""}
                  fill
                  sizes="112px"
                  className="object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.07)] pointer-events-none select-none"
                />
              </div>
            </motion.button>
          )}

          {/* Center: Active Variant (Large, sharp, soft drop shadow, animated) */}
          <AnimatePresence mode="popLayout">
            <motion.div
              key={selectedProduct.product_id}
              initial={{ scale: 0.84, opacity: 0.5 }}
              animate={{
                scale: selectedProduct.sizeScale ?? 1.0,
                opacity: 1,
              }}
              exit={{ scale: 0.84, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 260 }}
              className="relative w-44 h-44 shrink-0 z-10 flex items-center justify-center pointer-events-none select-none"
            >
              <Image
                src={selectedProduct.image}
                alt={selectedProduct.name || ""}
                fill
                sizes="176px"
                priority
                className="object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.11)] select-none pointer-events-none"
              />
            </motion.div>
          </AnimatePresence>

          {/* Right: Next Variant (peeking from right edge, clickable) */}
          {nextVariant && (
            <motion.button
              type="button"
              key={`next-${nextVariant.product_id}`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 0.5, x: 0 }}
              whileHover={{ opacity: 0.8 }}
              whileTap={{ scale: 0.7 }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectProduct(nextVariant);
              }}
              aria-label={`View ${nextVariant.subtitle || nextVariant.name}`}
              className="absolute -right-6 sm:-right-3 top-1/2 -translate-y-1/2 w-28 h-28 shrink-0 z-0 cursor-pointer flex items-center justify-center transition-all"
              style={{
                transform: `translateY(-50%) scale(${(nextVariant.sizeScale ?? 1) * 0.72})`,
              }}
            >
              <div className="relative w-full h-full flex items-center justify-center">
                <Image
                  src={nextVariant.image}
                  alt={nextVariant.subtitle || ""}
                  fill
                  sizes="112px"
                  className="object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.07)] pointer-events-none select-none"
                />
              </div>
            </motion.button>
          )}
        </motion.div>
      </div>

      {/* Product Name, Dynamic Subtitle (Size), and Price */}
      <div className="flex flex-col items-center gap-1.5 mb-6 text-center">
        <h3 className="text-[#838EF8] text-sm tracking-[0.1em] uppercase">
          {selectedProduct.name}
        </h3>
        <AnimatePresence mode="wait">
          <motion.p
            key={selectedProduct.product_id}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
            className="text-black text-2xl tracking-wider uppercase font-semibold"
          >
            {selectedProduct.subtitle || selectedProduct.description || ""}
          </motion.p>
        </AnimatePresence>
        {selectedProduct.priceNaira && (
          <AnimatePresence mode="wait">
            <motion.span
              key={`price-${selectedProduct.product_id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm font-semibold text-neutral-500 tracking-wider"
            >
              ₦{selectedProduct.priceNaira.toLocaleString()}
            </motion.span>
          </AnimatePresence>
        )}
      </div>

      {/* ADD to Cart Button -> takes product into the wire basket via Zustand */}
      <button
        type="button"
        onClick={onAddToCart}
        className="bg-brand-primary text-white text-sm tracking-wider uppercase px-16 py-4.5 rounded-full shadow-[0_6px_24px_rgba(19,23,228,0.35)] hover:shadow-[0_8px_32px_rgba(19,23,228,0.5)] hover:scale-[1.03] active:scale-95 transition-all cursor-pointer mb-10"
      >
        ADD to Cart
      </button>

      {/* SHOP FOR OTHER ACCESSORIES */}
      <div className="w-full flex flex-col items-center mt-auto pb-4">
        <p className="text-[#838EF8] text-[11px] tracking-[0.12em] uppercase mb-4 text-center">
          SHOP FOR OTHER
          <br />
          ACCESSORIES
        </p>
        <div className="flex items-center justify-center gap-5 w-full">
          {otherProducts.map((item) => (
            <button
              key={item.product_id}
              type="button"
              onClick={() => onSelectProduct(item)}
              title={item.name}
              className="relative w-14 h-14 shrink-0 flex items-center justify-center hover:scale-110 active:scale-90 transition-transform cursor-pointer"
            >
              <Image
                src={item.image}
                alt={item.name || ""}
                fill
                sizes="56px"
                className="object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.14)]"
              />
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default ShopProductDetail;
