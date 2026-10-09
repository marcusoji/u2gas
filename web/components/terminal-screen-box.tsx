"use client";

import React from "react";
import { cn } from "@/lib/utils";
import MarqueeSlider from "@/components/ui/ClientMarquee";

export interface TerminalScreenBoxProps {
  value: string;
  variant?: "red" | "green";
  className?: string;
  textClassName?: string;
  marquee?: boolean;
  speed?: number;
  itemCount?: number;
}

export default function TerminalScreenBox({
  value,
  variant = "red",
  className = "",
  textClassName = "",
  marquee,
  speed = 8,
  itemCount = 12,
}: TerminalScreenBoxProps) {
  const isGreen = variant === "green";

  // Auto-enable marquee if explicitly passed or if text is SUCCESS/FAILED
  const shouldMarquee =
    marquee !== undefined
      ? marquee
      : value.includes("SUCCESS") || value.includes("FAILED");

  // Font size: text-[24px] for multi-character texts
  const defaultTextSize =
    value.length >= 5
      ? "text-[24px] tracking-wider"
      : "text-4xl tracking-widest";

  return (
    <div
      className={cn(
        "w-44 h-14.5 bg-[#1a1a1a] rounded-lg p-1.25 border border-[#0a0a0a] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_2px_5px_rgba(0,0,0,0.5)] flex items-center justify-center",
        className,
      )}
    >
      <div
        className={cn(
          "w-full h-full rounded-[6px] border shadow-[inset_0_2px_6px_rgba(0,0,0,0.95)] flex items-center justify-center relative overflow-hidden",
          isGreen
            ? "bg-[#050b05] border-[#030803]"
            : "bg-[#1E0E0E] border-[#0a0808]",
        )}
      >
        {/* Screen Glass Glare */}
        <div className="absolute inset-0 bg-linear-to-b from-white/6 to-transparent pointer-events-none z-10" />

        {shouldMarquee ? (
          /* Marquee Scrolling Text */
          <div className="w-full h-full flex items-center overflow-hidden px-1">
            <MarqueeSlider
              speed={speed}
              axis="-x"
              className="gap-6 items-center"
              pauseOnHover
            >
              {Array(itemCount)
                .fill(value)
                .map((text, i) => (
                  <span
                    key={i}
                    className={cn(
                      "uppercase select-none whitespace-nowrap text-[25px] font-bold tracking-wider font-led",
                      isGreen
                        ? "text-[#03FF31] drop-shadow-[0_0_12px_rgba(3,255,49,0.95)] drop-shadow-[0_0_4px_#00FF44]"
                        : "text-[#FF0303] drop-shadow-[0_0_12px_rgba(255,3,3,0.95)] drop-shadow-[0_0_4px_#FF1B1B]",
                      textClassName,
                    )}
                  >
                    {text}
                  </span>
                ))}
            </MarqueeSlider>
          </div>
        ) : (
          /* Static Digital Text */
          <span
            className={cn(
              "uppercase select-none font-bold font-led",
              defaultTextSize,
              isGreen
                ? "text-[#03FF31] drop-shadow-[0_0_12px_rgba(3,255,49,0.95)] drop-shadow-[0_0_4px_#00FF44]"
                : "text-[#FF0303] drop-shadow-[0_0_12px_rgba(255,3,3,0.95)] drop-shadow-[0_0_4px_#FF1B1B]",
              textClassName,
            )}
          >
            {value}
          </span>
        )}
      </div>
    </div>
  );
}
