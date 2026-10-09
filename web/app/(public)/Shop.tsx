"use client";

import { useMemo } from "react";
import ShopCard from "@/components/home/ShopCard";
import type { Product } from "@/types";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { toViewProduct } from "@/lib/adapters";
import { Loading, ScreenNotice } from "@/components/screen-notice";

type AccessoriesSectionProps = {
  items?: Product[];
  onSelectAccessory?: (item: Product) => void;
  className?: string;
};

/**
 * The four-up accessory strip on the customer terminal.
 *
 * Items come from the catalogue, not a fixture: an item the depot no longer
 * stocks is marked unavailable and stays visible, rather than silently
 * disappearing and leaving a hole in the grid.
 */
export default function ShopSection({
  items,
  onSelectAccessory,
  className = "",
}: AccessoriesSectionProps) {
  // A page may pass its own already-fetched items; otherwise this fetches.
  const shop = useAsync(() => api.shop(), [], { enabled: !items });

  const resolved = useMemo(() => {
    if (items) return items;
    const rows = shop.data?.items ?? [];
    return rows.slice(0, 4).map((i) => toViewProduct(i) as unknown as Product);
  }, [items, shop.data]);

  if (!items && shop.loading) {
    return <Loading label="LOADING ACCESSORIES…" />;
  }
  if (!items && shop.error) {
    return <ScreenNotice tone="error">{shop.error.message}</ScreenNotice>;
  }

  return (
    <section className={`w-full flex flex-col items-center ${className}`}>
      <h2 className="text-2xl font-semibold text-[#838EF8] uppercase mb-3 text-center">
        SHOP FOR ACCESSORIES
      </h2>

      <div className="w-full relative rounded-[64px] border border-dashed border-dark p-8">
        {resolved.length === 0 ? (
          <p className="text-center text-[12px] font-mono text-[#838EF8] uppercase tracking-wider">
            NO ACCESSORIES YET
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {resolved.map((item) => (
              <ShopCard
                key={item.product_id}
                item={item}
                onSelect={onSelectAccessory}
                bgColor={item.bgColor}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
