import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product, CartItem } from "@/types";

export type { CartItem };

interface CartState {
  items: CartItem[];
  addToCart: (item: Product | (Partial<Omit<CartItem, "description">> & { description?: string | null; id?: string; product_id?: string; image: string })) => void;
  removeFromCart: (id: string) => void;
  increaseQuantity: (id: string) => void;
  decreaseQuantity: (id: string) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addToCart: (product) => {
        const id =
          ("id" in product ? product.id : undefined) ||
          product.product_id ||
          `${product.name || "item"}-${product.description || ""}`;
        const existing = get().items.find((item) => item.id === id);

        if (existing) {
          set({
            items: get().items.map((item) =>
              item.id === id ? { ...item, quantity: item.quantity + 1 } : item
            ),
          });
        } else {
          const newItem: CartItem = {
            id,
            name: product.name || "U2 Accessory",
            description: product.description || (product as Product).subtitle || "Standard",
            image: product.image,
            priceNaira: product.priceNaira || 8500,
            quantity: 1,
            unavailable: product.unavailable || false,
            // The drawn basket keeps a bundle's kind so checkout can send its
            // id as `bundle_id`; a plain product has none and defaults.
            kind: (product as { kind?: "product" | "bundle" }).kind ?? "product",
          };
          set({ items: [...get().items, newItem] });
        }
      },

      removeFromCart: (id) => {
        set({ items: get().items.filter((item) => item.id !== id) });
      },

      increaseQuantity: (id) => {
        set({
          items: get().items.map((item) =>
            item.id === id ? { ...item, quantity: item.quantity + 1 } : item
          ),
        });
      },

      decreaseQuantity: (id) => {
        set({
          items: get().items
            .map((item) => {
              if (item.id === id) {
                const newQty = item.quantity - 1;
                return newQty > 0 ? { ...item, quantity: newQty } : null;
              }
              return item;
            })
            .filter(Boolean) as CartItem[],
        });
      },

      clearCart: () => set({ items: [] }),

      getTotalItems: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getTotalPrice: () => {
        return get().items.reduce((sum, item) => sum + item.priceNaira * item.quantity, 0);
      },
    }),
    {
      name: "u2gas_cart_v2",
    }
  )
);
