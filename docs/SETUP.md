# Reprise — free, local media repair

Reprise 0.1 is an early, working media-repair release. All repair and export features are free. New code is GPL-3.0-or-later. No media is sent to a cloud service. The website and companion are separate so that the media engines run on your own computer.

## Try it

Open the website and select **Try sample**, then **Repair in browser**. This creates and repairs a real synthetic WAV, with playback and a downloadable report. You can select your own PCM/IEEE-float WAV files for the supported structural repairs.

For video, use **Connect companion**. The macOS Apple Silicon development download contains a command-line executable and launcher. Install FFmpeg/ffprobe separately; with Homebrew, run `brew install ffmpeg`. Unzip the download and run `./Start-Reprise.command` in Terminal. Paste the printed pairing token into the web app. This build is unsigned and not notarized; it is an engineering preview, not a signed consumer installer. Intel Mac and Windows users can build from source below. Windows runtime testing has not been completed.

A browser may request local-network permission before connecting to the companion. If it blocks connections from the hosted app, run the website locally:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Then open http://127.0.0.1:4173. There is no npm installation or web build step. Node 22 or newer is used for `npm test`.

## Build the companion

Install Rust from https://rustup.rs and FFmpeg/ffprobe from a trusted distribution. From this source package:

```sh
cd companion
cargo build --release --locked
./target/release/reprise-companion
```

Windows PowerShell uses `.\target\release\reprise-companion.exe`. FFmpeg and ffprobe must be on PATH, or configured with the `REPRISE_FFMPEG` and `REPRISE_FFPROBE` environment variables containing their absolute paths. See `companion/README.md` for storage, limits, and reference-engine setup.

The release source ZIP includes the Rust dependency sources used by the Mac build, their upstream licenses, and pinned untrunc source under `third_party/`. Cargo resolves build dependencies using Cargo.lock; the first build requires internet access and an installed Rust toolchain. Dependency sources are supplied for transparency and redistribution compliance, not as a complete offline toolchain.

For experimental missing-index reconstruction, build the optional upstream engine using `companion/scripts/build-untrunc.sh`. It requires compiler tools and FFmpeg development headers. Set `REPRISE_UNTRUNC` to its absolute executable path before starting the companion. The optional executable and FFmpeg binaries are not included in our Mac download.

## What this release does

- Browser: conservative RIFF/WAV PCM and IEEE-float length repair, complete surviving sample export, metadata preservation, waveform for 16-bit PCM, playback, and JSON reports.
- Companion: content probing, all-track stream-copy remux attempts, missing AVI timestamp generation, individual audio/video decode validation, SHA-256 reports, persistent jobs, cancellation, and streamed input/output.
- Optional untrunc: healthy-reference reconstruction of some missing-index MP4/MOV recordings. Generated fixtures pass or return partial results depending on encoding mode.
- Catalog: 26 camera/recording families with models, containers, and research notes. Catalog entries are planned coverage, not a claim every listed camera works.

The native format allowlist currently covers MOV/MP4, Matroska/WebM, AVI, MXF, MPEG-TS/PS, FLV, Ogg, WAV, MP3, AAC, FLAC, and ASF. Actual repair depends on the installed codecs, surviving media, and output-container compatibility. Recognized AIFF/CAF/RF64 and proprietary raw camera formats do not imply a verified repair path. Files that cannot retain all streams in the selected output container fail rather than silently dropping tracks.

Real Sony `.rsv` repair remains experimental and unverified with camera-generated fixtures. A synthetic MP4 renamed `.rsv` is explicitly not camera validation. No software can guarantee recovery of overwritten, erased, encrypted-without-keys, or absent bytes. Full decoding proves readability, not original completeness, synchronization, visual fidelity, timecode, or complete metadata preservation.

## Source and safety

Original selected files are never opened for writing. Native inputs are streamed into a private local data folder; reconstruction operates on further private copies. The web app uses no third-party scripts, fonts, analytics, or media upload service. Pairing uses a random token held only in tab memory; the service binds to 127.0.0.1 and restricts hosts, origins, methods, IDs, and engine protocols. It needs no administrator rights.

Media parsers are not placed in a full OS sandbox in this release. Resource limits reduce runaway jobs but do not eliminate parser vulnerabilities. Uploaded copies, reports, and outputs persist on disk until you remove them. Clearing the web queue does not delete these files. Stop the companion before manually clearing its data directory. See `SECURITY.md`.

## Hosting your own copy

This is a static website. Serve `dist/` on any HTTPS static host; keep the companion on each user's computer. The public demo is at https://akhil29897.github.io/reprise/ and the source repository is https://github.com/akhil29897/reprise. Downloadable releases include the source and corresponding dependency notices.

For Cloudflare Pages, create a repository containing this source, connect it to Pages, choose no framework, use `exit 0` as the build command if required, and set the output directory to `dist`. No environment secrets or server-side media storage are needed. Use your own domain when ready. Start the companion with `--origin https://your-exact-domain.example` to allow the new website origin. Do not use a wildcard origin. Test hosted-to-loopback pairing in the browsers you support; retain the local web option.

Cloudflare Pages documents a 25 MiB per-asset limit; use release storage for larger future installers. See https://developers.cloudflare.com/pages/framework-guides/deploy-anything/ and https://developers.cloudflare.com/pages/platform/limits/ for current host instructions and limits. Domain, signing, hardware testing, support, and development may still cost money even when static hosting fits a free plan.

## Sustainable monetization

Keep repair, export, source, and self-hosting free. Begin with optional paid expert assistance and studio support contracts; price labor and response times, never the release of a user's recovered output. Add sponsored camera-format work, training, integrations, and donations once there is demand. Managed enterprise deployment can be paid while the software remains open source.

Before charging, validate demand with creator/studio interviews and small paid pilots. Measure support hours per incident, conversion, repeat use, and satisfaction. Publish benchmark failures alongside successes. No revenue or competitive superiority is guaranteed. There is no billing, subscription, telemetry, or payment collection in this release.

## Validation and roadmap

Run `npm test` for browser engines and API client tests. Run `cargo test --locked` from `companion`. Build the debug binary and optional untrunc, then run `python3 tests/acceptance.py` from that directory for generated FFmpeg integration tests. GitHub Actions passed the browser suite and companion unit tests/release builds on macOS, Windows, and Linux on 13 September 2026 (India time). See https://github.com/akhil29897/reprise/actions/runs/34711592195. Full Windows media-repair runtime tests remain outstanding.

See `docs/verification.md` and `docs/media-repair-benchmark.md` for exact evidence. Internet samples are linked and hashed; third-party media are not redistributed in source or web downloads.

Next: camera-mode fixtures and safer parser isolation; more verified audio/container repair strategies; signed installers and Windows runtime tests; then external-storage deleted-media recovery; then broader filesystem/drive recovery. SSD TRIM, encryption, fragmentation, and physically failing storage each require separate testing. Nothing in this release scans raw drives.
