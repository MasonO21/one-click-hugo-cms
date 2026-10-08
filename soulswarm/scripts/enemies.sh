#!/usr/bin/env bash
# Rebuilds the painted 3D foes in src/assets/foes (docs/ART_AND_ADS.md §6) from their Higgsfield models: concept art
# (Nano Banana Pro, from each foe's Bestiary painting) turned to 3D by Tripo H3.1 image-to-3D at ~4,000 faces
# (the Hollow King at ~10,000) with a detailed texture.
# Simplifies each mesh to its in-game budget (a horde of hundreds draws the common foes), shrinks the texture to a
# WebP beside the model (scripts/glb-split-texture.py) and quantizes the geometry (KHR_mesh_quantization).
# Heights, facing and gaits are in src/engine/foemodels.js FOES.
# usage: bash scripts/enemies.sh   (needs curl, python3 and npx access to @gltf-transform/cli)
set -euo pipefail
cd "$(dirname "$0")/.."
B=https://d8j0ntlcm91z4.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi
OUT=src/assets/foes TMP=$(mktemp -d)
GT="npx -y @gltf-transform/cli@4"
mkdir -p "$OUT"
# id, vertex ratio kept, texture size, file
while read -r id ratio tex file; do
  [ -z "$id" ] && continue
  curl -sSf --retry 3 -o "$TMP/$id.glb" "$B/$file" < /dev/null
  $GT optimize "$TMP/$id.glb" "$TMP/$id-1.glb" --compress false --texture-compress webp --texture-size "$tex" \
    --simplify true --simplify-ratio "$ratio" --simplify-error 0.01 < /dev/null > /dev/null
  python3 -I scripts/glb-split-texture.py "$TMP/$id-1.glb" "$TMP/$id-2.glb" "$OUT/$id.webp" < /dev/null
  $GT quantize "$TMP/$id-2.glb" "$OUT/$id.glb" < /dev/null > /dev/null
done <<'LIST'
husk 0.42 512 hf_20261008_024834_4f01dd92-d720-4eb4-8186-fc3cfc3bf199.glb
ghoul 0.42 512 hf_20261008_024904_1eef240b-3ee5-48c8-852d-bbc4a430acab.glb
brute 0.6 512 hf_20261008_024908_07008630-f83a-4afd-9c43-bdf0cc98a5c5.glb
witch 0.55 512 hf_20261008_024836_ec3bee03-3c4a-4c11-99d5-d5d9d333cf8e.glb
bloater 0.5 512 hf_20261008_024839_94db1130-c28e-4009-8e51-7e0f7c5246cd.glb
thief 0.8 512 hf_20261008_024906_4b81a3bb-47f0-49a4-a2c7-66ef8720c14c.glb
gravemaw 0.7 1024 hf_20261008_025038_5d899069-cf86-45e5-a6fd-7143287ef14c.glb
LIST
rm -rf "$TMP"
ls -l "$OUT"
