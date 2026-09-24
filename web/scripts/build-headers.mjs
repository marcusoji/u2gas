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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const template = resolve(root, "public/_headers.template");
const out = resolve(root, "dist/_headers");

if (!existsSync(template)) {
  console.error("public/_headers.template is missing");
  process.exit(1);
}

const apiOrigin = process.env.VITE_API_ORIGIN;

if (!apiOrigin) {
  console.error(
    "\nVITE_API_ORIGIN is not set.\n\n" +
    "The Content-Security-Policy names the API origin explicitly, so the\n" +
    "build cannot produce a correct _headers file without it.\n\n" +
    "Set it to your Worker's origin, for example:\n" +
    "  VITE_API_ORIGIN=https://api.example.com\n");
  process.exit(1);
}

if (!/^https?:\/\//.test(apiOrigin)) {
  console.error(`VITE_API_ORIGIN must be an absolute origin, got: ${apiOrigin}`);
  process.exit(1);
}

if (/YOUR-DOMAIN|\.example(\/|$)|REPLACE/i.test(apiOrigin)) {
  console.error(`VITE_API_ORIGIN still looks like a placeholder: ${apiOrigin}`);
  process.exit(1);
}

// http is fine for local preview, but shipping it would break the CSP on a
// site served over https.
if (apiOrigin.startsWith("http://") && process.env.NODE_ENV === "production") {
  console.error(`VITE_API_ORIGIN must use https in production, got: ${apiOrigin}`);
  process.exit(1);
}

const rendered = readFileSync(template, "utf8")
  .replaceAll("__API_ORIGIN__", apiOrigin.replace(/\/$/, ""));

if (rendered.includes("__API_ORIGIN__")) {
  console.error("substitution failed — __API_ORIGIN__ still present");
  process.exit(1);
}

writeFileSync(out, rendered);
console.log(`_headers written with API origin ${apiOrigin}`);
