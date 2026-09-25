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
    // Some generated Figma text nodes intentionally have no data-node id.
    // Replace only their literal text, never attributes or styles.
    //
    // The artboards are the gallery's markup, so a middle dot in a route's key
    // is `&middot;` in the file. Routes write the readable character, so the
    // file's named punctuation entities are decoded before searching. Without
    // this a key like "12 Awolowo Road, Ikoyi · 10KG" never matched, the file's
    // sample address stayed on screen, and the geometry check still passed
    // because the drawn text was still there.
    //
    // One left-to-right pass, not `split().join()` per key: a replacement value
    // that equals another key would otherwise be rewritten again by that key.
    // Binding three drop rows to U2-100045/6/39 against samples 042/044/045 used
    // to cascade, so the first and third rows both came out as the same order.
    // A single scan also means an inserted value is never re-matched.
    const entries = Object.entries(textReplacements ?? {}).filter(([k]) => k);
    if (entries.length) {
      const queues = new Map<string, string[]>();
      const cursor = new Map<string, number>();
      for (const [key, value] of entries) {
        queues.set(key, Array.isArray(value) ? [...value] : [value]);
        cursor.set(key, 0);
      }
      // Longest key first, so a key that is a prefix of another cannot win.
      const keys = entries.map(([k]) => k).sort((a, b) => b.length - a.length);
      const hay = decodeEntities(out);
      let result = "";
      let i = 0;
      while (i < hay.length) {
        let key: string | null = null;
        for (const k of keys) {
          if (hay.startsWith(k, i)) { key = k; break; }
        }
        if (!key) { result += hay[i]; i += 1; continue; }
        const q = queues.get(key)!;
        // A single value means "replace every occurrence"; a list is consumed
        // left-to-right so repeated samples can carry distinct live values, and
        // once it runs out the file's own text is left alone.
        const at = cursor.get(key)!;
        if (q.length === 1) {
          result += escapeText(q[0]);
        } else if (at < q.length) {
          result += escapeText(q[at]);
          cursor.set(key, at + 1);
        } else {
          result += hay.slice(i, i + key.length);
        }
        i += key.length;
      }
      out = result;
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

/**
 * Decode the named/numeric punctuation entities the gallery's markup uses, so a
 * route can key a replacement on the character a reader sees (`·`) rather than
 * the file's `&middot;`. Deliberately excludes `&lt;`, `&gt;` and `&amp;`: they
 * are structural, and decoding them would let a replacement value introduce a
 * tag or break an existing escape.
 */
const PUNCT_ENTITIES: Record<string, string> = {
  "&middot;": "·", "&times;": "×", "&mdash;": "—", "&ndash;": "–",
  "&ldquo;": "\u201c", "&rdquo;": "\u201d", "&lsquo;": "\u2018", "&rsquo;": "\u2019",
  "&hellip;": "…", "&nbsp;": "\u00a0", "&bull;": "•",
  "&#39;": "'", "&#8217;": "\u2019", "&#8220;": "\u201c", "&#8221;": "\u201d",
  "&#8211;": "–", "&#8212;": "—", "&#183;": "·", "&#215;": "×",
};
function decodeEntities(s: string): string {
  let out = s;
  for (const [entity, char] of Object.entries(PUNCT_ENTITIES)) {
    if (out.includes(entity)) out = out.split(entity).join(char);
  }
  return out;
}

function escapeAttribute(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}
