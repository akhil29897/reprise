# Reprise 0.2.1 alpha 1

A new Mac companion that fixes reference repair of recordings with a missing index (unfinished MP4/MOV, and RSV-style files), using a healthy clip from the same camera and mode.

- **Complete recovery on busier scenes.** Recovery no longer stops at the first frame larger than those in the reference clip.
- **Correct frame order.** B-frame presentation order is rebuilt from the decoded video when the reconstruction engine drops it, so players and editors that honour timestamps no longer show frames out of sequence.
- **Audio in sync.** Edit lists for reorder delay and AAC priming are restored from the reference (previously a 21 ms drift), and the final audio chunk is kept.
- **Honest status.** Results are marked partial when reconstruction stops early; XAVC S-style repairs that were wrongly reported as failed now complete. Clearer errors for a mismatched reference.
- **Sony RSV mode.** Files that start with a Sony `rtmd` packet use untrunc's RSV mode. This path is not yet verified with camera files.
- **Reference repair included.** The download bundles a patched untrunc (GPL-2.0) that uses Homebrew's FFmpeg 8 libraries; `Start-Reprise.command` enables it when it runs.

Evidence: on a synthetic corpus (H.264 with and without B-frames, AAC, XAVC S-like H.264 + LPCM, XAVC HS-like HEVC 10-bit + LPCM, a recording cut at 70%, extreme-detail content, a wrong reference and a zeroed file), every surviving video frame and audio sample came back bit-identical, in presentation order; the wrong reference and zeroed file fail. These are generated files, not camera recordings. Real Sony RSV pairs from testers are the most useful contribution.

Assets: `reprise-macos-arm64.zip` (unsigned, unnotarized, Apple Silicon; requires `brew install ffmpeg`), `untrunc-9d86ec9-reprise-source.tar.gz` (corresponding source for the bundled untrunc), `SHA256SUMS.txt`. Windows and Intel Mac: build from source (`companion/scripts/build-untrunc.sh`, `cargo build --release`).
