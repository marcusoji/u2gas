"use client";

import React, { useState } from "react";
import { AdminChip } from "@/components/admin/AdminPageShell";
import { Loading, ScreenNotice } from "@/components/screen-notice";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

const naira = (kobo: number) =>
  Math.round(kobo / 100).toLocaleString("en-US");

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Shift close and cash reconciliation.
 *
 * The expected figure is the server's — every cash payment this cashier rang up
 * on the shift date. The cashier enters what is actually in the drawer; the
 * variance is computed here for display only, and the close posts the counted
 * amount with an idempotency key so a double tap cannot close twice. A closed
 * shift is immutable, and the sheet shows the stored variance it reads back.
 */
export default function CashierReconciliationView() {
  const [date, setDate] = useState(today());
  const { data, loading, error, reload } = useAsync(
    () => api.staff.reconciliation(date),
    [date],
  );

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-xl border border-[#838EF8]/50 bg-white px-4 py-2 font-mono text-[12px] tracking-wider text-[#1317E4] outline-none focus:border-[#1317E4]"
      />

      {loading && <Loading label="COUNTING THE DAY…" />}
      {error && !loading && <ScreenNotice tone="error">{error.message}</ScreenNotice>}

      {data && !loading && (
        // Remounting on the date is how the form resets: a new shift is a new
        // form, and there is no effect writing state back over a render.
        <ShiftForm
          key={date}
          date={date}
          expected={data.expected_kobo}
          transactionCount={data.transaction_count}
          reconciliation={data.reconciliation}
          onClosed={reload}
        />
      )}
    </div>
  );
}

function ShiftForm({
  date,
  expected,
  transactionCount,
  reconciliation,
  onClosed,
}: {
  date: string;
  expected: number;
  transactionCount: number;
  reconciliation: {
    counted_kobo: number;
    variance_kobo: number;
    note: string | null;
    closed_at: string | null;
  } | null;
  onClosed: () => void;
}) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const countedKobo = Math.round(Number(counted || "0") * 100);
  const variance = Number.isFinite(countedKobo) ? countedKobo - expected : 0;
  const closedAt = reconciliation?.closed_at ?? null;

  const close = async () => {
    if (!counted.trim()) {
      setCloseError("ENTER WHAT YOU COUNTED");
      return;
    }
    setSaving(true);
    setCloseError(null);
    try {
      await api.staff.closeShift(
        {
          shift_date: date,
          counted_kobo: countedKobo,
          note: note.trim() || undefined,
        },
        newIdempotencyKey(),
      );
      onClosed();
    } catch (e) {
      setCloseError(
        e instanceof ApiError ? e.message : "COULDN'T CLOSE THE SHIFT",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div className="w-full rounded-2xl border border-[#838EF8]/40 bg-white p-4 flex flex-col gap-2">
        <Row label="EXPECTED (CASH)" value={`₦${naira(expected)}`} />
        <Row label="TRANSACTIONS" value={String(transactionCount)} />
        {closedAt && (
          <>
            <Row label="COUNTED" value={`₦${naira(reconciliation?.counted_kobo ?? 0)}`} />
            <Row
              label="VARIANCE"
              value={`₦${naira(reconciliation?.variance_kobo ?? 0)}`}
              tone={(reconciliation?.variance_kobo ?? 0) === 0 ? "ok" : "bad"}
            />
            <p className="font-mono text-[9px] tracking-wider text-[#838EF8] uppercase mt-1">
              SHIFT CLOSED
              {reconciliation?.note ? ` · ${reconciliation.note}` : ""}
            </p>
          </>
        )}
      </div>

      {!closedAt && (
        <>
          <input
            value={counted}
            inputMode="numeric"
            onChange={(e) => setCounted(e.target.value)}
            placeholder="COUNTED IN DRAWER ₦"
            className="w-full rounded-xl border border-[#838EF8]/50 bg-white px-4 py-3 font-mono text-[13px] tracking-wider text-[#1317E4] outline-none focus:border-[#1317E4]"
          />
          {counted.trim() !== "" && (
            <p
              className={`font-mono text-[12px] font-bold tracking-wider uppercase ${
                variance === 0 ? "text-[#1a7113]" : "text-[#D70000]"
              }`}
            >
              VARIANCE ₦{naira(variance)}
            </p>
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="NOTE (OPTIONAL)"
            className="w-full rounded-xl border border-[#838EF8]/50 bg-white px-4 py-2 font-mono text-[11px] tracking-wider text-[#1317E4] outline-none focus:border-[#1317E4]"
          />
          {closeError && (
            <p className="font-mono text-[10px] tracking-wider text-red-500 uppercase">
              {closeError}
            </p>
          )}
          <AdminChip
            onClick={close}
            disabled={saving}
            className="!px-6 !py-2 !text-[11px]"
          >
            {saving ? "CLOSING…" : "CLOSE SHIFT"}
          </AdminChip>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "ok" | "bad";
}) {
  return (
    <div className="w-full flex items-center justify-between border-b border-dashed border-[#838EF8]/30 pb-1">
      <span className="font-mono text-[10px] tracking-wider text-[#838EF8] uppercase">
        {label}
      </span>
      <span
        className={`font-mono text-[12px] font-bold ${
          tone === "bad"
            ? "text-[#D70000]"
            : tone === "ok"
              ? "text-[#1a7113]"
              : "text-[#1317E4]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
