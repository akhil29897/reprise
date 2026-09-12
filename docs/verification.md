# Reprise 0.2 recovery verification

13 September 2026, macOS Apple Silicon, Node 25.5.0. The browser/client suite now passes **35 tests** (19 new recovery cases plus the existing 16). No companion implementation changed.

Six public NIST images passed unchanged-source SHA checks. Eleven candidates match separately downloaded originals byte-for-byte; four do not. See [full recovery evidence](image-recovery.md), [machine-readable results](image-recovery-results.json), and [pinned fixtures](recovery-corpus.json).

Independent review reproduced and verified fixes for malformed EOF signatures incorrectly stopping scans, silent candidate-size limits, ZIP cache retention (69.7 MB → 4.22 MB in a sparse 1,000-entry probe), aggregate ZIP metadata budgets, and a JPEG cap-window regression. Dense false headers now reuse scan bytes instead of wasting parser I/O. This is not a formal security audit.

The in-app browser completed demo and real NIST graphics scans; save/report actions were exercised, and a recovered WAV reached the repair diagnostic workspace unchanged. A 390px-wide result screen had document width 390px. A 1 GiB sparse-image scan stopped after 24 MiB with explicit stopped status. A gzip input was refused with raw-image conversion guidance. Separate Safari/Firefox and Windows UI runtime tests remain outstanding.

---

# Reprise 0.1 verification

Run locally on 12 September 2026 on macOS Apple Silicon, FFmpeg/ffprobe 8.1. This is an engineering release with a bounded verified scope.

## Automated checks

- Browser engine and authenticated API client: 16 tests passed. Includes incorrect RIFF lengths, complete-byte preservation, incomplete samples, unsupported codecs, zero-length data ambiguity, fake extensions, missing MP4 index detection, large leading metadata with bounded reads, trailing metadata preservation, malformed request IDs, and token cleanup after failed pairing.
- Rust unit tests: 6 passed. Includes safe identifiers, authentication, display filename normalization, malformed Unicode percent encoding, cancellation during hashing/copying, and refusal to treat zero decode progress as usable media.
- Generated-media native acceptance suite: 6 tests passed. Groups cover actual H.264/AAC remux and SHA integrity, optional reference reconstruction (clean no-B-frame video and partial B-frame/AAC results), undecodable media, empty/garbage/network-playlist refusal, origin/host/auth/upload-limit checks, and missing AVI presentation timestamps.
- Release binary built successfully for the current Apple Silicon Mac. FFmpeg and untrunc remain external. No Windows or Intel Mac end-to-end media runtime test was performed in that local run. Subsequently, the [public GitHub CI run](https://github.com/akhil29897/reprise/actions/runs/34711592195) passed companion unit tests and release builds on macOS, Windows, and Linux, plus browser tests, on 13 September 2026 (India time). Those build/unit checks are distinct from full engine runtime validation.

## Browser integration

In the in-app browser, the real generated WAV sample repaired and played with a report and save action. A 3-second, 320×180 H.264/AAC MP4 was selected through the native file chooser, sent to the authenticated loopback companion, remuxed, and fully decoded on both tracks. Its browser preview reached readyState 4, duration 3 seconds, videoWidth 320 with no media error. Native API export bytes were checked against the reported output SHA in the acceptance suite.

The camera catalog search for RSV returned Sony Alpha/ZV and Sony Cinema Line research families. A 390px-wide viewport had no horizontal overflow. Desktop and narrow layouts were visually reviewed. The optional WebMCP tools were exercised with valid empty-object inputs; unexpected properties were rejected. Streaming save UI is implemented but a manual save-picker completion and every browser's hosted local-network permission flow have not been tested.

## Review and changes

An independent agent reviewed the code boundaries and reproduced a potential false playable-output claim when encoded packets survive but media is undecodable. The repair engine now requires observed decoded output, refuses candidates with none, and describes partial outputs without guaranteeing playback. That review found no other critical/high issue in the examined originals handling, loopback API, paths, escaping, or cancellation. This is not a formal security audit.

During implementation, regression checks also caught and fixed a UTF-8 percent-decoding panic, uninterruptible hashing/copying, an oversized browser header read, and loss of trailing metadata during WAV alignment repair.

## Public files and remaining limits

The separate public-sample benchmark records original URLs, hashes, baseline results and repair results. It is small and intentionally heterogeneous. It cannot establish a general success percentage, camera-wide coverage, or superiority over a paid recovery product. Native Sony RSV, proprietary camera RAW, physically damaged storage, SSD/HDD undelete, raw volumes, and filesystem recovery remain unverified or queued. There is no parser OS sandbox, installer signing, or automatic update service in this release.
