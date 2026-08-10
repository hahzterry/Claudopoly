#!/usr/bin/env bash
# build-video.sh — compose the LinkedIn cut from the two real recordings.
#
# Square 1:1, captions burned in, no audio. Everything on screen is real capture
# from the running build; only the caption bands are composited here. This
# ffmpeg has no drawtext, so captions are pre-rendered PNGs (make-captions.mjs).
set -euo pipefail
cd "$(dirname "$0")/.."

GAME=bench/video/gameplay-raw.webm
GATE=bench/video/refusal/refusal-raw.webm
CAP=bench/video/captions
OUT=bench/video/landlord-london-2026.mp4

# Letterbox the full 16:9 frame into a 1:1 canvas rather than cropping it. A
# centre crop was slicing the left and right columns off the board, and the
# resulting bands are exactly where the captions belong.
CROP="scale=1080:-2:flags=lanczos,pad=1080:1080:0:(1080-ih)/2:color=0x2A1710,setsar=1"
SC="scale=1080:-1"                       # captions were rendered at 2x

# ---- segment 1: the reversals and the spread (13s) --------------------------
ffmpeg -v error -y -ss 5.5 -t 13 -i "$GAME" \
  -i "$CAP/a1.png" -i "$CAP/a2.png" -i "$CAP/a3.png" -i "$CAP/a4.png" \
  -filter_complex "\
[0:v]${CROP}[bg];\
[1:v]${SC}[c1];[2:v]${SC}[c2];[3:v]${SC}[c3];[4:v]${SC}[c4];\
[bg][c1]overlay=0:60:enable='between(t,0.2,3.2)'[v1];\
[v1][c2]overlay=0:60:enable='between(t,3.6,6.4)'[v2];\
[v2][c3]overlay=0:60:enable='between(t,6.8,9.6)'[v3];\
[v3][c4]overlay=0:H-h-60:enable='between(t,10.0,12.9)'[v]" \
  -map "[v]" -an -t 13 -c:v libx264 -pix_fmt yuv420p -crf 19 -r 30 /tmp/seg1.mp4

# ---- segment 2: a real property card with its provenance (7s) ---------------
ffmpeg -v error -y -ss 30 -t 7 -i "$GAME" \
  -i "$CAP/b1.png" -i "$CAP/b2.png" \
  -filter_complex "\
[0:v]${CROP}[bg];[1:v]${SC}[c1];[2:v]${SC}[c2];\
[bg][c1]overlay=0:60:enable='between(t,0.3,6.8)'[v1];\
[v1][c2]overlay=0:H-h-60:enable='between(t,1.2,6.8)'[v]" \
  -map "[v]" -an -c:v libx264 -pix_fmt yuv420p -crf 19 -r 30 /tmp/seg2.mp4

# ---- segment 3: the gate refuses to start (8s) ------------------------------
ffmpeg -v error -y -ss 5 -t 8 -i "$GATE" \
  -i "$CAP/c1.png" -i "$CAP/c2.png" \
  -filter_complex "\
[0:v]${CROP}[bg];[1:v]${SC}[c1];[2:v]${SC}[c2];\
[bg][c1]overlay=0:60:enable='between(t,0.2,2.4)'[v1];\
[v1][c2]overlay=0:H-h-60:enable='between(t,4.4,7.9)'[v]" \
  -map "[v]" -an -c:v libx264 -pix_fmt yuv420p -crf 19 -r 30 /tmp/seg3.mp4

printf "file '/tmp/seg1.mp4'\nfile '/tmp/seg2.mp4'\nfile '/tmp/seg3.mp4'\n" > /tmp/concat.txt
ffmpeg -v error -y -f concat -safe 0 -i /tmp/concat.txt -c copy "$OUT"

# a still for the feed thumbnail, taken from the refusal hold
ffmpeg -v error -y -ss 26.5 -i "$OUT" -frames:v 1 bench/video/thumbnail.png

ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height \
  -of default=noprint_wrappers=1 "$OUT"
echo "wrote $OUT"
