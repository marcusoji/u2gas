"use client";

import React, { useState } from "react";
import AdminPageShell, { AdminChip } from "./AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import type { Refund } from "@/lib/types";

const naira = (kobo: number) =>
  Math.round(kobo / 100).toLocaleString("en-US");

/**
 * The flagged review queue.
 *
 * Three things the system refuses to let disappear, surfaced where an admin can
 * act: money owed for an order that closed before payment landed, deliveries
 * that failed, and unpaid holds about to expire. Refunds are the one item with
 * a real control — processing needs the gateway, so a failure falls back to the
 * drawn "record it manually" path rather than pretending it moved.
 */
export default function AdminFlaggedView({ onBack }: { onBack: () => void }) {
  const flagged = useAsync(() => api.admin.flagged(), []);
  const refunds = useAsync(() => api.admin.refunds(), []);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queue = flagged.data?.flagged;

  const process = async (r: Refund) => {
    setBusy(r.refund_id);
    setError(null);
    try {
      await api.admin.processRefund(r.refund_id);
      refunds.reload();
      flagged.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "THE GATEWAY REFUSED");
    } finally {
      setBusy(null);
    }
  };

  const manual = async (r: Refund) => {
    setBusy(r.refund_id);
    setError(null);
    try {
      await api.admin.settleRefundManually(
        r.refund_id,
        "Settled outside the gateway",
      );
      refunds.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "COULDN'T RECORD THAT");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminPageShell title="FLAGGED" subtitle="NEEDS A DECISION" onBack={onBack}>
      {error && (
        <p className="w-full font-mono text-[10px] tracking-wider text-red-500 uppercase mb-3 text-center">
          {error}
        </p>
      )}

      <Section title="REFUNDS OWED">
        {refunds.loading && <Loading label="LOADING…" />}
        {refunds.error && !refunds.loading && (
          <ScreenNotice tone="error">{refunds.error.message}</ScreenNotice>
        )}
        {!refunds.loading &&
          !refunds.error &&
          (refunds.data?.refunds.length ?? 0) === 0 && (
            <ScreenNotice>NO REFUNDS WAITING</ScreenNotice>
          )}
        {(refunds.data?.refunds ?? []).map((r) => (
          <Card key={r.refund_id}>
            <p className="font-mono text-[12px] font-bold tracking-wide text-[#1317E4] uppercase">
              ₦{naira(r.amount_kobo)} · {r.status}
            </p>
            <p className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase">
              {r.order?.order_number ?? "ORDER"} ·{" "}
              {r.order?.profile?.display_name ??
                r.order?.guest_phone ??
                "GUEST"}
            </p>
            {r.reason && (
              <p className="font-mono text-[10px] tracking-wider text-[#1317E4] uppercase mt-0.5">
                {r.reason}
              </p>
            )}
            {r.last_error && (
              <p className="font-mono text-[9px] tracking-wider text-red-500 uppercase mt-0.5">
                {r.last_error}
              </p>
            )}
            {(r.status === "pending" || r.status === "processing") && (
              <div className="flex gap-2 mt-2">
                <AdminChip
                  disabled={busy === r.refund_id}
                  onClick={() => process(r)}
                  className="!px-3 !py-1 !text-[9px]"
                >
                  {busy === r.refund_id ? "…" : "PROCESS"}
                </AdminChip>
                <AdminChip
                  disabled={busy === r.refund_id}
                  onClick={() => manual(r)}
                  className="!px-3 !py-1 !text-[9px]"
                >
                  RECORD MANUAL
                </AdminChip>
              </div>
            )}
          </Card>
        ))}
      </Section>

      <Section title="FAILED DELIVERIES">
        {flagged.loading && <Loading label="LOADING…" />}
        {flagged.error && !flagged.loading && (
          <ScreenNotice tone="error">{flagged.error.message}</ScreenNotice>
        )}
        {!flagged.loading &&
          !flagged.error &&
          (queue?.failed_deliveries.length ?? 0) === 0 && (
            <ScreenNotice>NONE FAILED</ScreenNotice>
          )}
        {(queue?.failed_deliveries ?? []).map((d) => (
          <Card key={d.delivery_id}>
            <p className="font-mono text-[12px] font-bold tracking-wide text-[#1317E4] uppercase">
              {d.order?.order_number ?? d.delivery_id.slice(0, 8)}
            </p>
            <p className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase">
              {d.status} · {d.attempt_count} ATTEMPT
              {d.attempt_count === 1 ? "" : "S"}
              {d.failure_reason ? ` · ${d.failure_reason}` : ""}
            </p>
          </Card>
        ))}
      </Section>

      <Section title="STALE UNPAID">
        {!flagged.loading &&
          !flagged.error &&
          (queue?.stale_unpaid.length ?? 0) === 0 && (
            <ScreenNotice>NONE WAITING</ScreenNotice>
          )}
        {(queue?.stale_unpaid ?? []).map((o) => (
          <Card key={o.order_id}>
            <p className="font-mono text-[12px] font-bold tracking-wide text-[#1317E4] uppercase">
              {o.order_number}
            </p>
            <p className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase">
              ₦{naira(o.total_kobo)}
            </p>
          </Card>
        ))}
      </Section>
    </AdminPageShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full flex flex-col gap-2 mb-6">
      <span
        style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
        className="text-[11px] font-bold tracking-[0.2em] text-[#1317E4] uppercase"
      >
        {title}
      </span>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full rounded-2xl border border-[#838EF8]/40 bg-white p-3 flex flex-col">
      {children}
    </div>
  );
}
