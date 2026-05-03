import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import {
  ChevronDown,
  Copy,
  Download,
  Power,
  RefreshCw,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Wand2,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import "./styles.css";

type Mode = "image" | "video";
type Progress = { value: number; max: number; node?: string };
type Output = { url: string; filename: string; type: "image" | "video"; prompt?: string; negative?: string; outputName?: string };
type GenerationSettings = Record<string, string | number | boolean | null | undefined>;
type GalleryItem = Output & { id: string; jobId?: string; status: "done" | "pending" | "error" | "canceled"; progress?: Progress; width?: number; height?: number; createdAt?: string; durationMs?: number; model?: string; settings?: GenerationSettings };
type Job = { status: string; outputs: GalleryItem[]; error?: string; progress?: Progress };
type SelectOption = { label: string; value: string };
type Profile = {
  id: string;
  kind: Mode;
  label: string;
  displayName?: string;
  description?: string;
  model: string;
  workflow: string;
  family: string;
  defaults: Record<string, string | number>;
  aspectPresets: AspectPreset[];
  constraints?: Record<string, { min?: number; max?: number; step?: number; default?: number }>;
  options?: {
    textEncoders?: string[];
    vaes?: string[];
    clipTypes?: string[];
    weightDtypes?: string[];
    samplers?: string[];
    schedulers?: string[];
  };
  capabilities: Record<string, boolean>;
};
type Models = {
  imageModels: SelectOption[];
  videoModels: SelectOption[];
  profiles: Profile[];
  unsupportedModels?: string[];
  textEncoders: string[];
  vaes: string[];
  clipTypes?: string[];
  weightDtypes?: string[];
  samplers: string[];
  schedulers: string[];
  defaults: Record<string, string>;
  capabilities: Record<string, boolean>;
};
type Paths = { outputDir?: string; galleryDir?: string };
type AspectPreset = { label: string; value: string; w: number; h: number };

type Preferences = {
  defaultImageCount: number;
  defaultImageSteps: number;
  defaultVideoFrames: number;
  defaultVideoSteps: number;
  defaultFps: number;
};

const defaultPrefs: Preferences = {
  defaultImageCount: 1,
  defaultImageSteps: 8,
  defaultVideoFrames: 33,
  defaultVideoSteps: 12,
  defaultFps: 16
};

const fallbackAspectPresets: Record<Mode, AspectPreset[]> = {
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

const fallbackSamplers = ["euler_ancestral", "euler", "uni_pc", "dpmpp_2m", "dpmpp_sde"];
const fallbackSchedulers = ["beta", "simple", "normal", "karras", "sgm_uniform"];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function aspectIconStyle(option: AspectPreset): React.CSSProperties {
  const scale = Math.min(38 / option.w, 28 / option.h);
  return {
    width: Math.max(13, Math.round(option.w * scale)),
    height: Math.max(13, Math.round(option.h * scale))
  };
}

function titleFromPrompt(text = "") {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 76 ? `${compact.slice(0, 73)}...` : compact;
}

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}:${String(rest).padStart(2, "0")}` : `${rest}s`;
}

function fullGenerationText(item: GalleryItem) {
  const settings = item.settings || {};
  const lines = [
    `Prompt: ${item.prompt || ""}`,
    `Negative prompt: ${item.negative || ""}`,
    `Model: ${item.model || ""}`,
    `Output: ${item.outputName || item.filename || ""}`,
    `Type: ${item.type}`,
    `Aspect: ${item.width || "?"}x${item.height || "?"}`
  ];
  for (const [key, value] of Object.entries(settings)) {
    if (value !== "" && value !== undefined && value !== null && value !== 0) {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

function loadPrefs(): Preferences {
  try {
    return { ...defaultPrefs, ...JSON.parse(localStorage.getItem("j-ai-studio-prefs") || "{}") };
  } catch {
    return defaultPrefs;
  }
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem("j-ai-studio-draft") || "{}");
  } catch {
    return {};
  }
}

function dedupeGalleryItems(items: GalleryItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url || item.id;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<string | { label: string; value: string }> }) {
  return (
    <div className="select">
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const item = typeof option === "string" ? { label: option, value: option } : option;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
      <ChevronDown size={14} />
    </div>
  );
}

function AspectPicker({ value, options, onChange }: { value: string; options: AspectPreset[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.value === value);
  return (
    <div className="aspect-picker">
      <button type="button" className="aspect-trigger" onClick={() => setOpen((next) => !next)}>
        {selected ? <span className="aspect-shape" style={aspectIconStyle(selected)} /> : <span className="aspect-shape custom" />}
        <span>{selected ? selected.label : "Custom"}</span>
        <ChevronDown size={14} className={cn(open && "flip")} />
      </button>
      {open ? (
        <div className="aspect-menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn("aspect-option", option.value === value && "active")}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span className="aspect-shape" style={aspectIconStyle(option)} />
              <span>{option.label}</span>
              <em>{option.value}</em>
            </button>
          ))}
          <button
            type="button"
            className={cn("aspect-option", value === "custom" && "active")}
            onClick={() => {
              onChange("custom");
              setOpen(false);
            }}
          >
            <span className="aspect-shape custom" />
            <span>Custom</span>
            <em>Width x height</em>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function familyLabel(profile: Profile | null) {
  if (!profile) return "";
  if (profile.family === "z-image") return "Z image";
  if (profile.family === "checkpoint") return "Checkpoint";
  if (profile.family === "wan") return "Wan video";
  return profile.family;
}

function ModelPicker({ value, profiles, onChange }: { value: string; profiles: Profile[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = profiles.find((profile) => profile.id === value) || profiles[0] || null;
  return (
    <div className="model-picker">
      <button type="button" className="model-trigger" onClick={() => setOpen((next) => !next)}>
        <span className="model-glyph">{selected?.kind === "video" ? "V" : "I"}</span>
        <span className="model-copy">
          <strong>{selected?.displayName || selected?.label || "No model"}</strong>
          <em>{selected ? familyLabel(selected) : "No supported workflow"}</em>
        </span>
        <ChevronDown size={14} className={cn(open && "flip")} />
      </button>
      {open ? (
        <div className="model-menu">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={cn("model-option", profile.id === value && "active")}
              onClick={() => {
                onChange(profile.id);
                setOpen(false);
              }}
            >
              <span className="model-glyph">{profile.kind === "video" ? "V" : "I"}</span>
              <span className="model-copy">
                <strong>{profile.displayName || profile.label}</strong>
                <em>{profile.description || familyLabel(profile)}</em>
              </span>
              <span className="model-badge">{familyLabel(profile)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function App() {
  const initialDraft = useMemo(() => loadDraft(), []);
  const [mode, setMode] = useState<Mode>("image");
  const [models, setModels] = useState<Models | null>(null);
  const [prefs, setPrefsState] = useState<Preferences>(() => loadPrefs());
  const [prompt, setPrompt] = useState(String(initialDraft.prompt || ""));
  const [negative, setNegative] = useState(String(initialDraft.negative || ""));
  const [model, setModel] = useState(String(initialDraft.model || ""));
  const [paths, setPaths] = useState<Paths>({});
  const [textEncoder, setTextEncoder] = useState(String(initialDraft.textEncoder || ""));
  const [vae, setVae] = useState(String(initialDraft.vae || ""));
  const [clipType, setClipType] = useState(String(initialDraft.clipType || ""));
  const [weightDtype, setWeightDtype] = useState(String(initialDraft.weightDtype || "default"));
  const [width, setWidth] = useState(Number(initialDraft.width || 1024));
  const [height, setHeight] = useState(Number(initialDraft.height || 1024));
  const [steps, setSteps] = useState(Number(initialDraft.steps || prefs.defaultImageSteps));
  const [cfg, setCfg] = useState(Number(initialDraft.cfg || 1));
  const [denoise, setDenoise] = useState(Number(initialDraft.denoise || 0.65));
  const [seed, setSeed] = useState(String(initialDraft.seed || ""));
  const [count, setCount] = useState(Number(initialDraft.count || prefs.defaultImageCount));
  const [frames, setFrames] = useState(Number(initialDraft.frames || prefs.defaultVideoFrames));
  const [fps, setFps] = useState(Number(initialDraft.fps || prefs.defaultFps));
  const [sampler, setSampler] = useState(String(initialDraft.sampler || "euler_ancestral"));
  const [scheduler, setScheduler] = useState(String(initialDraft.scheduler || "beta"));
  const [advanced, setAdvanced] = useState(false);
  const [settings, setSettings] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [active, setActive] = useState<GalleryItem | null>(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const [customSize, setCustomSize] = useState(Boolean(initialDraft.customSize));
  const [now, setNow] = useState(Date.now());
  const [startImage, setStartImage] = useState("");
  const [startImageName, setStartImageName] = useState("");
  const generatePostingRef = useRef(false);

  useEffect(() => {
    refreshModels();
    refreshPaths();
    loadGallery();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadGallery();
    }, 2500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("j-ai-studio-draft", JSON.stringify({
      mode,
      prompt,
      negative,
      model,
      textEncoder,
      vae,
      clipType,
      weightDtype,
      width,
      height,
      steps,
      cfg,
      denoise,
      seed,
      count,
      frames,
      fps,
      sampler,
      scheduler,
      customSize
    }));
  }, [mode, prompt, negative, model, textEncoder, vae, clipType, weightDtype, width, height, steps, cfg, denoise, seed, count, frames, fps, sampler, scheduler, customSize]);

  useEffect(() => {
    if (!active) return;
    const activeItem = active;
    const doneItems = visibleGallery.filter((item) => item.status === "done");
    const currentIndex = doneItems.findIndex((item) => item.id === activeItem.id);
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowRight" && currentIndex >= 0) {
        event.preventDefault();
        setViewerZoom(1);
        setActive(doneItems[(currentIndex + 1) % doneItems.length]);
      }
      if (event.key === "ArrowLeft" && currentIndex >= 0) {
        event.preventDefault();
        setViewerZoom(1);
        setActive(doneItems[(currentIndex - 1 + doneItems.length) % doneItems.length]);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setActive(null);
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setViewerZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))));
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setViewerZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))));
      }
      if (event.key === "0") {
        event.preventDefault();
        setViewerZoom(1);
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (window.confirm("Delete this generation from the gallery?")) deleteItem(activeItem, true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, gallery, mode]);

  function loadGallery() {
    fetch("/api/gallery")
      .then((res) => res.json())
      .then((data: { outputs: GalleryItem[] }) => {
        setGallery(data.outputs);
      })
      .catch(() => null);
  }

  function setPrefs(next: Partial<Preferences>) {
    const merged = { ...prefs, ...next };
    setPrefsState(merged);
    localStorage.setItem("j-ai-studio-prefs", JSON.stringify(merged));
  }

  function refreshModels() {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data: Models) => {
        setModels(data);
        const profileId = model || "";
        const profile = data.profiles.find((item) => item.id === profileId);
        if (profile) applyProfile(profile, false);
      })
      .catch((error) => setStatus(error.message));
  }

  function refreshPaths() {
    fetch("/api/paths")
      .then((res) => res.json())
      .then(setPaths)
      .catch(() => null);
  }

  function applyProfile(profile: Profile, setModelId = true) {
    if (setModelId) setModel(profile.id);
    setCustomSize(false);
    setTextEncoder(String(profile.defaults.textEncoder || ""));
    setVae(String(profile.defaults.vae || ""));
    setClipType(String(profile.defaults.clipType || ""));
    setWeightDtype(String(profile.defaults.weightDtype || "default"));
    setWidth(Number(profile.defaults.width || 1024));
    setHeight(Number(profile.defaults.height || 1024));
    setSteps(Number(profile.defaults.steps || (profile.kind === "video" ? prefs.defaultVideoSteps : prefs.defaultImageSteps)));
    setCfg(Number(profile.defaults.cfg || 1));
    setSampler(String(profile.defaults.sampler || "euler_ancestral"));
    setScheduler(String(profile.defaults.scheduler || "beta"));
    setDenoise(Number(profile.defaults.denoise || 0.65));
    if (profile.kind === "video") {
      setFrames(Number(profile.defaults.frames || prefs.defaultVideoFrames));
      setFps(Number(profile.defaults.fps || prefs.defaultFps));
    }
    setStartImage("");
    setStartImageName("");
  }

  function changeMode(next: Mode) {
    setMode(next);
    if (!models) return;
    if (next === "image") {
      const profile = models.profiles.find((item) => item.id === models.defaults.imageModel);
      if (profile) applyProfile(profile);
    } else {
      const profile = models.profiles.find((item) => item.id === models.defaults.videoModel);
      if (profile) applyProfile(profile);
    }
  }

  function applyAspect(value: string, targetMode = mode) {
    if (value === "custom") {
      setCustomSize(true);
      return;
    }
    const preset = aspectOptions.find((item) => item.value === value) || fallbackAspectPresets[targetMode].find((item) => item.value === value);
    if (!preset) return;
    setCustomSize(false);
    setWidth(preset.w);
    setHeight(preset.h);
  }

  const modelProfiles = useMemo(() => {
    if (!models) return [];
    return models.profiles.filter((profile) => profile.kind === mode);
  }, [mode, models]);

  const currentProfile = useMemo(() => models?.profiles.find((profile) => profile.id === model) || null, [model, models]);
  const aspectOptions = currentProfile?.aspectPresets?.length ? currentProfile.aspectPresets : fallbackAspectPresets[mode];
  const canUseStartImage = mode === "image" && Boolean(currentProfile?.capabilities.startImage);
  const widthMeta = currentProfile?.constraints?.width || {};
  const heightMeta = currentProfile?.constraints?.height || {};
  const frameMeta = currentProfile?.constraints?.frames || {};
  const profileOptions = currentProfile?.options || {};
  const aspectValue = `${width}x${height}`;
  const aspectPickerValue = customSize || !aspectOptions.some((item) => item.value === aspectValue) ? "custom" : aspectValue;
  const visibleGallery = gallery.filter((item) => item.type === mode);
  const runningCount = visibleGallery.filter((item) => item.status === "pending").length;

  function chooseModel(profileId: string) {
    const profile = models?.profiles.find((item) => item.id === profileId);
    if (profile) applyProfile(profile);
    else setModel(profileId);
  }

  async function readStartImage(file: File | undefined) {
    if (!file) return;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setStartImage(data);
    setStartImageName(file.name);
  }

  async function generate() {
    if (generatePostingRef.current) return;
    generatePostingRef.current = true;
    setStatus(mode === "image" ? `Queued ${count} image${count === 1 ? "" : "s"}` : "Queued video");

    const { jobId, items } = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
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
        startImage: canUseStartImage ? startImage : ""
      })
    }).then((response) => response.json()).finally(() => {
      generatePostingRef.current = false;
    });
    if (items?.length) setGallery((current) => dedupeGalleryItems([...items, ...current]));

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1600));
      const job: Job = await fetch(`/api/jobs/${jobId}`).then((res) => res.json());
      if (job.status === "done") {
        loadGallery();
        setStatus(`${job.outputs.length} output${job.outputs.length === 1 ? "" : "s"} added`);
        return;
      }
      if (job.status === "error") {
        loadGallery();
        setStatus(job.error || "Generation failed");
        return;
      }
      if (job.status === "canceled") {
        loadGallery();
        setStatus("Canceled");
        return;
      }
      if (job.progress?.max) {
        setStatus(`Rendering ${job.progress.value}/${job.progress.max}`);
      } else {
        setStatus(job.status === "queued" ? "Queued" : "Rendering on the right");
      }
    }
  }

  async function cancelJob(jobId: string | undefined) {
    if (!jobId) return;
    if (!window.confirm("Cancel this generation?")) return;
    await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => null);
    loadGallery();
    setStatus("Canceled");
  }

  async function cancelQueue() {
    if (!window.confirm("Cancel everything currently queued or generating?")) return;
    await fetch("/api/queue/cancel", { method: "POST" }).catch(() => null);
    loadGallery();
    setStatus("Queue canceled");
  }

  async function clearGallery() {
    if (!window.confirm("Clear finished gallery items from this app?")) return;
    const data = await fetch("/api/gallery/clear", { method: "POST" }).then((res) => res.json()).catch(() => null);
    if (data?.outputs) setGallery(data.outputs);
  }

  async function openOutputFolder() {
    await fetch("/api/open-output-folder", { method: "POST" }).catch(() => null);
  }

  async function deleteItem(item: GalleryItem, confirmed = false) {
    if (!confirmed && !window.confirm("Delete this generation from the gallery?")) return;
    setGallery((current) => current.filter((next) => next.id !== item.id));
    if (active?.id === item.id) setActive(null);
    await fetch(`/api/gallery/${encodeURIComponent(item.id)}`, { method: "DELETE" }).catch(() => null);
  }

  function openItem(item: GalleryItem) {
    setViewerZoom(1);
    setShowDetails(false);
    setActive(item);
  }

  async function shutdown() {
    if (!window.confirm("Close the local J AI Studio server?")) return;
    setStatus("Closing localhost...");
    await fetch("/api/shutdown", { method: "POST" }).catch(() => null);
  }

  return (
    <div className="app-shell">
      <aside className="left-panel">
        <header className="brand">
          <img src="/j-ai-logo.png" alt="" />
          <h1>J AI Studio</h1>
        </header>

        <div className="mode-tabs" role="tablist" aria-label="Generation mode">
          <button className={cn(mode === "image" && "active")} onClick={() => changeMode("image")}>Image</button>
          <button className={cn(mode === "video" && "active")} onClick={() => changeMode("video")}>Video</button>
        </div>

        <section className="panel">
          <Field label={mode === "image" ? "Image model" : "Video model"}>
            <ModelPicker value={model} profiles={modelProfiles} onChange={chooseModel} />
          </Field>
          <Field label="Prompt">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            <span className="field-meta">{prompt.length} characters</span>
          </Field>
          <Field label="Negative prompt">
            <textarea className="short" value={negative} onChange={(event) => setNegative(event.target.value)} />
            <span className="field-meta">{negative.length} characters</span>
          </Field>
        </section>

        <section className="panel compact-panel">
          <div className="section-title">Output</div>
          <div className="control-grid">
            <Field label="Aspect">
              <AspectPicker value={aspectPickerValue} onChange={(value) => applyAspect(value)} options={aspectOptions} />
            </Field>
            {mode === "image" ? (
              <Field label="Variations">
                <input type="number" min={1} max={8} value={count} onChange={(event) => setCount(Math.max(1, Math.min(8, Number(event.target.value))))} />
              </Field>
            ) : (
              <Field label="Frames">
                <input type="number" min={frameMeta.min || 1} max={frameMeta.max} value={frames} step={frameMeta.step || 4} onChange={(event) => setFrames(Number(event.target.value))} />
              </Field>
            )}
          </div>
          {customSize ? (
            <div className="control-grid">
              <Field label="Width"><input type="number" min={widthMeta.min} max={widthMeta.max} value={width} step={widthMeta.step || (mode === "video" ? 32 : 64)} onChange={(event) => setWidth(Number(event.target.value))} /></Field>
              <Field label="Height"><input type="number" min={heightMeta.min} max={heightMeta.max} value={height} step={heightMeta.step || (mode === "video" ? 32 : 64)} onChange={(event) => setHeight(Number(event.target.value))} /></Field>
            </div>
          ) : null}
          <div className="control-grid">
            <Field label="Steps"><input type="number" min={1} value={steps} onChange={(event) => setSteps(Number(event.target.value))} /></Field>
            {mode === "video" ? (
              <Field label="FPS"><input type="number" min={1} value={fps} onChange={(event) => setFps(Number(event.target.value))} /></Field>
            ) : (
              <Field label="Seed"><input value={seed} placeholder="Random" onChange={(event) => setSeed(event.target.value)} /></Field>
            )}
          </div>
        </section>

        {canUseStartImage ? (
          <section className="panel compact-panel">
            <div className="section-title">Start image</div>
            <label className="file-pick">
              <input type="file" accept="image/*" onChange={(event) => readStartImage(event.target.files?.[0])} />
              <span>{startImageName || "Choose image"}</span>
              {startImageName ? <button type="button" onClick={(event) => { event.preventDefault(); if (window.confirm("Clear the selected start image?")) { setStartImage(""); setStartImageName(""); } }}>Clear</button> : null}
            </label>
            {currentProfile?.capabilities.denoise ? (
              <Field label="Denoise">
                <input type="number" min={0} max={1} step="0.01" value={denoise} onChange={(event) => setDenoise(Number(event.target.value))} />
              </Field>
            ) : null}
          </section>
        ) : null}

        <section className="panel compact-panel">
          <button className="advanced-toggle" onClick={() => setAdvanced((value) => !value)}>
            <span>Advanced</span>
            <ChevronDown size={14} className={cn(advanced && "flip")} />
          </button>
          {advanced ? (
            <div className="advanced-grid">
              {currentProfile?.capabilities.textEncoder ? <Field label="Text encoder"><Select value={textEncoder} onChange={setTextEncoder} options={profileOptions.textEncoders || models?.textEncoders || []} /></Field> : null}
              {currentProfile?.capabilities.vae ? <Field label="VAE"><Select value={vae} onChange={setVae} options={profileOptions.vaes || models?.vaes || []} /></Field> : null}
              {currentProfile?.capabilities.weightDtype ? <Field label="Weight dtype"><Select value={weightDtype} onChange={setWeightDtype} options={profileOptions.weightDtypes || models?.weightDtypes || []} /></Field> : null}
              <Field label="CFG"><input type="number" value={cfg} step="0.1" onChange={(event) => setCfg(Number(event.target.value))} /></Field>
              <Field label="Sampler"><Select value={sampler} onChange={setSampler} options={profileOptions.samplers?.length ? profileOptions.samplers : models?.samplers?.length ? models.samplers : fallbackSamplers} /></Field>
              <Field label="Scheduler"><Select value={scheduler} onChange={setScheduler} options={profileOptions.schedulers?.length ? profileOptions.schedulers : models?.schedulers?.length ? models.schedulers : fallbackSchedulers} /></Field>
              {mode === "video" ? <Field label="Seed"><input value={seed} placeholder="Random" onChange={(event) => setSeed(event.target.value)} /></Field> : null}
            </div>
          ) : null}
        </section>

        <button className="generate" onClick={generate} disabled={!currentProfile || (currentProfile.capabilities.textEncoder && !textEncoder) || (currentProfile.capabilities.vae && !vae)}>
          <Wand2 size={15} />
          {mode === "image" ? `Generate ${count}` : "Generate video"}
        </button>

        <div className="status-row">{status}</div>
      </aside>

      <main className="workspace">
        <div className="topbar">
          <div className="status-pill">ComfyUI</div>
          <div className="status-pill">{mode === "image" ? `${count} variation${count === 1 ? "" : "s"}` : `${frames} frames`}</div>
          <div className="status-pill">{runningCount} running</div>
          {runningCount ? <button className="queue-button" onClick={cancelQueue}>Cancel queue</button> : null}
          <button className="icon-button" title="Refresh models" onClick={refreshModels}><RefreshCw size={15} /></button>
          <button className="icon-button" title="Settings" onClick={() => setSettings(true)}><Settings2 size={15} /></button>
        </div>

        <section className="gallery">
          {visibleGallery.length ? visibleGallery.map((item) => (
            <button key={item.id} className={cn("tile", item.status)} style={{ "--tile-ratio": `${item.width || 1} / ${item.height || 1}` } as React.CSSProperties} onClick={() => item.status === "done" && openItem(item)}>
              {item.status === "pending" ? (
                <div className="generating">
                  <div className="generate-readout">
                    <span>{item.progress?.max ? `${item.progress.value}/${item.progress.max}` : "Queued"}</span>
                    <small>{formatElapsed(now - Date.parse(item.createdAt || new Date().toISOString()))}</small>
                  </div>
                </div>
              ) : item.status === "done" ? <Media item={item} muted /> : <div className="generating stopped"><span>{item.status === "canceled" ? "Canceled" : "Failed"}</span></div>}
              <span className="tile-caption">
                <strong>{titleFromPrompt(item.prompt || item.filename)}</strong>
                <em>{item.status === "pending" ? formatElapsed(now - Date.parse(item.createdAt || new Date().toISOString())) : item.durationMs ? formatElapsed(item.durationMs) : item.outputName || item.type}</em>
              </span>
              {item.status === "pending" ? <span className="tile-action" onClick={(event) => { event.stopPropagation(); cancelJob(item.jobId); }}>Cancel</span> : null}
              {item.status !== "pending" ? <span className="tile-delete" title="Delete from gallery" onClick={(event) => { event.stopPropagation(); deleteItem(item); }}><Trash2 size={13} /></span> : null}
            </button>
          )) : (
            <div className="empty">
              <h2>No outputs yet</h2>
            </div>
          )}
        </section>
      </main>

      {settings ? (
        <div className="viewer" onClick={() => setSettings(false)}>
          <div className="settings-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>Settings</h2>
              </div>
              <button className="icon-button" onClick={() => setSettings(false)}><X size={15} /></button>
            </header>

            <div className="settings-grid">
              <section>
                <h3>Connection</h3>
                <div className="setting-row"><span>App</span><strong>http://127.0.0.1:8787</strong></div>
                <div className="setting-row"><span>ComfyUI</span><strong>http://127.0.0.1:8188</strong></div>
                <div className="setting-actions">
                  <button onClick={refreshModels}>Refresh models</button>
                  <button onClick={() => window.open("http://127.0.0.1:8188", "_blank")}>Open ComfyUI</button>
                </div>
              </section>

              <section>
                <h3>Installed</h3>
                <div className="setting-row"><span>Image models</span><strong>{models?.imageModels.length || 0}</strong></div>
                <div className="setting-row"><span>Video models</span><strong>{models?.videoModels.length || 0}</strong></div>
                <div className="setting-row"><span>Unsupported</span><strong>{models?.unsupportedModels?.length || 0}</strong></div>
                <div className="setting-row"><span>Workflow</span><strong>{currentProfile?.family || "None"}</strong></div>
                <div className="setting-row"><span>Start image</span><strong>{canUseStartImage ? "Available" : "Hidden for this model"}</strong></div>
              </section>

              <section>
                <h3>Defaults</h3>
                <div className="split">
                  <Field label="Image variations"><input type="number" min={1} max={8} value={prefs.defaultImageCount} onChange={(event) => setPrefs({ defaultImageCount: Number(event.target.value) })} /></Field>
                  <Field label="Image steps"><input type="number" min={1} value={prefs.defaultImageSteps} onChange={(event) => setPrefs({ defaultImageSteps: Number(event.target.value) })} /></Field>
                </div>
                <div className="split">
                  <Field label="Video frames"><input type="number" min={5} value={prefs.defaultVideoFrames} onChange={(event) => setPrefs({ defaultVideoFrames: Number(event.target.value) })} /></Field>
                  <Field label="Video steps"><input type="number" min={1} value={prefs.defaultVideoSteps} onChange={(event) => setPrefs({ defaultVideoSteps: Number(event.target.value) })} /></Field>
                </div>
                <Field label="Video FPS"><input type="number" min={1} value={prefs.defaultFps} onChange={(event) => setPrefs({ defaultFps: Number(event.target.value) })} /></Field>
              </section>

              <section>
                <h3>Gallery</h3>
                <div className="setting-row"><span>Visible items</span><strong>{gallery.length}</strong></div>
                <div className="setting-row"><span>{mode === "image" ? "Images" : "Videos"}</span><strong>{visibleGallery.length}</strong></div>
                <div className="setting-row"><span>Outputs</span><strong>{paths.outputDir || "Not configured"}</strong></div>
                <div className="setting-actions">
                  <button onClick={() => paths.outputDir && navigator.clipboard.writeText(paths.outputDir)}>Copy output path</button>
                  <button onClick={openOutputFolder} disabled={!paths.outputDir}>Open output folder</button>
                </div>
                <button className="wide-button" onClick={clearGallery}>Clear finished gallery</button>
              </section>

              <section>
                <h3>Localhost</h3>
                <button className="danger-button" onClick={shutdown}><Power size={15} /> Close localhost</button>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {active ? (
        <div className="viewer" onClick={() => setActive(null)}>
          <button className="viewer-close" onClick={(event) => { event.stopPropagation(); setActive(null); }}><X size={16} /></button>
          <div className="viewer-bar" onClick={(event) => event.stopPropagation()}>
            <button className="icon-button" title="Zoom out" onClick={() => setViewerZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}><ZoomOut size={15} /></button>
            <button className="icon-button" title="Reset zoom" onClick={() => setViewerZoom(1)}><RotateCcw size={15} /></button>
            <button className="icon-button" title="Zoom in" onClick={() => setViewerZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))}><ZoomIn size={15} /></button>
            <button className="icon-button" title="Details" onClick={() => setShowDetails((value) => !value)}><SlidersHorizontal size={15} /></button>
            <button className="icon-button" title="Copy prompt" onClick={() => navigator.clipboard.writeText(active.prompt || "")}><Copy size={15} /></button>
            <button className="text-button" title="Copy full generation settings" onClick={() => navigator.clipboard.writeText(fullGenerationText(active))}>Copy full</button>
            <button className="icon-button" title="Copy output link" onClick={() => navigator.clipboard.writeText(active.url)}><Copy size={15} /></button>
            <a className="icon-button" href={active.url} download><Download size={15} /></a>
            <button className="icon-button" title="Delete from gallery" onClick={() => deleteItem(active)}><Trash2 size={15} /></button>
          </div>
          <div className="viewer-layout" onClick={(event) => event.stopPropagation()}>
            <div className="viewer-media" style={{ "--zoom": viewerZoom } as React.CSSProperties}><Media item={active} /></div>
            {showDetails ? (
              <aside className="viewer-details">
                <h3>{titleFromPrompt(active.prompt || active.filename)}</h3>
                <label>
                  <span>Prompt</span>
                  <textarea readOnly value={active.prompt || ""} />
                </label>
                {active.negative ? (
                  <label>
                    <span>Negative</span>
                    <textarea readOnly value={active.negative} />
                  </label>
                ) : null}
                <div className="detail-grid">
                  <span>Aspect</span><strong>{active.width || "?"}x{active.height || "?"}</strong>
                  <span>Model</span><strong>{active.model || ""}</strong>
                  <span>Output</span><strong>{active.outputName || active.filename}</strong>
                  {active.durationMs ? <><span>Time</span><strong>{formatElapsed(active.durationMs)}</strong></> : null}
                  {Object.entries(active.settings || {}).map(([key, value]) => value ? (
                    <React.Fragment key={key}>
                      <span>{key}</span><strong>{String(value)}</strong>
                    </React.Fragment>
                  ) : null)}
                </div>
              </aside>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Media({ item, muted = false }: { item: Output; muted?: boolean }) {
  if (item.type === "video") return <video src={item.url} controls={!muted} muted={muted} loop autoPlay={muted} />;
  return <img src={item.url} alt={item.filename} />;
}

createRoot(document.getElementById("root")!).render(<App />);
