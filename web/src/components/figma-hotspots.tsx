import { useEffect, useState, type RefObject } from "react";

export type Rect = [number, number, number, number];

/**
 * A control's box, measured from a node the artboard already draws.
 *
 * The file sizes its chips, buttons and tiles by hug/flex, so their boxes come
 * from the pixel font's advances and cannot be recomputed from Figma's numbers
 * without re-deriving them — the same trap that once put a back hotspot at an
 * artboard's nominal top-left instead of on the arrow. Measuring the rendered
 * node is exact, and it makes "the control sits on something drawn" true by
 * construction rather than by review.
 *
 * `host` is any element inside the frame; the lookup is scoped to the
 * enclosing `.figma-route-frame`.
 */
export function useDrawnBoxes(
  host: RefObject<HTMLElement | null>,
  ids: string[],
  version?: unknown,
): Record<string, Rect> {
  const [boxes, setBoxes] = useState<Record<string, Rect>>({});
  const key = ids.join("|");

  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      const frame = host.current?.closest(".figma-route-frame") as HTMLElement | null;
      if (!frame || cancelled) return;
      const fr = frame.getBoundingClientRect();
      const next: Record<string, Rect> = {};
      for (const id of key.split("|")) {
        if (!id) continue;
        const el = frame.querySelector<HTMLElement>(`[data-node="${id}"]`);
        if (!el) continue;
        const b = el.getBoundingClientRect();
        if (!b.width && !b.height) continue;
        next[id] = [b.x - fr.x, b.y - fr.y, b.width, b.height];
      }
      setBoxes(next);
    };
    measure();
    // The pixel faces change the drawn text's width, so the boxes are only
    // final once the fonts have settled. Measuring before that leaves the
    // hotspot on the artwork's fallback-font position.
    void document.fonts?.ready.then(measure).catch(() => {});
    return () => { cancelled = true; };
  }, [host, key, version]);

  return boxes;
}

/**
 * A transparent control over a drawn node. It carries an accessible name and
 * the click; it paints nothing, so the artwork stays the visual source of
 * truth. `is-on` only adds a focus/selected ring, which the drawing has no
 * state for.
 */
export function Hot({ box, label, onClick, disabled, pressed, tone = "plain" }: {
  box?: Rect;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  tone?: "plain" | "chip" | "tile" | "cta";
}) {
  if (!box) return null;
  const [x, y, w, h] = box;
  return (
    <button
      type="button"
      className={`figma-route-hit is-${tone}${pressed ? " is-on" : ""}`}
      aria-label={label}
      aria-pressed={tone === "chip" || tone === "tile" ? pressed : undefined}
      disabled={disabled}
      onClick={onClick}
      style={{ left: x, top: y, width: w, height: h }}
    />
  );
}
