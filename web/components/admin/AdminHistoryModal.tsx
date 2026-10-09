"use client";

import React from "react";
import FullScreenView from "@/components/ui/FullScreenView";
import type { TankHistoryRecord } from "@/types";
import { dummyTankHistory } from "@/data";

interface AdminHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history?: TankHistoryRecord[];
}

export default function AdminHistoryModal({
  open,
  onOpenChange,
  history = dummyTankHistory,
}: AdminHistoryModalProps) {
  return (
    <FullScreenView
      open={open}
      onClose={() => onOpenChange(false)}
      title="TANK HISTORY"
      contentClassName="pt-2 pb-6"
    >
      <div className="w-full flex flex-col gap-3 max-w-95 mt-2">
        {history.map((record) => (
          <div
            key={record.id}
            className="w-full bg-[#FAFAFA] border border-neutral-200/80 rounded-xl p-3.5 flex flex-col gap-1.5 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-neutral-900 tracking-wider">
                {record.id}
              </span>
              <span
                className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  record.type === "REFILL"
                    ? "bg-green-100 text-green-700"
                    : record.type === "MANUAL_UPDATE"
                      ? "bg-blue-100 text-[#1317E4]"
                      : "bg-neutral-200 text-neutral-700"
                }`}
              >
                {record.type.replace("_", " ")}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-neutral-600 font-mono">
              <span>{record.timestamp}</span>
              <span className="font-bold text-black text-sm">
                {record.level}% ({record.volumeLiters} L)
              </span>
            </div>

            <div className="text-[11px] text-neutral-400 font-mono border-t border-neutral-200/50 pt-1 mt-0.5">
              Operator: {record.operator}
            </div>
          </div>
        ))}
      </div>
    </FullScreenView>
  );
}
