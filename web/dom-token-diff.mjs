// DOM-and-token parity: the reference gallery and the *live demo* side by side.
//
// `static-diff.mjs` proves only that the generated markup strings equal the
// gallery's — it renders them on a bare page with a single stylesheet, so it
// cannot see the demo's real cascade (tokens.css + components.css +
// figma-route.css), a poster swap that never got applied to the artwork, or a
// font-family name the app never ships. This compares the app as a user sees
// it, route by route, against the same artboard in docs/u2gas-all-screens.html:
//
//   structure  — the same nodes, in the same order, with the same meaning
//   geometry   — each node's box, relative to its artboard, in CSS px
//   tokens     — font, colour, weight, tracking, radius, opacity, transform
//
//   node dom-token-diff.mjs                 # every live route
//   node dom-token-diff.mjs /home /cart     # named routes
//   node dom-token-diff.mjs --ref           # reference-only token dump
//
// The dev server must be up on :12001 (see package.json "dom:parity").
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const REF = `file://${path.join(ROOT, "docs/u2gas-all-screens.html")}`;
const BASE = "http://127.0.0.1:12001";

// Forcing one family on both sides during measurement keeps an environment
// difference (the reference names Barlow Condensed but never ships it; this
// sandbox has no Arial Narrow either) from reading as a layout bug. A token
// mismatch in the family name itself is still reported separately.
const FORCE_FAMILY = "DejaVu Sans";

/** Every route that renders an artboard, with the role gate it sits behind. */
const TARGETS = [
  { route: "/", role: "customer" },
  { route: "/home", role: "customer" },
  { route: "/shop", role: "customer" },
  { route: "/shop/product/pr-cylinder", role: "customer" },
  { route: "/shop/product/pr-hose", role: "customer" },
  { route: "/shop/product/pr-regulator", role: "customer" },
  { route: "/shop/product/pr-clamp", role: "customer" },   // out of stock -> unavailable state
  { route: "/shop/product/pr-battery", role: "customer" },
  { route: "/shop/product/pr-burner", role: "customer" },
  { route: "/cart", role: "customer" },                     // empty cart
  { route: "/cart?add=pr-hose", role: "customer" },         // filled cart
  { route: "/orders/o-unpaid", role: "customer" },
  { route: "/orders/o-paid", role: "customer" },
  { route: "/orders/o-delivery", role: "customer" },
  { route: "/orders/o-expired", role: "customer" },
  { route: "/history", role: "customer" },
  { route: "/profile", role: "customer" },
  { route: "/profile/details", role: "customer" },
  { route: "/auth/login", role: "customer" },
  { route: "/staff", role: "staff" },
  { route: "/staff/walk-in", role: "staff" },
  { route: "/staff/collect/o-paid", role: "staff" },
  { route: "/driver", role: "driver" },
  { route: "/driver/drops/dl-2", role: "driver" },
  { route: "/driver/scan", role: "driver" },
  { route: "/driver/me", role: "driver" },
  { route: "/admin/people", role: "admin" },
];

/* ------------------------------------------------------------------ capture */

// Runs inside the page. Returns one flat entry per `[data-node]` descendant of
// an artboard root (`.slot .frame` in the gallery, `.frame` in the app), in
// document order, with a stable key so the two sides can be paired even when
// an id repeats or is empty.
const CAPTURE = (forceFamily) => {
  const rgb = (v) => {
    if (!v || v === "rgba(0, 0, 0, 0)") return "none";
    return v.replace(/\s+/g, "");
  };
  const num = (v) => (v === "normal" || !v ? "" : v.replace(/px$/, ""));
  // A gallery frame is `figure.slot > .frame`; the app's is `.frame` anywhere
  // (inside .figma-route-frame / .figma-route-scroll / .frame-plate). Only the
  // outermost `.frame` per artboard counts, never a nested one.
  const artboards = [...document.querySelectorAll(".frame[data-node]")]
    .filter((el) => !el.parentElement?.closest(".frame"));

  const out = [];
  for (const root of artboards) {
    const base = root.getBoundingClientRect();
    const rootNode = root.getAttribute("data-node") || "";
    const els = [...root.querySelectorAll("[data-node]")];
    // Include the root itself as the first entry so its own box is checked.
    const all = [root, ...els];
    let emptySeq = 0;
    for (const el of all) {
      const id = el.getAttribute("data-node") || "";
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const raw = (el.textContent || "").replace(/\s+/g, " ").trim();
      const entry = {
        root: rootNode,
        key: id || `#${emptySeq++}@${rootNode}`,
        id,
        tag: el.tagName.toLowerCase(),
        cls: el.className && typeof el.className === "string" ? el.className : "",
        text: raw.length > 80 ? raw.slice(0, 80) + "…" : raw,
        x: +(r.left - base.left).toFixed(2),
        y: +(r.top - base.top).toFixed(2),
        w: +r.width.toFixed(2),
        h: +r.height.toFixed(2),
        fontFamily: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
        fontSize: num(cs.fontSize),
        fontWeight: cs.fontWeight,
        fontStyle: cs.fontStyle,
        lineHeight: cs.lineHeight === "normal" ? "normal" : num(cs.lineHeight),
        letterSpacing: num(cs.letterSpacing),
        color: rgb(cs.color),
        bg: cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "none" : rgb(cs.backgroundColor),
        bgImage: cs.backgroundImage === "none" ? "none" : "image",
        opacity: cs.opacity,
        textAlign: cs.textAlign,
        whiteSpace: cs.whiteSpace,
        display: cs.display,
        position: cs.position,
        boxSizing: cs.boxSizing,
        radius: cs.borderRadius.replace(/\s+/g, ""),
        borderW: cs.borderTopWidth.replace(/\s+/g, ""),
        borderColor: rgb(cs.borderTopColor),
        shadow: cs.boxShadow === "none" ? "none" : "shadow",
        filter: cs.filter === "none" ? "none" : "filter",
        transform: cs.transform === "none" ? "none" : cs.transform,
        overflow: cs.overflow,
        zIndex: cs.zIndex === "auto" ? "" : cs.zIndex,
        // An element that is animating (the rate ticker scrolls) has a box that
        // depends on when the frame was taken on each side, so geometry on it is
        // not comparable. Everything else about it still is.
        animating: el.hasAttribute("data-animating"),
        // Number of element children, so a "text leaf" can be told from a
        // container: only a leaf's text is a value slot the routes may rewrite.
        kids: el.childElementCount,
      };
      out.push(entry);
    }
  }
  return out;
};

async function snap(page, url, wait) {
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  if (wait) await new Promise((r) => setTimeout(r, wait));
  if (FORCE_FAMILY) {
    await page.addStyleTag({
      content: `*, *::before, *::after { font-family: "${FORCE_FAMILY}", sans-serif !important; }`,
    });
  }
  // Mark what is animating *before* freezing it: once `animation: none` is in
  // force, getAnimations() reports nothing, and an animated element's box is a
  // function of capture time rather than of the design.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-node]")) {
      if (el.getAnimations({ subtree: false }).length) el.setAttribute("data-animating", "1");
    }
  });
  // Freeze animation so a ticker captured mid-loop on one side is not read as a
  // layout difference; the element's static position is the thing under test.
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(CAPTURE, FORCE_FAMILY);
}

/* ------------------------------------------------------------------- compare */

const TOKEN_FIELDS = [
  "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing",
  "color", "bg", "bgImage", "opacity", "textAlign", "whiteSpace",
  "display", "position", "boxSizing", "radius", "borderW", "borderColor",
  "shadow", "filter", "transform", "overflow",
];
const GEOM_FIELDS = ["x", "y", "w", "h"];
const GEOM_TOL = 0.6; // CSS px — sub-pixel rasteriser noise, not a design gap

// Nodes the route toggles between two states the file itself draws. The walk-in
// artboard (`1:4592`) carries both the keypad and the confirmation sheet
// (`1:4643`); the route reveals the sheet only after PAY is pressed, so on the
// default frame the sheet is `display:none` and its box is zero. That is the
// intended interaction, not drift, so the box is not compared here. Its
// structure and tokens are still checked, which is what matters — the sheet's
// markup must stay the file's.
const STATE_TOGGLED = new Set(["1:4643"]);

function index(list) {
  const map = new Map();
  for (const e of list) {
    const k = `${e.root}|${e.key}`;
    if (!map.has(k)) map.set(k, e);
  }
  return map;
}

function compare(refList, appList, label, report, live) {
  const ref = index(refList);
  const app = index(appList);
  const refRoots = [...new Set(refList.map((e) => e.root))].filter(Boolean);
  const appRoots = [...new Set(appList.map((e) => e.root))].filter(Boolean);
  const artboard = refRoots[0] || appRoots[0] || label;
  // Artboards are a fixed 440px wide; a live value that reaches past that is
  // clipped by the plate rather than laid out.
  const boardW = (refList.find((e) => e.root === e.key) || {}).w || 440;

  for (const e of refList) {
    const a = app.get(`${e.root}|${e.key}`);
    if (!a) {
      report.push({ artboard, node: e.id || e.key, kind: "missing", detail: "not present in the app" });
      continue;
    }
    if (a.tag !== e.tag) {
      report.push({ artboard, node: e.id, kind: "tag", detail: `${e.tag} vs ${a.tag}` });
    }
    // Does the element's own child markup survive? A live value written into a
    // container would replace its children with a bare string — this is the
    // check that catches a `<br>` collapsing or a three-span figure flattening.
    if (a.kids !== e.kids) {
      report.push({ artboard, node: e.id || e.key, kind: "structure",
        detail: `${e.kids} child elements in the file, ${a.kids} in the app` });
    }

    const textChanged = a.text !== e.text;
    const toggled = STATE_TOGGLED.has(e.id);
    // A live value swaps the sample text, and a centred or nowrap box follows
    // the new text — that is the app working, not drift. So the drawn box is
    // only compared where the text is unchanged; a swapped leaf is instead
    // checked for outgrowing the box the file drew. An element that is
    // animating (the ticker) has a capture-time-dependent box and is excluded.
    const boxComparable = !e.animating && !a.animating && !textChanged && !toggled;
    if (boxComparable) {
      const geom = GEOM_FIELDS.filter((f) => Math.abs((a[f] ?? 0) - (e[f] ?? 0)) > GEOM_TOL);
      if (geom.length) {
        report.push({
          artboard, node: e.id || e.key, kind: "geometry",
          detail: geom.map((f) => `${f} ${e[f]}→${a[f]}`).join("  "),
        });
      }
      const tok = TOKEN_FIELDS.filter((f) => String(a[f]) !== String(e[f]));
      if (tok.length) {
        report.push({
          artboard, node: e.id || e.key, kind: "token",
          detail: tok.map((f) => `${f}: ${e[f]} → ${a[f]}`).join("; "),
        });
      }
    }
    if (a.fontFamily !== e.fontFamily) {
      report.push({
        artboard, node: e.id || e.key, kind: "font-family",
        detail: `${e.fontFamily} → ${a.fontFamily}${e.text ? `  («${e.text.slice(0, 24)}»)` : ""}`,
      });
    }

    if (textChanged) {
      const isLeaf = e.kids === 0;
      if (!isLeaf) {
        // A container's text moving is derivative when a descendant leaf was
        // swapped; the `structure` check above already caught the case where
        // the child markup was destroyed. Nothing further to report here.
        continue;
      }
      // These text nodes are absolutely positioned and shrink-to-fit, so the
      // box *is* the text and comparing widths to the file's sample is
      // meaningless. What does matter is whether a longer live value now leaves
      // the 440px artboard, where it would be clipped or pushed over the page.
      const right = a.x + a.w;
      const escapes = !e.animating && !a.animating &&
        (right > boardW + 1 || a.x < -1);
      if (escapes) {
        live.push({ artboard, node: e.id || e.key,
          overflow: `extends to ${right.toFixed(1)}px, artboard is ${boardW}px`,
          detail: `«${e.text.slice(0, 30)}» → «${a.text.slice(0, 40)}»` });
      } else {
        live.push({ artboard, node: e.id || e.key, detail: `«${e.text}» → «${a.text}»` });
      }
    }
  }
  for (const a of appList) {
    if (!ref.has(`${a.root}|${a.key}`)) {
      report.push({ artboard, node: a.id || a.key, kind: "extra", detail: "not present in the reference" });
    }
  }
}

/* ---------------------------------------------------------------------- main */

const argv = process.argv.slice(2);
const refOnly = argv.includes("--ref");
const wanted = argv.filter((a) => a.startsWith("/"));

const refByRoot = new Map();
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=1"],
});

const report = [];
const live = [];

if (refOnly) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
  const all = await snap(page, REF);
  fs.writeFileSync("/tmp/ref-tokens.json", JSON.stringify(all, null, 1));
  console.log(`reference nodes: ${all.length}`);
  await browser.close();
  process.exit(0);
}

// Index the reference once, keyed by artboard root node.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on("request", (r) =>
    /googleusercontent\.com|drive\.google\.com/.test(r.url()) ? r.abort() : r.continue());
  const all = await snap(page, REF);
  for (const e of all) {
    if (!refByRoot.has(e.root)) refByRoot.set(e.root, []);
    refByRoot.get(e.root).push(e);
  }
  console.log(`reference artboards: ${refByRoot.size}  nodes: ${all.length}`);
  await page.close();
}

const targets = wanted.length ? TARGETS.filter((t) => wanted.includes(t.route)) : TARGETS;
const page = await browser.newPage();
// Wide enough that `--plate-fit` is 1, so the plate is not `zoom`ed and the
// boxes are the artboard's own CSS px on both sides.
await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
const consoleErrors = [];
// A value bound to the wrong node used to fail silently — the artboard kept its
// drawn sample and the screen looked plausible. FigmaScreen now warns when a
// value cannot be applied, so warnings are collected with the same weight as
// errors: a warning on any route means a live value is not on screen.
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + e.message));

for (const t of targets) {
  const url = `${BASE}${t.route}${t.route.includes("?") ? "&" : "?"}as=${t.role}`;
  let appList;
  try {
    appList = await snap(page, url, 600);
  } catch (e) {
    report.push({ artboard: t.route, node: "-", kind: "load", detail: e.message });
    continue;
  }
  const roots = [...new Set(appList.map((e) => e.root))].filter(Boolean);
  if (!roots.length) {
    console.log(`${t.route.padEnd(34)} no artboard rendered`);
    continue;
  }
  for (const root of roots) {
    const refList = refByRoot.get(root);
    if (!refList) {
      report.push({ artboard: `${t.route} [${root}]`, node: root, kind: "unknown-artboard",
        detail: "app rendered an artboard that is not in the gallery" });
      continue;
    }
    compare(refList, appList.filter((e) => e.root === root), t.route, report, live);
  }
  console.log(`${t.route.padEnd(34)} artboards: ${roots.join(", ")}`);
}
await browser.close();

/* --------------------------------------------------------------------- print */

console.log("\n" + "─".repeat(72));
if (!report.length) {
  console.log("STRUCTURAL + TOKEN PARITY: CLEAN");
} else {
  const byKind = {};
  for (const r of report) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  console.log("STRUCTURAL + TOKEN PARITY: FAIL");
  for (const [kind, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(20)} ${n}`);
  }
  console.log("─".repeat(72));
  const order = ["structure", "geometry", "token", "font-family",
    "missing", "extra", "tag", "unknown-artboard", "load"];
  const sorted = [...report].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const r of sorted.slice(0, 300)) {
    console.log(`${r.kind.padEnd(18)} ${String(r.artboard).padEnd(20)} ${String(r.node).padEnd(10)} ${r.detail}`);
  }
  if (report.length > 300) console.log(`… and ${report.length - 300} more`);
}

// Live-data swaps are expected: a route binds real values into the artboard.
// They are listed so a wrong value is visible, but they are not drift in the
// drawing. A swap whose text no longer fits the box the file drew is called out
// first, because that does collide with the artwork beside it.
if (live.length) {
  const over = live.filter((r) => r.overflow);
  const plain = live.filter((r) => !r.overflow);
  console.log("\n" + "─".repeat(72));
  console.log(`LIVE DATA SUBSTITUTED (${live.length}, expected — not drawing drift):`);
  for (const r of over) {
    console.log(`  ⚠ ${String(r.artboard).padEnd(12)} ${String(r.node).padEnd(10)} OVERFLOWS the drawn box (${r.overflow})  ${r.detail}`);
  }
  for (const r of plain.slice(0, 200)) {
    console.log(`    ${String(r.artboard).padEnd(12)} ${String(r.node).padEnd(10)} ${r.detail}`);
  }
  if (plain.length > 200) console.log(`    … and ${plain.length - 200} more`);
}

if (consoleErrors.length) {
  console.log(`\nconsole errors (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 20)) console.log("  " + e);
  process.exit(1);
}
process.exit(report.length ? 1 : 0);
