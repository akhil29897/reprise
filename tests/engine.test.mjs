import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectFile, repairWav, createDemoFile } from "../dist/engine.js";
function wav({
  declared = 16,
  riff = 52,
  format = 1,
  bits = 16,
  bytes = 16,
} = {}) {
  const a = new Uint8Array(44 + bytes),
    v = new DataView(a.buffer);
  for (const [at, s] of [
    [0, "RIFF"],
    [8, "WAVE"],
    [12, "fmt "],
    [36, "data"],
  ])
    for (let i = 0; i < s.length; i++) a[at + i] = s.charCodeAt(i);
  v.setUint32(4, riff, true);
  v.setUint32(16, 16, true);
  v.setUint16(20, format, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 48000, true);
  v.setUint32(28, (48000 * bits) / 8, true);
  v.setUint16(32, bits / 8, true);
  v.setUint16(34, bits, true);
  v.setUint32(40, declared, true);
  for (let i = 44; i < a.length; i++) a[i] = i % 256;
  return new File([a], "recording.wav");
}
test("diagnoses intact PCM without proposing unnecessary repair", async () => {
  const d = await inspectFile(wav());
  assert.equal(d.kind, "wav");
  assert.equal(d.repairable, false);
  assert.equal(d.metadata.sampleRate, 48000);
});
test("repairs incorrect RIFF length without changing a single audio byte", async () => {
  const f = wav({ riff: 0 });
  const d = await inspectFile(f);
  assert.equal(d.repairable, true);
  const out = await repairWav(f, d);
  const a = await out.blob.arrayBuffer();
  assert.equal(new DataView(a).getUint32(4, true), 52);
  assert.deepEqual(
    new Uint8Array(a).slice(44),
    new Uint8Array(await f.arrayBuffer()).slice(44),
  );
  assert.equal(out.report.validation.audioBytesPreserved, true);
});
test("truncated declared audio becomes explicitly partial, aligned output", async () => {
  const f = wav({ declared: 32, bytes: 15, riff: 68 });
  const d = await inspectFile(f);
  const out = await repairWav(f, d);
  assert.equal(out.report.status, "partial");
  assert.equal(
    new DataView(await out.blob.arrayBuffer()).getUint32(40, true),
    14,
  );
  assert.equal(out.blob.size, 58);
});
test("does not infer empty data length from arbitrary bytes", async () => {
  const d = await inspectFile(wav({ declared: 0 }));
  assert.equal(d.repairable, false);
  assert.match(d.summary, /length|reference|unresolved/i);
});
test("does not claim unsupported WAV codecs can be repaired", async () => {
  const d = await inspectFile(wav({ format: 6, riff: 0 }));
  assert.equal(d.repairable, false);
});
test("validates content instead of extension", async () => {
  const d = await inspectFile(new File(["hello there"], "fake.mp4"));
  assert.equal(d.kind, "unknown");
  assert.equal(d.repairable, false);
});
test("empty file cannot be repaired", async () => {
  assert.equal((await inspectFile(new File([], "empty.rsv"))).kind, "empty");
});
test("RSV without recognized structure requires reference and companion", async () => {
  const d = await inspectFile(new File([new Uint8Array(1024)], "clip.RSV"));
  assert.equal(d.kind, "camera");
  assert.equal(d.engine, "companion");
  assert.equal(d.repairable, false);
});
test("detects missing moov in a readable MP4 atom sequence", async () => {
  const a = new Uint8Array(32),
    v = new DataView(a.buffer);
  v.setUint32(0, 24);
  a.set(new TextEncoder().encode("ftypisom"), 4);
  v.setUint32(24, 8);
  a.set(new TextEncoder().encode("mdat"), 28);
  const d = await inspectFile(new File([a], "clip.mp4"));
  assert.equal(d.kind, "mp4");
  assert.equal(d.needsReference, true);
});
test("demo is real repairable audio with a bounded duration", async () => {
  const f = createDemoFile();
  const d = await inspectFile(f);
  assert.equal(d.repairable, true);
  assert.ok(d.metadata.duration > 0);
  const out = await repairWav(f, d);
  assert.equal(
    (await inspectFile(new File([out.blob], "fixed.wav"))).repairable,
    false,
  );
});
test("catalog search spans camera aliases and codecs without claiming support", async () => {
  const { catalog, searchCatalog } = await import("../dist/catalog.js");
  assert.ok(catalog.length >= 25);
  assert.ok(searchCatalog("RSV").some((x) => x.name === "Sony Cinema Line"));
  assert.ok(searchCatalog("32-bit", "Audio").length > 0);
  assert.equal(searchCatalog("no-such-camera").length, 0);
});
test("repair reads bounded header buffers even with a large leading metadata chunk", async () => {
  const original = wav({ declared: 32, bytes: 14, riff: 68 });
  const bytes0 = new Uint8Array(await original.arrayBuffer());
  const junk = new Uint8Array(2 * 1024 * 1024 + 8);
  junk.set(new TextEncoder().encode("JUNK"));
  new DataView(junk.buffer).setUint32(4, junk.length - 8, true);
  const blob = new Blob([bytes0.slice(0, 36), junk, bytes0.slice(36)]);
  const sizes = [];
  const tracked = {
    size: blob.size,
    name: "metadata.wav",
    slice(a, b) {
      const piece = blob.slice(a, b);
      const orig = piece.arrayBuffer.bind(piece);
      piece.arrayBuffer = () => {
        sizes.push(piece.size);
        return orig();
      };
      return piece;
    },
  };
  const d = await inspectFile(tracked);
  await repairWav(tracked, d);
  assert.ok(
    Math.max(...sizes) <= 64,
    `read ${Math.max(...sizes)} bytes into memory`,
  );
});
test("alignment repair preserves metadata following the audio data chunk", async () => {
  const source = wav({ declared: 15, bytes: 16, riff: 0 });
  const list = new Uint8Array(12);
  list.set(new TextEncoder().encode("LIST"));
  new DataView(list.buffer).setUint32(4, 4, true);
  list.set(new TextEncoder().encode("INFO"), 8);
  const file = new File([source, list], "metadata.wav");
  const out = await repairWav(file);
  assert.deepEqual(
    new Uint8Array(await out.blob.slice(-12).arrayBuffer()),
    list,
  );
  assert.equal(out.report.status, "partial");
});
