#!/usr/bin/env python3
"""Generate placeholder media for the embedded-API build.

The real product photography lives in Supabase Storage, not in this repository.
To show the UI without a live backend these stand-ins are written to
public/mock-media/ as the webp tiers ProductImage expects (thumb/grid/detail).

Each one is a vector illustration of the actual product, drawn on transparency
so it sits on the page the way a photographed cut-out does. The previous
generator produced a labelled gradient square, which is what a reader saw on
every tile; an illustration at least says which product it stands in for.

Regenerate: python3 scripts/gen-mock-images.py
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "mock-media")

SS = 4  # supersample factor, downsampled at the end for clean edges


def steel(light="#C8CCD4", mid="#9AA0AC", dark="#5C626E"):
    return light, mid, dark


def draw_cylinder(d, s, box):
    """An LPG bottle: domed top, collar, body, foot ring."""
    l, m, k = "#DDE1E8", "#A8AEB9", "#61666F"
    x0, y0, x1, y1 = box
    w = x1 - x0
    h = y1 - y0
    body_top = y0 + h * 0.16
    # body
    d.rounded_rectangle([x0, body_top, x1, y0 + h * 0.94], radius=w * 0.16,
                        fill=m, outline=k, width=max(1, int(s * 0.006)))
    # highlight down the left of the body
    d.rounded_rectangle([x0 + w * 0.10, body_top + h * 0.05, x0 + w * 0.30, y0 + h * 0.88],
                        radius=w * 0.08, fill=l)
    # shoulder into the neck
    d.polygon([(x0 + w * 0.24, body_top + h * 0.01),
               (x1 - w * 0.24, body_top + h * 0.01),
               (x0 + w * 0.42, y0), (x1 - w * 0.42, y0)], fill=m, outline=k)
    # neck and collar
    cx = (x0 + x1) / 2
    d.rectangle([cx - w * 0.16, y0 - h * 0.03, cx + w * 0.16, y0 + h * 0.03],
                fill=k)
    d.rounded_rectangle([cx - w * 0.22, y0 - h * 0.06, cx + w * 0.22, y0],
                        radius=w * 0.05, fill=l, outline=k, width=max(1, int(s * 0.005)))
    # foot ring
    d.rounded_rectangle([x0 + w * 0.06, y0 + h * 0.90, x1 - w * 0.06, y0 + h * 0.99],
                        radius=w * 0.05, fill=k)


def draw_burner(d, s, box):
    """A single-ring table burner."""
    l, m, k = "#E0E2E6", "#A9AEB6", "#5F646C"
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cx = (x0 + x1) / 2
    # ring
    d.ellipse([x0 + w * 0.06, y0 + h * 0.10, x1 - w * 0.06, y0 + h * 0.62],
              fill=m, outline=k, width=max(1, int(s * 0.006)))
    d.ellipse([x0 + w * 0.24, y0 + h * 0.24, x1 - w * 0.24, y0 + h * 0.50],
              fill="#2A2E36")
    # spokes
    for t in (0.25, 0.5, 0.75):
        d.line([(x0 + w * (0.12 + t * 0.0), y0 + h * (0.14 + t * 0.42)),
                (x1 - w * 0.10, y0 + h * (0.14 + t * 0.42))],
               fill=k, width=max(1, int(s * 0.008)))
    # body and legs
    d.rounded_rectangle([cx - w * 0.30, y0 + h * 0.56, cx + w * 0.30, y0 + h * 0.80],
                        radius=w * 0.04, fill=l, outline=k, width=max(1, int(s * 0.005)))
    d.line([(cx - w * 0.26, y0 + h * 0.80), (x0 + w * 0.10, y0 + h * 0.98)],
           fill=k, width=max(1, int(s * 0.012)))
    d.line([(cx + w * 0.26, y0 + h * 0.80), (x1 - w * 0.10, y0 + h * 0.98)],
           fill=k, width=max(1, int(s * 0.012)))


def draw_regulator(d, s, box):
    """A pigtail regulator: brass body, two gauges, outlet."""
    br_l, br_m, br_k = "#E4C36A", "#B8933A", "#6E5518"
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cx = (x0 + x1) / 2
    # gauges
    for gx in (cx - w * 0.20, cx + w * 0.16):
        d.ellipse([gx, y0 + h * 0.06, gx + w * 0.30, y0 + h * 0.50],
                  fill="#F2F3F5", outline=br_k, width=max(1, int(s * 0.008)))
        d.line([(gx + w * 0.15, y0 + h * 0.28), (gx + w * 0.10, y0 + h * 0.14)],
               fill="#C0392B", width=max(1, int(s * 0.008)))
    # body
    d.rounded_rectangle([cx - w * 0.30, y0 + h * 0.46, cx + w * 0.30, y0 + h * 0.74],
                        radius=w * 0.08, fill=br_m, outline=br_k, width=max(1, int(s * 0.006)))
    d.rounded_rectangle([cx - w * 0.22, y0 + h * 0.50, cx - w * 0.02, y0 + h * 0.70],
                        radius=w * 0.05, fill=br_l)
    # outlet and knob
    d.rounded_rectangle([cx - w * 0.08, y0 + h * 0.72, cx + w * 0.08, y0 + h * 0.98],
                        radius=w * 0.03, fill=br_m, outline=br_k, width=max(1, int(s * 0.006)))
    d.ellipse([cx + w * 0.24, y0 + h * 0.52, cx + w * 0.44, y0 + h * 0.72],
              fill="#2A2E36")


def draw_hose(d, s, box):
    """A coiled gas hose."""
    m, k = "#4A4E58", "#22252B"
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for i, r in enumerate((0.40, 0.30, 0.20)):
        d.ellipse([cx - w * r, cy - h * r, cx + w * r, cy + h * r],
                  outline=k if i % 2 else m, width=max(2, int(s * 0.028)))
    # tail
    d.line([(cx + w * 0.38, cy + h * 0.16), (x1 - w * 0.02, y1 - h * 0.04)],
           fill=k, width=max(2, int(s * 0.026)))
    d.ellipse([cx - w * 0.06, cy - h * 0.06, cx + w * 0.06, cy + h * 0.06], fill="#B8933A")


def draw_clamp(d, s, box):
    """A hose clamp: a band with a screw housing."""
    l, m, k = "#D6DAE1", "#9BA1AB", "#5A5F68"
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    r = min(w, h) * 0.40
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=m,
              width=max(3, int(s * 0.075)))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=k,
              width=max(1, int(s * 0.02)))
    # screw housing
    d.rounded_rectangle([cx + r * 0.42, cy - r * 0.42, cx + r * 1.16, cy + r * 0.42],
                        radius=r * 0.16, fill=l, outline=k, width=max(1, int(s * 0.006)))
    d.line([(cx + r * 0.79, cy - r * 0.20), (cx + r * 0.79, cy + r * 0.20)],
           fill=k, width=max(1, int(s * 0.012)))


def draw_battery(d, s, box):
    """A spark lighter: body, trigger, nozzle. What 'BATTERY' stands in for here
    is the ignition unit sold beside a burner."""
    body_l, body_m, body_k = "#3A4152", "#232838", "#11141C"
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    # body
    d.rounded_rectangle([x0 + w * 0.26, y0 + h * 0.34, x1 - w * 0.26, y0 + h * 0.96],
                        radius=w * 0.10, fill=body_m, outline=body_k,
                        width=max(1, int(s * 0.006)))
    d.rounded_rectangle([x0 + w * 0.32, y0 + h * 0.40, x0 + w * 0.46, y0 + h * 0.90],
                        radius=w * 0.06, fill=body_l)
    # nozzle
    d.rounded_rectangle([x0 + w * 0.44, y0 + h * 0.06, x1 - w * 0.36, y0 + h * 0.36],
                        radius=w * 0.03, fill="#8A9099", outline=body_k,
                        width=max(1, int(s * 0.005)))
    # trigger
    d.ellipse([x0 + w * 0.34, y0 + h * 0.44, x0 + w * 0.62, y0 + h * 0.64],
              fill="#C0392B", outline=body_k, width=max(1, int(s * 0.005)))


def draw_combo(d, s, box):
    """The starter kit: bottle, regulator and burner together."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    draw_cylinder(d, s, (x0 + w * 0.04, y0 + h * 0.16, x0 + w * 0.46, y1 - h * 0.02))
    draw_burner(d, s, (x0 + w * 0.50, y0 + h * 0.30, x1 - w * 0.02, y1 - h * 0.02))
    draw_regulator(d, s, (x0 + w * 0.40, y0, x0 + w * 0.80, y0 + h * 0.34))


def draw_avatar(d, s, box):
    """A portrait silhouette for the profile screens."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cx = (x0 + x1) / 2
    d.ellipse([cx - w * 0.26, y0 + h * 0.30, cx + w * 0.26, y0 + h * 0.62],
              fill="#9C9EEC")
    d.pieslice([cx - w * 0.44, y0 + h * 0.60, cx + w * 0.44, y0 + h * 1.24],
               180, 360, fill="#9C9EEC")


DRAW = {
    "catalog/cylinder": draw_cylinder,
    "catalog/hose": draw_hose,
    "catalog/regulator": draw_regulator,
    "catalog/clamp": draw_clamp,
    "catalog/battery": draw_battery,
    "catalog/burner": draw_burner,
    "catalog/combo": draw_combo,
    "media/avatar": draw_avatar,
}


def render(kind: str, size: int) -> Image.Image:
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # A small margin keeps the drawing clear of the tile edge, the way a
    # photographed cut-out is inset.
    margin = big * 0.06
    DRAW[kind](d, big, (margin, margin, big - margin, big - margin))
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    for base in DRAW:
        out_dir = os.path.join(OUT, base)
        os.makedirs(out_dir, exist_ok=True)
        for tier, size in (("thumb", 96), ("grid", 320), ("detail", 800)):
            render(base, size).save(
                os.path.join(out_dir, f"{tier}.webp"), "WEBP", quality=88,
            )
        print("wrote", base)


if __name__ == "__main__":
    main()
