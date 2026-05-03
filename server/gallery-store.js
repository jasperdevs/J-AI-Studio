import fs from "node:fs";
import path from "node:path";
import { comfyOutputDir, root } from './comfy.js';

export const dataDir = process.env.JAI_DATA_DIR ? path.resolve(process.env.JAI_DATA_DIR) : path.join(root, "data");
export const galleryPath = path.join(dataDir, "gallery.json");
export const hiddenGalleryPath = path.join(dataDir, "gallery-hidden.json");
export const galleryLimit = Number(process.env.JAI_GALLERY_LIMIT || 1000);

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

export let gallery = loadGallery();
export let hiddenGalleryIds = loadHiddenGalleryIds();

export function setGallery(items) {
  gallery = items;
}

function loadHiddenGalleryIds() {
  try {
    const raw = JSON.parse(fs.readFileSync(hiddenGalleryPath, "utf8"));
    if (Array.isArray(raw)) return new Map(raw.map((key) => [key, 0]));
    return new Map(Object.entries(raw).map(([key, value]) => [key, Number(value) || 0]));
  } catch {
    return new Map();
  }
}

export function galleryKey(item) {
  return item?.url || item?.id || item?.outputName || item?.filename || "";
}

export function hideGalleryItems(items) {
  const hiddenAt = Date.now();
  for (const item of items) {
    const key = galleryKey(item);
    if (key) hiddenGalleryIds.set(key, hiddenAt);
  }
  saveHiddenGalleryIds();
}

export function isGalleryHidden(item) {
  const key = galleryKey(item);
  if (!key || !hiddenGalleryIds.has(key)) return false;
  const hiddenAt = Number(hiddenGalleryIds.get(key) || 0);
  const createdAt = Date.parse(item?.createdAt || "");
  if (hiddenAt && Number.isFinite(createdAt) && createdAt > hiddenAt) return false;
  return true;
}

export function filterVisibleGallery(items) {
  return items.filter((item) => !isGalleryHidden(item));
}

export function outputFileCandidates(item) {
  if (!comfyOutputDir) return [];
  const keys = [item?.url, item?.id, item?.outputName, item?.filename].filter(Boolean);
  const candidates = [];
  for (const key of keys) {
    let filename = "";
    let subfolder = "";
    if (String(key).startsWith("/comfy/view?")) {
      const params = new URLSearchParams(String(key).split("?")[1] || "");
      filename = params.get("filename") || "";
      subfolder = params.get("subfolder") || "";
    } else if (String(key).startsWith("http")) {
      try {
        const parsed = new URL(String(key));
        filename = parsed.searchParams.get("filename") || path.basename(parsed.pathname);
        subfolder = parsed.searchParams.get("subfolder") || "";
      } catch {
        filename = path.basename(String(key));
      }
    } else {
      filename = path.basename(String(key));
    }
    if (!filename || filename === "." || filename === "/") continue;
    const base = path.resolve(comfyOutputDir);
    const withSubfolder = subfolder && path.basename(base).toLowerCase() !== path.basename(subfolder).toLowerCase()
      ? path.resolve(base, subfolder, filename)
      : path.resolve(base, filename);
    candidates.push(withSubfolder);
  }
  return [...new Set(candidates)];
}

export function deleteGalleryFiles(items) {
  const base = comfyOutputDir ? path.resolve(comfyOutputDir) : "";
  if (!base) return { deleted: 0, skipped: 0 };
  let deleted = 0;
  let skipped = 0;
  for (const item of items) {
    for (const file of outputFileCandidates(item)) {
      const resolved = path.resolve(file);
      if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
        skipped += 1;
        continue;
      }
      try {
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          fs.unlinkSync(resolved);
          deleted += 1;
        }
      } catch {
        skipped += 1;
      }
    }
  }
  return { deleted, skipped };
}

export function hasExistingOutputFile(item) {
  if (!comfyOutputDir) return true;
  return outputFileCandidates(item).some((file) => {
    const resolved = path.resolve(file);
    const base = path.resolve(comfyOutputDir);
    if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) return false;
    try {
      return fs.existsSync(resolved) && fs.statSync(resolved).isFile();
    } catch {
      return false;
    }
  });
}

export function saveGallery() {
  fs.mkdirSync(dataDir, { recursive: true });
  const persistable = gallery.slice(0, galleryLimit).map(({ preview, ...rest }) => rest);
  fs.writeFileSync(galleryPath, JSON.stringify(persistable, null, 2));
}

export function saveHiddenGalleryIds() {
  fs.mkdirSync(dataDir, { recursive: true });
  const entries = [...hiddenGalleryIds.entries()].slice(-galleryLimit * 2);
  fs.writeFileSync(hiddenGalleryPath, JSON.stringify(Object.fromEntries(entries), null, 2));
}

export function promptTitle(text = "") {
  const oneLine = String(text).replace(/\s+/g, " ").trim();
  return oneLine.length > 68 ? `${oneLine.slice(0, 65)}...` : oneLine || "Untitled prompt";
}

export function outputsFrom(history) {
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

export function recordsFromComfyHistory(history) {
  const records = [];
  for (const [promptId, item] of Object.entries(history || {})) {
    const graph = item?.prompt?.[2] || {};
    const prompt = graph["4"]?.inputs?.text || "";
    const negative = graph["5"]?.inputs?.text || graph["3"]?.inputs?.text || "";
    const latent = graph["6"]?.inputs || {};
    const model = graph["1"]?.inputs?.unet_name || "";
    for (const output of outputsFrom(item)) {
      const record = {
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
      };
      if (hasExistingOutputFile(record)) records.push(record);
    }
  }
  return records;
}

export function makePendingItems(id, body) {
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
    referenceImage: body.startImage || "",
    referenceImageName: body.startImageName || "",
    settings: generationSettings(body)
  }));
}

export function dedupeGallery(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.url || item.id;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function cleanupGalleryState(jobs) {
  let changed = false;
  const doneKeys = new Set(
    gallery
      .filter((item) => item.status === "done")
      .map((item) => `${item.jobId || ""}|${item.prompt || ""}|${item.model || ""}|${item.width || ""}|${item.height || ""}`)
  );
  gallery = gallery.filter((item) => {
    if (item.status !== "pending") return true;
    if (item.jobId && !jobs.has(item.jobId)) {
      item.status = "error";
      item.filename = "Generation interrupted";
      changed = true;
      return true;
    }
    if (gallery.some((next) => next.status === "done" && next.jobId && next.jobId === item.jobId)) {
      changed = true;
      return false;
    }
    const key = `${item.jobId || ""}|${item.prompt || ""}|${item.model || ""}|${item.width || ""}|${item.height || ""}`;
    if (item.jobId && doneKeys.has(key)) {
      changed = true;
      return false;
    }
    return true;
  });
  if (changed) saveGallery();
}

export function generationSettings(body) {
  const settings = {
    workflow: body.workflow || "",
    steps: Number(body.steps || 0),
    cfg: Number(body.cfg || 0),
    sampler: body.sampler || "",
    scheduler: body.scheduler || "",
    seed: body.seed || "Random",
    textEncoder: body.textEncoder || "",
    vae: body.vae || "",
    clipType: body.clipType || "",
    weightDtype: body.weightDtype || "",
    referenceImageName: body.startImageName || ""
  };
  if (body.kind === "image") {
    settings.count = Number(body.count || 1);
    if (body.startImage) settings.denoise = Number(body.denoise || 0);
  }
  if (body.kind === "video") {
    settings.frames = Number(body.frames || 0);
    settings.fps = Number(body.fps || 0);
  }
  return settings;
}
export function replaceGalleryJob(id, outputs, body, jobs, status = "done") {
  const title = promptTitle(body.prompt);
  const job = jobs.get(id) || {};
  const durationMs = job.startedAt ? Date.now() - job.startedAt : 0;
  const existing = gallery.filter((item) => item.jobId === id);
  const completed = outputs.map((item, index) => ({
    ...item,
    id: item.url,
    jobId: id,
    status,
    prompt: body.prompt || "",
    negative: body.negative || "",
    filename: title || item.filename,
    createdAt: existing[index]?.createdAt || new Date().toISOString(),
    durationMs,
    width: Number(body.width || 0),
    height: Number(body.height || 0),
    model: body.model || "",
    referenceImage: body.startImage || "",
    referenceImageName: body.startImageName || "",
    settings: generationSettings(body),
    outputName: item.filename,
    index
  }));
  let nextIndex = 0;
  const replaced = [];
  gallery.forEach((item) => {
    if (item.jobId !== id) {
      replaced.push(item);
      return;
    }
    if (completed[nextIndex]) replaced.push(completed[nextIndex++]);
  });
  while (completed[nextIndex]) replaced.unshift(completed[nextIndex++]);
  gallery = dedupeGallery(replaced).slice(0, galleryLimit);
  saveGallery();
  return completed;
}

export function updateGalleryJob(id, patch, options = {}) {
  let changed = false;
  gallery = gallery.map((item) => {
    if (item.jobId === id || item.id === id || item.url === id) {
      changed = true;
      return { ...item, ...patch };
    }
    return item;
  });
  if (changed && options.persist !== false) saveGallery();
  return changed;
}
