"use client";

import ShopCard from "@/components/home/ShopCard";
import { useShop } from "@/hooks/useApiData";
import type { Product } from "@/types";

type AccessoriesSectionProps = {
  items?: Product[];
  onSelectAccessory?: (item: Product) => void;
  className?: string;
};

export default function ShopSection({
  items,
  onSelectAccessory,
  className = "",
}: AccessoriesSectionProps) {
  const { data } = useShop();
  // A caller may pin the list; otherwise it comes from the Worker.
  const list = items ?? data?.items ?? [];

  return (
    <section className={`w-full flex flex-col items-center ${className}`}>
      <h2 className="text-2xl font-semibold text-[#838EF8]  uppercase mb-3 text-center">
        SHOP FOR ACCESSORIES
      </h2>

      <div className="w-full relative rounded-[64px] border border-dashed border-dark p-8">
        <div className="grid grid-cols-2 gap-4">
          {list.slice(0, 4).map((item, i) => (
            <ShopCard
              key={item.product_id ?? i}
              item={item}
              onSelect={onSelectAccessory}
              bgColor={item.bgColor}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
