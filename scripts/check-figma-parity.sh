#!/usr/bin/env bash
# Fails if the app's artboards and the HTML screens have drifted apart.
# Both come from build/gen_react.py; this proves the copy in web/src/figma
# still matches docs/u2gas-batch*-exact.html byte for byte.
#
#   bash scripts/check-figma-parity.sh
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import re, pathlib, glob, sys
assets = dict(re.findall(r'export const (a\d+) = "([^"]+)";',
                         pathlib.Path('web/src/figma/assets.ts').read_text()))
gen = {}
for f in pathlib.Path('web/src/figma/screens').glob('*.ts'):
    src = f.read_text()
    node = re.search(r'export const node = "([^"]+)"', src).group(1)
    html = re.search(r'export const html = `(.*)`;\s*$', src, re.S).group(1)
    html = re.sub(r'\$\{A\.(a\d+)\}', lambda m: assets[m.group(1)], html)
    gen[node] = html.replace("\\`", "`").replace("\\${", "${").replace("\\\\", "\\")
ref = {}
for h in glob.glob('docs/u2gas-batch*-exact.html'):
    s = pathlib.Path(h).read_text()
    for m in re.finditer(r'<figure class="slot"[^>]*><div class="frame" '
                         r'data-node="([0-9:]+)" style="height:\d+px">', s):
        ref[m.group(1)] = s[m.end():s.find("</div><figcaption>", m.end())]
bad = [n for n in gen if n not in ref or gen[n] != ref[n]]
missing = [n for n in ref if n not in gen]
print(f"artboards in the app: {len(gen)}   screens: {len(ref)}")
if bad or missing:
    print(f"DRIFT: {len(bad)} differ, {len(missing)} missing from the app")
    for n in (bad + missing)[:10]:
        print("  ", n)
    sys.exit(1)
print("identical: the product and the reference are the same drawing")
PY
