#!/usr/bin/env node
/**
 * Build dist/_headers from public/_headers.template.
 *
 * The CSP has to name the API origin explicitly — `connect-src *` would defeat
 * the point — but that origin differs per environment, and Cloudflare Pages
 * serves _headers as a static file with no templating of its own.
 *
 * So it is substituted here, at build time, from VITE_API_ORIGIN. The build
 * fails if the variable is missing or still looks like a placeholder, which is
 * what stops a broken CSP reaching production. (Items 13, 14)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const template = resolve(root, "public/_headers.template");
const out = resolve(root, "dist/_headers");

if (!existsSync(template)) {
  console.error("public/_headers.template is missing");
  process.exit(1);
}

// Vite reads `.env*` for the bundle but this script is a plain node process, so
// a value that lives only in `.env` was invisible here. That is the whole
// deploy trap: `npm run build` compiled a bundle pointed at one origin and then
// failed for want of the same variable. Loading Vite's own env closes the gap —
// shell vars still win, so CI can override the file.
const env = { ...loadEnv(process.env.NODE_ENV ?? "production", root, "VITE_"), ...process.env };

const apiOrigin = env.VITE_API_ORIGIN;

// An embedded-API build talks to no API at all — `src/mocks/` answers every
// route in the browser — so there is no origin for the CSP to name. Failing
// the build here would make that local preview impossible to ship without
// inventing a URL that is never contacted. A real build still requires it.
const embeddedBuild = env.VITE_EMBEDDED_API === "true";

if (!apiOrigin && !embeddedBuild) {
  console.error(
    "\nVITE_API_ORIGIN is not set.\n\n" +
    "The Content-Security-Policy names the API origin explicitly, so the\n" +
    "build cannot produce a correct _headers file without it.\n\n" +
    "Set it to your Worker's origin, for example:\n" +
    "  VITE_API_ORIGIN=https://api.example.com\n\n" +
    "For an embedded-API build (VITE_EMBEDDED_API=true) no origin is needed.\n");
  process.exit(1);
}

const resolvedOrigin = apiOrigin ?? "";

if (resolvedOrigin && !/^https?:\/\//.test(resolvedOrigin)) {
  console.error(`VITE_API_ORIGIN must be an absolute origin, got: ${resolvedOrigin}`);
  process.exit(1);
}

if (resolvedOrigin && /YOUR-DOMAIN|\.example(\/|$)|REPLACE/i.test(resolvedOrigin)) {
  console.error(`VITE_API_ORIGIN still looks like a placeholder: ${resolvedOrigin}`);
  process.exit(1);
}

// http is fine for a local Worker, but shipping it would break the CSP on a
// site served over https. Localhost is exempt so a developer can build a real
// (non-mock) bundle against `wrangler dev` without reaching for a tunnel.
const isLocal = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(resolvedOrigin);
if (resolvedOrigin.startsWith("http://") && !isLocal && env.NODE_ENV === "production") {
  console.error(`VITE_API_ORIGIN must use https in production, got: ${resolvedOrigin}`);
  process.exit(1);
}

const rendered = readFileSync(template, "utf8")
  .replaceAll("__API_ORIGIN__", resolvedOrigin.replace(/\/$/, ""))
  // A mock build leaves the directive's separator behind, which would ship as
  // `connect-src ... supabase.co ; frame-ancestors`. Tidied so the header is
  // the same shape whether or not an origin was named.
  .replace(/ +;/g, ";");

if (rendered.includes("__API_ORIGIN__")) {
  console.error("substitution failed — __API_ORIGIN__ still present");
  process.exit(1);
}

writeFileSync(out, rendered);
console.log(
  resolvedOrigin
    ? `_headers written with API origin ${resolvedOrigin}`
    : "_headers written for a mock build — connect-src is 'self' only");
