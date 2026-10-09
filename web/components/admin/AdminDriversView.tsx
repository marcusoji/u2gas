"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import AdminPageShell, { AdminChip } from "./AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { mediaUrl } from "@/lib/media";
import { paths } from "@/utils/paths";

/**
 * Driver management: the staff grid with the roles swapped.
 *
 * Read-only on purpose. A driver's *account* is a staff row, and adding,
 * editing or removing it already lives on the Staff screen; there is no
 * separate driver-write endpoint to call. Availability is the driver's own
 * toggle, shown here as the live dot the design puts on the avatar. Duplicating
 * a write control here would either 404 or fork the source of truth.
 */
export default function AdminDriversView({ onBack }: { onBack: () => void }) {
  const { data, loading, error } = useAsync(() => api.admin.drivers(), []);
  const drivers = data?.drivers ?? [];

  return (
    <AdminPageShell title="DRIVERS" onBack={onBack}>
      {loading && <Loading label="LOADING DRIVERS…" />}
      {error && !loading && <ScreenNotice tone="error">{error.message}</ScreenNotice>}
      {!loading && !error && drivers.length === 0 && (
        <ScreenNotice>NO DRIVERS ON THE ROSTER</ScreenNotice>
      )}

      <div className="w-full grid grid-cols-2 gap-3">
        {drivers.map((d) => {
          const avatar =
            mediaUrl(d.profile?.avatar_asset) ??
            "/images/profile-avatar.png";
          return (
            <div
              key={d.driver_id}
              className="rounded-2xl border border-[#838EF8]/40 bg-white p-3 flex flex-col items-center gap-2"
            >
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-neutral-100">
                <Image
                  src={avatar}
                  alt={d.profile?.display_name ?? "Driver"}
                  fill
                  className="object-cover"
                  unoptimized
                />
                <span
                  className={`absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                    d.status === "available"
                      ? "bg-[#1FCD12]"
                      : d.status === "busy"
                        ? "bg-[#D70000]"
                        : "bg-neutral-400"
                  }`}
                />
              </div>
              <span className="font-mono text-[11px] font-bold tracking-wide text-[#1317E4] uppercase text-center truncate w-full">
                {d.profile?.display_name ?? d.driver_id.slice(0, 8)}
              </span>
              <span className="font-mono text-[9px] tracking-wider text-[#838EF8] uppercase">
                {d.status.toUpperCase()}
              </span>
              <span className="font-mono text-[9px] tracking-wider text-[#1317E4] uppercase">
                {d.completed_deliveries} DROPS
              </span>
              {d.vehicle_info && (
                <span className="font-mono text-[9px] tracking-wider text-[#838EF8] uppercase text-center">
                  {d.vehicle_info}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <Link href={paths.adminStaff} className="cursor-pointer">
          <AdminChip>EDIT ON THE STAFF ROSTER</AdminChip>
        </Link>
      </div>
    </AdminPageShell>
  );
}
