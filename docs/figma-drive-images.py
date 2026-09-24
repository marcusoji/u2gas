"""
Full-quality images from the project's Google Drive folder, placed exactly
as Figma places them.

The Drive files are re-exports of Figma layers, and they cannot be inspected
from the build machine (no network) — so the page decides at load time, in the
viewer's browser, how each file was exported:

  render  the layer exported as Figma draws it: rotation and drop shadow baked
          in, bounded by absoluteRenderBounds. Placed at those bounds with no
          CSS rotation or shadow. Only accepted for the slot the file was
          exported from (layer name == file name) and only when no same-named
          slot shares its proportions with a different rotation.
  raw     the untouched source image. Placed in the layer box with Figma's
          rotation, exact drop shadow, and FILL (cover) or CROP (the layer's
          imageTransform) framing. Accepted anywhere the same source is used.

If a file matches neither within tolerance, the slot keeps its current image.
Every decision is logged; open the page with ?imgcheck to see them on screen.
"""
import json

DRIVE = {
    "image 3": "1DWC9tMjjn_jPBhh8763pUtLVZKXsn5V1",
    "image 4": "1pqXVCCzr-0daGkaSGs9R_kFIfsN3pkRi",
    "image 4-1": "1JBQJJAnbz_XFi7LVwBx1-1Jk7PoMJqhZ",
    "image 5": "1dHZyX-R3Exl_56kH1uY-lItweNgLHjkc",
    "image 7": "1E2hSmseOrelKQudP_ZTQ8yLJiYy2Hu-M",
    "image 9": "18EzShicBBvVc4drZeKsvrdMHneT6YSoQ",
    "image 10": "11D_1Tajz0JqFlXqbMGr7bnLLxct7ioiR",
    "image 11": "1lvIQUuhZEiWhev5z5on9btvzsMYkZhvc",
    "image 13": "1t_Tkk3U3OpfdAVWP3CSIdQUeP980UOOk",
    "shopping basket 3 1": "18BX9in0BQoViG1bGc3mR1U46NZTCTiBm",
    "TWO TONE THUMBS UP 1": "12yCqdRzyMlUtle_WTRK9AermyIrqi3wa",
    "TWO TONE THUMBS UP 2": "1dZA3LdJMfmjNQv5kRq0fF_n5SIAXlMv0",
    # In the folder but matching no Figma layer name: not used.
    # "image PIPE PURPLE": "1dWj4Uw84l1DQKiEBYp870bDqg2wVbp-E",
    # "image PIPDE BLACK": "1YxcvAkwXkWCqz7f6mtIx2JzyJXSgNX5I",
}

def _s(name, files, w, h, rot, mode, src, bb, rb, shadow, T=None, exported=True):
    return {"name": name, "files": files, "w": w, "h": h, "rot": rot, "mode": mode,
            "srcw": src[0], "srch": src[1], "bbw": bb[0], "bbh": bb[1],
            "rbx": rb[0], "rby": rb[1], "rbw": rb[2], "rbh": rb[3],
            "sh": shadow, "T": T, "exported": exported}

# Figma values per node (absoluteBoundingBox / absoluteRenderBounds / fills / effects).
SLOTS = {
 "1:1585": _s("shopping basket 3 1", ["shopping basket 3 1"], 356, 516, 0, "CROP", (816, 1222), (356, 516), (0, 0, 356, 516), None, [[0.872549, 0, 0.034314], [0, 0.844517, 0.075286]]),
 "1:1586": _s("image 10", ["image 10"], 140, 158, 14.16, "FILL", (960, 1092), (174.39, 187.44), (-15, -11, 204.39, 217.44), (0, 4, 15, .3)),
 "1:1588": _s("image 9", ["image 9"], 96.95, 146.63, 17.54, "CROP", (843, 1202), (136.63, 169.03), (-10, -6, 156.63, 189.03), (0, 4, 10, .5), [[0.94362, 0, 0.02819], [0, 1.000958, -0.000408]]),
 "1:1587": _s("image 11", ["image 11"], 136, 136, -90, "FILL", (1024, 1024), (136, 136), (-10, -6, 156, 156), (0, 4, 10, .25)),
 "1:1591": _s("image 13", ["image 13"], 124, 124, -180, "FILL", (1024, 1024), (124, 124), (-15, -11, 154, 154), (0, 4, 15, .3)),
 "1:318": _s("image 3", ["image 3"], 90, 119, 0, "CROP", (720, 900), (90, 119), (0, 0, 90, 119), None, [[0.772472, 0, 0.113764], [0, 0.820225, 0.101124]]),
 "1:320": _s("image 7", ["image 7"], 96, 109, 0, "CROP", (500, 500), (96, 109), (0, 0, 96, 109), None, [[0.81388, 0, 0.100946], [0, 0.921136, 0.050473]]),
 "1:322": _s("image 5", ["image 5"], 134, 135, 0, "FILL", (736, 736), (134, 135), (0, 0, 134, 135), None),
 "1:324": _s("image 4", ["image 4", "image 4-1"], 116, 116, 0, "FILL", (1200, 1200), (116, 116), (0, 0, 116, 116), None),
 # Collage pairs share a name and proportions but differ in rotation, so a
 # baked render cannot be attributed — the plain source only.
 "1:1445": _s("image 5", ["image 5"], 200, 200, -180, "CROP", (736, 736), (200, 200), (-15, -11, 230, 230), (0, 4, 15, .3), [[0.992593, 0, 0.003704], [0, 1, 0]], False),
 "1:1450": _s("image 5", ["image 5"], 200, 200, 0, "CROP", (736, 736), (200, 200), (-15, -11, 230, 230), (0, 4, 15, .3), [[0.992593, 0, 0.003704], [0, 1, 0]], False),
 "1:1446": _s("image 4", ["image 4", "image 4-1"], 200, 200, -90, "CROP", (1200, 1200), (200, 200), (-10, -6, 220, 220), (0, 4, 10, .25), [[1, 0, 0], [0, 1, 0]], False),
 "1:1451": _s("image 4", ["image 4", "image 4-1"], 200, 200, -90, "CROP", (1200, 1200), (200, 200), (-10, -6, 220, 220), (0, 4, 10, .25), [[1, 0, 0], [0, 1, 0]], False),
 "1:1447": _s("image 7", ["image 7"], 200, 226, 0, "CROP", (500, 500), (200, 226), (-15, -11, 230, 256), (0, 4, 15, .3), [[0.81388, 0, 0.100946], [0, 0.921136, 0.050473]], False),
 "1:1452": _s("image 7", ["image 7"], 200, 226, -180, "CROP", (500, 500), (200, 226), (-15, -11, 230, 256), (0, 4, 15, .3), [[0.81388, 0, 0.100946], [0, 0.921136, 0.050473]], False),
 "1:1448": _s("image 3", ["image 3"], 160, 212, 0, "CROP", (720, 900), (160, 212), (-10, -6, 180, 232), (0, 4, 10, .5), [[0.772472, 0, 0.113764], [0, 0.820225, 0.101124]], False),
 "1:1453": _s("image 3", ["image 3"], 160, 212, -180, "CROP", (720, 900), (160, 212), (-10, -6, 180, 232), (0, 4, 10, .5), [[0.772472, 0, 0.113764], [0, 0.820225, 0.101124]], False),
 "1:1477": _s("image 4", ["image 4-1", "image 4"], 250, 168, 0, "CROP", (1200, 1200), (250, 168), (-10, -6, 270, 188), (0, 4, 10, .25), [[0.953333, 0, 0.026667], [0, 0.64, 0.203333]]),
 # Different source (1264x847) that is also named "image 5".
 "1:1478": _s("image 5", ["image 5"], 126, 84, 0, "CROP", (1264, 847), (126, 84), (-10, -6, 146, 104), (0, 4, 10, .25), [[1.005142, 0, -0.002571], [0, 1, 0]], False),
 # Other layers using the same sources: the plain source only.
 "1:1551": _s("image 14", ["image 9"], 60, 90.75, 4, "CROP", (843, 1202), (66.18, 94.71), (-10, -6, 86.18, 114.71), (0, 4, 10, .5), [[0.94362, 0, 0.02819], [0, 1.000958, -0.000408]], False),
 "1:1531": _s("image 14", ["image 13"], 70, 70, -180, "FILL", (1024, 1024), (70, 70), (-15, -11, 100, 100), (0, 4, 15, .3), None, False),
 "1:1571": _s("image 14", ["image 11"], 70, 70, -83.46, "FILL", (1024, 1024), (77.52, 77.52), (-10, -6, 97.52, 97.52), (0, 4, 10, .25), None, False),
 # Thumbs: both layers on the result screens are named "...UP 1", so a render
 # named UP 1 could be either. Up takes UP 2 (Frame 124's layer) as a plain
 # source; down takes UP 1 only as its own 1000px source.
 "1:496": _s("TWO TONE THUMBS UP 2", ["TWO TONE THUMBS UP 2"], 266, 266, 0, "FILL", (2000, 2000), (266, 266), (-92, -80, 440, 466), (0, 20, 100, 1), None, False),
 "1:577": _s("TWO TONE THUMBS UP 1", ["TWO TONE THUMBS UP 1"], 266, 266, 0, "FILL", (1000, 1000), (266, 266), (-92, -80, 440, 466), (0, 20, 100, 1), None, False),
}

RUNTIME = r"""
<script>
/* Drive originals, placed as Figma places them. See drive_images.py. */
(function () {
  var MAP = %MAP%;
  var check = /[?&]imgcheck/.test(location.search), log = [];
  function close(x, y, t) { return Math.abs(x - y) / y <= t; }
  function shadow(s) { return s.sh ? 'drop-shadow(' + s.sh[0] + 'px ' + s.sh[1] + 'px ' + s.sh[2] + 'px rgba(0,0,0,' + s.sh[3] + '))' : 'none'; }
  function decide(s, file, nw, nh) {
    var a = nw / nh, render = null, raw = close(a, s.srcw / s.srch, 0.01);
    if (s.exported && s.name === file && close(a, s.rbw / s.rbh, 0.015)) render = true;
    if (render && raw) {                       /* same proportions: decide by pixel size */
      var k = nw / s.rbw, onScale = Math.abs(k * 2 - Math.round(k * 2)) < 0.02;
      var isSrc = Math.abs(nw - s.srcw) <= 2;
      return isSrc && !onScale ? 'raw' : (onScale && !isSrc ? 'render' : (isSrc ? 'raw' : 'render'));
    }
    return render ? 'render' : (raw && (!s.srcExact || Math.abs(nw - s.srcw) <= 2) ? 'raw' : null);
  }
  function place(el, src, s, mode) {
    var x = el.offsetLeft, y = el.offsetTop, n;
    if (mode === 'render') {
      n = document.createElement('img'); n.src = src; n.alt = el.getAttribute('alt') || el.getAttribute('aria-label') || '';
      n.style.cssText = 'position:absolute;left:' + (x + (s.w - s.bbw) / 2 + s.rbx) + 'px;top:' + (y + (s.h - s.bbh) / 2 + s.rby) +
        'px;width:' + s.rbw + 'px;height:' + s.rbh + 'px;';
    } else {
      n = document.createElement('div');
      n.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + s.w + 'px;height:' + s.h +
        'px;overflow:hidden;transform:rotate(' + (-s.rot) + 'deg);filter:' + shadow(s) + ';';
      var i = document.createElement('img'); i.src = src; i.alt = el.getAttribute('alt') || el.getAttribute('aria-label') || '';
      if (s.mode === 'CROP' && s.T) {          /* imageTransform: visible = [tx, tx+a] x [ty, ty+d] of the image */
        var W = s.w / s.T[0][0], H = s.h / s.T[1][1];
        i.style.cssText = 'position:absolute;max-width:none;width:' + W + 'px;height:' + H + 'px;left:' + (-s.T[0][2] * W) + 'px;top:' + (-s.T[1][2] * H) + 'px;';
      } else {
        i.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      }
      n.appendChild(i);
    }
    if (el.getAttribute('data-node')) n.setAttribute('data-node', el.getAttribute('data-node')); n.setAttribute('data-drive-placed', mode);
    el.style.visibility = 'hidden'; el.parentNode.insertBefore(n, el.nextSibling);
    Array.prototype.forEach.call(el.parentNode.children, function (c) {
      if (c.classList && c.classList.contains('drive-fallback')) c.style.visibility = 'hidden'; });
    if (check) { var t = document.createElement('span'); t.textContent = mode;
      t.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;z-index:9;font:10px monospace;background:#ff0;color:#000;padding:1px 3px';
      el.parentNode.insertBefore(t, n.nextSibling); }
  }
  function tryFile(el, s, files, k) {
    if (k >= files.length) { log.push([el.dataset.node || el.dataset.slotAlias, files.join('|'), 'kept current (no match or not loadable)']); return; }
    var file = files[k], id = MAP[file], p = new Image(), urls = ['https://lh3.googleusercontent.com/d/' + id,
      'https://drive.google.com/thumbnail?id=' + id + '&sz=w4000'], u = 0;
    p.referrerPolicy = 'no-referrer';
    p.onerror = function () { if (++u < urls.length) p.src = urls[u]; else tryFile(el, s, files, k + 1); };
    p.onload = function () {
      var mode = decide(s, file, p.naturalWidth, p.naturalHeight);
      if (!mode) { log.push([el.dataset.node || el.dataset.slotAlias, file, p.naturalWidth + 'x' + p.naturalHeight, 'no match']); return tryFile(el, s, files, k + 1); }
      place(el, p.src, s, mode); log.push([el.dataset.node || el.dataset.slotAlias, file, p.naturalWidth + 'x' + p.naturalHeight, mode]);
    };
    p.src = urls[0];
  }
  function run() {
    document.querySelectorAll('[data-drive-slot]').forEach(function (el) {
      var s = JSON.parse(el.getAttribute('data-drive-slot')); tryFile(el, s, s.files, 0);
    });
    window.U2_IMAGE_REPORT = log;
    setTimeout(function () { if (log.length) console.table(log); }, 4000);
  }
  if (document.readyState === 'complete') run(); else window.addEventListener('load', run);
})();
</script>
"""

def runtime():
    return RUNTIME.replace("%MAP%", json.dumps(DRIVE))

def slot_attr(node):
    node = resolve(node) or node
    s = SLOTS.get(node)
    if not s: return ""
    s = dict(s); s["srcExact"] = node in ("1:577",)   # the down thumb: only its own 1000px source
    return " data-drive-slot='" + json.dumps(s, separators=(",", ":")) + "'"

def exact_shadow(node):
    node = resolve(node) or node
    s = SLOTS.get(node)
    if not s or not s["sh"]: return None
    x, y, b, a = s["sh"]
    return f"drop-shadow({x}px {y}px {b}px rgba(0,0,0,{a}))"


# Other screens' instances of the same images: same source, box, rotation and
# shadow as the slot they alias (checked against the Figma listing).
ALIAS = {
    "1:4405": "1:496", "1:4936": "1:496",        # scan success thumbs
    "1:4435": "1:577", "1:4966": "1:577",        # scan fail thumbs
    "1:2020": "1:1585", "1:2021": "1:1586", "1:2022": "1:1587",
    "1:2023": "1:1588", "1:2024": "1:1591",      # CHECKOUT NO ADDRESS basket
}

def resolve(node):
    return node if node in SLOTS else ALIAS.get(node)
