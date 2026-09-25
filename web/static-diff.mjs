// Renders the app's artboards verbatim, with no live data substituted, the way
// a route hands them to FigmaScreen before it swaps any text. Comparing this
// against the gallery isolates a CSS/layout leak from a deliberate data swap.
//
//   node genboards.mjs            # writes public/__boards.html from the modules
//   node static-diff.mjs [nodes]  # needs the dev server on :12001
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const NODES = process.argv[2] ? process.argv[2].split(",") : null;
const REF = `file://${path.join(ROOT, "docs/u2gas-all-screens.html")}`;
const BOARD = "http://127.0.0.1:12001/__boards.html";

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium", headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=1"],
});

const nodes = NODES
  || (fs.existsSync("/tmp/nodes.txt") && fs.readFileSync("/tmp/nodes.txt", "utf8").trim().split("\n"))
  || [...fs.readFileSync(new URL("src/figma/artboards.ts", import.meta.url), "utf8")
        .matchAll(/node: "([^"]+)"/g)].map((m) => m[1]);

async function shoot(url, node) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
  // The gallery swaps in live Google Drive photos once the network answers
  // (docs/figma-drive-images.py). The app ships the file's own embedded
  // fallback instead, so block Drive here: the comparison then measures the
  // drawing the app is supposed to reproduce, not whether Drive is reachable.
  await p.setRequestInterception(true);
  p.on("request", (r) => (/googleusercontent\.com|drive\.google\.com/.test(r.url()) ? r.abort() : r.continue()));
  await p.goto(url, { waitUntil: "networkidle0" });
  await p.evaluate(() => document.fonts.ready);
  // Disable animation outright: a paused ticker freezes at whatever time was
  // elapsed when the pause landed, so the reference and the app sit at different
  // points on the same loop and a phase difference reads as a layout bug. With
  // `animation: none` both render the element's own static position, which is
  // the thing parity is actually about.
  await p.addStyleTag({ content: "html, body { background: #fff !important; } .topbar { display: none !important; } *, *::before, *::after { animation: none !important; transition: none !important; }" });
  await new Promise((r) => setTimeout(r, 300));
  const el = await p.$(`[data-node="${node}"]`);
  if (!el) { await p.close(); return null; }
  // Element screenshots clip at the element's own rect, and those coordinates
  // are fractional (the gallery's scroll position, the app's `zoom`ed plate), so
  // Chromium resamples the clip differently on each side and two identical boxes
  // can rasterise a pixel apart. Pull the node out of flow to the viewport
  // origin: every child is absolutely positioned from the node's own top-left,
  // so internal layout is unaffected and the clip lands on whole device pixels.
  //
  // Both pages hold every artboard in normal flow, so taking one out of flow
  // lets its siblings slide up underneath it and bleed into the clip. Hide them
  // first — the shot must contain the artboard under test and nothing else.
  await p.evaluate((node) => {
    const el = document.querySelector(`[data-node="${node}"]`);
    const container = el.closest(".frame") || el;
    for (const other of document.querySelectorAll(".frame, .slot")) {
      if (other !== el && other !== container && !other.contains(el)) {
        other.style.setProperty("display", "none", "important");
      }
    }
    el.style.setProperty("position", "fixed", "important");
    el.style.setProperty("left", "0", "important");
    el.style.setProperty("top", "0", "important");
    el.style.setProperty("margin", "0", "important");
  }, node);
  await new Promise((r) => setTimeout(r, 120));
  const buf = Buffer.from(await el.screenshot());
  await p.close();
  return buf;
}

function decodePng(buf) {
  let pos = 8, w = 0, h = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    const row = raw.subarray(rp, rp + stride); rp += stride;
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, ch, data: out };
}

let worst = 0, worstNode = "";
for (const node of nodes) {
  const ref = await shoot(REF, node);
  const app = await shoot(BOARD, node);
  if (!ref || !app) { console.log(`${node.padEnd(8)} MISSING ref=${!!ref} app=${!!app}`); continue; }
  if (process.env.SAVE) { fs.writeFileSync(`/tmp/full-${node.replace(":", "_")}-ref.png`, ref); fs.writeFileSync(`/tmp/full-${node.replace(":", "_")}-app.png`, app); }
  const A = decodePng(ref), B = decodePng(app);
  if (A.w !== B.w || A.h !== B.h) { console.log(`${node.padEnd(8)} SIZE ${A.w}x${A.h} vs ${B.w}x${B.h}`); continue; }
  let diff = 0, maxd = 0;
  for (let i = 0; i < A.w * A.h; i++) {
    const d = Math.max(
      Math.abs(A.data[i * A.ch] - B.data[i * B.ch]),
      Math.abs(A.data[i * A.ch + 1] - B.data[i * B.ch + 1]),
      Math.abs(A.data[i * A.ch + 2] - B.data[i * B.ch + 2]));
    if (d > 12) diff++;
    if (d > maxd) maxd = d;
  }
  const pct = +(100 * diff / (A.w * A.h)).toFixed(2);
  if (pct > worst) { worst = pct; worstNode = node; }
  if (pct > 0.05) console.log(`${node.padEnd(8)} ${A.w}x${A.h}  differing ${pct}%  max delta ${maxd}`);
}
console.log(`\nartboards compared: ${nodes.length}  worst: ${worstNode} ${worst}%`);
await browser.close();
