#!/usr/bin/env bash
# Cuts the two cinematic ads (9:16, 16:9) from the Higgsfield Kling clips, the painted art and the in-engine trailer,
# with game audio recorded from the real procedural audio module. Runs in a Higgsfield sandbox (ffmpeg, Pillow,
# Playwright). Set UPLOAD_V / UPLOAD_L to presigned PUT URLs (media_upload) to upload the results.
# usage: bash render.sh   (in a directory holding index.html, rec.mjs, cues.py, make_overlays.py)
set -euo pipefail
B=https://d8j0ntlcm91z4.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi
R=https://raw.githubusercontent.com/masono21/one-click-hugo-cms/refs/heads/claude/soulswarm-mobile-game/soulswarm
dl() { [ -s "$1" ] || curl -sSfL -o "$1" "$2"; }
dl rise.mp4 $B/hf_20261006_000125_35a8e903-58b3-412a-b9dc-3d32889ebde1.mp4 &
dl wide.mp4 $B/hf_20261006_000127_928ba105-1d39-4972-af06-320d3bb8419f.mp4 &
dl boss.mp4 $B/hf_20261006_000217_75879ac8-4a9d-497f-832d-1a48cd4b3457.mp4 &
dl vert.png $B/hf_20261005_235912_5d35e791-1ee4-4b47-9d91-443ea7a80bfc.png &
dl widekey.png $B/hf_20261005_235912_b4973d51-1222-419b-8db8-819a2a7258cb.png &
dl logo.png $B/hf_20261006_000055_3cf6edf7-20d5-4d80-ac09-fd57074e79a9.png &
dl gameplay.mp4 $R/store/trailer-9x16.mp4 &
dl audio.js $R/src/audio/audio.js &
dl Cinzel.ttf 'https://github.com/google/fonts/raw/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf' &
wait
python3 cues.py
python3 make_overlays.py
(python3 -m http.server 8765 >/dev/null 2>&1 &); sleep 1
node rec.mjs game.webm 16400 "$(cat cues_game.json)"
node rec.mjs end.webm 4700 '[[0,"music","menu"],[120,"sfx","legendary"]]'
ENC="-c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 48000 -ac 2"
A="aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo"
V="scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1"
VL="scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,setsar=1"
seg() { ffmpeg -y -loglevel error -i "$1" -i "$2" -filter_complex "[0:v]trim=0:$3,setpts=PTS-STARTPTS,$4[v];[v][1:v]overlay[vo];[0:a]atrim=0:$3,asetpts=PTS-STARTPTS,$A,afade=t=out:st=$(python3 -c "print($3-0.4)"):d=0.4[ao]" -map "[vo]" -map "[ao]" -t $3 $ENC "$5"; }
end() { ffmpeg -y -loglevel error -loop 1 -t 4.5 -i $1_bg.png -loop 1 -t 4.5 -i $1_logo.png -loop 1 -t 4.5 -i $1_cta.png -i end.webm -filter_complex "[0:v]scale=w='$2*(1+0.012*t)':h=-2:eval=frame,crop=$2:$3,fps=30,setsar=1[bg];[1:v]format=rgba,fade=t=in:st=0.15:d=0.6:alpha=1[lg];[2:v]format=rgba,fade=t=in:st=0.9:d=0.5:alpha=1[ct];[bg][lg]overlay[a];[a][ct]overlay,format=yuv420p[vo];[3:a]atrim=0:4.5,asetpts=PTS-STARTPTS,$A,afade=t=out:st=4.0:d=0.5[ao]" -map "[vo]" -map "[ao]" -t 4.5 $ENC $4; }
# vertical: rise cinematic 8 s · gameplay 15.8 s · boss cinematic 6.5 s · end card 4.5 s
seg rise.mp4 lab_cine_v.png 8 "$V" v1.mp4
ffmpeg -y -loglevel error -i gameplay.mp4 -i game.webm -i lab_game_v.png -filter_complex "[0:v]trim=0:15.8,setpts=PTS-STARTPTS,$V[v];[v][2:v]overlay[vo];[1:a]atrim=0:15.8,asetpts=PTS-STARTPTS,$A,afade=t=in:d=0.25,afade=t=out:st=15.4:d=0.4[ao]" -map "[vo]" -map "[ao]" -t 15.8 $ENC v2.mp4
seg boss.mp4 lab_cine_v.png 6.5 "$V" v3.mp4
end end_v 1080 1920 v4.mp4
printf "file 'v1.mp4'\nfile 'v2.mp4'\nfile 'v3.mp4'\nfile 'v4.mp4'\n" > list_v.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i list_v.txt -c copy -movflags +faststart soulswarm-ad-vertical-9x16.mp4
# landscape: wide cinematic 8 s · gameplay pillarboxed over the blurred key art 15.8 s · end card 4.5 s
seg wide.mp4 lab_cine_l.png 8 "$VL" l1.mp4
ffmpeg -y -loglevel error -loop 1 -t 15.8 -i bg_l.png -i gameplay.mp4 -i game.webm -i lab_game_l.png -filter_complex "[0:v]fps=30,setsar=1[bg];[1:v]trim=0:15.8,setpts=PTS-STARTPTS,scale=608:1080,fps=30,setsar=1[g];[bg][g]overlay=(W-w)/2:0[a];[a][3:v]overlay,format=yuv420p[vo];[2:a]atrim=0:15.8,asetpts=PTS-STARTPTS,$A,afade=t=in:d=0.25,afade=t=out:st=15.4:d=0.4[ao]" -map "[vo]" -map "[ao]" -t 15.8 $ENC l2.mp4
end end_l 1920 1080 l3.mp4
printf "file 'l1.mp4'\nfile 'l2.mp4'\nfile 'l3.mp4'\n" > list_l.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i list_l.txt -c copy -movflags +faststart soulswarm-ad-landscape-16x9.mp4
for f in soulswarm-ad-*.mp4; do echo "$f"; ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,width,height -of compact "$f"; done
echo RENDER_DONE
up() { curl -sS -o /dev/null -w "$1 %{http_code}\n" -X PUT -H "Content-Type: video/mp4" -H "If-None-Match: *" --upload-file "$2" "$3"; }
if [ -n "${UPLOAD_V:-}" ]; then up upload_v soulswarm-ad-vertical-9x16.mp4 "$UPLOAD_V"; fi
if [ -n "${UPLOAD_L:-}" ]; then up upload_l soulswarm-ad-landscape-16x9.mp4 "$UPLOAD_L"; fi
echo ALL_DONE
