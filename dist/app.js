import { inspectFile, repairWav, createDemoFile } from "./engine.js";
import { catalog, searchCatalog } from "./catalog.js";
import { initRecovery } from "./recovery.js";
import * as companion from "./companion.js";
const $ = (s) => document.querySelector(s);
const files = [];
let selected = null;
let toastTimer;
let health = null;
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const bytes = (n) =>
  n < 1024
    ? `${n} B`
    : n < 1024 ** 2
      ? `${(n / 1024).toFixed(1)} KB`
      : n < 1024 ** 3
        ? `${(n / 1024 ** 2).toFixed(1)} MB`
        : `${(n / 1024 ** 3).toFixed(2)} GB`;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 6500);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function navigate() {
  const route = ["workspace", "recovery", "coverage", "guide"].includes(
    location.hash.slice(1),
  )
    ? location.hash.slice(1)
    : "workspace";
  document
    .querySelectorAll(".view")
    .forEach((x) => (x.hidden = x.id !== `${route}-view`));
  document.querySelectorAll("[data-nav]").forEach((x) => {
    x.classList.toggle("active", x.dataset.nav === route);
    if (x.dataset.nav === route) x.setAttribute("aria-current", "page");
    else x.removeAttribute("aria-current");
  });
  $("#connect-btn").hidden = route === "recovery";
  $("#breadcrumb").textContent =
    route === "workspace"
      ? "Workspace / Media repair"
      : route === "recovery"
        ? "Workspace / File recovery"
        : route === "coverage"
          ? "Library / Camera & format coverage"
          : "Guide / How repair works";
}
window.addEventListener("hashchange", navigate);
navigate();
window.addEventListener("beforeunload", (e) => {
  if (files.some((f) => f.busy)) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function addFiles(incoming) {
  for (const file of incoming) {
    const item = {
      id: crypto.randomUUID(),
      file,
      status: "Diagnosing",
      diagnosis: null,
      busy: true,
    };
    files.push(item);
    selected = item.id;
    render();
    try {
      item.diagnosis = await inspectFile(file);
      item.status = item.diagnosis.repairable
        ? "Ready to repair"
        : item.diagnosis.engine === "companion"
          ? "Companion needed"
          : "Inspected";
    } catch (e) {
      item.status = "Could not inspect";
      item.error = e.message;
    }
    item.busy = false;
    render();
  }
  location.hash = "workspace";
}
function choose() {
  $("#file-input").click();
}
$("#file-input").addEventListener("change", (e) => {
  addFiles(e.target.files);
  e.target.value = "";
});
$("#add-files-top").onclick = choose;
$("#drop-zone").onclick = choose;
$("#drop-zone").onkeydown = (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    choose();
  }
};
for (const event of ["dragenter", "dragover"])
  $("#drop-zone").addEventListener(event, (e) => {
    e.preventDefault();
    $("#drop-zone").classList.add("dragging");
  });
$("#drop-zone").addEventListener("dragleave", () =>
  $("#drop-zone").classList.remove("dragging"),
);
$("#drop-zone").addEventListener("drop", (e) => {
  e.preventDefault();
  $("#drop-zone").classList.remove("dragging");
  addFiles(e.dataTransfer.files);
});
$("#sample-btn").onclick = () => addFiles([createDemoFile()]);
$("#clear-btn").textContent = "Clear idle files";
$("#clear-btn").onclick = () => {
  for (let i = files.length - 1; i >= 0; i--)
    if (!files[i].busy) {
      if (files[i].previewUrl) URL.revokeObjectURL(files[i].previewUrl);
      files.splice(i, 1);
    }
  selected = files[0]?.id;
  render();
  toast(
    "Idle files removed from this tab. Companion files remain on your computer.",
  );
};
function render() {
  const has = files.length > 0;
  $("#empty-workspace").hidden = has;
  $("#active-workspace").hidden = !has;
  $("#queue-count").textContent = files.length;
  $("#file-list").innerHTML = files
    .map(
      (f) =>
        `<button class="file-row ${f.id === selected ? "selected" : ""}" data-id="${f.id}" aria-pressed="${f.id === selected}"><span class="file-icon">${escape(f.file.name.split(".").pop().slice(0, 4).toUpperCase())}</span><span><strong>${escape(f.file.name)}</strong><small>${bytes(f.file.size)} · ${escape(f.status)}</small></span></button>`,
    )
    .join("");
  document.querySelectorAll(".file-row").forEach(
    (el) =>
      (el.onclick = () => {
        selected = el.dataset.id;
        render();
      }),
  );
  const f = files.find((x) => x.id === selected);
  if (!f) return;
  const d = f.diagnosis;
  const activeId = document.activeElement?.id;
  $("#detail-panel").innerHTML =
    `<div class="detail-top"><div><h2>${escape(f.file.name)}</h2><p>${bytes(f.file.size)} · Original preserved</p></div><span class="badge ${f.result ? "good" : ""}">${escape(f.status)}</span></div>${f.error ? `<p class="error-text" role="alert">${escape(f.error)}</p>` : ""}${d ? diagnosisHtml(d, f) : '<div class="diagnosis"><h3>Inspecting file structure…</h3><p>Reading headers locally.</p></div>'}${f.busy ? `<div class="progress-line" aria-label="Repair in progress"></div><p class="stage-label" role="status">${escape(f.nativeJob?.stage || f.status)} · working locally</p>` : ""}${f.result ? browserResultHtml(f) : ""}${f.nativeJob ? nativeResultHtml(f) : ""}`;
  if ($("#repair-btn")) $("#repair-btn").onclick = () => repairBrowser(f);
  if ($("#native-btn"))
    $("#native-btn").onclick = () =>
      companion.isConnected()
        ? repairNative(f)
        : $("#connect-dialog").showModal();
  if ($("#reference-btn")) {
    $("#reference-btn").onclick = () => $("#reference-input").click();
    $("#reference-input").onchange = (e) => {
      f.reference = e.target.files[0];
      render();
    };
  }
  if ($("#cancel-btn")) $("#cancel-btn").onclick = () => cancel(f);
  if (f.result) {
    $("#save-btn").onclick = () => download(f.result.blob, f.result.name);
    $("#report-btn").onclick = () => saveReport(f.result.report, f.file.name);
    drawWave(f);
  }
  if ($("#native-save-btn"))
    $("#native-save-btn").onclick = () => saveNative(f);
  if ($("#native-preview-btn"))
    $("#native-preview-btn").onclick = () => previewNative(f);
  if ($("#native-report-btn"))
    $("#native-report-btn").onclick = () =>
      saveReport(f.nativeJob.report, f.file.name);
  if (activeId && $("#" + activeId))
    $("#" + activeId).focus({ preventScroll: true });
}
function diagnosisHtml(d, f) {
  const metadata = Object.entries(d.metadata).filter(([k]) =>
    [
      "container",
      "codec",
      "channels",
      "sampleRate",
      "bits",
      "duration",
    ].includes(k),
  );
  return `<div class="diagnosis"><h3>${escape(d.title)}</h3><p>${escape(d.summary)}</p>${d.issues.length ? `<ul>${d.issues.map((x) => `<li>${escape(x)}</li>`).join("")}</ul>` : ""}</div><dl class="metadata-grid">${metadata.map(([k, v]) => `<div><dt>${{ container: "Container", codec: "Audio format", channels: "Channels", sampleRate: "Sample rate", bits: "Bit depth", duration: "Surviving duration" }[k]}</dt><dd>${escape(k === "duration" ? `${Number(v).toFixed(2)} s` : k === "sampleRate" ? `${v} Hz` : v)}</dd></div>`).join("")}</dl>${d.engine === "companion" && !f.restored ? `<div class="reference-box"><strong>${d.needsReference ? "A matching reference may help" : "Reference clip (optional)"}</strong><p>Use a healthy recording from the same camera and mode. Reference reconstruction is experimental.</p><button class="button secondary" id="reference-btn" ${f.busy ? "disabled" : ""}>${f.reference ? escape(f.reference.name) : "Choose reference clip"}</button><input type="file" id="reference-input" hidden></div>` : ""}<div class="repair-actions">${d.repairable ? `<button class="button primary" id="repair-btn" ${f.busy ? "disabled" : ""}>${f.busy ? "Repairing…" : "Repair in browser"}</button>` : ""}${d.engine === "companion" ? `<button class="button primary" id="native-btn" ${f.busy ? "disabled" : ""}>${companion.isConnected() ? "Run local repair" : "Connect for video repair"}</button>` : ""}${f.busy && (f.nativeJob || f.abort) ? '<button class="button secondary" id="cancel-btn">Cancel</button>' : ""}</div>`;
}
function browserResultHtml(f) {
  return `<div class="result-box"><span class="badge ${f.result.report.status === "partial" ? "warn" : "good"}">${f.result.report.status === "partial" ? "PARTIAL SALVAGE" : "STRUCTURE VERIFIED"}</span><h3 style="margin-top:12px">${escape(f.result.report.summary)}</h3>${f.diagnosis.metadata.bits === 16 ? '<canvas class="waveform" id="waveform" aria-label="Waveform of the repaired audio"></canvas>' : ""}<div class="wave-caption">${escape(f.result.report.validation.notes.join(" "))}</div><audio controls preload="metadata" src="${f.previewUrl}"></audio><div class="repair-actions"><button class="button primary" id="save-btn">Save repaired file ↓</button><button class="button secondary" id="report-btn">Download report</button></div></div>`;
}
function nativeResultHtml(f) {
  const j = f.nativeJob;
  if (!companion.terminal(j.status)) return "";
  const r = j.report;
  const available = ["completed", "partial"].includes(j.status);
  return `<div class="result-box"><span class="badge ${j.status === "completed" ? "good" : "warn"}">${j.status === "completed" ? "FULL DECODE PASSED" : escape(j.status.toUpperCase())}</span><h3 style="margin-top:12px">${escape(r?.summary || j.error || "The job stopped.")}</h3>${r?.duration ? `<p>Output duration: ${Number(r.duration).toFixed(2)} seconds · ${bytes(j.outputSize || 0)}</p>` : ""}${r?.validation?.notes?.length ? `<details><summary>Validation details</summary><ul>${r.validation.notes.map((n) => `<li>${escape(n)}</li>`).join("")}</ul></details>` : ""}${r?.warnings?.length ? `<details><summary>Limitations & warnings (${r.warnings.length})</summary><ul>${r.warnings.map((n) => `<li>${escape(n)}</li>`).join("")}</ul></details>` : ""}${f.previewUrl && !f.result ? `<video controls preload="metadata" src="${f.previewUrl}"></video><p>Browser playback depends on its codec support. Use a compatible player to review the saved master.</p>` : ""}<div class="repair-actions">${available ? '<button class="button primary" id="native-save-btn">Save repaired file ↓</button><button class="button secondary" id="native-preview-btn">Load preview</button>' : ""}${r ? '<button class="button secondary" id="native-report-btn">Download report</button>' : ""}</div></div>`;
}
function saveReport(report, name) {
  download(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    `${name}.repair-report.json`,
  );
}
async function repairBrowser(f) {
  f.busy = true;
  f.status = "Repairing";
  f.error = null;
  render();
  try {
    f.result = await repairWav(f.file, f.diagnosis);
    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    f.previewUrl = URL.createObjectURL(f.result.blob);
    f.status =
      f.result.report.status === "partial" ? "Partially repaired" : "Repaired";
    toast("Repair finished. Review the audio before saving.");
  } catch (e) {
    f.error = e.message;
    f.status = "Repair failed";
  } finally {
    f.busy = false;
    render();
  }
}
async function repairNative(f) {
  if (!health?.engines.ffmpeg || !health?.engines.ffprobe) {
    toast("Install FFmpeg and ffprobe, then reconnect the companion.");
    return;
  }
  if (f.reference && !health.engines.untrunc) {
    toast(
      "Reference repair needs the optional untrunc engine. See the setup guide.",
    );
    return;
  }
  f.busy = true;
  f.error = null;
  f.nativeJob = null;
  f.abort = new AbortController();
  try {
    if (!f.nativeFileId) {
      f.status = "Sending to local companion";
      render();
      f.nativeFileId = (await companion.upload(f.file, f.abort.signal)).id;
    }
    let ref;
    if (f.reference) {
      f.status = "Preparing reference locally";
      render();
      ref = (await companion.upload(f.reference, f.abort.signal)).id;
    }
    if (f.abort.signal.aborted)
      throw new DOMException("Upload cancelled", "AbortError");
    f.nativeJob = await companion.createJob(f.nativeFileId, ref);
    f.abort = null;
    await trackJob(f);
  } catch (e) {
    f.error = e.name === "AbortError" ? "Local transfer cancelled." : e.message;
    f.status =
      e.name === "AbortError" ? "Cancelled" : "Connection or repair error";
  } finally {
    f.busy = false;
    f.abort = null;
    render();
  }
}
async function trackJob(f) {
  f.busy = true;
  try {
    while (true) {
      f.status = f.nativeJob.status.replace(/^./, (s) => s.toUpperCase());
      render();
      if (companion.terminal(f.nativeJob.status)) break;
      await new Promise((r) => setTimeout(r, 1200));
      f.nativeJob = await companion.getJob(f.nativeJob.id);
    }
    if (f.nativeJob.error) f.error = f.nativeJob.error;
    toast(`${f.file.name}: ${f.status.toLowerCase()}.`);
  } catch (e) {
    f.error = `${e.message} Reconnect to restore the job; the companion may still be working.`;
    f.status = "Reconnect to check";
  } finally {
    f.busy = false;
    render();
  }
}
async function cancel(f) {
  try {
    if (f.abort) {
      f.abort.abort();
      return;
    }
    if (f.nativeJob) {
      f.nativeJob = await companion.cancelJob(f.nativeJob.id);
      render();
    }
  } catch (e) {
    toast(e.message);
  }
}
async function saveNative(f) {
  const j = f.nativeJob;
  const name =
    f.file.name.replace(/\.[^.]*$/, "") +
    "_repaired." +
    (j.outputName?.split(".").pop() || "mkv");
  let handle;
  try {
    if (window.showSaveFilePicker)
      handle = await window.showSaveFilePicker({ suggestedName: name });
    else if (j.outputSize > 256 * 1024 * 1024) {
      toast(
        "For files over 256 MB, use a browser with streaming saves or open the output in the companion’s local data folder.",
      );
      return;
    }
    const response = await companion.outputResponse(j.id);
    if (handle) {
      const writable = await handle.createWritable();
      try {
        await response.body.pipeTo(writable);
      } catch (e) {
        try {
          await writable.abort();
        } catch {}
        throw e;
      }
    } else download(await response.blob(), name);
    toast("Repaired file saved. Keep the report with your recording.");
  } catch (e) {
    if (e.name !== "AbortError") toast(`Could not save: ${e.message}`);
  }
}
async function previewNative(f) {
  try {
    if (f.nativeJob.outputSize > 128 * 1024 * 1024) {
      toast(
        "Save this recording to preview it in your media player. In-browser previews are limited to 128 MB.",
      );
      return;
    }
    const response = await companion.outputResponse(f.nativeJob.id);
    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    f.previewUrl = URL.createObjectURL(await response.blob());
    render();
  } catch (e) {
    toast(e.message);
  }
}
async function drawWave(f) {
  if (!f.diagnosis?.wav || f.diagnosis.metadata.bits !== 16) return;
  const c = $("#waveform");
  if (!c) return;
  const m = f.diagnosis.metadata;
  const data = await f.result.blob
    .slice(
      f.diagnosis.wav.data.start,
      f.diagnosis.wav.data.start + Math.min(f.diagnosis.wav.aligned, 2000000),
    )
    .arrayBuffer();
  if (!c.isConnected) return;
  const values = new DataView(data);
  c.width = Math.max(200, c.clientWidth * 2);
  c.height = 120;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#458291";
  const bars = Math.min(140, Math.floor(c.width / 5));
  for (let i = 0; i < bars; i++) {
    let peak = 0;
    const start = Math.floor((i * (data.byteLength / 2)) / bars),
      end = Math.floor(((i + 1) * (data.byteLength / 2)) / bars);
    for (let j = start; j < end; j += m.channels)
      peak = Math.max(peak, Math.abs(values.getInt16(j * 2, true)) / 32768);
    const height = Math.max(2, peak * 330);
    ctx.fillRect((i * c.width) / bars, (120 - height) / 2, 2, height);
  }
}
function updateConnection() {
  const connected = companion.isConnected();
  $("#connect-btn").classList.toggle("connected", connected);
  $("#connect-btn").innerHTML =
    `<span class="status-dot"></span>${connected ? "Companion connected" : "Connect companion"}`;
  render();
}
$("#connect-btn").onclick = () => $("#connect-dialog").showModal();
$("#guide-connect").onclick = () => $("#connect-dialog").showModal();
$("#pair-btn").onclick = async () => {
  $("#connection-error").textContent = "";
  $("#pair-btn").disabled = true;
  try {
    health = await companion.connect($("#pair-token").value);
    $("#pair-token").value = "";
    $("#connect-dialog").close();
    updateConnection();
    toast(
      `Connected locally. ${health.engines.untrunc ? "Reference engine available." : "Reference engine not installed."}`,
    );
    const history = await companion.listJobs();
    for (const job of history.jobs.slice(0, 100)) {
      let f = files.find((x) => x.nativeJob?.id === job.id);
      if (f) {
        f.nativeJob = job;
        if (!f.busy && !companion.terminal(job.status)) trackJob(f);
        continue;
      }
      f = {
        id: crypto.randomUUID(),
        file: { name: job.name, size: job.report?.inputSize || 0 },
        status: job.status,
        nativeFileId: job.fileId,
        nativeJob: job,
        restored: true,
        diagnosis: {
          title: "Saved companion job",
          summary:
            "Restored from your computer. Reports and outputs remain available locally.",
          issues: [],
          metadata: {},
          engine: "companion",
          repairable: false,
        },
      };
      files.push(f);
      if (!companion.terminal(job.status)) trackJob(f);
    }
    if (!selected) selected = files[0]?.id;
    render();
  } catch (e) {
    $("#connection-error").textContent = e.message;
    updateConnection();
    if (!$("#connect-dialog").open) toast(e.message);
  } finally {
    $("#pair-btn").disabled = false;
  }
};
$("#disconnect-btn").onclick = () => {
  companion.disconnect();
  health = null;
  $("#pair-token").value = "";
  $("#connect-dialog").close();
  updateConnection();
  toast(
    "Disconnected. Jobs already running on the companion continue locally.",
  );
};
function renderCatalog() {
  const found = searchCatalog(
    $("#catalog-search").value,
    $("#catalog-category").value,
  );
  $("#catalog-count").textContent =
    `${found.length} camera and recording families · model-specific coverage planned`;
  $("#catalog-list").innerHTML = found.length
    ? found
        .map(
          (x) =>
            `<article class="catalog-card"><div class="card-top"><h2>${escape(x.name)}</h2><span class="badge">Planned</span></div><p>${escape(x.models)}</p><div class="format-tags">${x.formats.map((v) => `<span>${escape(v)}</span>`).join("")}</div><p>${escape(x.note)}</p></article>`,
        )
        .join("")
    : '<div class="notice">No catalog match. You can still add the file for content-based inspection.</div>';
}
$("#catalog-category").innerHTML += [...new Set(catalog.map((x) => x.category))]
  .map((x) => `<option value="${escape(x)}">${escape(x)}</option>`)
  .join("");
$("#catalog-search").oninput = renderCatalog;
$("#catalog-category").onchange = renderCatalog;
$("#verified-coverage").innerHTML =
  `<div class="verified-list"><div class="verified-row"><span class="badge good">TESTED</span><div><strong>PCM WAV length repair</strong><p>Synthetic fixtures: incorrect RIFF size, incomplete trailing samples, and unchanged surviving audio bytes. Runs in your browser.</p></div></div><div class="verified-row"><span class="badge good">TESTED</span><div><strong>Local H.264 / AAC MP4 remux & validation</strong><p>Generated video fixtures with every audio/video stream decoded. Requires FFmpeg in the companion. This is not camera-wide coverage.</p></div></div><div class="verified-row"><span class="badge warn">EXPERIMENTAL</span><div><strong>Missing-index reconstruction & Sony RSV</strong><p>Reference-based reconstruction with a healthy clip from the same camera and mode. Synthetic H.264/HEVC fixtures recover every surviving frame and audio sample bit-identical, in order and in sync. Real camera RSV fixtures are still needed.</p></div></div></div>`;
renderCatalog();
// Optional agent tools use the same visible state and never select private files.
const context = document.modelContext;
if (context?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  for (const tool of [
    {
      name: "inspect_repair_queue",
      description:
        "Read the files explicitly added to this tab and their repair status.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (!input || Object.keys(input).length)
          throw new Error("Expected an empty object.");
        return files.map((f) => ({
          id: f.id,
          name: f.file.name,
          status: f.status,
          summary: f.diagnosis?.summary,
        }));
      },
    },
    {
      name: "start_sample_repair",
      description:
        "Add the generated demonstration WAV to the visible queue. Does not access private files or start a repair.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      async execute(input) {
        if (!input || Object.keys(input).length)
          throw new Error("Expected an empty object.");
        await addFiles([createDemoFile()]);
        return { selectedFileId: selected, status: "ready" };
      },
    },
  ]) {
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  }
}

initRecovery({ addFiles, download, bytes, toast });
