#!/usr/bin/env bash
# Deploy U2GAS to Cloudflare: the static app to Pages, the API to Workers.
#
#   bash scripts/deploy-cloudflare.sh
#
# Preconditions, checked below with a clear message rather than a traceback:
#   * `wrangler login` has been run, or CLOUDFLARE_API_TOKEN is exported.
#   * worker/wrangler.toml has no YOUR-DOMAIN / YOUR-KV-ID placeholders left.
#   * web/.env.production names the real API origin and Supabase project, or the
#     equivalent NEXT_PUBLIC_* variables are exported. A non-embedded build
#     without NEXT_PUBLIC_API_ORIGIN fails on purpose: the CSP names it.
#
# The Pages project is created (or updated) by `wrangler pages deploy`. Set
# PAGES_PROJECT to override the name; it defaults to the Worker name's prefix.
set -euo pipefail

cd "$(dirname "$0")/.."

PAGES_PROJECT="${PAGES_PROJECT:-u2gas}"
PAGES_BRANCH="${PAGES_BRANCH:-main}"

fail() { echo "deploy: $*" >&2; exit 1; }

# --- Preconditions ----------------------------------------------------------

command -v npx >/dev/null 2>&1 || fail "npx is required (Node.js 20+)"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -z "${CF_API_TOKEN:-}" ]; then
  if ! npx --yes wrangler whoami 2>/dev/null | grep -qiE "@|account"; then
    fail "not authenticated. Run 'wrangler login' or export CLOUDFLARE_API_TOKEN."
  fi
fi

if grep -nE "YOUR-DOMAIN|YOUR-KV-ID|YOUR-PRODUCTION-KV-ID" worker/wrangler.toml >/dev/null; then
  grep -nE "YOUR-DOMAIN|YOUR-KV-ID|YOUR-PRODUCTION-KV-ID" worker/wrangler.toml >&2
  fail "worker/wrangler.toml still has placeholders — fill them before deploying."
fi

if [ ! -f web/.env.production ] && [ -z "${NEXT_PUBLIC_API_ORIGIN:-}" ]; then
  fail "web/.env.production is missing and NEXT_PUBLIC_API_ORIGIN is unset.
     cp web/.env.example web/.env.production and fill it in (see docs/ENVIRONMENT.md)."
fi

# --- Build and deploy the API ----------------------------------------------

echo "==> Deploying Worker (env production)"
( cd worker && npm install --no-audit --no-fund && npx wrangler deploy --env production )

# --- Build and deploy the app ----------------------------------------------

echo "==> Building the static export"
( cd web && npm install --no-audit --no-fund && npm run build )

[ -f web/out/_headers ] || fail "web/out/_headers was not generated; check the build output."
[ -f web/out/index.html ] || fail "web/out/index.html is missing; the export did not produce a site."

echo "==> Deploying to Cloudflare Pages (project: $PAGES_PROJECT)"
npx --yes wrangler pages deploy web/out \
  --project-name "$PAGES_PROJECT" \
  --branch "$PAGES_BRANCH"

echo
echo "Done. Next, in the Cloudflare dashboard:"
echo "  * Pages project '$PAGES_PROJECT' → Custom domains → add the apex and www."
echo "  * DNS: CNAME @ and www → $PAGES_PROJECT.pages.dev, CNAME api → the Worker."
echo "  * SSL/TLS mode: Full (strict)."
echo "  * Verify with the checklist in docs/DEPLOYMENT.md section 7."
