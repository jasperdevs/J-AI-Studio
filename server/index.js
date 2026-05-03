import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { comfy, comfyOutputDir, comfyUrl, host, localHosts, port, root } from './comfy.js';
import { inferModels } from './models.js';
import { sanitizeGenerateBody } from './validation.js';
import { dedupeGallery, deleteGalleryFiles, filterVisibleGallery, gallery, galleryLimit, dataDir, hideGalleryItems, makePendingItems, recordsFromComfyHistory, saveGallery, setGallery, cleanupGalleryState, updateGalleryJob } from './gallery-store.js';
import { jobs, runJob } from './jobs.js';

const app = express();
app.use(express.json({ limit: "25mb" }));
const execFileAsync = promisify(execFile);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function requireLocal(req, res) {
  const remote = req.socket.remoteAddress || "";
  if (localHosts.has(remote)) return true;
  res.status(403).json({ ok: false, error: "This action is only allowed from this computer." });
  return false;
}

async function runRepoCommand(command, args) {
  const { stdout = "", stderr = "" } = await execFileAsync(command, args, {
    cwd: root,
    timeout: 600000,
    maxBuffer: 1024 * 1024
  });
  return `${stdout}${stderr}`.trim();
}

async function updateStatus() {
  if (!fs.existsSync(path.join(root, ".git"))) {
    return { ok: false, available: false, current: "", latest: "", branch: "", error: "This copy is not a Git checkout." };
  }
  const branch = (await runRepoCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const current = (await runRepoCommand("git", ["rev-parse", "--short", "HEAD"])).trim();
  await runRepoCommand("git", ["fetch", "--quiet", "origin"]);
  const upstreamRef = branch && branch !== "HEAD" ? `origin/${branch}` : "origin/main";
  const latest = (await runRepoCommand("git", ["rev-parse", "--short", upstreamRef])).trim();
  const behindText = await runRepoCommand("git", ["rev-list", "--count", `${current}..${upstreamRef}`]);
  const behind = Number(behindText.trim() || 0);
  return { ok: true, available: behind > 0, current, latest, branch, behind };
}

function openFolder(folder) {
  if (process.platform === "win32") return execFile("explorer.exe", [folder]);
  if (process.platform === "darwin") return execFile("open", [folder]);
  return execFile("xdg-open", [folder]);
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
  try {
    const info = await comfy("/object_info");
    const stats = await comfy("/system_stats").catch(() => ({}));
    res.json(inferModels(info, stats));
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.get("/api/paths", (_req, res) => {
  res.json({ outputDir: comfyOutputDir, galleryDir: dataDir });
});

app.get("/api/gallery", async (_req, res) => {
  cleanupGalleryState(jobs);
  const history = await comfy(`/history?max_items=${Math.min(galleryLimit, 500)}`).catch(() => ({}));
  const recovered = recordsFromComfyHistory(history);
  if (recovered.length) {
    const pending = gallery.filter((item) => item.status === "pending");
    setGallery(filterVisibleGallery(dedupeGallery([...pending, ...gallery, ...recovered])).slice(0, galleryLimit));
    saveGallery();
  }
  setGallery(filterVisibleGallery(dedupeGallery(gallery)));
  saveGallery();
  res.json({ outputs: gallery });
});

app.post("/api/generate", async (req, res) => {
  let body;
  try {
    const info = await comfy("/object_info");
    const stats = await comfy("/system_stats").catch(() => ({}));
    body = sanitizeGenerateBody(req.body, info, stats);
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  const id = crypto.randomUUID();
  const items = makePendingItems(id, body);
  setGallery(dedupeGallery([...items, ...gallery]).slice(0, galleryLimit));
  saveGallery();
  jobs.set(id, { status: "queued", kind: body.kind, prompt: body.prompt, outputs: [], items, startedAt: Date.now() });
  runJob(id, body);
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
  setGallery(gallery.map((item) => (item.status === "pending" ? { ...item, status: "canceled" } : item)));
  saveGallery();
  await comfy("/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clear: true }) }).catch(() => null);
  await comfy("/interrupt", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
  res.json({ ok: true });
});

app.post("/api/gallery/clear", (_req, res) => {
  const cleared = gallery.filter((item) => item.status === "done");
  const files = deleteGalleryFiles(cleared);
  setGallery(gallery.filter((item) => item.status !== "done"));
  saveGallery();
  res.json({ ok: true, files, outputs: gallery });
});

app.post("/api/gallery/errors/clear", (_req, res) => {
  const cleared = gallery.filter((item) => item.status === "error" || item.status === "canceled");
  hideGalleryItems(cleared);
  setGallery(gallery.filter((item) => item.status !== "error" && item.status !== "canceled"));
  saveGallery();
  res.json({ ok: true, outputs: gallery });
});

app.post("/api/cache/clear", async (_req, res) => {
  for (const [id, job] of jobs) {
    if (job.status === "queued" || job.status === "running" || job.status === "canceling") {
      jobs.set(id, { ...job, status: "canceled" });
      updateGalleryJob(id, { status: "canceled" });
    }
  }
  setGallery(gallery.filter((item) => item.status === "done").map(({ preview, progress, ...item }) => item).slice(0, galleryLimit));
  saveGallery();
  await comfy("/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clear: true }) }).catch(() => null);
  await comfy("/interrupt", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
  await comfy("/free", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ unload_models: true, free_memory: true }) }).catch(() => null);
  res.json({ ok: true, outputs: gallery });
});

app.delete("/api/gallery/:id", (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const before = gallery.length;
  const removed = gallery.filter((item) => item.id === id || item.url === id);
  const files = deleteGalleryFiles(removed);
  hideGalleryItems(removed.filter((item) => item.status !== "done"));
  setGallery(gallery.filter((item) => item.id !== id && item.url !== id));
  if (gallery.length !== before) saveGallery();
  res.json({ ok: true, files, removed: before - gallery.length, outputs: gallery });
});

app.post("/api/open-output-folder", (req, res) => {
  if (!requireLocal(req, res)) return;
  if (!comfyOutputDir || !fs.existsSync(comfyOutputDir)) {
    res.status(404).json({ ok: false, error: "Output folder is not configured." });
    return;
  }
  openFolder(comfyOutputDir);
  res.json({ ok: true, outputDir: comfyOutputDir });
});

app.get("/api/update/status", async (req, res) => {
  if (!requireLocal(req, res)) return;
  try {
    res.json(await updateStatus());
  } catch (error) {
    res.status(500).json({ ok: false, available: false, error: error.message });
  }
});

app.post("/api/update/install", async (req, res) => {
  if (!requireLocal(req, res)) return;
  try {
    const before = await updateStatus();
    if (!before.ok) {
      res.status(400).json(before);
      return;
    }
    if (!before.available) {
      res.json({ ...before, updated: false, message: "Already up to date." });
      return;
    }
    const branch = before.branch && before.branch !== "HEAD" ? before.branch : "main";
    const pull = await runRepoCommand("git", ["pull", "--ff-only", "origin", branch]);
    const install = await runRepoCommand(npmCommand, ["install"]);
    const build = await runRepoCommand(npmCommand, ["run", "build"]);
    const after = await updateStatus();
    res.json({ ...after, updated: true, restartRequired: true, logs: { pull, install, build } });
  } catch (error) {
    res.status(500).json({ ok: false, updated: false, error: error.message });
  }
});

app.post("/api/shutdown", (_req, res) => {
  if (!requireLocal(_req, res)) return;
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
