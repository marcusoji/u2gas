import ShopCard from "@/components/home/ShopCard";
import type { Product } from "@/types";
import { products } from "@/data";

type AccessoriesSectionProps = {
  items?: Product[];
  onSelectAccessory?: (item: Product) => void;
  className?: string;
};

export default function ShopSection({
  items = products,
  onSelectAccessory,
  className = "",
}: AccessoriesSectionProps) {
  return (
    <section className={`w-full flex flex-col items-center ${className}`}>
      <h2 className="text-2xl font-semibold text-[#838EF8]  uppercase mb-3 text-center">
        SHOP FOR ACCESSORIES
      </h2>

      <div className="w-full relative rounded-[64px] border border-dashed border-dark p-8">
        <div className="grid grid-cols-2 gap-4">
          {items.slice(0, 4).map((item, i) => (
            <ShopCard
              key={i}
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
