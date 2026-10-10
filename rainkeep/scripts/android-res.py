#!/usr/bin/env python3
"""Write Rainkeep's launcher icons and splash into a Capacitor Android project's res/ folder.

    python3 -I android-res.py --icons <rainkeep>/icons --res <android>/app/src/main/res [--bg '#1a0e07']

Every PNG is regenerated at the size of the file it replaces (the Capacitor template's sizes), so the
script is idempotent and follows the template if it ever changes. It writes:
  mipmap-*/ic_launcher_foreground.png  adaptive-icon foreground (108dp canvas): the round medallion cut from
                                       icon-1024.png, 66dp across, i.e. inside the adaptive-icon safe zone
  values/ic_launcher_background.xml    adaptive-icon background colour (--bg)
  mipmap-*/ic_launcher.png             legacy icon (Android 7.x): medallion on --bg, rounded square
  mipmap-*/ic_launcher_round.png       legacy round icon: the same, circular
  drawable*/splash.png                 portrait: splash-2732.png cover-cropped; landscape: fitted, padded
  values/styles.xml                    launch theme: Android 12+ system splash uses the medallion on --bg
"""
import argparse
import glob
import os
import re

from PIL import Image, ImageDraw

SS = 4  # supersampling for anti-aliased masks
MEDALLION_R = 500 / 1024  # outer edge of the gold ring in icon-1024.png, as a fraction of the width
FOREGROUND_DP = 66  # medallion diameter on the 108dp adaptive canvas (the 66dp safe zone)
VIEWPORT_DP = 72  # the part of the 108dp canvas a launcher mask can show


def circle_mask(size, diameter, center=None):
    big = Image.new('L', (size * SS, size * SS), 0)
    cx, cy = center if center else (size / 2, size / 2)
    r = diameter / 2
    ImageDraw.Draw(big).ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=255)
    return big.resize((size, size), Image.LANCZOS)


def rounded_mask(size, radius_frac):
    big = Image.new('L', (size * SS, size * SS), 0)
    ImageDraw.Draw(big).rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=int(size * SS * radius_frac), fill=255)
    return big.resize((size, size), Image.LANCZOS)


def medallion(icon):
    """The round medallion from the square icon art, RGBA, transparent outside the ring."""
    w = icon.width
    d = round(2 * MEDALLION_R * w)
    off = (w - d) // 2
    med = icon.crop((off, off, off + d, off + d)).convert('RGBA')
    med.putalpha(circle_mask(d, d))
    return med


def foreground(med, size):
    """Adaptive foreground: medallion centred on a transparent 108dp canvas."""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = round(size * FOREGROUND_DP / 108)
    m = med.resize((d, d), Image.LANCZOS)
    canvas.alpha_composite(m, ((size - d) // 2, (size - d) // 2))
    return canvas


def legacy(med, size, bg, shape):
    """Legacy launcher icon: what the adaptive icon shows inside its 72dp viewport, masked."""
    tile = Image.new('RGBA', (size, size), bg + (255,))
    d = round(size * FOREGROUND_DP / VIEWPORT_DP)
    tile.alpha_composite(med.resize((d, d), Image.LANCZOS), ((size - d) // 2, (size - d) // 2))
    mask = circle_mask(size, size) if shape == 'round' else rounded_mask(size, 0.18)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(tile, (0, 0), mask)
    return out


def splash(src, w, h):
    edge = src.getpixel((2, 2))[:3]
    if h >= w:  # portrait: cover (the art is a centred portrait column, so a centre crop keeps all of it)
        scale = max(w / src.width, h / src.height)
        sw, sh = round(src.width * scale), round(src.height * scale)
        im = src.resize((sw, sh), Image.LANCZOS)
        x, y = (sw - w) // 2, (sh - h) // 2
        return im.crop((x, y, x + w, y + h))
    # landscape: fit the whole square art, pad with its own edge colour
    side = min(w, h)
    out = Image.new('RGB', (w, h), edge)
    out.paste(src.resize((side, side), Image.LANCZOS), ((w - side) // 2, (h - side) // 2))
    return out


def save_png(im, path):
    im.save(path, 'PNG', optimize=True)


def patch_text(path, fn):
    with open(path, encoding='utf-8') as f:
        old = f.read()
    new = fn(old)
    if new != old:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--icons', required=True, help="the game's icons/ folder (icon-1024.png, splash-2732.png)")
    ap.add_argument('--res', required=True, help='android/app/src/main/res')
    ap.add_argument('--bg', default='#1a0e07', help='adaptive icon / splash background colour')
    a = ap.parse_args()

    bg_hex = a.bg.lstrip('#')
    bg = tuple(int(bg_hex[i:i + 2], 16) for i in (0, 2, 4))
    icon = Image.open(os.path.join(a.icons, 'icon-1024.png')).convert('RGB')
    src_splash = Image.open(os.path.join(a.icons, 'splash-2732.png')).convert('RGB')
    med = medallion(icon)
    n = 0

    for path in sorted(glob.glob(os.path.join(a.res, 'mipmap-*dpi', 'ic_launcher*.png'))):
        size = Image.open(path).size[0]
        name = os.path.basename(path)
        if name == 'ic_launcher_foreground.png':
            im = foreground(med, size)
        elif name == 'ic_launcher_round.png':
            im = legacy(med, size, bg, 'round')
        elif name == 'ic_launcher.png':
            im = legacy(med, size, bg, 'square')
        else:
            continue
        save_png(im, path)
        n += 1

    for path in sorted(glob.glob(os.path.join(a.res, 'drawable*', 'splash.png'))):
        w, h = Image.open(path).size
        save_png(splash(src_splash, w, h), path)
        n += 1

    colour = '#%02X%02X%02X' % bg
    bg_xml = os.path.join(a.res, 'values', 'ic_launcher_background.xml')
    patch_text(bg_xml, lambda s: re.sub(r'(<color name="ic_launcher_background">)[^<]*(</color>)', r'\g<1>' + colour + r'\g<2>', s))

    # Android 12+ always shows the system splash (icon on a colour), taken from the launch theme. The
    # androidx Theme.SplashScreen default icon is the generic Android one, so name ours explicitly.
    def launch_theme(s):
        m = re.search(r'(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)(.*?)(</style>)', s, re.S)
        if not m:
            raise SystemExit('android-res: AppTheme.NoActionBarLaunch not found in styles.xml')
        body = m.group(2)
        body = re.sub(r'\s*<item name="(windowSplashScreenBackground|windowSplashScreenAnimatedIcon|postSplashScreenTheme)">[^<]*</item>', '', body)
        body = body.rstrip() + (
            '\n        <item name="windowSplashScreenBackground">@color/ic_launcher_background</item>'
            '\n        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>\n    ')
        return s[:m.start(2)] + body + s[m.end(2):]
    patch_text(os.path.join(a.res, 'values', 'styles.xml'), launch_theme)

    print(f'android-res: wrote {n} PNGs, icon background {colour}, launch theme splash icon')


if __name__ == '__main__':
    main()
