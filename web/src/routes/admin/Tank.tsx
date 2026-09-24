import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type GasEntry } from "../../lib/api";
import {
  ErrorState, Input, LoadBar, Modal, Pill, Stamp, Tabs, money,
} from "../../components/primitives";
import { Ticker } from "../../components/terminal";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/**
 * The tank. available_kg is read from the server, never computed here and
 * never editable — it is derived from received minus reserved minus deducted,
 * and the only way to move it is a stock entry. (Spec 29)
 */
export default function Tank() {
  const [stock, setStock] = useState<any>(null);
  const [entries, setEntries] = useState<GasEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [updating, setUpdating] = useState(false);
  const [tons, setTons] = useState(1);
  const [move, setMove] = useState<"addition" | "removal">("addition");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [rate, setRate] = useState("");

  const [month, setMonth] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.admin.stock()
      .then((r) => { setStock(r.stock); setRate(String(r.stock.rate_kobo_per_kg / 100)); })
      .catch((e: ApiError) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (!showHistory) return;
    setEntries(null);
    api.admin.stockHistory(month || undefined)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, [showHistory, month]);

  async function submitStock() {
    setBusy(true);
    setModalError(null);
    try {
      await api.admin.addStock({
        move, amount_kg: tons * 1000,
      });
      setUpdating(false);
      load();
    } catch (e) {
      // Removing stock that customers have already reserved is refused by the
      // gas_never_oversold constraint. That refusal is correct, so show it.
      setModalError((e as ApiError).message);
    } finally { setBusy(false); }
  }

  async function submitRate() {
    setBusy(true);
    try {
      await api.admin.setRate(Math.round(Number(rate) * 100));
      setRateOpen(false);
      load();
    } catch (e) {
      setModalError((e as ApiError).message);
    } finally { setBusy(false); }
  }

  if (error && !stock) return <div className="screen"><ErrorState message={error} onRetry={load} /></div>;

  if (!stock) return (
    <div className="screen" style={{ justifyContent: "center" }}>
      <LoadBar label="READING THE TANK" />
    </div>
  );

  const tonsAvailable = stock.available_kg / 1000;

  return (
    <div className="screen figma-route-scroll">
      {updating ? (
        <FigmaRouteFrame
          node="1:3075"
          values={{
            "1:3076": String(Math.max(0, Math.floor(tonsAvailable))),
            "1:3231": String(tons),
            "1:3233": "TONS",
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            const node = target.closest<HTMLElement>("[data-node]")?.dataset.node;
            const frameRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - frameRect.left;
            const y = e.clientY - frameRect.top;

            // The generated artwork keeps the two controls inside one Figma node
            // (1:3238), so use their designed hit areas rather than changing the
            // artwork itself.
            if (node === "1:3238" || (x >= 120 && x <= 260 && y >= 610 && y <= 680)) {
              if (x < 190) setMove("removal");
              else setMove("addition");
              if (x < 190) setTons((v) => Math.max(1, v - 1));
              else setTons((v) => Math.min(99, v + 1));
              return;
            }

            if (node === "1:3208" || (x >= 40 && x <= 240 && y >= 656 && y <= 726)) {
              void submitStock();
            }
          }}
        />
      ) : (
        <>
          <FigmaRouteFrame
            node={showHistory ? "1:2847" : "1:3887"}
            values={showHistory
              ? { "1:2856": `${entries?.length ?? 0} ENTRIES` }
              : {
                  "1:3904": String(Math.max(0, Math.floor(tonsAvailable))),
                  "1:3903": "TONS",
                  "1:3902": stock.days_remaining !== null
                    ? `${stock.days_remaining} DAYS LEFT · RATE ${money(stock.rate_kobo_per_kg)}/KG`
                    : `RATE ${money(stock.rate_kobo_per_kg)}/KG`,
                }}
            onClick={(e) => {
              const id = (e.target as HTMLElement).closest<HTMLElement>("[data-node]")?.dataset.node;
              if (id === "1:4022") { setMove("addition"); setUpdating(true); setModalError(null); }
              if (id === "1:2588") { setMove("addition"); setUpdating(true); setModalError(null); }
              if (id === "1:2590" || id === "1:2591") setShowHistory((v) => !v);
            }}
          />
          {showHistory && (
            <div style={{ marginTop: 18 }}>
              <Tabs
                label="Month"
                value={month}
                onChange={setMonth}
                options={[{ value: "", label: "ALL" }, ...MONTHS.map((m, i) => ({
                  value: `${new Date().getFullYear()}-${String(i + 1).padStart(2, "0")}`, label: m,
                })).slice(0, new Date().getMonth() + 1)]}
              />
              <div style={{ height: 18 }} />
              {!entries && <LoadBar label="PULLING ENTRIES" />}
              {entries?.map((e) => (
                <div className="card" key={e.entry_id}>
                  <div className="card-body">
                    <p className="card-title">{e.move === "addition" ? "+" : "−"}{(e.amount_kg / 1000).toFixed(1)} TONS</p>
                    <p className="card-sub">{new Date(e.entry_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase()} {e.admin?.display_name ? ` · ${e.admin.display_name}` : ""}</p>
                    {e.note && <p className="card-sub">{e.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {stock.available_kg <= 0 && <div className="stamp-wrap" style={{ marginTop: 16 }}>THE TANK IS EMPTY</div>}
        </>
      )}

      {/* The exact Figma update state deliberately owns the quantity controls.
          Note/photo remain optional API fields; the core stock movement can be
          completed directly from the designed state. */}
      {modalError && updating && (
        <div className="figma-inline-error">
          <Stamp>{modalError}</Stamp>
        </div>
      )}

      <Modal open={rateOpen} onClose={() => setRateOpen(false)} label="Change the rate">
        <p className="label">NAIRA PER KG</p>
        <div style={{ marginTop: "var(--s-4)" }}>
          <Input type="number" inputMode="decimal" value={rate}
                 onChange={(e) => setRate(e.target.value)} />
        </div>
        {/* Existing orders keep rate_at_purchase. Nobody gets re-priced. */}
        <p className="label" style={{ marginTop: "var(--s-4)", lineHeight: 2 }}>
          THIS ONLY AFFECTS NEW ORDERS
        </p>
        <div style={{ marginTop: "var(--s-5)" }}>
          <Pill onClick={submitRate} disabled={busy || !rate}>SAVE THE RATE</Pill>
          <Pill variant="ghost" onClick={() => setRateOpen(false)}>CANCEL</Pill>
        </div>
      </Modal>
    </div>
  );
}
