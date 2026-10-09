"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export default function BackButton({
  onClick,
  label = "BACK",
  className = "",
}: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "bg-[#1317E4] hover:bg-[#0f12c5] text-white font-mono text-[11px] font-bold px-3 py-1.5 rounded-[6px] tracking-wider uppercase flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer select-none",
        className,
      )}
      aria-label={label}
    >
      <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
      <span className="leading-none">{label}</span>
    </button>
  );
}
