import {
  createContext, createElement, useCallback, useContext, useEffect, useMemo,
  useState, type ReactNode,
} from "react";

/**
 * The cart.
 *
 * Lives entirely in the browser until checkout. Adding to the cart reserves
 * nothing — spec 27 is explicit that stock is only held at final order
 * confirmation, so a basket sitting open for an hour must not starve the shop.
 */

export interface CartLine {
  kind: "product" | "bundle";
  id: string;
  name: string;
  price_kobo: number;
  image_path: string | null;
  quantity: number;
  /** Availability as it was when the item went in. Advisory, re-checked at
   *  checkout by the database. */
  available_at_add: number;
}

interface CartState {
  lines: CartLine[];
  count: number;
  subtotalKobo: number;
  add: (line: Omit<CartLine, "quantity">, qty?: number) => void;
  setQuantity: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const KEY = "u2gas.cart.v1";

const CartContext = createContext<CartState>({
  lines: [], count: 0, subtotalKobo: 0,
  add: () => {}, setQuantity: () => {}, remove: () => {}, clear: () => {},
});

function read(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Anything malformed is discarded rather than crashing the shop on load.
    return Array.isArray(parsed) ? parsed.filter(isLine) : [];
  } catch {
    return [];
  }
}

function isLine(v: any): v is CartLine {
  return v && typeof v.id === "string"
    && (v.kind === "product" || v.kind === "bundle")
    && Number.isFinite(v.price_kobo) && Number.isInteger(v.quantity) && v.quantity > 0;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(read);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* private mode */ }
  }, [lines]);

  // Another tab checking out should empty this one too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setLines(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((line: Omit<CartLine, "quantity">, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.id === line.id);
      if (existing) {
        return prev.map((l) =>
          l.id === line.id ? { ...l, quantity: l.quantity + qty } : l);
      }
      return [...prev, { ...line, quantity: qty }];
    });
  }, []);

  const setQuantity = useCallback((id: string, qty: number) => {
    setLines((prev) =>
      qty <= 0 ? prev.filter((l) => l.id !== id)
               : prev.map((l) => (l.id === id ? { ...l, quantity: qty } : l)));
  }, []);

  const remove = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartState>(() => ({
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotalKobo: lines.reduce((n, l) => n + l.price_kobo * l.quantity, 0),
    add, setQuantity, remove, clear,
  }), [lines, add, setQuantity, remove, clear]);

  return createElement(CartContext.Provider, { value }, children);
}

export const useCart = () => useContext(CartContext);

/** Shape the checkout endpoint expects. */
export function toOrderLines(lines: CartLine[]) {
  return lines.map((l) =>
    l.kind === "bundle"
      ? { kind: "bundle" as const, bundle_id: l.id, quantity: l.quantity }
      : { kind: "product" as const, product_id: l.id, quantity: l.quantity });
}
