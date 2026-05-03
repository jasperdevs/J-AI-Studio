import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const comfyUrl = process.env.COMFY_URL || "http://127.0.0.1:8188";
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8787);
const app = express();
const jobs = new Map();
const dataDir = process.env.JAI_DATA_DIR ? path.resolve(process.env.JAI_DATA_DIR) : path.join(root, "data");
const galleryPath = path.join(dataDir, "gallery.json");
let gallery = loadGallery();
const localHosts = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

app.use(express.json({ limit: "25mb" }));

async function comfy(pathname, options = {}) {
  const response = await fetch(`${comfyUrl}${pathname}`, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Comfy ${response.status}: ${text || response.statusText}`);
  }
  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response.arrayBuffer();
}

function optionsFor(info, node, key) {
  const value = info?.[node]?.input?.required?.[key]?.[0];
  if (Array.isArray(value)) return value;
  if (value?.options) return value.options;
  return [];
}

function loadGallery() {
  try {
    return JSON.parse(fs.readFileSync(galleryPath, "utf8"));
  } catch {
    return [];
  }
}

function saveGallery() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(galleryPath, JSON.stringify(gallery.slice(0, 200), null, 2));
}

function promptTitle(text = "") {
  const oneLine = String(text).replace(/\s+/g, " ").trim();
  return oneLine.length > 68 ? `${oneLine.slice(0, 65)}...` : oneLine || "Untitled prompt";
}

function isSupportedImageModel(name = "") {
  return /z[-_ ]?anime|z[-_ ]?image|turbo/i.test(name);
}

function isSupportedVideoModel(name = "") {
  return /wan/i.test(name);
}

function inferModels(info) {
  const unets = optionsFor(info, "UNETLoader", "unet_name");
  const clips = optionsFor(info, "CLIPLoader", "clip_name");
  const vaes = optionsFor(info, "VAELoader", "vae_name");
  const samplers = optionsFor(info, "KSampler", "sampler_name");
  const schedulers = optionsFor(info, "KSampler", "scheduler");
  const imageModels = unets.filter(isSupportedImageModel);
  const videoModels = unets.filter(isSupportedVideoModel);
  const unsupportedModels = unets.filter((name) => !isSupportedImageModel(name) && !isSupportedVideoModel(name));
  return {
    imageModels,
    videoModels,
    unsupportedModels,
    textEncoders: clips,
    vaes,
    samplers,
    schedulers,
    defaults: {
      imageModel: imageModels.find((name) => /anime/i.test(name)) || imageModels[0] || unets[0] || "",
      imageTextEncoder: clips.find((name) => /qwen/i.test(name)) || clips[0] || "",
      imageVae: vaes.find((name) => /ae\.safetensors|flux/i.test(name)) || vaes[0] || "",
      videoModel: videoModels.find((name) => /wan2\.2.*5b|wan/i.test(name)) || videoModels[0] || "",
      videoTextEncoder: clips.find((name) => /umt5/i.test(name)) || clips[0] || "",
      videoVae: vaes.find((name) => /wan/i.test(name)) || vaes[0] || ""
    },
    capabilities: {
      image: imageModels.length > 0,
      video: videoModels.length > 0 && Boolean(info.Wan22ImageToVideoLatent || info.WanImageToVideo),
      referenceImage: Boolean(info.LoadImage && info.VAEEncode)
    }
  };
}

function supportsReferenceImage(modelName = "") {
  return /edit|kontext|inpaint|fill|qwen.*edit|image.?to.?image|img2img/i.test(modelName);
}

async function uploadReferenceImage(dataUrl) {
  if (!dataUrl || !dataUrl.includes(",")) return "";
  const [header, data] = dataUrl.split(",", 2);
  const match = header.match(/data:(.*?);base64/);
  const type = match?.[1] || "image/png";
  const ext = type.includes("jpeg") ? "jpg" : "png";
  const filename = `j-ai-studio-reference-${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(data, "base64");
  const form = new FormData();
  form.append("image", new Blob([bytes], { type }), filename);
  form.append("type", "input");
  const uploaded = await comfy("/upload/image", { method: "POST", body: form });
  return uploaded.name || filename;
}

async function imageGraph(body) {
  const seed = Number(body.seed || crypto.randomInt(1, 2 ** 31));
  const count = Math.max(1, Math.min(8, Number(body.count || 1)));
  const graph = {
    "1": { class_type: "UNETLoader", inputs: { unet_name: body.model, weight_dtype: body.weightDtype || "default" } },
    "2": { class_type: "CLIPLoader", inputs: { clip_name: body.textEncoder, type: body.clipType || "wan", device: body.clipDevice || "default" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: body.vae } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: body.prompt || "", clip: ["2", 0] } },
    "5": { class_type: "CLIPTextEncode", inputs: { text: body.negative || "", clip: ["2", 0] } },
    "6": { class_type: "EmptySD3LatentImage", inputs: { width: Number(body.width || 1024), height: Number(body.height || 1024), batch_size: count } },
    "7": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        seed,
        steps: Number(body.steps || 8),
        cfg: Number(body.cfg || 1),
        sampler_name: body.sampler || "euler_ancestral",
        scheduler: body.scheduler || "beta",
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
        denoise: Number(body.denoise || 1)
      }
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["7", 0], vae: ["3", 0] } },
    "9": { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: "j-ai-studio/image" } }
  };

  if (body.referenceImage && supportsReferenceImage(body.model)) {
    const imageName = await uploadReferenceImage(body.referenceImage);
    graph["6"] = { class_type: "LoadImage", inputs: { image: imageName } };
    graph["10"] = { class_type: "VAEEncode", inputs: { pixels: ["6", 0], vae: ["3", 0] } };
    graph["7"].inputs.latent_image = ["10", 0];
    graph["7"].inputs.denoise = Number(body.denoise || 0.65);
  }

  return graph;
}

function videoGraph(body) {
  const seed = Number(body.seed || crypto.randomInt(1, 2 ** 31));
  return {
    "1": { class_type: "UNETLoader", inputs: { unet_name: body.model, weight_dtype: body.weightDtype || "default" } },
    "2": { class_type: "CLIPLoader", inputs: { clip_name: body.textEncoder, type: body.clipType || "wan", device: body.clipDevice || "default" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: body.vae } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: body.prompt || "", clip: ["2", 0] } },
    "5": { class_type: "CLIPTextEncode", inputs: { text: body.negative || "", clip: ["2", 0] } },
    "6": {
      class_type: "Wan22ImageToVideoLatent",
      inputs: {
        vae: ["3", 0],
        width: Number(body.width || 512),
        height: Number(body.height || 288),
        length: Number(body.frames || 33),
        batch_size: 1
      }
    },
    "7": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        seed,
        steps: Number(body.steps || 12),
        cfg: Number(body.cfg || 5),
        sampler_name: body.sampler || "uni_pc",
        scheduler: body.scheduler || "simple",
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
        denoise: Number(body.denoise || 1)
      }
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["7", 0], vae: ["3", 0] } },
    "9": { class_type: "CreateVideo", inputs: { images: ["8", 0], fps: Number(body.fps || 16) } },
    "10": { class_type: "SaveVideo", inputs: { video: ["9", 0], filename_prefix: "j-ai-studio/video", format: "mp4", codec: "h264" } }
  };
}

function outputsFrom(history) {
  const urls = [];
  for (const output of Object.values(history.outputs || {})) {
    for (const item of [...(output.images || []), ...(output.videos || [])]) {
      const params = new URLSearchParams({
        filename: item.filename,
        subfolder: item.subfolder || "",
        type: item.type || "output"
      });
      urls.push({ url: `/comfy/view?${params}`, filename: item.filename, type: item.filename.endsWith(".mp4") ? "video" : "image" });
    }
  }
  return urls;
}

function recordsFromComfyHistory(history) {
  const records = [];
  for (const [promptId, item] of Object.entries(history || {})) {
    const graph = item?.prompt?.[2] || {};
    const prompt = graph["4"]?.inputs?.text || "";
    const latent = graph["6"]?.inputs || {};
    const model = graph["1"]?.inputs?.unet_name || "";
    for (const output of outputsFrom(item)) {
      records.push({
        ...output,
        id: output.url,
        jobId: promptId,
        status: "done",
        prompt,
        filename: promptTitle(prompt) || output.filename,
        outputName: output.filename,
        createdAt: new Date(Number(item?.prompt?.[3]?.create_time || Date.now())).toISOString(),
        width: Number(latent.width || 0),
        height: Number(latent.height || 0),
        model
      });
    }
  }
  return records;
}

function makePendingItems(id, body) {
  const count = body.kind === "image" ? Math.max(1, Math.min(8, Number(body.count || 1))) : 1;
  const title = promptTitle(body.prompt);
  return Array.from({ length: count }, (_, index) => ({
    id: `${id}-${index}`,
    jobId: id,
    url: "",
    filename: body.kind === "image" && count > 1 ? `${title} ${index + 1}` : title,
    type: body.kind === "video" ? "video" : "image",
    status: "pending",
    prompt: body.prompt || "",
    createdAt: new Date().toISOString(),
    width: Number(body.width || 0),
    height: Number(body.height || 0),
    model: body.model || ""
  }));
}

function replaceGalleryJob(id, outputs, body, status = "done") {
  const title = promptTitle(body.prompt);
  const completed = outputs.map((item, index) => ({
    ...item,
    id: item.url,
    jobId: id,
    status,
    prompt: body.prompt || "",
    filename: title || item.filename,
    createdAt: new Date().toISOString(),
    width: Number(body.width || 0),
    height: Number(body.height || 0),
    model: body.model || "",
    outputName: item.filename,
    index
  }));
  gallery = [...completed, ...gallery.filter((item) => item.jobId !== id && !completed.some((next) => next.id === item.id))].slice(0, 200);
  saveGallery();
  return completed;
}

function updateGalleryJob(id, patch) {
  gallery = gallery.map((item) => (item.jobId === id ? { ...item, ...patch } : item));
  saveGallery();
}

function watchProgress(id, promptId) {
  const wsUrl = comfyUrl.replace(/^http/i, "ws");
  let socket;
  try {
    socket = new WebSocket(`${wsUrl}/ws?clientId=${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
  socket.addEventListener("message", (event) => {
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
        const error = data.exception_message || "Generation failed";
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
    const prompt = body.kind === "video" ? videoGraph(body) : await imageGraph(body);
    const queued = await comfy("/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, client_id: id })
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
    socket = watchProgress(id, queued.prompt_id);
    while (true) {
      const history = await comfy(`/history/${queued.prompt_id}`);
      if (history[queued.prompt_id]) {
        const outputs = outputsFrom(history[queued.prompt_id]);
        const completed = replaceGalleryJob(id, outputs, body);
        jobs.set(id, { ...jobs.get(id), status: "done", outputs: completed });
        socket?.close();
        return;
      }
      if (jobs.get(id)?.status === "canceling" || jobs.get(id)?.status === "canceled") {
        updateGalleryJob(id, { status: "canceled" });
        socket?.close();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1600));
    }
  } catch (error) {
    jobs.set(id, { ...jobs.get(id), status: "error", error: error.message });
    updateGalleryJob(id, { status: "error", filename: error.message });
    socket?.close();
  }
}

app.get("/api/health", async (_req, res) => {
  try {
    const stats = await comfy("/system_stats");
    res.json({ ok: true, comfyUrl, stats });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

app.get("/api/models", async (_req, res) => {
  const info = await comfy("/object_info");
  res.json(inferModels(info));
});

app.get("/api/gallery", async (_req, res) => {
  if (!gallery.some((item) => item.status === "done")) {
    const history = await comfy("/history?max_items=100").catch(() => ({}));
    const recovered = recordsFromComfyHistory(history);
    if (recovered.length) {
      gallery = [...gallery.filter((item) => item.status === "pending"), ...recovered].slice(0, 200);
      saveGallery();
    }
  }
  res.json({ outputs: gallery });
});

app.post("/api/generate", (req, res) => {
  const id = crypto.randomUUID();
  const items = makePendingItems(id, req.body);
  gallery = [...items, ...gallery].slice(0, 200);
  saveGallery();
  jobs.set(id, { status: "queued", kind: req.body.kind, prompt: req.body.prompt, outputs: [], items });
  runJob(id, req.body);
  res.json({ jobId: id, items });
});

app.get("/api/jobs/:id", (req, res) => {
  res.json(jobs.get(req.params.id) || { status: "missing" });
});

app.post("/api/jobs/:id/cancel", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ ok: false, error: "Job not found" });
    return;
  }
  jobs.set(req.params.id, { ...job, status: "canceling" });
  updateGalleryJob(req.params.id, { status: "canceled" });
  try {
    if (job.promptId) {
      await comfy("/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ delete: [job.promptId] })
      });
      await comfy("/interrupt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt_id: job.promptId })
      });
    }
  } catch {
    await comfy("/interrupt", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
  }
  res.json({ ok: true });
});

app.post("/api/queue/cancel", async (_req, res) => {
  for (const [id, job] of jobs) {
    if (job.status === "queued" || job.status === "running" || job.status === "canceling") {
      jobs.set(id, { ...job, status: "canceled" });
      updateGalleryJob(id, { status: "canceled" });
    }
  }
  await comfy("/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clear: true }) }).catch(() => null);
  await comfy("/interrupt", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
  res.json({ ok: true });
});

app.post("/api/gallery/clear", (_req, res) => {
  gallery = gallery.filter((item) => item.status === "pending");
  saveGallery();
  res.json({ ok: true, outputs: gallery });
});

app.post("/api/shutdown", (_req, res) => {
  const remote = _req.socket.remoteAddress || "";
  if (!localHosts.has(remote)) {
    res.status(403).json({ ok: false, error: "Shutdown is only allowed from this computer." });
    return;
  }
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 250);
});

app.get("/comfy/*path", async (req, res) => {
  try {
    const query = req.originalUrl.split("?")[1] ? `?${req.originalUrl.split("?")[1]}` : "";
    const proxyPath = Array.isArray(req.params.path) ? req.params.path.join("/") : req.params.path;
    const response = await fetch(`${comfyUrl}/${proxyPath}${query}`);
    res.status(response.status);
    res.type(response.headers.get("content-type") || "application/octet-stream");
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

const dist = path.join(root, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*splat", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(port, host, () => {
  console.log(`J AI Studio listening on http://${host}:${port}`);
});
