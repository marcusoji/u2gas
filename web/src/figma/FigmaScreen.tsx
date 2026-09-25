import { useMemo } from "react";
import { artboards, type FigmaArtboard } from "./artboards";
import "../styles/figma.css";

/**
 * Renders a Figma artboard exactly as the HTML screens render it.
 *
 * The markup is generated from docs/u2gas-batch*-exact.html, so the product and
 * the reference are the same drawing: correct one and both change. See
 * README.md in this folder, and scripts/check-figma-parity.sh.
 *
 * Live data is substituted by value, never by restyling — `values` replaces the
 * text of the element carrying that Figma node id and leaves every measurement,
 * colour and effect as the file draws it. Anything not supplied keeps the
 * designed placeholder, which is what the screens show.
 *
 *   <FigmaScreen node="1:251" values={{ "1:296": `${kg}KG` }} />
 */
export function FigmaScreen({
  node,
  values,
  images,
  textReplacements,
  className,
}: {
  node: string;
  values?: Record<string, string>;
  images?: Record<string, string>;
  /** Replace exact frozen Figma sample text where the source node has no data-node id. */
  textReplacements?: Record<string, string | string[]>;
  className?: string;
}) {
  const board: FigmaArtboard | undefined = artboards[node];

  const html = useMemo(() => {
    if (!board) return "";
    if (!values && !images && !textReplacements) return board.html;
    let out = board.html;
    for (const [id, text] of Object.entries(values ?? {})) {
      // Replace the text of a node that directly holds text — `<p …>OLD</p>`.
      // Requiring the node to be a text leaf (text immediately followed by its
      // own closing tag) matters: the file has nodes that *look* like a value
      // slot but are laid out as several styled spans (`1:2750` is
      // `<span>6</span><span>.5</span><span>4</span>`; `1:1460` wraps the
      // price). A looser pattern that matched the empty text before the first
      // child would silently *prepend* the live value to the drawn one —
      // "3" + "6.54" reads as "36.54" and "8 ITEMS" + "₦1,400" overflows the
      // LED. Those are drawings, not placeholders, so they are left alone.
      const re = new RegExp(
        `(<[a-z0-9]+\\b[^>]*data-node="${id}"[^>]*>)([^<]*)(</[a-z0-9]+>)`,
      );
      if (!re.test(out)) {
        // The node is absent, or it is a container rather than a text leaf.
        // Saying so is the difference between a wrong value and a silent one.
        console.warn(`[figma] value for ${id} was not applied — not a text node in the artboard`);
        continue;
      }
      out = out.replace(re, (_match: string, open: string, _old: string, close: string) =>
        `${open}${escapeText(text)}${close}`);
    }
    for (const [id, src] of Object.entries(images ?? {})) {
      // Pictures are the file's `.asset-img` spans; the picture itself lives in
      // the `--src` custom property, so a live image replaces the url() there.
      const re = new RegExp(`(data-node="${id}"[^>]*--src:url\\(')([^']*)('\\))`);
      out = out.replace(re, (_match, open, _old, close) => `${open}${escapeAttribute(src)}${close}`);
    }
    for (const [from, replacement] of Object.entries(textReplacements ?? {})) {
      // Some generated Figma text nodes intentionally have no data-node id.
      // Replace only their literal text, never attributes or styles. Arrays
      // are consumed left-to-right so repeated Figma sample strings can carry
      // distinct live values without changing the generated artboard itself.
      const replacements = Array.isArray(replacement) ? replacement : [replacement];
      if (replacements.length === 1) {
        out = out.split(from).join(escapeText(replacements[0]));
      } else {
        let offset = 0;
        let next = "";
        for (const value of replacements) {
          const index = out.indexOf(from, offset);
          if (index < 0) break;
          next += out.slice(offset, index) + escapeText(value);
          offset = index + from.length;
        }
        if (next) out = next + out.slice(offset);
      }
    }
    return out;
  }, [board, values, images, textReplacements]);

  if (!board) {
    if (import.meta.env.DEV) {
      console.warn(`FigmaScreen: no artboard for node ${node}`);
    }
    return null;
  }

  return (
    <div
      className={`frame${className ? ` ${className}` : ""}`}
      data-node={board.node}
      style={{ height: board.height }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Values come from our own API, but they land in markup — escape anyway. */
function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}
