// Reprise browser diagnostics and conservative PCM WAV repair. GPL-3.0-or-later.
const text = (a, start = 0, length = 4) =>
  String.fromCharCode(...a.slice(start, start + length));
const read = async (file, start, length) =>
  new Uint8Array(await file.slice(start, start + length).arrayBuffer());
const base = (kind, title, summary, extra = {}) => ({
  kind,
  title,
  summary,
  engine: "companion",
  repairable: false,
  issues: [],
  metadata: {},
  ...extra,
});

export async function inspectFile(file) {
  if (!file.size)
    return base(
      "empty",
      "No media bytes",
      "This file is empty. Repair needs surviving media data.",
      { engine: "none" },
    );
  const h = await read(file, 0, 64);
  if (text(h) === "RIFF" && text(h, 8) === "WAVE") return inspectWav(file, h);
  if (["ftyp", "moov", "mdat", "free", "wide"].includes(text(h, 4)))
    return inspectMp4(file);
  if (
    ["rsv", "mdt", "tmp", "dat"].includes(
      file.name.split(".").pop().toLowerCase(),
    )
  )
    return base(
      "camera",
      "Unfinished recording candidate",
      "The extension suggests a camera recording. A local engine must inspect the content; a matching healthy reference may be needed.",
      { needsReference: true },
    );
  const hex = [...h.slice(0, 4)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  let family;
  if (hex === "1a45dfa3") family = "Matroska / WebM";
  else if (text(h) === "RIFF" && text(h, 8) === "AVI ") family = "AVI";
  else if (text(h) === "fLaC") family = "FLAC";
  else if (text(h) === "OggS") family = "Ogg";
  else if (text(h, 0, 3) === "ID3" || (h[0] === 255 && (h[1] & 224) === 224))
    family = "MPEG / AAC audio";
  else if (text(h) === "FORM" && ["AIFF", "AIFC"].includes(text(h, 8)))
    family = "AIFF";
  else if (text(h) === "caff") family = "CAF";
  else if (text(h) === "RF64" || text(h) === "BW64") family = "RF64 / BW64";
  else if (text(h, 0, 3) === "FLV") family = "FLV";
  else if (hex === "060e2b34") family = "MXF";
  if (family)
    return base(
      "media",
      `${family} detected`,
      "The header is recognized. Connect the companion for stream inspection and a repair attempt.",
      { metadata: { container: family } },
    );
  return base(
    "unknown",
    "Format not yet identified",
    "The browser cannot identify a supported header. The companion can inspect more formats; a filename alone does not prove repair support.",
  );
}

async function inspectWav(file, h) {
  const result = base("wav", "WAV audio", "Checking the audio structure.", {
    engine: "browser",
  });
  if (file.size > 0xffffffff + 8)
    return {
      ...result,
      summary: "This large file needs an RF64-aware engine.",
      engine: "companion",
    };
  if (h.length < 12)
    return { ...result, summary: "The WAV header is incomplete." };
  const riffSize = new DataView(h.buffer, h.byteOffset, h.byteLength).getUint32(
    4,
    true,
  );
  let at = 12,
    fmt = null,
    data = null,
    count = 0,
    invalid = false;
  while (at + 8 <= file.size && count++ < 4096) {
    const header = await read(file, at, 8);
    const size = new DataView(header.buffer).getUint32(4, true);
    const id = text(header);
    if (id === "fmt ") {
      if (fmt || size < 16 || at + 8 + size > file.size) {
        invalid = true;
        break;
      }
      const b = await read(file, at + 8, Math.min(size, 40));
      const v = new DataView(b.buffer);
      let format = v.getUint16(0, true);
      if (format === 65534) {
        if (size < 40) {
          invalid = true;
          break;
        }
        format = v.getUint16(24, true);
        const guid = [...b.slice(26, 40)].join(",");
        if (guid !== "0,0,0,0,16,0,128,0,0,170,0,56,155,113") {
          invalid = true;
          break;
        }
      }
      fmt = {
        format,
        channels: v.getUint16(2, true),
        sampleRate: v.getUint32(4, true),
        byteRate: v.getUint32(8, true),
        blockAlign: v.getUint16(12, true),
        bits: v.getUint16(14, true),
      };
    } else if (id === "data") {
      if (data) {
        invalid = true;
        break;
      }
      data = {
        header: at,
        start: at + 8,
        declared: size,
        available: Math.min(size, file.size - at - 8),
      };
      if (size === 0 && at + 8 < file.size)
        return {
          ...result,
          summary:
            "The audio data length is unresolved. A reference or specialized repair is needed; trailing bytes will not be guessed.",
        };
      if (at + 8 + size > file.size) break;
    }
    if (at + 8 + size > file.size) {
      invalid = true;
      break;
    }
    at += 8 + size + (size % 2);
  }
  if (count >= 4096) invalid = true;
  if (invalid || !fmt || !data)
    return {
      ...result,
      summary:
        "The chunk structure is incomplete or ambiguous. This file needs a specialized repair.",
      engine: "companion",
    };
  const { format, channels, sampleRate, byteRate, blockAlign, bits } = fmt;
  if (
    ![1, 3].includes(format) ||
    !channels ||
    channels > 64 ||
    !sampleRate ||
    sampleRate > 768000 ||
    ![8, 16, 24, 32, 64].includes(bits) ||
    (format === 3 && ![32, 64].includes(bits)) ||
    blockAlign !== (channels * bits) / 8 ||
    byteRate !== sampleRate * blockAlign
  )
    return {
      ...result,
      summary:
        "The audio format or sample layout is not supported by the browser repair.",
      engine: "companion",
    };
  if (!data.available)
    return { ...result, summary: "No audio samples are present." };
  const aligned = data.available - (data.available % blockAlign);
  const truncated =
    data.declared > data.available || aligned !== data.available;
  const issues = [];
  if (riffSize !== file.size - 8)
    issues.push("RIFF file length does not match the bytes present.");
  if (truncated)
    issues.push(
      "The final audio block is incomplete. Only complete surviving samples can be saved.",
    );
  return {
    ...result,
    title: issues.length
      ? "Audio structure needs repair"
      : "WAV structure is consistent",
    summary: issues.length
      ? "The sample layout is readable. The browser can correct the lengths while preserving surviving audio bytes."
      : "No supported structural fault found. This check does not establish that the recording is complete or sounds correct.",
    repairable: issues.length > 0,
    issues,
    metadata: {
      ...fmt,
      duration: aligned / byteRate,
      container: "RIFF/WAVE",
      codec: format === 3 ? "IEEE float" : "PCM",
    },
    wav: { riffSize, data, aligned, truncated },
  };
}

async function inspectMp4(file) {
  let at = 0,
    count = 0;
  const atoms = [];
  const issues = [];
  while (at + 8 <= file.size && count++ < 4096) {
    const b = await read(file, at, 16);
    const v = new DataView(b.buffer);
    let length = v.getUint32(0);
    const type = text(b, 4);
    let header = 8;
    if (length === 1) {
      if (b.length < 16) {
        issues.push("Incomplete extended atom header.");
        break;
      }
      const wide = v.getBigUint64(8);
      if (wide > BigInt(Number.MAX_SAFE_INTEGER)) {
        issues.push("Invalid atom length.");
        break;
      }
      length = Number(wide);
      header = 16;
    }
    if (length === 0) length = file.size - at;
    atoms.push(type);
    if (length < header || at + length > file.size) {
      issues.push(`Incomplete ${type.replace(/[^a-zA-Z0-9 ]/g, "?")} atom.`);
      break;
    }
    at += length;
  }
  if (count >= 4096) issues.push("Atom inspection limit reached.");
  const needsReference = !atoms.includes("moov");
  if (needsReference) issues.push("No top-level movie index was found.");
  return base(
    "mp4",
    needsReference ? "Movie index not found" : "MP4 / QuickTime detected",
    needsReference
      ? "A healthy clip from the same recording mode may provide the information needed to reconstruct this file."
      : "The container is recognized. The companion can inspect its tracks, remux readable media, and validate the result.",
    {
      needsReference,
      issues,
      metadata: { container: "MP4 / QuickTime", atoms: atoms.join(", ") },
    },
  );
}

export async function repairWav(file, diagnosis) {
  // Reinspect rather than trusting caller-supplied offsets.
  const d = await inspectFile(file);
  if (!d.repairable || !d.wav)
    throw new Error(d.summary || "No supported WAV repair is available.");
  const { data, aligned, truncated } = d.wav;
  let parts;
  if (truncated) {
    const header = await file.slice(0, 8).arrayBuffer();
    const view = new DataView(header);
    const dataHeader = await file.slice(data.header, data.start).arrayBuffer();
    const pad = aligned % 2;
    const suffix = file.slice(data.start + data.declared + (data.declared % 2));
    view.setUint32(4, data.start + aligned + pad + suffix.size - 8, true);
    new DataView(dataHeader).setUint32(4, aligned, true);
    parts = [
      header,
      file.slice(8, data.header),
      dataHeader,
      file.slice(data.start, data.start + aligned),
      ...(pad ? [new Uint8Array(1)] : []),
      suffix,
    ];
  } else {
    const head = await file.slice(0, 8).arrayBuffer();
    new DataView(head).setUint32(4, file.size - 8, true);
    parts = [head, file.slice(8)];
  }
  const blob = new Blob(parts, { type: "audio/wav" });
  const check = await inspectFile(new File([blob], "validation.wav"));
  if (check.repairable || !check.wav)
    throw new Error("Output structure did not pass validation.");
  return {
    blob,
    name: file.name.replace(/\.[^.]*$/, "") + "_repaired.wav",
    report: {
      version: "0.1.0",
      status: truncated ? "partial" : "completed",
      summary: truncated
        ? "Saved complete surviving audio samples. Missing samples have not been recreated."
        : "Corrected the file length without changing audio bytes.",
      strategy: "wav-structure",
      inputName: file.name,
      inputSize: file.size,
      outputSize: blob.size,
      duration: d.metadata.duration,
      streams: [d.metadata],
      validation: {
        structureValid: true,
        audioBytesPreserved: true,
        fullDecode: false,
        notes: [
          "PCM layout and lengths verified. Original recording completeness is unknown.",
        ],
      },
      warnings: truncated ? d.issues : [],
      engineVersions: { browser: "reprise-wav-0.1.0" },
      createdAt: new Date().toISOString(),
    },
  };
}

export function createDemoFile() {
  const rate = 24000,
    seconds = 4,
    count = rate * seconds;
  const a = new Uint8Array(44 + count * 2),
    v = new DataView(a.buffer);
  for (const [at, s] of [
    [0, "RIFF"],
    [8, "WAVE"],
    [12, "fmt "],
    [36, "data"],
  ])
    for (let i = 0; i < s.length; i++) a[at + i] = s.charCodeAt(i);
  v.setUint32(4, 0, true);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  v.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const t = i / rate,
      env = Math.sin((Math.PI * t) / seconds) ** 2;
    v.setInt16(
      44 + i * 2,
      Math.round(
        0.12 *
          32767 *
          env *
          (Math.sin(t * Math.PI * 2 * 220) +
            0.4 * Math.sin(t * Math.PI * 2 * 330)),
      ),
      true,
    );
  }
  return new File([a], "studio-tone_damaged.wav", { type: "audio/wav" });
}
