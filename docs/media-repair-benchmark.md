# Reprise: public damaged-media benchmark

Tested 12 September 2026, Reprise 0.1, macOS Apple Silicon, FFmpeg/ffprobe 8.1.

**Six internet samples tested: two validated remuxes, two partial candidates, and two failures. None establishes complete restoration of a known original.** The two validated inputs already decoded without errors before processing, so they are not counted as new recovery successes.

## Collection and method

The [FFmpeg/MPlayer sample archive](https://samples.ffmpeg.org/) is a useful bank of obscure and problematic media. Its [README permits individual sample downloads](https://samples.ffmpeg.org/00-README) and explains that the collection includes broken files. This run selected six small files from explicitly broken/problem directories. Historical player-bug samples may already be handled by current decoders; filenames alone do not prove current damage.

Downloaded originals were kept intact. Each was hashed with SHA-256, decoded before repair using FFmpeg with network protocols disabled, then passed through the real Reprise companion API. Candidate outputs were probed and each audio/video stream decoded. A separate combined decode checked frame counts and remaining errors. All six original hashes remained unchanged. Third-party recordings are not redistributed in the website or source package.

No matching healthy reference recordings were available for these files. This run used automatic probing/remuxing, not reference reconstruction. Synthetic reference tests are documented separately and do not count as internet-camera recovery evidence.

## Results

| Public sample | Before processing | Reprise result | Evidence and interpretation |
| --- | --- | --- | --- |
| [apple_cv.mov](https://samples.ffmpeg.org/mov/broken-movs/apple_cv.mov), 461,301 bytes | Missing mandatory atoms; zero decoded frames | **Failed** | No readable media packets. No repaired output offered. A zero exit code from the baseline decoder did not mean playable media existed. |
| [ctk_cpro.mov](https://samples.ffmpeg.org/mov/broken-movs/ctk_cpro.mov), 680,605 bytes | Missing mandatory atoms; zero decoded frames | **Failed** | No readable media packets. No matching donor or supported structural reconstruction was available. |
| [Mansha.avi](https://samples.ffmpeg.org/avi/bad-index/Mansha.avi), 539,136 bytes | 54 decoded video frames; no decode errors | **Validated remux** | Both tracks decode without reported errors after remux; still 54 video frames. Output container duration 1.802 seconds. Existing decodability, not demonstrated recovery of lost footage. |
| [broken_index1.avi](https://samples.ffmpeg.org/avi/bad-index/broken_index1.avi), 10,913,332 bytes | 747 decoded video frames; one error line | **Partial** | 30.04-second container, 747 decoded frames after repair, three decode/error lines including timestamp issues. Damaged macroblock remains. Do not interpret the duration or successful exit code as complete recovery. |
| [eof_garbage.wav](https://samples.ffmpeg.org/A-codecs/wavpcm/eof_garbage.wav), 22,048 bytes | About 0.124535 seconds of PCM; no decode errors | **Validated remux** | Readable PCM retained in Matroska, reported container duration 0.125 seconds. Browser diagnosis found no supported structural fault; native remux is not proof of a new repair. |
| [broken-first-frame.mp3](https://samples.ffmpeg.org/A-codecs/MP3/broken-first-frame.mp3), 102,400 bytes | About 4.258 seconds; invalid backstep error | **Partial** | Same decode error remains after remux. Some audio decodes, but the damaged compressed frame was not reconstructed. |

End-to-end local API processing took approximately 0.22–0.79 seconds per small file in this run, excluding internet downloads. These are single-run observations, not a speed benchmark against competitors or an estimate for large camera recordings.

## What testing changed

The public AVI initially produced only a 0.024-second candidate because missing presentation timestamps prevented Matroska muxing. Generating missing timestamps for AVI inputs increased the candidate to 30.04 seconds. A generated AVI with B-frames now verifies that path in the acceptance suite. Remaining corrupt media and timing errors still cause a partial result. The decoded frame count did not exceed what the baseline decoder could already read.

Independent review also identified that packets alone must never establish playable recovery. Reprise now requires observed decoded media, refuses outputs where none is verified, and labels partial candidates without guaranteeing playback.

## Limits and next corpus

This is a six-file regression exercise, not a representative recovery-success estimate. There is no trusted original hash for the damaged recordings, no perceptual quality or lip-sync certification, and no paid-tool comparison. Decode error-line counts are diagnostic, not numbers of damaged frames. Container duration can differ from decoded duration because of timestamps and rounding.

The next useful collection is consented camera footage with matching healthy donors and known originals: Sony RSV across H.264/H.265 and XAVC S/S-I/HS; Canon/Nikon/Panasonic MP4/MOV; DJI/GoPro interruptions; multichannel PCM/BWF/RF64, CAF and field-recorder power loss. Preserve model, firmware, mode, frame rate, audio layout, incident, and exact ground truth. These remain coverage targets, not supported-camera claims.

For the queued deleted-file work, [NIST CFReDS file-carving images](https://cfreds-archive.nist.gov/FileCarving/index.html) offer a separate bank covering fragments and missing data. They require drive/image recovery engines and were not tested by this file-repair release.

## Reproduce

The source package contains `tools/download-corpus.py`, `tools/benchmark-corpus.py`, and `docs/benchmark-results.json`. Run the downloader to fetch the same six URLs, start the companion, set `REPRISE_BENCH_TOKEN` to its startup token, then run the benchmark script. Samples, outputs, and logs stay in the tools directory locally. The benchmark script uses Python's Unix `resource` module and was run on macOS; it requires adjustment for Windows. Keep the original file hashes and engine versions when comparing future changes.
