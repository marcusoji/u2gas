"use client";

import { cn } from "@/lib/utils";

export const KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["x", "0", "PAY"],
] as const;

export type KeypadKey = (typeof KEYPAD_ROWS)[number][number];

export interface TerminalKeyProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Individual tactile terminal key button
 */
export default function TerminalKey({
  label,
  onClick,
  disabled = false,
  className = "",
}: TerminalKeyProps) {
  const isPay = label === "PAY";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "bg-[#1c1c1e] text-[#ededed] font-pixel flex items-center justify-center relative active:translate-y-0.5 transition-transform text-[32px] leading-none select-none cursor-pointer overflow-hidden",
        // Tactile button with grayish top/left tip bevels & authentic depth
        "border-t-[1.5px] border-l-[1.5px] border-t-[#767676] border-l-[#555555] border-r border-b border-r-[#101010] border-b-[#080808]",
        "shadow-[inset_1px_1px_1px_rgba(255,255,255,0.25),inset_-1px_-1px_2px_rgba(0,0,0,0.9),0_4px_8px_rgba(0,0,0,0.85)]",
        isPay
          ? "rounded-lg py-[2.5px] px-2 w-max justify-self-end whitespace-nowrap"
          : "w-12.25 h-9.75 rounded-lg",
        className,
      )}
    >
      {/* Subtle tactile surface noise grain */}
      <div className="absolute inset-0 noise-texture opacity-25 mix-blend-overlay pointer-events-none rounded-[inherit]" />
      <span className="-translate-y-px relative z-10">{label}</span>
    </button>
  );
}

export interface TerminalKeyboardProps {
  onKeyPress: (key: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Complete terminal keyboard grid that maps all keys
 */
export function TerminalKeyboard({
  onKeyPress,
  disabled = false,
  className = "",
}: TerminalKeyboardProps) {
  return (
    <div
      className={`grid grid-cols-3 gap-x-8 gap-y-3.75 w-52.75 mb-8 z-10 ${className}`}
    >
      {KEYPAD_ROWS.flat().map((key) => (
        <TerminalKey
          key={key}
          label={key}
          disabled={disabled}
          onClick={() => onKeyPress(key)}
        />
      ))}
    </div>
  );
}
