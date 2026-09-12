# Reprise

**Free, open-source media repair. Your recordings stay on your computer.**

[Try the browser demo](https://akhil29897.github.io/reprise/) · [Downloads](https://github.com/akhil29897/reprise/releases/tag/v0.1.0-alpha.1) · [Benchmarks](docs/media-repair-benchmark.md) · [Setup guide](docs/SETUP.md)

Reprise is an early media-repair workbench for creators and developers. Repair supported WAV header/length faults in your browser, or connect a local companion for FFmpeg-based video/audio remux attempts, validation, and experimental reference reconstruction. Repair and export are free under GPL-3.0-or-later.

## Try it in a minute

1. Open the [public demo](https://akhil29897.github.io/reprise/).
2. Click **Try sample**, then **Repair in browser**.
3. Play the generated WAV and download its repair report.

The sample is synthetic and has a real damaged header. No account or private recording is needed. No media uploads, analytics, or paid export gates are implemented. Hosting providers still receive ordinary web requests.

## Use your own recordings

| Path | What is available today |
| --- | --- |
| Browser | Conservative PCM/IEEE-float WAV length repair, surviving-sample export, waveform/playback, JSON report. |
| Local companion | Stream-copy remux attempts; all-track mapping; full audio/video decode checks; SHA-256 reports; persistent jobs; cancellation. Requires FFmpeg/ffprobe. |
| Optional reference engine | Some missing-index MP4/MOV reconstruction using a matching healthy donor and pinned untrunc. Experimental. |
| Camera catalog | 26 research families. A listed camera is **not** a verified supported model. |

Download the **unsigned Mac Apple Silicon** development package from [Releases](https://github.com/akhil29897/reprise/releases/tag/v0.1.0-alpha.1), install FFmpeg/ffprobe, and follow its README. Windows and Intel Mac users can build from source; no signed consumer installer is supplied. See the [companion guide](companion/README.md).

**Real-camera Sony RSV remains unverified.** This release does not recover deleted files, scan raw drives, repair physically failing storage, or recreate erased bytes. A successful decode does not establish original completeness, A/V synchronization, or metadata fidelity. Do not rely on an alpha as your only copy or recovery path.

## Evidence, including failures

The initial local suite passed 16 browser/client tests, 6 Rust unit tests, and 6 generated-media acceptance tests. The [CI runs](https://github.com/akhil29897/reprise/actions/workflows/checks.yml) show the actual current platform build status; a build is not full runtime validation.

Six public problem files were tested: **2 validated remuxes, 2 partial candidates, 2 failures**. Both validated inputs already decoded beforehand, so those are not new recovery wins. [Read every result and its limitations](docs/media-repair-benchmark.md). No paid-tool superiority or universal recovery claim is made.

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

Roadmap: camera-mode fixtures → more verified repair paths → safer parser isolation and signed releases → deleted-media recovery → broader drive/filesystem recovery. [Launch plan and post drafts](docs/LAUNCH.md).

## License and funding

New code is [GPL-3.0-or-later](LICENSE). External components retain their licenses; see [third-party notices](companion/THIRD_PARTY_NOTICES.md). The full source release includes dependency sources used for the supplied Mac build. FFmpeg and optional untrunc executables are installed separately.

Repair, export, and self-hosting stay free. Optional expert assistance, studio support, and sponsored format work are possible future funding paths; no paid service, billing, or donation account is configured today.
