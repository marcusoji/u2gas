"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { Product } from "@/types";

export type ShopGridViewProps = {
  products: Product[];
  onSelectProduct: (product: Product) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onCloseSearch: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
};

export function ShopGridView({
  products,
  onSelectProduct,
  isSearchOpen,
  setIsSearchOpen,
  searchQuery,
  setSearchQuery,
  onCloseSearch,
  inputRef,
}: ShopGridViewProps) {
  const filteredProducts = products.filter((item) =>
    (item.name || "").toLowerCase().includes(searchQuery.toLowerCase().trim()),
  );

  return (
    <>
      <motion.div
        key="grid"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-center w-full min-h-0"
      >
        {/* Products Grid — heavily blurred when search is open */}
        <div
          style={{
            filter: isSearchOpen ? "blur(10px)" : "none",
            opacity: isSearchOpen ? 0.35 : 1,
            transition: "filter 0.3s ease, opacity 0.3s ease",
          }}
          className={`w-full grid grid-cols-2 gap-x-6 gap-y-8 px-1 mb-8 ${
            isSearchOpen ? "pointer-events-none scale-[0.98]" : ""
          }`}
        >
          {filteredProducts.map((item, index) => (
            <motion.div
              key={`${item.product_id}-${index}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
              onClick={() => onSelectProduct(item)}
              className="aspect-square w-full relative flex items-center justify-center group cursor-pointer hover:scale-[1.04] active:scale-95 transition-transform"
            >
              <div className="relative w-28 h-28 flex items-center justify-center">
                <Image
                  src={item.image}
                  alt={item.name || ""}
                  fill
                  sizes="112px"
                  className="object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.16)] transition-all duration-300 group-hover:drop-shadow-[0_14px_28px_rgba(0,0,0,0.22)]"
                />
              </div>
            </motion.div>
          ))}

          {filteredProducts.length === 0 && (
            <div className="col-span-2 py-12 text-center text-sm text-neutral-400">
              NO ACCESSORIES FOUND
            </div>
          )}
        </div>

        {/* Search Button under the products (hidden when search is open) */}
        {!isSearchOpen && (
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="w-full max-w-[260px] rounded-full border border-dashed border-[#B0B0B0] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] px-5 py-3 flex items-center justify-center cursor-pointer hover:border-[#838EF8] hover:shadow-[0_4px_16px_rgba(131,142,248,0.12)] transition-all active:scale-[0.98] mb-4"
          >
            <span className="text-[13px] tracking-wider text-[#838EF8]/80 uppercase">
              SEARCH ANYTHING
            </span>
          </button>
        )}
      </motion.div>

      {/* Search Overlay inside the modal */}
      <AnimatePresence>
        {isSearchOpen && (
          <>
            <motion.div
              key="search-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseSearch}
              className="absolute inset-0 z-30"
            />
            <motion.div
              key="search-floating-bar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 24, stiffness: 300 }}
              className="absolute top-24 left-4 right-4 z-40 flex justify-center"
            >
              <div className="w-full max-w-[320px] relative rounded-full border border-dashed border-[#838EF8] bg-white shadow-[0_8px_32px_rgba(131,142,248,0.2)] px-5 py-3 flex items-center transition-all">
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") onCloseSearch();
                  }}
                  placeholder="SEARCH ANYTHING"
                  className="w-full bg-transparent text-center text-[13px] tracking-wider text-[#838EF8] placeholder:text-[#838EF8]/70 outline-none uppercase"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 text-[#838EF8] text-base hover:opacity-70 cursor-pointer"
                  >
                    ×
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onCloseSearch}
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
    </>
  );
}

export default ShopGridView;
