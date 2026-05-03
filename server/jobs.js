import { comfy, comfyUrl, normalizeComfyError } from './comfy.js';
import { imageGraph, videoGraph } from './graphs.js';
import { outputsFrom, replaceGalleryJob, updateGalleryJob } from './gallery-store.js';

export const jobs = new Map();

function binaryPreviewBuffer(data) {
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (Buffer.isBuffer(data)) return data;
  return null;
}

async function previewBuffer(data) {
  const buffer = binaryPreviewBuffer(data);
  if (buffer) return buffer;
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return Buffer.from(await data.arrayBuffer());
  }
  return null;
}

function applyPreviewBuffer(id, buffer) {
  if (!buffer || buffer.length < 8) return false;
  const eventType = buffer.readUInt32BE(0);
  if (eventType !== 1 && eventType !== 4) return false;
  let mime = "image/jpeg";
  let image = buffer.subarray(8);
  if (eventType === 1) {
    const imageType = buffer.readUInt32BE(4);
    mime = imageType === 2 ? "image/png" : "image/jpeg";
  } else {
    const metadataLength = buffer.readUInt32BE(4);
    const metadataStart = 8;
    const imageStart = metadataStart + metadataLength;
    if (imageStart > buffer.length) return true;
    try {
      const metadata = JSON.parse(buffer.subarray(metadataStart, imageStart).toString("utf8"));
      if (typeof metadata.image_type === "string") mime = metadata.image_type;
    } catch {
      // Keep default mime when metadata is not parseable.
    }
    image = buffer.subarray(imageStart);
  }
  if (image.length < 16) return true;
  const preview = `data:${mime};base64,${image.toString("base64")}`;
  const current = jobs.get(id) || {};
  jobs.set(id, { ...current, preview });
  updateGalleryJob(id, { preview }, { persist: false });
  return true;
}

function openProgressSocket(id) {
  const wsUrl = comfyUrl.replace(/^http/i, "ws");
  let socket;
  try {
    socket = new WebSocket(`${wsUrl}/ws?clientId=${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
  socket.binaryType = "arraybuffer";
  return socket;
}

function waitForSocketOpen(socket) {
  if (!socket || socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", done, { once: true });
    setTimeout(done, 1200);
  });
}

function sendSocketFeatureFlags(socket) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify({ type: "feature_flags", data: { supports_preview_metadata: true } }));
  } catch {
    // Preview frames are optional; generation should still continue.
  }
}

function watchProgress(id, promptId, socket = openProgressSocket(id)) {
  if (!socket) return null;
  socket.addEventListener("message", async (event) => {
    try {
      const buffer = await previewBuffer(event.data);
      if (applyPreviewBuffer(id, buffer)) return;
    } catch {
      // Ignore malformed binary frames.
    }
    if (typeof event.data !== "string") {
      return;
    }
    try {
      const message = JSON.parse(event.data);
      const data = message.data || {};
      if (data.prompt_id && data.prompt_id !== promptId) return;
      const current = jobs.get(id) || {};
      if (message.type === "progress") {
        const progress = { value: Number(data.value || 0), max: Number(data.max || 0), node: data.node || "" };
        jobs.set(id, { ...current, status: "running", progress });
        updateGalleryJob(id, { status: "pending", progress });
      }
      if (message.type === "execution_interrupted") {
        jobs.set(id, { ...current, status: "canceled" });
        updateGalleryJob(id, { status: "canceled" });
      }
      if (message.type === "execution_error") {
        const error = normalizeComfyError(data.exception_message);
        jobs.set(id, { ...current, status: "error", error });
        updateGalleryJob(id, { status: "error", filename: error });
      }
    } catch {
      // Ignore malformed websocket messages from Comfy extensions.
    }
  });
  return socket;
}

async function runJob(id, body) {
  let socket = null;
  try {
    const prompt = body.kind === "video" ? await videoGraph(body) : await imageGraph(body);
    socket = openProgressSocket(id);
    await waitForSocketOpen(socket);
    sendSocketFeatureFlags(socket);
    const queued = await comfy("/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, client_id: id, extra_data: { preview_method: "auto" } })
    });
    if (jobs.get(id)?.status === "canceling" || jobs.get(id)?.status === "canceled") {
      await comfy("/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ delete: [queued.prompt_id] })
      }).catch(() => null);
      updateGalleryJob(id, { status: "canceled" });
      jobs.set(id, { ...jobs.get(id), status: "canceled", promptId: queued.prompt_id });
      return;
    }
    jobs.set(id, { ...jobs.get(id), status: "running", promptId: queued.prompt_id });
    watchProgress(id, queued.prompt_id, socket);
    while (true) {
      if (jobs.get(id)?.status === "canceling" || jobs.get(id)?.status === "canceled") {
        updateGalleryJob(id, { status: "canceled" });
        socket?.close();
        return;
      }
      const history = await comfy(`/history/${queued.prompt_id}`);
      if (history[queued.prompt_id]) {
        const outputs = outputsFrom(history[queued.prompt_id]);
        const completed = replaceGalleryJob(id, outputs, body, jobs);
        jobs.set(id, { ...jobs.get(id), status: "done", outputs: completed });
        socket?.close();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1600));
    }
  } catch (error) {
    const message = normalizeComfyError(error.message);
    jobs.set(id, { ...jobs.get(id), status: "error", error: message });
    updateGalleryJob(id, { status: "error", filename: message });
    socket?.close();
  }
}
export { runJob };
