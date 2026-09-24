#!/usr/bin/env bash
# Fonts the screens need. Run from the repo root with network access:
#   bash scripts/fetch-fonts.sh
#
# Inter and Barlow Condensed come from Google Fonts; the pages also load them
# over the network, so this is only needed for an offline/self-hosted build.
#
# jgs5 is the LED face. It is part of Velvetyne's Jgs family (SIL OFL) —
# the same family as the jgs7 already in web/public/fonts. Download it from
#   https://velvetyne.fr/fonts/jgs-font/   (or https://gitlab.com/velvetyne/jgs)
# and save it as web/public/fonts/jgs5.woff2. Until then the LED readouts fall
# back to jgs7, which renders wider than Figma.
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
echo "Done. jgs5.woff2 must be added by hand — see the note above."
