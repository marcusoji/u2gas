"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useCartStore } from "@/stores/cartStore";
import { cn } from "@/lib/utils";
import { formatItemTitle, formatItemVariant } from "@/helpers/functions";

export type ShopBasketViewProps = {
  onGoShopping: () => void;
  onCheckout: () => void;
};

// Basket item positioning coordinates inside the wire basket PNG
export const getBasketItemStyle = (index: number, total: number) => {
  if (total === 1) {
    return {
      top: "34%",
      left: "50%",
      transform: "translate(-50%, -50%) rotate(0deg)",
    };
  }
  if (total === 2) {
    return index === 0
      ? { top: "24%", left: "28%", transform: "rotate(-6deg)" }
      : { bottom: "24%", right: "26%", transform: "rotate(4deg)" };
  }
  if (total === 3) {
    if (index === 0)
      return { top: "18%", left: "27%", transform: "rotate(-6deg)" };
    if (index === 1)
      return { top: "20%", right: "22%", transform: "rotate(4deg)" };
    return { bottom: "22%", left: "34%", transform: "rotate(-2deg)" };
  }
  // 4 or more
  switch (index % 4) {
    case 0:
      return { top: "18%", left: "27%", transform: "rotate(-6deg)" };
    case 1:
      return { top: "18%", right: "22%", transform: "rotate(4deg)" };
    case 2:
      return { bottom: "22%", left: "24%", transform: "rotate(-3deg)" };
    case 3:
    default:
      return { bottom: "20%", right: "22%", transform: "rotate(2deg)" };
  }
};

export function ShopBasketView({
  onGoShopping,
  onCheckout,
}: ShopBasketViewProps) {
  const cartItems = useCartStore((state) => state.items);
  const increaseQuantity = useCartStore((state) => state.increaseQuantity);
  const decreaseQuantity = useCartStore((state) => state.decreaseQuantity);

  return (
    <motion.div
      key="basket-view"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center w-full min-h-0 relative pb-8"
    >
      {/* Wire Basket Container */}
      <div className="relative w-[280px] h-[370px] sm:w-[300px] sm:h-[390px] mx-auto select-none my-1 flex items-center justify-center">
        {/* Basket PNG (wire frame) */}
        <Image
          src="/images/basket.png"
          alt="Shopping Basket"
          fill
          priority
          className="object-contain pointer-events-none z-10"
        />

        {/* Items placed inside basket */}
        <div className="absolute inset-4 z-20 pointer-events-auto">
          {cartItems.map((item, index) => {
            const pos = getBasketItemStyle(index, cartItems.length);
            return (
              <motion.div
                key={`basket-item-${item.id}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{
                  type: "spring",
                  damping: 18,
                  stiffness: 260,
                  delay: index * 0.05,
                }}
                style={pos as React.CSSProperties}
                className="absolute w-20 h-22 sm:w-22 sm:h-24 flex items-center justify-center group"
              >
                <div className="relative w-full h-full flex items-center justify-center">
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    sizes="88px"
                    className="object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.22)]"
                  />

                  {/* Unavailable stamp if item is out of stock */}
                  {item.unavailable && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-white/95 border border-[#FF2222] px-1.5 py-0.5 rounded-[2px] shadow-xs rotate-[-8deg] z-20 pointer-events-none">
                      <span className="text-[7.5px] text-[#FF2222] font-bold tracking-wider uppercase">
                        ITEM UNAVAILABLE
                      </span>
                    </div>
                  )}

                  {/* Cancel "×" button to remove item from basket */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      decreaseQuantity(item.id);
                    }}
                    aria-label={`Remove ${item.name} from basket`}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-neutral-300 shadow-xs flex items-center justify-center text-[11px] text-neutral-600 hover:bg-red-50 hover:text-red-500 hover:border-red-300 transition-colors cursor-pointer z-30 active:scale-90"
                  >
                    ×
                  </button>
                </div>
              </motion.div>
            );
          })}

          {/* Empty Basket: Red Stamp "GO FOR A LIL' MORE SHOPPING" */}
          {cartItems.length === 0 && (
            <motion.button
              type="button"
              onClick={onGoShopping}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-6 z-30 pointer-events-auto cursor-pointer group"
            >
              <div className="border-[2px] border-[#FF2222] bg-white/95 px-3 py-1.5 rounded-[3px] shadow-[0_2px_10px_rgba(255,34,34,0.15)] flex items-center justify-center">
                <span className="text-[12px] sm:text-[13px] font-bold text-[#FF2222] tracking-wider uppercase whitespace-nowrap drop-shadow-[0_0_2px_rgba(255,34,34,0.3)]">
                  GO FOR A LIL&apos; MORE SHOPPING
                </span>
              </div>
            </motion.button>
          )}
        </div>
      </div>

      {/* Checkout Button (solid blue if items exist, disabled lavender purple if empty) */}
      <button
        type="button"
        disabled={cartItems.length === 0}
        onClick={onCheckout}
        className={cn(
          "relative z-10 text-[15px] tracking-wider uppercase px-16 py-4.5 rounded-full transition-all mt-4 mb-6",
          cartItems.length === 0
            ? "bg-[#8E95EA] text-white/90 cursor-not-allowed shadow-[0_4px_16px_rgba(142,149,234,0.25)]"
            : "bg-[#001AFE] hover:bg-[#0014D4] active:scale-95 text-white shadow-[0_6px_24px_rgba(0,26,254,0.35)] cursor-pointer",
        )}
      >
        Checkout
      </button>

      {/* Cart Items List matching exact design (media_1791157228483) */}
      <div className="flex flex-col gap-3.5 w-full max-w-[340px] mx-auto relative z-10">
        {cartItems.map((item) => (
          <div
            key={`list-${item.id}`}
            className="w-full rounded-[34px] sm:rounded-[36px] border border-dashed border-[#B8B8B8] bg-white px-5 py-3 flex items-center justify-between gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)] relative z-10"
          >
            {/* Thumbnail with soft drop shadow */}
            <div className="relative w-12 h-14 shrink-0 flex items-center justify-center">
              <Image
                src={item.image}
                alt={item.name}
                fill
                sizes="56px"
                className="object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.14)] select-none pointer-events-none"
              />
            </div>

            {/* Name & Variant in matching blue pixel typography */}
            <div className="flex flex-col min-w-0 flex-1 text-left justify-center select-none pl-1">
              <span className="text-[15px] sm:text-[16px] text-[#001AFE] font-medium tracking-normal leading-[1.2] truncate">
                {formatItemTitle(item.name)}
              </span>
              <span className="text-[15px] sm:text-[16px] text-[#001AFE] font-medium tracking-normal uppercase leading-[1.2] truncate">
                {formatItemVariant(item.description)}
              </span>
            </div>

            {/* Quantity Controls: (-) Grey Button, Quantity Number in Center, (+) Blue Button */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Minus Circle Button (Solid Grey with White Minus Bar) */}
              <button
                type="button"
                onClick={() => decreaseQuantity(item.id)}
                aria-label={`Decrease ${item.name} quantity`}
                className="w-8.5 h-8.5 rounded-full bg-[#828287] hover:bg-[#727277] active:scale-90 flex items-center justify-center cursor-pointer shadow-xs transition-transform"
              >
                <span className="w-3.5 h-[2.5px] bg-white rounded-full block" />
              </button>

              {/* Quantity Number in Center */}
              <span className="w-5 text-center text-[15px] font-pixel font-medium text-black select-none">
                {item.quantity}
              </span>

              {/* Plus Circle Button (Solid Periwinkle-Blue with White Plus Cross) */}
              <button
                type="button"
                onClick={() => increaseQuantity(item.id)}
                aria-label={`Increase ${item.name} quantity`}
                className="w-8.5 h-8.5 rounded-full bg-[#838EF8] hover:bg-[#727DF7] active:scale-90 flex items-center justify-center cursor-pointer shadow-xs transition-transform"
              >
                <div className="relative w-3.5 h-3.5 flex items-center justify-center">
                  <span className="w-3.5 h-[2.5px] bg-white rounded-full absolute" />
                  <span className="h-3.5 w-[2.5px] bg-white rounded-full absolute" />
                </div>
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default ShopBasketView;
