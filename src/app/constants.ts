import type { AspectPreset, Mode, Preferences } from './types';

export const defaultPrefs: Preferences = {
  defaultImageCount: 1,
  defaultImageSteps: 8,
  defaultVideoFrames: 33,
  defaultVideoSteps: 12,
  defaultFps: 16,
  variationQueueMode: "batch",
  zenMode: false,
  confirmActions: true,
  enterToGenerate: true,
  followLatest: true,
  showFailedItems: true
};

export const galleryInitialBatch = 72;
export const galleryBatchSize = 48;

export const fallbackAspectPresets: Record<Mode, AspectPreset[]> = {
  image: [
    { label: "1:1", value: "1024x1024", w: 1024, h: 1024 },
    { label: "16:9", value: "1344x768", w: 1344, h: 768 },
    { label: "9:16", value: "768x1344", w: 768, h: 1344 },
    { label: "4:3", value: "1152x864", w: 1152, h: 864 },
    { label: "3:4", value: "864x1152", w: 864, h: 1152 },
    { label: "2.35:1", value: "1536x640", w: 1536, h: 640 }
  ],
  video: [
    { label: "16:9", value: "512x288", w: 512, h: 288 },
    { label: "9:16", value: "288x512", w: 288, h: 512 },
    { label: "1:1", value: "384x384", w: 384, h: 384 },
    { label: "4:3", value: "448x336", w: 448, h: 336 },
    { label: "3:4", value: "336x448", w: 336, h: 448 },
    { label: "2.35:1", value: "640x272", w: 640, h: 272 }
  ]
};

export const fallbackSamplers = ["euler_ancestral", "euler", "uni_pc", "dpmpp_2m", "dpmpp_sde"];
export const fallbackSchedulers = ["beta", "simple", "normal", "karras", "sgm_uniform"];
export const githubUrl = "https://github.com/jasperdevs/J-AI-Studio";
