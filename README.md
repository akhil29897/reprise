# Reprise

**Free, open-source media repair and disk-image recovery. Your files stay on your computer.**

[Try the browser demo](https://akhil29897.github.io/reprise/) · [Downloads](https://github.com/akhil29897/reprise/releases/tag/v0.2.1-alpha.1) · [Repair benchmark](docs/media-repair-benchmark.md) · [Recovery benchmark](docs/image-recovery.md) · [Setup guide](docs/SETUP.md)

Reprise is an early repair and recovery workbench for creators and developers. Two focused workflows keep recording repair separate from file recovery. Repair supported WAV header/length faults in your browser, or connect a local companion for FFmpeg-based video/audio remux attempts, validation, and experimental reference reconstruction. Repair and export are free under GPL-3.0-or-later.

## Try it in a minute

1. Open the [public demo](https://akhil29897.github.io/reprise/).
2. Click **Try sample**, then **Repair in browser**.
3. Play the generated WAV and download its repair report.

The sample is synthetic and has a real damaged header. No account or private recording is needed. No media uploads, analytics, or paid export gates are implemented. Hosting providers still receive ordinary web requests.

## Recover files from a disk image

Open **Recover files** → choose a raw `.dd`, `.img` or `.raw` image (or try the generated demo) → scan → review/save candidates. It runs in your browser, without a companion or upload. Choose media only or all supported formats. Stop scans, filter results, save a report, and send a media candidate to the repair workspace.

Contiguous WAV, AVI, MP4/MOV, JPEG, PNG, ordinary ZIP and recognizable Office ZIP containers are supported within [documented limits](docs/image-recovery.md). This does not open physical drives or rebuild filesystems, paths, fragmented files, encrypted media or erased bytes. A candidate is not a guarantee of completeness or usability.

## Repair your recordings

| Path                      | What is available today                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser                   | Conservative PCM/IEEE-float WAV length repair, surviving-sample export, waveform/playback, JSON report.                                                 |
| Local companion           | Stream-copy remux attempts; all-track mapping; full audio/video decode checks; SHA-256 reports; persistent jobs; cancellation. Requires FFmpeg/ffprobe. |
| Optional reference engine | Some missing-index MP4/MOV reconstruction using a matching healthy donor and pinned untrunc. Experimental.                                              |
| Camera catalog            | 26 research families. A listed camera is **not** a verified supported model.                                                                            |

Download the **unsigned Mac Apple Silicon** development package from [Releases](https://github.com/akhil29897/reprise/releases/tag/v0.2.1-alpha.1), install FFmpeg/ffprobe, and follow its README. Windows and Intel Mac users can build from source; no signed consumer installer is supplied. See the [companion guide](companion/README.md).

**Real-camera Sony RSV remains unverified.** Disk-image carving may find surviving deleted or existing files; it cannot distinguish them. This release does not scan physical drives, repair physically failing storage, or recreate erased bytes. A successful decode does not establish original completeness, A/V synchronization, or metadata fidelity. Do not rely on an alpha as your only copy or recovery path.

## Evidence, including failures

The 0.2 browser/client/carving suite passes 35 tests. The initial native release passed 6 Rust unit tests, and 6 generated-media acceptance tests. The [CI runs](https://github.com/akhil29897/reprise/actions/workflows/checks.yml) show the actual current platform build status; a build is not full runtime validation.

Six public problem files were tested: **2 validated remuxes, 2 partial candidates, 2 failures**. Both validated inputs already decoded beforehand, so those are not new recovery wins. [Read every result and its limitations](docs/media-repair-benchmark.md). No paid-tool superiority or universal recovery claim is made.

Six public NIST disk images were also scanned: **11 candidates exactly match supplied originals; four others do not**. Every image remained unchanged by SHA-256. The fragmented-image test recovered no exact original. [Read recovery methods, limits and reproduction steps](docs/image-recovery.md).

## Run locally and develop

The website has no package dependencies or build step. From a clone:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
# Open http://127.0.0.1:4173
```

With Node 22+ and an installed Rust toolchain:

```sh
npm test
cd companion
cargo test --locked
cargo build --release --locked
./target/release/reprise-companion
```

On Windows, run `.\target\release\reprise-companion.exe`. Install FFmpeg/ffprobe separately. Paste the companion's startup token into **Connect companion** in the web app. The public demo and local web origins are allowed; self-hosters must add their exact origin with `--origin`. The pairing token stays in tab memory.

[Full setup, storage, hosting, and dependency instructions](docs/SETUP.md) · [Security and private vulnerability reports](SECURITY.md)

## Help make coverage real

We need reproducible bug reports, matching healthy/damaged camera samples you own or may share, Windows runtime testing, and parser-isolation work. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting media. Never attach client footage, secrets, or sensitive metadata to a public issue.

Report a reproducible bug through [Issues](https://github.com/akhil29897/reprise/issues/new/choose). Start with the camera/mode, damage event, OS, and a redacted report. Sample submission is voluntary and does not guarantee repair.

Roadmap: camera-mode fixtures → more verified repair paths → safer parser isolation and signed releases → physical-drive acquisition → filesystem-aware undelete → fragmented-media recovery. Disk-image carving is available now. [Launch plan and post drafts](docs/LAUNCH.md).

## License and funding

New code is [GPL-3.0-or-later](LICENSE). External components retain their licenses; see [third-party notices](companion/THIRD_PARTY_NOTICES.md). The full source release includes dependency sources used for the supplied Mac build. FFmpeg and optional untrunc executables are installed separately.

Repair, export, and self-hosting stay free. Optional expert assistance, studio support, and sponsored format work are possible future funding paths; no paid service, billing, or donation account is configured today.
