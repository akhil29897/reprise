// Only the fixed loopback endpoint ever receives a pairing token or media bytes.
const ORIGIN = "http://127.0.0.1:47831";
let token = "";
export const isConnected = () => Boolean(token);
export function disconnect() {
  token = "";
}
async function request(path, options = {}) {
  if (!token) throw new Error("Connect the companion first.");
  if (
    !/^\/v1\/(health|files|jobs)(\/[a-zA-Z0-9-]+)*(\/output|\/report|\/cancel)?$/.test(
      path,
    )
  )
    throw new Error("Invalid companion request.");
  const response = await fetch(ORIGIN + path, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok) {
    let message;
    try {
      message = (await response.json()).error;
    } catch {}
    throw new Error(message || `Companion returned ${response.status}.`);
  }
  return response;
}
export async function connect(value) {
  token = value.trim();
  if (!token) {
    throw new Error("Paste the token from the companion terminal.");
  }
  try {
    const r = await request("/v1/health", {
      signal: AbortSignal.timeout(5000),
    });
    return await r.json();
  } catch (e) {
    token = "";
    throw new Error(
      e.message === "Failed to fetch"
        ? "Could not reach the companion. Start it on this computer and allow local-network access if your browser asks."
        : e.message,
    );
  }
}
export async function upload(file, signal) {
  const r = await request("/v1/files", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Filename": encodeURIComponent(file.name),
    },
    body: file,
    signal,
  });
  return r.json();
}
export async function createJob(fileId, referenceId) {
  return (
    await request("/v1/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId,
        referenceId,
        strategy: referenceId ? "reference" : "auto",
      }),
    })
  ).json();
}
export async function getJob(id) {
  return (
    await request(`/v1/jobs/${id}`, { signal: AbortSignal.timeout(15000) })
  ).json();
}
export async function listJobs() {
  return (
    await request("/v1/jobs", { signal: AbortSignal.timeout(15000) })
  ).json();
}
export async function cancelJob(id) {
  return (
    await request(`/v1/jobs/${id}/cancel`, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
    })
  ).json();
}
export async function outputResponse(id) {
  return request(`/v1/jobs/${id}/output`);
}
export const terminal = (status) =>
  ["completed", "partial", "failed", "cancelled", "interrupted"].includes(
    status,
  );
