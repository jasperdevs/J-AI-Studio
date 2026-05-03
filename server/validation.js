import { missingNodes, nodeRange, optionsFor } from './comfy.js';
import { inferModels } from './models.js';

export function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : -Number.MAX_SAFE_INTEGER;
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(number)) return safeFallback;
  return Math.max(safeMin, Math.min(safeMax, number));
}

export function clampInteger(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max));
}

export function snapNumber(value, fallback, range = {}) {
  const step = Number(range.step || 1) || 1;
  const min = Number.isFinite(Number(range.min)) ? Number(range.min) : -Number.MAX_SAFE_INTEGER;
  const max = Number.isFinite(Number(range.max)) ? Number(range.max) : Number.MAX_SAFE_INTEGER;
  const base = clampNumber(value, fallback, min, max);
  const snapped = Math.round(base / step) * step;
  return Math.max(min, Math.min(max, snapped));
}

export function snapInteger(value, fallback, range = {}) {
  return Math.round(snapNumber(value, fallback, range));
}

export function ensureOption(info, node, key, value, label) {
  const selected = String(value || "");
  if (!selected) throw new Error(`${label} is required for this workflow.`);
  const options = optionsFor(info, node, key);
  if (options.length && !options.includes(selected)) {
    throw new Error(`${label} is not installed or ComfyUI cannot see it: ${selected}`);
  }
}

function requiredNodesForWorkflow(workflow) {
  if (workflow === "checkpoint-image") return ["CheckpointLoaderSimple", "CLIPTextEncode", "EmptyLatentImage", "KSampler", "VAEDecode", "SaveImage"];
  if (workflow === "unet-image") return ["UNETLoader", "CLIPLoader", "VAELoader", "CLIPTextEncode", "EmptySD3LatentImage", "KSampler", "VAEDecode", "SaveImage"];
  if (workflow === "wan-video") return ["UNETLoader", "CLIPLoader", "VAELoader", "CLIPTextEncode", "Wan22ImageToVideoLatent", "KSampler", "VAEDecode", "CreateVideo", "SaveVideo"];
  return [];
}

export function sanitizeGenerateBody(input = {}, info = {}, stats = {}) {
  const kind = input.kind === "video" ? "video" : "image";
  const workflow = String(input.workflow || "");
  const prompt = String(input.prompt || "").trim();
  if (!prompt) throw new Error("Prompt is required.");
  if (!String(input.model || "").trim()) throw new Error("Choose a supported model first.");
  if (!["unet-image", "checkpoint-image", "wan-video"].includes(workflow)) throw new Error("This model does not have a supported workflow.");
  if (kind === "video" && workflow !== "wan-video") throw new Error("The selected model is not a video workflow.");
  if (kind === "image" && workflow === "wan-video") throw new Error("The selected model is not an image workflow.");
  const missing = missingNodes(info, requiredNodesForWorkflow(workflow));
  if (missing.length) throw new Error(`ComfyUI is missing required nodes for this model: ${missing.join(", ")}`);
  const profiles = inferModels(info, stats).profiles || [];
  const profile = profiles.find((item) => item.kind === kind && item.workflow === workflow && item.model === input.model);
  if (!profile) throw new Error("ComfyUI does not currently expose this model as a runnable workflow.");
  if ((workflow === "unet-image" || workflow === "wan-video") && (!input.textEncoder || !input.vae)) {
    throw new Error("This workflow needs a text encoder and VAE.");
  }

  if (workflow === "checkpoint-image") {
    ensureOption(info, "CheckpointLoaderSimple", "ckpt_name", input.model, "Model");
  } else {
    ensureOption(info, "UNETLoader", "unet_name", input.model, "Model");
    ensureOption(info, "CLIPLoader", "clip_name", input.textEncoder, "Text encoder");
    ensureOption(info, "VAELoader", "vae_name", input.vae, "VAE");
  }
  if (input.sampler) ensureOption(info, "KSampler", "sampler_name", input.sampler, "Sampler");
  if (input.scheduler) ensureOption(info, "KSampler", "scheduler", input.scheduler, "Scheduler");

  const latentNode = workflow === "wan-video" ? "Wan22ImageToVideoLatent" : workflow === "unet-image" ? "EmptySD3LatentImage" : "EmptyLatentImage";
  const widthRange = nodeRange(info, latentNode, "width", { default: kind === "video" ? 512 : 1024, min: 16, max: 16384 });
  const heightRange = nodeRange(info, latentNode, "height", { default: kind === "video" ? 288 : 1024, min: 16, max: 16384 });
  const countRange = nodeRange(info, latentNode, "batch_size", { default: 1, min: 1, max: 8 });
  const frameRange = nodeRange(info, latentNode, "length", { default: 33, min: 1, max: 16384 });
  const fpsRange = nodeRange(info, "CreateVideo", "fps", { default: 16, min: 1, max: 120 });
  const stepsRange = nodeRange(info, "KSampler", "steps", { default: kind === "video" ? 12 : 8, min: 1, max: 10000 });
  const cfgRange = nodeRange(info, "KSampler", "cfg", { default: kind === "video" ? 5 : 1, min: 0, max: 100 });
  const denoiseRange = nodeRange(info, "KSampler", "denoise", { default: 1, min: 0, max: 1 });

  return {
    ...input,
    kind,
    workflow,
    prompt,
    negative: String(input.negative || ""),
    model: String(input.model || ""),
    textEncoder: String(input.textEncoder || ""),
    vae: String(input.vae || ""),
    clipType: String(input.clipType || "wan"),
    weightDtype: String(input.weightDtype || "default"),
    width: snapInteger(input.width, widthRange.default, widthRange),
    height: snapInteger(input.height, heightRange.default, heightRange),
    steps: snapInteger(input.steps, stepsRange.default, stepsRange),
    cfg: snapNumber(input.cfg, cfgRange.default, cfgRange),
    denoise: snapNumber(input.denoise, denoiseRange.default, denoiseRange),
    sampler: String(input.sampler || ""),
    scheduler: String(input.scheduler || ""),
    seed: String(input.seed || ""),
    count: snapInteger(input.count, countRange.default, countRange),
    frames: snapInteger(input.frames, frameRange.default, frameRange),
    fps: snapInteger(input.fps, fpsRange.default, fpsRange),
    startImage: String(input.startImage || ""),
    startImageName: String(input.startImageName || "")
  };
}
