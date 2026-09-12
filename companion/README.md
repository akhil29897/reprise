# Reprise companion 0.1

A GPL-3.0-or-later, file-only local repair service. No administrator rights, physical-drive access, or cloud media upload. This is an early engineering release, not a certified recovery product.

## Run from source

Install Rust using rustup from https://rustup.rs and install FFmpeg/ffprobe from a trusted distribution. On macOS with Homebrew, `brew install ffmpeg`. On Windows, place `ffmpeg.exe` and `ffprobe.exe` on PATH, or set `REPRISE_FFMPEG` and `REPRISE_FFPROBE` to their full paths.

```sh
cargo build --release
./target/release/reprise-companion
```

Windows PowerShell:

```powershell
cargo build --release
.\target\release\reprise-companion.exe
```

Open the Reprise web app, select Connect companion, and paste the pairing token printed in your terminal. Keep that terminal running while using the companion. Tokens are random on each launch. They are never part of a URL or sent to the web host.

The companion binds only to `127.0.0.1:47831`. Allowed origins are `https://akhil29897.github.io`, `http://127.0.0.1:4173`, and `http://localhost:4173`. For your own host, launch with `--origin https://your-domain.example` (exact origin, no trailing slash). The browser may ask to access your local network. For a browser that blocks hosted-to-local connections, run the included static web app locally on port 4173.

## Optional reference reconstruction

The normal install performs FFmpeg probing, lossless remux attempts, and full audio/video decode validation. To attempt missing-index reconstruction, build the pinned open-source untrunc engine:

```sh
# macOS: install build dependencies, including FFmpeg development headers
brew install ffmpeg yasm pkg-config
bash scripts/build-untrunc.sh
REPRISE_UNTRUNC="$PWD/vendor/untrunc/untrunc" ./target/release/reprise-companion
```

On Linux install the compiler, make, git, pkg-config, and FFmpeg development libraries first. On Windows, build upstream untrunc using its documented toolchain or select a reviewed upstream binary, then set `$env:REPRISE_UNTRUNC` to the absolute executable path. Windows integration is supplied but has not been run on a Windows host in this release.

Pinned upstream: https://github.com/anthwlock/untrunc at `9d86ec9ef2ffed1bf8131abe80742c0574db52b6`. It was built and tested against FFmpeg 8.1 on macOS Apple Silicon. Newer FFmpeg versions can break its private-structure assumptions; do not silently upgrade without tests. GPL source/build instructions must accompany redistribution.

Generated H.264 missing-moov fixtures have been repaired. A B-frame + AAC fixture produces timestamp errors and is explicitly partial. A no-B-frame video fixture passes full decode. These are synthetic MP4 tests, even when the input extension is `.rsv`; they do not establish Sony-camera RSV support. Real Sony RSV reconstruction remains experimental and requires camera/mode fixtures.

## Storage and limits

Default local data directories:
- macOS: `~/Library/Application Support/Reprise`
- Windows: `%LOCALAPPDATA%\Reprise`
- Linux: `$XDG_DATA_HOME/reprise` or `~/.local/share/reprise`

Use `--data-dir PATH` to choose a different location, preferably a different drive if your source media is suspect. Uploaded selections are copied to `files/<id>/input`; jobs and recovered outputs live under `jobs/<id>/`. The input copy remains immutable; reference engines operate on additional private copies. Budget space for source, donor, engine copies, and output. No automatic deletion occurs. Clearing the web queue only removes tab state. Stop the companion before manually deleting unwanted local job folders.

Uploads are streamed and capped at 64 GiB by default (`--max-upload BYTES`). One repair runs at a time with a bounded queue. Engine runs have a one-hour limit, a 4 GiB monitored resident-memory ceiling, capped output and logs. These are operational protections, not an OS security sandbox. Keep FFmpeg updated within tested compatibility and process only media you are authorized to inspect. No engine needs administrator privileges.

Cancellation stops and reaps active engine processes; jobs interrupted by companion restart are labeled interrupted rather than resumed mid-engine. Start a new job on the saved input to retry. Large uploads and hashing can take time. Input file formats are allowlisted and FFmpeg network protocols disabled. Non-media inputs, playlists, absent streams, unsafe IDs, invalid hosts/origins and missing tokens are rejected.

A successful full decode is evidence of readable output, not proof of the original recording’s completeness. Codec concealment, missing original footage, proprietary side data and metadata fidelity may remain unknown. Reports include raw stream metadata, warnings and hashes. Remuxing maps all streams; incompatible tracks cause failure rather than silent dropping.

Browser preview has a 128 MB convenience limit, and fallback blob downloads have a 256 MB memory-safety limit. These are not paid limits: use a browser with streaming file saves or access the output directly in the companion data folder for larger files.

## Development and tests

```sh
cargo test
cargo build
python3 tests/acceptance.py
```

Acceptance tests bind port 47831, use only generated fixtures in temporary folders, and require FFmpeg. The reference test additionally requires the pinned untrunc build; set `REPRISE_UNTRUNC` or build it under `vendor/untrunc`. Tests cover authentication, origin/host checks, malformed input, immutable source hashes, actual remux/decode and reference reconstruction. The repository Actions page records platform build checks; these are separate from full media runtime tests.
