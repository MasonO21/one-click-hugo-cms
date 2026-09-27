#!/usr/bin/env python3
"""
Builds the runtime textures in Assets/_Project/Resources/SnowGlobeArt from the concept art in
docs/concept/ plus procedurally drawn signage (plaques, crate labels, cabinet numbers, banners)
that mirrors the lettering in the concept images.

    pip install pillow
    python3 tools/art/generate_art.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
CONCEPT = os.path.join(ROOT, "docs", "concept")
OUT = os.path.join(ROOT, "Assets", "_Project", "Resources", "SnowGlobeArt")

SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SERIF_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
HAND = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

TEAL = (31, 58, 68)
NAVY = (26, 38, 58)
GOLD = (201, 164, 92)
BRASS = (178, 138, 70)
PAPER = (232, 222, 196)
INK = (48, 38, 30)
WOOD = (122, 88, 58)


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, name))


def centered_lines(draw, lines, box, fnt_path, max_size, fill, spacing=1.35):
    """Draws lines centred in box, shrinking the font until everything fits."""
    x0, y0, x1, y1 = box
    size = max_size
    while True:
        fnt = font(fnt_path, size)
        asc, desc = fnt.getmetrics()
        line_h = (asc + desc) * spacing
        widest = max(draw.textlength(l, font=fnt) for l in lines)
        if (widest <= x1 - x0 and line_h * len(lines) <= y1 - y0) or size <= 8:
            break
        size -= 2
    total = line_h * len(lines) - (asc + desc) * (spacing - 1)
    y = y0 + (y1 - y0 - total) / 2
    for line in lines:
        w = draw.textlength(line, font=fnt)
        draw.text(((x0 + x1 - w) / 2, y), line, font=fnt, fill=fill)
        y += line_h


def snowflake(draw, cx, cy, r, fill, width=3):
    for k in range(6):
        a = math.radians(k * 60 + 90)
        ex, ey = cx + r * math.cos(a), cy - r * math.sin(a)
        draw.line((cx, cy, ex, ey), fill=fill, width=width)
        for t in (0.45, 0.72):
            bx, by = cx + r * t * math.cos(a), cy - r * t * math.sin(a)
            for s in (-1, 1):
                b = a + s * math.radians(40)
                draw.line((bx, by, bx + r * 0.25 * math.cos(b), by - r * 0.25 * math.sin(b)), fill=fill, width=max(1, width - 1))


def plaque(name, lines, size=(512, 256), bg=TEAL, fg=GOLD, fnt_path=SERIF_BOLD, fnt_size=64, flake=False, border=True):
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)
    w, h = size
    m = max(4, int(min(w, h) * 0.04))
    if border:
        d.rectangle((m, m, w - 1 - m, h - 1 - m), outline=fg, width=max(2, m // 2))
        d.rectangle((m * 2.2, m * 2.2, w - 1 - m * 2.2, h - 1 - m * 2.2), outline=fg, width=max(1, m // 4))
    pad = m * 3.5 if border else m * 2
    bottom = h - (h * 0.3 if flake else 0)
    centered_lines(d, lines, (pad, pad, w - pad, bottom - pad * 0.5), fnt_path, fnt_size, fg)
    if flake:
        snowflake(d, w / 2, h - h * 0.17, h * 0.1, fg, 4)
    save(img, name)


def crop(src, box, name, scale=2):
    im = Image.open(os.path.join(CONCEPT, src)).convert("RGB").crop(box)
    im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    save(im, name)


def main():
    # --- views and title card cropped from the concept paintings ---
    crop("storefront.webp", (270, 38, 561, 420), "window_store.png")
    crop("backroom.webp", (570, 38, 678, 268), "window_backroom.png")
    crop("storefront.webp", (345, 135, 492, 430), "street_backdrop.png")
    crop("storefront.webp", (300, 120, 520, 330), "painting_town.png")
    title = Image.open(os.path.join(CONCEPT, "storefront.webp")).convert("RGB")
    title.save(os.path.join(OUT, "title_storefront.jpg"), quality=88)

    # --- signage seen in the concept art ---
    plaque("sign_small_lives.png", ["SMALL", "LIVES", "BRIGHTER", "WORLDS"], (256, 512), fnt_size=38, flake=True)
    plaque("sign_small_worlds.png", ["SMALL", "WORLDS", "BRIGHTER", "PEOPLE"], (256, 384), bg=PAPER, fg=INK, fnt_path=SERIF, fnt_size=34, flake=True)
    plaque("sign_to_production.png", ["TO", "PRODUCTION", "↑"], (256, 256), fnt_size=34)
    plaque("sign_freight_lift.png", ["↑  FREIGHT LIFT  ↑"], (768, 160), fnt_size=58)
    plaque("sign_freight_basement.png", ["FREIGHT LIFT", "TO BASEMENT"], (512, 200), fnt_size=50)
    plaque("sign_staff_only.png", ["STAFF ONLY"], (512, 128), bg=(40, 60, 64), fnt_size=56)
    plaque("sign_to_basement.png", ["TO BASEMENT  ↓"], (512, 128), fnt_size=50)
    plaque("sign_shop_name.png", ["LITTLE LIVES", "Snow Globes · Est. 1893"], (1024, 256), fnt_size=64)
    plaque("sign_open.png", ["OPEN"], (256, 160), bg=(34, 70, 52), fnt_size=64)
    plaque("sign_closed.png", ["CLOSED"], (256, 160), bg=(90, 30, 30), fnt_size=52)
    plaque("sign_premium.png", ["PREMIUM", "COLLECTION"], (512, 192), fnt_size=48)

    # Snowflake banner.
    banner = Image.new("RGB", (256, 512), NAVY)
    d = ImageDraw.Draw(banner)
    d.rectangle((0, 0, 255, 24), fill=BRASS)
    d.rectangle((12, 36, 243, 500), outline=GOLD, width=4)
    snowflake(d, 128, 230, 80, GOLD, 6)
    save(banner, "banner_snowflake.png")

    # Crate labels (stencilled wood).
    for word in ["WINTER", "EVERYDAY", "HOLIDAY", "ACCESSORIES"]:
        plaque("crate_" + word.lower() + ".png", [word], (512, 192), bg=WOOD, fg=(236, 222, 190), fnt_path=SERIF, fnt_size=60 if len(word) < 9 else 48)
    plaque("crate_backroom.png", ["GLASS DOMES", "BASES", "SNOW MATERIALS", "FIGURINES", "FINAL ASSEMBLY"], (512, 512), bg=WOOD, fg=(236, 222, 190), fnt_path=SERIF, fnt_size=40)

    # Brass tray plates.
    for word in ["COATS", "DRESSES", "HATS", "SCARVES"]:
        plaque("tray_" + word.lower() + ".png", [word], (384, 128), bg=BRASS, fg=(40, 30, 18), fnt_path=SERIF, fnt_size=54)

    # Cabinet cell numbers A1..E5.
    for col in "ABCDE":
        for row in range(1, 6):
            plaque("cell_" + col + str(row) + ".png", [col + str(row)], (128, 128), bg=BRASS, fg=(34, 26, 16), fnt_path=SERIF_BOLD, fnt_size=60)

    # Snow jar label.
    plaque("label_snow.png", ["SNOW", "TYPE A"], (256, 256), bg=PAPER, fg=INK, fnt_path=SERIF, fnt_size=54, border=False)

    # Shipments clipboard.
    clip = Image.new("RGB", (384, 512), PAPER)
    d = ImageDraw.Draw(clip)
    d.rectangle((140, 0, 244, 30), fill=BRASS)
    d.text((40, 45), "SHIPMENTS", font=font(SERIF_BOLD, 44), fill=INK)
    items = ["Town Square", "Winter Park", "Riverside", "Cathedral", "Children", "Special Order", "Basement"]
    f = font(SERIF, 30)
    for i, item in enumerate(items):
        y = 120 + i * 52
        d.rectangle((40, y, 68, y + 28), outline=INK, width=3)
        if item != "Basement":
            d.line((44, y + 14, 53, y + 24, 66, y + 2), fill=INK, width=4)
        d.text((84, y - 4), item, font=f, fill=INK)
    save(clip, "clipboard_shipments.png")

    # Work order with a figure sketch and tally marks.
    wo = Image.new("RGB", (512, 384), PAPER)
    d = ImageDraw.Draw(wo)
    d.text((140, 20), "WORK ORDER", font=font(SERIF_BOLD, 40), fill=INK)
    d.ellipse((60, 110, 190, 300), outline=INK, width=3)
    d.ellipse((112, 150, 138, 176), outline=INK, width=3)
    d.polygon([(125, 176), (100, 270), (150, 270)], outline=INK)
    for i in range(18):
        x = 240 + (i % 5) * 26 + (i // 5 % 2) * 4
        y = 120 + (i // 5) * 58
        if i % 5 == 4:
            d.line((x - 108, y + 36, x + 4, y + 4), fill=INK, width=3)
        else:
            d.line((x, y, x, y + 40), fill=INK, width=3)
    d.text((240, 330), "Qty: ||||", font=font(HAND, 24), fill=INK)
    save(wo.filter(ImageFilter.SMOOTH), "work_order.png")

    print("wrote", len(os.listdir(OUT)), "files to", OUT)


if __name__ == "__main__":
    main()
