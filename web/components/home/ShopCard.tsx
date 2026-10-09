"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Product } from "@/types";
import { paths } from "@/utils/paths";

type ShopCardProps = {
  item: Product;
  onSelect?: (item: Product) => void;
  bgColor?: string;
};

export default function ShopCard({ item, onSelect, bgColor }: ShopCardProps) {
  const router = useRouter();

  const handleClick = () => {
    if (onSelect) {
      onSelect(item);
    } else {
      router.push(paths.shop);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={item.name}
      className="aspect-square w-full rounded-[28px] p-4 flex items-center justify-center relative overflow-hidden transition-transform hover:scale-[1.03] active:scale-95 cursor-pointer shadow-xs"
      style={{ backgroundColor: bgColor || item.bgColor }}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        <Image
          src={item.image}
          alt={item.name || ""}
          fill
          sizes="(max-width: 768px) 150px, 180px"
          className="object-contain p-1"
        />
      </div>
    </button>
  );
}
