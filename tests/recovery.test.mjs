import { test } from "node:test";
import assert from "node:assert/strict";
import { scanImage, extractCandidate } from "../dist/recovery-engine.js";
import { createDemoFile, inspectFile, repairWav } from "../dist/engine.js";
import { deflateSync } from "node:zlib";
const enc = new TextEncoder();
const str = (s) => enc.encode(s);
const cat = (...parts) => Buffer.concat(parts.map((p) => Buffer.from(p)));
function u32(n, le = true) {
  const b = Buffer.alloc(4);
  le ? b.writeUInt32LE(n) : b.writeUInt32BE(n);
  return b;
}
function crc32(b) {
  let crc = -1;
  for (const byte of b) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const body = cat(str(type), data);
  return cat(u32(data.length, false), body, u32(crc32(body), false));
}
function png() {
  return cat(
    [137, 80, 78, 71, 13, 10, 26, 10],
    chunk("IHDR", cat(u32(1, false), u32(1, false), [8, 2, 0, 0, 0])),
    chunk("IDAT", deflateSync(Buffer.from([0, 22, 44, 66]))),
    chunk("IEND", []),
  );
}
function jpeg() {
  return cat(
    [255, 216, 255, 224, 0, 6, 255, 217, 0, 0],
    [255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0],
    [255, 218, 0, 8, 1, 1, 0, 0, 63, 0],
    [8, 255, 0, 6, 255, 208, 7, 255, 217],
  );
}
function box(type, bytes) {
  return cat(u32(bytes.length + 8, false), str(type), bytes);
}
function mp4() {
  return cat(
    box("ftyp", cat(str("isom"), u32(0), str("isom"))),
    box("mdat", [1, 2, 3, 4]),
    box("moov", box("mvhd", new Uint8Array(100))),
  );
}
function zip(name = "notes.txt", payload = str("hello world")) {
  const n = str(name),
    crc = crc32(payload);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(payload.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(payload.length, 24);
  central.writeUInt16LE(n.length, 28);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + n.length, 12);
  eocd.writeUInt32LE(30 + n.length + payload.length, 16);
  return cat(local, n, payload, central, n, eocd);
}
async function wav() {
  const f = createDemoFile();
  return new Uint8Array(
    await (await repairWav(f, await inspectFile(f))).blob.arrayBuffer(),
  );
}
async function result(parts, options = {}) {
  return scanImage(new Blob(parts), { chunkSize: 4096, ...options });
}

test("carves WAV at a byte-unaligned header across a scan boundary and exports exact bytes", async () => {
  const w = await wav(),
    source = new Blob([new Uint8Array(4093), w, new Uint8Array(17)]),
    r = await scanImage(source, { chunkSize: 4096 });
  assert.equal(r.status, "completed");
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].offset, 4093);
  assert.equal(r.candidates[0].size, w.length);
  assert.deepEqual(
    new Uint8Array(
      await extractCandidate(source, r.candidates[0]).arrayBuffer(),
    ),
    w,
  );
  assert.equal(r.scannedBytes, source.size);
});
test("finds consecutive media, image and archive candidates with exact boundaries", async () => {
  const pieces = [mp4(), png(), jpeg(), zip()];
  const r = await result(pieces);
  assert.deepEqual(
    r.candidates.map((c) => c.extension),
    ["mp4", "png", "jpg", "zip"],
  );
  assert.deepEqual(
    r.candidates.map((c) => c.size),
    pieces.map((p) => p.length),
  );
  assert.ok(r.candidates.every((c) => c.evidence.length > 0));
});
test("media scope excludes archives, retains photos", async () => {
  assert.deepEqual(
    (await result([zip(), png()], { scope: "media" })).candidates.map(
      (c) => c.extension,
    ),
    ["png"],
  );
});
test("PNG validates CRC and rejects a missing IEND", async () => {
  const p = png(),
    bad = Buffer.from(p);
  bad[45] ^= 1;
  assert.equal((await result([bad])).candidates.length, 0);
  assert.equal((await result([p.subarray(0, -12)])).candidates.length, 0);
});
test("JPEG marker parser ignores embedded EOI in metadata and handles stuffed entropy", async () => {
  const j = jpeg();
  assert.equal((await result([j])).candidates[0].size, j.length);
  assert.equal((await result([j.subarray(0, -2)])).candidates.length, 0);
  assert.equal(
    (await result([[255, 216, 1, 2, 3, 255, 217]])).candidates.length,
    0,
  );
});
test("rejects MP4 without moov and zero/overrunning size boxes", async () => {
  assert.equal(
    (await result([box("ftyp", str("isom0000")), box("mdat", [1, 2])]))
      .candidates.length,
    0,
  );
  assert.equal(
    (await result([box("ftyp", str("isom0000")), u32(0, false), str("mdat")]))
      .candidates.length,
    0,
  );
  const m = mp4();
  m.writeUInt32BE(0xfffffffe, 20);
  assert.equal((await result([m])).candidates.length, 0);
});
test("rejects RIFF lengths beyond source, malformed chunk sizes, and empty payload", async () => {
  const w = Buffer.from(await wav());
  w.writeUInt32LE(0xffffffff, 4);
  assert.equal((await result([w])).candidates.length, 0);
  assert.equal(
    (await result([str("RIFF"), u32(4), str("WAVE")])).candidates.length,
    0,
  );
});
test("ZIP rejects corrupt relative directory offsets and never uses embedded path as output name", async () => {
  const z = zip("../../unsafe.txt");
  const r = await result([z]);
  assert.equal(r.candidates.length, 1);
  assert.match(r.candidates[0].name, /^recovered_\d+\.zip$/);
  z.writeUInt32LE(999, z.length - 6);
  assert.equal((await result([z])).candidates.length, 0);
});
test("export rejects ranges outside source", () => {
  for (const c of [
    { offset: -1, size: 4 },
    { offset: 0, size: 100 },
    { offset: NaN, size: 1 },
    { offset: 0, size: 0 },
  ])
    assert.throws(() => extractCandidate(new Blob(["abc"]), c));
});
test("cancel retains previous results and does not claim scan completion", async () => {
  const ctl = new AbortController();
  const r = await result([png(), new Uint8Array(10000)], {
    signal: ctl.signal,
    onCandidate: () => ctl.abort(),
  });
  assert.equal(r.status, "cancelled");
  assert.equal(r.candidates.length, 1);
  assert.ok(r.scannedBytes < r.totalBytes);
});
test("result limits stop with explicit limited status", async () => {
  const r = await result([png(), png()], { maxResults: 1 });
  assert.equal(r.status, "limited");
  assert.equal(r.candidates.length, 1);
  assert.ok(r.warnings.length);
});
test("large inputs are read in bounded chunks, never a whole-image buffer", async () => {
  const source = new Blob([new Uint8Array(2 * 1024 * 1024), png()]);
  let max = 0;
  const tracked = {
    size: source.size,
    name: "disk.dd",
    slice(a, b) {
      max = Math.max(max, b - a);
      return source.slice(a, b);
    },
  };
  const r = await scanImage(tracked, { chunkSize: 4096 });
  assert.equal(r.candidates.length, 1);
  assert.ok(max <= 65536, `largest read: ${max}`);
});
test("empty and compressed images fail with actionable messages", async () => {
  await assert.rejects(() => scanImage(new Blob([])), /empty/i);
  await assert.rejects(
    () => scanImage(new Blob([new Uint8Array([31, 139, 8, 0, 0, 0, 0, 0])])),
    /compressed|raw/i,
  );
});
test("read failures propagate instead of silently reporting complete", async () => {
  await assert.rejects(
    () =>
      scanImage({
        size: 10000,
        slice() {
          return {
            arrayBuffer: async () => {
              throw new Error("disk read failed");
            },
          };
        },
      }),
    /disk read failed/,
  );
});
test("trailing incomplete signatures are rejected without stopping the scan", async () => {
  for (const tail of [
    str("RIFF"),
    new Uint8Array([137, 80, 78, 71]),
    jpeg().subarray(0, -1),
  ]) {
    const r = await result([new Uint8Array(32), tail]);
    assert.equal(r.status, "completed");
    assert.equal(r.candidates.length, 0);
  }
});
test("candidate byte cap is reported instead of silently losing valid files", async () => {
  const r = await result([await wav()], { maxCandidateBytes: 32 });
  assert.equal(r.status, "limited");
  assert.match(r.warnings.join(" "), /candidate|limit/i);
});
test("dense false headers do not spend full 64 KiB reads on tiny inspections", async () => {
  const b = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < b.length; i += 32) b.set(str("RIFF"), i);
  const r = await result([b, png()], { chunkSize: 65536 });
  assert.equal(r.status, "completed");
  assert.equal(r.candidates.length, 1);
});
test("JPEG inside candidate limit remains recoverable even with a large source tail", async () => {
  const j = jpeg();
  for (const maxCandidateBytes of [64, 65536]) {
    const r = await result([j, new Uint8Array(100000)], { maxCandidateBytes });
    assert.equal(r.status, "completed");
    assert.equal(r.candidates.length, 1);
    assert.equal(r.candidates[0].size, j.length);
  }
});
test("format record limits are explicit, not silently skipped candidates", async () => {
  const w = Buffer.from(await wav()),
    records = Buffer.alloc(10001 * 8);
  for (let i = 0; i < records.length; i += 8) records.set(str("JUNK"), i);
  const source = cat(w.subarray(0, 36), records, w.subarray(36));
  source.writeUInt32LE(source.length - 8, 4);
  const r = await result([source]);
  assert.equal(r.status, "limited");
  assert.match(r.warnings.join(" "), /record|limit/i);
});
