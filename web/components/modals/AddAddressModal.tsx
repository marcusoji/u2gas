"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, X } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

export interface AddAddressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddressSaved?: (newAddress: string) => void;
  initialAddress?: string;
}

export default function AddAddressModal({
  open,
  onOpenChange,
  onAddressSaved,
  initialAddress,
}: AddAddressModalProps) {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const seed = initialAddress ?? user?.address ?? "";
  const [addressInput, setAddressInput] = useState(seed);
  // Re-seed when the sheet opens or the stored address changes, during render.
  const [seedKey, setSeedKey] = useState(`${open}|${seed}`);
  if (open && seedKey !== `${open}|${seed}`) {
    setSeedKey(`${open}|${seed}`);
    setAddressInput(seed);
  }

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = addressInput.trim();
    if (!trimmed) return;

    updateUser({ address: trimmed });
    onAddressSaved?.(trimmed);
    onOpenChange(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            key="address-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] cursor-pointer"
          />

          {/* Modal Card */}
          <motion.div
            key="address-modal-card"
            initial={{ scale: 0.9, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 16 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            className="relative z-70 w-full max-w-[340px] bg-white rounded-[32px] p-6 flex flex-col items-center gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.25)] border border-neutral-100 select-none text-center"
          >
            {/* Close Icon Button */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="absolute top-4 right-4 text-[#838EF8] hover:text-[#1317E4] p-1 rounded-full transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Header Icon & Title */}
            <div className="flex flex-col items-center gap-1.5 mt-1">
              <div className="w-10 h-10 rounded-full bg-[#1317E4]/10 flex items-center justify-center text-[#1317E4]">
                <MapPin className="w-5 h-5 stroke-[2.5]" />
              </div>
              <h3 className="text-[17px] font-bold text-[#1317E4] tracking-wider uppercase">
                ADD ADDRESS
              </h3>
              <p className="text-[11px] text-[#838EF8] font-medium tracking-wide">
                Enter your delivery address below
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
              <div className="w-full rounded-[20px] border-2 border-dashed border-[#A5B4FC] bg-neutral-50/50 p-3.5 focus-within:border-[#1317E4] focus-within:bg-white transition-all">
                <textarea
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="e.g. 4, Anthony Villa, Umuchu"
                  rows={3}
                  autoFocus
                  className="w-full bg-transparent border-none outline-none resize-none text-[14px] font-bold text-[#1317E4] placeholder:text-[#A2A9EE] text-center leading-snug"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 w-full items-center pt-1">
                <button
                  type="submit"
                  disabled={!addressInput.trim()}
                  className="w-full bg-[#1317E4] disabled:opacity-50 text-white font-bold text-[14px] py-2.5 rounded-full shadow-[0_6px_20px_rgba(19,23,228,0.35)] hover:bg-[#0F12BE] active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
                >
                  SAVE ADDRESS
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="text-[11px] font-bold text-[#838EF8] hover:text-[#1317E4] uppercase tracking-wider py-1 cursor-pointer transition-colors"
                >
                  CANCEL
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
