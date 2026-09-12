# Reprise 0.2.0 alpha 1

Recover supported contiguous files from raw disk images, alongside the existing recording-repair workspace. The interface has two primary tools: **Repair recordings** and **Recover files**.

- Local browser worker; no upload, account or companion required for image scans.
- WAV, AVI, MP4/MOV, JPEG, PNG, ordinary ZIP and recognizable DOCX/XLSX/PPTX candidates.
- Guided source → scan → review/save flow, generated demo, cancellation, filters, paginated results, structural evidence and JSON reports.
- Send selected media candidates directly into repair. Preserve source bytes; save copies to healthy storage.
- 35 automated tests passed. Six public NIST disk images produced 15 candidates: 11 exact original matches and four nonmatching candidates. Every image's SHA-256 stayed unchanged. See the [full evidence](https://github.com/akhil29897/reprise/blob/main/docs/image-recovery.md).
- Independent parser review and browser checks covered demo recovery, a real NIST graphics image, save/report actions, repair handoff, stopping a 1 GiB sparse image scan, compressed-image rejection and mobile layout without horizontal overflow.

[Use Reprise](https://akhil29897.github.io/reprise/#recovery) · [Setup and limits](https://github.com/akhil29897/reprise/blob/main/docs/image-recovery.md)

This is an alpha, not universal recovery. Direct physical-drive acquisition, filesystem-aware undelete with original names/paths, fragmented-media reconstruction, encrypted/TRIMmed/overwritten data and unlisted formats are not implemented. Structural candidates can still be corrupt or incomplete. No paid-tool comparison or general success percentage is claimed.

This release changes the web app only. The existing [0.1 Mac companion package](https://github.com/akhil29897/reprise/releases/tag/v0.1.0-alpha.1) remains compatible for media repair; it is unsigned. No new native binaries are distributed. GitHub source archives contain project files; the original 0.1 companion release source package also includes its corresponding dependency sources. FFmpeg and optional untrunc are installed separately.
