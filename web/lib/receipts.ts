import type { Order, OrderItem } from "./types";
import type {
  HistoryReceipt,
  ReceiptItem,
  DriverDeliveryOrder,
  DriverDeliveryStatusTab,
  CashierTransactionItem,
  CashierStatusTab,
} from "@/types";
import { mediaUrl } from "./media";
import { koboToNaira } from "@/helpers/functions";
import { PAYMENT_MEDIUM, monthName } from "./adapters";

/* ---------------------------------------------------------------------------
   Backend orders → the receipt/row shapes the drawings were made against.

   Everything here derives from a real order. Where the drawing shows a value
   the server does not hold (a map thumbnail, an operator name), the adapter
   returns an empty string and the component falls back — it never invents a
   name, an order number or an amount.
   --------------------------------------------------------------------------- */

const MONTHS_UPPER = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

function itemToReceiptItem(item: OrderItem): ReceiptItem {
  return {
    id: item.order_item_id,
    title: item.product?.name ?? "U2 Accessory",
    subtitle: item.product?.subtitle ?? undefined,
    image: mediaUrl(item.product?.image_asset) ?? "/shop/gas-cylinder.jpg",
    priceNaira: koboToNaira(item.unit_price_kobo),
    quantity: item.quantity,
  };
}

/** The order's lines, with the gas itself shown as a line when there is gas. */
export function orderReceiptItems(o: Order): ReceiptItem[] {
  const items = (o.items ?? []).map(itemToReceiptItem);
  if (o.gas_amount_kg > 0) {
    items.unshift({
      id: "gas",
      title: `${o.gas_amount_kg}kg Cooking Gas`,
      subtitle: "Refill",
      image: "/shop/gas-cylinder.jpg",
      priceNaira: koboToNaira(o.gas_subtotal_kobo),
      quantity: 1,
    });
  }
  return items;
}

/** The Worker's payment status mapped to the four-segment bar's step. */
function orderProgress(o: Order): { step: number; label: string } {
  if (o.fulfillment_type !== "delivery") return { step: 4, label: "Collected" };
  const d = o.delivery;
  switch (d?.status) {
    case "delivered":
      return { step: 4, label: "Delivered" };
    case "en_route":
      return { step: 3, label: "In motion" };
    case "assigned":
      return { step: 2, label: "Assigned" };
    case "failed":
    case "returned":
      return { step: 1, label: "Returned" };
    case "rescheduled":
      return { step: 2, label: "Rescheduled" };
    default:
      return { step: 1, label: "Confirmed" };
  }
}

export function toHistoryReceipt(o: Order): HistoryReceipt {
  const date = new Date(o.created_at);
  const payment = o.payments?.find((p) => p.paid_at) ?? o.payments?.[0];
  const { step, label } = orderProgress(o);

  return {
    id: o.order_id,
    orderNumber: o.order_number,
    date: date
      .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
      .toUpperCase(),
    month: MONTHS_UPPER[date.getMonth()] ?? monthName(date),
    deliveryStatus:
      o.fulfillment_type === "delivery"
        ? step >= 4
          ? "DELIVERED"
          : "IN DELIVERY"
        : "READY FOR COLLECTION",
    progressStep: step,
    progressLabel: label,
    items: orderReceiptItems(o),
    customerName: o.profile?.display_name ?? o.guest_name ?? undefined,
    customerPhone: o.guest_phone ?? o.profile?.phone ?? undefined,
    subtotal: koboToNaira(o.total_kobo - o.delivery_fee_kobo),
    deliveryFee: koboToNaira(o.delivery_fee_kobo),
    total: koboToNaira(o.total_kobo),
    paymentMedium: payment ? PAYMENT_MEDIUM[payment.method] ?? "TRANSFER" : "—",
    paymentMediumAmount: payment ? koboToNaira(payment.amount_kobo) : undefined,
    time: date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    reference: o.order_number,
    statusOnline: o.fulfillment_type,
  };
}

/* --- Driver ---------------------------------------------------------------- */

/** The driver's own deliveries, which carry the order nested. */
export function dropsToDriverHistory(
  drops: import("./types").DriverDrop[],
): DriverDeliveryOrder[] {
  return drops.map((d) => {
    const o = d.order;
    const tab: DriverDeliveryStatusTab =
      d.status === "failed" || d.status === "returned"
        ? "UNFULFILLED"
        : d.status === "delivered"
          ? "COMPLETED"
          : o.status === "cancelled"
            ? "CANCELLED"
            : "UNFULFILLED";
    return {
      id: d.delivery_id ?? o.order_id,
      title: `${o.gas_amount_kg || "—"}kg Cylinder`,
      date: new Date(o.created_at),
      customerName: o.profile?.display_name ?? o.guest_name ?? "Walk-in",
      address: d.delivery_address ?? o.delivery_address ?? undefined,
      status: tab,
    };
  });
}

/* --- Cashier --------------------------------------------------------------- */

function cashierMode(o: Order): CashierStatusTab {
  return o.guest_phone ? "IN—PERSON" : "ONLINE";
}

/** Queue rows carry less than a full order, so only these fields are read. */
type HistorySource = {
  order_id: string;
  created_at: string;
  gas_amount_kg?: number;
  guest_phone: string | null;
  payments?: { method: string; status: string; amount_kobo: number; paid_at: string | null }[];
};

export function toCashierTransactions(
  orders: HistorySource[],
): CashierTransactionItem[] {
  return orders.map((o) => {
    const payment = o.payments?.find((p) => p.paid_at) ?? o.payments?.[0];
    return {
      id: o.order_id,
      title:
        (o.gas_amount_kg ?? 0) > 0
          ? `${o.gas_amount_kg}kg Cooking Gas`
          : "Accessory Order",
      date: new Date(o.created_at),
      paymentMethod: (payment
        ? PAYMENT_MEDIUM[payment.method] ?? "TRANSFER"
        : "CASH") as CashierTransactionItem["paymentMethod"],
      mode: cashierMode(o as Order),
    };
  });
}
