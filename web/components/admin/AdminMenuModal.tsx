"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Footer from "@/components/footer";
import AdminSalesHistoryView from "./AdminSalesHistoryView";
import { useAdminStaffStore } from "@/stores/adminStaffStore";
import { paths } from "@/utils/paths";

/** The admin working desk: every screen the design draws behind the API. */
const WORKING_DESK: { label: string; href: string }[] = [
  { label: "GAS RATE", href: paths.adminRate },
  { label: "ACCESSORIES", href: paths.adminProducts },
  { label: "BUNDLES", href: paths.adminBundles },
  { label: "ORDERS", href: paths.adminOrders },
  { label: "FLAGGED", href: paths.adminFlagged },
  { label: "DELIVERY ZONES", href: paths.adminZones },
  { label: "DRIVERS", href: paths.adminDrivers },
  { label: "REPORTS", href: paths.adminReports },
  { label: "AUDIT LOG", href: paths.adminAudit },
  { label: "SETTINGS", href: paths.adminSettings },
];

interface AdminMenuModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalSales?: string;
  initialView?: "menu" | "sales-history";
  onSalesHistoryClick?: () => void;
  onStaffInfoClick?: () => void;
  onUpdateHistoryClick?: () => void;
}

export default function AdminMenuModal({
  open,
  onOpenChange,
  totalSales = "10,000",
  initialView = "menu",
  onSalesHistoryClick,
  onStaffInfoClick,
  onUpdateHistoryClick,
}: AdminMenuModalProps) {
  const router = useRouter();
  const { staffList, load, loaded } = useAdminStaffStore();

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const [view, setView] = useState<"menu" | "sales-history">(initialView);
  // Re-seed the view each time the sheet opens. Adjusting state during render is
  // the React-recommended replacement for the old reset effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setView(initialView);
  }

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view === "sales-history") {
          setView("menu");
        } else {
          onOpenChange(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange, view]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="admin-menu-page"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-0 z-50 bg-white overflow-y-auto overflow-x-hidden flex flex-col items-center select-none"
        >
          {view === "sales-history" ? (
            <AdminSalesHistoryView onBack={() => setView("menu")} />
          ) : (
            <div className="w-full max-w-[420px] min-h-screen flex flex-col justify-between items-center px-6 py-6 sm:py-8">
              <div className="w-full flex items-center justify-start">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="bg-[#1317E4] text-white font-mono text-[11px] font-bold px-3 py-1.5 rounded-[6px] tracking-wider uppercase flex items-center gap-1.5 shadow-xs hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer select-none"
                  aria-label="Go Back"
                >
                  <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span className="leading-none">BACK</span>
                </button>
              </div>

              <div className="w-full flex flex-col items-center gap-10 sm:gap-12 my-auto py-6">
                {/* SECTION 1: TOTAL SALES */}
                <div className="flex flex-col items-center">
                  <span className="font-mono text-[12.5px] font-bold tracking-[0.22em] text-[#1317E4] uppercase">
                    TOTAL SALES
                  </span>

                  <div
                    className="flex items-start justify-center text-[#1317E4] my-1 select-none"
                    style={{
                      fontFamily:
                        'var(--font-barlow-semi-condensed), "Barlow Semi Condensed", sans-serif',
                    }}
                  >
                    <span className="text-[34px] sm:text-[40px] font-bold leading-none mt-1 mr-0.5">
                      ₦
                    </span>
                    <span className="text-[64px] sm:text-[76px] font-extrabold leading-none tracking-tight">
                      {totalSales}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onSalesHistoryClick?.();
                      router.push(paths.adminSalesHistory);
                    }}
                    className="mt-2 border border-[#838EF8] text-[#1317E4] bg-white font-mono text-[11px] font-bold px-5 py-1.5 rounded-full tracking-wider uppercase hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer shadow-xs"
                  >
                    SALES HISTORY
                  </button>
                </div>

                {/* SECTION 2: STAFF INFO */}
                <div className="flex flex-col items-center w-full">
                  <div className="flex items-center justify-center gap-3 sm:gap-4 overflow-x-auto max-w-full py-1 no-scrollbar">
                    {staffList.slice(0, 4).map((staff, idx) => (
                      <div key={staff.id} className="relative shrink-0">
                        <div
                          className={`w-[78px] h-[78px] sm:w-[100px] sm:h-[100px] rounded-full overflow-hidden shadow-xs ${
                            idx === 0
                              ? "border-[3px] border-[#1317E4]"
                              : "border border-neutral-200/80"
                          } bg-neutral-100`}
                        >
                          {staff.isBlackPlaceholder ? (
                            <div className="w-full h-full bg-black" />
                          ) : (
                            <Image
                              src={staff.avatarUrl || "/images/profile-avatar.png"}
                              alt={`Staff ${idx + 1}`}
                              width={100}
                              height={100}
                              className="w-full h-full object-cover object-center"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onStaffInfoClick?.();
                      router.push(paths.adminStaff);
                    }}
                    className="mt-4 border border-[#838EF8] text-[#1317E4] bg-white font-mono text-[11px] font-bold px-5 py-1.5 rounded-full tracking-wider uppercase hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer shadow-xs"
                  >
                    STAFF INFO
                  </button>
                </div>

                {/* SECTION 3: GAS RECEIPT & UPDATE HISTORY */}
                <div className="flex flex-col items-center w-full">
                  <div className="w-[200px] sm:w-[220px] filter drop-shadow-[0_12px_28px_rgba(0,0,0,0.08)] flex flex-col items-center">
                    <div className="w-full bg-white pt-6 pb-4 px-4 flex flex-col items-center rounded-t-sm">
                      <span
                        className="text-[#1317E4] text-[34px] sm:text-[38px] font-bold leading-none select-none tracking-tight"
                        style={{
                          fontFamily: 'var(--font-jgs7), "jgs7", monospace',
                        }}
                      >
                        23rd
                      </span>

                      <div
                        className="text-[#1317E4] text-[9.5px] font-bold tracking-widest uppercase text-center mt-2.5 mb-4 leading-snug select-none"
                        style={{
                          fontFamily: 'var(--font-jgs7), "jgs7", monospace',
                        }}
                      >
                        <div>2 TONS -</div>
                        <div>ADDED BY MR GIFT</div>
                      </div>

                      <div className="w-[100px] h-[100px] sm:w-[110px] sm:h-[110px] relative flex items-center justify-center">
                        <Image
                          src="/images/qr-code.png"
                          alt="Receipt QR Code"
                          width={110}
                          height={110}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>

                    <div className="w-full overflow-hidden leading-none -mt-px">
                      <svg
                        viewBox="0 0 220 10"
                        className="w-full h-2.5 block text-white fill-white"
                        preserveAspectRatio="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <polygon
                          points="0,0 5.5,10 11,0 16.5,10 22,0 27.5,10 33,0 38.5,10 44,0 49.5,10 55,0 60.5,10 66,0 71.5,10 77,0 82.5,10 88,0 93.5,10 99,0 104.5,10 110,0 115.5,10 121,0 126.5,10 132,0 137.5,10 143,0 148.5,10 154,0 159.5,10 165,0 170.5,10 176,0 181.5,10 187,0 192.5,10 198,0 203.5,10 209,0 214.5,10 220,0"
                          fill="#FFFFFF"
                        />
                      </svg>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (onUpdateHistoryClick) {
                        onUpdateHistoryClick();
                      } else {
                        router.push(paths.adminHistory);
                      }
                    }}
                    className="mt-4 border border-[#838EF8] text-[#1317E4] bg-white font-mono text-[11px] font-bold px-5 py-1.5 rounded-full tracking-wider uppercase hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer shadow-xs"
                  >
                    UPDATE HISTORY
                  </button>
                </div>

                {/* SECTION 4: THE WORKING DESK */}
                <div className="w-full flex flex-col items-center gap-2.5">
                  <span
                    style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                    className="text-[11px] font-bold tracking-[0.2em] text-[#1317E4] uppercase"
                  >
                    MANAGE
                  </span>
                  <div className="w-full flex flex-wrap justify-center gap-2">
                    {WORKING_DESK.map((item) => (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => router.push(item.href)}
                        className="border border-[#838EF8] text-[#1317E4] bg-white font-mono text-[10px] font-bold px-4 py-1.5 rounded-full tracking-wider uppercase hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer shadow-xs"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="w-full pt-4">
                <Footer />
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
