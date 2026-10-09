"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export interface ModalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function ModalSheet({
  open,
  onOpenChange,
  title = "Modal",
  children,
  className = "",
}: ModalSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100%-2rem)] max-w-90 p-0 border-0 bg-transparent shadow-none focus:outline-hidden"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div
          className={`w-full bg-white rounded-[40px] px-5 pt-3 pb-6 flex flex-col items-center gap-3.5 shadow-[0_-8px_32px_rgba(0,0,0,0.15)] border border-neutral-100/80 ${className}`}
        >
          {/* Drag Handle / Close Pill */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="w-12 h-1 bg-[#8E8E93] rounded-full hover:bg-neutral-600 transition-colors cursor-pointer"
          />
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
