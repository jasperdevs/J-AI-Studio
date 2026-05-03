import { apiJson } from './api';
import { dedupeGalleryItems } from './gallery';
import type { GalleryItem, Job } from './types';

export function useGenerationActions(view: any) {
  const {
    active, canUseStartImage, confirmAction, count, currentProfile, denoise,
    frames, fps, generateDisabled, generatePostingRef, height, loadGallery, mode,
    model, negative, prefs, prompt, sampler, scheduler, seed, setActive, setGallery,
    setStatus, setZenSelectedId, showToast, startImage, startImageName, steps, cfg,
    textEncoder, vae, clipType, weightDtype, width
  } = view;
  async function generate() {
    if (generatePostingRef.current) return;
    if (!prompt.trim()) {
      showToast("Prompt is required", "error");
      return;
    }
    if (!currentProfile) {
      showToast("Choose a supported model first", "error");
      return;
    }
    if (generateDisabled) {
      showToast("Model setup is missing required files", "error");
      return;
    }
    generatePostingRef.current = true;
    try {
      const imageRuns = mode === "image" && prefs.variationQueueMode === "separate" ? count : 1;
      const requestCount = mode === "image" && prefs.variationQueueMode === "separate" ? 1 : count;
      const startMessage = mode === "image"
        ? prefs.variationQueueMode === "separate" && count > 1
          ? `Started ${count} separate generations`
          : `Started ${count} image${count === 1 ? "" : "s"}`
        : "Started video";
      setStatus(startMessage);

      const requestBody = {
        kind: mode,
        prompt,
        negative,
        model: currentProfile?.model || model,
        workflow: currentProfile?.workflow || "",
        textEncoder,
        vae,
        clipType,
        weightDtype,
        width,
        height,
        steps,
        cfg,
        denoise,
        sampler,
        scheduler,
        seed,
        count,
        frames,
        fps,
        startImage: canUseStartImage ? startImage : "",
        startImageName
      };
      const queuedJobs: string[] = [];
      for (let index = 0; index < imageRuns; index += 1) {
        const { jobId, items } = await apiJson<{ jobId: string; items: GalleryItem[] }>("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...requestBody, count: requestCount })
        });
        queuedJobs.push(jobId);
        if (items?.length) setGallery((current: GalleryItem[]) => dedupeGalleryItems([...items, ...current]));
      }
      generatePostingRef.current = false;

      await Promise.all(queuedJobs.map(async (jobId) => {
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 1600));
          const job: Job = await apiJson<Job>(`/api/jobs/${jobId}`);
          if (job.status === "missing") {
            setGallery((current: GalleryItem[]) => current.map((item: GalleryItem) => item.jobId === jobId ? { ...item, status: "error", filename: "Generation interrupted" } : item));
            return job;
          }
          if (job.status === "error") {
            const message = job.error || "Generation failed";
            setGallery((current: GalleryItem[]) => current.map((item: GalleryItem) => item.jobId === jobId ? { ...item, status: "error", filename: message } : item));
            showToast(message, "error");
            setStatus(message);
            return job;
          }
          if (job.status === "done" || job.status === "canceled") return job;
          if (job.preview || job.progress?.max) {
            setGallery((current: GalleryItem[]) => current.map((item: GalleryItem) => item.jobId === jobId ? {
              ...item,
              preview: job.preview || item.preview,
              progress: job.progress || item.progress,
              status: item.status === "pending" ? "pending" : item.status
            } : item));
          }
          if (job.progress?.max) {
            setStatus(`Rendering ${job.progress.value}/${job.progress.max}`);
          } else {
            setStatus(job.status === "queued" ? "Queued" : "Rendering on the right");
          }
        }
      }));
      loadGallery();
      if (prefs.zenMode && prefs.followLatest) {
        const data = await apiJson<{ outputs: GalleryItem[] }>("/api/gallery").catch(() => null);
        const outputs = data?.outputs?.filter((item: GalleryItem) => item.status !== "canceled") || [];
        const latest = outputs.find((item: GalleryItem) => item.type === mode && item.status === "done");
        if (latest) {
          setGallery(outputs);
          setZenSelectedId(latest.id);
        }
      }
      setStatus("Ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      setStatus(message);
      showToast(message, "error");
    } finally {
      generatePostingRef.current = false;
    }
  }

  async function cancelJob(jobId: string | undefined) {
    if (!jobId) return;
    if (!confirmAction("Cancel this generation?")) return;
    setGallery((current: GalleryItem[]) => current.filter((item: GalleryItem) => item.jobId !== jobId));
    await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => null);
    setStatus("Ready");
  }

  async function cancelQueue() {
    if (!confirmAction("Cancel everything currently queued or generating?")) return;
    setGallery((current: GalleryItem[]) => current.filter((item: GalleryItem) => item.status !== "pending" && item.status !== "canceled"));
    await fetch("/api/queue/cancel", { method: "POST" }).catch(() => null);
    setStatus("Ready");
  }

  async function clearGallery() {
    if (!confirmAction("Clear finished gallery items from this app?")) return;
    const data = await apiJson<{ outputs: GalleryItem[] }>("/api/gallery/clear", { method: "POST" }).catch(() => null);
    if (data?.outputs) setGallery(data.outputs.filter((item: GalleryItem) => item.status !== "canceled"));
    setStatus("Ready");
  }

  async function clearFailedItems() {
    if (!confirmAction("Clear failed and interrupted generations from this gallery?")) return;
    const data = await apiJson<{ outputs: GalleryItem[] }>("/api/gallery/errors/clear", { method: "POST" }).catch(() => null);
    if (data?.outputs) setGallery(data.outputs.filter((item: GalleryItem) => item.status !== "canceled"));
    setStatus("Ready");
  }

  async function resetAllSettings() {
    if (!confirmAction("Reset all saved J AI Studio settings and prompt drafts?")) return;
    localStorage.removeItem("j-ai-studio-draft");
    localStorage.removeItem("j-ai-studio-prefs");
    if ("caches" in window) {
      await caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => null);
    }
    window.location.reload();
  }

  async function clearAllCache() {
    if (!confirmAction("Clear browser cache, queued preview state, and free ComfyUI memory? Finished gallery items will stay.")) return;
    if ("caches" in window) {
      await caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => null);
    }
    const data = await fetch("/api/cache/clear", { method: "POST" }).then((res) => res.json()).catch(() => null);
    if (data?.outputs) setGallery(data.outputs.filter((item: GalleryItem) => item.status !== "canceled"));
    setStatus("Ready");
  }

  async function openOutputFolder() {
    const response = await fetch("/api/open-output-folder", { method: "POST" }).catch(() => null);
    if (!response?.ok) showToast("Could not open folder", "error");
  }

  async function deleteItem(item: GalleryItem, confirmed = false) {
    if (!confirmed && !confirmAction("Delete this generation from the gallery?")) return;
    setGallery((current: GalleryItem[]) => current.filter((next: GalleryItem) => next.id !== item.id));
    if (active?.id === item.id) setActive(null);
    const response = await fetch(`/api/gallery/${encodeURIComponent(item.id)}`, { method: "DELETE" }).catch(() => null);
    showToast(response?.ok ? "Deleted from gallery" : "Delete failed", response?.ok ? "success" : "error");
  }

  return { generate, cancelJob, cancelQueue, clearGallery, clearFailedItems, resetAllSettings, clearAllCache, openOutputFolder, deleteItem };
}
