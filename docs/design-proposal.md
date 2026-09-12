# Media repair: design proposal and camera coverage catalog

12 September 2026. Proposed design for review. No repair capability is implemented or verified yet. All coverage entries below are development targets, not supported-product claims. The catalog is an expandable starting list of camera families, not every camera ever manufactured.

## Agreed product direction

A free, fully open-source web application with an open-source local companion for Windows and macOS. First build repair of existing damaged audio/video files. Queue deleted creator-media recovery second, and general filesystem/drive recovery third. Include `.rsv` and broad camera coverage rather than restricting the product to one manufacturer.

## Recommended architecture

Use a web interface backed by a local repair worker. The first release needs access only to user-selected files; it does not need administrator rights or raw disks. Keep future privileged drive acquisition in a separate component that is not installed or activated as part of media repair alone.

Three implementation approaches were considered:

| Approach | Benefit | Tradeoff |
| --- | --- | --- |
| Local native worker with a web UI — recommended | Handles large media and native libraries; keeps private footage local; supports later drive recovery. | Requires secure pairing, signed releases, and Windows/macOS packaging. |
| Browser-only WebAssembly repair | No installation for selected-file tasks. | Codec availability, memory, output streaming, and browser differences constrain large/professional media. Add selectively after native correctness. |
| Cloud upload and processing | Central execution environment and potential managed-service revenue. | Upload delays, sensitive footage handling, storage and compute costs. Optional future service, not the default. |

Proposed modules: file identification, structural diagnosis, recording-profile catalog, repair planner, isolated repair engines, independent output validation, export/reporting, and a resumable local job queue. The web UI consumes a versioned API. Engines receive files and a bounded job description; they do not execute arbitrary UI-supplied commands or fetch plugins from untrusted sources.

Use Rust for orchestration and new binary parsing where appropriate. Evaluate FFmpeg and specialized open-source reconstruction tools instead of rebuilding all codec machinery. Pin, sandbox, and test the actual versions adopted. A generic FFmpeg wrapper cannot establish universal repair coverage.

## Coverage model

Each supported case is a combination of:

**Manufacturer + model + firmware + recording application/external recorder + container + codec/profile + resolution + frame rate + bit depth/chroma + audio layout + damage type.**

Support labels: planned, sample available, experimental, verified for stated damage cases, or currently unsupported. An unknown camera can still use generic format repair when its bytes identify a supported structure. A camera picker helps supply context; it is not a gate that rejects unlisted devices.

Detect file contents before trusting extensions. `.rsv`, `.dat`, `.tmp`, and extensionless files need inspection and provenance; their suffixes alone do not establish a universal format. Camera brand alone cannot determine codec or repair method.

## Initial camera and recording-source catalog

Representative models help organize sample collection. Exact model/mode/firmware support requires authoritative specifications and real fixtures before promotion to verified.

| Category | Manufacturers and families to include | Representative targets / distinctions |
| --- | --- | --- |
| Sony mirrorless and creator | Alpha a1/a7/a9/a6000 families; ZV; RX | a7S III, a7 IV, a7R V, a6700, ZV-E1, ZV-E10; XAVC S/S-I/HS must have separate profiles. |
| Sony cinema and professional | Cinema Line FX; FS; VENICE; XDCAM; Handycam | FX3, FX30, FX6, FX9; FS5/FS7; VENICE; older AVCHD/XDCAM cases. Do not assume all these devices generate RSV. |
| Canon | EOS R; EOS DSLR; Cinema EOS; XF/XA; PowerShot | R5/R5 C/R6 families; 5D/6D/7D; C50/C70/C80/C200/C300/C400/C500 families. Separate MP4, XF/MXF and Cinema RAW paths. |
| Panasonic | LUMIX GH/G/S; professional AG/AJ; EVA1; Varicam | GH4/GH5/GH5S/GH6/GH7, S1/S1H/S5/S5II/S5IIX, BGH1/BS1H. Research interrupted MDT recordings separately. |
| Nikon | Z; video-capable DSLR; Z Cinema | Z6/Z7 families, Z8/Z9, ZR, D750/D850. Internal recording and external RAW recording are separate profiles. |
| Fujifilm | X-H, X-T, X-S, video-capable GFX | X-H2/X-H2S, X-T4/X-T5, X-S10/X-S20, GFX video modes. |
| Blackmagic Design | Pocket Cinema; Cinema Camera; PYXIS; URSA; Micro; Video Assist | Pocket 4K/6K families, Cinema Camera 6K, PYXIS, URSA Mini/Pro/Cine. Distinguish BRAW, ProRes and legacy CinemaDNG. |
| RED | KOMODO; V-RAPTOR; DSMC/DSMC2; legacy RED ONE | R3D and proxy recording need separate reconstruction and validation. |
| ARRI | ALEXA Classic/Mini/LF/Mini LF/35; AMIRA | ProRes, ARRIRAW and newer recording formats require distinct investigation. |
| Other hybrid and cinema | OM System/Olympus; Leica; Sigma; Pentax/Ricoh; Z CAM; Kinefinity | Include video-capable models; Ricoh THETA gets a separate 360 profile. Research mode details before claiming support. |
| GoPro | HERO; Session; Fusion; MAX | Main recording, chapter splits, low-resolution proxies, telemetry, and 360 metadata. |
| DJI | Osmo Action/Pocket/360; Mavic; Mini; Air; Phantom; Inspire; Avata; FPV; Ronin 4D | Camera module and recording mode matter; preserve original segment and sidecar relationships. |
| Insta360 | ONE/ONE X/ONE R/ONE RS; X series; Ace; GO; Pro; Titan | INSV/MP4, lens-pair relationships, stabilization and stitching metadata. |
| Other action/360/drone | Autel; Skydio; YI; AKASO; Garmin VIRB; Kandao; Ricoh THETA | Generic repair first, device-specific profiles as samples arrive. |
| Phones and tablets | Apple iPhone/iPad; Samsung Galaxy; Google Pixel; Sony Xperia; Xiaomi; OnePlus; Oppo; Vivo; Huawei | Track camera/recording app, OS, variable frame rate, HDR and spatial-video modes. |
| External video recorders | Atomos Ninja/Shogun/Sumo; Blackmagic Video Assist/HyperDeck; AJA Ki Pro | Record the recorder model, firmware and codec; the attached camera may not define the file layout. |
| Security, dashcam and bodycam | Hikvision; Dahua; Axis; Hanwha; Reolink; Viofo; BlackVue; Thinkware; Nextbase; Garmin; Tesla; Axon | Separate standard exports from proprietary or encrypted originals. Unsupported encryption is not file corruption. |
| Webcam, capture and screen recordings | Logitech; Elgato; AVerMedia; OBS; QuickTime; Zoom; Teams; browser MediaRecorder | Recording software and its settings usually define the file structure more directly than the webcam. |
| Audio field and wireless recorders | Zoom H/F; Tascam DR/Portacapture/FR-AV; Sound Devices MixPre/6/8 Series; RODE; DJI Mic; Tentacle; Deity; Sony PCM/ICD; Olympus/OM | WAV/BWF/RF64, multitrack and split files, 32-bit float, timestamps, interrupted writes. |
| Other audio sources | Voice Memos; Android recorders; DAW exports; podcast software; audio interfaces | WAV, CAF, M4A/AAC, FLAC, MP3, Ogg/Opus and project-specific dependencies. |

Selected primary references establish the diversity of recording modes, not our repair success: [Sony FX30](https://www.sony.com/electronics/support/e-mount-body-ilme-fx-series/ilme-fx30/specifications), [Canon C50](https://www.usa.canon.com/newsroom/2025/20250909-consumer), [Panasonic GH7](https://help.na.panasonic.com/answers/features-and-specifications-lumix-g-series-model-dc-gh7/), [Nikon Z8](https://www.nikonusa.com/p/z-8/1698/overview), [Blackmagic PYXIS](https://www.blackmagicdesign.com/uk/products/blackmagicpyxis), [RED R3D](https://docs.red.com/955-0199/955-0199_V1.2_Rev_A_RED_PS_V-RAPTOR_Operation_Guide/Content/4_Menus/b_ProjSet/FileFormat.htm), [ARRI ARRIRAW](https://www.arri.com/en/learn-help/learn-help-camera-system/pre-postproduction/file-formats-data-handling/arriraw-faq), [DJI handheld families](https://www.dji.com/products/osmo), [Atomos Ninja](https://www.atomos.com/explore/ninja-series/), [Sound Devices audio formats](https://www.sounddevices.com/mixpre-ii-faq/).

## Format families and damage coverage

This is the target roadmap. Recognizing a format or decoding a healthy file does not prove damaged-file repair.

| Family | Examples | Repair methods to develop and test |
| --- | --- | --- |
| ISO Base Media / QuickTime | MP4, MOV, M4V, M4A, 3GP, fragmented MP4/M4S | Rebuild damaged indexes/sample tables where sufficient evidence remains; reconstruct unfinalized recordings; handle truncated tails and timestamp errors. Missing initialization metadata may require a reference. |
| Interrupted/device-specific recordings | Sony RSV; Panasonic MDT; device-specific DAT/TMP; INSV; LRV | Inspect actual layout, find surviving media, select a device/mode profile, validate reference compatibility, reconstruct container and tracks where possible. Proxies are useful evidence, not replacements for missing original detail. |
| Matroska / WebM | MKV, WebM, MKA | Resynchronize valid elements/clusters, rebuild seek data, preserve tracks and valid timing. |
| AVI / legacy containers | AVI, FLV, ASF/WMV/WMA, MPEG/MPG/VOB | Rebuild indexes or lengths where feasible, extract surviving packets, remux compatible streams. |
| Transport and segmented recordings | TS, MTS, M2TS; authorized local HLS/DASH segments | Recover surviving packets and timing; reconnect known segments; report absent segments. Playlists alone contain no replacement media. |
| PCM audio containers | WAV, BWF, RF64, Wave64, AIFF/AIFC, CAF | Repair chunk sizes/headers, preserve channel order, sample format, timestamps and metadata. If a header is gone, request or infer parameters with explicit uncertainty. |
| Compressed audio | MP3, AAC/ADTS, M4A/ALAC, FLAC, Ogg Vorbis/Opus, AMR | Find valid frames/pages, correct reconstructable metadata, salvage surviving samples and report gaps. |
| Broadcast / intermediate video | MXF, MOV with ProRes or DNxHD/DNxHR, XAVC, XDCAM, DV/DVCPRO | Format-aware essence extraction and index repair; preserve timecode and track layout. |
| RAW and specialized professional formats | BRAW, R3D, CRM, NEV/N-RAW, ARRIRAW, CinemaDNG, ProRes RAW | Dedicated research and sample-driven parsers. Verify open-source implementation feasibility and dependencies per format; proprietary-only SDK support must not be presented as a fully open-source engine. |
| Related assets for later expansion | JPEG/PNG/TIFF/HEIC/AVIF, camera still RAW, subtitles, sidecars, editing/DAW projects | Preserve and diagnose dependencies; separate repair adapters. General documents and archives belong to a separately scoped expansion. |

[FFmpeg documents a broad set of container readers/writers](https://ffmpeg.org/ffmpeg-formats.html); its demuxer list is not a repair guarantee. [Matroska defines recovery-relevant structural rules](https://www.matroska.org/technical/notes.html). [FLAC explicitly warns that decoding through errors can conceal missing samples](https://www.xiph.org/flac/documentation_tools_flac.html).

## RSV as an explicit engineering workstream

Evaluate the open-source [Repair RSV project](https://github.com/macmixing/repair-rsv), which describes Sony reconstruction using a healthy donor from the same recording mode and a patched untrunc engine. Treat its claimed capability as unverified until built, reviewed and tested. Preserve its attribution and license if used.

An [untrunc issue reports different behavior for Sony H.264 and XAVC HS/H.265 recordings](https://github.com/anthwlock/untrunc/issues/211). This is a historical report about particular versions, not proof of current universal failure or success.

The workflow should first inspect the damaged file and use surviving metadata. If it needs a healthy reference, explain how to select one. Check video codec, codec configuration, dimensions, bit depth, frame-rate behavior, audio layout and recording mode; do not blindly copy a header. Use a reference to supply encoding/container parameters, never its visual or audio content as alleged recovered material. Do not instruct users to make a reference recording on the affected original card.

## Repair pipeline

1. **Select files:** individual files, a batch, or an existing copied recording folder; retain optional sidecars and reference clips. No account or upload required.
2. **Diagnose:** identify structures/codecs; distinguish player incompatibility, container corruption, damaged media, incomplete transfer, encryption and empty data.
3. **Choose a strategy:** try lossless remux/index fixes where readable, then reconstruction; offer partial salvage if necessary. Do not repeat identical failed attempts.
4. **Repair to a new output:** preserve originals, use bounded memory and isolated workers, provide cancellation and engine-appropriate checkpoints.
5. **Validate independently:** read the output again; decode every available track when supported; check duration, timestamps, channels, error intervals and retained metadata. A preview is not full validation.
6. **Export:** show repaired files alongside a human-readable and machine-readable report recording engine versions, hashes, operations, dropped intervals and uncertainties.

Prefer lossless preservation of surviving compressed packets. Offer transcoding only as an explicit compatibility/salvage choice. Do not silently normalize audio, reduce bit depth, flatten channels, strip HDR/timecode/gyro metadata or conceal missing footage. Derived browser previews should be clearly identified and leave the exported master intact.

## Interface proposal

Use a calm, modern workspace: a file queue on the left, diagnostic and repair results in the main panel, and optional details. The primary flow is Add files → Diagnose → Repair → Review and save. Avoid requiring camera selection until detection needs help.

Show the camera and recording mode when known; let users correct uncertain detection. Provide video previews, audio waveforms, and an annotated timeline of usable or damaged intervals. Label outputs precisely: repaired structure, full decode completed, partially salvaged, reference required, unsupported, or no recoverable media detected. Report metadata preservation separately from picture/sound validation.

Use accessible contrast, keyboard support, restrained animation, readable type, accurate progress stages, and no artificial countdowns or success probabilities. Catalog searches must display verified coverage separately from planned coverage.

## How this can compete

Relevant media-repair competitors now include [Repairit](https://repairit.wondershare.com/tech-spec/), [Stellar](https://www.stellarinfo.com/disk-recovery/video-repair.php), [Grau Video Repair Tool](https://main.grauonline.de/video-repair-tool/), [Restore.Media](https://restore.media/home/faq), and [Aero Quartet/Treasured](https://aeroquartet.com/treasured/faq.en.html). Repairit already lists RSV and professional formats; Grau describes reference-assisted repair; Treasured offers tailored repairs running locally. None of those is a new differentiator by itself.

Our proposed combination: free unlimited exports, fully available engine source, local processing, explicit audio fidelity and metadata reporting, searchable evidence for each camera/mode, batch handling, reproducible repair recipes, and public comparisons including failed cases. These are design goals; superior repair or speed must be demonstrated.

## Test and release plan

Build a public corpus of synthetic/licensed healthy originals and derived corruptions: missing headers/indexes, unfinished writes, truncated tails, bit flips, zero-filled intervals, damaged timing, multiple tracks, segment loss, malformed sizes, and misleading extensions. Supplement with voluntarily contributed real camera failures under explicit permission; synthetic truncation is not a complete simulation of all interrupted recordings.

Test lossless packet preservation against known originals, decoded frame/sample content and duration, audio alignment, channels, timecode, HDR/rotation/gyro metadata, memory bounds, large-file processing, cancellation, destination safety, and Windows/macOS behavior. Use independent validators where possible and fuzz parsers. An output hash documents provenance; equality to an unknown original cannot be inferred from it.

Initial implementation sequence: file-only worker and job API; diagnostics; a verified MP4/MOV and WAV repair slice; Sony RSV profile evaluation and reconstruction; full validation/reporting; packaging and web UI; then broaden engine by engine through the catalog. Generic diagnostics can be broad from the start, while verified repairs expand through measured release gates. Do not release a camera-specific repair claim without fixtures for the claimed mode and damage classes.

## Hosting, openness and revenue

Host the static web UI and documentation on Cloudflare Pages or equivalent; put large signed installers and corresponding source in release hosting/object storage. [Cloudflare documents free static requests](https://developers.cloudflare.com/pages/functions/pricing/) and a [25 MiB Pages asset limit](https://developers.cloudflare.com/pages/platform/limits/). Repair data and computation remain local by default. Domains, signing, testing hardware, support and development still require funding.

Select an OSI-approved license after inspecting the exact reused components. Publish source for the UI and engines, build instructions, release hashes, dependency/license inventory, limitations, and versioned benchmarks. Keep all implemented algorithms and exports free. Do not depend on a proprietary hidden service for the promised core functions.

Validate revenue through paid expert assistance, studio support contracts, sponsored camera/format development, training and donations. Keep payment separate from unlocking recovered files. A later hosted repair service may charge for compute and operations with explicit upload consent and retention controls. No revenue or recovery guarantee is assumed.

## Decision for review

Approve or revise this phase-one architecture and catalog approach: broad camera/format intake, a searchable evidence-based coverage registry, and progressively verified repair engines, with Sony RSV explicitly included. This approval does not approve publication or assert that the proposed support already exists.
