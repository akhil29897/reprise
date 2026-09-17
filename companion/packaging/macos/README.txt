Reprise companion v0.2.1-alpha.1 — unsigned Mac Apple Silicon build

Install FFmpeg/ffprobe with Homebrew: brew install ffmpeg
Unzip, open Terminal in this folder, then run: ./Start-Reprise.command
If macOS blocks the unsigned files, run once: xattr -dr com.apple.quarantine .
Keep the terminal open. Paste the startup token into Connect companion at:
https://akhil29897.github.io/reprise/
Stop with Ctrl-C. No administrator access is required.

Reference repair: add the damaged recording (.MP4/.MOV/.RSV), choose a healthy
clip recorded by the same camera in the same mode, then Run local repair.
The bundled untrunc (patched, GPL) uses Homebrew's FFmpeg 8 libraries.

Tested on generated H.264/HEVC recordings with missing indexes: every surviving
frame and audio sample came back identical, in order and in sync. Real-camera
Sony RSV recovery is still unverified. No deleted-file or raw-drive recovery.

This is unsigned and unnotarized; it is not a signed consumer installer.
New Reprise code is GPL-3.0-or-later; see LICENSE and THIRD_PARTY_NOTICES.md.
untrunc is GPL-2.0; see untrunc-COPYING.txt. Its corresponding source is
untrunc-9d86ec9-reprise-source.tar.gz on the release page:
https://github.com/akhil29897/reprise/releases/tag/v0.2.1-alpha.1

Local media copies and results persist in ~/Library/Application Support/Reprise
until you remove them with the companion stopped. Originals are never opened
for writing. Full decode is evidence of readability, not proof of completeness.
