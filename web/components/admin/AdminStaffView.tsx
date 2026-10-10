"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronRight, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAdminStaffStore } from "@/stores/adminStaffStore";
import { useAdminStaffList } from "@/hooks/useApiData";
import { removeStaff as removeStaffApi } from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import { paths } from "@/utils/paths";

interface AdminStaffViewProps {
  onBack?: () => void;
  onEditStaff?: () => void;
}

export default function AdminStaffView({
  onBack,
  onEditStaff,
}: AdminStaffViewProps) {
  const router = useRouter();
  const {
    staffList,
    selectedStaffId,
    setSelectedStaffId,
    setStaffList,
    removeStaff,
  } = useAdminStaffStore();

  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, error: loadError, loading } = useAdminStaffList();

  // The roster is the server's, not the store's seed. A short list is left
  // short: inventing a person would put someone on screen who does not exist.
  React.useEffect(() => {
    if (data?.staff) setStaffList(data.staff);
  }, [data, setStaffList]);

  const selectedStaff =
    staffList.find((s) => s.id === selectedStaffId) || staffList[0];

  const handleCopy = () => {
    if (selectedStaff?.accountNumber) {
      navigator.clipboard.writeText(selectedStaff.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.push(paths.adminMenu);
    }
  };

  const handleEditStaff = () => {
    if (onEditStaff) {
      onEditStaff();
    } else {
      router.push(paths.adminStaffEdit);
    }
  };

  /** Removal is server-side; the store only follows once the Worker agrees. */
  const handleRemoveStaff = async () => {
    if (!selectedStaff || busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeStaffApi(selectedStaff.id);
      removeStaff(selectedStaff.id);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "COULD NOT REMOVE STAFF",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[420px] flex-1 flex flex-col items-center justify-between px-6 py-6 sm:py-8 select-none">
      <div className="w-full flex items-center justify-start justify-between gap-4">
        <button
          type="button"
          onClick={handleBack}
          className="bg-[#1317E4] text-white font-mono text-[11px] font-bold px-3 py-1.5 rounded-[6px] tracking-wider uppercase flex items-center gap-1.5 shadow-xs hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer select-none"
          aria-label="Go Back"
        >
          <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="leading-none">BACK</span>
        </button>
        <span
          aria-live="polite"
          className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 text-right"
        >
          {loading ? "Loading…" : (error ?? loadError?.message ?? "")}
        </span>
      </div>

      <div className="w-full flex flex-col items-center gap-7 my-auto py-3">
        <div className="flex flex-col items-center w-full">
          <div className="flex items-center justify-center gap-3 sm:gap-4 overflow-x-auto max-w-full py-1 no-scrollbar">
            {staffList.slice(0, 4).map((staff) => {
              const isSelected = staff.id === selectedStaffId;
              return (
                <button
                  key={staff.id}
                  type="button"
                  onClick={() => setSelectedStaffId(staff.id)}
                  className="relative p-0.5 rounded-full transition-transform active:scale-95 cursor-pointer focus:outline-hidden shrink-0"
                  aria-label={`Select ${staff.firstName} ${staff.lastName}`}
                >
                  <div
                    className={`w-[78px] h-[78px] sm:w-[100px] sm:h-[100px] rounded-full overflow-hidden transition-all ${
                      isSelected
                        ? "border-[3px] border-[#1317E4] shadow-sm scale-105"
                        : "border border-neutral-200/80 hover:border-[#1317E4]/50"
                    }`}
                  >
                    {staff.isBlackPlaceholder ? (
                      <div className="w-full h-full bg-black" />
                    ) : (
                      <div className="w-full h-full relative bg-neutral-100">
                        <Image
                          src={staff.avatarUrl || "/images/profile-avatar.png"}
                          alt={`${staff.firstName} ${staff.lastName}`}
                          fill
                          className="object-cover object-center"
                        />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              type="button"
              onClick={handleEditStaff}
              className="bg-[#ECEEFE] hover:bg-[#dfe4fd] text-[#1317E4] font-mono text-[11px] font-bold px-4 sm:px-5 py-1.5 rounded-[12px] tracking-wider uppercase active:scale-95 transition-all cursor-pointer select-none"
            >
              EDIT STAFF
            </button>
            <button
              type="button"
              onClick={() => router.push(paths.adminStaffHistory)}
              className="border border-[#1317E4] text-[#1317E4] bg-white hover:bg-neutral-50 font-mono text-[11px] font-bold px-4 sm:px-5 py-1.5 rounded-[12px] tracking-wider uppercase active:scale-95 transition-all cursor-pointer select-none shadow-xs"
            >
              HISTORY
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {selectedStaff && (
            <motion.div
              key={selectedStaff.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="w-full flex flex-col items-center gap-4 max-w-[380px]"
            >
              {/* FIRST NAME */}
              <div className="w-full bg-white rounded-full py-3.5 px-6 flex flex-col items-center justify-center shadow-[0_6px_24px_rgba(0,0,0,0.06)] border border-neutral-100/80">
                <span
                  style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                  className="text-[12px] font-bold tracking-[0.15em] text-[#1317E4] uppercase mb-1"
                >
                  FIRST NAME
                </span>
                <span
                  style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                  className="text-[32px] font-bold tracking-wider text-[#1317E4] uppercase leading-none"
                >
                  {selectedStaff.firstName}
                </span>
              </div>

              {/* LAST NAME */}
              <div className="w-full bg-white rounded-full py-3.5 px-6 flex flex-col items-center justify-center shadow-[0_6px_24px_rgba(0,0,0,0.06)] border border-neutral-100/80">
                <span
                  style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                  className="text-[12px] font-bold tracking-[0.15em] text-[#1317E4] uppercase mb-1"
                >
                  LAST NAME
                </span>
                <span
                  style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                  className="text-[32px] font-bold tracking-wider text-[#1317E4] leading-none"
                >
                  {selectedStaff.lastName}
                </span>
              </div>

              {/* ROLE */}
              <div className="w-full bg-white rounded-full py-3.5 px-6 flex flex-col items-center justify-center shadow-[0_6px_24px_rgba(0,0,0,0.06)] border border-neutral-100/80">
                <span
                  style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                  className="text-[12px] font-bold tracking-[0.15em] text-[#1317E4] uppercase mb-1.5"
                >
                  ROLE
                </span>
                <div
                  style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                  className="border border-dashed border-[#838EF8] px-4 py-1 rounded-[8px] text-[22px] sm:text-[32px] font-bold text-[#1317E4] tracking-wider uppercase leading-none max-w-full truncate text-center"
                >
                  {selectedStaff.role}
                </div>
              </div>

              {/* BANK DETAILS */}
              <div className="w-full bg-white rounded-full py-3.5 px-6 flex flex-col items-center justify-center shadow-[0_6px_24px_rgba(0,0,0,0.06)] border border-neutral-100/80">
                <span
                  style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                  className="text-[12px] font-bold tracking-[0.15em] text-[#1317E4] uppercase mb-1.5"
                >
                  BANK DETAILS
                </span>
                <div
                  style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                  className="flex items-center justify-center gap-2.5 flex-wrap"
                >
                  <span className="text-[26px] sm:text-[32px] font-bold text-[#1317E4] uppercase tracking-wider leading-none">
                    {selectedStaff.bankName}
                  </span>
                  <div className="flex items-center gap-2 border border-dashed border-[#838EF8] px-3.5 py-1 rounded-[8px]">
                    <span className="text-[26px] sm:text-[32px] font-bold text-[#1317E4] tracking-wider leading-none">
                      {selectedStaff.accountNumber}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      title="Copy account number"
                      className="p-1 text-[#1317E4] hover:opacity-75 active:scale-90 transition-all cursor-pointer flex items-center justify-center"
                      aria-label="Copy account number"
                    >
                      {copied ? (
                        <Check className="w-5 h-5 text-green-600 stroke-[2.5]" />
                      ) : (
                        <Copy className="w-5 h-5 text-[#1317E4] stroke-[2.2]" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={handleRemoveStaff}
            disabled={busy || !selectedStaff}
            className="bg-[#D50000] text-white font-mono text-[12px] font-bold px-7 py-2.5 rounded-full uppercase tracking-wider shadow-[0_4px_16px_rgba(213,0,0,0.32)] hover:bg-[#b50000] active:scale-95 transition-all cursor-pointer disabled:opacity-60"
          >
            REMOVE STAFF
          </button>
        </div>
      </div>
    </div>
  );
}
