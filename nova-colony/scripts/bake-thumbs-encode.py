"""Encode the thumbnail baker's raw RGBA dumps (<kind>__<id>.rgba, straight alpha) to WebP.

Called by scripts/bake-thumbs.mjs:  python3 -I bake-thumbs-encode.py <src dir> <out dir> [--size 192]
[--quality 85] [--sheet <dir>]. Writes <out>/buildings/<id>.webp and <out>/vehicles/<id>.webp; with
--sheet also two labelled contact sheets (light card / dark HUD colours) for eyeballing every icon.
"""
import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FOLDERS = {"building": "buildings", "vehicle": "vehicles"}
SHEETS = [("light", "#fff8ec", "#4a4030"), ("dark", "#262a3a", "#dfe4f0")]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--size", type=int, default=192)
    ap.add_argument("--quality", type=int, default=85)
    ap.add_argument("--sheet")
    args = ap.parse_args()

    images = []
    total = 0
    for name in sorted(os.listdir(args.src)):
        if not name.endswith(".rgba") or "__" not in name:
            continue
        kind, ident = name[:-5].split("__", 1)
        with open(os.path.join(args.src, name), "rb") as f:
            data = f.read()
        img = Image.frombytes("RGBA", (args.size, args.size), data)
        folder = os.path.join(args.out, FOLDERS[kind])
        os.makedirs(folder, exist_ok=True)
        dest = os.path.join(folder, ident + ".webp")
        img.save(dest, "WEBP", quality=args.quality, method=6)
        total += os.path.getsize(dest)
        images.append((kind, ident, img))
    print(f"  encoded {len(images)} thumbnails, {total / 1024:.0f} KB total ({total / max(1, len(images)) / 1024:.1f} KB avg)")

    if args.sheet and images:
        os.makedirs(args.sheet, exist_ok=True)
        cell = 128
        pad = 6
        label_h = 16
        cols = 12
        rows = (len(images) + cols - 1) // cols
        try:
            font = ImageFont.load_default(size=11)
        except TypeError:
            font = ImageFont.load_default()
        for tag, bg, fg in SHEETS:
            sheet = Image.new("RGB", (cols * (cell + pad) + pad, rows * (cell + label_h + pad) + pad), bg)
            draw = ImageDraw.Draw(sheet)
            for i, (kind, ident, img) in enumerate(images):
                x = pad + (i % cols) * (cell + pad)
                y = pad + (i // cols) * (cell + label_h + pad)
                icon = img.resize((cell, cell), Image.LANCZOS)
                sheet.paste(icon, (x, y), icon)
                text = ident if len(ident) <= 20 else ident[:19] + "…"
                draw.text((x + cell // 2, y + cell + 2), text, fill=fg, font=font, anchor="mt")
            dest = os.path.join(args.sheet, f"contact-{tag}.png")
            sheet.save(dest)
            print(f"  wrote {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
