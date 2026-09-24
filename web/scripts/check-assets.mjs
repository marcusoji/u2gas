#!/usr/bin/env node
/**
 * Fail the build if a font or image referenced by the CSS is not on disk.
 *
 * Without this the app builds cleanly, deploys, and then 404s on every font
 * request — the page still renders, in a fallback face, and nobody notices
 * until someone looks at the network tab. (Item 1)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(root, "src/styles/tokens.css"), "utf8");

// Every url() the stylesheet asks for, as a path under public/.
const referenced = [...css.matchAll(/url\("(\/[^"]+)"\)/g)].map((m) => m[1]);

const missing = referenced.filter(
  (p) => !existsSync(resolve(root, "public", p.replace(/^\//, ""))),
);

// woff2 is listed first in every @font-face with woff as the fallback, so a
// missing woff2 is only a problem if the woff is missing too.
const fatal = missing.filter((p) => {
  if (!p.endsWith(".woff2")) return true;
  return missing.includes(p.replace(/\.woff2$/, ".woff"));
});

if (fatal.length) {
  console.error("\nFonts referenced by tokens.css are missing from public/:\n");
  for (const p of fatal) console.error(`  ${p}`);
  console.error(
    "\nThe licensed faces are not committed yet. Run:\n" +
    "    ./tools/fetch-fonts.sh\n" +
    "from the repository root, then commit the results.\n" +
    "See web/public/fonts/README.txt.\n");
  process.exit(1);
}

if (missing.length) {
  console.warn(
    `\n${missing.length} woff2 file(s) missing; the woff fallback will be used.`);
  console.warn("Converting to woff2 saves roughly 20%. See fonts/README.txt.\n");
}

console.log(`assets ok — ${referenced.length} references checked`);
