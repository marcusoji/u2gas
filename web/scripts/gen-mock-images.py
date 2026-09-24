#!/usr/bin/env python3
"""Generate placeholder media for the mock-data demo.

The real product photography lives in Supabase Storage, not in this repository.
To show the UI without a live backend these stand-ins are written to
public/mock-media/ as the webp tiers ProductImage expects (thumb/grid/detail).

Regenerate: python3 scripts/gen-mock-images.py
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "mock-media")

# base_path -> (label, top colour, bottom colour)
PRODUCTS = {
    "catalog/cylinder":  ("CYLINDER", (188, 192, 200), (92, 98, 110)),
    "catalog/hose":      ("HOSE",     (156, 158, 236), (86, 88, 180)),
    "catalog/regulator": ("REGULATOR", (233, 185, 13), (176, 132, 6)),
    "catalog/clamp":     ("CLAMP",    (150, 156, 168), (70, 74, 86)),
    "catalog/battery":   ("BATTERY",  (44, 52, 78), (18, 22, 40)),
    "catalog/burner":    ("BURNER",   (208, 120, 96), (140, 62, 48)),
    "catalog/combo":     ("COMBO KIT", (120, 178, 220), (52, 96, 150)),
    "media/avatar":      ("U2",       (19, 23, 228), (9, 11, 120)),
}


def gradient(size: int, top, bottom) -> Image.Image:
    img = Image.new("RGB", (size, size), top)
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(size - 1, 1)
        draw.line(
            [(0, y), (size, y)],
            fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    return img


def load_font(size: int):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def tile(size: int, label: str, top, bottom) -> Image.Image:
    img = gradient(size, top, bottom)
    draw = ImageDraw.Draw(img)
    font = load_font(max(11, size // 8))
    box = draw.textbbox((0, 0), label, font=font)
    draw.text(
        ((size - (box[2] - box[0])) / 2 - box[0],
         (size - (box[3] - box[1])) / 2 - box[1]),
        label, font=font, fill=(255, 255, 255),
    )
    return img


def main() -> None:
    for base, (label, top, bottom) in PRODUCTS.items():
        out_dir = os.path.join(OUT, base)
        os.makedirs(out_dir, exist_ok=True)
        for tier, size in (("thumb", 96), ("grid", 320), ("detail", 800)):
            tile(size, label, top, bottom).save(
                os.path.join(out_dir, f"{tier}.webp"), "WEBP", quality=82,
            )
        print("wrote", base)


if __name__ == "__main__":
    main()
