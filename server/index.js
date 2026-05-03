import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { execFile } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const comfyUrl = process.env.COMFY_URL || "http://127.0.0.1:8188";
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8787);
const comfyOutputDir = process.env.COMFY_OUTPUT_DIR || "";
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
    const staleAfter = 30 * 60 * 1000;
    return JSON.parse(fs.readFileSync(galleryPath, "utf8")).map((item) => {
      if (item.status === "pending" && Date.now() - Date.parse(item.createdAt || 0) > staleAfter) {
        return { ...item, status: "canceled" };
      }
      return item;
    });
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

function modelBasename(name = "") {
  return String(name).split(/[\\/]/).pop() || name;
}

function prettyModelName(name = "") {
  const base = modelBasename(name).replace(/\.(safetensors|ckpt|pt|bin)$/i, "");
  return base
    .replace(/distill/ig, "")
    .replace(/aio/ig, "")
    .replace(/[_-]+/g, " ")
    .replace(/\bfp(\d+)\b/ig, "FP$1")
    .replace(/\bti2v\b/ig, "TI2V")
    .replace(/\b(\d+)step\b/ig, "$1-Step")
    .replace(/\bz anime\b/ig, "Z-Anime")
    .replace(/\bz image\b/ig, "Z-Image")
    .replace(/\bwan(\d)/ig, "Wan $1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isZImageModel(name = "") {
  return /z[-_ ]?anime|z[-_ ]?image|turbo/i.test(name);
}

function isWanVideoModel(name = "") {
  return /wan/i.test(name);
}

function nodeRange(info, node, key, fallback = {}) {
  const meta = info?.[node]?.input?.required?.[key]?.[1];
  return typeof meta === "object" && !Array.isArray(meta) ? { ...fallback, ...meta } : fallback;
}

function aspectSet(defaults, ratios) {
  return ratios.map(([label, w, h]) => ({ label, value: `${w}x${h}`, w, h, default: w === defaults.width && h === defaults.height }));
}

function buildProfile({ id, kind, label, displayName, description, model, workflow, family, defaults, aspects, options = {}, capabilities = {}, constraints = {} }) {
  return {
    id,
    kind,
    label,
    displayName: displayName || label,
    description: description || modelBasename(model),
    model,
    workflow,
    family,
    defaults,
    aspectPresets: aspects,
    options,
    constraints,
    capabilities: {
      prompt: true,
      negativePrompt: kind === "image",
      steps: true,
      seed: true,
      cfg: true,
      sampler: true,
      scheduler: true,
      variations: kind === "image",
      frames: kind === "video",
      fps: kind === "video",
      textEncoder: false,
      vae: false,
      clipType: false,
      weightDtype: false,
      startImage: false,
      denoise: false,
      ...capabilities
    }
  };
}

function inferModels(info) {
  const unets = optionsFor(info, "UNETLoader", "unet_name");
  const checkpoints = optionsFor(info, "CheckpointLoaderSimple", "ckpt_name");
  const clips = optionsFor(info, "CLIPLoader", "clip_name");
  const clipTypes = optionsFor(info, "CLIPLoader", "type");
  const vaes = optionsFor(info, "VAELoader", "vae_name");
  const samplers = optionsFor(info, "KSampler", "sampler_name");
  const schedulers = optionsFor(info, "KSampler", "scheduler");
  const weightDtypes = optionsFor(info, "UNETLoader", "weight_dtype");
  const profiles = [];
  const sd3Range = {
    width: nodeRange(info, "EmptySD3LatentImage", "width", { default: 1024, min: 16, max: 16384, step: 16 }),
    height: nodeRange(info, "EmptySD3LatentImage", "height", { default: 1024, min: 16, max: 16384, step: 16 })
  };
  const imageRange = {
    width: nodeRange(info, "EmptyLatentImage", "width", { default: 512, min: 16, max: 16384, step: 8 }),
    height: nodeRange(info, "EmptyLatentImage", "height", { default: 512, min: 16, max: 16384, step: 8 })
  };
  const wanRange = {
    width: nodeRange(info, "Wan22ImageToVideoLatent", "width", { default: 512, min: 32, max: 16384, step: 32 }),
    height: nodeRange(info, "Wan22ImageToVideoLatent", "height", { default: 288, min: 32, max: 16384, step: 32 }),
    frames: nodeRange(info, "Wan22ImageToVideoLatent", "length", { default: 49, min: 1, max: 16384, step: 4 })
  };

  for (const name of unets.filter(isZImageModel)) {
    profiles.push(buildProfile({
      id: `image:unet-z:${name}`,
      kind: "image",
      label: `${prettyModelName(name)} · Z image`,
      displayName: prettyModelName(name),
      description: "Z image workflow",
      model: name,
      workflow: "unet-image",
      family: "z-image",
      defaults: {
        width: 1024,
        height: 1024,
        steps: 8,
        cfg: 1,
        sampler: "euler_ancestral",
        scheduler: "beta",
        textEncoder: clips.find((clip) => /qwen/i.test(clip)) || clips[0] || "",
        vae: vaes.find((vae) => /ae\.safetensors|flux/i.test(vae)) || vaes[0] || "",
        clipType: clipTypes.includes("qwen_image") ? "qwen_image" : "wan",
        weightDtype: weightDtypes.includes("default") ? "default" : weightDtypes[0] || "default"
      },
      aspects: aspectSet({ width: 1024, height: 1024 }, [
        ["1:1", 1024, 1024],
        ["16:9", 1344, 768],
        ["9:16", 768, 1344],
        ["4:3", 1152, 864],
        ["3:4", 864, 1152],
        ["2.35:1", 1536, 640]
      ]),
      options: { textEncoders: clips, vaes, clipTypes, weightDtypes, samplers, schedulers },
      constraints: { width: sd3Range.width, height: sd3Range.height },
      capabilities: { textEncoder: true, vae: true, clipType: true, weightDtype: true }
    }));
  }

  for (const name of checkpoints) {
    profiles.push(buildProfile({
      id: `image:checkpoint:${name}`,
      kind: "image",
      label: `${prettyModelName(name)} · checkpoint`,
      displayName: prettyModelName(name),
      description: "Checkpoint workflow",
      model: name,
      workflow: "checkpoint-image",
      family: "checkpoint",
      defaults: {
        width: 1024,
        height: 1024,
        steps: 20,
        cfg: 7,
        sampler: samplers.includes("dpmpp_2m") ? "dpmpp_2m" : samplers[0] || "euler",
        scheduler: schedulers.includes("karras") ? "karras" : schedulers[0] || "normal",
        denoise: 0.65
      },
      aspects: aspectSet({ width: 1024, height: 1024 }, [
        ["1:1", 1024, 1024],
        ["16:9", 1344, 768],
        ["9:16", 768, 1344],
        ["4:3", 1152, 864],
        ["3:4", 864, 1152],
        ["2.35:1", 1536, 640]
      ]),
      options: { samplers, schedulers },
      constraints: { width: imageRange.width, height: imageRange.height },
      capabilities: { startImage: Boolean(info.LoadImage && info.VAEEncode), denoise: Boolean(info.LoadImage && info.VAEEncode) }
    }));
  }

  for (const name of unets.filter(isWanVideoModel)) {
    profiles.push(buildProfile({
      id: `video:wan:${name}`,
      kind: "video",
      label: `${prettyModelName(name)} · Wan video`,
      displayName: prettyModelName(name),
      description: "Wan video workflow",
      model: name,
      workflow: "wan-video",
      family: "wan",
      defaults: {
        width: 512,
        height: 288,
        frames: 33,
        fps: 16,
        steps: 12,
        cfg: 5,
        sampler: samplers.includes("uni_pc") ? "uni_pc" : samplers[0] || "euler",
        scheduler: schedulers.includes("simple") ? "simple" : schedulers[0] || "normal",
        textEncoder: clips.find((clip) => /umt5/i.test(clip)) || clips[0] || "",
        vae: vaes.find((vae) => /wan/i.test(vae)) || vaes[0] || "",
        clipType: clipTypes.includes("wan") ? "wan" : clipTypes[0] || "wan",
        weightDtype: weightDtypes.includes("default") ? "default" : weightDtypes[0] || "default"
      },
      aspects: aspectSet({ width: 512, height: 288 }, [
        ["16:9", 512, 288],
        ["9:16", 288, 512],
        ["1:1", 384, 384],
        ["4:3", 448, 336],
        ["3:4", 336, 448],
        ["2.35:1", 640, 272]
      ]),
      options: { textEncoders: clips, vaes, clipTypes, weightDtypes, samplers, schedulers },
      constraints: { width: wanRange.width, height: wanRange.height, frames: wanRange.frames },
      capabilities: { negativePrompt: true, textEncoder: true, vae: true, clipType: true, weightDtype: true }
    }));
  }

  const imageProfiles = profiles.filter((profile) => profile.kind === "image");
  const videoProfiles = profiles.filter((profile) => profile.kind === "video");
  const profiled = new Set(profiles.map((profile) => profile.model));
  const unsupportedModels = [...new Set([...unets, ...checkpoints].filter((name) => !profiled.has(name)))];
  return {
    imageModels: imageProfiles.map((profile) => ({ label: profile.label, value: profile.id })),
    videoModels: videoProfiles.map((profile) => ({ label: profile.label, value: profile.id })),
    profiles,
    unsupportedModels,
    textEncoders: clips,
    vaes,
    clipTypes,
    weightDtypes,
    samplers,
    schedulers,
    defaults: {
      imageModel: imageProfiles.find((profile) => /anime/i.test(profile.model))?.id || imageProfiles[0]?.id || "",
      videoModel: videoProfiles.find((profile) => /wan2\.2.*5b|wan/i.test(profile.model))?.id || videoProfiles[0]?.id || ""
    },
    capabilities: {
      image: imageProfiles.length > 0,
      video: videoProfiles.length > 0 && Boolean(info.Wan22ImageToVideoLatent || info.WanImageToVideo),
      startImage: profiles.some((profile) => profile.capabilities.startImage)
    }
  };
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
  if (body.workflow === "checkpoint-image") return checkpointImageGraph(body);
  return unetImageGraph(body);
}

async function unetImageGraph(body) {
  const seed = Number(body.seed || crypto.randomInt(1, 2 ** 31));
  const count = Math.max(1, Math.min(8, Number(body.count || 1)));
  return {
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
}

async function checkpointImageGraph(body) {
  const seed = Number(body.seed || crypto.randomInt(1, 2 ** 31));
  const count = Math.max(1, Math.min(8, Number(body.count || 1)));
  const graph = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: body.model } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: body.prompt || "", clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: body.negative || "", clip: ["1", 1] } },
    "4": { class_type: "EmptyLatentImage", inputs: { width: Number(body.width || 1024), height: Number(body.height || 1024), batch_size: count } },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        seed,
        steps: Number(body.steps || 20),
        cfg: Number(body.cfg || 7),
        sampler_name: body.sampler || "dpmpp_2m",
        scheduler: body.scheduler || "karras",
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
        denoise: Number(body.denoise || 1)
      }
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "j-ai-studio/image" } }
  };

  if (body.startImage) {
    const imageName = await uploadReferenceImage(body.startImage);
    graph["6"] = { class_type: "LoadImage", inputs: { image: imageName } };
    graph["8"] = { class_type: "VAEEncode", inputs: { pixels: ["6", 0], vae: ["1", 2] } };
    graph["5"].inputs.latent_image = ["8", 0];
    graph["5"].inputs.denoise = Number(body.denoise || 0.65);
    graph["9"] = graph["7"];
    graph["7"] = { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } };
    graph["9"].inputs.images = ["7", 0];
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
    const negative = graph["5"]?.inputs?.text || graph["3"]?.inputs?.text || "";
    const latent = graph["6"]?.inputs || {};
    const model = graph["1"]?.inputs?.unet_name || "";
    for (const output of outputsFrom(item)) {
      records.push({
        ...output,
        id: output.url,
        jobId: promptId,
        status: "done",
        prompt,
        negative,
        filename: promptTitle(prompt) || output.filename,
        outputName: output.filename,
        createdAt: new Date(Number(item?.prompt?.[3]?.create_time || Date.now())).toISOString(),
        width: Number(latent.width || 0),
        height: Number(latent.height || 0),
        model,
        settings: {}
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
    negative: body.negative || "",
    createdAt: new Date().toISOString(),
    width: Number(body.width || 0),
    height: Number(body.height || 0),
    model: body.model || "",
    settings: generationSettings(body)
  }));
}

function generationSettings(body) {
  return {
    workflow: body.workflow || "",
    steps: Number(body.steps || 0),
    cfg: Number(body.cfg || 0),
    sampler: body.sampler || "",
    scheduler: body.scheduler || "",
    seed: body.seed || "Random",
    count: Number(body.count || 1),
    frames: Number(body.frames || 0),
    fps: Number(body.fps || 0),
    denoise: Number(body.denoise || 0),
    textEncoder: body.textEncoder || "",
    vae: body.vae || "",
    clipType: body.clipType || "",
    weightDtype: body.weightDtype || ""
  };
}

function replaceGalleryJob(id, outputs, body, status = "done") {
  const title = promptTitle(body.prompt);
  const job = jobs.get(id) || {};
  const durationMs = job.startedAt ? Date.now() - job.startedAt : 0;
  const completed = outputs.map((item, index) => ({
    ...item,
    id: item.url,
    jobId: id,
    status,
    prompt: body.prompt || "",
    negative: body.negative || "",
    filename: title || item.filename,
    createdAt: new Date().toISOString(),
    durationMs,
    width: Number(body.width || 0),
    height: Number(body.height || 0),
    model: body.model || "",
    settings: generationSettings(body),
    outputName: item.filename,
    index
  }));
  gallery = [...completed, ...gallery.filter((item) => item.jobId !== id && !completed.some((next) => next.id === item.id))].slice(0, 200);
  saveGallery();
  return completed;
}

function updateGalleryJob(id, patch) {
  let changed = false;
  gallery = gallery.map((item) => {
    if (item.jobId === id || item.id === id || item.url === id) {
      changed = true;
      return { ...item, ...patch };
    }
    return item;
  });
  if (changed) saveGallery();
  return changed;
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
      if (jobs.get(id)?.status === "canceling" || jobs.get(id)?.status === "canceled") {
        updateGalleryJob(id, { status: "canceled" });
        socket?.close();
        return;
      }
      const history = await comfy(`/history/${queued.prompt_id}`);
      if (history[queued.prompt_id]) {
        const outputs = outputsFrom(history[queued.prompt_id]);
        const completed = replaceGalleryJob(id, outputs, body);
        jobs.set(id, { ...jobs.get(id), status: "done", outputs: completed });
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

app.get("/api/paths", (_req, res) => {
  res.json({ outputDir: comfyOutputDir, galleryDir: dataDir });
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
  jobs.set(id, { status: "queued", kind: req.body.kind, prompt: req.body.prompt, outputs: [], items, startedAt: Date.now() });
  runJob(id, req.body);
  res.json({ jobId: id, items });
});

app.get("/api/jobs/:id", (req, res) => {
  res.json(jobs.get(req.params.id) || { status: "missing" });
});

app.post("/api/jobs/:id/cancel", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    const changed = updateGalleryJob(req.params.id, { status: "canceled" });
    await comfy("/interrupt", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
    res.json({ ok: true, stale: true, changed });
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
  gallery = gallery.map((item) => (item.status === "pending" ? { ...item, status: "canceled" } : item));
  saveGallery();
  await comfy("/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clear: true }) }).catch(() => null);
  await comfy("/interrupt", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
  res.json({ ok: true });
});

app.post("/api/gallery/clear", (_req, res) => {
  gallery = gallery.filter((item) => item.status === "pending");
  saveGallery();
  res.json({ ok: true, outputs: gallery });
});

app.delete("/api/gallery/:id", (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const before = gallery.length;
  gallery = gallery.filter((item) => item.id !== id && item.url !== id);
  if (gallery.length !== before) saveGallery();
  res.json({ ok: true, removed: before - gallery.length, outputs: gallery });
});

app.post("/api/open-output-folder", (req, res) => {
  const remote = req.socket.remoteAddress || "";
  if (!localHosts.has(remote)) {
    res.status(403).json({ ok: false, error: "Opening folders is only allowed from this computer." });
    return;
  }
  if (!comfyOutputDir || !fs.existsSync(comfyOutputDir)) {
    res.status(404).json({ ok: false, error: "Output folder is not configured." });
    return;
  }
  execFile("explorer.exe", [comfyOutputDir]);
  res.json({ ok: true, outputDir: comfyOutputDir });
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
