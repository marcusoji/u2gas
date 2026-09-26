#!/usr/bin/env bash
# Fonts the screens need. Run from the repo root with network access:
#   bash scripts/fetch-fonts.sh
#
# Inter and Barlow Condensed come from Google Fonts; the pages also load them
# over the network, so this is only needed for an offline/self-hosted build.
#
# jgs5, the LED face, is committed alongside jgs7 (both Velvetyne Jgs, SIL OFL).
# It is fetched here too so a rebuild refreshes both from the same source:
#   https://velvetyne.fr/fonts/jgs-font/   (or https://gitlab.com/velvetyne/jgs)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p web/public/fonts

for spec in \
  "Inter:wght@400;500;600" \
  "Barlow+Condensed:wght@400;600" \
  "Barlow+Semi+Condensed:wght@400;600"
do
  name="${spec%%:*}"
  echo "fetching $name"
  curl -fsSL -H "User-Agent: Mozilla/5.0" \
    "https://fonts.googleapis.com/css2?family=$spec&display=swap" \
    -o "web/public/fonts/${name//+/-}.css"
  grep -o "https://[^)]*\.woff2" "web/public/fonts/${name//+/-}.css" | sort -u | while read -r u; do
    curl -fsSL "$u" -o "web/public/fonts/$(basename "$u")"
  done
done
echo "Done."
