#!/usr/bin/env bash
# Deploy U2GAS to Cloudflare: the app to Pages, the API to Workers.
#
#   bash scripts/deploy-cloudflare.sh
#
# Preconditions, checked below with a clear message rather than a traceback:
#   * `wrangler login` has been run, or CLOUDFLARE_API_TOKEN is exported.
#   * worker/wrangler.toml has no YOUR-DOMAIN / YOUR-KV-ID placeholders left.
#
# The frontend under web/ is a carbon copy of the uploaded
# U2gas_frontend-main.zip: a plain Next.js app with no static export. Deploying
# it to Pages needs a Next-on-Pages adapter, which is not installed yet, so this
# script deploys the Worker and then stops with the app step called out. Fill in
# the Pages half once the adapter is chosen.
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

# --- Deploy the API ---------------------------------------------------------

echo "==> Deploying Worker (env production)"
( cd worker && npm install --no-audit --no-fund && npx wrangler deploy --env production )

# --- The app ----------------------------------------------------------------

echo "==> Building the frontend"
( cd web && npm install --no-audit --no-fund && npm run build )

echo
echo "Worker deployed. The frontend built, but this script does not deploy it:"
echo "web/ is a carbon copy of the uploaded U2gas_frontend-main.zip, a plain"
echo "Next.js app with no static export, so Pages needs a Next adapter"
echo "(e.g. @opennextjs/cloudflare) that is not installed yet."
echo
echo "When the adapter is chosen and the UI is wired to the Worker, deploy with:"
echo "  npx wrangler pages deploy <build-output> --project-name $PAGES_PROJECT --branch $PAGES_BRANCH"
echo
echo "Then, in the Cloudflare dashboard:"
echo "  * Pages project '$PAGES_PROJECT' → Custom domains → add the apex and www."
echo "  * DNS: CNAME @ and www → $PAGES_PROJECT.pages.dev, CNAME api → the Worker."
echo "  * SSL/TLS mode: Full (strict)."
echo "  * Verify with the checklist in docs/DEPLOYMENT.md section 7."
