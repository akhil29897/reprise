import { scanImage } from "./recovery-engine.js";
let controller;
self.onmessage = async ({ data }) => {
  if (data.type === "cancel") {
    controller?.abort();
    return;
  }
  if (data.type !== "start" || controller) return;
  controller = new AbortController();
  try {
    const result = await scanImage(data.file, {
      scope: data.scope,
      signal: controller.signal,
      onProgress: (progress) =>
        self.postMessage({ type: "progress", progress }),
      onCandidate: (candidate) =>
        self.postMessage({ type: "candidate", candidate }),
    });
    self.postMessage({ type: "done", result });
  } catch (e) {
    self.postMessage({
      type: "error",
      message: e.message || "The image could not be read.",
    });
  } finally {
    controller = null;
  }
};
