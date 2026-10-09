"use client";

import React, { useState } from "react";
import { ChevronDown, Phone, MapPin } from "lucide-react";
import { AdminChip } from "@/components/admin/AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import type { DriverDrop } from "@/lib/types";

const naira = (kobo: number) =>
  Math.round(kobo / 100).toLocaleString("en-US");

const FAIL_REASONS = ["NO ANSWER", "WRONG ADDRESS", "REFUSED"] as const;
type FailReason = (typeof FAIL_REASONS)[number];

const REASON_WIRE: Record<FailReason, string> = {
  "NO ANSWER": "no_answer",
  "WRONG ADDRESS": "wrong_address",
  REFUSED: "refused",
};

/**
 * The driver's full delivery detail: who to ring, where to go, what to hand
 * over and what it is worth, plus the three transitions the spec gives a driver
 * — start the trip, deliver (the scanner owns that one) and record a failure.
 *
 * A failure carries an outcome the server acts on: `reschedule` keeps the drop,
 * `return` sends it back to the depot. The screen sends both and refetches;
 * it never guesses which the server chose.
 */
export default function DriverDeliveriesView() {
  const { data, loading, error, reload } = useAsync(
    () => api.driver.deliveries("active"),
    [],
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [failFor, setFailFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const drops = data?.deliveries ?? [];

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(
        e instanceof ApiError ? e.message : "THAT DIDN'T GO THROUGH",
      );
    } finally {
      setBusy(false);
    }
  };

  const startTrip = (d: DriverDrop) =>
    act(() => api.driver.enRoute(d.delivery_id));

  const fail = (d: DriverDrop, reason: FailReason, outcome: "reschedule" | "return") =>
    act(() =>
      api.driver.failed(d.delivery_id, {
        reason: REASON_WIRE[reason],
        outcome,
      }),
    );

  if (loading) return <Loading label="LOADING DROPS…" />;
  if (error) return <ScreenNotice tone="error">{error.message}</ScreenNotice>;
  if (drops.length === 0)
    return <ScreenNotice>NO DROPS ASSIGNED</ScreenNotice>;

  return (
    <div className="w-full flex flex-col gap-3">
      {actionError && (
        <p className="w-full font-mono text-[10px] tracking-wider text-red-500 uppercase text-center">
          {actionError}
        </p>
      )}
      {drops.map((d) => {
        const open = openId === d.delivery_id;
        const order = d.order;
        const items = order?.order_item ?? [];
        return (
          <div
            key={d.delivery_id}
            className="w-full rounded-2xl border border-[#838EF8]/40 bg-white overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : d.delivery_id)}
              className="w-full p-3 flex items-center gap-3 text-left cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[12px] font-bold tracking-wide text-[#1317E4] uppercase">
                  {order?.order_number ?? d.delivery_id.slice(0, 8)}
                </p>
                <p className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase truncate">
                  {d.status.toUpperCase()}
                  {d.eta_minutes != null ? ` · ${d.eta_minutes} MIN` : ""}
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[#1317E4] shrink-0 transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>

            {open && (
              <div className="px-3 pb-4 pt-1 flex flex-col gap-3 border-t border-[#838EF8]/20">
                <div className="w-full flex flex-col gap-1">
                  <p className="font-mono text-[11px] font-bold text-[#1317E4] uppercase">
                    {order?.guest_name || order?.profile?.display_name || "GUEST"}
                  </p>
                  {(order?.guest_phone || order?.profile?.phone) && (
                    <a
                      href={`tel:${order?.guest_phone ?? order?.profile?.phone ?? ""}`}
                      className="font-mono text-[10px] tracking-wider text-[#1317E4] uppercase inline-flex items-center gap-1.5"
                    >
                      <Phone className="w-3 h-3" />
                      {order?.guest_phone ?? order?.profile?.phone}
                    </a>
                  )}
                  <p className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase inline-flex items-start gap-1.5">
                    <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                    {d.delivery_address}
                  </p>
                </div>

                {items.length > 0 && (
                  <div className="w-full flex flex-col gap-1">
                    {items.map((it) => (
                      <div
                        key={it.order_item_id}
                        className="w-full flex items-center justify-between border-b border-dashed border-[#838EF8]/30 pb-1"
                      >
                        <span className="font-mono text-[10px] tracking-wider text-[#1317E4] uppercase truncate">
                          {it.product?.name ?? "ITEM"} × {it.quantity}
                        </span>
                        <span className="font-mono text-[10px] text-[#1317E4] shrink-0">
                          ₦{naira(it.unit_price_kobo * it.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="w-full flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase">
                    {d.zone?.name ?? "DELIVERY"}
                  </span>
                  <span className="font-mono text-[12px] font-bold text-[#1317E4]">
                    ₦{naira(order?.total_kobo ?? 0)}
                  </span>
                </div>

                <div className="w-full flex flex-wrap items-center justify-center gap-2">
                  {d.status === "assigned" && (
                    <AdminChip
                      disabled={busy}
                      onClick={() => startTrip(d)}
                      className="!px-4 !py-1.5 !text-[10px]"
                    >
                      START TRIP
                    </AdminChip>
                  )}
                  <AdminChip
                    disabled={busy}
                    onClick={() =>
                      setFailFor(failFor === d.delivery_id ? null : d.delivery_id)
                    }
                    className="!px-4 !py-1.5 !text-[10px]"
                  >
                    REPORT FAILURE
                  </AdminChip>
                </div>

                {failFor === d.delivery_id && (
                  <div className="w-full rounded-xl border border-dashed border-[#D70000]/50 p-3 flex flex-col gap-2">
                    {FAIL_REASONS.map((reason) => (
                      <div key={reason} className="flex flex-wrap gap-2">
                        <span className="font-mono text-[9px] font-bold tracking-wider text-[#D70000] uppercase w-28 self-center">
                          {reason}
                        </span>
                        <AdminChip
                          disabled={busy}
                          onClick={() => fail(d, reason, "reschedule")}
                          className="!px-3 !py-1 !text-[9px]"
                        >
                          RESCHEDULE
                        </AdminChip>
                        <AdminChip
                          disabled={busy}
                          onClick={() => fail(d, reason, "return")}
                          className="!px-3 !py-1 !text-[9px]"
                        >
                          RETURN
                        </AdminChip>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
