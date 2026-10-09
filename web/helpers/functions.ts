import type { GasStock, Notification, GasOrderDraft } from "@/types";

const KNOWN_TITLE_ALIASES: Record<string, string> = {
  "u2 gas cylinder": "U2 Power Cylinder",
  "u2 power hose": "U2 Power Hose",
  "u2 ignition battery": "U2 Ignition Battery",
  "u2 hose clamps": "U2 Hose Clamps",
};

const KNOWN_VARIANT_ALIASES: Record<string, string> = {
  "6kg": "MEDIUM",
  "12.5kg": "BIG",
  "3kg": "SMALL",
};

export function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function koboToNaira(kobo: number): number {
  return Math.round(kobo / 100);
}

export function formatItemTitle(name?: string | null): string {
  if (!name) return "U2 Accessory";
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  if (KNOWN_TITLE_ALIASES[lower]) {
    return KNOWN_TITLE_ALIASES[lower];
  }

  return trimmed.replace(
    /\w\S*/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

export function formatItemVariant(desc?: string | null): string {
  if (!desc) return "STANDARD";
  const trimmed = desc.trim();
  const lower = trimmed.toLowerCase();

  if (KNOWN_VARIANT_ALIASES[lower]) {
    return KNOWN_VARIANT_ALIASES[lower];
  }

  return trimmed.toUpperCase();
}

export function getEffectiveRates(
  stock?: GasStock,
  ratePerKg: number = 1400
) {
  const effectiveRateNaira =
    stock && stock.rate_kobo_per_kg
      ? Math.round(stock.rate_kobo_per_kg / 100)
      : ratePerKg;

  const effectiveRateKobo =
    stock && stock.rate_kobo_per_kg
      ? stock.rate_kobo_per_kg
      : effectiveRateNaira * 100;

  return { effectiveRateNaira, effectiveRateKobo };
}

export function getUnreadNotificationCount(
  notifications?: Notification[],
  fallbackCount: number = 3
): number {
  if (notifications !== undefined) {
    return notifications.filter((n) => !n.read_at).length;
  }
  return fallbackCount;
}

export function calculateGasOrder(
  displayValue: string,
  rateNaira: number,
  rateKobo: number
): GasOrderDraft {
  const currentDigits = displayValue.replace(/[^0-9]/g, "");
  const kg = parseInt(currentDigits, 10) || 0;

  return {
    gas_amount_kg: kg,
    gas_subtotal_kobo: kg * rateKobo,
    rate_at_purchase: rateKobo,
    total_naira: kg * rateNaira,
    display_value: displayValue,
  };
}

export function deleteKeypadDigit(currentValue: string): string {
  const currentDigits = currentValue.replace(/[^0-9]/g, "");
  if (currentDigits.length <= 1) {
    return "0KG";
  }
  return `${currentDigits.slice(0, -1)}KG`;
}

export function appendKeypadDigit(
  currentValue: string,
  digit: string,
  isFirstTyping: boolean = false
): string {
  if (!/^[0-9]$/.test(digit)) return currentValue;

  const currentDigits = currentValue.replace(/[^0-9]/g, "");

  if (isFirstTyping || currentDigits === "0") {
    return `${digit}KG`;
  }

  if (currentDigits.length >= 4) {
    return currentValue;
  }

  return `${currentDigits}${digit}KG`;
}
