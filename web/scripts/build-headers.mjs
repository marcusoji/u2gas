/**
 * Compose `out/_headers` for Cloudflare Pages after `next build`.
 *
 * The Worker's security headers never reach a Pages response — Pages serves the
 * static export directly — so the CSP, HSTS and Referrer-Policy have to ship as
 * a `_headers` file alongside the assets. `_headers.template` holds them with an
 * `{{API_ORIGIN}}` placeholder; this fills it from the same values the app was
 * built with, so the CSP's `connect-src` cannot drift from the URL the bundle
 * actually calls.
 *
 * A guest token lives in the receipt URL (`/orders/verify?t=…`), which is why
 * Referrer-Policy is `no-referrer` and `/orders/*` is `no-store`. A build that
 * contacts the API with no origin to name is refused: an empty `connect-src`
 * would either block the API or, if widened to `*`, defeat the point.
 *
 * Next inlines `process.env.NEXT_PUBLIC_*` at build time, so a deployed build
 * reads them from `.env.production` (loaded by Next) rather than from the shell.
 * This script reads the same files, in the same order Next does, so it sees the
 * values that were compiled in.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** Minimal dotenv: `KEY=value`, `#` comments, optional surrounding quotes. */
function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

// Later files win, matching Next: .env < .env.production, with .env.local only
// in development. A `next build` runs this as a separate process with NODE_ENV
// unset, so keying `.env.local` on `=== "development"` (not `!== "production"`)
// keeps the build from reading a dev file whose empty origin would overwrite the
// production one. Only the names this script needs are read.
const fileEnv = {
  ...readEnvFile(join(root, ".env")),
  ...readEnvFile(join(root, ".env.production")),
};
if (process.env.NODE_ENV === "development") {
  Object.assign(fileEnv, readEnvFile(join(root, ".env.local")));
}
const read = (key) => process.env[key] ?? fileEnv[key] ?? "";

const embedded = read("NEXT_PUBLIC_EMBEDDED_API") === "true";
const origin = read("NEXT_PUBLIC_API_ORIGIN").replace(/\/$/, "");

if (!embedded && !origin) {
  console.error(
    "build-headers: NEXT_PUBLIC_API_ORIGIN is unset for a non-embedded build.\n" +
      "The CSP names the API origin explicitly; set it (see .env.production.example)\n" +
      "or build with NEXT_PUBLIC_EMBEDDED_API=true to contact no API.",
  );
  process.exit(1);
}

const template = readFileSync(join(here, "_headers.template"), "utf8");
// An embedded build contacts no API, so `connect-src` stays 'self'.
const headers = template.replaceAll("{{API_ORIGIN}}", embedded ? "" : origin);

const outDir = join(root, "out");
if (!existsSync(outDir)) {
  console.error("build-headers: web/out does not exist — run `next build` first.");
  process.exit(1);
}
writeFileSync(join(outDir, "_headers"), headers);

console.log(
  `build-headers: wrote out/_headers (connect-src ${embedded ? "'self'" : origin}).`,
);
