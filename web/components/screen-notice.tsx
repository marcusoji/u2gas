"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A centred status line for a screen that is loading, empty, or failed. */
export function ScreenNotice({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "error";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full py-16 flex flex-col items-center justify-center text-center gap-2 px-6",
        className,
      )}
    >
      <p
        className={cn(
          "font-mono text-[12px] tracking-widest uppercase",
          tone === "error" ? "text-red-500" : "text-[#838EF8]",
        )}
      >
        {children}
      </p>
    </div>
  );
}

export function Loading({ label = "LOADING…" }: { label?: string }) {
  return (
    <ScreenNotice className="animate-pulse">{label}</ScreenNotice>
  );
}
