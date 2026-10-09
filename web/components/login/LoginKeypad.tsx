import TerminalKey from "@/app/(public)/terminal-keyboard";
import { motion } from "framer-motion";

export interface KeypadKeyItem {
  label: string;
  className?: string;
}

export const KEYPAD_KEYS: KeypadKeyItem[] = [
  { label: "4" },
  { label: "5" },
  { label: "6" },
  { label: "7" },
  { label: "8" },
  { label: "9" },
  { label: "x" },
  { label: "0" },
  { label: "PAY", className: "text-[#65e85f] tracking-wide" },
];

export interface LoginKeypadProps {
  onKeyPress: (key: string) => void;
}

export function LoginKeypad({ onKeyPress }: LoginKeypadProps) {
  return (
    <div className="w-full flex justify-center">
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="w-full max-w-[340px] bg-brand-primary rounded-b-[32px] pt-3 pb-5 px-8 relative shadow-[0_22px_45px_rgba(0,0,0,0.32)] flex flex-col items-center overflow-hidden"
      >
        {/* Authentic tactile stipple noise overlay */}
        <div className="absolute inset-0 noise-texture opacity-48 mix-blend-overlay pointer-events-none z-0" />

        {/* Subtle inner bezel outline */}
        <div className="absolute inset-x-2 bottom-2 top-0 rounded-b-[24px] border-b border-x border-black/30 pointer-events-none z-10" />

        {/* Keypad Grid: Rows 2, 3, 4 (4-6, 7-9, x-0-PAY) */}
        <div className="grid grid-cols-3 gap-x-8 gap-y-3.5 w-52.75 z-10 mt-1">
          {KEYPAD_KEYS.map((key) => (
            <TerminalKey
              key={key.label}
              label={key.label}
              onClick={() => onKeyPress(key.label)}
              className={key.className}
            />
          ))}
        </div>

        {/* Metallic Receipt / Card Slot Bar */}
        <div className="w-53 h-3.75 bg-linear-to-b from-[#505054] via-[#b8b8bc] via-45% to-[#ceced2] rounded-[6px] border border-black flex items-center justify-center z-10 relative overflow-hidden mt-4">
          <div className="absolute inset-0 opacity-35 mix-blend-multiply noise-texture pointer-events-none" />
          <div className="w-[calc(100%-12px)] h-[2.5px] bg-black rounded-[1px] relative z-10" />
        </div>
      </motion.div>
    </div>
  );
}

export default LoginKeypad;
