# Disk-image recovery implementation plan

> Execute task by task using the executing-plans workflow; verify before integrating.

**Goal:** Add useful deleted-media and other-file recovery without crowding the repair workspace.

**Architecture:** Two primary destinations, Repair recordings and Recover files. Recovery is a single source → scan → save flow with a media/all-supported-types selector. An isolated module worker carves contiguous candidates from a user-selected raw disk image using bounded reads; no companion, upload, filesystem mutation, or elevated access is required. Results are byte ranges, saved with Blob slices and optionally handed to existing repair. The browser is never told that a structural candidate is a complete recovered original.

**Tech stack:** Existing vanilla ES modules, File/Blob API, module Web Worker, Node's built-in test runner. No new dependencies.

## Constraints

- Preserve the existing repair workflow and companion API.
- Offer WAV, AVI, MP4/MOV, JPEG, PNG and ordinary single-disk ZIP (including recognizable Office ZIP containers). Never claim arbitrary format or filesystem support.
- Accept raw uncompressed images; reject recognized compressed/forensic containers with an explanation. Do not expose raw-device pickers that do nothing.
- All input access is read-only. Export copies, generated names, original byte offsets, structural evidence, limitations, and scan completion status. Save to another healthy drive.
- Scan sequentially in bounded buffers. Bound parser work and result count. Cancellation returns already discovered candidates; limits/read errors must never appear as a completed scan.
- Deleted status, names, paths, fragmentation, overwritten/TRIMmed bytes, encrypted volumes and physical-drive acquisition remain outside this release.

## Tasks

### 1. Carving engine
Files: `dist/recovery-engine.js`, `dist/recovery-formats.js`, `tests/recovery.test.mjs`.
Interface: `scanImage(source, {scope, signal, onProgress, onCandidate, chunkSize, maxResults, maxCandidateBytes})` returns `{status, scannedBytes, totalBytes, candidates, warnings}`. Candidates contain `{id, offset, size, extension, category, mime, evidence, name}`; no whole-file buffers. `extractCandidate(source, candidate)` bounds-checks and returns a Blob slice.
- [x] Write offset/hash equality tests for nested raw images, boundary-crossing headers, scope filtering, truncation, corrupt lengths, JPEG markers, PNG CRC, ZIP directories, malformed MP4 boxes, cancellation, limits and bounded reads.
- [x] Run `node --test tests/recovery.test.mjs` and confirm the absent module fails.
- [x] Implement parser boundary validation and the bounded scanner; run `npm test` until the new and existing cases pass.

### 2. Guided recovery UI
Files: `dist/recovery-worker.js`, `dist/recovery.js`, `dist/index.html`, `dist/styles.css`, small integration in `dist/app.js`.
Worker receives `{type:'start', file, scope}` or `{type:'cancel'}` and posts progress, candidate, done, or error. Main thread owns source Blob and exports. Existing `addFiles` receives explicitly selected recovered media for repair.
- [x] Add separate Recover files navigation; remove stale planned-only sidebar labels, place limitations in contextual help.
- [x] Add source selection, a generated demo image, scope selector, progress/cancel, filtered paginated results, per-file save, repair handoff and JSON report. Hide result controls until useful.
- [x] Check local browser desktop and mobile, real demo scan/save/repair, cancellation and invalid input. Ensure navigation preserves recovery state and filenames use text nodes.

### 3. Evidence and publication
Files: `docs/image-recovery.md`, benchmark tooling/report, README and deployed guide.
- [x] Run supported formats against public NIST contiguous-file disk images, compare candidate hashes with originals where available, record unsupported and fragmented limitations. Do not redistribute public fixtures.
- [x] Review all changes, run the entire browser suite, verify asset syntax and changed UI. Existing native binary is unchanged.
- [ ] Commit and integrate to main, push the authorized public repository, wait for CI/Pages, verify deployed recovery assets and demo. Publish current source via the repository link; retain the clearly versioned existing companion download.
