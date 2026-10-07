#!/usr/bin/env bash
# Rebuilds the painted 3D Shepherds in src/assets/models from their Higgsfield image-to-3D results (turnaround sheets,
# models and job ids in docs/ART_AND_ADS.md §4): simplifies each mesh by half (~14k triangles), shrinks its painted
# texture to a 1024 px WebP and moves it beside the model (so the web build never needs blob: URLs to decode it), and
# quantizes the geometry (KHR_mesh_quantization, which three.js reads without a decoder).
# usage: bash scripts/hero-models.sh   (needs curl, python3 and npx access to @gltf-transform/cli)
set -euo pipefail
cd "$(dirname "$0")/.."
B=https://d8j0ntlcm91z4.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi
OUT=src/assets/models TMP=$(mktemp -d)
GT="npx -y @gltf-transform/cli@4"
mkdir -p "$OUT"
while read -r id file; do
  [ -z "$id" ] && continue
  curl -sSf -o "$TMP/$id.glb" "$B/$file"
  $GT optimize "$TMP/$id.glb" "$TMP/$id-1.glb" --compress false --texture-compress webp --texture-size 1024 --simplify-ratio 0.5 --simplify-error 0.0015 > /dev/null
  python3 -I scripts/glb-split-texture.py "$TMP/$id-1.glb" "$TMP/$id-2.glb" "$OUT/$id.webp"
  $GT quantize "$TMP/$id-2.glb" "$OUT/$id.glb" > /dev/null
done <<'LIST'
vael hf_20261007_191024_fc66c1ad-f4e9-454d-9849-e6cf13cb23d7.glb
nyx hf_20261007_191738_71ced1f2-6936-40f9-a261-0918c7915cfc.glb
seraphine hf_20261007_191731_d5804c07-48c9-4b4c-be00-83d92ac653f1.glb
liora hf_20261007_191735_61052ab1-616c-4d0c-a27e-13397583fc38.glb
mordrake hf_20261007_191742_2355b7ab-2f5c-4e18-8295-fe113ba37492.glb
eclipse_vael hf_20261007_192343_6adb084d-ed13-4c73-bb5b-fadc55f4456e.glb
LIST
rm -rf "$TMP"
ls -l "$OUT"
