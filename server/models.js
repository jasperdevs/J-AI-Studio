import { missingNodes, nodeRange, optionsFor, textRange } from './comfy.js';

export function modelBasename(name = "") {
  return String(name).split(/[\\/]/).pop() || name;
}

export function prettyModelName(name = "") {
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

export function isZImageModel(name = "") {
  return /z[-_ ]?anime|z[-_ ]?image/i.test(name);
}

export function isNvfp4Model(name = "") {
  return /nvfp4/i.test(name);
}

export function torchVersionAtLeast(version = "", major, minor) {
  const match = String(version).match(/(\d+)\.(\d+)/);
  if (!match) return false;
  const currentMajor = Number(match[1]);
  const currentMinor = Number(match[2]);
  return currentMajor > major || (currentMajor === major && currentMinor >= minor);
}

export function torchSupportsNvfp4(stats = {}) {
  return torchVersionAtLeast(stats?.system?.pytorch_version, 2, 8);
}

export function isWanVideoModel(name = "") {
  return /wan/i.test(name);
}

export function snapDimension(value, meta = {}) {
  const step = Number(meta.step || 1) || 1;
  const min = Number(meta.min || step) || step;
  const max = Number(meta.max || 16384) || 16384;
  const snapped = Math.round(value / step) * step;
  return Math.max(min, Math.min(max, snapped));
}

export function detectedDefault(meta = {}, fallback) {
  const value = Number(meta.default);
  return Number.isFinite(value) ? value : fallback;
}

export function aspectSet(defaults, ratios, ranges = {}) {
  const defaultArea = Math.max(1, Number(defaults.width || 1024) * Number(defaults.height || 1024));
  const seen = new Set();
  return ratios.map(([label, ratioW, ratioH]) => {
    const scale = Math.sqrt(defaultArea / Math.max(1, ratioW * ratioH));
    const w = snapDimension(ratioW * scale, ranges.width);
    const h = snapDimension(ratioH * scale, ranges.height);
    const value = `${w}x${h}`;
    if (seen.has(value)) return null;
    seen.add(value);
    return { label, value, w, h, default: w === defaults.width && h === defaults.height };
  }).filter(Boolean);
}

export function buildProfile({ id, kind, label, displayName, description, model, workflow, family, defaults, aspects, options = {}, capabilities = {}, constraints = {} }) {
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

export function inferModels(info, stats = {}) {
  const missingCoreImageNodes = missingNodes(info, ["KSampler", "CLIPTextEncode", "VAEDecode", "SaveImage"]);
  if (missingCoreImageNodes.length) {
    return emptyModelResult({ reason: `ComfyUI is missing required image nodes: ${missingCoreImageNodes.join(", ")}` });
  }
  const unets = optionsFor(info, "UNETLoader", "unet_name");
  const checkpoints = optionsFor(info, "CheckpointLoaderSimple", "ckpt_name");
  const clips = optionsFor(info, "CLIPLoader", "clip_name");
  const clipTypes = optionsFor(info, "CLIPLoader", "type");
  const vaes = optionsFor(info, "VAELoader", "vae_name");
  const samplers = optionsFor(info, "KSampler", "sampler_name");
  const schedulers = optionsFor(info, "KSampler", "scheduler");
  const weightDtypes = optionsFor(info, "UNETLoader", "weight_dtype");
  const incompatibleModels = unets.filter((name) => isNvfp4Model(name) && !torchSupportsNvfp4(stats));
  const runnableUnets = unets.filter((name) => !incompatibleModels.includes(name));
  const textMeta = textRange(info, "CLIPTextEncode", "text");
  const samplerRange = {
    steps: nodeRange(info, "KSampler", "steps", { default: 20, min: 1, max: 10000, step: 1 }),
    cfg: nodeRange(info, "KSampler", "cfg", { default: 8, min: 0, max: 100, step: 0.1 }),
    denoise: nodeRange(info, "KSampler", "denoise", { default: 1, min: 0, max: 1, step: 0.01 })
  };
  const profiles = [];
  const canRunUnetImage = missingNodes(info, ["UNETLoader", "CLIPLoader", "VAELoader", "EmptySD3LatentImage"]).length === 0;
  const canRunCheckpointImage = missingNodes(info, ["CheckpointLoaderSimple", "EmptyLatentImage"]).length === 0;
  const canRunWanVideo = missingNodes(info, ["UNETLoader", "CLIPLoader", "VAELoader", "Wan22ImageToVideoLatent", "CreateVideo", "SaveVideo"]).length === 0;
  const sd3Range = {
    width: nodeRange(info, "EmptySD3LatentImage", "width", { default: 1024, min: 16, max: 16384, step: 16 }),
    height: nodeRange(info, "EmptySD3LatentImage", "height", { default: 1024, min: 16, max: 16384, step: 16 }),
    count: nodeRange(info, "EmptySD3LatentImage", "batch_size", { default: 1, min: 1, max: 4096, step: 1 })
  };
  const imageRange = {
    width: nodeRange(info, "EmptyLatentImage", "width", { default: 512, min: 16, max: 16384, step: 8 }),
    height: nodeRange(info, "EmptyLatentImage", "height", { default: 512, min: 16, max: 16384, step: 8 }),
    count: nodeRange(info, "EmptyLatentImage", "batch_size", { default: 1, min: 1, max: 4096, step: 1 })
  };
  const wanRange = {
    width: nodeRange(info, "Wan22ImageToVideoLatent", "width", { default: 512, min: 32, max: 16384, step: 32 }),
    height: nodeRange(info, "Wan22ImageToVideoLatent", "height", { default: 288, min: 32, max: 16384, step: 32 }),
    frames: nodeRange(info, "Wan22ImageToVideoLatent", "length", { default: 49, min: 1, max: 16384, step: 4 }),
    fps: nodeRange(info, "CreateVideo", "fps", { default: 30, min: 1, max: 120, step: 1 })
  };

  const zImageNames = new Set(canRunUnetImage ? runnableUnets.filter(isZImageModel) : []);
  for (const name of zImageNames) {
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
        width: detectedDefault(sd3Range.width, 1024),
        height: detectedDefault(sd3Range.height, 1024),
        steps: 8,
        cfg: 1,
        sampler: "euler_ancestral",
        scheduler: "beta",
        textEncoder: clips.find((clip) => /qwen/i.test(clip)) || clips[0] || "",
        vae: vaes.find((vae) => /ae\.safetensors|flux/i.test(vae)) || vaes[0] || "",
        clipType: clipTypes.includes("qwen_image") ? "qwen_image" : "wan",
        weightDtype: weightDtypes.includes("default") ? "default" : weightDtypes[0] || "default"
      },
      aspects: aspectSet({ width: detectedDefault(sd3Range.width, 1024), height: detectedDefault(sd3Range.height, 1024) }, [
        ["1:1", 1, 1],
        ["16:9", 16, 9],
        ["9:16", 9, 16],
        ["4:3", 4, 3],
        ["3:4", 3, 4],
        ["2.35:1", 235, 100]
      ], { width: sd3Range.width, height: sd3Range.height }),
      options: { textEncoders: clips, vaes, clipTypes, weightDtypes, samplers, schedulers },
      constraints: { prompt: textMeta, negative: textMeta, width: sd3Range.width, height: sd3Range.height, count: sd3Range.count, ...samplerRange },
      capabilities: { textEncoder: true, vae: true, weightDtype: true }
    }));
  }

  for (const name of canRunCheckpointImage ? checkpoints.filter((name) => !zImageNames.has(name)) : []) {
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
        width: detectedDefault(imageRange.width, 512),
        height: detectedDefault(imageRange.height, 512),
        steps: 20,
        cfg: 7,
        sampler: samplers.includes("dpmpp_2m") ? "dpmpp_2m" : samplers[0] || "euler",
        scheduler: schedulers.includes("karras") ? "karras" : schedulers[0] || "normal",
        denoise: 0.65
      },
      aspects: aspectSet({ width: detectedDefault(imageRange.width, 512), height: detectedDefault(imageRange.height, 512) }, [
        ["1:1", 1, 1],
        ["16:9", 16, 9],
        ["9:16", 9, 16],
        ["4:3", 4, 3],
        ["3:4", 3, 4],
        ["2.35:1", 235, 100]
      ], { width: imageRange.width, height: imageRange.height }),
      options: { samplers, schedulers },
      constraints: { prompt: textMeta, negative: textMeta, width: imageRange.width, height: imageRange.height, count: imageRange.count, ...samplerRange },
      capabilities: { startImage: Boolean(info.LoadImage && info.VAEEncode), denoise: Boolean(info.LoadImage && info.VAEEncode) }
    }));
  }

  for (const name of canRunWanVideo ? runnableUnets.filter(isWanVideoModel) : []) {
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
        width: detectedDefault(wanRange.width, 512),
        height: detectedDefault(wanRange.height, 288),
        frames: detectedDefault(wanRange.frames, 33),
        fps: detectedDefault(wanRange.fps, 16),
        steps: detectedDefault(samplerRange.steps, 12),
        cfg: 5,
        sampler: samplers.includes("uni_pc") ? "uni_pc" : samplers[0] || "euler",
        scheduler: schedulers.includes("simple") ? "simple" : schedulers[0] || "normal",
        textEncoder: clips.find((clip) => /umt5/i.test(clip)) || clips[0] || "",
        vae: vaes.find((vae) => /wan/i.test(vae)) || vaes[0] || "",
        clipType: clipTypes.includes("wan") ? "wan" : clipTypes[0] || "wan",
        weightDtype: weightDtypes.includes("default") ? "default" : weightDtypes[0] || "default"
      },
      aspects: aspectSet({ width: detectedDefault(wanRange.width, 512), height: detectedDefault(wanRange.height, 288) }, [
        ["16:9", 16, 9],
        ["9:16", 9, 16],
        ["1:1", 1, 1],
        ["4:3", 4, 3],
        ["3:4", 3, 4],
        ["2.35:1", 235, 100]
      ], { width: wanRange.width, height: wanRange.height }),
      options: { textEncoders: clips, vaes, clipTypes, weightDtypes, samplers, schedulers },
      constraints: { prompt: textMeta, negative: textMeta, width: wanRange.width, height: wanRange.height, frames: wanRange.frames, fps: wanRange.fps, ...samplerRange },
      capabilities: { negativePrompt: true, textEncoder: true, vae: true, weightDtype: true }
    }));
  }

  const imageProfiles = profiles.filter((profile) => profile.kind === "image");
  const videoProfiles = profiles.filter((profile) => profile.kind === "video");
  const profiled = new Set(profiles.map((profile) => profile.model));
  const unsupportedModels = [...new Set([...incompatibleModels, ...unets, ...checkpoints].filter((name) => !profiled.has(name)))];
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

function emptyModelResult(extra = {}) {
  return {
    imageModels: [],
    videoModels: [],
    profiles: [],
    unsupportedModels: [],
    textEncoders: [],
    vaes: [],
    clipTypes: [],
    weightDtypes: [],
    samplers: [],
    schedulers: [],
    defaults: { imageModel: "", videoModel: "" },
    capabilities: { image: false, video: false, startImage: false },
    ...extra
  };
}
