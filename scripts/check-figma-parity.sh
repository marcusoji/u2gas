#!/usr/bin/env bash
# Fails if the app's artboards and the supplied HTML screens have drifted apart.
# Both come from build/gen_react.py, which reads docs/u2gas-all-screens.html;
# this proves the copy in web/src/figma still matches that file byte for byte.
#
#   bash scripts/check-figma-parity.sh
set -euo pipefail
cd "$(dirname "$0")/.."
python3 build/gen_react.py --check
