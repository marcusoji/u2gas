"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { ShopModal } from "@/components/modals/ShopModal";
import type { Product } from "@/types";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { toViewProduct } from "@/lib/adapters";
import { paths } from "@/utils/paths";

export default function ShopPage() {
  const router = useRouter();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // The catalogue is server-side; search is filtered here so typing stays
  // instant, and the full list is small enough to hold.
  const shop = useAsync(() => api.shop(), []);
  const products: Product[] = useMemo(
    () =>
      (shop.data?.items ?? []).map(
        (i) => toViewProduct(i) as unknown as Product,
      ),
    [shop.data],
  );

  const filteredItems = products.filter((item) =>
    (item.name || "").toLowerCase().includes(searchQuery.toLowerCase().trim()),
  );

  const handleSelectProduct = (item: Product) => {
    setSelectedProduct(item);
    setIsModalOpen(true);
  };

  const handleCloseSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  const handleBack = () => {
    router.push(paths.home);
  };

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  return (
    <main className="w-full min-h-screen bg-white flex flex-col items-center select-none pb-12 relative overflow-x-hidden">
      <div className="w-full max-w-[420px] flex flex-col pt-5 pb-8 px-5 relative min-h-screen">
        {/* HEADER: BACK BUTTON (LEFT) & BLUE CIRCLE (RIGHT) */}
        <div className="w-full flex items-center justify-between mb-8 z-10">
          <button
            type="button"
            onClick={handleBack}
            className="bg-[#1317E4] text-white font-mono text-[11px] font-bold px-3 py-1.5 rounded-[6px] tracking-wider uppercase flex items-center gap-1.5 shadow-xs hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer select-none"
            aria-label="Go Back"
          >
            <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="leading-none">BACK</span>
          </button>

          {/* <button
            type="button"
            className="w-8 h-8 rounded-full bg-[#1317E4] shadow-xs active:scale-95 transition-transform cursor-pointer"
            aria-label="Profile or Cart"
          /> */}
        </div>

        {/* PRODUCTS GRID */}
        <div
          style={{
            filter: isSearchOpen ? "blur(10px)" : "none",
            opacity: isSearchOpen ? 0.35 : 1,
            transition: "filter 0.3s ease, opacity 0.3s ease",
          }}
          className={`w-full grid grid-cols-2 gap-x-6 gap-y-8 px-1 mb-10 ${
            isSearchOpen ? "pointer-events-none scale-[0.98]" : ""
          }`}
        >
          {filteredItems.map((item, index) => (
            <motion.div
              key={`${item.product_id}-${index}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
              onClick={() => handleSelectProduct(item)}
              className="w-full relative flex items-center justify-center group cursor-pointer hover:scale-[1.04] active:scale-95 transition-transform"
            >
              <div className="relative w-full aspect-[406/482] flex items-center justify-center p-2">
                <Image
                  src={item.image}
                  alt={item.name || ""}
                  fill
                  sizes="(max-width: 480px) 50vw, 200px"
                  className="object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.16)] transition-all duration-300 group-hover:drop-shadow-[0_14px_28px_rgba(0,0,0,0.22)]"
                />
              </div>
            </motion.div>
          ))}

          {filteredItems.length === 0 && (
            <div className="col-span-2 py-12 text-center text-sm text-neutral-400 font-mono">
              NO ACCESSORIES FOUND
            </div>
          )}
        </div>

        {/* SEARCH ANYTHING BUTTON */}
        {!isSearchOpen && (
          <div className="w-full flex justify-center mt-auto pb-4">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="w-full max-w-[260px] rounded-full border border-dashed border-[#C5CAE9] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] px-5 py-3 flex items-center justify-center cursor-pointer hover:border-[#1317E4] hover:shadow-[0_4px_16px_rgba(19,23,228,0.12)] transition-all active:scale-[0.98]"
            >
              <span
                style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                className="text-[12px] tracking-wider text-[#838EF8] uppercase"
              >
                SEARCH ANYTHING
              </span>
            </button>
          </div>
        )}

        {/* SEARCH OVERLAY */}
        <AnimatePresence>
          {isSearchOpen && (
            <>
              <motion.div
                key="search-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCloseSearch}
                className="fixed inset-0 z-30 bg-black/10 backdrop-blur-[2px]"
              />
              <motion.div
                key="search-floating-bar"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ type: "spring", damping: 24, stiffness: 300 }}
                className="fixed top-24 left-4 right-4 z-40 flex justify-center"
              >
                <div className="w-full max-w-[320px] relative rounded-full border border-dashed border-[#1317E4] bg-white shadow-[0_8px_32px_rgba(19,23,228,0.2)] px-5 py-3 flex items-center transition-all">
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") handleCloseSearch();
                    }}
                    placeholder="SEARCH ANYTHING"
                    style={{
                      fontFamily: 'var(--font-jgs7), "jgs7", monospace',
                    }}
                    className="w-full bg-transparent text-center text-[13px] tracking-wider text-[#1317E4] placeholder:text-[#838EF8]/70 outline-none uppercase"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-4 text-[#1317E4] text-base hover:opacity-70 cursor-pointer"
                    >
                      ×
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCloseSearch}
                      className="absolute right-4 text-neutral-400 text-sm hover:text-neutral-600 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <ShopModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          initialProduct={selectedProduct}
        />
      </div>
    </main>
  );
}
