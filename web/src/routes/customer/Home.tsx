import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, newIdempotencyKey, type HomePayload, type Zone } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { rememberGuestOrder } from "../../lib/guest";
import { AddressPicker, maybeSaveAddress } from "../../components/AddressPicker";
import {
  Chip, ErrorState, Input, Pill, Segmented, Sheet, Stamp, money,
} from "../../components/primitives";
import { FigmaScreen } from "../../figma/FigmaScreen";

type Fulfillment = "pickup" | "delivery";
type Method = "bank_transfer" | "opay" | "card" | "depot";

/**
 * The customer home screen.
 *
 * Everything here is one API call on first paint, and the terminal is built
 * from CSS rather than an image, because this is the LCP element and the
 * budget is 1800ms on 4G. (Addendum 73)
 */
export default function Home() {
  const nav = useNavigate();
  const { session } = useAuth();

  const [home, setHome] = useState<HomePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [digits, setDigits] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [method, setMethod] = useState<Method | null>(null);

  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string>("");
  const [address, setAddress] = useState("");
  const [saveAddr, setSaveAddr] = useState<{ save?: boolean; label?: string }>({});
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<ApiError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const kg = Number(digits || 0);

  const load = useCallback(() => {
    setLoadError(null);
    api.home()
      .then(setHome)
      .catch((e: ApiError) => setLoadError(e.message));
  }, []);

  useEffect(load, [load]);

  // Zones are only needed once delivery is chosen, so they are not on the
  // critical path.
  useEffect(() => {
    if (fulfillment !== "delivery" || zones.length) return;
    let active = true;
    setZoneError(null);
    api.zones()
      .then((r) => { if (active) setZones(r.zones); })
      .catch((e: ApiError) => { if (active) setZoneError(e.message); });
    return () => { active = false; };
  }, [fulfillment, zones.length]);

  const zone = zones.find((z) => z.zone_id === zoneId);
  const feeKobo = fulfillment === "delivery" ? (zone?.fee_kobo ?? 0) : 0;
  const gasKobo = home ? Math.round(kg * home.rate_kobo_per_kg) : 0;

  // Advisory only. The authoritative check happens inside the reservation
  // transaction, so this can be stale and that is fine — it exists to warn
  // early, not to promise anything. (Spec 14)
  const looksShort = home !== null && kg > home.available_kg;

  function press(d: string) {
    if (digits.length >= 4) return;
    if (d === "0" && digits === "") return;
    setDigits(digits + d);
  }

  function openSheet() {
    if (kg <= 0) return;
    setOrderError(null);
    setSheetOpen(true);
  }

  async function placeOrder() {
    if (!method) return;
    if (fulfillment === "delivery" && (!zoneId || !address.trim() || zoneError)) {
      setOrderError(new ApiError("VALIDATION", 400, "SELECT A VALID DELIVERY ZONE AND ADDRESS FIRST"));
      return;
    }
    setSubmitting(true);
    setOrderError(null);
    setFieldErrors({});

    try {
      const idempotencyKey = newIdempotencyKey();
      const { order, guest_token } = await api.createGasOrder({
        kg,
        fulfillment,
        zone_id: fulfillment === "delivery" ? zoneId : undefined,
        address: fulfillment === "delivery" ? address : undefined,
        guest_name: session ? undefined : guestName || undefined,
        guest_phone: session ? undefined : guestPhone || undefined,
      }, idempotencyKey);

      // Without this a guest pays and then cannot reach their own order.
      // Only once the order is real. Saving first would leave an address
      // behind for an order that failed.
      if (fulfillment === "delivery") {
        await maybeSaveAddress(saveAddr.save, saveAddr.label, address, zoneId);
      }
      if (guest_token) rememberGuestOrder(order.order_id, guest_token);
      const suffix = guest_token ? `?t=${encodeURIComponent(guest_token)}` : "";

      if (method === "depot") {
        // Pay at the counter. The hold countdown lives on the status screen.
        nav(`/orders/${order.order_id}${suffix}`);
        return;
      }

      const init = await api.payInit(order.order_id, guest_token);
      if (init.already_paid) { nav(`/orders/${order.order_id}${suffix}`); return; }
      window.location.href = init.authorization_url;

    } catch (e) {
      const err = e as ApiError;
      setOrderError(err);
      setFieldErrors(err.fieldErrors);
      setSubmitting(false);

      // Stock moved between the advisory check and the commit. Refresh so the
      // ticker shows the truth behind the sheet.
      if (err.code === "INSUFFICIENT_GAS") { setSheetOpen(false); load(); }
    }
  }

  /**
   * The terminal's keypad keys carry no id of their own in the file — Figma
   * draws each as a plain digit — so presses are read off the clicked
   * element's own text/class, the same information a person reads by eye.
   * One handler on the wrapper replaces the old per-key Keypad component
   * without changing what a press does.
   */
  function onTerminalClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!home || home.available_kg <= 0) return;
    const key = (e.target as HTMLElement).closest<HTMLElement>(".key");
    if (!key) return;
    if (key.classList.contains("is-cancel")) {
      setDigits((d) => d.slice(0, -1));
    } else if (key.classList.contains("is-pay")) {
      openSheet();
    } else {
      const d = key.textContent?.trim();
      if (d && /^[0-9]$/.test(d)) press(d);
    }
  }

  /** Accept the smaller quantity the depot actually has. */
  function takeWhatsLeft(availableKg: number) {
    setDigits(String(availableKg));
    setOrderError(null);
    setSheetOpen(true);
  }

  if (loadError) {
    return <div className="screen"><ErrorState message={loadError} onRetry={load} /></div>;
  }

  const shortfall = orderError?.partialGasAvailable;

  return (
    <div className="screen">
      {/*
        figma 1:251 — the whole terminal (ticker, LED readout, keypad,
        receipt slot, watermark) as the file draws it. See
        web/src/figma/README.md and scripts/check-figma-parity.sh: this is
        the same markup docs/u2gas-batch1-exact.html carries for HOME, so the
        two cannot drift apart the way the hand-built version did.

        1:257 is the ticker text, 1:296 the LED readout — the only two spots
        with live data. Everything else is the file's own placement.
      */}
      <div className="frame-plate" onClick={onTerminalClick}>
        <FigmaScreen
          node="1:251"
          values={{
            "1:257": home
              ? looksShort
                ? `ONLY ${home.available_kg}KG LEFT \u00b7 ${home.ticker}`
                : `${home.ticker} \u00b7 ${home.ticker}`
              : "CHECKING THE DEPOT",
            "1:296": digits ? `${digits}KG` : "0KG",
          }}
        />
      </div>

      {/* --- Insufficient stock. Spec 17 requires this, and the prototype had
          no screen for it. Built from the stamp and pill already in the file. */}
      {shortfall !== null && shortfall !== undefined && (
        <div className="stack" style={{ marginTop: "var(--s-5)" }}>
          <div className="stamp-wrap">
            <Stamp>YOU ASKED FOR {kg}KG — {shortfall}KG LEFT</Stamp>
          </div>
          <Pill onClick={() => takeWhatsLeft(shortfall)}>TAKE {shortfall}KG</Pill>
          <Pill variant="ghost" onClick={() => { setDigits(""); setOrderError(null); }}>
            CANCEL
          </Pill>
        </div>
      )}

      {orderError && shortfall === null && !sheetOpen && (
        <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
          <Stamp>{orderError.message}</Stamp>
        </div>
      )}

      <div className="spacer" />

      <Link to="/shop" style={{
        display: "block", textAlign: "center", color: "var(--blue-faint)",
        fontSize: "var(--t-body)", textDecoration: "none", padding: "var(--s-5) 0",
      }}>
        SHOP FOR ACCESSORIES
      </Link>

      {/* No U2Mark here: the HOME frame (above) already draws Figma's own
          watermark near the bottom, unconditionally — the old code showed a
          second one only for a guest, which duplicated it once signed out. */}

      {/* --- Payment sheet ------------------------------------------------- */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} label="Payment options">
        <Segmented
          label="How you want it"
          value={fulfillment}
          onChange={(v) => { setFulfillment(v); setMethod(null); }}
          options={[
            { value: "pickup", label: "WALK-IN" },
            { value: "delivery", label: "DELIVERY" },
          ]}
        />

        {fulfillment === "delivery" && zoneError && (
          <div className="stamp-wrap" style={{ marginTop: "var(--s-4)" }}>
            <Stamp>{zoneError}</Stamp>
          </div>
        )}

        {fulfillment === "delivery" && (
          <div style={{ marginTop: "var(--s-5)" }}>
            <AddressPicker
              line={address}
              zoneId={zoneId}
              zones={zones}
              error={fieldErrors.address}
              onChange={(next) => {
                setAddress(next.line);
                setZoneId(next.zoneId);
                setSaveAddr({ save: next.save, label: next.label });
              }}
            />
          </div>
        )}

        {!session && (
          <div className="stack is-tight" style={{ marginTop: "var(--s-5)" }}>
            <p className="label">SO WE CAN REACH YOU</p>
            <Input placeholder="YOUR NAME" value={guestName}
                   onChange={(e) => setGuestName(e.target.value)}
                   error={fieldErrors.guest_name} />
            <Input placeholder="PHONE NUMBER" type="tel" value={guestPhone}
                   onChange={(e) => setGuestPhone(e.target.value)}
                   error={fieldErrors.guest_phone} />
          </div>
        )}

        <div style={{ margin: "var(--s-6) 0 var(--s-4)" }}>
          <div className="row"><span>{kg}KG</span><b>{money(gasKobo)}</b></div>
          {fulfillment === "delivery" && (
            <div className="row"><span>DELIVERY</span><b>{money(feeKobo)}</b></div>
          )}
          <div className="row is-total"><span>TOTAL</span><b>{money(gasKobo + feeKobo)}</b></div>
        </div>

        <p className="label">PAYMENT OPTIONS</p>
        <div className="chips" style={{ margin: "var(--s-4) 0" }}>
          <Chip pressed={method === "bank_transfer"} onClick={() => setMethod("bank_transfer")}>
            BANK<br />TRANS
          </Chip>
          <Chip pressed={method === "opay"} onClick={() => setMethod("opay")}>OPAY</Chip>
          {fulfillment === "delivery" && (
            <Chip pressed={method === "card"} onClick={() => setMethod("card")}>CARD</Chip>
          )}
        </div>

        {/* Pay-at-depot is pickup only — nobody is paying the driver cash for
            an order the depot already reserved. */}
        {fulfillment === "pickup" && (
          <>
            <p className="label" style={{ margin: "var(--s-3) 0" }}>OR</p>
            <div className="chips">
              <Chip pressed={method === "depot"} onClick={() => setMethod("depot")}>
                PAY IN THE DEPOT
              </Chip>
            </div>
          </>
        )}

        {orderError && (
          <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
            <Stamp>{orderError.message}</Stamp>
          </div>
        )}

        <div style={{ marginTop: "var(--s-6)" }}>
          <Pill onClick={placeOrder} disabled={!method || submitting}>
            {submitting ? "HOLD ON" : method === "depot" ? "RESERVE MY GAS" : "CONTINUE TO PAY"}
          </Pill>
        </div>
      </Sheet>
    </div>
  );
}
