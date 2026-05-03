export const workflows = {
  "unet-image": {
    id: "unet-image",
    kind: "image",
    family: "z-image",
    latentNode: "EmptySD3LatentImage",
    requiredNodes: ["UNETLoader", "CLIPLoader", "VAELoader", "CLIPTextEncode", "EmptySD3LatentImage", "KSampler", "VAEDecode", "SaveImage"],
    modelNode: "UNETLoader",
    modelKey: "unet_name",
    needsTextEncoder: true,
    needsVae: true
  },
  "checkpoint-image": {
    id: "checkpoint-image",
    kind: "image",
    family: "checkpoint",
    latentNode: "EmptyLatentImage",
    requiredNodes: ["CheckpointLoaderSimple", "CLIPTextEncode", "EmptyLatentImage", "KSampler", "VAEDecode", "SaveImage"],
    modelNode: "CheckpointLoaderSimple",
    modelKey: "ckpt_name",
    needsTextEncoder: false,
    needsVae: false
  },
  "wan-video": {
    id: "wan-video",
    kind: "video",
    family: "wan",
    latentNode: "Wan22ImageToVideoLatent",
    requiredNodes: ["UNETLoader", "CLIPLoader", "VAELoader", "CLIPTextEncode", "Wan22ImageToVideoLatent", "KSampler", "VAEDecode", "CreateVideo", "SaveVideo"],
    modelNode: "UNETLoader",
    modelKey: "unet_name",
    needsTextEncoder: true,
    needsVae: true
  }
};

export function workflowFor(id) {
  return workflows[id] || null;
}

export function workflowIds() {
  return Object.keys(workflows);
}
