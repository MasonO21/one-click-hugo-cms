#!/usr/bin/env bash
# Rebuilds the painted, animated 3D Shepherds in src/assets/models (docs/ART_AND_ADS.md §4).
#
# Where the rigs come from (done once, with the Higgsfield tools; job ids in the doc): each hero's image-to-3D model
# (built from its turnaround sheet) was turned to face +Z (python3 scripts/glb-turn.py in.glb out.glb -90: the
# generator faces +X, the rigging service assumes +Z and builds a sideways skeleton otherwise), uploaded and
# auto-rigged (a 24-bone humanoid). Nyx's rig came with the run clip (run_fast_10_inplace) and Vael's with the idle
# (Idle_3); the other rigs came bare. Their results are listed below.
#
# This script then, per hero:
#  1. gives it both clips with glb-retarget.py: every bone moves around the clip's average pose, so the hero keeps
#     the stance it was sculpted in (knees only bend, the lower foot meets the ground, the run leans 8 degrees); the
#     arms add only the clip's swing (gains: left,right; a weapon arm swings less); staffs and spears are pinned to
#     the hand that holds them (the rigger weighted their ends to a leg or the head; Grimsby's lantern hangs from his pole,
#     so it is pinned with it);
#  2. simplifies the mesh to about a quarter (7.6k–10.7k triangles; Isolde's model came at 2M triangles, so hers keeps 0.5%),
#     shrinks its painted (base colour) texture to a 1024 px WebP and moves it beside
#     the model (so the web build never needs blob: URLs to decode it), and quantizes the geometry
#     (KHR_mesh_quantization, which three.js reads without a decoder; skins and clips survive every step).
# usage: bash scripts/hero-models.sh   (needs curl, python3 and npx access to @gltf-transform/cli)
set -euo pipefail
cd "$(dirname "$0")/.."
B=https://d8j0ntlcm91z4.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi
OUT=src/assets/models TMP=$(mktemp -d)
GT="npx -y @gltf-transform/cli@4"
mkdir -p "$OUT"
# id, rigged result, arm gains for the run, weapon pins (BONE:x0,y0,z0,x1,y1,z1,radius[,fade] or BONE:box)
LIST='
nyx hf_20261007_200311_ef1a8223-2d19-4ae3-b397-b42cca2841ec.glb 0.5
vael hf_20261007_200312_60b4e7eb-2a10-41ba-92d3-e38e45125b64.glb 0.5,0.2 RightHand:-0.277,0,0.221,-0.398,1.55,0.277,0.045,0.45 RightHand:-0.75,-0.29,1.5,2.05,0.19,0.45
seraphine hf_20261007_200313_e0f7a16b-8831-4c8d-985a-d4ad8355eafe.glb 0.5
liora hf_20261007_200315_bdf65170-6d69-458c-afb5-5aac3202a50b.glb 0.5
mordrake hf_20261007_200316_a677c6d2-ae41-49a4-9313-c0b95aa5e608.glb 0.5,0.2 RightHand:-0.404,0.35,0.062,-0.508,1.25,0.212,0.05 RightHand:-0.508,1.25,0.212,-0.597,2.02,0.339,0.11
eclipse_vael hf_20261007_200318_59e99133-fac7-404c-baec-bbcade22336d.glb 0.5,0.2 RightHand:-0.265,0,0.230,-0.397,1.55,0.283,0.045,0.45 RightHand:-0.75,-0.29,1.5,2.05,0.19,0.45
grimsby hf_20261008_175558_d6918eb4-8ac3-4e6b-a32f-614ee02ef0e8.glb 0.2,0.5 LeftHand:0.317,0,-0.02,0.48,1.62,-0.29,0.05 LeftHand:0.45,0.75,1.2,1.95,-0.55,-0.2
osric hf_20261008_175359_220f55c9-c6b3-42a4-bc97-bfe4426c1a4b.glb 0.2,0.5 LeftHand:0.206,0,0.338,0.432,1.75,0.144,0.06,0.45 LeftHand:0.36,0.58,1.72,2.0,0.04,0.24
isolde hf_20261010_094148_ce856368-9519-40e4-b297-528c92f0f361.glb 0.5
'
# every rig first: the run and idle sources must be the untouched downloads
while read -r id file _; do
  [ -z "$id" ] || curl -sSf -o "$TMP/$id.glb" "$B/$file"
done <<< "$LIST"
while read -r id file gains pins; do
  [ -z "$id" ] && continue
  args=()
  for p in $pins; do args+=(--pin "$p"); done
  python3 -I scripts/glb-retarget.py "$TMP/$id.glb" "$TMP/$id-0.glb" ${args[@]+"${args[@]}"} \
    --clip "run=$TMP/nyx.glb@$gains~8" --clip "idle=$TMP/vael.glb" --drop-native
  case $id in isolde) SR=0.005 SE=0.01 ;; *) SR=0.27 SE=0.003 ;; esac # her detailed-geometry model: 2M triangles, against 29k
  $GT optimize "$TMP/$id-0.glb" "$TMP/$id-1.glb" --compress false --texture-compress webp --texture-size 1024 --simplify-ratio $SR --simplify-error $SE > /dev/null
  python3 -I scripts/glb-split-texture.py "$TMP/$id-1.glb" "$TMP/$id-2.glb" "$OUT/$id.webp"
  $GT quantize "$TMP/$id-2.glb" "$OUT/$id.glb" > /dev/null
done <<< "$LIST"
rm -rf "$TMP"
ls -l "$OUT"
