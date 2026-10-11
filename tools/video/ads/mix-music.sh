#!/usr/bin/env bash
# Lay the music under a rendered ad (v3 recipe, see STYLE.md).
#   ./mix-music.sh <dir> <out.mp4> [music.mp3]
# The track's drop (15.5 s in) lands on phrase 6, the TIME = MONEY turn.
set -euo pipefail
dir=$1; out=$2; music=${3:-"$(dirname "$0")/money-vertical/music/1.mp3"}
video="$dir/$(basename "$dir").mp4"
read -r offset dur < <(python3 -c "
import json;T=json.load(open('$dir/timeline.json'));print(round(15.5-T['phrases'][6]['start'],3),T['duration'])")
fade_at=$(python3 -c "print(max(0,$dur-2.2))")
ffmpeg -v error -y -i "$video" -ss "$offset" -i "$music" -filter_complex "
[0:a]asplit=2[v][sc];
[1:a]volume=0.55,afade=t=in:d=0.6,afade=t=out:st=$fade_at:d=2.2[m];
[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[duck];
[v][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$out"
echo "$out"
