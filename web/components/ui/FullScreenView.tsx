"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import BackButton from "./BackButton";
import Footer from "@/components/footer";
import { cn } from "@/lib/utils";

export interface FullScreenViewProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export default function FullScreenView({
  open,
  onClose,
  title,
  headerRight,
  children,
  className = "",
  contentClassName = "",
}: FullScreenViewProps) {
  // Lock body scroll when open and handle Escape key
  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="full-screen-view"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn(
            "fixed inset-0 z-50 bg-white overflow-y-auto overflow-x-hidden flex flex-col justify-between items-center select-none",
            className,
          )}
        >
          {/* Top Header Bar */}
          <div className="w-full max-w-105 px-4 pt-6 pb-2 flex items-center justify-between z-20">
            <BackButton onClick={onClose} />
            {title && (
              <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-black text-center truncate px-2">
                {title}
              </h2>
            )}
            {headerRight ? headerRight : <div className="w-16" />}
          </div>

          {/* Main Scrollable Content */}
          <div
            className={cn(
              "w-full max-w-105 px-4 flex-1 flex flex-col items-center",
              contentClassName,
            )}
          >
            {children}
          </div>

          {/* Global Footer anchored at the bottom */}
          <Footer />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
