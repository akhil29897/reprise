# Third-party components

New Reprise code: GPL-3.0-or-later.

The companion uses Rust crates pinned in Cargo.lock. Their exact license/source metadata can be generated with `cargo metadata --format-version 1`. Core direct dependencies: tiny_http (MIT/Apache-2.0), serde/serde_json (MIT/Apache-2.0), sha2 (MIT/Apache-2.0), uuid (MIT/Apache-2.0), libc (MIT/Apache-2.0), chrono (MIT/Apache-2.0), sysinfo (MIT); tempfile is a development dependency (MIT/Apache-2.0).

FFmpeg and ffprobe are external executables, not included in the companion binary. Their license depends on build options (LGPL/GPL); see https://ffmpeg.org/legal.html. Install them separately. Distributors bundling them must provide all required corresponding source and notices.

Optional untrunc: https://github.com/anthwlock/untrunc, pinned commit 9d86ec9ef2ffed1bf8131abe80742c0574db52b6, GPL-2.0-or-later. Copyright and license in upstream COPYING and source headers remain in force. The release source includes upstream source separately; the optional executable is not bundled in the portable companion download.

The Sony-specific macmixing/repair-rsv project was researched, but no code from it is incorporated in this release. Reprise does not claim its camera-specific capabilities.
