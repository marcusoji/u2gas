#!/usr/bin/env bash
# Fetch the self-hosted face the app uses. Run from the repo root:
#   bash scripts/fetch-fonts.sh
#
# jgs7 and jgs5 are self-hosted: app/layout.tsx wires both through
# `next/font/local` from web/public/fonts/. jgs7 is the pixel face; jgs5 is the
# LED face the readouts and tickers use. Barlow Semi Condensed is loaded from
# Google Fonts at build time by `next/font/google`, so it needs no file here.
#
# Both are Adél Faure's Jgs (Velvetyne, SIL OFL 1.1). Set JGS_SRC=/path/to/jgs.ttf
# to subset a local master; otherwise it pulls the upstream webfonts.
set -euo pipefail
DEST="$(cd "$(dirname "$0")/.." && pwd)/web/public/fonts"
mkdir -p "$DEST"
UNICODES="U+0020-007E,U+00B7,U+00D7,U+2014,U+2018-201D,U+20A6"

command -v python3 >/dev/null 2>&1 || { echo "missing: python3"; exit 1; }
python3 -c "import fontTools, brotli" 2>/dev/null || { echo "pip install fonttools brotli"; exit 1; }

subset() {
  local face="$1" src="$2" flavor
  for flavor in woff2 woff; do
    python3 -m fontTools.subset "$src" --unicodes="$UNICODES" --layout-features='*' \
      --flavor="$flavor" --output-file="$DEST/$face.${flavor}" --no-hinting --desubroutinize
  done
  printf "  %s  woff2 %6s B   woff %6s B\n" "$face" \
    "$(stat -c%s "$DEST/$face.woff2")" "$(stat -c%s "$DEST/$face.woff")"
}

echo "jgs7 + jgs5 (Adél Faure / Velvetyne, SIL OFL 1.1)"
if [ -n "${JGS_SRC:-}" ]; then
  subset jgs7 "$JGS_SRC"
  if [ -n "${JGS5_SRC:-}" ]; then
    subset jgs5 "$JGS5_SRC"
  else
    echo "  jgs5: set JGS5_SRC=/path/to/jgs5.ttf to subset it too"
  fi
else
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  for face in jgs7 jgs5; do
    curl -fsSL -o "$TMP/$face.woff2" \
      "https://gitlab.com/velvetyne/jgs/-/raw/main/web-specimen/webfonts/$face.woff2" \
      || { echo "  Download from https://velvetyne.fr/fonts/jgs-font then: JGS_SRC=jgs7.ttf $0"; exit 1; }
    subset "$face" "$TMP/$face.woff2"
  done
fi
curl -fsSL -o "$DEST/OFL.txt" "https://gitlab.com/velvetyne/jgs/-/raw/main/LICENSE" || true
echo "Done. Commit web/public/fonts/."
