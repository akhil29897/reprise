// Conservative contiguous-file boundaries, not filesystem or codec validation.
// All offsets are absolute within the immutable source. Reader enforces budgets.
const text = (a, start = 0, end = a.length) =>
  String.fromCharCode(...a.subarray(start, end));
const view = (a) => new DataView(a.buffer, a.byteOffset, a.byteLength);
const u32 = (a, p = 0, le = false) => view(a).getUint32(p, le);
const u16 = (a, p = 0, le = false) => view(a).getUint16(p, le);
const found = (end, extension, category, mime, evidence) => ({
  end,
  extension,
  category,
  mime,
  evidence,
});
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  return n >>> 0;
});

async function riff(r, start) {
  const h = await r.read(start, 12),
    kind = text(h, 8, 12),
    end = start + 8 + u32(h, 4, true);
  if (!["WAVE", "AVI "].includes(kind) || end > r.end || end <= start + 12)
    return null;
  let at = start + 12,
    format = false,
    payload = false,
    count = 0;
  while (at < end) {
    r.checkRecords(++count, 10000);
    if (at + 8 > end) return null;
    const c = await r.read(at, 8),
      n = u32(c, 4, true),
      t = text(c, 0, 4);
    if (at + 8 + n > end) return null;
    if (kind === "WAVE") {
      if (t === "fmt " && n >= 16) {
        const f = await r.read(at + 8, 16);
        format =
          u16(f, 2, true) > 0 && u32(f, 4, true) > 0 && u16(f, 12, true) > 0;
      }
      if (t === "data" && n > 0) payload = true;
    } else if (t === "LIST" && n >= 4) {
      const list = text(await r.read(at + 8, 4));
      if (list === "hdrl") format = true;
      if (list === "movi" && n > 4) payload = true;
    }
    at += 8 + n + (n % 2);
  }
  if (at !== end || !format || !payload) return null;
  return found(
    end,
    kind === "WAVE" ? "wav" : "avi",
    kind === "WAVE" ? "audio" : "video",
    kind === "WAVE" ? "audio/wav" : "video/x-msvideo",
    [
      "RIFF length and top-level chunks fit the image.",
      "Required format and nonempty media chunks found.",
      "Codec decoding and fragmented-file reconstruction were not performed.",
    ],
  );
}

async function iso(r, start) {
  let at = start,
    mdat = false,
    moov = false,
    extension = "mp4",
    count = 0;
  const allowed = new Set([
    "ftyp",
    "mdat",
    "moov",
    "free",
    "skip",
    "wide",
    "uuid",
    "pnot",
    "moof",
    "mfra",
    "sidx",
    "styp",
    "pdin",
  ]);
  while (at + 8 <= r.end) {
    r.checkRecords(++count, 10000);
    const h = await r.read(at, 8),
      type = text(h, 4, 8);
    if (!allowed.has(type) || (at > start && type === "ftyp")) break;
    let n = u32(h),
      header = 8;
    if (n === 1) {
      if (at + 16 > r.end) return null;
      const x = await r.read(at + 8, 8);
      n = u32(x) * 4294967296 + u32(x, 4);
      header = 16;
    }
    // A zero-sized box extends to EOF, which is unknowable inside a disk image.
    if (!Number.isSafeInteger(n) || n < header || at + n > r.end) return null;
    if (at === start) {
      if (type !== "ftyp" || n < header + 8 || n > 4096) return null;
      const brand = text(await r.read(at + header, 4));
      if (brand === "qt  ") extension = "mov";
      else if (
        !/^(isom|iso[2-9]|mp4[12]|avc1|dash|MSNV|M4V |M4A )$/.test(brand)
      )
        return null;
    }
    if (type === "mdat" && n > header) mdat = true;
    if (type === "moov" && n > header + 8) {
      let child = at + header,
        children = 0,
        hasHeader = false;
      while (child < at + n) {
        r.checkRecords(++children, 10000);
        if (child + 8 > at + n) return null;
        const c = await r.read(child, 8),
          len = u32(c);
        if (len < 8 || child + len > at + n) return null;
        if (text(c, 4, 8) === "mvhd" && len >= 28) hasHeader = true;
        child += len;
      }
      if (child !== at + n || !hasHeader) return null;
      moov = true;
    }
    at += n;
  }
  if (!mdat || !moov) return null;
  return found(
    at,
    extension,
    "video",
    extension === "mov" ? "video/quicktime" : "video/mp4",
    [
      "Explicit top-level box boundaries, moov and nonempty mdat found.",
      "Contiguous candidate only; sample offsets, tracks and frames are not validated.",
      "Trailing unrelated boxes may be included; original completeness is unknown.",
    ],
  );
}

async function png(r, start) {
  if (text(await r.read(start, 8)) !== "\x89PNG\r\n\x1a\n") return null;
  let at = start + 8,
    data = false,
    count = 0;
  while (at + 12 <= r.end) {
    r.checkRecords(++count, 10000);
    const h = await r.read(at, 8),
      n = u32(h),
      type = text(h, 4, 8);
    if (!/^[A-Za-z]{4}$/.test(type) || n > 0x7fffffff || at + 12 + n > r.end)
      return null;
    if (at === start + 8) {
      if (type !== "IHDR" || n !== 13) return null;
      const d = await r.read(at + 8, 13);
      if (!u32(d) || !u32(d, 4)) return null;
    } else if (type === "IHDR") return null;
    let crc = 0xffffffff;
    for (let p = at + 4; p < at + 8 + n;) {
      const b = await r.read(p, Math.min(65536, at + 8 + n - p));
      for (const byte of b) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
      p += b.length;
    }
    if ((crc ^ 0xffffffff) >>> 0 !== u32(await r.read(at + 8 + n, 4)))
      return null;
    if (type === "IDAT" && n > 0) data = true;
    at += 12 + n;
    if (type === "IEND")
      return n === 0 && data
        ? found(at, "png", "image", "image/png", [
            "PNG signature, chunk boundaries and all chunk CRCs verified.",
            "IHDR, image data and IEND found; pixels have not been decoded.",
          ])
        : null;
  }
  return null;
}

async function jpeg(r, start) {
  let at = start + 2,
    frame = false,
    scan = false,
    entropy = false,
    count = 0;
  while (at + 2 <= r.end) {
    r.checkRecords(++count, 100000);
    if (entropy) {
      at = await r.findByte(255, at);
      if (at < 0) return null;
    }
    const h = await r.read(at, 2);
    if (h[0] !== 255) return null;
    const marker = h[1];
    if (marker === 255) {
      at++;
      continue;
    }
    if (entropy && (marker === 0 || (marker >= 208 && marker <= 215))) {
      at += 2;
      continue;
    }
    if (marker === 217)
      return frame && scan
        ? found(at + 2, "jpg", "image", "image/jpeg", [
            "JPEG marker and segment boundaries, frame, scan and end marker found.",
            "Entropy is not decoded; damaged or fragmented pixels can still be present.",
          ])
        : null;
    if (
      marker === 0 ||
      marker === 216 ||
      (marker >= 208 && marker <= 215) ||
      at + 4 > r.end
    )
      return null;
    entropy = false;
    const n = u16(await r.read(at + 2, 2));
    if (n < 2 || at + 2 + n > r.end) return null;
    if ([192, 193, 194].includes(marker)) {
      if (n < 11) return null;
      const f = await r.read(at + 4, 6);
      if (!u16(f, 1) || !u16(f, 3) || !f[5] || n !== 8 + 3 * f[5]) return null;
      frame = true;
    }
    if (marker === 218) {
      if (!frame || n < 6) return null;
      scan = true;
      entropy = true;
    }
    at += 2 + n;
  }
  return null;
}

async function zip(r, start) {
  let at = start;
  const locals = new Map();
  while (at + 4 <= r.end) {
    const sig = u32(await r.read(at, 4), 0, true);
    if (sig !== 0x04034b50) break;
    r.checkRecords(locals.size + 1, 10000);
    if (at + 30 > r.end) return null;
    const h = await r.read(at, 30),
      flags = u16(h, 6, true),
      n = u32(h, 18, true),
      len = u16(h, 26, true),
      extra = u16(h, 28, true);
    // Descriptor/ZIP64/split/encrypted archives require a different parser.
    if (
      flags & 9 ||
      n === 0xffffffff ||
      u32(h, 22, true) === 0xffffffff ||
      !len ||
      at + 30 + len + extra + n > r.end
    )
      return null;
    locals.set(at - start, {
      h: r.retain(h),
      name: r.retain(await r.read(at + 30, len)),
    });
    at += 30 + len + extra + n;
  }
  if (!locals.size) return null;
  const centralStart = at;
  let count = 0;
  const names = [];
  const seen = new Set();
  while (
    at + 46 <= r.end &&
    u32(await r.read(at, 4), 0, true) === 0x02014b50 &&
    count < locals.size
  ) {
    const c = await r.read(at, 46),
      len = u16(c, 28, true),
      extra = u16(c, 30, true),
      comment = u16(c, 32, true),
      offset = u32(c, 42, true),
      local = locals.get(offset);
    if (
      !local ||
      seen.has(offset) ||
      u16(c, 34, true) !== 0 ||
      at + 46 + len + extra + comment > r.end
    )
      return null;
    const name = await r.read(at + 46, len);
    if (
      text(name) !== text(local.name) ||
      u16(c, 8, true) !== u16(local.h, 6, true) ||
      u16(c, 10, true) !== u16(local.h, 8, true) ||
      u32(c, 16, true) !== u32(local.h, 14, true) ||
      u32(c, 20, true) !== u32(local.h, 18, true) ||
      u32(c, 24, true) !== u32(local.h, 22, true)
    )
      return null;
    names.push(text(name));
    seen.add(offset);
    count++;
    at += 46 + len + extra + comment;
  }
  if (count !== locals.size || at + 22 > r.end) return null;
  const e = await r.read(at, 22),
    end = at + 22 + u16(e, 20, true);
  if (
    u32(e, 0, true) !== 0x06054b50 ||
    u16(e, 4, true) !== 0 ||
    u16(e, 6, true) !== 0 ||
    u16(e, 8, true) !== count ||
    u16(e, 10, true) !== count ||
    u32(e, 12, true) !== at - centralStart ||
    u32(e, 16, true) !== centralStart - start ||
    end > r.end
  )
    return null;
  let extension = "zip";
  if (names.includes("[Content_Types].xml")) {
    if (names.includes("word/document.xml")) extension = "docx";
    else if (names.includes("xl/workbook.xml")) extension = "xlsx";
    else if (names.includes("ppt/presentation.xml")) extension = "pptx";
  }
  return found(
    end,
    extension,
    extension === "zip" ? "archive" : "document",
    "application/zip",
    [
      "Local file headers, central directory, relative offsets and end record agree.",
      `${count} entries; file contents were not decompressed or CRC-checked.`,
      "ZIP64, data descriptors and encrypted/split archives are unsupported.",
    ],
  );
}

export function signatureAt(a, i, scope) {
  if (a[i] === 82 && a[i + 1] === 73 && a[i + 2] === 70 && a[i + 3] === 70)
    return { parser: riff, offset: i };
  if (
    a[i] === 102 &&
    i >= 4 &&
    a[i + 1] === 116 &&
    a[i + 2] === 121 &&
    a[i + 3] === 112
  )
    return { parser: iso, offset: i - 4 };
  if (a[i] === 137 && a[i + 1] === 80 && a[i + 2] === 78 && a[i + 3] === 71)
    return { parser: png, offset: i };
  if (a[i] === 255 && a[i + 1] === 216 && a[i + 2] === 255)
    return { parser: jpeg, offset: i };
  if (
    scope === "all" &&
    a[i] === 80 &&
    a[i + 1] === 75 &&
    a[i + 2] === 3 &&
    a[i + 3] === 4
  )
    return { parser: zip, offset: i };
  return null;
}
