#!/usr/bin/env bash
# Fetch the self-hosted face the app uses. Run from the repo root:
#   bash scripts/fetch-fonts.sh
#
# Only jgs7 is self-hosted: app/layout.tsx wires it through `next/font/local`
# from web/public/fonts/. Barlow Semi Condensed is loaded from Google Fonts at
# build time by `next/font/google`, so it needs no file here.
#
# jgs7 is Adél Faure's Jgs (Velvetyne, SIL OFL 1.1). Set JGS_SRC=/path/to/jgs7.ttf
# to subset a local master; otherwise it pulls the upstream webfont.
set -euo pipefail
DEST="$(cd "$(dirname "$0")/.." && pwd)/web/public/fonts"
mkdir -p "$DEST"
UNICODES="U+0020-007E,U+00B7,U+00D7,U+2014,U+2018-201D,U+20A6"

command -v python3 >/dev/null 2>&1 || { echo "missing: python3"; exit 1; }
python3 -c "import fontTools, brotli" 2>/dev/null || { echo "pip install fonttools brotli"; exit 1; }

subset() {
  local src="$1" flavor
  for flavor in woff2 woff; do
    python3 -m fontTools.subset "$src" --unicodes="$UNICODES" --layout-features='*' \
      --flavor="$flavor" --output-file="$DEST/jgs7.${flavor}" --no-hinting --desubroutinize
  done
  printf "  jgs7  woff2 %6s B   woff %6s B\n" \
    "$(stat -c%s "$DEST/jgs7.woff2")" "$(stat -c%s "$DEST/jgs7.woff")"
}

echo "jgs7 (Adél Faure / Velvetyne, SIL OFL 1.1)"
if [ -n "${JGS_SRC:-}" ]; then
  subset "$JGS_SRC"
else
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  curl -fsSL -o "$TMP/jgs7.woff2" \
    "https://gitlab.com/velvetyne/jgs/-/raw/main/web-specimen/webfonts/jgs7.woff2" \
    || { echo "  Download from https://velvetyne.fr/fonts/jgs-font then: JGS_SRC=jgs7.ttf $0"; exit 1; }
  subset "$TMP/jgs7.woff2"
fi
curl -fsSL -o "$DEST/OFL.txt" "https://gitlab.com/velvetyne/jgs/-/raw/main/LICENSE" || true
echo "Done. Commit web/public/fonts/."
