"use client";

import React, { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import FullScreenView from "@/components/ui/FullScreenView";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import type { Notification } from "@/types";

export interface NotificationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once every unread row has been marked read, so the bell can clear. */
  onRead?: () => void;
}

/**
 * The destination the bell was missing.
 *
 * Opening the sheet is a view, not a read: rows stay bold until the person asks
 * to clear them, so the badge cannot vanish just because the sheet was glanced
 * at. On open the list is refetched, because notifications are produced by
 * database triggers while the app is running.
 */
export default function NotificationsModal({
  open,
  onOpenChange,
  onRead,
}: NotificationsModalProps) {
  const { data, loading, error, reload } = useAsync(
    () => api.notifications(),
    [open],
    { enabled: open },
  );
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const notifications = data?.notifications ?? [];
  const unread = notifications.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (unread === 0) return;
    setClearing(true);
    setClearError(null);
    try {
      await api.notificationsRead();
      reload();
      onRead?.();
    } catch (e) {
      setClearError(
        e instanceof ApiError ? e.message : "COULDN'T MARK THOSE READ",
      );
    } finally {
      setClearing(false);
    }
  };

  return (
    <FullScreenView
      open={open}
      onClose={() => onOpenChange(false)}
      title="NOTIFICATIONS"
      contentClassName="pt-2 pb-8"
      headerRight={
        <button
          type="button"
          onClick={markAllRead}
          disabled={clearing || unread === 0}
          className="text-[11px] text-[#838EF8] hover:text-[#1317E4] disabled:opacity-40 disabled:hover:text-[#838EF8] font-mono font-bold uppercase tracking-wider px-2 py-1 rounded-md hover:bg-neutral-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {clearing ? "CLEARING…" : "MARK ALL READ"}
        </button>
      }
    >
      {clearError && (
        <p className="w-full text-center text-[11px] font-mono tracking-wider text-red-500 uppercase mb-3">
          {clearError}
        </p>
      )}

      {loading && (
        <p className="w-full text-center text-[12px] font-mono tracking-wider text-[#838EF8] uppercase py-16">
          LOADING…
        </p>
      )}

      {error && !loading && (
        <p className="w-full text-center text-[12px] font-mono tracking-wider text-red-500 uppercase py-16">
          {error.message}
        </p>
      )}

      {!loading && !error && notifications.length === 0 && (
        <div className="w-full py-20 flex flex-col items-center justify-center text-center">
          <p className="text-[16px] text-[#1317E4] font-mono font-bold tracking-wider uppercase mb-1">
            NOTHING YET
          </p>
          <span className="text-[12px] text-[#838EF8] font-mono uppercase">
            Order updates will show here
          </span>
        </div>
      )}

      <div className="w-full flex flex-col gap-2.5">
        {notifications.map((n) => (
          <NotificationRow key={n.notification_id} notification={n} />
        ))}
      </div>
    </FullScreenView>
  );
}

function NotificationRow({ notification: n }: { notification: Notification }) {
  const unread = !n.read_at;
  return (
    <div
      className={`w-full rounded-2xl border px-4 py-3 flex flex-col gap-0.5 transition-all ${
        unread
          ? "border-[#838EF8]/50 bg-[#F7F8FF]"
          : "border-neutral-100 bg-white"
      }`}
    >
      <div className="w-full flex items-center justify-between gap-2">
        <span className="text-[12px] font-mono font-bold tracking-wide text-[#1317E4] uppercase truncate">
          {n.title}
        </span>
        {unread && (
          <span
            aria-label="Unread"
            className="w-2 h-2 rounded-full bg-[#1FCD12] shrink-0"
          />
        )}
      </div>
      {n.body && (
        <span className="text-[11px] font-mono tracking-wide text-[#838EF8] uppercase">
          {n.body}
        </span>
      )}
      <span className="text-[10px] font-mono tracking-wider text-neutral-400 uppercase mt-1">
        {relativeTime(n.created_at)}
      </span>
    </div>
  );
}

/** Short, human age ("3H", "2D"). Never throws on a bad date. */
function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return formatDistanceToNowStrict(d, { addSuffix: false })
      .replace(/ seconds?/, "S")
      .replace(/ minutes?/, "M")
      .replace(/ hours?/, "H")
      .replace(/ days?/, "D")
      .replace(/ months?/, "MO")
      .replace(/ years?/, "Y")
      .toUpperCase();
  } catch {
    return "";
  }
}

export { NotificationsModal };
