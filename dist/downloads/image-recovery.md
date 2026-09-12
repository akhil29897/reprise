# Reprise 0.2 — recovery from disk images

Reprise now has two workspaces: **Repair recordings** and **Recover files**. Recovery is a guided source → scan → review/save flow. It runs locally in a browser worker and does not need the companion. The 0.1 companion remains compatible for media repair.

## Using it

1. Open [Recover files](https://akhil29897.github.io/reprise/#recovery).
2. Choose an uncompressed raw disk image, or **Try a demo image**. The demo contains one generated WAV surrounded by empty bytes.
3. Choose **Photos, video & audio**, or **All supported files** to include archives and documents. Start the scan; stop it at any time.
4. Review structural evidence and save individual candidates to a healthy drive. For audio/video, **Open in repair** sends a selected copy to the existing diagnostic workflow. Save the JSON report to retain offsets and scan status.

No files are uploaded. File/Blob slices read the selected image without write access. A scan finds recognizable contiguous byte sequences, including both existing and deleted content. Original names, folder paths and deletion status are unknown. Closing/reloading the tab loses the scan session; download results and reports before leaving. Reports can contain the source filename, so redact them before sharing publicly.

## Coverage

| Family                   | Boundary checks                                                                           | Important exclusions                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WAV                      | RIFF length, chunk sizes, format/data presence                                            | No full decode. Incorrect declared lengths can include extra disk bytes. RF64/Wave64 unsupported.                                                                                      |
| AVI                      | RIFF bounds, header and media lists                                                       | Initial RIFF only; OpenDML continuation segments are not joined. No full decode.                                                                                                       |
| MP4/MOV                  | Explicit box sizes, recognized ftyp brand, moov/mvhd and mdat                             | Requires an index; no RSV/missing-moov reconstruction here, no zero-to-EOF boxes, no sample-table validation. Pre-ftyp QuickTime files are not recognized.                             |
| PNG                      | Signature, chunk bounds, all chunk CRCs, IHDR/IDAT/IEND                                   | Pixel stream not decoded. Fragmented data normally rejected.                                                                                                                           |
| JPEG                     | Baseline/progressive frame markers, segment lengths, scan/end markers                     | Entropy not decoded. Fragmented/corrupt pictures can still yield a candidate.                                                                                                          |
| ZIP / DOCX / XLSX / PPTX | Local headers, central directory, matching names/sizes/CRC fields, relative offsets, EOCD | No payload decompression/CRC check. ZIP64, split/encrypted archives, data descriptors and self-extracting prefixes unsupported. Office extension inferred from canonical member names. |

Candidates are saved with generated names. A structural match is not proof of playability, original completeness, successful undelete, or authenticity. Nested candidates inside an accepted file are skipped. PDF, MP3, camera RAW, filesystem reconstruction and arbitrary format recovery are not implemented by this carver.

## Disk images and physical drives

An image is a file containing a sector-by-sector copy, not a folder export or photo. Reprise does not acquire images or open raw physical devices. Use a separate read-only imaging workflow; see [CGSecurity's ddrescue guide](https://www.cgsecurity.org/testdisk_doc/ddrescue.html). Store the image and recovered outputs on healthy storage. Repeated reads of failing hardware can worsen the situation; professional imaging may be appropriate.

Raw images can originate from Mac or Windows media, HDDs, SSDs or memory cards. The carver does not interpret APFS, HFS+, NTFS, FAT or exFAT allocation metadata. It cannot reassemble fragmentation, decrypt volumes, or recreate overwritten/TRIMmed bytes. Recognized encoded containers (including E01, compressed DMG and VHDX) are refused; conversion is external. A renamed container does not become a raw image, and unrecognized wrappers may produce misleading internal candidates.

## Resource limits

- Sequential scan buffer: 4 MiB plus signature overlap. Parser reads: at most 64 KiB; small cache refills use 4 KiB. Export uses Blob slices, not whole-image arrays.
- Per scan: 10,000 results, 100,000 signature attempts, and an aggregate read budget of max(16 × image size, 64 MiB).
- Per candidate: 64 GiB byte cap, 200,000 parser read operations, format-specific record/marker limits. ZIP retained metadata is capped at 8 MiB.
- Results are paginated in batches of 30. Only the selected page is rendered. Long scans do not keep an ever-growing DOM.
- Stop uses cooperative cancellation plus a one-second worker-termination fallback. Completed candidates remain available; the scan is explicitly marked stopped. Limits and read errors never become a successful completed scan.

These are engineering limits, not paid tiers. Large-image speed and file-backed Blob behavior depend on browser, RAM and storage. A worker is not a formal adversarial-parser sandbox. Only the in-app browser has been manually exercised in this release; separate Safari/Firefox/Windows browser validation is outstanding.

## Public NIST benchmark — 13 September 2026

Source: [NIST CFReDS file-carving images](https://cfreds-archive.nist.gov/FileCarving/index.html), [layouts](https://cfreds-archive.nist.gov/FileCarving/ImageLayouts.htm), and [original files](https://cfreds-archive.nist.gov/FileCarving/TestFiles/index.html). These are synthetic forensic datasets, not incidents involving customer files. No fixture media are redistributed by Reprise.

All six scans finished and each input's SHA-256 was unchanged after scanning. Five images contain unfragmented files; one contains non-sequential fragmentation. Exact matches below require SHA-256 equality with a separately downloaded NIST original, not just a playable preview.

| Image           | Candidates | Exact original matches | Interpretation                                                                                                                                                                                                                                        |
| --------------- | ---------: | ---------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L0_Graphic.dd   |          2 |                      2 | PNG and JPEG. Four other top-level formats are unsupported.                                                                                                                                                                                           |
| L0_Audio.dd     |          1 |                      0 | WAV preserves the complete original as a prefix, plus eight zero padding bytes. Its RIFF length incorrectly equals the original total file size instead of file size minus eight. This is **not** an exact recovery. MP3, AU and WMA are unsupported. |
| L0_Video.dd     |          3 |                      3 | MP4, AVI and MOV match. FLV, MPG and WMV are unsupported.                                                                                                                                                                                             |
| L0_Archive.dd   |          3 |                      1 | ZIP matches. Two additional JPEG candidates do not match the supplied top-level originals and are unverified; they are not counted as recovery wins. Six other top-level archive formats are unsupported.                                             |
| L0_Documents.dd |          5 |                      5 | Two XLSX, two DOCX and one PPTX match. PDFs are unsupported.                                                                                                                                                                                          |
| L2_Graphic.dd   |          1 |                      0 | Fragmented JPEG yields a shorter, nonmatching candidate. Fragmented PNG is rejected. No exact recovery.                                                                                                                                               |

**11 exact matches; four other candidates are not exact matches.** This is not a general recovery success rate: unsupported formats, alternate variants, encrypted/erased media and real camera fragmentation are not represented adequately. No comparison against a paid tool was run. Local Node 25 timings are recorded as observations, not browser speed guarantees or cold-disk benchmarks.

Reproducibility: [pinned fixture URLs, sizes and hashes](https://github.com/akhil29897/reprise/blob/main/docs/recovery-corpus.json) and [full result hashes](https://github.com/akhil29897/reprise/blob/main/docs/image-recovery-results.json).

```sh
# Python 3.11+, curl, Node 22+; allow about 1 GiB free for a fresh download.
python3 tools/download-recovery-corpus.py /path/on/healthy/drive/reprise-corpus
node tools/benchmark-recovery.mjs /path/on/healthy/drive/reprise-corpus report.json
npm test
```

Automated checks cover exact byte extraction, scan-block boundaries, scope filtering, malformed containers, CRC rejection, cancellation, limits, dense false signatures, and bounded reads. Browser checks cover demo scanning, a real NIST graphics image, saving actions, repair handoff, and a 390px-wide layout without horizontal overflow.

## Next recovery work

Direct physical-drive acquisition, filesystem-aware undelete with original paths, fragmented-media reconstruction, resumable large scans, more carvers and signed cross-platform installers remain separate roadmap items. They need their own implementations and evidence. The interface can retain the same source → scan → review structure as those capabilities are added.
