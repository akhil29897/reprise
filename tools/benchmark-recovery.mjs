// node tools/benchmark-recovery.mjs /path/to/recovery-corpus [report.json]
// Fixtures are acquired separately; never included in the repository.
import { openAsBlob } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { scanImage, extractCandidate } from "../dist/recovery-engine.js";
const folder = process.argv[2];
if (!folder)
  throw new Error(
    "Provide the directory prepared by download-recovery-corpus.py.",
  );
const root = resolve(folder),
  output = resolve(process.argv[3] || join(root, "benchmark-results.json"));
const manifest = JSON.parse(
  await readFile(new URL("../docs/recovery-corpus.json", import.meta.url)),
);
async function sha256(blob) {
  const hash = createHash("sha256");
  for await (const bytes of blob.stream()) hash.update(bytes);
  return hash.digest("hex");
}
const originals = new Map();
for (const entry of manifest.originals) {
  const blob = await openAsBlob(join(root, "originals", entry.name));
  if (blob.size !== entry.bytes || (await sha256(blob)) !== entry.sha256)
    throw new Error(`Original fixture mismatch: ${entry.name}`);
  originals.set(entry.sha256, entry.name);
}
const results = [];
for (const entry of manifest.images) {
  const source = await openAsBlob(join(root, entry.name));
  if (source.size !== entry.bytes || (await sha256(source)) !== entry.sha256)
    throw new Error(`Image fixture mismatch: ${entry.name}`);
  const started = performance.now(),
    scan = await scanImage(source),
    elapsedMs = Math.round(performance.now() - started);
  for (const candidate of scan.candidates) {
    candidate.sha256 = await sha256(extractCandidate(source, candidate));
    candidate.exactOriginalMatch = originals.get(candidate.sha256) || null;
  }
  const record = {
    image: entry.name,
    imageSha256: entry.sha256,
    elapsedMs,
    sourceUnchanged: (await sha256(source)) === entry.sha256,
    ...scan,
  };
  results.push(record);
  console.log(
    `${entry.name}: ${scan.status}, ${scan.candidates.length} candidates, ${scan.candidates.filter((c) => c.exactOriginalMatch).length} exact original matches`,
  );
}
await writeFile(
  output,
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      runtime: process.version,
      method: "contiguous-signature-carving",
      results,
    },
    null,
    2,
  ) + "\n",
);
