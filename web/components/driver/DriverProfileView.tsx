"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { mediaUrl } from "@/lib/media";
import type { DriverProfile } from "@/lib/types";

const STATUSES: DriverProfile["status"][] = ["available", "busy", "offline"];

/**
 * The driver's own profile and availability.
 *
 * Availability is the driver's to set and nobody else's — the admin roster
 * shows it read-only. The segmented pill writes straight through to
 * `driver/availability`, and the avatar's live dot is the same status the
 * dispatcher sees, so there is one value and not two.
 */
export default function DriverProfileView() {
  const { data, loading, error, reload } = useAsync(() => api.driver.me(), []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // `null` means "whatever the server last told us"; a value means the driver
  // has chosen it locally and we are showing it optimistically until the write
  // settles or fails.
  const [pendingStatus, setPendingStatus] = useState<
    DriverProfile["status"] | null
  >(null);
  const status = pendingStatus ?? data?.driver?.status ?? "offline";

  const set = async (next: DriverProfile["status"]) => {
    setPendingStatus(next);
    setSaving(true);
    setSaveError(null);
    try {
      await api.driver.setStatus(next);
      reload();
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "COULDN'T UPDATE THAT");
      setPendingStatus(null);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading label="LOADING PROFILE…" />;
  if (error) return <ScreenNotice tone="error">{error.message}</ScreenNotice>;
  const driver = data?.driver;
  if (!driver) return <ScreenNotice>NO DRIVER RECORD</ScreenNotice>;

  const avatar = mediaUrl(driver.profile?.avatar_asset) ?? "/images/profile-avatar.png";

  return (
    <div className="w-full flex flex-col items-center gap-5">
      <div className="relative w-24 h-24 rounded-full overflow-hidden bg-neutral-100">
        <Image src={avatar} alt="Driver" fill className="object-cover" unoptimized />
        <span
          className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white ${
            status === "available"
              ? "bg-[#1FCD12]"
              : status === "busy"
                ? "bg-[#D70000]"
                : "bg-neutral-400"
          }`}
        />
      </div>

      <p
        style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
        className="text-[14px] font-bold tracking-[0.15em] text-[#1317E4] uppercase text-center"
      >
        {driver.profile?.display_name ?? "DRIVER"}
      </p>

      <div className="w-full grid grid-cols-2 gap-3">
        <Stat label="COMPLETED" value={`${driver.completed_deliveries} DROPS`} />
        <Stat label="VEHICLE" value={driver.vehicle_info ?? "—"} />
        <Stat label="PHONE" value={driver.phone ?? "—"} />
        <Stat label="STATUS" value={status.toUpperCase()} />
      </div>

      <div className="w-full flex flex-col items-center gap-2 mt-2">
        <span
          style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
          className="text-[11px] font-bold tracking-[0.2em] text-[#1317E4] uppercase"
        >
          AVAILABILITY
        </span>
        <div className="inline-flex rounded-full border border-[#838EF8] bg-white p-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={saving}
              onClick={() => set(s)}
              style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
              className={`text-[10px] font-bold px-4 py-1.5 tracking-wider uppercase rounded-full transition-all cursor-pointer ${
                status === s
                  ? "bg-[#1317E4] text-white shadow-xs"
                  : "text-[#1317E4] hover:opacity-75"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {saveError && (
          <p className="font-mono text-[10px] tracking-wider text-red-500 uppercase">
            {saveError}
          </p>
        )}
        {saving && (
          <p className="font-mono text-[9px] tracking-wider text-[#838EF8] uppercase">
            SAVING…
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#838EF8]/40 bg-white p-3 flex flex-col items-center text-center">
      <span className="font-mono text-[9px] font-bold tracking-widest text-[#838EF8] uppercase">
        {label}
      </span>
      <span className="font-mono text-[12px] font-bold text-[#1317E4] mt-1 break-words">
        {value}
      </span>
    </div>
  );
}
