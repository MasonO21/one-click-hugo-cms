# Builds the ad overlays: CINEMATIC / ACTUAL GAMEPLAY labels, end cards (painted art + logo + PLAY FREE + legal) and the blurred landscape backdrop.
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
def fpath(p):
    return subprocess.run(f"fc-list | grep -i -E '{p}' | head -1 | cut -d: -f1", shell=True, capture_output=True, text=True).stdout.strip()
MS = fpath('Montserrat.*SemiBold') or fpath('Montserrat') or fpath('Metropolis') or fpath('DejaVuSans-Bold')
def cinzel(size):
    f = ImageFont.truetype('Cinzel.ttf', size)
    try: f.set_variation_by_axes([900])
    except Exception: pass
    return f
def cover(im, W, H):
    s = max(W / im.width, H / im.height); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2; return im.crop((x, y, x + W, y + H))
def label(text, W, H, bottom_center):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im); f = ImageFont.truetype(MS, 28)
    tw = d.textlength(text, font=f); pw, ph = tw + 44, 52
    x, y = ((W - pw) / 2, H - 160) if bottom_center else (50, H - 50 - ph)
    d.rounded_rectangle([x, y, x + pw, y + ph], radius=ph / 2, fill=(0, 0, 0, 150), outline=(255, 255, 255, 70), width=2)
    d.text((x + 22, y + ph / 2), text, font=f, fill=(255, 255, 255, 235), anchor='lm'); return im
def shade(W, H, start):
    g = Image.new('L', (1, H))
    for y in range(H): g.putpixel((0, y), int(230 * max(0.0, (y / H - start) / (1 - start))))
    b = Image.new('RGBA', (W, H), (0, 0, 0, 255)); b.putalpha(g.resize((W, H))); return b
def endcard(W, H, src, pre, logo_w, logo_cy, btn_cy, legal_y):
    tall = H > W
    bg = ImageEnhance.Brightness(cover(Image.open(src).convert('RGB'), W, H)).enhance(0.5).convert('RGBA')
    Image.alpha_composite(bg, shade(W, H, 0.35)).convert('RGB').save(pre + '_bg.png')
    logo = Image.open('logo.png').convert('RGBA'); lh = round(logo.height * logo_w / logo.width)
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); L.alpha_composite(logo.resize((logo_w, lh), Image.LANCZOS), ((W - logo_w) // 2, logo_cy - lh // 2)); L.save(pre + '_logo.png')
    C = Image.new('RGBA', (W, H), (0, 0, 0, 0)); bw, bh = (620, 140) if tall else (540, 116)
    btn = Image.new('RGBA', (bw, bh)); bd = ImageDraw.Draw(btn)
    for y in range(bh):
        t = y / bh; bd.line([(0, y), (bw, y)], fill=(255, int(224 - 81 * t), int(122 - 96 * t), 255))
    m = Image.new('L', (bw, bh), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, bw - 1, bh - 1], radius=28, fill=255); btn.putalpha(m)
    C.alpha_composite(btn, ((W - bw) // 2, btn_cy - bh // 2)); d = ImageDraw.Draw(C)
    d.text((W / 2, btn_cy + 3), 'PLAY FREE', font=cinzel(62 if tall else 52), fill=(42, 19, 0, 255), anchor='mm')
    d.text((W / 2, btn_cy + bh / 2 + 44), 'iOS  ·  Android', font=ImageFont.truetype(MS, 30 if tall else 26), fill=(200, 214, 232, 255), anchor='mm')
    lf = ImageFont.truetype(MS, 25 if tall else 22)
    d.text((W / 2, legal_y), 'Free to play · In-app purchases', font=lf, fill=(159, 178, 204, 255), anchor='mm')
    d.text((W / 2, legal_y + 36), 'Cinematic sequences are not actual gameplay.', font=lf, fill=(159, 178, 204, 255), anchor='mm')
    C.save(pre + '_cta.png')
label('CINEMATIC', 1080, 1920, True).save('lab_cine_v.png'); label('ACTUAL GAMEPLAY', 1080, 1920, True).save('lab_game_v.png')
label('CINEMATIC', 1920, 1080, False).save('lab_cine_l.png'); label('ACTUAL GAMEPLAY', 1920, 1080, False).save('lab_game_l.png')
endcard(1080, 1920, 'vert.png', 'end_v', 980, 760, 1300, 1790)
endcard(1920, 1080, 'widekey.png', 'end_l', 940, 340, 730, 985)
ImageEnhance.Brightness(cover(Image.open('widekey.png').convert('RGB'), 1920, 1080).filter(ImageFilter.GaussianBlur(22))).enhance(0.42).save('bg_l.png')
print('overlays ok', MS)
