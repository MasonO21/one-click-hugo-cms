#!/usr/bin/env bash
# Rebuilds the voice lines in src/assets/voice from their Higgsfield takes (ElevenLabs engine via Higgsfield
# text2speech_v2; scripts, voices and job ids below and in docs/ART_AND_ADS.md §3): trims silence, adds a low shelf and a
# short cathedral echo to the announcer, pitches Mordrake down 10%, normalises to -16 LUFS, mono 64 kbps MP3.
# usage: bash scripts/voice-master.sh   (needs curl and ffmpeg)
set -euo pipefail
cd "$(dirname "$0")/.."
B=https://d8j0ntlcm91z4.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi
OUT=src/assets/voice TMP=$(mktemp -d)
mkdir -p "$OUT"
TRIM="silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.06,areverse"
while read -r key file; do
  [ -z "$key" ] && continue
  curl -sSf -o "$TMP/$key.mp3" "$B/$file"
  case $key in
    a_*) FX="highpass=f=60,bass=g=3:f=110,aecho=0.85:0.9:55|110:0.22|0.12,apad=pad_dur=0.25" ;;
    mordrake_*) FX="highpass=f=60,asetrate=44100*0.9,aresample=44100,atempo=1.1111,bass=g=2:f=100,apad=pad_dur=0.1" ;;
    *) FX="highpass=f=80,apad=pad_dur=0.1" ;;
  esac
  ffmpeg -v error -y -i "$TMP/$key.mp3" -af "aresample=44100,$TRIM,$FX,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=44100" -ac 1 -c:a libmp3lame -b:a 64k "$OUT/$key.mp3"
done <<'LIST'
a_carnage hf_20261007_164151_e2502239-bc3e-4500-bdde-79c1f3f1f5c7.mp3
a_massacre hf_20261007_164151_d982fa62-4097-44c8-8def-749cb79d60e9.mp3
a_annihilation hf_20261007_164151_4e688124-8c0a-49d0-b716-88ad5d70bc89.mp3
a_harvest hf_20261007_164151_4e809b80-1025-4ecf-b3f3-69bbf6d0b867.mp3
a_apocalypse hf_20261007_164151_b9eee622-b321-4d14-a3d1-0d3dee477f7d.mp3
a_nova hf_20261007_164152_b6d9f1b9-abac-4108-9a7b-72026e30c1af.mp3
a_elite hf_20261007_164152_1373aa80-a14b-4d92-9adc-aac86455bdde.mp3
a_boss hf_20261007_164151_e58ab34b-605a-40c5-b51d-79b38d8f3a3c.mp3
a_boss_return hf_20261007_164152_8b03a93c-654b-4292-88c5-1cedf6c469ea.mp3
a_boss_slain hf_20261007_164151_aff8caba-23d1-4d3e-a97a-62f4a6dc9797.mp3
a_cleared hf_20261007_164151_08886fb0-0903-42d8-be15-2d4e83760838.mp3
a_defeat hf_20261007_164151_fff8e36b-7b7a-4f07-8411-bb89f248b270.mp3
a_depth hf_20261007_164158_81deedd3-c20e-468e-a08f-6e2b7bc4ba6f.mp3
a_thief hf_20261007_164158_2dbc8e20-893d-45f4-9ec4-f1115b265d2f.mp3
a_shrine hf_20261007_164159_73baeabe-1e7f-49d9-9dce-bcd26992a36f.mp3
a_coffin hf_20261007_164526_da0c1965-6c39-4405-9c1f-bb2ce2c5f43e.mp3
a_nightmare hf_20261007_164159_c9ca18be-cfee-4bd1-baeb-e51a3ee78a50.mp3
a_torment hf_20261007_164158_5a9de5fa-3a9a-4a75-b08f-27687f56d7a6.mp3
a_bloodmoon hf_20261007_164159_c9476bc4-ff80-4dac-81eb-4d9f089c1b07.mp3
a_trial hf_20261007_164159_ffd41537-13b4-4a67-95a1-9d67f5566091.mp3
a_evolution hf_20261007_164159_70a52ef9-c6d5-41c0-a36f-46de8fa307bd.mp3
a_revive hf_20261007_164158_c1bcd7b4-03a8-4c99-a560-fd040ca9bd0c.mp3
vael_rite hf_20261007_164243_cd5589c9-6dda-4c05-8e2c-e707cc9c6322.mp3
vael_greet hf_20261007_164158_4042051f-dd3a-4b65-8ba3-e329c075ab39.mp3
nyx_rite hf_20261007_164206_7edd975b-d89a-401d-9332-d2b9d4843acf.mp3
nyx_greet hf_20261007_164206_ca21df9e-98cd-4df5-ba15-e6af14c57249.mp3
seraphine_rite hf_20261007_164206_0851bf0a-28e2-4af8-8a30-44c4b122a5eb.mp3
seraphine_greet hf_20261007_164206_328aa51b-2796-4fd0-aa88-52fcb9b9bcbd.mp3
liora_rite hf_20261007_164206_562c8f51-bb26-4c37-96a4-7e6a59cfb47f.mp3
liora_greet hf_20261007_164206_19fe0439-deca-41f6-84f8-e96a874a2c83.mp3
mordrake_rite hf_20261007_164206_9b487dd2-b8db-4b74-b048-e180a049f2da.mp3
mordrake_greet hf_20261007_164207_a9c1d7bf-535c-4dc7-93ab-1d068f9e813f.mp3
LIST
rm -rf "$TMP"
echo "wrote $(ls "$OUT" | wc -l) lines to $OUT"
