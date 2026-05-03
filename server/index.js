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

function inferModels(info) {
  const unets = optionsFor(info, "UNETLoader", "unet_name");
  const clips = optionsFor(info, "CLIPLoader", "clip_name");
  const vaes = optionsFor(info, "VAELoader", "vae_name");
  const samplers = optionsFor(info, "KSampler", "sampler_name");
  const schedulers = optionsFor(info, "KSampler", "scheduler");
  const imageModels = unets.filter((name) => /z[-_ ]?anime|z[-_ ]?image|turbo/i.test(name));
  const videoModels = unets.filter((name) => /wan|hunyuan|ltxv|mochi|video/i.test(name));
  return {
    imageModels: imageModels.length ? imageModels : unets,
    videoModels,
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
      image: imageModels.length > 0 || unets.length > 0,
      video: videoModels.length > 0 && Boolean(info.Wan22ImageToVideoLatent || info.WanImageToVideo)
    }
  };
}

function imageGraph(body) {
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

async function runJob(id, body) {
  try {
    const prompt = body.kind === "video" ? videoGraph(body) : imageGraph(body);
    const queued = await comfy("/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, client_id: id })
    });
    jobs.set(id, { ...jobs.get(id), status: "running", promptId: queued.prompt_id });
    while (true) {
      const history = await comfy(`/history/${queued.prompt_id}`);
      if (history[queued.prompt_id]) {
        jobs.set(id, { ...jobs.get(id), status: "done", outputs: outputsFrom(history[queued.prompt_id]) });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1600));
    }
  } catch (error) {
    jobs.set(id, { ...jobs.get(id), status: "error", error: error.message });
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

app.post("/api/generate", (req, res) => {
  const id = crypto.randomUUID();
  jobs.set(id, { status: "queued", kind: req.body.kind, prompt: req.body.prompt, outputs: [] });
  runJob(id, req.body);
  res.json({ jobId: id });
});

app.get("/api/jobs/:id", (req, res) => {
  res.json(jobs.get(req.params.id) || { status: "missing" });
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
