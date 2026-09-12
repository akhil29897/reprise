# Reprise v0.1.0-alpha.1

First public alpha of the Reprise local media-repair workbench.

**Try the browser sample:** https://akhil29897.github.io/reprise/

- Conservative PCM/IEEE-float WAV structural repair in the browser, with playback and a JSON report.
- Rust companion for local FFmpeg probing/remux attempts, per-track decode validation, persistent jobs, cancellation, and hashes.
- Experimental optional untrunc integration for matching-reference MP4/MOV reconstruction.
- Camera research catalog and a transparent public-sample benchmark.

## Downloads

- `reprise-macos-arm64.zip`: unsigned, unnotarized Mac Apple Silicon development executable and launcher. Install FFmpeg/ffprobe separately and follow README.txt. This is not a signed consumer installer.
- `reprise-source.zip`: application source, build instructions, Mac dependency sources/licenses, and pinned optional untrunc source. The first source build needs an installed Rust toolchain and internet access.
- `SHA256SUMS.txt`: integrity checksums for the two ZIPs.

Windows and Intel Mac users should build from source. CI artifacts are development artifacts, not signed releases. CI build success alone is not runtime validation. FFmpeg and untrunc executables are not bundled.

## Evidence and limitations

The local validation suite passed 16 browser/client tests, 6 Rust unit tests, and 6 generated-media acceptance tests on macOS. The repository's Actions page records remote platform checks separately.

Six public problem files produced two validated remuxes, two partial candidates, and two failures. The clean inputs already decoded before processing, so those are not new recovery successes. Read the full benchmark in `docs/media-repair-benchmark.md`.

Real-camera RSV support is unverified. No deleted-file/raw-drive recovery, OS parser sandbox, automatic updater, or universal recovery guarantee is provided. Original completeness, synchronization, and metadata fidelity can remain unknown even after successful decoding. Preserve original copies and inspect reports.

This alpha adds the public GitHub Pages origin to the companion's explicit allowlist. Media and pairing tokens stay local. New application code is GPL-3.0-or-later; third-party components retain their notices.
