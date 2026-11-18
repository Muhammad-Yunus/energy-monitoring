#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p scripts/fixtures

ffmpeg -y -f lavfi -i "testsrc2=size=1280x720:rate=10:duration=10" \
  -c:v libx264 -preset veryfast -profile:v main -pix_fmt yuv420p \
  -b:v 600k -maxrate 700k -bufsize 1400k -g 20 \
  -movflags +faststart -an \
  scripts/fixtures/sample-720p.mp4

ls -lh scripts/fixtures/sample-720p.mp4
