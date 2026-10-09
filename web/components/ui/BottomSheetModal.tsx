"use client";

import React, { useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export interface BottomSheetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;

  /**
   * Title displayed in the standard header on the left.
   * Can be a string or custom ReactNode (e.g. multi-line title).
   */
  title?: React.ReactNode;

  /**
   * Optional action button or element placed on the right of the header (e.g. LOG OUT).
   */
  headerAction?: React.ReactNode;

  /**
   * Completely override the header row with custom JSX.
   * If provided, `title` and `headerAction` are ignored.
   */
  customHeader?: React.ReactNode;

  /**
   * Completely hide the header section.
   */
  hideHeader?: boolean;

  /**
   * Hide the top drag handle pill. Default: false.
   */
  hideHandle?: boolean;

  /**
   * Whether to wrap children in a standard flex-1 scrollable container (`overflow-y-auto no-scrollbar`).
   * Default: true. Set to false if custom scrolling or non-scroll layout is desired.
   */
  scrollable?: boolean;

  /**
   * Additional classes for the sliding sheet container.
   */
  className?: string;

  /**
   * Additional classes for the inner scrollable container (when `scrollable` is true).
   */
  contentClassName?: string;

  /**
   * Additional classes for the backdrop wrapper.
   */
  backdropClassName?: string;

  /**
   * Snap points for shadcn drawer (e.g. [0.48, 0.92]).
   */
  snapPoints?: (number | string)[];

  /**
   * Default initial snap point.
   */
  defaultSnapPoint?: number | string;
}

export function BottomSheetModal({
  open,
  onOpenChange,
  children,
  title,
  headerAction,
  customHeader,
  hideHeader = false,
  hideHandle = false,
  scrollable = true,
  className,
  contentClassName,
  backdropClassName,
  snapPoints = [0.45, 0.78],
  defaultSnapPoint = 0.78,
}: BottomSheetModalProps) {
  // Lock background scroll when open
  useEffect(() => {
    if (!open) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [open]);

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => onOpenChange(nextOpen)}
      snapPoints={snapPoints}
      defaultSnapPoint={defaultSnapPoint}
    >
      <DrawerContent
        className={cn(
          "w-full max-w-[430px] sm:max-w-[450px] mx-auto bg-white rounded-t-[36px] pt-2 pb-6 px-4 sm:px-6 shadow-2xl flex flex-col relative border-none outline-none",
          className
        )}
      >
        <DrawerDescription className="sr-only">
          Bottom drawer dialog
        </DrawerDescription>

        {/* Top Pull Handle */}
        {!hideHandle && (
          <div className="w-full flex justify-center py-2 -mt-1 cursor-grab active:cursor-grabbing touch-none select-none">
            <div className="w-12 h-1 bg-[#D1D5DB] rounded-full hover:bg-neutral-400 transition-colors" />
          </div>
        )}

        {/* Header Area */}
        {!hideHeader && (
          <div className="shrink-0 mb-3 select-none">
            {customHeader ? (
              customHeader
            ) : (
              <div className="flex items-start justify-between">
                {title && (
                  <DrawerTitle className="text-[28px] sm:text-[32px] text-[#1317E4] tracking-wider uppercase font-bold text-left leading-[1.05]">
                    {title}
                  </DrawerTitle>
                )}
                {headerAction && (
                  <div className="shrink-0 mt-1">{headerAction}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Content Area */}
        {scrollable ? (
          <div
            className={cn(
              "flex-1 overflow-y-auto no-scrollbar flex flex-col items-center w-full pt-1 pb-6",
              contentClassName
            )}
          >
            {children}
          </div>
        ) : (
          children
        )}
      </DrawerContent>
    </Drawer>
  );
}

export default BottomSheetModal;
