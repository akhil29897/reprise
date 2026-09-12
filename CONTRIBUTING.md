# Contributing to Reprise

Contributions should make repair claims more accurate, preserve original media, and add reproducible evidence. New code is contributed under GPL-3.0-or-later. Preserve upstream license and copyright notices.

## Report a bug

Use the bug report template. Include the app version, OS/browser, FFmpeg version, container/codec, the damage event, expected behavior, and the actual result. Redact local paths and sensitive metadata. Do not paste pairing tokens or upload private/client footage in an issue. Vulnerabilities belong in the private advisory channel linked in SECURITY.md.

## Propose a camera fixture

First describe the camera, firmware, recording mode, codec, frame rate, dimensions, audio layout, and interruption event. State whether a healthy matching donor and trusted original are available. Do not attach recordings initially: explain size and rights, then agree on a suitable sharing method. Consent to test is not consent to redistribute; state separately whether a fixture can be included in the public suite. Never record a donor onto an affected card.

Prefer short synthetic clips or recordings of objects you own, without people, conversations, location data, or client work. Keep original SHA-256 hashes and record exactly how damage was created. Do not call a renamed synthetic MP4 a real Sony RSV fixture.

## Send a change

Open a focused issue or pull request explaining the concrete fault and observable improvement. Add a regression fixture or generated test when behavior changes. Run `npm test` and `cargo test --locked` in companion. For engine changes, also run generated-media acceptance tests with FFmpeg and the pinned optional untrunc available; see companion/README.md.

Never silently discard tracks, overwrite inputs, fetch network references from media, hide failures, or label empty/undecodable output as repaired. A full decode does not establish completeness. Include limitations and failed cases in proposed support claims.

Priorities are verified camera-mode coverage, platform runtime testing, parser isolation, bounded resource use, and accurate validation. Keep recovery and export free. Be respectful and concrete in discussions; maintainers may close abusive or repetitive submissions.
