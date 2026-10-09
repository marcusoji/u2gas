"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useAuthStore } from "@/stores/authStore";

/**
 * What the Worker needs before a delivery order can be placed.
 *
 * `create_gas_order` / `create_accessory_order` require a `zone_id` and an
 * `address` for delivery, and a guest must carry a phone number. The drawn
 * sheets have a `CONFIRM DELIVERY ADDRESS` control but no form behind it, so
 * this is that form: without it the Worker answers `ZONE_REQUIRED` and no
 * delivery order can ever be placed.
 */
export interface DeliveryDetails {
  zone_id: string;
  address: string;
  guest_name?: string;
  guest_phone?: string;
}

interface Props {
  /** Called with everything the order needs once the form is valid. */
  onConfirmed: (details: DeliveryDetails) => void;
  className?: string;
}

export default function DeliveryDetailsForm({ onConfirmed, className = "" }: Props) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const zones = useAsync(() => api.zones(), []);

  const [zoneId, setZoneId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Preselect the first active zone so a customer who does not care still has
  // a valid choice; a deactivated zone is never offered. Derived rather than
  // stored, so the form never writes state it did not choose.
  const activeZones = (zones.data?.zones ?? []).filter((z) => z.active !== false);
  const effectiveZoneId =
    zoneId && activeZones.some((z) => z.zone_id === zoneId)
      ? zoneId
      : (activeZones[0]?.zone_id ?? null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveZoneId) return setError("CHOOSE A DELIVERY AREA");
    if (address.trim().length < 6) return setError("ENTER A FULL ADDRESS");
    if (!isLoggedIn && !/^\+?[0-9]{7,15}$/.test(phone.trim())) {
      return setError("ENTER A PHONE NUMBER WE CAN REACH YOU ON");
    }
    setError(null);
    onConfirmed({
      zone_id: effectiveZoneId,
      address: address.trim(),
      guest_name: !isLoggedIn ? name.trim() || undefined : undefined,
      guest_phone: !isLoggedIn ? phone.trim() : undefined,
    });
  };

  return (
    <form onSubmit={submit} className={cn("w-full flex flex-col items-center gap-3", className)}>
      <p className="text-[11px] font-mono tracking-[0.14em] uppercase text-neutral-400">
        WHERE SHOULD WE DELIVER?
      </p>

      {zones.loading && (
        <p className="text-[11px] font-mono uppercase tracking-wider text-[#838EF8]">
          LOADING AREAS…
        </p>
      )}
      {zones.error && (
        <p className="text-[11px] font-mono uppercase tracking-wider text-red-500">
          {zones.error.message}
        </p>
      )}

      {activeZones.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {activeZones.map((z) => {
            const selected = z.zone_id === effectiveZoneId;
            return (
              <button
                key={z.zone_id}
                type="button"
                onClick={() => setZoneId(z.zone_id)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-wider border transition-all cursor-pointer",
                  selected
                    ? "bg-[#1317E4] text-white border-[#1317E4]"
                    : "border-dashed border-[#B0B0B0] text-black hover:border-[#1317E4]",
                )}
              >
                {z.name}
                <span className="ml-1 opacity-60">
                  ₦{Math.round(z.fee_kobo / 100).toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="STREET, HOUSE NUMBER, LANDMARK"
        className="w-full max-w-[300px] rounded-full border border-dashed border-[#1317E4] bg-white px-4 py-2 text-center text-[12px] font-mono tracking-wider text-[#1317E4] placeholder:text-[#838EF8]/70 outline-none uppercase"
      />

      {!isLoggedIn && (
        <>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="YOUR NAME"
            className="w-full max-w-[300px] rounded-full border border-dashed border-[#B0B0B0] bg-white px-4 py-2 text-center text-[12px] font-mono tracking-wider text-[#1317E4] placeholder:text-[#838EF8]/70 outline-none uppercase"
          />
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="PHONE NUMBER"
            className="w-full max-w-[300px] rounded-full border border-dashed border-[#B0B0B0] bg-white px-4 py-2 text-center text-[12px] font-mono tracking-wider text-[#1317E4] placeholder:text-[#838EF8]/70 outline-none uppercase"
          />
        </>
      )}

      {error && (
        <p role="alert" className="text-[10px] font-mono tracking-wider text-red-500 uppercase text-center">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="rounded-full bg-[#1317E4] px-6 py-2.5 text-[11px] font-mono font-bold uppercase tracking-wider text-white shadow-xs active:scale-95 transition-all cursor-pointer"
      >
        CONFIRM DELIVERY ADDRESS
      </button>
    </form>
  );
}
