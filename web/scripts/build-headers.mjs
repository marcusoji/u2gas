#!/usr/bin/env node
/**
 * Write web/out/_headers for Cloudflare Pages.
 *
 * The static export cannot serve headers itself, so the CSP — the one rule that
 * has to name the API origin explicitly — is composed here from the same
 * NEXT_PUBLIC_* values the app was built with, and merged into the template.
 * `connect-src` lists Supabase (auth, storage, PostgREST) and the Worker origin;
 * an embedded build (no Worker, no Supabase) gets `'self'` only, so a mock build
 * never ships a 127.0.0.1 directive.
 *
 * The build fails if a real (non-embedded) build has no API origin: without it
 * the browser would block every API call, and a silent 'self'-only CSP would
 * turn that into a mystery rather than an error.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const outDir = join(webRoot, "out");

/**
 * Next loads `.env*` for its own process but does not export those values to a
 * post-build script, and only inlines NEXT_PUBLIC_* into the bundle. Read the
 * same files here so the CSP is composed from exactly what the app was built
 * with. Real environment variables win, matching Next's precedence.
 */
function loadDotEnv() {
  for (const name of [".env.production", ".env.local", ".env"]) {
    const path = join(webRoot, name);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (key in process.env) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
loadDotEnv();

const embedded = process.env.NEXT_PUBLIC_EMBEDDED_API === "true";
const apiOrigin = (process.env.NEXT_PUBLIC_API_ORIGIN || "").replace(/\/$/, "");
const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "";
  } catch {
    return "";
  }
})();

if (!embedded && !apiOrigin) {
  console.error(
    "\n[headers] NEXT_PUBLIC_API_ORIGIN is unset. The CSP names the API origin\n" +
      "explicitly, so a non-embedded build cannot be shipped without it.\n" +
      "Set it in web/.env (see .env.example), or build with\n" +
      "NEXT_PUBLIC_EMBEDDED_API=true for an API-free preview.\n",
  );
  process.exit(1);
}

if (!existsSync(outDir)) {
  console.error(
    "[headers] web/out does not exist. Run this after `next build` " +
      "(the build script does).",
  );
  process.exit(1);
}

const connectSrc = [
  "'self'",
  ...(supabaseOrigin ? [supabaseOrigin, "https://*.supabase.co"] : []),
  ...(apiOrigin ? [apiOrigin] : []),
].join(" ");

const imgSrc = [
  "'self'",
  "data:",
  "blob:",
  ...(supabaseOrigin ? [supabaseOrigin, "https://*.supabase.co"] : []),
].join(" ");

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src ${imgSrc}`,
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const template = readFileSync(join(here, "_headers.template"), "utf8");
const headers = template.replaceAll("__CSP__", csp);
writeFileSync(join(outDir, "_headers"), headers);

console.log(
  embedded
    ? "[headers] wrote out/_headers (embedded: connect-src is 'self' only)"
    : `[headers] wrote out/_headers (API origin ${apiOrigin})`,
);
