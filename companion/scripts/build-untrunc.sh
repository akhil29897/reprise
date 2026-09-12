#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
mkdir -p "$ROOT/vendor"
if [[ ! -d "$ROOT/vendor/untrunc/.git" ]]; then
  git clone https://github.com/anthwlock/untrunc.git "$ROOT/vendor/untrunc"
fi
git -C "$ROOT/vendor/untrunc" checkout --detach 9d86ec9ef2ffed1bf8131abe80742c0574db52b6
if [[ "$(uname -s)" == Darwin ]]; then
  prefix=$(brew --prefix ffmpeg)
  make -C "$ROOT/vendor/untrunc" CPPFLAGS="-I$prefix/include" LDFLAGS="-L$prefix/lib"
else
  make -C "$ROOT/vendor/untrunc"
fi
printf '\nSet REPRISE_UNTRUNC to: %s\n' "$ROOT/vendor/untrunc/untrunc"
