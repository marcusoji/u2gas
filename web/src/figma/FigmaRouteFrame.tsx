import {
  useCallback, useLayoutEffect, useRef, useState, type ReactNode,
} from "react";
import { FigmaScreen } from "./FigmaScreen";
import { artboards } from "./artboards";
import "../styles/figma-route.css";

const FOOTER_GAP = 32;
/** Gap between the artwork's last item and any chrome the route hands us. */
const AFTER_GAP = 16;
/** The drawn footer: decoration and copyright, both anchored to the bottom. */
const FOOTER_SELECTOR = ".watermark, .copyright";

/**
 * Exact-Figma visual frame with a functional React layer above it.
 *
 * The Figma artwork is never restyled or rebuilt. Interactive/dynamic React
 * controls are supplied as children and positioned by the route itself.
 * This prevents the old CSS approximation from silently becoming the visual
 * source of truth again.
 *
 * The frame is cut to its content by default. A board is drawn on a fixed
 * plate (1924 or 1739 tall) with a decorative watermark and the copyright
 * pinned to its bottom edge, so a screen whose artwork ends early carried
 * hundreds of pixels of empty white before its own footer. Trimming keeps that
 * drawn footer block intact but pulls it up to sit `FOOTER_GAP` below the last
 * item, so a page ends a few inches after its content instead of at the plate's
 * full height. Growth is automatic: the measurement runs again whenever the
 * artwork is re-rendered, so a row added later pushes the footer down by exactly
 * that much. A route with app chrome that belongs *after* the artwork hands it
 * to `after` rather than stacking it below the frame, so nothing ever lands
 * under the U2 OIL AND GAS copyright.
 */
export function FigmaRouteFrame({
  node,
  values,
  images,
  textReplacements,
  children,
  onClick,
  className,
  after,
  trim = true,
}: {
  node: string;
  values?: Record<string, string>;
  images?: Record<string, string>;
  textReplacements?: Record<string, string | string[]>;
  children?: ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  className?: string;
  /** App chrome that belongs after the artwork but before the drawn footer. */
  after?: ReactNode;
  /** Cut the frame to its content. Boards that fill their frame are unaffected. */
  trim?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ h: number; top: number } | null>(null);
  const drawn = artboards[node]?.height;

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || !drawn) return;
    const frame = wrap.querySelector<HTMLElement>(":scope > .frame");
    if (!frame) return;
    // A couple of boards (LOG IN 2, SHOP SEARCH) place a node with
    // `top: calc(50% …)`, which is a percentage *of the frame's own height*.
    // Cutting such a plate would slide the node up the page, so those keep
    // their drawn height. The check reads the inline declaration, not the
    // computed style: `getComputedStyle` resolves `calc(50% …)` to px, which
    // would hide exactly the case being looked for.
    for (const el of Array.from(frame.querySelectorAll<HTMLElement>("*"))) {
      if (el.offsetParent !== frame) continue;
      const style = el.getAttribute("style") || "";
      if (/(?:^|;)\s*(?:top|bottom|height)\s*:[^;]*%/.test(style)) {
        setBox(null);
        return;
      }
    }
    // The plate is fitted to the viewport with a CSS `zoom`, so a bounding rect
    // is in device-scaled px while every drawn coordinate — and the height we
    // are about to set — is in the plate's own 440px-wide CSS px. Normalise
    // through the plate's width, which the file fixes at 440.
    const rect = frame.getBoundingClientRect();
    const scale = rect.width / 440 || 1;
    let bottom = 0;
    let footerBlock = 0;
    for (const el of Array.from(frame.children)) {
      const r = el.getBoundingClientRect();
      if (r.height < 4) continue;
      if (el.matches(FOOTER_SELECTOR)) {
        // Bottom-anchored, so this offset from the frame's foot is the same at
        // any height: it is the block the footer occupies, not the tail.
        footerBlock = Math.max(footerBlock, (rect.bottom - r.top) / scale);
        continue;
      }
      // Every artboard child is absolutely positioned from the frame's own
      // top-left, so a child's bottom is already a plate-local y.
      bottom = Math.max(bottom, (r.bottom - rect.top) / scale);
    }
    const chrome = wrap.querySelector<HTMLElement>("[data-route-after]");
    const chromeH = chrome ? chrome.getBoundingClientRect().height / scale : 0;
    const content = Math.ceil(bottom) + (chromeH ? AFTER_GAP + chromeH : 0);
    // Never taller than the drawing: a board that already fills its plate keeps
    // exactly the file's geometry, which is what the parity checks compare.
    const h = Math.max(0, Math.min(drawn, content + FOOTER_GAP + Math.ceil(footerBlock)));
    setBox((prev) => (prev && prev.h === h
      ? prev
      : { h, top: Math.ceil(bottom) + (chromeH ? AFTER_GAP : 0) }));
  }, [drawn]);

  useLayoutEffect(() => {
    if (!trim) { setBox(null); return; }
    measure();
    // Text metrics land once the webfonts resolve, which can move a block's
    // bottom by a few px. Re-measure so the cut is not taken mid-swap.
    let cancelled = false;
    document.fonts?.ready.then(() => { if (!cancelled) measure(); });
    return () => { cancelled = true; };
  }, [trim, measure, values, images, textReplacements, after]);

  return (
    <div ref={wrapRef} className={`figma-route-frame${className ? ` ${className}` : ""}`} onClick={onClick}>
      <FigmaScreen
        node={node}
        values={values}
        images={images}
        textReplacements={textReplacements}
        height={trim ? box?.h ?? null : null}
      />
      {children}
      {after != null && (box ? (
        <div
          data-route-after
          style={{ position: "absolute", left: 0, right: 0, zIndex: 25, top: box.top }}
        >
          {after}
        </div>
      ) : (
        // Trimming is off for this board, so its footer stays where the file
        // draws it. The chrome still belongs on the page, just in flow after
        // the whole plate rather than tucked above the drawn copyright.
        <div style={{ marginTop: 18 }}>{after}</div>
      ))}
    </div>
  );
}
