import { cn } from "@/lib/utils";

export type PaymentMethod = "CASH" | "POS" | "BANK TRANS";

interface PaymentMethodBadgeProps {
  method: PaymentMethod;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function PaymentMethodBadge({
  method,
  selected = false,
  onClick,
  className = "",
}: PaymentMethodBadgeProps) {
  // Tilts matching user section: CASH tilts left (-6deg), POS is straight (0deg), BANK TRANS tilts right (+6deg)
  const defaultRotation =
    method === "CASH"
      ? "-rotate-6"
      : method === "POS"
        ? "rotate-0"
        : "rotate-6";

  const label = method === "BANK TRANS" ? "BANK\nTRANS" : method;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "w-18.75 h-17.25 rounded-[18px] border border-dashed border-[#D1D5DB] bg-white flex items-center justify-center font-medium text-[24px] leading-[1.05] text-black text-center whitespace-pre-line shadow-[0_8px_20px_rgba(0,0,0,0.08)] transition-all active:scale-95 cursor-pointer select-none",
        selected &&
          "border-solid border-[#1317E4] text-[#1317E4] ring-2 ring-[#1317E4]/30",
        defaultRotation,
        className,
      )}
    >
      {label}
    </button>
  );
}
