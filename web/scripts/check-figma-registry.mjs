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

console.log(`Figma route registry OK: ${routeBlocks.length} routes, ${refs.length} visual mappings.`);
