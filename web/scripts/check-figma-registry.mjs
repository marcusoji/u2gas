import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "src/figma/routeRegistry.ts");
const artboardsPath = path.join(root, "src/figma/artboards.ts");
const screensDir = path.join(root, "src/figma/screens");

const registry = fs.readFileSync(registryPath, "utf8");
const artboards = fs.readFileSync(artboardsPath, "utf8");
const screenFiles = new Set(fs.readdirSync(screensDir).map((f) => f.replace(/\.(ts|tsx|js|jsx)$/, "")));

const routeBlocks = [...registry.matchAll(/\{\s*route:\s*"([^"]+)"[\s\S]*?artboards:\s*\[([^\]]*)\][\s\S]*?\},/g)];
const refs = [];
for (const match of routeBlocks) {
  const route = match[1];
  for (const id of match[2].matchAll(/"([^"]+)"/g)) refs.push({ route, node: id[1] });
}

const failures = [];
for (const { route, node } of refs) {
  const escaped = node.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const artboardPattern = new RegExp(`\\"${escaped}\\"\\s*:\\s*\\{`);
  if (!artboardPattern.test(artboards)) failures.push(`${route}: ${node} is not registered in artboards.ts`);
}

// The registry must never reference the tiny FILE-only assets (icons/dividers).
const forbidden = new Set(["88:55", "1:500", "1:581", "1:4984", "1:4680", "1:4044", "1:2271"]);
for (const { route, node } of refs) {
  if (forbidden.has(node)) failures.push(`${route}: ${node} is a FILE/divider asset, not a screen artboard`);
}

if (failures.length) {
  console.error("Figma route registry check failed:");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

// The check above only proves each claimed artboard *exists*. It cannot tell a
// mapping the app honours from one that was written down and never wired up:
// `1:2107` and `1:1344` were listed for months while no route rendered them, so
// the registry read as complete coverage of screens that were simply absent.
// Require every claimed artboard to be named in the route code that would draw
// it — a route that selects a state at runtime names each candidate, so a
// literal is the honest signal. An entry that only exists on paper now fails.
const routeDir = path.join(root, "src/routes");
const routeSources = new Map();
for (const f of fs.readdirSync(routeDir, { recursive: true })) {
  const full = path.join(routeDir, f);
  if (!fs.statSync(full).isFile()) continue;
  if (!/\.(ts|tsx)$/.test(f)) continue;
  routeSources.set(f, fs.readFileSync(full, "utf8"));
}
routeSources.set("App.tsx", fs.readFileSync(path.join(root, "src/App.tsx"), "utf8"));

const unwired = [];
for (const { route, node } of refs) {
  const drawn = [...routeSources.values()].some((src) => src.includes(`"${node}"`));
  if (!drawn) unwired.push(`${route}: ${node} is claimed but no route renders it`);
}
if (unwired.length) {
  console.error("Figma route registry check failed — claimed artboards that no route draws:");
  for (const f of unwired) console.error(` - ${f}`);
  console.error("Remove the claim, or render the artboard. Do not leave it listed.");
  process.exit(1);
}

console.log(`Figma route registry OK: ${routeBlocks.length} routes, ${refs.length} visual mappings, all wired to a route.`);
