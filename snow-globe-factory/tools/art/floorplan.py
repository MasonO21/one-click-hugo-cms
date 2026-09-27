#!/usr/bin/env python3
"""Top-down floor plan of the runtime-built level (mirrors LevelBuilder.cs coordinates). Writes docs/floorplan.png."""
import math, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
S = 40  # px per metre
X0, X1, Z0, Z1 = -8, 8, -5, 40
W, H = int((X1 - X0) * S), int((Z1 - Z0) * S)
img = Image.new("RGB", (W + 360, H), (245, 242, 235))
d = ImageDraw.Draw(img)
f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
fb = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)

def P(x, z):  # +z drawn downward so the street is at the top
    return ((x - X0) * S, (z - Z0) * S)

def rect(x0, z0, x1, z1, fill=None, outline=(40, 40, 40), w=1):
    a, b = P(min(x0, x1), min(z0, z1)); c, e = P(max(x0, x1), max(z0, z1))
    d.rectangle((a, b, c, e), fill=fill, outline=outline, width=w)

def box(cx, cz, sx, sz, fill, label=None):
    rect(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, fill)
    if label:
        x, y = P(cx, cz); d.text((x + 3 + sx * S / 2, y - 7), label, font=f, fill=(20, 20, 20))

def circle(cx, cz, r, fill, outline=(40, 40, 40)):
    x, y = P(cx, cz); d.ellipse((x - r * S, y - r * S, x + r * S, y + r * S), fill=fill, outline=outline)

def text(x, z, s, font=f, fill=(20, 20, 20)):
    d.text(P(x, z), s, font=font, fill=fill)

TEAL, BRASS, WOOD, CREAM = (70, 110, 118), (200, 160, 80), (150, 105, 70), (230, 220, 195)
# Rooms
rect(-7, 0, 7, 10, (250, 238, 215)); rect(2.5, 10, 5, 13, (250, 238, 215))
rect(-7, 13, 7, 23, (215, 215, 210)); rect(-7, 23, 7, 39, (165, 175, 180))
rect(-4.4, 21, -2.2, 23, (120, 120, 120))
text(-6.8, 0.2, "STOREFRONT (y 0)", fb); text(-6.8, 13.2, "BACKROOM (y 0)", fb); text(-3.2, 38.2, "BASEMENT (y -4)", fb)
# Store
d.line((*P(-6.4, 0), *P(-3.8, 0)), fill=(90, 150, 230), width=6); text(-6.4, -0.8, "arched window")
d.line((*P(-2.9, 0), *P(-1.3, 0)), fill=(90, 200, 120), width=6); text(-3.1, -1.6, "front door (open when OPEN)")
box(6.75, 5.2, 0.5, 8.4, TEAL, None); box(-6.75, 4, 0.5, 6, TEAL, None)
for i, z in enumerate([2.0, 4.0, 6.0]): circle(-6.7, z, 0.17, BRASS); text(-6.3, z - 0.2, f"slot {i+1}")
for i, z in enumerate([2.4, 5.2, 8.0]): circle(6.7, z, 0.17, BRASS); text(5.2, z - 0.2, f"slot {i+4}")
circle(0, 5, 1.5, TEAL); circle(0, 5, 0.95, (60, 90, 100)); text(-0.9, 4.8, "round display")
for a in (-60, -20, 20, 60):
    r = math.radians(a); circle(math.sin(r) * 1.25, 5 - math.cos(r) * 1.25, 0.12, (240, 200, 80))
text(1.6, 3.3, "premium slots 7-10 (upgrade)")
box(-1.6, 9.9, 1.4, 0.1, (170, 130, 88)); text(-2.4, 9.35, "order board")
for i in range(3): circle(-4, 7.4 - 0.8 * i, 0.12, (240, 160, 160))
box(-4, 8.4, 2.8, 0.7, TEAL, None); text(-5.2, 8.9, "counter + bell"); circle(-4, 7.4, 0.2, (240, 120, 120)); text(-3.7, 7.2, "customer spot")
box(-3.35, 0.05, 0.5, 0.1, (200, 60, 60)); text(-4.6, 0.5, "OPEN sign")
for x, z in [(5.3, 2.4), (5.3, 5.2), (5.3, 8.0), (-5.3, 2.0), (-5.3, 4.0), (-5.3, 6.0), (0, 2.6)]: circle(x, z, 0.08, (240, 120, 120))
for i in range(8):
    a = i * math.pi / 4; circle(math.sin(a) * 2.5, 5 + math.cos(a) * 2.5, 0.05, (120, 120, 240))
circle(3.2, 8.4, 0.25, (40, 180, 40)); text(3.5, 8.1, "player spawn")
d.line((*P(2.75, 13), *P(4.75, 13)), fill=(90, 200, 120), width=6); text(2.6, 12.2, "STAFF ONLY")
# Backroom
st = dict(fill=(90, 130, 140))
box(-6.2, 20.3, 0.9, 1.0, (140, 200, 190), "1 Prep cradle")
box(0, 18.3, 3.0, 1.2, (140, 200, 190)); text(-1.3, 18.1, "2 Assembly worktable"); circle(0, 18.0, 0.12, BRASS)
box(5.9, 20.2, 0.9, 1.0, (140, 200, 190)); text(3.3, 19.4, "3 Sealer")
box(-5.9, 15.2, 0.9, 1.0, (140, 200, 190), "4 Inspection lamp")
box(5.9, 15.2, 0.9, 1.0, (140, 200, 190)); text(3.6, 14.4, "5 Packaging")
d.line((*P(-7, 17), *P(-7, 18.3)), fill=(90, 150, 230), width=6); text(-6.8, 17.3, "window")
box(-4.6, 13.3, 4.4, 0.4, TEAL); text(-6.8, 13.6, "supply shelves")
box(-1.3, 13.75, 1.2, 0.7, WOOD, "supplies crate")
for x in (-2.8, 2.8): box(x, 21.4, 1.0, 0.6, (120, 120, 120))
box(4.4, 22.8, 2.4, 0.15, (60, 60, 60)); text(3.2, 22.1, "freight lift (sealed)")
d.line((*P(-7, 23), *P(-5.2, 23)), fill=(90, 200, 120), width=6); text(-6.9, 22.2, "TO BASEMENT")
# Automation (appears when bought)
AUTO = (230, 190, 90)
box(-6.2, 19.1, 0.8, 0.7, AUTO); text(-5.7, 18.75, "auto-prep hopper*")
box(6.45, 17.7, 0.5, 3.9, AUTO); text(4.3, 17.5, "conveyor*")
box(6.4, 13.7, 0.5, 1.1, AUTO); text(4.9, 13.9, "output rack*")
box(0.2, 13.6, 0.6, 0.6, (190, 160, 120))
# Basement
box(-6.1, 23.7, 1.8, 1.4, (120, 140, 145)); text(-6.9, 23.5, "landing")
for i in range(16): rect(-7, 24.4 + i * 0.5, -5.2, 24.9 + i * 0.5, (180, 150, 110))
text(-5.0, 27.5, "stairs down\n(8 m, 4 m drop)")
box(-3.3, 22, 2.2, 2.0, (150, 150, 150)); text(-4.2, 21.2, "lift cab (under floor, y -4)")
box(6.575, 27.1, 0.75, 5.8, (200, 170, 120)); text(3.2, 30.3, "glass cabinets A-E\n(rows 1-2 usable)")
for c in range(5):
    z = 24.8 + c * 1.15; text(6.25, z - 0.2, "ABCDE"[c])
box(3.45, 23.45, 5.2, 0.7, (200, 170, 120)); text(1.2, 24.0, "decor cabinet bank")
d.line((*P(5.2, 26.6), *P(6.05, 26.6)), fill=WOOD, width=5); text(4.0, 26.3, "ladder")
box(1, 28.5, 0.6, 0.6, TEAL); text(1.4, 28.3, "pillar: SMALL LIVES")
box(2.6, 32.5, 2.4, 1.1, TEAL); text(1.6, 33.2, "miniature room table")
box(1.55, 36.9, 4.9, 0.9, TEAL); text(-0.6, 35.8, "COATS  DRESSES  HATS  SCARVES")
box(-6.6, 36.3, 0.7, 4.8, WOOD); text(-6.1, 36.0, "crates: WINTER / EVERYDAY\nHOLIDAY / ACCESSORIES")
box(-6.93, 33, 0.15, 0.5, (220, 60, 60)); text(-6.6, 32.7, "breaker")
box(-3.9, 37.4, 1.6, 0.8, WOOD); text(-4.6, 38.0, "security desk")
circle(6.5, 38.5, 0.2, (20, 20, 20)); text(5.0, 38.8, "dark corner")
# Legend
lx = W + 20
d.text((lx, 20), "Little Lives — level plan", font=fb, fill=(0, 0, 0))
lines = ["Top-down, 1 grid square = 1 m.", "Street at top; +Z runs into the", "building.", "",
         "red dots: customer browse points", "blue dots: path ring around display", "brass dots: display slots",
         "green lines: doors", "blue lines: windows (concept-art views)", "", "Stations 1-5 = the production line.",
         "Basement is 4 m below the backroom,", "reached by the stairs behind the", "TO BASEMENT door.", "", "* automation upgrades: hidden until", "  bought (Milestone 3)."]
for i, l in enumerate(lines): d.text((lx, 55 + i * 18), l, font=f, fill=(30, 30, 30))
for gx in range(X0, X1 + 1):
    d.line((*P(gx, Z0), *P(gx, Z1)), fill=(0, 0, 0, 30), width=1) if False else None
out = os.path.join(ROOT, "docs", "floorplan.png")
img.save(out); print("wrote", out)
