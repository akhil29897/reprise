#!/usr/bin/env bash
# Builds the Mac Apple Silicon release assets into companion/dist-release/.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
OUT="$ROOT/dist-release"
PKG="$OUT/reprise-macos-arm64"
rm -rf "$OUT" && mkdir -p "$PKG"
cargo build --release --locked --manifest-path "$ROOT/Cargo.toml"
bash "$ROOT/scripts/build-untrunc.sh"
cp "$ROOT/target/release/reprise-companion" "$ROOT/vendor/untrunc/untrunc" "$PKG/"
cp "$ROOT/packaging/macos/Start-Reprise.command" "$ROOT/packaging/macos/README.txt" "$ROOT/LICENSE" "$ROOT/THIRD_PARTY_NOTICES.md" "$PKG/"
cp "$ROOT/vendor/untrunc/COPYING" "$PKG/untrunc-COPYING.txt"
strip -x "$PKG/reprise-companion" "$PKG/untrunc"
# Corresponding source for the bundled untrunc: pinned upstream tree with Reprise patches applied.
git -C "$ROOT/vendor/untrunc" archive --format=tar --prefix=untrunc-9d86ec9-reprise/ HEAD | tar -x -C "$OUT"
for patch in "$ROOT"/scripts/untrunc-patches/*.patch; do
  patch -s -d "$OUT/untrunc-9d86ec9-reprise" -p1 < "$patch"
  cp "$patch" "$OUT/untrunc-9d86ec9-reprise/"
done
tar -czf "$OUT/untrunc-9d86ec9-reprise-source.tar.gz" -C "$OUT" untrunc-9d86ec9-reprise
rm -rf "$OUT/untrunc-9d86ec9-reprise"
(cd "$OUT" && zip -qry reprise-macos-arm64.zip reprise-macos-arm64 && shasum -a 256 reprise-macos-arm64.zip untrunc-9d86ec9-reprise-source.tar.gz > SHA256SUMS.txt)
cat "$OUT/SHA256SUMS.txt"
