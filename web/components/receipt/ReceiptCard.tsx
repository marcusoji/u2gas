"use client";

import React from "react";
import Image from "next/image";
import type { HistoryReceipt } from "@/types";
import { cn } from "@/lib/utils";

export interface ReceiptCardProps {
  receipt: HistoryReceipt;
  showDeliveryHeader?: boolean;
  className?: string;
  onScreenshot?: () => void;
  onKeep?: () => void;
  showActions?: boolean;
}

export function ReceiptCard({
  receipt,
  showDeliveryHeader = true,
  className,
  onScreenshot,
  onKeep,
  showActions = false,
}: ReceiptCardProps) {
  const hasDeliveryHeader =
    showDeliveryHeader && Boolean(receipt.deliveryStatus);
  const progressStep = receipt.progressStep ?? 3;
  const progressLabel = receipt.progressLabel ?? "In motion";

  return (
    <div
      className={cn(
        "w-[260px] sm:w-[280px] shrink-0 snap-center flex flex-col select-none filter drop-shadow-[0_8px_20px_rgba(0,0,0,0.06)]",
        className,
      )}
    >
      {/* ── Top Blue Delivery Box (Floating rectangular banner with gap below) ── */}
      {hasDeliveryHeader && (
        <div className="w-full bg-[#1317E4] text-white px-4 pt-3.5 pb-2.5 mb-3 flex flex-col items-center select-none shadow-xs">
          <span className="text-[11px] sm:text-[11.5px] tracking-wider uppercase font-bold text-center leading-tight">
            {receipt.deliveryStatus}
          </span>

          {/* 4 Segmented Rounded Progress Bars */}
          <div className="flex items-center justify-center gap-1.5 w-[65%] max-w-[160px] my-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={cn(
                  "h-[4px] rounded-full flex-1 transition-all",
                  step <= progressStep ? "bg-white" : "bg-[#4552f8]",
                )}
              />
            ))}
          </div>

          {/* Status Label (e.g. In motion) */}
          <span className="text-[9.5px] text-white/95 font-normal leading-none text-center">
            {progressLabel}
          </span>
        </div>
      )}

      {/* ── White Paper Receipt Card ── */}
      <div className="w-full bg-white px-5 sm:px-6 pt-5 pb-3 rounded-t-[4px] border-t border-x border-neutral-100 flex flex-col items-center shadow-xs">
        {/* RECEIPT Header Title */}
        <p className="text-[11px] tracking-[0.2em] text-[#1317E4] uppercase font-medium text-center mb-1">
          RECEIPT
        </p>

        {/* Large Date */}
        <h3 className="text-[30px] sm:text-[34px] tracking-wider text-[#1317E4] font-normal text-center leading-none mb-6">
          {receipt.date}
        </h3>

        {/* ── Items List ── */}
        <div className="w-full flex flex-col gap-4 mb-6">
          {receipt.items.map((item, idx) => {
            let mainTitle = item.title;
            let subtitle = item.subtitle;

            // Automatically extract subtitle in parentheses if not explicitly passed
            if (!subtitle) {
              const match = item.title.match(/^(.*?)\s*(\(.*?\))\s*$/);
              if (match) {
                mainTitle = match[1];
                subtitle = match[2];
              }
            }

            // Split title across multiple lines if needed (e.g. 6-Pack Energizer / ignition batteries)
            const titleLines = mainTitle.split("\n");

            return (
              <div
                key={`${receipt.id}-${item.id || idx}`}
                className="flex items-center justify-between w-full text-[#1317E4] text-[9.5px] sm:text-[10px] leading-tight"
              >
                <div className="flex flex-col min-w-0 pr-1">
                  {titleLines.map((line, lIdx) => (
                    <span key={lIdx} className="font-medium whitespace-nowrap">
                      {line}
                    </span>
                  ))}
                  {subtitle && (
                    <span className="text-[8.5px] sm:text-[9px] text-[#1317E4]/90 mt-0.5 whitespace-nowrap">
                      {subtitle}
                    </span>
                  )}
                </div>

                <span className="text-[#1317E4]/40 tracking-widest text-[9px] shrink-0 mx-1.5 select-none">
                  .........
                </span>

                <span className="shrink-0 font-medium whitespace-nowrap">
                  ₦ {item.priceNaira.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Middle Summary Block (PAYMENT MEDIUM, ENTRY, TOTAL) ── */}
        <div className="w-full flex flex-col gap-1.5 text-[9.5px] sm:text-[10px] text-[#1317E4] mb-6">
          <div className="flex items-center justify-between w-full">
            <span>PAYMENT MEDIUM:</span>
            <span>
              {(
                receipt.paymentMediumAmount ??
                receipt.items[1]?.priceNaira ??
                receipt.subtotal ??
                24000
              ).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between w-full">
            <span>ENTRY:</span>
            <span>{receipt.entryFee ?? "0.0"}</span>
          </div>
          <div className="flex items-center justify-between w-full font-bold">
            <span>TOTAL</span>
            <span className="font-bold">
              {(
                receipt.total ??
                receipt.items[1]?.priceNaira ??
                24000
              ).toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── Lower Transaction Details Block ── */}
        <div className="w-full flex flex-col gap-1.5 text-[9.5px] sm:text-[10px] text-[#1317E4] mb-5">
          <div className="flex items-center justify-between w-full">
            <span>PAYMENT MEDIUM:</span>
            <span className="uppercase">
              {receipt.paymentMedium ?? "TRANSFER(BANK TRANS)"}
            </span>
          </div>
          <div className="flex items-center justify-between w-full">
            <span>ENTRY:</span>
            <span className="uppercase">{receipt.entryType ?? "ONLINE"}</span>
          </div>
          <div className="flex items-center justify-between w-full">
            <span>TIME</span>
            <span>{receipt.time ?? "17/03/27, 08:15:34"}</span>
          </div>
          <div className="flex items-center justify-between w-full">
            <span>REF</span>
            <span>
              {receipt.reference ?? receipt.orderNumber ?? "[reference num]"}
            </span>
          </div>
        </div>

        {/* ── QR Code in Rounded Dashed Border Box ── */}
        <div className="w-full flex justify-center my-2">
          <div className="p-2 sm:p-2.5 rounded-[18px] border border-dashed border-[#838EF8]/65 inline-flex items-center justify-center bg-white">
            <div className="size-20 sm:size-22 relative flex items-center justify-center">
              <Image
                src={receipt.qrCode || "/images/qr-code.png"}
                alt="QR Code"
                width={88}
                height={88}
                className="object-contain"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Sawtooth / Zigzag bottom tear-off edge ── */}
      <div className="w-full overflow-hidden leading-none filter drop-shadow-[0_4px_6px_rgba(0,0,0,0.03)] -mt-px">
        <svg
          viewBox="0 0 280 12"
          className="w-full h-2.5 block text-white fill-white"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points="0,0 7,12 14,0 21,12 28,0 35,12 42,0 49,12 56,0 63,12 70,0 77,12 84,0 91,12 98,0 105,12 112,0 119,12 126,0 133,12 140,0 147,12 154,0 161,12 168,0 175,12 182,0 189,12 196,0 203,12 210,0 217,12 224,0 231,12 238,0 245,12 252,0 259,12 266,0 273,12 280,0"
            fill="#FFFFFF"
          />
        </svg>
      </div>

      {/* Optional action buttons below receipt */}
      {showActions && (
        <div className="w-full flex flex-col items-center mt-4 gap-2">
          {onScreenshot && (
            <button
              type="button"
              onClick={onScreenshot}
              className="text-[11px] tracking-[0.2em] uppercase text-white hover:text-white/80 transition-colors cursor-pointer"
            >
              SCREENSHOT
            </button>
          )}
          {onKeep && (
            <button
              type="button"
              onClick={onKeep}
              className="text-[11px] tracking-[0.2em] uppercase text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              KEEP
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ReceiptCard;
