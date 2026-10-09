"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAdminTankStore } from "@/stores/adminTankStore";

interface AdminTankGaugeProps {
  /**
   * Gas tank fill percentage (0 to 100). Default comes from useAdminTankStore.
   */
  level?: number;
  /**
   * Width of the tank body in pixels. Default is 280px (height = 476px, aspect ratio 10:17 / 1:1.7).
   */
  width?: number;
  /**
   * Available quantity in tons displayed when tapped. Default comes from useAdminTankStore.
   */
  tons?: number;
  /**
   * Days left prediction note displayed when tapped. Default comes from useAdminTankStore.
   */
  daysLeft?: number;
  className?: string;
}

export default function AdminTankGauge({
  level: propLevel,
  width = 280,
  tons: propTons,
  daysLeft: propDaysLeft,
  className = "",
}: AdminTankGaugeProps) {
  // Toggle state when user taps on the container
  const [isTapped, setIsTapped] = useState(false);

  const storeLevel = useAdminTankStore((s) => s.level);
  const storeTons = useAdminTankStore((s) => s.tons);
  const storeDaysLeft = useAdminTankStore((s) => s.daysLeft);

  const level = propLevel !== undefined ? propLevel : storeLevel;
  const tons = propTons !== undefined ? propTons : storeTons;
  const daysLeft = propDaysLeft !== undefined ? propDaysLeft : storeDaysLeft;

  // Clamped level
  const clampedLevel = Math.max(0, Math.min(100, level));

  // 11 major levels: 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 00
  const majorLevels = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];

  // Active level rounded to nearest decade for ruler highlighting
  const activeLevel = Math.round(clampedLevel / 10) * 10;

  // Exact 280 x 476 proportions (aspect ratio: 1 : 1.7)
  const bodyWidth = width;
  const bodyHeight = Math.round(width * 1.7); // 280 * 1.7 = 476
  const capWidth = Math.round(width * 0.34); // ~95px at 280
  const capHeight = Math.round(width * 0.107); // ~30px at 280
  const capLeft = Math.round(width * 0.086); // ~24px at 280
  const outerRadius = Math.round(16 * (width / 280)); // 16px at 280 width
  const innerRadius = Math.round(8 * (width / 280)); // 8px at 280 width
  const borderWidth = Math.max(12, Math.round(width * 0.054)); // ~15px at 280

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
    >
      {/* Tank + Cap Wrapper - Interactive tap toggle */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Toggle tank information display"
        onClick={() => setIsTapped((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsTapped((prev) => !prev);
          }
        }}
        className="relative flex flex-col items-start cursor-pointer active:scale-[0.99] transition-transform group focus:outline-none"
        style={{ width: `${bodyWidth}px` }}
      >
        {/* Top Threaded Valve Cap - positioned on top left */}
        <div
          className="relative bg-[#101114] rounded-t-[4px] border-t border-x border-[#2c2d33] flex items-center justify-between z-10 box-border group-hover:brightness-110 transition-all"
          style={{
            marginLeft: `${capLeft}px`,
            width: `${capWidth}px`,
            height: `${capHeight}px`,
            padding: `0 ${Math.max(4, Math.round(width * 0.015))}px`,
            boxShadow: "inset 0 1px 1px rgba(255,255,255,0.18)",
          }}
          aria-hidden="true"
        >
          {/* Vertical threaded ridges / knurls (10 ridges) */}
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-[80%] bg-[#08080a] rounded-sm shadow-[0.5px_0_0_#202128]"
              style={{ width: `${Math.max(1.5, Math.round(width * 0.016))}px` }}
            />
          ))}
        </div>

        {/* Main Tank Body: 280px x 476px */}
        <div
          className="relative bg-[#060609] overflow-hidden group-hover:brightness-[1.03] transition-all"
          style={{
            width: `${bodyWidth}px`,
            height: `${bodyHeight}px`,
            borderRadius: `${outerRadius}px`,
            padding: `${borderWidth}px`,
            boxShadow:
              "0 0 16px 2px rgba(42, 48, 96, 0.45), inset 0 0 10px rgba(35, 38, 70, 0.5)",
          }}
        >
          {/* Inner Cavity: Flat matte slate background */}
          <div
            className="relative w-full h-full bg-[#5B5B6F] overflow-hidden"
            style={{
              borderRadius: `${innerRadius}px`,
              boxShadow: "inset 0 2px 8px rgba(0,0,0,0.45)",
            }}
          >
            {/* Fluid Liquid / Gas Level Indicator */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 overflow-hidden"
              style={{
                borderTopLeftRadius: `${Math.round(innerRadius * 0.9)}px`,
                borderTopRightRadius: `${Math.round(innerRadius * 0.9)}px`,
                borderBottomLeftRadius: `${innerRadius}px`,
                borderBottomRightRadius: `${innerRadius}px`,
              }}
              initial={{ height: "0%" }}
              animate={{ height: `${clampedLevel}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              {/* Fluid body container */}
              <div className="relative w-full h-full min-h-[30px]">
                {/* Organic radial gradient fluid */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `radial-gradient(
                      ellipse 80% 64% at 50% 60%,
                      #646684 0%,
                      #727493 26%,
                      #8a8ca6 48%,
                      #a8aabd 68%,
                      #c7c8d5 84%,
                      #dcdde7 100%
                    )`,
                  }}
                />

                {/* Soft upper misty surface blend */}
                <div
                  className="absolute top-0 left-0 right-0 h-[28px] pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(255, 255, 255, 0.85) 0%, rgba(220, 224, 240, 0.4) 40%, transparent 100%)",
                  }}
                />
              </div>
            </motion.div>

            {/* Tap-Revealed Inventory Details Overlay */}
            <AnimatePresence>
              {isTapped && (
                <motion.div
                  key="container-info"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between py-4 px-4 select-none"
                  style={{
                    fontFamily:
                      'var(--font-barlow-semi-condensed), "Barlow Semi Condensed", sans-serif',
                  }}
                >
                  {/* Top: AVAILABLE QUANTITY: */}
                  <div className="w-full flex flex-col items-center pt-1">
                    <span
                      className="font-semibold text-white tracking-[0.06em] text-center leading-[1.15] uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                      style={{
                        fontFamily:
                          'var(--font-barlow-semi-condensed), "Barlow Semi Condensed", sans-serif',
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      AVAILABLE
                      <br />
                      QUANTITY:
                    </span>
                  </div>

                  {/* Center: Giant Number + TONS */}
                  <div className="w-full flex flex-col items-center justify-center -mt-6">
                    <span
                      className="font-semibold leading-none text-white/80 select-none tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
                      style={{
                        fontFamily:
                          'var(--font-barlow-semi-condensed), "Barlow Semi Condensed", sans-serif',
                        fontSize: "185px",
                        fontWeight: 600,
                        lineHeight: 0.85,
                      }}
                    >
                      {tons}
                    </span>
                    <span
                      className="font-semibold tracking-[0.18em] text-white uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] mt-1"
                      style={{
                        fontFamily:
                          'var(--font-barlow-semi-condensed), "Barlow Semi Condensed", sans-serif',
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                    >
                      TONS
                    </span>
                  </div>

                  {/* Bottom: Prediction Note */}
                  <div className="w-full pb-1">
                    <p
                      className="font-semibold leading-[1.15] text-white tracking-[0.04em] uppercase text-left drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                      style={{
                        fontFamily:
                          'var(--font-barlow-semi-condensed), "Barlow Semi Condensed", sans-serif',
                        fontSize: "10.5px",
                        fontWeight: 600,
                      }}
                    >
                      AVAILABLE INVENTORY IS PREDICTED
                      <br />
                      TO LAST {daysLeft} MORE DAYS*
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Measurement Ruler & Scale on the right, matching bodyHeight */}
      <div
        className="ml-[12px] sm:ml-[16px] flex items-center shrink-0"
        style={{ height: `${bodyHeight}px` }}
      >
        <svg
          width="86"
          height={bodyHeight}
          viewBox={`0 0 86 ${bodyHeight}`}
          className="overflow-visible select-none"
          aria-label="Gas Tank Measurement Scale"
        >
          {/* 101 ticks from 100 down to 0 (1 unit per tick) */}
          {Array.from({ length: 101 }).map((_, i) => {
            const val = 100 - i;
            // Spans from y=22 (at 100) down to y=454 (at 00) for standard 476px height
            const topY = Math.round(bodyHeight * 0.0462); // 22 at 476
            const bottomY = Math.round(bodyHeight * 0.9538); // 454 at 476
            const y = topY + (i / 100) * (bottomY - topY);

            // Three tick lengths matching design:
            // 1. Long ticks (42px) at 100, 50, and 00
            // 2. Medium ticks (20px) at 90, 80, 70, 60, 40, 30, 20, 10
            // 3. Short ticks (10px) at all other units
            let tickWidth = 10;
            if (val === 100 || val === 50 || val === 0) {
              tickWidth = 42;
            } else if (val % 10 === 0) {
              tickWidth = 20;
            }

            return (
              <line
                key={`tick-${val}`}
                x1={0}
                y1={y}
                x2={tickWidth}
                y2={y}
                stroke="#111216"
                strokeWidth={1.5}
                strokeLinecap="square"
              />
            );
          })}

          {/* 11 Major Labels: 100 down to 00 */}
          {majorLevels.map((val) => {
            const topY = Math.round(bodyHeight * 0.0462);
            const bottomY = Math.round(bodyHeight * 0.9538);
            const y = topY + ((100 - val) / 100) * (bottomY - topY);

            // Check if this level is the active level being highlighted on tap
            const isActive = isTapped && val === activeLevel;
            const textLabel = isActive
              ? `${clampedLevel}%`
              : val === 0
                ? "00"
                : val.toString();

            return (
              <text
                key={`label-${val}`}
                x={50}
                y={y}
                dominantBaseline="central"
                textAnchor="start"
                fill={isActive ? "#000000" : "#111216"}
                fontSize={isActive ? "16" : "13"}
                fontWeight={isActive ? "800" : "600"}
                style={{
                  fontFamily:
                    'var(--font-barlow-semi-condensed), "Barlow Semi Condensed", sans-serif',
                  letterSpacing: isActive ? "-0.01em" : "0em",
                  transition: "font-size 0.2s ease, font-weight 0.2s ease",
                }}
              >
                {textLabel}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
