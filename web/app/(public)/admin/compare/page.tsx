"use client";

import React, { useState } from "react";
import Image from "next/image";
import FuelCanister from "@/components/admin/FuelCanister";

export default function ComparePage() {
  const [width, setWidth] = useState(280);

  // Scaled dimensions for the original image
  const scaleFactor = width / 250;
  const rawImageWidth = 300 * scaleFactor;
  const rawImageHeight = 495 * scaleFactor;
  const offsetX = 40 * scaleFactor;
  const offsetY = 28 * scaleFactor;
  const totalCanisterHeight = Math.round(width * 1.7) + Math.round(width * 0.107);

  return (
    <div className="min-h-screen bg-white p-8 flex flex-col items-center select-none">
      <h1 className="text-xl font-mono font-bold mb-2 text-neutral-800">
        PIXEL-ACCURATE COMPARISON
      </h1>
      <p className="text-xs font-mono text-neutral-500 mb-6">
        Left: Original Target Canister | Right: React Component (width: {width}px)
      </p>

      {/* Width slider for testing scalability */}
      <div className="flex items-center gap-3 mb-8">
        <span className="font-mono text-xs">Width:</span>
        <input
          type="range"
          min={160}
          max={360}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="accent-blue-600"
        />
        <span className="font-mono text-xs">{width}px</span>
      </div>

      <div className="flex items-start justify-center gap-16 p-8 bg-white border border-neutral-200 rounded-2xl shadow-sm">
        {/* ORIGINAL TARGET */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-xs font-mono font-bold text-neutral-500 uppercase">
            Original Target
          </span>
          <div
            style={{
              position: "relative",
              width: `${width}px`,
              height: `${totalCanisterHeight}px`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: `-${offsetY}px`,
                left: `-${offsetX}px`,
                width: `${rawImageWidth}px`,
                height: `${rawImageHeight}px`,
              }}
            >
              <Image
                src="/images/canister-target.png"
                alt="Target Canister"
                width={Math.round(rawImageWidth)}
                height={Math.round(rawImageHeight)}
                priority
                unoptimized
              />
            </div>
          </div>
        </div>

        {/* REACT COMPONENT */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-xs font-mono font-bold text-blue-600 uppercase">
            React Component
          </span>
          <FuelCanister width={width} />
        </div>
      </div>
    </div>
  );
}
