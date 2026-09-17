#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  print 'Install FFmpeg and ffprobe first. With Homebrew: brew install ffmpeg'
  read '?Press Return to close.'
  exit 1
fi
# The bundled untrunc links to Homebrew FFmpeg 8 libraries; without them, run without reference repair.
if ./untrunc -V >/dev/null 2>&1; then
  export REPRISE_UNTRUNC="$PWD/untrunc"
  print 'Reference repair (MP4/MOV/RSV with a healthy clip) is available.'
else
  print 'Reference repair unavailable: bundled untrunc needs Homebrew FFmpeg 8 (brew install ffmpeg).'
fi
print 'Keep this terminal open. Copy the pairing token into Connect companion.'
exec ./reprise-companion
