"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import AdminPageShell, { AdminChip } from "./AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import type { AdminDriver, AdminOrder } from "@/lib/types";

const naira = (kobo: number) =>
  Math.round(kobo / 100).toLocaleString("en-US");

type Tab = "ALL" | "PAID" | "UNPAID" | "FULFILLED" | "CANCELLED" | "EXPIRED";
const TABS: Tab[] = ["ALL", "PAID", "UNPAID", "FULFILLED", "CANCELLED", "EXPIRED"];

const TAB_STATUS: Record<Tab, string | undefined> = {
  ALL: undefined,
  PAID: "paid",
  UNPAID: "unpaid",
  FULFILLED: "fulfilled",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

const CANCEL_REASONS = [
  "CUSTOMER REQUEST",
  "OUT OF STOCK",
  "DUPLICATE ORDER",
  "DEPOT ERROR",
];

/**
 * The orders desk.
 *
 * Two destructive/manual actions live here and both are server-authoritative:
 * cancelling moves a paid order to refund-pending rather than claiming the
 * money moved, and assigning a driver creates the delivery row the fulfilment
 * path depends on. The screen never infers either outcome — it refetches.
 */
export default function AdminOrdersView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const ordersState = useAsync(
    () => api.admin.orders(TAB_STATUS[tab]),
    [tab],
  );
  const driversState = useAsync(() => api.admin.drivers(), []);

  const orders = useMemo(
    () => ordersState.data?.orders ?? [],
    [ordersState.data],
  );
  const drivers = driversState.data?.drivers ?? [];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      ordersState.reload();
    } catch (e) {
      setActionError(
        e instanceof ApiError ? e.message : "THAT DIDN'T GO THROUGH",
      );
    } finally {
      setBusy(false);
    }
  };

  const cancel = (o: AdminOrder, reason: string) =>
    run(() => api.admin.cancelOrder(o.order_id, reason));

  const assign = (o: AdminOrder, driverId: string) =>
    run(() => api.admin.assign(o.order_id, driverId));

  return (
    <AdminPageShell title="ORDERS" onBack={onBack}>
      <div className="w-full flex flex-wrap items-center justify-center gap-2 mb-5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
            className={`text-[10px] font-bold px-3 py-1 tracking-wider uppercase transition-all cursor-pointer rounded-[8px] ${
              tab === t
                ? "bg-[#1317E4] text-white shadow-xs"
                : "text-[#1317E4] hover:opacity-75"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {actionError && (
        <p className="w-full font-mono text-[10px] tracking-wider text-red-500 uppercase mb-3 text-center">
          {actionError}
        </p>
      )}

      {ordersState.loading && <Loading label="LOADING ORDERS…" />}
      {ordersState.error && !ordersState.loading && (
        <ScreenNotice tone="error">{ordersState.error.message}</ScreenNotice>
      )}
      {!ordersState.loading && !ordersState.error && orders.length === 0 && (
        <ScreenNotice>NOTHING HERE YET</ScreenNotice>
      )}

      <div className="w-full flex flex-col gap-3">
        {orders.map((o) => {
          const open = openId === o.order_id;
          const customer =
            o.guest_name ||
            o.profile?.display_name ||
            "GUEST";
          const assigned = o.delivery?.driver_id;
          return (
            <div
              key={o.order_id}
              className="w-full rounded-2xl border border-[#838EF8]/40 bg-white overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : o.order_id)}
                className="w-full p-3 flex items-center gap-3 text-left cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[12px] font-bold tracking-wide text-[#1317E4] uppercase">
                    {o.order_number}
                  </p>
                  <p className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase truncate">
                    {customer} · {o.fulfillment_type.toUpperCase()}
                  </p>
                  <p className="font-mono text-[10px] tracking-wider text-[#1317E4] uppercase mt-0.5">
                    ₦{naira(o.total_kobo)} · {o.status} · {o.payment_status}
                    {o.refund_status ? ` · ${o.refund_status}` : ""}
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
                  {o.delivery && (
                    <p className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase">
                      DELIVERY: {o.delivery.status}
                      {assigned ? ` · DRIVER ${assigned.slice(0, 8)}` : ""}
                      {o.delivery.delivery_address
                        ? ` · ${o.delivery.delivery_address}`
                        : ""}
                    </p>
                  )}

                  {o.fulfillment_type === "delivery" && drivers.length > 0 && (
                    <label className="w-full flex flex-col gap-1">
                      <span className="font-mono text-[9px] font-bold tracking-widest text-[#838EF8] uppercase">
                        ASSIGN DRIVER
                      </span>
                      <select
                        disabled={busy}
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value)
                            void assign(o, e.target.value);
                        }}
                        className="w-full rounded-lg border border-[#838EF8]/40 bg-white px-3 py-2 font-mono text-[11px] text-[#1317E4] uppercase outline-none"
                      >
                        <option value="">— PICK A DRIVER —</option>
                        {drivers.map((d: AdminDriver) => (
                          <option key={d.driver_id} value={d.driver_id}>
                            {d.profile?.display_name ?? d.driver_id.slice(0, 8)}
                            {` · ${d.status.toUpperCase()}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="w-full flex flex-col items-center gap-2">
                    <span className="font-mono text-[9px] font-bold tracking-widest text-[#838EF8] uppercase">
                      CANCEL ORDER
                    </span>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {CANCEL_REASONS.map((r) => (
                        <AdminChip
                          key={r}
                          disabled={busy}
                          onClick={() => cancel(o, r)}
                          className="!px-3 !py-1 !text-[9px]"
                        >
                          {r}
                        </AdminChip>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AdminPageShell>
  );
}
