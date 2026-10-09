"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GasTerminalProps } from "@/types";
import MarqueeSlider from "@abundiko/react-marquee";
import LedSign from "../../components/sign-box";
import TerminalScreenBox from "@/components/terminal-screen-box";
import { TerminalKeyboard } from "./terminal-keyboard";
import Navbar from "@/components/layout/Navbar";
import {
  getEffectiveRates,
  getUnreadNotificationCount,
  calculateGasOrder,
  deleteKeypadDigit,
  appendKeypadDigit,
} from "@/helpers/functions";

export default function GasTerminal({
  initialValue = "1KG",
  ratePerKg = 1400,
  stock,
  notifications,
  notificationCount = 3,
  onNotificationClick,
  onProfileClick,
  onPay,
  onChange,
  className = "",
  status = "idle",
  onDismissStatus,
  children,
}: GasTerminalProps) {
  const [displayValue, setDisplayValue] = useState<string>(initialValue);
  const [hasStartedTyping, setHasStartedTyping] = useState<boolean>(false);
  // Reset the readout when the parent hands down a new value. Adjusting state
  // during render (guarded) is the React-recommended alternative to an effect
  // for "derive from a changed prop" — no extra commit, no flash.
  const [lastInitial, setLastInitial] = useState(initialValue);
  if (initialValue !== lastInitial) {
    setLastInitial(initialValue);
    setDisplayValue(initialValue);
    setHasStartedTyping(false);
  }

  // Close success/failed status on click anywhere outside or on Escape key & lock background scroll
  useEffect(() => {
    if (status !== "success" && status !== "failed") return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleGlobalClick = () => {
      onDismissStatus?.();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismissStatus?.();
      }
    };

    const timer = setTimeout(() => {
      window.addEventListener("click", handleGlobalClick);
      window.addEventListener("touchstart", handleGlobalClick);
      window.addEventListener("keydown", handleKeyDown);
    }, 50);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      clearTimeout(timer);
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("touchstart", handleGlobalClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [status, onDismissStatus]);

  const { effectiveRateNaira, effectiveRateKobo } = getEffectiveRates(
    stock,
    ratePerKg,
  );

  const unreadNotifications = getUnreadNotificationCount(
    notifications,
    notificationCount,
  );

  const updateDisplay = (nextValue: string) => {
    setDisplayValue(nextValue);
    onChange?.(nextValue);
  };

  const handleKeyPress = (key: string) => {
    if (key === "PAY") {
      onPay?.(
        calculateGasOrder(displayValue, effectiveRateNaira, effectiveRateKobo),
      );
      return;
    }

    if (key === "x" || key === "X" || key === "×") {
      setHasStartedTyping(true);
      updateDisplay(deleteKeypadDigit(displayValue));
      return;
    }

    const isFirst = !hasStartedTyping;
    setHasStartedTyping(true);
    updateDisplay(appendKeypadDigit(displayValue, key, isFirst));
  };

  return (
    <div
      className={`w-full max-w-90 mx-auto flex flex-col items-center mb-4 ${className}`}
    >
      {/* Top Bar: Profile Icon (when logged in) + Notification Bell */}
      <Navbar
        showProfile={true}
        onProfileClick={onProfileClick}
        notificationCount={unreadNotifications}
        onNotificationClick={onNotificationClick}
        className="mb-4 px-2"
      />

      <div className="w-full relative flex flex-col items-center select-none">
        <div className="relative z-0 flex items-center justify-center -mb-1 overflow-hidden w-81.5 h-22.75">
          <div className="absolute top-0 left-0 w-214.25 h-60 scale-[0.38] origin-top-left">
            <LedSign hideBlueBand={true}>
              <div className="w-full h-full flex items-center overflow-hidden [&_.marquee-anim]:h-full [&_.marquee-anim]:flex [&_.marquee-anim]:items-center">
                <MarqueeSlider
                  speed={10}
                  axis="-x"
                  className="h-full flex items-center gap-8"
                  pauseOnHover
                >
                  <TickerItem rate={effectiveRateNaira} />
                  <TickerItem rate={effectiveRateNaira} />
                </MarqueeSlider>
              </div>
            </LedSign>
          </div>
        </div>

        <div className="w-full bg-brand-primary rounded-[18px] pt-7 pb-6 px-10 relative shadow-[0_12px_36px_rgba(19,23,228,0.35),0_4px_12px_rgba(0,0,0,0.18)] flex flex-col items-center overflow-hidden">
          {/* Authentic tactile stipple noise overlay for blue plastic body */}
          <div className="absolute inset-0 noise-texture opacity-48 mix-blend-overlay pointer-events-none z-0" />

          <div className="absolute inset-2 rounded-[10px] border border-black/30 pointer-events-none z-10" />
          <div className="text-xl tracking-wider text-light-gray uppercase mb-2.5 z-10">
            AMOUNT IN NAIRA
          </div>
          <TerminalScreenBox
            value={displayValue}
            variant="red"
            className="mb-5 z-10"
          />
          {/* Keypad Grid (3 x 4) */}
          <TerminalKeyboard onKeyPress={handleKeyPress} />
          {/* Receipt / Card Slot Bar */}
          <div className="w-53 h-3.75 bg-linear-to-b from-[#505054] via-[#b8b8bc] via-45% to-[#ceced2] rounded-[6px] border border-black flex items-center justify-center z-10 relative overflow-hidden">
            <div className="absolute inset-0 opacity-40 mix-blend-multiply noise-texture pointer-events-none" />
            <div className="w-[calc(100%-12px)] h-[2.5px] bg-black rounded-[1px] relative z-10" />
          </div>

          {children}
        </div>

        {/* Full-page blur overlay for Success / Failed */}
        <AnimatePresence>
          {(status === "success" || status === "failed") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={onDismissStatus}
              className="fixed inset-0 z-50 bg-black/20 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none cursor-pointer overflow-hidden touch-none overscroll-none"
            >
              <div className="w-full max-w-[380px] flex flex-col items-center justify-center relative">
                {/* Hand with Zoom-in Animation and 266/354 aspect ratio */}
                <motion.div
                  key={`terminal-hand-${status}`}
                  initial={{ scale: 0.15, opacity: 0.3 }}
                  animate={{ scale: 2, opacity: 1 }}
                  transition={{
                    type: "tween",
                    duration: 0.9,
                  }}
                  className="relative w-66.5 h-88.5 max-w-full aspect-266/354 flex items-center justify-center mb-4"
                >
                  <motion.img
                    src={
                      status === "success"
                        ? "/images/success.png"
                        : "/images/failed.png"
                    }
                    alt={status === "success" ? "Success" : "Failed"}
                    className="object-contain drop-shadow-[0_16px_32px_rgba(0,0,0,0.45)] pointer-events-none"
                  />
                </motion.div>

                {/* Reusable TerminalScreenBox at bottom */}
                <motion.div
                  key={`terminal-box-${status}`}
                  initial={{ scale: 0.7, opacity: 0, y: 15 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 280,
                    damping: 20,
                    delay: 0.1,
                  }}
                  className="relative z-40 w-full flex justify-center"
                >
                  <TerminalScreenBox
                    value={status === "success" ? "SUCCESS!!" : "FAILED!!"}
                    variant={status === "success" ? "green" : "red"}
                    speed={8}
                    className={
                      status === "success"
                        ? "shadow-[0_4px_24px_rgba(3,255,49,0.5)]"
                        : "shadow-[0_4px_24px_rgba(255,3,3,0.45)]"
                    }
                  />
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TickerItem({ rate }: { rate: number }) {
  return (
    <span className="inline-flex items-center text-[54px] leading-none font-bold tracking-wider font-led px-4 select-none text-[#FF0303] whitespace-nowrap drop-shadow-[0_0_14px_rgba(255,3,3,0.9)]">
      <span>Today&rsquo;s Rate: 1kg at&nbsp;</span>
      <span className="relative inline-flex items-center justify-center mr-0.5">
        <span>N</span>
        {/* <span className="absolute inset-x-0 top-[37%] h-1 bg-[#FF2222] pointer-events-none drop-shadow-[0_0_6px_rgba(255,30,30,0.9)]" />
        <span className="absolute inset-x-0 top-[60%] h-1 bg-[#FF2222] pointer-events-none drop-shadow-[0_0_6px_rgba(255,30,30,0.9)]" /> */}
      </span>
      <span>{rate.toLocaleString()}</span>
    </span>
  );
}
