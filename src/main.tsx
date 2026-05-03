import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Power,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  PanelLeft,
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
type GalleryItem = Output & { id: string; jobId?: string; status: "done" | "pending" | "error" | "canceled"; progress?: Progress; preview?: string; width?: number; height?: number; createdAt?: string; durationMs?: number; model?: string; settings?: GenerationSettings; referenceImage?: string; referenceImageName?: string };
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
  variationQueueMode: "batch" | "separate";
  zenMode: boolean;
};

const defaultPrefs: Preferences = {
  defaultImageCount: 1,
  defaultImageSteps: 8,
  defaultVideoFrames: 33,
  defaultVideoSteps: 12,
  defaultFps: 16,
  variationQueueMode: "batch",
  zenMode: false
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
const promptLimit = 1800;
const negativeLimit = 1200;

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

function formatGeneratedAt(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function fullGenerationText(item: GalleryItem) {
  const settings = item.settings || {};
  const lines = [
    `Prompt: ${item.prompt || ""}`,
    `Negative prompt: ${item.negative || ""}`,
    `Model: ${item.model || ""}`,
    `Output: ${item.outputName || item.filename || ""}`,
    `Type: ${item.type}`,
    `Aspect: ${item.width || "?"}x${item.height || "?"}`,
    `Generated: ${formatGeneratedAt(item.createdAt)}`
  ];
  for (const [key, value] of Object.entries(settings)) {
    if (value !== "" && value !== undefined && value !== null && value !== 0) {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

function generationDetailEntries(item: GalleryItem) {
  const settings = item.settings || {};
  const rows: Array<[string, string]> = [];
  const add = (label: string, value: unknown) => {
    if (value === "" || value === undefined || value === null || value === 0 || value === false) return;
    rows.push([label, String(value)]);
  };
  add("Workflow", settings.workflow);
  add("Steps", settings.steps);
  add("CFG", settings.cfg);
  add("Sampler", settings.sampler);
  add("Scheduler", settings.scheduler);
  add("Seed", settings.seed);
  if (item.type === "image") {
    const count = Number(settings.count || 0);
    if (count > 1) add("Images", count);
    if (item.referenceImage || settings.referenceImageName) add("Reference", settings.referenceImageName || item.referenceImageName || "Selected");
    if (item.referenceImage || settings.referenceImageName) add("Denoise", settings.denoise);
  }
  if (item.type === "video") {
    add("Frames", settings.frames);
    add("FPS", settings.fps);
  }
  add("Text encoder", settings.textEncoder);
  add("VAE", settings.vae);
  add("CLIP type", settings.clipType);
  add("Weight dtype", settings.weightDtype);
  return rows;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

async function copyImage(item: GalleryItem) {
  if (item.type !== "image") return copyText(item.url);
  try {
    const response = await fetch(item.url);
    const blob = await response.blob();
    const type = blob.type || "image/png";
    await navigator.clipboard.write([
      new ClipboardItem({ [type]: blob })
    ]);
    return true;
  } catch {
    return copyText(item.url);
  }
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
  const [mode, setMode] = useState<Mode>(initialDraft.mode === "video" ? "video" : "image");
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
  const [advanced, setAdvanced] = useState(Boolean(initialDraft.advanced));
  const [settings, setSettings] = useState(false);
  const [zenControls, setZenControls] = useState(false);
  const [zenGalleryOpen, setZenGalleryOpen] = useState(initialDraft.zenGalleryOpen !== false);
  const [zenSelectedId, setZenSelectedId] = useState("");
  const [status, setStatus] = useState("Ready");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [active, setActive] = useState<GalleryItem | null>(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerPan, setViewerPan] = useState({ x: 0, y: 0 });
  const [showDetails, setShowDetails] = useState(Boolean(initialDraft.showDetails));
  const [customSize, setCustomSize] = useState(Boolean(initialDraft.customSize));
  const [now, setNow] = useState(Date.now());
  const [startImage, setStartImage] = useState(String(initialDraft.startImage || ""));
  const [startImageName, setStartImageName] = useState(String(initialDraft.startImageName || ""));
  const generatePostingRef = useRef(false);
  const viewerDragRef = useRef<{ id: number; x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const viewerDragEndRef = useRef<number>(0);
  const [isDraggingViewer, setIsDraggingViewer] = useState(false);
  const zenPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const zenStripRef = useRef<HTMLDivElement | null>(null);
  const zenStripDragRef = useRef<{ id: number; x: number; scrollLeft: number; moved: boolean } | null>(null);
  const latestZenIdRef = useRef("");

  useEffect(() => {
    refreshModels(false);
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
    if (!prefs.zenMode || active || settings || zenControls) return;
    window.setTimeout(() => zenPromptRef.current?.focus(), 0);
  }, [prefs.zenMode, active, settings, zenControls]);

  useEffect(() => {
    if (prefs.zenMode) return;
    setZenControls(false);
    setActive(null);
    resetViewer();
  }, [prefs.zenMode]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!active && !settings) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active, settings]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (settings) {
        event.preventDefault();
        setSettings(false);
        return;
      }
      if (active) {
        event.preventDefault();
        setActive(null);
        return;
      }
      if (zenControls) {
        event.preventDefault();
        setZenControls(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settings, active, zenControls]);

  useEffect(() => {
    const draft = {
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
      customSize,
      startImage,
      startImageName,
      advanced,
      showDetails,
      zenGalleryOpen
    };
    try {
      localStorage.setItem("j-ai-studio-draft", JSON.stringify(draft));
    } catch {
      localStorage.setItem("j-ai-studio-draft", JSON.stringify({ ...draft, startImage: "" }));
    }
  }, [mode, prompt, negative, model, textEncoder, vae, clipType, weightDtype, width, height, steps, cfg, denoise, seed, count, frames, fps, sampler, scheduler, customSize, startImage, startImageName, advanced, showDetails, zenGalleryOpen]);

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
        setViewerPan({ x: 0, y: 0 });
        setActive(doneItems[(currentIndex + 1) % doneItems.length]);
      }
      if (event.key === "ArrowLeft" && currentIndex >= 0) {
        event.preventDefault();
        setViewerZoom(1);
        setViewerPan({ x: 0, y: 0 });
        setActive(doneItems[(currentIndex - 1 + doneItems.length) % doneItems.length]);
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setViewerZoom((value) => Math.min(5, Number((value + 0.25).toFixed(2))));
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setViewerZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))));
      }
      if (event.key === "0") {
        event.preventDefault();
        setViewerZoom(1);
        setViewerPan({ x: 0, y: 0 });
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (window.confirm("Delete this generation from the gallery?")) deleteItem(activeItem, true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, gallery, mode]);

  useEffect(() => {
    if (!prefs.zenMode || active || settings) return;
    const doneItems = visibleGallery.filter((item) => item.status === "done");
    const currentIndex = Math.max(0, doneItems.findIndex((item) => item.id === zenSelectedId));
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowRight" && doneItems.length) {
        event.preventDefault();
        setZenSelectedId(doneItems[(currentIndex + 1) % doneItems.length].id);
      }
      if (event.key === "ArrowLeft" && doneItems.length) {
        event.preventDefault();
        setZenSelectedId(doneItems[(currentIndex - 1 + doneItems.length) % doneItems.length].id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prefs.zenMode, active, settings, gallery, mode, zenSelectedId]);

  function loadGallery() {
    fetch("/api/gallery")
      .then((res) => res.json())
      .then((data: { outputs: GalleryItem[] }) => {
        setGallery(data.outputs);
        const latest = data.outputs.find((item) => item.type === mode && item.status === "done");
        if (prefs.zenMode && latest && (!zenSelectedId || (latestZenIdRef.current && latest.id !== latestZenIdRef.current))) {
          setZenSelectedId(latest.id);
        }
        if (latest) latestZenIdRef.current = latest.id;
      })
      .catch(() => null);
  }

  function setPrefs(next: Partial<Preferences>) {
    const merged = { ...prefs, ...next };
    setPrefsState(merged);
    localStorage.setItem("j-ai-studio-prefs", JSON.stringify(merged));
  }

  function setZenMode(enabled: boolean) {
    if (!enabled) {
      setZenControls(false);
      setActive(null);
      resetViewer();
    }
    setPrefs({ zenMode: enabled });
  }

  function showToast(message: string, tone: "default" | "success" | "error" = "default") {
    if (tone === "success") toast.success(message);
    else if (tone === "error") toast.error(message);
    else toast(message);
  }

  async function copyAndToast(text: string, message = "Copied") {
    if (!text) {
      showToast("Nothing to copy", "error");
      return;
    }
    const copied = await copyText(text);
    showToast(copied ? message : "Copy failed", copied ? "success" : "error");
  }

  async function copyImageAndToast(item: GalleryItem) {
    const copied = await copyImage(item);
    showToast(copied ? (item.type === "image" ? "Image copied" : "Output link copied") : "Copy failed", copied ? "success" : "error");
  }

  function refreshModels(notify = true) {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data: Models) => {
        setModels(data);
        const profileId = model || "";
        if (!profileId && !notify) {
          const defaultProfile = data.profiles.find((item) => item.id === data.defaults.imageModel) || data.profiles[0];
          if (defaultProfile) applyProfile(defaultProfile);
        }
        if (notify) showToast("Models refreshed", "success");
      })
      .catch((error) => {
        setStatus(error.message);
        if (notify) showToast("Model refresh failed", "error");
      });
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
  const doneGallery = visibleGallery.filter((item) => item.status === "done");
  const zenItem = doneGallery.find((item) => item.id === zenSelectedId) || doneGallery[0] || null;
  const generateDisabled = !currentProfile || (currentProfile.capabilities.textEncoder && !textEncoder) || (currentProfile.capabilities.vae && !vae);

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
        const { jobId, items } = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...requestBody, count: requestCount })
        }).then((response) => response.json());
        queuedJobs.push(jobId);
        if (items?.length) setGallery((current) => dedupeGalleryItems([...items, ...current]));
      }
      showToast(startMessage, "success");
      generatePostingRef.current = false;

      await Promise.all(queuedJobs.map(async (jobId) => {
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 1600));
          const job: Job = await fetch(`/api/jobs/${jobId}`).then((res) => res.json());
          if (job.status === "done" || job.status === "error" || job.status === "canceled") return job;
          if (job.progress?.max) {
            setStatus(`Rendering ${job.progress.value}/${job.progress.max}`);
          } else {
            setStatus(job.status === "queued" ? "Queued" : "Rendering on the right");
          }
        }
      }));
      loadGallery();
      if (prefs.zenMode) {
        const data = await fetch("/api/gallery").then((res) => res.json()).catch(() => null);
        const latest = data?.outputs?.find((item: GalleryItem) => item.type === mode && item.status === "done");
        if (latest) {
          setGallery(data.outputs);
          setZenSelectedId(latest.id);
        }
      }
      setStatus("Outputs updated");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed");
      showToast("Generation failed", "error");
    } finally {
      generatePostingRef.current = false;
    }
  }

  async function cancelJob(jobId: string | undefined) {
    if (!jobId) return;
    if (!window.confirm("Cancel this generation?")) return;
    await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => null);
    loadGallery();
    setStatus("Canceled");
    showToast("Generation canceled");
  }

  async function cancelQueue() {
    if (!window.confirm("Cancel everything currently queued or generating?")) return;
    await fetch("/api/queue/cancel", { method: "POST" }).catch(() => null);
    loadGallery();
    setStatus("Queue canceled");
    showToast("Queue canceled");
  }

  async function clearGallery() {
    if (!window.confirm("Clear finished gallery items from this app?")) return;
    const data = await fetch("/api/gallery/clear", { method: "POST" }).then((res) => res.json()).catch(() => null);
    if (data?.outputs) setGallery(data.outputs);
    showToast("Gallery cleared");
  }

  async function openOutputFolder() {
    const response = await fetch("/api/open-output-folder", { method: "POST" }).catch(() => null);
    showToast(response?.ok ? "Opened output folder" : "Could not open folder", response?.ok ? "success" : "error");
  }

  async function deleteItem(item: GalleryItem, confirmed = false) {
    if (!confirmed && !window.confirm("Delete this generation from the gallery?")) return;
    setGallery((current) => current.filter((next) => next.id !== item.id));
    if (active?.id === item.id) setActive(null);
    const response = await fetch(`/api/gallery/${encodeURIComponent(item.id)}`, { method: "DELETE" }).catch(() => null);
    showToast(response?.ok ? "Deleted from gallery" : "Delete failed", response?.ok ? "success" : "error");
  }

  function resetViewer() {
    setViewerZoom(1);
    setViewerPan({ x: 0, y: 0 });
  }

  function openItem(item: GalleryItem) {
    resetViewer();
    setZenSelectedId(item.id);
    setShowDetails(true);
    setActive(item);
  }

  function applyAllSettings(item: GalleryItem) {
    const itemSettings = item.settings || {};
    const nextMode = item.type;
    const matchingProfile = models?.profiles.find((profile) => profile.kind === nextMode && profile.model === item.model);
    const matchingAspects = matchingProfile?.aspectPresets?.length ? matchingProfile.aspectPresets : fallbackAspectPresets[nextMode];
    setMode(nextMode);
    if (matchingProfile) setModel(matchingProfile.id);
    setPrompt((item.prompt || "").slice(0, promptLimit));
    setNegative((item.negative || "").slice(0, negativeLimit));
    setWidth(Number(item.width || itemSettings.width || width));
    setHeight(Number(item.height || itemSettings.height || height));
    if (itemSettings.steps) setSteps(Number(itemSettings.steps));
    if (itemSettings.cfg) setCfg(Number(itemSettings.cfg));
    if (itemSettings.denoise) setDenoise(Number(itemSettings.denoise));
    if (itemSettings.seed && itemSettings.seed !== "Random") setSeed(String(itemSettings.seed));
    else setSeed("");
    if (itemSettings.count) setCount(Number(itemSettings.count));
    if (itemSettings.frames) setFrames(Number(itemSettings.frames));
    if (itemSettings.fps) setFps(Number(itemSettings.fps));
    if (itemSettings.sampler) setSampler(String(itemSettings.sampler));
    if (itemSettings.scheduler) setScheduler(String(itemSettings.scheduler));
    if (itemSettings.textEncoder) setTextEncoder(String(itemSettings.textEncoder));
    if (itemSettings.vae) setVae(String(itemSettings.vae));
    if (itemSettings.clipType) setClipType(String(itemSettings.clipType));
    if (itemSettings.weightDtype) setWeightDtype(String(itemSettings.weightDtype));
    setStartImage(item.referenceImage || "");
    setStartImageName(item.referenceImageName || String(itemSettings.referenceImageName || ""));
    setCustomSize(!matchingAspects.some((option) => option.w === Number(item.width) && option.h === Number(item.height)));
    showToast("All settings applied", "success");
  }

  function moveZen(direction: 1 | -1) {
    if (!doneGallery.length) return;
    const currentIndex = Math.max(0, doneGallery.findIndex((item) => item.id === zenItem?.id));
    setZenSelectedId(doneGallery[(currentIndex + direction + doneGallery.length) % doneGallery.length].id);
  }

  function moveViewer(direction: 1 | -1) {
    if (!active) return;
    const doneItems = visibleGallery.filter((item) => item.status === "done");
    const currentIndex = doneItems.findIndex((item) => item.id === active.id);
    if (currentIndex < 0 || doneItems.length < 2) return;
    resetViewer();
    setActive(doneItems[(currentIndex + direction + doneItems.length) % doneItems.length]);
  }

  function goLatestZen() {
    const latest = doneGallery[0];
    if (latest) setZenSelectedId(latest.id);
  }

  function submitZenPrompt(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!generateDisabled) generate();
  }

  function startZenStripDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!zenStripRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    zenStripDragRef.current = { id: event.pointerId, x: event.clientX, scrollLeft: zenStripRef.current.scrollLeft, moved: false };
  }

  function dragZenStrip(event: React.PointerEvent<HTMLDivElement>) {
    const drag = zenStripDragRef.current;
    if (!drag || drag.id !== event.pointerId || !zenStripRef.current) return;
    if (Math.abs(event.clientX - drag.x) > 4) drag.moved = true;
    zenStripRef.current.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
  }

  function stopZenStripDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (zenStripDragRef.current?.id === event.pointerId) {
      window.setTimeout(() => {
        zenStripDragRef.current = null;
      }, 0);
    }
  }

  function selectZenItem(itemId: string) {
    if (zenStripDragRef.current?.moved) return;
    setZenSelectedId(itemId);
  }

  function zoomViewer(nextZoom: number) {
    const clamped = Math.max(0.5, Math.min(6, Number(nextZoom.toFixed(2))));
    setViewerZoom(clamped);
    if (clamped <= 1) setViewerPan({ x: 0, y: 0 });
  }

  function wheelViewer(event: React.WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomViewer(viewerZoom * factor);
  }

  function clickViewer(event: React.MouseEvent) {
    event.stopPropagation();
    if (event.target === event.currentTarget) {
      setActive(null);
      return;
    }
    if (viewerDragRef.current?.moved) return;
    if (viewerZoom > 1) {
      zoomViewer(1);
    } else {
      zoomViewer(2);
    }
  }

  function startViewerDrag(event: React.PointerEvent) {
    if (viewerZoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    viewerDragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: viewerPan.x, panY: viewerPan.y, moved: false };
    setIsDraggingViewer(true);
  }

  function dragViewer(event: React.PointerEvent) {
    const drag = viewerDragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    setViewerPan({ x: drag.panX + dx, y: drag.panY + dy });
  }

  function stopViewerDrag(event: React.PointerEvent) {
    if (viewerDragRef.current?.id === event.pointerId) {
      const moved = viewerDragRef.current.moved;
      setIsDraggingViewer(false);
      if (moved) viewerDragEndRef.current = Date.now();
      window.setTimeout(() => { viewerDragRef.current = null; }, 0);
    }
  }

  async function shutdown() {
    if (!window.confirm("Close the local J AI Studio server?")) return;
    setStatus("Closing localhost...");
    await fetch("/api/shutdown", { method: "POST" }).catch(() => null);
  }

  return (
    <div className={prefs.zenMode ? "zen-shell" : "app-shell"}>
      {prefs.zenMode ? (
        <>
          <div className="zen-stage">
            {zenItem ? (
              <button
                className={cn("zen-output", viewerZoom > 1 && "is-zoomed")}
                onClick={() => {
                  if (viewerDragRef.current?.moved) return;
                  openItem(zenItem);
                }}
                onWheel={wheelViewer}
                onPointerDown={startViewerDrag}
                onPointerMove={dragViewer}
                onPointerUp={stopViewerDrag}
                onPointerCancel={stopViewerDrag}
                style={{ "--tile-ratio": `${zenItem.width || 1} / ${zenItem.height || 1}`, "--zoom": viewerZoom, "--pan-x": `${viewerPan.x}px`, "--pan-y": `${viewerPan.y}px` } as React.CSSProperties}
              >
                <Media item={zenItem} muted />
              </button>
            ) : (
              <div className="zen-empty">
                <img src="/j-ai-logo.png" alt="" />
              </div>
            )}
            <div className="zen-fade" />
          </div>

          {doneGallery.length > 1 ? (
            <div className="zen-arrows">
              <button aria-label="Previous output" onClick={() => moveZen(-1)}><ChevronLeft size={22} /></button>
              <button aria-label="Next output" onClick={() => moveZen(1)}><ChevronRight size={22} /></button>
            </div>
          ) : null}

          <button className="zen-control-button has-tip" data-tip="Controls" aria-label="Controls" onClick={() => setZenControls((value) => !value)}>
            <PanelLeft size={16} />
          </button>
          {doneGallery.length && !zenGalleryOpen ? (
            <button className="zen-gallery-restore has-tip" data-tip="Show gallery" aria-label="Show gallery" onClick={() => setZenGalleryOpen(true)}>
              <ChevronDown size={16} />
            </button>
          ) : null}
          <div className="zen-top-actions">
            <button className="icon-button has-tip" data-tip="Settings" aria-label="Settings" onClick={() => setSettings(true)}><Settings2 size={15} /></button>
            <button className="icon-button has-tip" data-tip="Exit zen" aria-label="Exit zen" onClick={() => setZenMode(false)}><X size={15} /></button>
          </div>

          <aside className={cn("zen-controls", zenControls && "open")}>
            <div className="mode-tabs" role="tablist" aria-label="Generation mode">
              <button className={cn(mode === "image" && "active")} onClick={() => changeMode("image")}>Image</button>
              <button className={cn(mode === "video" && "active")} onClick={() => changeMode("video")}>Video</button>
            </div>
            <Field label={mode === "image" ? "Image model" : "Video model"}>
              <ModelPicker value={model} profiles={modelProfiles} onChange={chooseModel} />
            </Field>
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
            <Field label="Negative prompt">
              <textarea maxLength={negativeLimit} className="short" value={negative} onChange={(event) => setNegative(event.target.value.slice(0, negativeLimit))} />
              <span className="field-meta">{negative.length}/{negativeLimit} characters</span>
            </Field>
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
              </div>
            ) : null}
          </aside>

          <section className="zen-prompt">
            <textarea ref={zenPromptRef} maxLength={promptLimit} value={prompt} placeholder="Describe what to make..." onKeyDown={submitZenPrompt} onChange={(event) => setPrompt(event.target.value.slice(0, promptLimit))} />
            <div className="zen-prompt-actions">
              <span className="zen-status" title={status}>{status}</span>
              <div className="zen-inline-settings">
                <AspectPicker value={aspectPickerValue} onChange={(value) => applyAspect(value)} options={aspectOptions} />
                <label className="zen-steps">
                  <span>Steps</span>
                  <input type="number" min={1} value={steps} onChange={(event) => setSteps(Number(event.target.value))} />
                </label>
              </div>
              <button className="generate" onClick={generate} disabled={generateDisabled}>
                <Wand2 size={15} />
                {mode === "image" ? `Generate ${count}` : "Generate video"}
              </button>
            </div>
          </section>

          {doneGallery.length && zenGalleryOpen ? (
            <div className="zen-gallery-wrap">
              <button className="zen-gallery-toggle has-tip" data-tip="Hide gallery" aria-label="Hide gallery" onClick={() => setZenGalleryOpen(false)}><ChevronUp size={16} /></button>
              {doneGallery[0]?.id !== zenItem?.id ? <button className="zen-latest" onClick={goLatestZen}>Latest</button> : null}
              <div
                ref={zenStripRef}
                className="zen-gallery-strip"
                onPointerDown={startZenStripDrag}
                onPointerMove={dragZenStrip}
                onPointerUp={stopZenStripDrag}
                onPointerCancel={stopZenStripDrag}
              >
                {doneGallery.map((item) => (
                  <button key={item.id} className={cn(item.id === zenItem?.id && "active")} onClick={() => selectZenItem(item.id)} onDragStart={(event) => event.preventDefault()}>
                    <Media item={item} muted />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
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
            <textarea maxLength={promptLimit} value={prompt} onChange={(event) => setPrompt(event.target.value.slice(0, promptLimit))} />
            <span className="field-meta">{prompt.length}/{promptLimit} characters</span>
          </Field>
          <Field label="Negative prompt">
            <textarea maxLength={negativeLimit} className="short" value={negative} onChange={(event) => setNegative(event.target.value.slice(0, negativeLimit))} />
            <span className="field-meta">{negative.length}/{negativeLimit} characters</span>
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

        <button className="generate" onClick={generate} disabled={generateDisabled}>
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
          <button className="icon-button has-tip" data-tip="Settings" aria-label="Settings" onClick={() => setSettings(true)}><Settings2 size={15} /></button>
        </div>

        <section className="gallery">
          {visibleGallery.length ? visibleGallery.map((item) => {
            const ratio = item.progress?.max ? Math.min(1, Math.max(0, item.progress.value / item.progress.max)) : 0;
            const indeterminate = !item.progress?.max;
            return (
            <button key={item.id} className={cn("tile", item.status)} style={{ "--tile-ratio": `${item.width || 1} / ${item.height || 1}` } as React.CSSProperties} onClick={() => item.status === "done" && openItem(item)}>
              {item.status === "pending" ? (
                <div className={cn("generating", item.preview && "has-preview")} style={{ "--progress-ratio": ratio } as React.CSSProperties}>
                  {item.preview ? <img className="generate-preview" src={item.preview} alt="" draggable={false} /> : null}
                  {!item.preview ? <div className="noise-layer" /> : null}
                  <div className="generate-overlay">
                    <span className="generate-step">
                      {item.progress?.max ? (
                        <>
                          <span className="generate-step-label">Step</span>
                          <span className="generate-step-count">{item.progress.value}<i>/</i>{item.progress.max}</span>
                        </>
                      ) : (
                        <span className="generate-step-label is-queued">Queued</span>
                      )}
                    </span>
                    <span className="generate-elapsed">{formatElapsed(now - Date.parse(item.createdAt || new Date().toISOString()))}</span>
                  </div>
                  <div className={cn("generate-bar", indeterminate && "is-indeterminate")}>
                    <div className="generate-bar-fill" />
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
            );
          }) : (
            <div className="empty">
              <h2>No outputs yet</h2>
            </div>
          )}
        </section>
      </main>
        </>
      )}

      {settings ? (
        <div className="scrim modal-scrim" onClick={() => setSettings(false)}>
          <div className="settings-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>Settings</h2>
              </div>
              <button className="icon-button has-tip" data-tip="Close (Esc)" aria-label="Close settings" onClick={() => setSettings(false)}><X size={15} /></button>
            </header>

            <div className="settings-grid">
              <section>
                <h3>Connection</h3>
                <div className="setting-row"><span>Studio</span><strong>127.0.0.1:8787</strong></div>
                <div className="setting-row"><span>ComfyUI</span><strong>127.0.0.1:8188</strong></div>
                <div className="setting-actions">
                  <button onClick={() => refreshModels()}>Refresh models</button>
                  <button onClick={() => { window.open("http://127.0.0.1:8188", "_blank"); showToast("Opening ComfyUI"); }}>Open ComfyUI</button>
                </div>
              </section>

              <section>
                <h3>Installed</h3>
                <div className="setting-row"><span>Image models</span><strong>{models?.imageModels.length || 0}</strong></div>
                <div className="setting-row"><span>Video models</span><strong>{models?.videoModels.length || 0}</strong></div>
                <div className="setting-row"><span>Workflow</span><strong>{currentProfile?.family || "None"}</strong></div>
                <div className="setting-row"><span>Start image</span><strong>{canUseStartImage ? "Available" : "Hidden for this model"}</strong></div>
                {(models?.unsupportedModels?.length || 0) > 0 ? <div className="setting-row"><span>Unsupported</span><strong>{models?.unsupportedModels?.length || 0}</strong></div> : null}
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
                <Field label="Variation mode">
                  <Select
                    value={prefs.variationQueueMode}
                    onChange={(value) => setPrefs({ variationQueueMode: value === "separate" ? "separate" : "batch" })}
                    options={[
                      { label: "Together in one run", value: "batch" },
                      { label: "Start each image now", value: "separate" }
                    ]}
                  />
                  <span className="field-meta">{prefs.variationQueueMode === "batch" ? "One generation produces all variations together." : "Creates one generation per image immediately, so each card can be canceled separately."}</span>
                </Field>
              </section>

              <section>
                <h3>Experience</h3>
                <label className="toggle-row">
                  <span>
                    <strong>Zen mode</strong>
                    <em>Prompt-first fullscreen layout</em>
                  </span>
                  <input type="checkbox" checked={prefs.zenMode} onChange={(event) => setZenMode(event.target.checked)} />
                </label>
              </section>

              <section>
                <h3>Gallery</h3>
                <div className="setting-row"><span>Total items</span><strong>{gallery.length}</strong></div>
                <div className="setting-row"><span>Current tab</span><strong>{visibleGallery.length} {mode === "image" ? "images" : "videos"}</strong></div>
                <div className="setting-row"><span>Outputs</span><strong>{paths.outputDir || "Not configured"}</strong></div>
                <div className="setting-actions">
                  <button onClick={() => copyAndToast(paths.outputDir || "", "Output path copied")}>Copy output path</button>
                  <button onClick={openOutputFolder} disabled={!paths.outputDir}>Open output folder</button>
                </div>
                <button className="wide-button subtle-danger" onClick={clearGallery}>Clear finished gallery</button>
              </section>

              <section>
                <h3>Localhost</h3>
                <button className="danger-button" onClick={shutdown}><Power size={15} /> Close localhost</button>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {active ? (() => {
        const doneItems = visibleGallery.filter((item) => item.status === "done");
        const hasNeighbors = doneItems.length > 1;
        return (
          <div className="scrim" onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            if (Date.now() - viewerDragEndRef.current < 200) return;
            setActive(null);
          }} onWheel={(event) => event.preventDefault()}>
            <div className="viewer-shell" onClick={(event) => event.stopPropagation()}>
              <header className="viewer-topbar">
                <div className="viewer-title">
                  <strong>{titleFromPrompt(active.prompt || active.filename) || "Untitled"}</strong>
                  <em>{active.model || familyLabel(currentProfile) || active.type}</em>
                </div>
                <div className="viewer-tools">
                  <button className="icon-button has-tip" data-tip="Zoom out (-)" aria-label="Zoom out" onClick={() => zoomViewer(viewerZoom - 0.25)}><ZoomOut size={15} /></button>
                  <button className="text-button viewer-zoom has-tip" data-tip="Reset zoom (0)" onClick={resetViewer}><RotateCcw size={13} /> {Math.round(viewerZoom * 100)}%</button>
                  <button className="icon-button has-tip" data-tip="Zoom in (+)" aria-label="Zoom in" onClick={() => zoomViewer(viewerZoom + 0.25)}><ZoomIn size={15} /></button>
                  <span className="viewer-divider" />
                  <button className="icon-button has-tip" data-tip={active.type === "image" ? "Copy image" : "Copy output link"} aria-label={active.type === "image" ? "Copy image" : "Copy output link"} onClick={() => copyImageAndToast(active)}><Copy size={15} /></button>
                  <a className="icon-button has-tip" data-tip="Download file" aria-label="Download file" href={active.url} download><Download size={15} /></a>
                  <button className="icon-button danger-tone has-tip" data-tip="Delete (Del)" aria-label="Delete from gallery" onClick={() => deleteItem(active)}><Trash2 size={15} /></button>
                  <span className="viewer-divider" />
                  <button className={cn("icon-button has-tip", showDetails && "active")} data-tip={showDetails ? "Hide details" : "Show details"} aria-label="Toggle details" aria-pressed={showDetails} onClick={() => setShowDetails((value) => !value)}><SlidersHorizontal size={15} /></button>
                  <button className="icon-button has-tip" data-tip="Close (Esc)" aria-label="Close" onClick={() => setActive(null)}><X size={16} /></button>
                </div>
              </header>
              <div className={cn("viewer-stage", showDetails && "with-side")}>
                <div
                  className={cn("viewer-canvas", viewerZoom > 1 && "is-zoomed", isDraggingViewer && "is-dragging")}
                  style={{ "--zoom": viewerZoom, "--pan-x": `${viewerPan.x}px`, "--pan-y": `${viewerPan.y}px` } as React.CSSProperties}
                  onWheel={wheelViewer}
                  onPointerDown={startViewerDrag}
                  onPointerMove={dragViewer}
                  onPointerUp={stopViewerDrag}
                  onPointerCancel={stopViewerDrag}
                  onClick={clickViewer}
                  onDoubleClick={(event) => { event.stopPropagation(); zoomViewer(viewerZoom > 1 ? 1 : 2.5); }}
                >
                  <Media item={active} />
                </div>
                {hasNeighbors ? (
                  <>
                    <button className="viewer-arrow prev has-tip" data-tip="Previous (<-)" aria-label="Previous output" onClick={() => moveViewer(-1)}><ChevronLeft size={20} /></button>
                    <button className="viewer-arrow next has-tip" data-tip="Next (->)" aria-label="Next output" onClick={() => moveViewer(1)}><ChevronRight size={20} /></button>
                  </>
                ) : null}
                {showDetails ? (
                  <aside className="viewer-side" onWheel={(event) => event.stopPropagation()}>
                    <div className="viewer-side-head">
                      <h3>Details</h3>
                    </div>
                    <div className="viewer-side-body">
                      <div className="prompt-readout">
                        <span>Prompt</span>
                        <p>{active.prompt || "No prompt recorded"}</p>
                      </div>
                      {active.negative ? (
                        <div className="prompt-readout">
                          <span>Negative</span>
                          <p>{active.negative}</p>
                        </div>
                      ) : null}
                      <div className="detail-grid">
                        <span>Aspect</span><strong>{active.width || "?"}x{active.height || "?"}</strong>
                        <span>Model</span><strong>{active.model || "-"}</strong>
                        <span>Output</span><strong>{active.outputName || active.filename}</strong>
                        {active.createdAt ? <><span>Generated</span><strong>{formatGeneratedAt(active.createdAt)}</strong></> : null}
                        {active.durationMs ? <><span>Time</span><strong>{formatElapsed(active.durationMs)}</strong></> : null}
                      </div>
                      {generationDetailEntries(active).length ? (
                        <details className="settings-disclosure">
                          <summary>Generation settings</summary>
                          <div className="detail-grid">
                            {generationDetailEntries(active).map(([key, value]) => (
                              <React.Fragment key={key}>
                                <span>{key}</span><strong>{value}</strong>
                              </React.Fragment>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                    <div className="viewer-side-foot">
                      <button onClick={() => copyAndToast(active.prompt || "", "Prompt copied")}>Copy prompt</button>
                      <button onClick={() => applyAllSettings(active)}>Apply all settings</button>
                    </div>
                  </aside>
                ) : null}
              </div>
            </div>
          </div>
        );
      })() : null}

      <Toaster theme="dark" position="bottom-left" richColors closeButton toastOptions={{ className: "sonner-toast" }} />
    </div>
  );
}

function Media({ item, muted = false }: { item: Output; muted?: boolean }) {
  if (item.type === "video") return <video src={item.url} controls={!muted} muted={muted} loop autoPlay={muted} draggable={false} />;
  return <img src={item.url} alt={item.filename} draggable={false} onDragStart={(e) => e.preventDefault()} />;
}

createRoot(document.getElementById("root")!).render(<App />);
