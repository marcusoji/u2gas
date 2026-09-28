import { useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, newIdempotencyKey } from "../../lib/api";
import { Input, OptionalBack, Pill, Segmented, Sheet, Stamp } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * Walk-in order (spec 31). No account needed, but a phone number is — a walk-in
 * with no way to reach the customer is an order nobody can trace later.
 */
export default function WalkIn() {
  const nav = useNavigate();

  const [digits, setDigits] = useState("");
  const [sheet, setSheet] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const createKeyRef = useRef<string | null>(null);

  const fields = error?.fieldErrors ?? {};
  const kg = Number(digits || 0);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const key = createKeyRef.current ?? (createKeyRef.current = newIdempotencyKey());
      const { order } = await api.staff.walkIn({
        kg,
        lines: [],
        guest_name: name.trim(),
        guest_phone: phone.trim(),
        fulfillment,
      }, key);
      // Straight to the till. The customer is standing there.
      createKeyRef.current = null;
      nav(`/staff/collect/${order.order_id}`);
    } catch (e) {
      setError(e as ApiError);
      setBusy(false);
    }
  }

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    if (el.closest(".key.is-cancel")) { setDigits((v) => v.slice(0, -1)); return; }
    const key = el.closest<HTMLElement>(".key:not(.is-cancel):not(.is-pay)");
    if (key) {
      const d = key.textContent?.trim() ?? "";
      if (/^\d$/.test(d) && digits.length < 4 && !(d === "0" && digits === "")) setDigits((v) => v + d);
      return;
    }
    if (el.closest(".key.is-pay")) { if (kg > 0) setSheet(true); return; }
    // The drawing puts two controls in this row and the file labels them
    // differently: the blue pill says SCAN and opens the customer details,
    // and the white circle is drawn as "enter the code by hand" (1:4516). They
    // used to be wired to the same handler, so the counter had two buttons for
    // one act. The drawn labels are now honoured — SCAN confirms, the hand
    // types the amount directly for a bulk figure the keypad is slow to tap.
    if (el.closest('[data-node="1:4514"]')) { if (kg > 0) setSheet(true); return; }
    if (el.closest('[data-node="1:4516"]')) { setTyped(""); setTypeOpen(true); }
  }

  /** Commit a hand-typed amount, the same 4-digit ceiling the keypad enforces. */
  function commitTyped() {
    const d = typed.replace(/\D/g, "").slice(0, 4).replace(/^0+/, "");
    setDigits(d);
    setTypeOpen(false);
  }

  return (
    <div className="screen figma-route-scroll">
      <OptionalBack to="/staff" />
      <FigmaRouteFrame
        node="1:4466"
        // The LED readout's node carries no id, so the amount is bound by the
        // file's own drawn text. At rest it must read `0KG`, not Figma's sample
        // `1KG` — the old route left the sample on screen, so an empty keypad
        // still claimed 1kg and PAY would have reserved a kilogram nobody typed.
        textReplacements={{ "1KG": `${kg}KG` }}
        onClick={handleClick}
      >
      </FigmaRouteFrame>

      {/* The drawn hand (1:4516). The keypad stops at four digits and is slow
          for a bulk figure, so this types the amount straight in. It commits to
          the same readout the keypad drives — one amount, two ways to enter it,
          which is what the file's two controls actually mean. */}
      <Sheet open={typeOpen} onClose={() => setTypeOpen(false)} label="Type the amount">
        <p className="label">HOW MANY KILOGRAMMES</p>
        <div style={{ marginTop: "var(--s-4)" }}>
          <Input
            autoFocus
            type="number"
            inputMode="numeric"
            placeholder="KG"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitTyped(); }}
          />
        </div>
        <p className="label" style={{ marginTop: "var(--s-4)", lineHeight: 2 }}>
          UP TO FOUR DIGITS. THE READOUT UPDATES WHEN YOU CONFIRM.
        </p>
        <div style={{ marginTop: "var(--s-5)" }}>
          <Pill disabled={!typed.replace(/\D/g, "")} onClick={commitTyped}>
            USE THIS AMOUNT
          </Pill>
          <Pill variant="ghost" onClick={() => setTypeOpen(false)}>CANCEL</Pill>
        </div>
      </Sheet>

      <Sheet open={sheet} onClose={() => setSheet(false)} label="Walk-in details">
        <Segmented
          label="Pickup or delivery"
          value={fulfillment}
          onChange={setFulfillment}
          options={[
            { value: "pickup", label: "PICKUP" },
            { value: "delivery", label: "DELIVERY" },
          ]}
        />

        <div className="stack is-tight" style={{ marginTop: "var(--s-5)" }}>
          <p className="label">WHO IS THIS FOR</p>
          <Input placeholder="CUSTOMER NAME" value={name}
                 onChange={(e) => setName(e.target.value)}
                 error={fields.guest_name} />
          <Input placeholder="PHONE NUMBER" type="tel" value={phone}
                 onChange={(e) => setPhone(e.target.value)}
                 error={fields.guest_phone} />
        </div>

        {error && (
          <div className="stamp-wrap" style={{ marginTop: "var(--s-5)" }}>
            <Stamp>{error.message}</Stamp>
          </div>
        )}

        <div style={{ marginTop: "var(--s-6)" }}>
          <Pill onClick={create} disabled={busy || kg <= 0 || !name.trim() || !phone.trim()}>
            {busy ? "RESERVING" : `RESERVE ${kg}KG`}
          </Pill>
        </div>
      </Sheet>
    </div>
  );
}
