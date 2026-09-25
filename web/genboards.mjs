// Writes every app artboard into one standalone page, with the app's real
// stylesheet, so a static render can be compared against the gallery without a
// route's live data on top. Markup is read out of the generated modules rather
// than re-imported, because Node cannot resolve their extensionless TS imports.
import fs from "node:fs";
import path from "node:path";

const dir = "src/figma";
const assets = {};
for (const m of fs.readFileSync(path.join(dir, "assets.ts"), "utf8")
  .matchAll(/export const (a\d+) = "([^"]*)";/g)) assets[m[1]] = m[2];

const css = fs.readFileSync("src/styles/figma.css", "utf8");
const frames = [];
for (const f of fs.readdirSync(path.join(dir, "screens")).sort()) {
  const src = fs.readFileSync(path.join(dir, "screens", f), "utf8");
  const node = src.match(/export const node = "([^"]+)";/)[1];
  const height = src.match(/export const height = (\d+);/)[1];
  const html = src.match(/export const html = `([\s\S]*)`;\s*$/)[1]
    .replace(/\$\{A\.(a\d+)\}/g, (_, id) => assets[id])
    .replace(/\\`/g, "`").replace(/\\\$\{/g, "${").replace(/\\\\/g, "\\");
  frames.push(`<div class="frame" data-node="${node}" style="height:${height}px">${html}</div>`);
}

fs.writeFileSync("public/__boards.html", `<!doctype html><html><head><meta charset="utf-8">
<style>${css}
body { margin: 0; background: #fff; }
.frame { margin: 0 0 24px; }
</style></head><body>
${frames.join("\n")}
</body></html>`);
console.log(`frames: ${frames.length} bytes: ${fs.statSync("public/__boards.html").size}`);
