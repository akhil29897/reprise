# Security and data handling

Early engineering release, not an independently audited or OS-sandboxed recovery service. All media processing is local. Host only the static website; never expose the native service through a public tunnel or bind it to a network interface.

The companion accepts a random bearer token, explicit Origin and Host allowlists, generated file/job IDs, binary uploads with a size ceiling, and fixed engine argument construction. FFmpeg accepts only allowlisted local media formats and file/pipe protocols. There is no shell command construction from filenames. New job outputs never overwrite the selected source.

Local data remains under the OS app-data directory or your `--data-dir` until manually deleted. Tokens rotate at launch and remain only in browser memory. Reports can contain filenames and metadata; inspect before sharing. Do not share pairing tokens or a complete local job directory publicly.

Native decoders and optional untrunc are external dependencies. Keep them patched and test compatibility. This release monitors resources but does not isolate the engines from the operating system. Before a broad public launch, add platform-specific parser isolation, installer signing/notarization, dependency advisory checks, fuzzing, and Windows runtime coverage. The provided CI build definition is not proof those gates have passed.

Report a vulnerability privately at https://github.com/akhil29897/reprise/security/advisories/new. Do not post tokens, sensitive recordings, or exploit details in public issues. There is no guaranteed response time for this volunteer project.
