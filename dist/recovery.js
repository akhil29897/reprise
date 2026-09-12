import { extractCandidate } from "./recovery-engine.js";
import { createDemoFile, inspectFile, repairWav } from "./engine.js";
const $ = (s) => document.querySelector(s);
const pageSize = 30;
export function initRecovery({ addFiles, download, bytes, toast }) {
  let source = null,
    worker = null,
    active = false,
    candidates = [],
    result = null,
    page = 0,
    startedAt = 0,
    scanScope = "media",
    elapsedMs = 0,
    cancelTimer;
  const ui = {
    input: $("#image-input"),
    choose: $("#image-choose"),
    demo: $("#image-demo"),
    setup: $("#recovery-setup"),
    source: $("#image-source"),
    scope: $("#recovery-scope"),
    start: $("#scan-start"),
    cancel: $("#scan-cancel"),
    status: $("#scan-status"),
    progress: $("#scan-progress"),
    progressPanel: $("#scan-progress-panel"),
    results: $("#recovery-results"),
    list: $("#recovery-list"),
    filter: $("#recovery-filter"),
    report: $("#recovery-report"),
    summary: $("#recovery-summary"),
    previous: $("#recovery-previous"),
    next: $("#recovery-next"),
    page: $("#recovery-page"),
    warnings: $("#scan-warnings"),
  };
  function controls() {
    const step = active ? 1 : result ? 2 : 0;
    document
      .querySelectorAll("#recovery-view .workflow > span")
      .forEach((el, i) => {
        el.classList.toggle("current", i === step);
        if (i === step) el.setAttribute("aria-current", "step");
        else el.removeAttribute("aria-current");
      });
    ui.start.disabled = !source || active;
    ui.choose.disabled = active;
    ui.demo.disabled = active;
    ui.scope.disabled = active;
    ui.cancel.hidden = !active;
    ui.report.disabled = !result;
    ui.start.textContent = result ? "Scan again" : "Start scan";
  }
  function setSource(file) {
    if (active) return;
    source = file;
    candidates = [];
    result = null;
    page = 0;
    ui.results.hidden = true;
    ui.progressPanel.hidden = true;
    ui.warnings.hidden = true;
    ui.source.textContent = `${file.name} · ${bytes(file.size)}`;
    ui.setup.hidden = false;
    controls();
  }
  ui.choose.onclick = () => ui.input.click();
  ui.input.onchange = () => {
    if (ui.input.files[0]) setSource(ui.input.files[0]);
    ui.input.value = "";
  };
  ui.demo.onclick = async () => {
    ui.demo.disabled = true;
    try {
      const damaged = createDemoFile(),
        fixed = await repairWav(damaged, await inspectFile(damaged));
      const image = new File(
        [new Uint8Array(4093), fixed.blob, new Uint8Array(8192)],
        "reprise-demo.dd",
        { type: "application/octet-stream" },
      );
      setSource(image);
      toast(
        "Demo image ready. It contains one generated WAV among empty bytes.",
      );
    } catch (e) {
      toast(e.message);
    } finally {
      controls();
    }
  };
  function progress(p) {
    ui.progress.max = p.totalBytes;
    ui.progress.value = p.scannedBytes;
    const percent = Math.min(100, (p.scannedBytes / p.totalBytes) * 100);
    ui.status.textContent = `Scanning · ${percent.toFixed(1)}% · ${p.found} candidate${p.found === 1 ? "" : "s"} found`;
    $("#scan-read").textContent =
      `${bytes(p.scannedBytes)} of ${bytes(p.totalBytes)} inspected`;
  }
  function finish(r) {
    clearTimeout(cancelTimer);
    worker?.terminate();
    worker = null;
    active = false;
    result = r;
    elapsedMs = Date.now() - startedAt;
    const label =
      {
        completed: "Scan finished",
        cancelled: "Scan stopped",
        limited: "Scan limit reached",
        failed: "Scan interrupted",
      }[r.status] || "Scan interrupted";
    ui.status.textContent = `${label} · ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`;
    ui.progress.value = r.scannedBytes;
    ui.progress.max = r.totalBytes;
    ui.warnings.textContent = (r.warnings || []).join(" ");
    ui.warnings.hidden = !ui.warnings.textContent;
    ui.results.hidden = false;
    ui.summary.textContent = candidates.length
      ? "Review candidates before using them. Original names and deletion status are unknown."
      : r.status === "completed"
        ? "No supported contiguous files were found. This does not prove the image contains no recoverable files."
        : "No candidates found before the scan stopped. You can scan again.";
    controls();
    renderResults();
    if (!$("#recovery-view").hidden)
      ui.results.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function snapshot(status, warnings = []) {
    return {
      status,
      totalBytes: source.size,
      scannedBytes: ui.progress.value,
      candidates: [...candidates],
      warnings,
    };
  }
  ui.start.onclick = () => {
    if (!source || active) return;
    candidates = [];
    result = null;
    page = 0;
    active = true;
    startedAt = Date.now();
    ui.filter.value = "all";
    scanScope = ui.scope.value;
    ui.progressPanel.hidden = false;
    ui.results.hidden = true;
    ui.warnings.hidden = true;
    progress({ totalBytes: source.size, scannedBytes: 0, found: 0 });
    controls();
    try {
      worker = new Worker(new URL("./recovery-worker.js", import.meta.url), {
        type: "module",
      });
      worker.onmessage = ({ data }) => {
        if (data.type === "candidate") {
          candidates.push(data.candidate);
        } else if (data.type === "progress") progress(data.progress);
        else if (data.type === "done") finish(data.result);
        else if (data.type === "error")
          finish(snapshot("failed", [data.message]));
      };
      worker.onerror = () =>
        finish(
          snapshot("failed", [
            "The scan worker stopped unexpectedly. Your source image was not changed. Try a smaller image or another current browser.",
          ]),
        );
      worker.postMessage({
        type: "start",
        file: source,
        scope: ui.scope.value,
      });
    } catch (e) {
      finish(snapshot("failed", [e.message]));
    }
  };
  ui.cancel.onclick = () => {
    if (!active) return;
    ui.cancel.disabled = true;
    worker?.postMessage({ type: "cancel" });
    // Deterministic fallback even if a hostile parser input stalls its worker.
    cancelTimer = setTimeout(
      () =>
        finish(
          snapshot("cancelled", [
            "Scan was stopped; only candidates received before cancellation are listed.",
          ]),
        ),
      1000,
    );
  };
  function renderResults() {
    ui.cancel.disabled = false;
    const filtered = candidates.filter(
      (c) => ui.filter.value === "all" || c.category === ui.filter.value,
    );
    page = Math.max(
      0,
      Math.min(page, Math.ceil(filtered.length / pageSize) - 1),
    );
    ui.list.replaceChildren();
    for (const c of filtered.slice(page * pageSize, (page + 1) * pageSize)) {
      const row = document.createElement("article");
      row.className = "recovery-row";
      const info = document.createElement("div"),
        name = document.createElement("strong"),
        meta = document.createElement("small");
      name.textContent = c.name;
      meta.textContent = `${c.extension.toUpperCase()} · ${bytes(c.size)} · Offset ${c.offset.toLocaleString()} bytes`;
      info.append(name, meta);
      const details = document.createElement("details"),
        summary = document.createElement("summary"),
        evidence = document.createElement("p");
      summary.textContent = "What was checked";
      evidence.textContent = c.evidence.join(" ");
      details.append(summary, evidence);
      info.append(details);
      const actions = document.createElement("div");
      actions.className = "inline-actions";
      const save = document.createElement("button");
      save.className = "button secondary";
      save.textContent = "Save file";
      save.onclick = () => {
        try {
          download(extractCandidate(source, c), c.name);
        } catch (e) {
          toast(e.message);
        }
      };
      actions.append(save);
      if (["audio", "video"].includes(c.category)) {
        const repair = document.createElement("button");
        repair.className = "text-button";
        repair.textContent = "Open in repair";
        repair.onclick = () => {
          try {
            addFiles([
              new File([extractCandidate(source, c)], c.name, { type: c.mime }),
            ]);
          } catch (e) {
            toast(e.message);
          }
        };
        actions.append(repair);
      }
      row.append(info, actions);
      ui.list.append(row);
    }
    if (!filtered.length && candidates.length) {
      const p = document.createElement("p");
      p.textContent = "No candidates match this filter.";
      ui.list.append(p);
    }
    $("#recovery-count").textContent = `${candidates.length} found`;
    ui.previous.disabled = page === 0;
    ui.next.disabled = (page + 1) * pageSize >= filtered.length;
    ui.page.textContent = filtered.length
      ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length}`
      : "0 results";
    $("#recovery-pagination").hidden = filtered.length <= pageSize;
    $("#recovery-result-controls").hidden = !candidates.length;
  }
  ui.filter.onchange = () => {
    page = 0;
    renderResults();
  };
  ui.previous.onclick = () => {
    page--;
    renderResults();
  };
  ui.next.onclick = () => {
    page++;
    renderResults();
  };
  ui.report.onclick = () => {
    if (!result) return;
    const report = {
      product: "Reprise",
      version: "0.2.0-alpha",
      method: "contiguous-signature-carving",
      createdAt: new Date().toISOString(),
      elapsedMs,
      source: { name: source.name, size: source.size, modified: false },
      scope: scanScope,
      ...result,
      validation: {
        fullDecode: false,
        originalCompleteness: "unknown",
        deletionStatus: "unknown",
        filesystemMetadata: false,
      },
      limitations: [
        "Contiguous supported formats only. Fragmented, overwritten, TRIMmed and encrypted data are not reconstructed.",
        "Original filenames and folders are not recovered. Existing and deleted files can both appear.",
        "Nested candidates inside accepted files are skipped. Reports contain structural evidence, not proof of playability.",
      ],
    };
    download(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
      "reprise-recovery-report.json",
    );
  };
  window.addEventListener("beforeunload", (e) => {
    if (active) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  controls();
}
