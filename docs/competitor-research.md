# Open-source media recovery: initial product research

Research date: 12 September 2026. Status: historical discovery notes. Implementation now exists; see the release guide and benchmark for the current verified scope.

## Confirmed direction

The user selected an online web interface with an installable, open-source companion for macOS and Windows. The user subsequently selected media repair first, with creator-media recovery and general drive recovery queued afterward. Broad camera coverage and Sony `.rsv` cases are explicit priorities. The updated phase-one proposal is in `media-repair-design-proposal.md`; it supersedes the external-storage-first recommendation below.

The product should offer free recovery, transparent source code, excellent media handling, and a calm, modern interface. Commercial success and universal recovery cannot be guaranteed.

## Feasibility boundaries

Standard browser file APIs provide user-authorized access to existing files and directories. A browser can analyze selected damaged media or a disk-image file, but it does not thereby gain raw access to a physical disk's unallocated sectors. A native companion supplies that access. This is an architectural inference from [Chrome's File System Access documentation](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access); [Microsoft documents privileged direct disk access](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilea) separately.

Deletion does not always destroy file contents, but recoverability depends on remaining bytes, metadata, fragmentation, encryption, and device behavior. TRIM and garbage collection can make deleted SSD content inaccessible or erase it. Merely detecting that TRIM is enabled does not prove the history of a particular file. See [Kingston's SSD explanation](https://www.kingston.com/en/ssd/ssd-faq) and [empirical SSD retention research](https://dfrws.org/sites/default/files/session-files/2011_USA_paper-empirical_analysis_of_solid_state_disk_data_retention_when_used_with_contemporary_operating_systems.pdf).

Modern Mac internal storage deserves its own support investigation: OS access, filesystem support, and encryption are separate problems. Raw access does not remove encryption. [Apple explains FileVault volume encryption](https://support.apple.com/guide/security/volume-encryption-with-filevault-sec4c6dc1b6e/web).

The product must distinguish recovering deleted bytes, repairing a damaged media container, and salvaging playable portions. Generating replacement frames or audio is not recovery of the original recording.

## Competitor landscape

These are documented vendor capabilities, not independent comparative test results.

| Tool | Documented capability | Proposed competitive response |
| --- | --- | --- |
| [PhotoRec](https://www.cgsecurity.org/wiki/PhotoRec) | Free, open-source, cross-platform carving; read-only source access. | Preserve unlimited recovery while making setup, results, and media validation easier to understand. |
| [Disk Drill](https://www.cleverfiles.com/help/advanced-camera-recovery-in-disk-drill.html) | Camera-specific reconstruction of fragmented recordings, including multiple video streams. | Treat fragmented camera recovery as a serious benchmark requirement, not a novel feature we can claim to invent. |
| [R-Studio](https://www.r-studio.com/data-recovery-software/) | Broad filesystem support, RAID reconstruction, imaging, remote recovery, and professional inspection tools. | Establish focused media quality before pursuing equivalent filesystem and storage breadth. |
| [DMDE](https://dmde.com/manual/editions.html) | Free recovery limited to 4,000 files from the active panel per operation; paid editions expand recovery and professional functions. | No artificial file-count or export limits; accessible workflow and free reports. |
| [Recoverit](https://recoverit.wondershare.com/video-recovery.html) | Advertises fragment matching for recoverable video data. | Publish versioned datasets, complete failures, and reproducible validation rather than a universal success percentage. |

PhotoRec's documentation explicitly describes limitations with fragmented camera videos and a limited two-fragment workaround. This is evidence for a real engineering challenge, not evidence that our unbuilt engine will outperform it. [PhotoRec video documentation](https://www.cgsecurity.org/testdisk_doc/photorec_video.html).

## Approaches and recommendation

1. **Web interface plus native companion — selected.** Best match for online discovery and local physical-drive recovery. Costs include signed installers, secure browser pairing, update infrastructure, and testing on both operating systems.
2. **Browser only.** Suitable for selected media files and disk images; simpler distribution, but does not satisfy direct deleted-file recovery from drives.
3. **Desktop first with a supporting website.** Simplifies the privileged/local application boundary, but changes the requested online experience. Remains a fallback if browser integration proves too restrictive.

Separate workstreams should cover drive acquisition, filesystem recovery, media repair/reconstruction, the user interface, public benchmarks, and release/distribution infrastructure. Hosting and monetization should remain independent of access to recovered files.

## Proposed first release

Start with creator media on external storage and raw disk images. Implement an end-to-end, testable slice before advertising broad support: a documented FAT32/exFAT subset, recoverable unfragmented MP4/MOV and WAV files, and explicit validation outcomes. The same host application can run on Windows and macOS without implying NTFS or APFS recovery support.

Add NTFS metadata recovery, MP3/FLAC and additional containers/codecs, controlled fragmented-video reconstruction, and damaged-container repair in subsequent measured increments. APFS/HFS+, internal startup drives, encrypted volumes, RAID/NAS, and physically failing devices require separate scope and validation. Container recognition alone is not codec support or proof of recovery.

This earlier recommendation is superseded by the user's selection of media repair first. Retain it as the queued drive-recovery workstream, not the current release scope.

## Engineering direction

- Use a Rust core with separate interfaces for block reads, image acquisition, filesystem parsers, carving, media validation, and export. Keep the UI independent of recovery algorithms.
- Give a small privileged process only the device-access operations it needs. Run parsers and decoders without administrator rights, with resource limits.
- Authenticate the browser-to-companion session, restrict origins and local connections, prevent arbitrary command execution, and require explicit native device authorization. A local service must not trust a request merely because it reaches localhost.
- Open the source read-only; save recovered files, logs, checkpoints, temporary data, and images on a different physical device. Account for OS background writes; read-only application handles alone are not a hardware write blocker.
- Prefer an image before repeated analysis when appropriate. Detect read errors, limit retries, and stop escalating scans on failing media. Do not market software as a hardware repair service.
- Stream bounded chunks instead of loading entire drives into memory. Preserve scan state across interruptions and minimize repeated disk reads. Tune sequential access for HDDs; bound parallel work rather than assuming more threads always help.
- Reuse established open-source components where their behavior, platforms, and licenses fit. [GNU ddrescue](https://www.gnu.org/software/ddrescue/manual/ddrescue_manual.html) documents resumable acquisition with mapfiles; native Windows integration needs separate evaluation.
- Evaluate [untrunc](https://github.com/anthwlock/untrunc) for truncated MP4/MOV repair using a healthy reference recording. Its dependency compatibility must be tested before adoption.
- Publish source, build instructions, dependency versions and licenses, signed release hashes, security reporting instructions, and a truthful support matrix. Choose the project license after checking the actual dependency combination; [FFmpeg's applicable license depends on its build configuration](https://www.ffmpeg.org/legal.html).

## Interface direction

A guided sequence: choose source → assess device and incident → scan/image → inspect results → export to a safe destination.

Use restrained colors, strong typography, accessible contrast, keyboard navigation, and clear progress descriptions. Explain permission requests at the point of use. Offer video thumbnails, audio waveforms, recovered-duration information, readable filenames when metadata survives, and an expandable technical report.

Result labels should state evidence: detected, extracted, partially decoded, full decode completed, or exact original match when a trusted reference hash exists. Playback or a thumbnail alone cannot establish original-file completeness. Show missing intervals and uncertain reconstruction instead of an unexplained confidence percentage.

## How to establish competitive quality

Use [NIST's file-carving test framework](https://www.nist.gov/itl/csd/secure-systems-and-applications/computer-forensics-tool-testing-program-cftt/cftt-3) and [its audio/video test images](https://cfreds-archive.nist.gov/FileCarving/index.html) as a starting point, supplemented by modern recordings and realistic deletion/formatting workflows. The NIST image collection includes different fragmentation patterns and missing fragments; it is not a complete modern-camera benchmark.

Publish results by filesystem, codec/container, device/camera model, incident, and tool version. Compare on identical images and hardware. Measure exact-file matches, correctly decoded duration, missing/corrupted intervals, false positives, time to first verified result, total scan time, peak memory, and disk I/O. Include zero-filled, encrypted, overwritten, malformed, cancelled, and disconnected-input cases.

Release requirements should include tested source-write prevention, destination separation, bounded memory, resumability, parser fuzzing, and recovery correctness against known originals. Claims of superiority should name the tested case and date. No public benchmark can justify saying the product always beats every competitor.

## Hosting

Serve the static web application, documentation, and benchmark pages from Cloudflare Pages or an equivalent static host. Connect the public repository to a build pipeline and custom domain; distribute larger installers separately through release hosting/object storage with matching source archives and checksums.

Cloudflare currently documents free, unlimited static-asset requests, with separate limits for builds and functions. Pages has a 25 MiB per-asset limit, so installer and large WebAssembly placement must be planned. [Pricing](https://developers.cloudflare.com/pages/functions/pricing/), [limits](https://developers.cloudflare.com/pages/platform/limits/).

Recovery computation and media stay on the user's machine by default. This keeps server demand low; domain registration, signing/distribution, hardware testing, support, and development still cost money. A future optional upload service would need its own pricing, retention, privacy, and operating design.

## Monetization consistent with free recovery

Keep all recovery algorithms, export, and self-hosting available free under the selected open-source license. Proposed revenue streams are paid expert assistance, studio/team support contracts, sponsored device support, funded integrations, training, and donations. Optional managed services can charge for labor or infrastructure while their software remains open source.

Start by validating demand with creators and studios. Offer a clearly scoped paid support service before building subscriptions or billing infrastructure. Donations can help but should not be assumed to cover ongoing engineering. Revenue, conversion rates, and customer willingness to pay remain unvalidated.

## Next decisions

The user has resolved the release use case: media repair first, broad camera coverage, including RSV. Review the updated media-repair design proposal, then establish delivery constraints and produce an implementation plan. Broad camera coverage is an ambition to validate incrementally, not a claim of existing support.
