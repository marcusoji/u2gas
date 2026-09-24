#!/usr/bin/env bash
set -euo pipefail
DEST="$(cd "$(dirname "$0")/.." && pwd)/web/public/fonts"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DEST"
UNICODES="U+0020-007E,U+00B7,U+00D7,U+2014,U+2018-201D,U+20A6"
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1"; exit 1; }; }
need curl; need python3
python3 -c "import fontTools, brotli" 2>/dev/null || { echo "pip install fonttools brotli"; exit 1; }
subset() {
  local src="$1" name="$2"
  for flavor in woff2 woff; do
    python3 -m fontTools.subset "$src" --unicodes="$UNICODES" --layout-features='*' \
      --flavor="$flavor" --output-file="$DEST/${name}.${flavor}" --no-hinting --desubroutinize
  done
  printf "  %-20s woff2 %6s B   woff %6s B\n" "$name" \
    "$(stat -c%s "$DEST/${name}.woff2" 2>/dev/null || echo 0)" \
    "$(stat -c%s "$DEST/${name}.woff" 2>/dev/null || echo 0)"
}
echo "Homemade Apple (Google Fonts / Apache 2.0)"
curl -fsSL -o "$TMP/homemade-apple.ttf" \
  "https://github.com/google/fonts/raw/main/apache/homemadeapple/HomemadeApple-Regular.ttf"
subset "$TMP/homemade-apple.ttf" "homemade-apple"
echo
echo "jgs7 (Adél Faure / Velvetyne, SIL OFL 1.1)"
if [ -n "${JGS_SRC:-}" ]; then
  cp "$JGS_SRC" "$TMP/jgs7.ttf"
  subset "$TMP/jgs7.ttf" "jgs7"
elif curl -fsSL -o "$DEST/jgs7.woff2" \
    "https://gitlab.com/velvetyne/jgs/-/raw/main/web-specimen/webfonts/jgs7.woff2" \
  && curl -fsSL -o "$DEST/jgs7.woff" \
    "https://gitlab.com/velvetyne/jgs/-/raw/main/web-specimen/webfonts/jgs7.woff"; then
  printf "  %-20s woff2 %6s B   woff %6s B\n" "jgs7" \
    "$(stat -c%s "$DEST/jgs7.woff2")" "$(stat -c%s "$DEST/jgs7.woff")"
  curl -fsSL -o "$DEST/OFL.txt" "https://gitlab.com/velvetyne/jgs/-/raw/main/LICENSE" || true
else
  echo "  Download from https://velvetyne.fr/fonts/jgs-font then: JGS_SRC=jgs7.ttf $0"
  exit 1
fi
echo; echo "Done. Commit web/public/fonts/."
