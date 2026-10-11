#!/bin/sh
# Rebuilds f/ (real app footage) from the tools/video captures. Crops are in source pixels (1440x900).
R=../../renders; set -e
mkdir -p f/map f/prog f/inv
ffmpeg -v error -y -ss 26 -t 6  -i $R/where-everyone-is/capture/*.webm -vf "fps=30,crop=720:368:139:440" -q:v 2 f/map/%04d.jpg
ffmpeg -v error -y -ss 22 -t 20 -i $R/start-to-finish/capture/*.webm   -vf "setpts=PTS/3,fps=30,crop=840:300:100:120" -q:v 2 f/prog/%04d.jpg
ffmpeg -v error -y -ss 31 -t 5  -i $R/your-first-invoice/capture/*.webm -vf "fps=30,crop=790:790:335:95" -q:v 2 f/inv/%04d.jpg
