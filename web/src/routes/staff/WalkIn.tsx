import { useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, newIdempotencyKey } from "../../lib/api";
import { Input, Pill, Segmented, Sheet, Stamp } from "../../components/primitives";
import { FigmaRouteFrame } from "../../figma/FigmaRouteFrame";

/**
 * Walk-in order (spec 31). No account needed, but a phone number is — a walk-in
 * with no way to reach the customer is an order nobody can trace later.
 */
export default function WalkIn() {
  const nav = useNavigate();

  const [digits, setDigits] = useState("");
  const [sheet, setSheet] = useState(false);
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
    if (el.closest(".key.is-pay") || el.closest('[data-node="1:4514"]')) {
      if (kg > 0) setSheet(true);
    }
    if (el.closest('[data-node="1:4516"]')) setSheet(true);
  }

  return (
    <div className="screen figma-route-scroll">
      <FigmaRouteFrame
        node="1:4466"
        onClick={handleClick}
      >
      </FigmaRouteFrame>
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
          <Pill onClick={create} disabled={busy || !name.trim() || !phone.trim()}>
            {busy ? "RESERVING" : `RESERVE ${kg}KG`}
          </Pill>
        </div>
      </Sheet>
    </div>
  );
}
