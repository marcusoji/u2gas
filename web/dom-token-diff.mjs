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
  { route: "/", role: "auth" },                             // LOG IN 1
  { route: "/home", role: "customer" },
  { route: "/home?kg=9999", role: "customer" },             // 1:175 over stock
  { route: "/home?pay=walkin", role: "customer" },          // 1:1344 pay sheet
  { route: "/home?pay=delivery", role: "customer" },        // 1:326 pay sheet
  { route: "/home?pay=summary", role: "customer" },         // 1:583 order summary
  { route: "/shop", role: "customer" },
  { route: "/shop/product/pr-cylinder", role: "customer" },
  { route: "/shop/product/pr-hose", role: "customer" },
  { route: "/shop/product/pr-regulator", role: "customer" },
  { route: "/shop/product/pr-clamp", role: "customer" },   // out of stock -> unavailable state
  { route: "/shop/product/pr-battery", role: "customer" },
  { route: "/shop/product/pr-burner", role: "customer" },
  { route: "/shop/bundle/bu-combo", role: "customer" },     // bundle uses the same 1:1462 frame
  { route: "/cart", role: "customer" },                     // empty cart
  { route: "/cart?add=pr-hose", role: "customer" },         // filled cart
  { route: "/checkout", role: "customer" },                 // 1:1703 walk-in sheet
  { route: "/checkout?add=pr-hose", role: "customer" },     // 1:1952 no address yet
  { route: "/orders/o-unpaid", role: "customer" },
  { route: "/orders/o-paid", role: "customer" },
  { route: "/orders/o-delivery", role: "customer" },
  { route: "/orders/o-expired", role: "customer" },
  { route: "/orders/verify", role: "customer" },            // 1:502 while a verification fails
  { route: "/history", role: "customer" },
  { route: "/profile", role: "customer" },
  { route: "/profile/details", role: "customer" },
  { route: "/auth/login", role: "auth" },
  { route: "/staff", role: "staff" },
  { route: "/staff/walk-in", role: "staff" },
  { route: "/staff/collect/o-paid", role: "staff" },
  { route: "/staff/notifs", role: "staff" },
  { route: "/staff/notifs?state=completed", role: "staff" },
  { route: "/staff/notifs?state=expanded", role: "staff" },
  { route: "/staff/me", role: "staff" },
  { route: "/driver", role: "driver" },
  { route: "/driver/drops/dl-2", role: "driver" },
  { route: "/driver/scan", role: "driver" },
  { route: "/driver/me", role: "driver" },
  { route: "/admin", role: "admin" },
  { route: "/admin?layout=blueprint", role: "admin" },
  { route: "/admin/tank", role: "admin" },
  { route: "/admin/tank/update", role: "admin" },
  { route: "/admin/tank/history", role: "admin" },
  { route: "/admin/notifs", role: "admin" },
  { route: "/admin/notifs?state=expanded", role: "admin" },
  { route: "/admin/people", role: "admin" },
  { route: "/admin/people?state=add", role: "admin" },        // 1:2686 ADD STAFF
  { route: "/admin/people?layout=1", role: "admin" },         // 1:2624 STAFF LAYOUT 1
  { route: "/admin/staff/d-1/history", role: "admin" },
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
  const leafByRoot = {};
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
        // The element's own direct text, excluding descendants. A stale sample
        // can sit on a container too: /driver's third drop row has no data-node
        // of its own, so its order number is direct text on a plain div. Using
        // `text` there would match the whole row and every order number on the
        // screen at once, so own text is what the stale check needs.
        ownText: [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join(" ").replace(/\s+/g, " ").trim(),
      };
      out.push(entry);
    }
    // Text that lives outside every `[data-node]`. The driver's drop rows are
    // plain `<p>` with no id, so an unbound row was invisible to the walk above:
    // it compared nothing, and the screen kept Figma's sample order number and
    // address while still reporting clean. `leafTexts` is every leaf string in
    // document order, tagged with whether an id covers it, so the two sides can
    // be paired positionally.
    const leafTexts = [];
    for (const el of root.querySelectorAll("*")) {
      // A drawn row is `<p>U2-100045<br>19 Bode Thomas · 12KG</p>`: the `<br>`
      // is an element child, so a plain "no children" test skipped exactly the
      // nodes this check exists for. Only `<br>` children are tolerated; any
      // real child means the text belongs to a nested block.
      if ([...el.children].some((c) => c.tagName !== "BR")) continue;
      // Lines are split on the drawn `<br>` rather than joined, so the app's
      // single `<p>` yields "U2-100045" and "19 Bode Thomas · 12KG" as two
      // strings — the same two the reference draws as sibling `<p>`s. Joining
      // instead would produce "U2-10004519 Bode…", which no order-number or
      // address pattern can recognise, so the leak would go unreported.
      const lines = [];
      let cur = "";
      for (const n of el.childNodes) {
        if (n.nodeType === 1 && n.tagName === "BR") {
          if (cur.trim()) lines.push(cur.trim());
          cur = "";
        } else {
          cur += n.textContent || "";
        }
      }
      if (cur.trim()) lines.push(cur.trim());
      for (const line of lines) {
        const t = line.replace(/\s+/g, " ").trim();
        if (!t) continue;
        // The artboard root is itself `[data-node]`, so `closest` always finds
        // something; only an intermediate id means a drawn sub-node covers it.
        const covered = el.hasAttribute("data-node")
          || (el.closest("[data-node]") && el.closest("[data-node]") !== root);
        leafTexts.push({ t, orphan: !covered });
      }
    }
    leafByRoot[rootNode] = leafTexts;
  }
  return { nodes: out, leafByRoot };
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
const STATE_TOGGLED = new Set([
  // the walk-in confirmation sheet, drawn over the panel and revealed on PAY
  "1:4643",
  // 1:1517's ITEM UNAVAILABLE stamp. It is drawn on the board but is a state,
  // not copy: the route shows it only once the server refuses a line, so at
  // rest it is hidden and the box cannot be compared.
  "1:1589", "1:1590",
]);

// TRANS HISTORY (`1:2107`) draws its content as samples: two receipts
// (`1:2134`, `1:2170`), a status strip (`1:2199`, with label `1:2200` and slot
// `1:2201`) and a month strip (`1:2115`) whose chips are `JAN..SEP`. The row
// text leaves carry no `data-node` id at all, so nothing can bind over them and
// a real user would read Figma's example order — the drawn sample would simply
// stay on screen. The route paints the person's own months and receipts at the
// same coordinates and hides these, which makes them the row template's source
// rather than content. Same deal as the walk-in sheet: the boxes are not
// comparable, the structure and tokens still are.
const TEMPLATE_ROWS_HIDDEN = new Set([
  // the sample receipts and the status strip
  "1:2134", "1:2170", "1:2199", "1:2200", "1:2201",
  // the sample month strip (1:2115) and its nine chips
  "1:2115", "1:2116", "1:2118", "1:2120", "1:2122", "1:2124",
  "1:2126", "1:2128", "1:2130", "1:2132",
]);

// The artboards are Figma's *frozen example* of each screen — the gallery
// literally contains `U2-100031`, `17 MAR` and `[ Caleb ]`. Those are sample
// values, not copy: a real user must never see them. A node whose live text is
// byte-identical to the reference sample *and* looks like volatile data was
// simply never bound, which is a wrong-value bug the geometry check cannot see
// (the box still matches, because the drawn text is still there).
const SAMPLE_PATTERNS = [
  [/\bU2-\d{4,}\b/, "order number"],
  [/\b\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/, "date"],
  [/\[\s*[A-Za-z][A-Za-z .'-]{2,20}\s*\]/, "bracketed name"],
  [/\b\d+\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Street|Road|Avenue|Close|Crescent)\b/, "street address"],
  [/\b0\d{3}\s?\d{3}\s?\d{4}\b/, "phone number"],
];
function sampleKind(text) {
  for (const [re, kind] of SAMPLE_PATTERNS) if (re.test(text)) return kind;
  return null;
}

function index(list) {
  const map = new Map();
  for (const e of list) {
    const k = `${e.root}|${e.key}`;
    if (!map.has(k)) map.set(k, e);
  }
  return map;
}

function compare(refList, appList, label, report, live, stale) {
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
    const toggled = STATE_TOGGLED.has(e.id) || TEMPLATE_ROWS_HIDDEN.has(e.id);
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
    // Declaring a template row above must not become a way to skip it: if the
    // route stops hiding it, the drawn sample is on screen and that has to fail.
    // `1:4643` is excluded — it is a real state the route reveals on PAY.
    if (TEMPLATE_ROWS_HIDDEN.has(e.id) && (a.w > 0 || a.h > 0)) {
      report.push({
        artboard, node: e.id, kind: "template-row-visible",
        detail: `the drawn sample row is on screen (${a.w}×${a.h}) — the route must hide it and paint live rows instead`,
      });
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
    } else {
      // Text is unchanged, so whatever the file drew is still on screen. If
      // that text is volatile sample data, no route ever bound it. A leaf is
      // checked on its whole text; a container only on its own direct text, so
      // a sample sitting on a wrapper without a data-node is still caught
      // without matching the whole subtree.
      const probe = e.kids === 0 ? e.text : (e.ownText ?? "");
      const kind = sampleKind(probe);
      if (kind && !e.animating) {
        stale.push({ artboard, node: e.id || e.key, kind: "stale-sample-data",
          detail: `still shows the file's sample ${kind}: «${e.text}»` });
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
// Every leaf string the reference draws, in document order, with a flag for
// whether a `[data-node]` covers it. The app side is paired against this
// positionally: an app leaf that no id covers, sitting at the same index as a
// reference leaf that no id covers, and still carrying the reference's text, is
// text the route never bound.
const refLeafByRoot = new Map();
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=1"],
});

const report = [];
const live = [];
const stale = [];
/** Registry route -> the artboards it is supposed to render, keyed by shape. */
const REGISTRY_ARTBOARD_ROUTES = new Map();
/** Target routes whose artboard did not render in this state. */
const noArtboardStates = [];
/** Registry shapes that did render an artboard somewhere. */
const renderedShapes = new Set();

/** Fold a concrete route to the registry's `:id` shape. */
const targetShape = (route) => route.split("?")[0]
  .replace(/^\/shop\/[^/]+\/[^/]+$/, "/shop/:id/:id")
  .replace(/^\/admin\/staff\/[^/]+\//, "/admin/staff/:id/")
  .replace(/\/(pr-[a-z]+|o-[a-z]+|dl-\d+|bu-[a-z]+)\b/g, "/:id");

if (refOnly) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
  const { nodes: all } = await snap(page, REF);
  fs.writeFileSync("/tmp/ref-tokens.json", JSON.stringify(all, null, 1));
  console.log(`reference nodes: ${all.length}`);
  await browser.close();
  process.exit(0);
}

// Index the reference once, keyed by artboard root node. The reference's own
// orphan text is kept too: a sample string that appears verbatim on the app
// side outside every `[data-node]` is text no route bound.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on("request", (r) =>
    /googleusercontent\.com|drive\.google\.com/.test(r.url()) ? r.abort() : r.continue());
  const { nodes: all, leafByRoot } = await snap(page, REF);
  for (const e of all) {
    if (!refByRoot.has(e.root)) refByRoot.set(e.root, []);
    refByRoot.get(e.root).push(e);
  }
  for (const [root, leaves] of Object.entries(leafByRoot)) {
    refLeafByRoot.set(root, leaves);
  }
  console.log(`reference artboards: ${refByRoot.size}  nodes: ${all.length}`);
  await page.close();
}

const targets = wanted.length ? TARGETS.filter((t) => wanted.includes(t.route)) : TARGETS;

// Coverage guard. The run used to print "STRUCTURAL + TOKEN PARITY: CLEAN"
// having compared only the routes someone remembered to list here, so a screen
// that rendered the wrong artboard, or an artboard added to the registry and
// never checked, read as a pass. The registry in src/figma/routeRegistry.ts is
// the source of truth for which routes carry an artboard; every one of them
// must be in TARGETS or this fails before it can claim a clean run.
{
  const reg = fs.readFileSync(path.join(ROOT, "web/src/figma/routeRegistry.ts"), "utf8");
  const entries = [...reg.matchAll(
    /\{\s*route:\s*"([^"]+)",\s*role:\s*"([^"]+)",\s*artboards:\s*\[([^\]]*)\]/g)];
  const misses = [];
  for (const [, route, role, boards] of entries) {
    if (!boards.trim()) continue;                 // route draws no artboard
    // Keyed by shape so a concrete target route (/orders/o-unpaid) can find its
    // registry pattern (/orders/:id).
    REGISTRY_ARTBOARD_ROUTES.set(route.replace(/:[A-Za-z]+/g, ":id"), boards.trim());
    // TARGETS uses concrete ids for :id routes; match on the shape.
    const shape = route.replace(/:[A-Za-z]+/g, ":id");
    const hit = TARGETS.some((t) => targetShape(t.route) === shape && t.role === role);
    if (!hit) misses.push(`${route} (${role})`);
  }
  if (misses.length) {
    console.log("COVERAGE FAIL — registry routes with artboards that TARGETS never checks:");
    for (const m of misses) console.log(`  ✗ ${m}`);
    console.log("Add them to TARGETS in dom-token-diff.mjs so a clean run means all of them.");
    process.exit(1);
  }
  console.log(`coverage: all ${entries.filter((e) => e[3].trim()).length} artboard routes in the registry are in TARGETS`);
}

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
  let appLeaves = {};
  try {
    ({ nodes: appList, leafByRoot: appLeaves } = await snap(page, url, 600));
  } catch (e) {
    report.push({ artboard: t.route, node: "-", kind: "load", detail: e.message });
    continue;
  }
  // Text the per-node walk cannot see: leaves no `[data-node]` covers. The two
  // sides are paired positionally, and a pair counts as unbound only when the
  // app still shows the reference's exact string. Matching on text alone is not
  // enough — the first active drop's live order number really is `U2-100045`,
  // which the file also draws in its third row — and pairing by index is what
  // keeps that legitimate value from being reported as a stale sample.
  for (const [root, refLeaves] of refLeafByRoot) {
    const appLeavesForRoot = appLeaves[root];
    if (!appLeavesForRoot) continue;
    const n = Math.min(refLeaves.length, appLeavesForRoot.length);
    for (let i = 0; i < n; i++) {
      const ref = refLeaves[i];
      const app = appLeavesForRoot[i];
      if (!ref.orphan || !app.orphan) continue;
      if (ref.t !== app.t) continue;
      if (!sampleKind(ref.t)) continue;
      stale.push({ artboard: t.route, node: `(no data-node in ${root})`,
        kind: "stale-sample-data", detail: `still shows the file's sample text: «${ref.t}»` });
    }
  }
  const roots = [...new Set(appList.map((e) => e.root))].filter(Boolean);
  if (!roots.length) {
    // A route can be mapped to an artboard and still render a functional screen
    // in one state: /orders/:id draws 1:762 once paid but the unpaid and expired
    // states have no artboard. That is a legitimate per-state choice, so an
    // individual skip is only recorded. What must never happen is a registry
    // route where *no* state renders its artboard — that is a missing screen,
    // and it is failed after the loop.
    const mapped = REGISTRY_ARTBOARD_ROUTES.get(targetShape(t.route));
    if (mapped) noArtboardStates.push(`${t.route} (mapped to ${mapped})`);
    else console.log(`${t.route.padEnd(34)} no artboard (functional screen, none expected)`);
    continue;
  }
  renderedShapes.add(targetShape(t.route));
  for (const root of roots) {
    const refList = refByRoot.get(root);
    if (!refList) {
      report.push({ artboard: `${t.route} [${root}]`, node: root, kind: "unknown-artboard",
        detail: "app rendered an artboard that is not in the gallery" });
      continue;
    }
    compare(refList, appList.filter((e) => e.root === root), t.route, report, live, stale);
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
    "template-row-visible", "missing", "extra", "tag", "unknown-artboard", "load"];
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

// Sample data that was never bound is a wrong-value bug, not drawing drift:
// the geometry still matches because the file's own text is still on screen.
// It is printed separately and fails the run, because a real user seeing
// Figma's example order number is exactly the kind of error that reads as
// "the checks passed" while the screen is wrong.
if (stale.length) {
  console.log("\n" + "─".repeat(72));
  console.log(`STALE SAMPLE DATA (${stale.length} — the file's example values are still on screen):`);
  for (const r of stale.slice(0, 100)) {
    console.log(`  ✗ ${String(r.artboard).padEnd(12)} ${String(r.node).padEnd(10)} ${r.detail}`);
  }
  if (stale.length > 100) console.log(`  … and ${stale.length - 100} more`);
}

if (consoleErrors.length) {
  console.log(`\nconsole errors (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 20)) console.log("  " + e);
  process.exit(1);
}

// A registry route whose artboard never rendered in any checked state is a
// missing screen, not a pass. Routes that simply have a functional state
// alongside an artboard state are listed for visibility but do not fail.
// Only meaningful on a full run: a filtered run by definition checks a subset.
const missing = wanted.length ? []
  : [...REGISTRY_ARTBOARD_ROUTES.keys()].filter((s) => !renderedShapes.has(s));
if (noArtboardStates.length) {
  console.log("\n" + "─".repeat(72));
  console.log("FUNCTIONAL STATES OF ARTBOARD ROUTES (expected — no drawing in this state):");
  for (const s of noArtboardStates) console.log(`    ${s}`);
}
if (missing.length) {
  console.log("\n" + "─".repeat(72));
  console.log(`MISSING ARTBOARDS (${missing.length} — registry maps these routes to a drawing that never rendered):`);
  for (const s of missing) console.log(`  ✗ ${s} → ${REGISTRY_ARTBOARD_ROUTES.get(s)}`);
}

process.exit(report.length || stale.length || missing.length ? 1 : 0);
