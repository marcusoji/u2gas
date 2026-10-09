"use client";

import React from "react";

export interface FuelCanisterProps {
  /**
   * Width of the canister in pixels. All proportions, margins, corner radii,
   * cap sizes, and gradients scale proportionally from this single value.
   * Default is 280px (height = 476px, aspect ratio 10:17 / 1:1.7).
   */
  width?: number;
  showRuler?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function FuelCanister({
  width = 280,
  showRuler = false,
  className = "",
  style = {},
}: FuelCanisterProps) {
  // Proportions derived strictly from width
  // Aspect ratio calibrated to target container: 280 : 476 (1 : 1.7)
  const bodyWidth = width;
  const bodyHeight = Math.round(width * 1.7); // 280 * 1.7 = 476
  const outerRadius = Math.round(16 * (width / 280)); // 16px at 280 width

  // Cap dimensions & position
  const capWidth = Math.round(width * 0.34); // ~95px at 280
  const capHeight = Math.round(width * 0.107); // ~30px at 280
  const capLeft = Math.round(width * 0.086); // ~24px at 280
  const capRadiusTop = Math.max(3, Math.round(width * 0.014));

  // Inner frame padding & corner radii
  const paddingX = Math.round(width * 0.054); // ~15px at 280
  const paddingTop = Math.round(width * 0.054);
  const paddingBottom = Math.round(width * 0.054);
  const innerRadius = Math.round(8 * (width / 280)); // 8px at 280 width
  const panelCornerMinor = Math.round(6 * (width / 280)); // ~6px rounded top corners for fluid panel

  // Inner panels & gap calculation
  const innerHeight = bodyHeight - paddingTop - paddingBottom;
  const gapHeight = Math.max(2, Math.round(width * 0.008));
  const topPanelHeight = Math.round(innerHeight * 0.58);
  const bottomPanelHeight = innerHeight - topPanelHeight - gapHeight;

  const majorLevels = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];

  const canisterElement = (
    <div
      className="relative select-none"
      style={
        {
          width: `${bodyWidth}px`,
          height: `${bodyHeight + capHeight}px`,
          // Exposed customizable CSS variables
          "--canister-body-bg": "#050508",
          "--canister-rim-border": "#282b4a",
          "--canister-rim-glow": "rgba(42, 48, 96, 0.5)",
          "--canister-rim-inner": "#242749",
          "--canister-cap-bg": "#101114",
          "--canister-cap-groove": "#08080a",
          "--canister-cap-highlight": "#202128",
          "--canister-top-panel": "#5b5b6f",
          "--canister-bottom-center": "#646684",
          "--canister-bottom-mid1": "#727493",
          "--canister-bottom-mid2": "#8a8ca6",
          "--canister-bottom-mid3": "#a8aabd",
          "--canister-bottom-outer": "#c7c8d5",
          "--canister-bottom-edge": "#dcdde7",
          "--canister-gap-color": "#050508",
          ...style,
        } as React.CSSProperties
      }
    >
      {/* CAP */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: `${capLeft}px`,
          width: `${capWidth}px`,
          height: `${capHeight}px`,
          backgroundColor: "var(--canister-cap-bg)",
          borderTopLeftRadius: `${capRadiusTop}px`,
          borderTopRightRadius: `${capRadiusTop}px`,
          border: `${Math.max(1, width * 0.004)}px solid #1c1d24`,
          borderBottom: "none",
          boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.16)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `0 ${width * 0.01}px`,
          zIndex: 10,
          boxSizing: "border-box",
        }}
      >
        {/* 10 vertical ribbed grooves */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: `${Math.max(1.5, width * 0.015)}px`,
              height: "82%",
              backgroundColor: "var(--canister-cap-groove)",
              borderRadius: "1px",
              boxShadow: `0.5px 0 0 var(--canister-cap-highlight)`,
            }}
          />
        ))}
      </div>

      {/* OUTER BODY */}
      <div
        style={{
          position: "absolute",
          top: `${capHeight}px`,
          left: 0,
          width: `${bodyWidth}px`,
          height: `${bodyHeight}px`,
          backgroundColor: "var(--canister-body-bg)",
          borderRadius: `${outerRadius}px`,
          border: `${Math.max(1.5, width * 0.008)}px solid var(--canister-rim-border)`,
          boxShadow: `
            0 0 ${width * 0.026}px ${width * 0.006}px var(--canister-rim-glow),
            inset 0 0 ${width * 0.022}px ${width * 0.005}px var(--canister-rim-inner)
          `,
          padding: `${paddingTop}px ${paddingX}px ${paddingBottom}px`,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          zIndex: 5,
        }}
      >
        {/* TOP PANEL: Flat matte slate gray-blue */}
        <div
          style={{
            width: "100%",
            height: `${topPanelHeight}px`,
            backgroundColor: "var(--canister-top-panel)",
            borderTopLeftRadius: `${innerRadius}px`,
            borderTopRightRadius: `${innerRadius}px`,
            borderBottomLeftRadius: `${panelCornerMinor}px`,
            borderBottomRightRadius: `${panelCornerMinor}px`,
            boxSizing: "border-box",
          }}
        />

        {/* GAP */}
        <div
          style={{
            width: "100%",
            height: `${gapHeight}px`,
            backgroundColor: "var(--canister-gap-color)",
          }}
        />

        {/* BOTTOM PANEL: Soft organic radial gradient blob */}
        <div
          style={{
            width: "100%",
            height: `${bottomPanelHeight}px`,
            borderTopLeftRadius: `${panelCornerMinor}px`,
            borderTopRightRadius: `${panelCornerMinor}px`,
            borderBottomLeftRadius: `${innerRadius}px`,
            borderBottomRightRadius: `${innerRadius}px`,
            background: `radial-gradient(
              ellipse 76% 62% at 50% 58%,
              var(--canister-bottom-center) 0%,
              var(--canister-bottom-mid1) 26%,
              var(--canister-bottom-mid2) 48%,
              var(--canister-bottom-mid3) 68%,
              var(--canister-bottom-outer) 84%,
              var(--canister-bottom-edge) 100%
            )`,
            boxSizing: "border-box",
          }}
        />
      </div>
    </div>
  );

  if (!showRuler) {
    return (
      <div className={`relative select-none ${className}`}>
        {canisterElement}
      </div>
    );
  }

  return (
    <div className={`relative flex items-end select-none ${className}`}>
      {canisterElement}

      {/* Measurement Ruler on the right */}
      <div
        className="ml-3 sm:ml-4 flex items-center shrink-0"
        style={{ height: `${bodyHeight}px` }}
      >
        <svg
          width="82"
          height={bodyHeight}
          viewBox={`0 0 82 ${bodyHeight}`}
          className="overflow-visible select-none"
          aria-label="Gas Tank Measurement Scale"
        >
          {Array.from({ length: 101 }).map((_, i) => {
            const val = 100 - i;
            const topY = Math.round(bodyHeight * 0.0462);
            const bottomY = Math.round(bodyHeight * 0.9538);
            const y = topY + (i / 100) * (bottomY - topY);

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

          {majorLevels.map((val) => {
            const topY = Math.round(bodyHeight * 0.0462);
            const bottomY = Math.round(bodyHeight * 0.9538);
            const y = topY + ((100 - val) / 100) * (bottomY - topY);
            const textLabel = val === 0 ? "00" : val.toString();

            return (
              <text
                key={`label-${val}`}
                x={50}
                y={y}
                dominantBaseline="central"
                textAnchor="start"
                fill="#111216"
                fontSize="13"
                fontWeight="600"
                style={{
                  fontFamily:
                    'var(--font-barlow-semi-condensed), "Barlow Semi Condensed", sans-serif',
                  letterSpacing: "-0.01em",
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
