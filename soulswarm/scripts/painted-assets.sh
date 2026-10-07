#!/usr/bin/env bash
# Rebuilds every image derived from the painted masters in store/art (generated with Higgsfield):
# in-game art (src/assets/art), the app icon + splash (resources/) and the native iOS / Android sets.
# usage: npm run art   (needs ImageMagick built with WebP)
set -euo pipefail
cd "$(dirname "$0")/.."
A=store/art W=src/assets/art
mkdir -p "$W"

for h in vael nyx seraphine mordrake liora; do
  convert "$A/hero-$h.jpg" -resize 540x720 -quality 80 -define webp:method=6 "$W/hero-$h.webp"
done
for i in 1 2 3 4 5 6; do # chapter key art (home chapter card, run intro)
  convert "$A/chapter-$i.jpg" -resize 960x -quality 72 -define webp:method=6 "$W/chapter-$i.webp"
done
for f in husk ghoul brute witch bloater thief; do # Bestiary portraits
  convert "$A/foe-$f.jpg" -resize 540x720 -quality 78 -define webp:method=6 "$W/foe-$f.webp"
done
for r in lantern crown idol heart boots coin hourglass eye; do # relic icons (tiles, detail, Altar reveal, reward chips)
  convert "$A/relic-$r.jpg" -resize 256x256 -quality 82 -define webp:method=6 "$W/relic-$r.webp"
done
for f in "$A"/skill-*.jpg; do # ability icons (level-up cards, results, hero detail)
  convert "$f" -resize 256x256 -quality 82 -define webp:method=6 "$W/$(basename "$f" .jpg).webp"
done
for i in 1 2 3 4 5 6; do # gem packs, smallest to largest (shop)
  convert "$A/gems-$i.jpg" -resize 288x288 -quality 82 -define webp:method=6 "$W/gems-$i.webp"
done
convert "$A/skin-eclipse-vael.jpg" -resize 540x720 -quality 80 -define webp:method=6 "$W/skin-eclipse-vael.webp" # Soul Pass skin
convert "$A/boss-gravemaw.jpg" -crop 1792x1000+0+60 +repage -resize 900x -quality 78 -define webp:method=6 "$W/boss-band.webp"
convert "$A/logo-transparent.png" -resize 900x -quality 86 -define webp:method=6 -define webp:alpha-quality=90 "$W/logo.webp"
convert "$A/keyart-vertical.jpg" -resize 720x -quality 70 -define webp:method=6 "$W/boot.webp"

# App stores reject icons with alpha.
convert "$A/icon.jpg" -resize 1024x1024 -depth 8 -alpha off -strip PNG24:resources/icon.png
cp resources/icon.png resources/icon-only.png
# Splash: dimmed poster feathered into the void colour, logo inside the centre column phones keep.
convert -size 2732x2732 xc:'#05060b' \
  \( "$A/keyart-vertical.jpg" -resize x2732 -modulate 58,108 -background '#05060b' -vignette 0x180+0+0 \) -gravity center -composite \
  \( "$A/logo-transparent.png" -resize 1180x \) -gravity center -geometry +0-120 -composite \
  -depth 8 -alpha off -strip PNG24:resources/splash.png
cp resources/splash.png resources/splash-dark.png

npx capacitor-assets generate --assetPath resources --ios --android \
  --iconBackgroundColor '#05060b' --iconBackgroundColorDark '#05060b' \
  --splashBackgroundColor '#05060b' --splashBackgroundColorDark '#05060b'
