#!/usr/bin/env bash
# Rebuilds the chapters' painted props in src/assets/props (docs/ART_AND_ADS.md §5) from their Higgsfield models:
# concept art (Nano Banana Pro) turned to 3D by Tripo H3.1 image-to-3D at 4,000 faces with a detailed texture.
# Shrinks each texture to a 512 px WebP beside the model (scripts/glb-split-texture.py) and quantizes the geometry
# (KHR_mesh_quantization). Heights, weights and lights are in src/game/world.js PROPS.
# usage: bash scripts/props.sh   (needs curl, python3 and npx access to @gltf-transform/cli)
set -euo pipefail
cd "$(dirname "$0")/.."
B=https://d8j0ntlcm91z4.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi
OUT=src/assets/props TMP=$(mktemp -d)
GT="npx -y @gltf-transform/cli@4"
mkdir -p "$OUT"
while read -r id file; do
  [ -z "$id" ] && continue
  curl -sSf --retry 3 -o "$TMP/$id.glb" "$B/$file" < /dev/null
  $GT optimize "$TMP/$id.glb" "$TMP/$id-1.glb" --compress false --texture-compress webp --texture-size 512 --simplify false < /dev/null > /dev/null
  python3 -I scripts/glb-split-texture.py "$TMP/$id-1.glb" "$TMP/$id-2.glb" "$OUT/$id.webp" < /dev/null
  $GT quantize "$TMP/$id-2.glb" "$OUT/$id.glb" < /dev/null > /dev/null
done <<'LIST'
graves hf_20261007_212352_46fa94f4-954e-4ef7-8a3a-91882f936dc3.glb
angel hf_20261007_212218_2e7e6733-0824-4059-b3db-81b1c5f32635.glb
lamp hf_20261007_212220_31f57b1f-f3e8-42e1-9991-3e82d43a954d.glb
deadtree hf_20261007_212222_ebfe4061-dc0f-4657-a223-407538bed560.glb
spire hf_20261007_212225_44de25b2-d35c-482b-8f9f-e2295be31237.glb
charredtree hf_20261007_212227_94876ad9-f8c3-4fee-a0cc-a1b7b6170242.glb
brazier hf_20261007_212229_55aca88a-8342-4a57-9787-028acbf1ef5c.glb
skulls hf_20261007_212629_32297910-38bd-4553-bd27-0ae92f9bce00.glb
icecrystal hf_20261007_212232_8323d6ba-c87a-452c-a377-5946b35416b7.glb
ribcage hf_20261007_212234_b9252667-fea9-46d1-aacf-7f7b5b9fb3ab.glb
icepillar hf_20261007_212236_30ad4140-a519-4359-a236-a6051afa9fde.glb
sarcophagus hf_20261007_212238_07a2e23d-0723-4f64-841f-cfef7ac0d6f1.glb
column hf_20261007_212240_03e578a2-a240-4812-a480-ff880055924f.glb
candelabra hf_20261007_212242_61dcbfe8-033d-4e81-ab3e-d22944ce31ea.glb
gargoyle hf_20261007_212245_88f6d317-55f9-4bd8-934e-5fd70ce3cc27.glb
altar hf_20261007_212246_d8af97c9-43e9-43f4-bbf8-1bbbb54f97df.glb
banner hf_20261007_212249_eee80bf6-cc35-40c1-8617-f0f23409ad65.glb
knight hf_20261007_212251_96a718ae-c710-4639-b832-10977681281f.glb
candles hf_20261007_212253_5d5d8946-390d-4382-bf70-bd57383a3c03.glb
fountain hf_20261007_212257_657d678b-b130-4aea-9304-1620dee53c48.glb
voidcrystal hf_20261007_212300_68755fc9-660f-46f0-9600-11bc45f3d5aa.glb
obelisk hf_20261007_212304_759fc563-7dcf-442c-8ae7-7c325694fe57.glb
arch hf_20261007_212305_677d1914-4a00-4553-83cf-503edbb9084f.glb
anchor hf_20261010_142344_57d8e8bf-1032-4f8c-9e78-e36f3399157e.glb
hullribs hf_20261010_142346_1c7ad2a2-e1e7-430b-a1b2-e67164a2d72f.glb
coralpillar hf_20261010_142349_dc3c7f4e-cc45-4de1-b7fc-639aaa7aadaf.glb
gibbet hf_20261010_142352_6587b143-12a0-46e3-94f5-b2c1ec118b9c.glb
thornbush hf_20261010_142355_29063878-53c9-4bd0-bacd-aa3438c47c67.glb
hollowstump hf_20261010_142357_9ff14554-53ea-47f4-92d2-eeb09d75109f.glb
plaguecart hf_20261010_142359_e0b3bc3c-eafc-4ad4-a634-ee33170c2be1.glb
fungus hf_20261010_142401_0243ef86-72c4-48a4-9c07-1e7ddc423012.glb
scarecrow hf_20261010_142404_bf10e0d0-d42f-4cac-9a6b-7416863d0bdf.glb
lightningrod hf_20261010_142405_e17d30cb-d54b-4a5c-9006-4b71dd6f013c.glb
prayerbell hf_20261010_142407_b6af6f67-bcfe-4f68-b81a-c1fe31b98d2d.glb
monolith hf_20261010_142409_1bc64019-b26a-4c93-9b0a-f0eaa2be52bd.glb
moonrock hf_20261010_142411_584fee47-15ba-458f-9379-1296515eac5f.glb
orrery hf_20261010_142413_03873ebf-2cb8-410d-ba3f-1051d5e0a3e4.glb
eclipseshrine hf_20261010_142415_0f70a410-d8d4-4c8c-8c59-35f32150caaf.glb
LIST
rm -rf "$TMP"
ls -l "$OUT"
