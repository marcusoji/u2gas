"use client";

import React, { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { DriverDeliveryOrder, DriverDeliveryStatusTab } from "@/types";
import { dummyDriverDeliveryOrders } from "@/data";

export interface DriverHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders?: DriverDeliveryOrder[];
  onScanOrder?: (order: DriverDeliveryOrder) => void;
}

export default function DriverHistoryModal({
  open,
  onOpenChange,
  orders = dummyDriverDeliveryOrders,
  onScanOrder,
}: DriverHistoryModalProps) {
  const [activeTab, setActiveTab] =
    useState<DriverDeliveryStatusTab>("COMPLETED");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(
    orders[0]?.id || "ddo-1",
  );

  const filteredOrders = orders.filter((order) => order.status === activeTab);

  const handleToggleExpand = (id: string) => {
    setExpandedOrderId((prev) => (prev === id ? null : id));
  };

  const handleScanClick = (order: DriverDeliveryOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenChange(false);
    onScanOrder?.(order);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="driver-history-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-white overflow-y-auto no-scrollbar flex flex-col items-center select-none px-6 pt-5 pb-10"
        >
          <div className="w-full max-w-[420px] flex flex-col items-center">
            {/* HEADER: BACK BUTTON */}
            <div className="w-full flex items-center justify-start mb-6">
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

            {/* STATUS TABS */}
            <div className="flex items-center justify-center gap-3 sm:gap-4 mb-6 flex-wrap">
              {(
                [
                  "COMPLETED",
                  "UNFULFILLED",
                  "CANCELLED",
                ] as DriverDeliveryStatusTab[]
              ).map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab);
                      const firstForTab = orders.find(
                        (o) => o.status === tab,
                      )?.id;
                      setExpandedOrderId(firstForTab || null);
                    }}
                    className={`text-[12px] font-bold px-3 py-1 tracking-wider uppercase transition-all cursor-pointer ${
                      isActive
                        ? "bg-[#1317E4] text-white rounded-[8px] shadow-xs"
                        : "text-[#1317E4] hover:opacity-75"
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {/* DASHED CONTAINER FOR DELIVERY ORDERS */}
            <div className="w-full max-w-[360px] sm:max-w-[380px] rounded-[28px] border-2 border-dashed border-[#C5CAE9] p-5 sm:p-6 flex flex-col gap-4 bg-white shadow-xs">
              <div className="flex flex-col gap-3">
                {filteredOrders.map((item) => {
                  const isExpanded = expandedOrderId === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleToggleExpand(item.id)}
                      className="w-full flex flex-col rounded-[20px] transition-all cursor-pointer"
                    >
                      {/* ROW HEADER (Cylinder + Title + Timestamp) */}
                      <div className="flex items-center gap-3.5 py-1">
                        <div className="relative w-[30px] h-[38px] shrink-0 flex items-center justify-center filter drop-shadow-[0_4px_6px_rgba(0,0,0,0.25)]">
                          <Image
                            src="/images/image1.png"
                            alt="Gas Cylinder"
                            fill
                            className="object-contain"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[20px] font-bold text-[#1317E4] leading-none font-[family-name:var(--font-barlow-semi-condensed)] tracking-tight">
                            {item.title}
                          </span>
                          <span className="text-sm font-medium text-[#1317E4] mt-1 font-[family-name:var(--font-barlow-semi-condensed)]">
                            {format(item.date, "HH:mm, yy/MM/dd")}
                          </span>
                        </div>
                      </div>

                      {/* EXPANDED ACCORDION PANEL (DELIVER TO + MAP + SCAN) */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            key="expanded-content"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.28, ease: "easeInOut" }}
                            className="overflow-hidden flex flex-col items-center pt-2 pb-1"
                          >
                            <span className="text-[11px] font-bold text-[#1317E4] tracking-[0.18em] uppercase text-center mt-1">
                              DELIVER TO:
                            </span>
                            <span className="text-[17px] sm:text-[18px] font-bold text-[#1317E4] tracking-wider uppercase text-center mt-0.5 mb-2">
                              {item.customerName || "AJAINO CALEB"}
                            </span>

                            {/* MAP PREVIEW */}
                            <div className="w-full relative aspect-[16/9] rounded-[18px] overflow-hidden border border-[#C5CAE9] my-1 shadow-xs">
                              <Image
                                src={item.mapImage || "/images/map.jpg"}
                                alt="Delivery Route Map"
                                fill
                                className="object-cover"
                              />
                            </div>

                            {/* SCAN BUTTON */}
                            <div className="w-full flex justify-center mt-3 mb-1">
                              <button
                                type="button"
                                onClick={(e) => handleScanClick(item, e)}
                                className="bg-[#1317E4] text-white text-[16px] font-bold py-2.5 px-12 rounded-full shadow-[0_6px_20px_rgba(19,23,228,0.38)] hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer uppercase select-none"
                              >
                                SCAN
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {filteredOrders.length === 0 && (
                  <div className="w-full py-8 text-center text-xs text-[#838EF8] font-bold uppercase tracking-wider">
                    NO {activeTab} DELIVERIES FOUND
                  </div>
                )}
              </div>

              {/* SEE ALL LINK */}
              <div className="flex items-center justify-center pt-2">
                <button
                  type="button"
                  className="text-[11px] font-bold tracking-wider uppercase text-[#838EF8] hover:text-[#1317E4] transition-colors cursor-pointer select-none"
                >
                  SEE ALL
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
