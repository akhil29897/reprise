import { signatureAt } from "./recovery-formats.js";
const MiB = 1024 * 1024;
class CandidateLimit extends Error {}
class InvalidCandidate extends Error {}
function cancelled(signal) {
  if (signal?.aborted) throw new DOMException("Scan cancelled.", "AbortError");
}
// Cache random-access parser reads, never holding an entire candidate in memory.
class Reader {
  constructor(source, start, end, signal, onRead) {
    Object.assign(this, { source, start, limit: end, signal, onRead });
    this.end = source.size;
    this.retainedBytes = 0;
    this.cache = new Uint8Array();
    this.cacheAt = -1;
    this.reads = 0;
  }
  async read(at, n) {
    cancelled(this.signal);
    if (
      !Number.isSafeInteger(at) ||
      !Number.isSafeInteger(n) ||
      n < 0 ||
      n > 65536 ||
      at < this.start ||
      at + n > this.end
    )
      throw new InvalidCandidate("Candidate exceeds the source boundary.");
    if (at + n > this.limit)
      throw new CandidateLimit("Candidate byte limit reached; scan stopped.");
    if (++this.reads > 200000)
      throw new CandidateLimit("Parser work limit reached for a candidate.");
    if (at < this.cacheAt || at + n > this.cacheAt + this.cache.length) {
      const end = Math.min(this.limit, at + Math.max(n, 4096));
      this.cache = new Uint8Array(
        await this.source.slice(at, end).arrayBuffer(),
      );
      this.cacheAt = at;
      if (this.cache.length !== end - at)
        throw new Error("Short read from the selected image.");
      this.onRead(this.cache.length);
    }
    return this.cache.subarray(at - this.cacheAt, at - this.cacheAt + n);
  }
  checkRecords(count, limit) {
    if (count > limit)
      throw new CandidateLimit("Candidate record limit reached; scan stopped.");
  }
  retain(bytes) {
    this.retainedBytes += bytes.length;
    if (this.retainedBytes > 8 * MiB)
      throw new CandidateLimit(
        "Candidate metadata memory limit reached; scan stopped.",
      );
    return bytes.slice();
  }
  async findByte(byte, at) {
    while (at < this.end) {
      if (at >= this.limit)
        throw new CandidateLimit("Candidate byte limit reached; scan stopped.");
      const b = await this.read(
          at,
          Math.min(65536, this.end - at, this.limit - at),
        ),
        i = b.indexOf(byte);
      if (i >= 0) return at + i;
      at += b.length;
    }
    return -1;
  }
}
export function extractCandidate(source, c) {
  if (
    !Number.isSafeInteger(c.offset) ||
    !Number.isSafeInteger(c.size) ||
    c.offset < 0 ||
    c.size <= 0 ||
    c.offset + c.size > source.size
  )
    throw new Error("Invalid recovered file range.");
  return source.slice(
    c.offset,
    c.offset + c.size,
    c.mime || "application/octet-stream",
  );
}
export async function scanImage(
  source,
  {
    scope = "all",
    signal,
    onProgress = () => {},
    onCandidate = () => {},
    chunkSize = 4 * MiB,
    maxResults = 10000,
    maxCandidateBytes = 64 * 1024 * MiB,
  } = {},
) {
  if (!Number.isSafeInteger(source.size) || source.size <= 0)
    throw new Error("The selected image is empty or its size is invalid.");
  if (
    !["all", "media"].includes(scope) ||
    !Number.isInteger(chunkSize) ||
    chunkSize < 32 ||
    chunkSize > 16 * MiB ||
    !Number.isInteger(maxResults) ||
    maxResults < 1 ||
    maxResults > 10000 ||
    !Number.isSafeInteger(maxCandidateBytes) ||
    maxCandidateBytes < 32
  )
    throw new Error("Invalid scan options.");
  const result = {
    status: "completed",
    scannedBytes: 0,
    totalBytes: source.size,
    candidates: [],
    warnings: [],
  };
  const warnings = new Set();
  let nextOffset = 0,
    attempts = 0,
    readBytes = 0,
    lastProgress = 0;
  const progress = () => {
    onProgress({
      scannedBytes: result.scannedBytes,
      totalBytes: source.size,
      found: result.candidates.length,
    });
    lastProgress = Date.now();
  };
  const onRead = (n) => {
    readBytes += n;
    if (readBytes > Math.max(source.size * 16, 64 * MiB))
      throw new CandidateLimit("Read-work limit reached; scan stopped.");
    if (Date.now() - lastProgress > 150) progress();
  };
  try {
    cancelled(signal);
    const head = new Uint8Array(await source.slice(0, 8).arrayBuffer());
    const tail = new Uint8Array(
      await source
        .slice(Math.max(0, source.size - 512), source.size)
        .arrayBuffer(),
    );
    const s = String.fromCharCode(...head),
      t = String.fromCharCode(...tail.subarray(0, 4));
    if (
      (head[0] === 31 && head[1] === 139) ||
      s.startsWith("BZh") ||
      s.startsWith("7z\xbc\xaf") ||
      s.startsWith("EVF") ||
      s.startsWith("QFI\xfb") ||
      s.startsWith("vhdxfile") ||
      t === "koly"
    )
      throw new Error(
        "Choose an uncompressed raw image (.dd, .img or .raw). Compressed, DMG and forensic containers must be converted first.",
      );
    for (let base = 0; base < source.size;) {
      cancelled(signal);
      // Four preceding bytes cover ftyp's length; 16 following bytes cover signatures across blocks.
      const start = Math.max(0, base - 4),
        end = Math.min(source.size, base + chunkSize + 16);
      const a = new Uint8Array(await source.slice(start, end).arrayBuffer());
      if (a.length !== end - start)
        throw new Error("Short read from the selected image.");
      onRead(a.length);
      for (
        let i = base - start;
        i < Math.min(a.length, base + chunkSize - start);
        i++
      ) {
        cancelled(signal);
        if (start + i < nextOffset) continue;
        const sig = signatureAt(a, i, scope);
        if (!sig) continue;
        const offset = start + sig.offset;
        if (offset < nextOffset) continue;
        result.scannedBytes = offset;
        if (++attempts > 100000) {
          result.status = "limited";
          warnings.add("Signature-work limit reached; scan stopped.");
          break;
        }
        const r = new Reader(
          source,
          offset,
          Math.min(source.size, offset + maxCandidateBytes),
          signal,
          onRead,
        );
        r.cache = a;
        r.cacheAt = start;
        let c;
        try {
          c = await sig.parser(r, offset);
        } catch (e) {
          if (e instanceof InvalidCandidate) continue;
          if (!(e instanceof CandidateLimit)) throw e;
          warnings.add(e.message);
          // A budget failure must not silently turn into a completed scan.
          result.status = "limited";
          break;
        }
        if (!c) continue;
        if (c.end - offset > maxCandidateBytes) {
          result.status = "limited";
          warnings.add("Candidate byte limit reached; scan stopped.");
          break;
        }
        if (c.end <= offset || c.end > source.size)
          throw new Error("Parser returned an invalid range.");
        const candidate = {
          id: result.candidates.length + 1,
          offset,
          size: c.end - offset,
          extension: c.extension,
          category: c.category,
          mime: c.mime,
          evidence: c.evidence,
          name: `recovered_${String(result.candidates.length + 1).padStart(5, "0")}.${c.extension}`,
        };
        result.candidates.push(candidate);
        nextOffset = c.end;
        result.scannedBytes = c.end;
        onCandidate(candidate);
        progress();
        if (result.candidates.length >= maxResults) {
          result.status = "limited";
          warnings.add(
            `Stopped at the ${maxResults.toLocaleString()}-candidate memory limit. Narrow the source image to scan further.`,
          );
          break;
        }
      }
      if (result.status === "limited") break;
      base = Math.max(base + chunkSize, nextOffset);
      result.scannedBytes = Math.min(base, source.size);
      progress();
      // Allows worker cancellation messages to be delivered even on all-zero images.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    cancelled(signal);
  } catch (e) {
    if (e.name === "AbortError") result.status = "cancelled";
    else if (e instanceof CandidateLimit) {
      result.status = "limited";
      warnings.add(e.message);
    } else throw e;
  }
  result.warnings = [...warnings];
  progress();
  return result;
}
