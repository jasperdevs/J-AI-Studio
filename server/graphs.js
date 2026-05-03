import crypto from "node:crypto";
import { comfy } from './comfy.js';

export async function uploadReferenceImage(dataUrl) {
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

export async function imageGraph(body) {
  if (body.workflow === "checkpoint-image") return checkpointImageGraph(body);
  return unetImageGraph(body);
}

export async function unetImageGraph(body) {
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

export async function checkpointImageGraph(body) {
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

export function videoGraph(body) {
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
