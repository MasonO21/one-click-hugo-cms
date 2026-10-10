#!/usr/bin/env bash
# Rebuilds the chapters' painted floors in src/assets/floors (docs/ART_AND_ADS.md §5) from their Higgsfield images
# (2048 px, prompted as seamless top-down textures; jobs listed below).
#  1. feathers each edge into the opposite one over 32 px (both sides of the wrap become the same pixels, so the last
#     faint seam disappears without ghosting the pattern);
#  2. shrinks it to 1024 px with the wrap taken into account (the copy is tiled 3x3, scaled, and the middle kept);
#  3. encodes WebP.
# usage: bash scripts/floors.sh   (needs curl and ffmpeg)
set -euo pipefail
cd "$(dirname "$0")/.."
B=https://d8j0ntlcm91z4.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi
OUT=src/assets/floors TMP=$(mktemp -d)
mkdir -p "$OUT"
F=32
fx() { echo "$1(X,Y)*min(min(X,W-1-X)/$F,1)+0.5*($1(X,Y)+$1(W-1-X,Y))*(1-min(min(X,W-1-X)/$F,1))"; }
fy() { echo "$1(X,Y)*min(min(Y,H-1-Y)/$F,1)+0.5*($1(X,Y)+$1(X,H-1-Y))*(1-min(min(Y,H-1-Y)/$F,1))"; }
while read -r id file; do
  [ -z "$id" ] && continue
  curl -sSf --retry 3 -o "$TMP/$id.png" "$B/$file"
  ffmpeg -nostdin -v error -y -i "$TMP/$id.png" -vf "format=gbrp,geq=r='$(fx r)':g='$(fx g)':b='$(fx b)',geq=r='$(fy r)':g='$(fy g)':b='$(fy b)'" "$TMP/$id-s.png"
  ffmpeg -nostdin -v error -y -i "$TMP/$id-s.png" -filter_complex \
    "[0]split=3[a][b][c];[a][b][c]hstack=inputs=3,split=3[r1][r2][r3];[r1][r2][r3]vstack=inputs=3,scale=3072:3072:flags=lanczos,crop=1024:1024:1024:1024" \
    -c:v libwebp -quality 84 "$OUT/$id.webp"
done <<'LIST'
necropolis hf_20261007_210224_d2253bb9-1a04-486e-874f-02eac4f9f62f.png
ember hf_20261007_210224_70729fa9-d4ca-4a61-9070-1de73fe8c864.png
ossuary hf_20261007_210407_68806679-faec-437d-a1f5-5590694f8b76.png
cathedral hf_20261007_210224_25f4ea1b-1074-4d53-b2d1-1aad09e0e916.png
throne hf_20261007_210224_4f87c936-dd89-4bc2-a134-4451b64ebd52.png
abyss hf_20261007_210224_9e11c334-8837-4406-a577-570f60669621.png
drowned hf_20261010_140955_885dcb9e-1326-4daa-a5d0-d398e177328a.png
shore hf_20261010_140955_16a21c3d-4a76-4dde-92d9-85febfe9cca0.png
thornwood hf_20261010_140955_3b3af7cd-3fa0-41da-b3a8-88d86048d63e.png
grove hf_20261010_140955_af181fb7-49fb-45da-87c6-9480c7bab77b.png
fen hf_20261010_140956_2cb21bd8-0305-4705-b22d-35cc998cfb6c.png
fungal hf_20261010_140955_22b50ad8-4772-48f5-b0c4-9799dbae0fc2.png
slate hf_20261010_140955_87473482-c6e7-4f10-954e-a6d12f4c76d8.png
peak hf_20261010_140955_aab54aa9-dd12-4435-9953-ba788a83081a.png
regolith hf_20261010_140955_35d6da7c-5698-4a95-a0c1-78a8a61c8488.png
starfloor hf_20261010_140955_85d835b5-024a-4070-8665-c0ba541e29ac.png
LIST
rm -rf "$TMP"
ls -l "$OUT"
