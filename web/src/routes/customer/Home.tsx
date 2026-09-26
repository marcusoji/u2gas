import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, newIdempotencyKey, type HomePayload, type Zone } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { rememberGuestOrder } from "../../lib/guest";
import { AddressPicker, maybeSaveAddress } from "../../components/AddressPicker";
import { BackButton, ErrorState, Input, Pill, Sheet, Stamp, money } from "../../components/primitives";
import { GasPayPanel, methodShort } from "../../components/GasPayPanel";
import { FigmaScreen } from "../../figma/FigmaScreen";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

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
  const location = useLocation();
  const { session } = useAuth();

  const [home, setHome] = useState<HomePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const params = new URLSearchParams(location.search);
  const payParam = params.get("pay");
  // `kg` seeds the readout so a pay state can be deep-linked on its own; the
  // keypad sets the same value when a person types it.
  const kgParam = params.get("kg");

  const [digits, setDigits] = useState(
    kgParam && /^[0-9]{1,4}$/.test(kgParam) && kgParam !== "0" ? kgParam : "");

  /**
   * The terminal's three states, each of which the file draws separately:
   * `input` is HOME (1:251), `sheet` is 1:1344 WALK-IN or 1:326 DELIVERY, and
   * `summary` is 1:583, the confirmation whose `Continue to Pay` submits.
   */
  const [stage, setStage] = useState<"input" | "sheet" | "summary">(
    payParam === "walkin" || payParam === "delivery" ? "sheet"
      : payParam === "summary" ? "summary" : "input");
  const [addressOpen, setAddressOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState<Fulfillment>(
    payParam === "delivery" || payParam === "summary" ? "delivery" : "pickup");
  const [method, setMethod] = useState<Method | null>(
    payParam === "summary" ? "opay" : null);

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
    // A shortfall is refused on the terminal itself (1:175), so PAY does not
    // open the sheet — the amount has to come down first.
    if (looksShort) return;
    setOrderError(null);
    setStage("sheet");
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
      if (err.code === "INSUFFICIENT_GAS") { setStage("input"); load(); }
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

  if (loadError) {
    return (
      <div className="screen">
        <BackButton to="/" />
        <ErrorState message={loadError} onRetry={load} />
      </div>
    );
  }

  // The ticker is the file's one live string. When the depot cannot cover the
  // amount it carries the same warning HOME shows, so the reader sees the
  // ceiling beside the refusal instead of only the amount they asked for.
  const tickerText = home
    ? looksShort ? `ONLY ${home.available_kg}KG LEFT \u00b7 ${home.ticker}` : home.ticker
    : "CHECKING THE DEPOT";

  /* --- The payment sheet and the summary -------------------------------
     Each is a full artboard, so the route renders the one that draws the
     state rather than restyling a single panel: 1:1344 walk-in, 1:326
     delivery, 1:583 the summary. Everything live is bound into the drawn
     leaves — the ticker, the LED readout, the amount and the chosen method. */
  if (stage !== "input") {
    const payNode = stage === "summary" ? "1:583" : fulfillment === "pickup" ? "1:1344" : "1:326";
    const led = `${kg}KG`;
    const ticker = home?.ticker ?? "CHECKING THE DEPOT";
    const payValues: Record<string, string> =
      stage === "summary"
        ? { "1:589": ticker, "1:626": led, "1:664": `${kg}kg`,
            "1:667": money(gasKobo + feeKobo), "1:662": methodShort(method) }
        : fulfillment === "pickup"
          ? { "1:1350": ticker, "1:1389": led }
          : { "1:332": ticker, "1:371": led };

    return (
      <div className="screen">
        <FigmaRouteFrame node={payNode} values={payValues}>
          <GasPayPanel
            node={payNode}
            fulfillment={fulfillment}
            method={method}
            address={address}
            busy={submitting}
            error={orderError?.message ?? null}
            onFulfillment={(f) => { setFulfillment(f); setMethod(null); }}
            onMethod={(m) => { setMethod(m); setStage("summary"); }}
            onAddress={() => setAddressOpen(true)}
            onContinue={placeOrder}
            onBack={() => setStage(stage === "summary" ? "sheet" : "input")}
          />
        </FigmaRouteFrame>

        {/* The drawings have no address picker, so delivery's is a real sheet.
            `CONFIRM DELIVERY ADDRESS` (1:417) opens it. */}
        <Sheet open={addressOpen} onClose={() => setAddressOpen(false)} label="Delivery address">
          {zoneError && <p className="label" style={{ color: "#ff0303" }}>{zoneError}</p>}
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
          <div style={{ marginTop: "var(--s-5)" }}>
            <Pill onClick={() => setAddressOpen(false)}>USE THIS ADDRESS</Pill>
          </div>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="screen">
      {/* The terminal is the first screen a guest sees and the artboard draws no
          way off it, so the app adds one. It sits above the plate, in the empty
          band the design leaves between the frame top and the LED readout at
          y=101, rather than over any artwork. */}
      <BackButton to="/" />

      {/*
        figma 1:251 — the whole terminal (ticker, LED readout, keypad,
        receipt slot, watermark) as the file draws it. See
        web/src/figma/README.md and scripts/check-figma-parity.sh: this is
        the same markup docs/u2gas-batch1-exact.html carries for HOME, so the
        two cannot drift apart the way the hand-built version did.

        1:257 is the ticker text, 1:296 the LED readout — the only two spots
        with live data. Everything else is the file's own placement.

        The ticker is one message. It used to be written twice
        (`${ticker} · ${ticker}`), which is 570px of text in the 151px LED
        window — the rate scrolled past once and then repeated, which reads as a
        stutter, not a ticker. The file draws the string once.
      */}
      {/* The file draws a shortfall as its own board, 1:175 INSUFFICIENT GAS
          INPUT, in place of HOME — same terminal, the amount as typed, and
          `INSUFFICIENT- Please redude` beside it. It is an *input* state: the
          refusal belongs on the terminal, where the keypad that corrects it
          already is, not in a sheet reached by pressing PAY. The app used to
          substitute a stamp and a "TAKE nKG" pill of its own design; the
          drawing answers it, so the board is rendered and the file's keypad is
          what clears it. */}
      {looksShort && digits !== "" ? (
        <div className="frame-plate" onClick={onTerminalClick}>
          <FigmaScreen
            node="1:175"
            values={{ "1:181": tickerText, "1:220": `${digits}KG` }}
          />
        </div>
      ) : (
        <div className="frame-plate" onClick={onTerminalClick}>
          <FigmaScreen
            node="1:251"
            values={{ "1:257": tickerText, "1:296": digits ? `${digits}KG` : "0KG" }}
          />
        </div>
      )}

      {orderError && (
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

    </div>
  );
}
