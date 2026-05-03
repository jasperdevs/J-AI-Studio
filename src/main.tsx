import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import {
  Select as FluidSelect,
  SelectContent as FluidSelectContent,
  SelectItem as FluidSelectItem,
  SelectTrigger as FluidSelectTrigger
} from "@/components/ui/select";
import { Tooltip as FluidTooltip } from "@/components/ui/tooltip";
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
  Minus,
  Plus,
  RotateCcw,
  Maximize2,
  Minimize2,
  Settings,
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
type GalleryItem = Output & { id: string; jobId?: string; status: "done" | "pending" | "error" | "canceled"; progress?: Progress; preview?: string; width?: number; height?: number; createdAt?: string; durationMs?: number; model?: string; settings?: GenerationSettings; index?: number; referenceImage?: string; referenceImageName?: string };
type Job = { status: string; outputs: GalleryItem[]; error?: string; progress?: Progress; preview?: string };
type TouchGesture = { mode: "pan"; id: number; x: number; y: number; panX: number; panY: number; moved: boolean } | { mode: "pinch"; distance: number; zoom: number; panX: number; panY: number; centerX: number; centerY: number; moved: boolean };
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
type Health = { ok: boolean; comfyUrl?: string; error?: string };
type AspectPreset = { label: string; value: string; w: number; h: number };

type Preferences = {
  defaultImageCount: number;
  defaultImageSteps: number;
  defaultVideoFrames: number;
  defaultVideoSteps: number;
  defaultFps: number;
  variationQueueMode: "batch" | "separate";
  zenMode: boolean;
  confirmActions: boolean;
  enterToGenerate: boolean;
  followLatest: boolean;
  showFailedItems: boolean;
  mobileZenDefaulted?: boolean;
};

const defaultPrefs: Preferences = {
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
const githubUrl = "https://github.com/jasperdevs/J-AI-Studio";
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

function settingMax(meta?: { max?: number }) {
  return Number.isFinite(meta?.max) && Number(meta?.max) > 0 ? Number(meta?.max) : undefined;
}

function characterMeta(length: number, limit?: number) {
  if (!limit) return `${length.toLocaleString()} chars`;
  const remaining = Math.max(0, limit - length);
  return remaining === 0 ? "Limit reached" : `${remaining.toLocaleString()} left`;
}

function clampText(text: string, limit?: number) {
  return limit ? text.slice(0, limit) : text;
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
  add("Aspect", `${item.width || "?"}x${item.height || "?"}`);
  add("Model", item.model);
  add("Output", item.outputName || item.filename);
  add("Generated", formatGeneratedAt(item.createdAt));
  add("Time", item.durationMs ? formatElapsed(item.durationMs) : "");
  add("Type", item.type);
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
  add("Denoise", settings.denoise);
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
  if (!item.url) return copyText(fullGenerationText(item));
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

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : response.statusText || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

function loadPrefs(): Preferences {
  try {
    const saved = localStorage.getItem("j-ai-studio-prefs");
    const mobileDefault = typeof window !== "undefined" && window.matchMedia("(max-width: 620px)").matches;
    if (!saved) return { ...defaultPrefs, zenMode: mobileDefault || defaultPrefs.zenMode };
    const parsed = JSON.parse(saved);
    const merged = { ...defaultPrefs, ...parsed };
    if (mobileDefault && !parsed.mobileZenDefaulted) {
      return { ...merged, zenMode: true, mobileZenDefaulted: true };
    }
    return merged;
  } catch {
    const mobileDefault = typeof window !== "undefined" && window.matchMedia("(max-width: 620px)").matches;
    return { ...defaultPrefs, zenMode: mobileDefault || defaultPrefs.zenMode };
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

function galleryTime(item: GalleryItem) {
  const parsed = Date.parse(item.createdAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortGalleryItems(items: GalleryItem[]) {
  return [...items].sort((a, b) => {
    const timeDelta = galleryTime(b) - galleryTime(a);
    if (timeDelta) return timeDelta;
    const aIndex = Number(a.index ?? 0);
    const bIndex = Number(b.index ?? 0);
    if (a.jobId && b.jobId && a.jobId === b.jobId && aIndex !== bIndex) return aIndex - bIndex;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

function galleryColumnTarget() {
  if (typeof window === "undefined") return 6;
  if (window.matchMedia("(max-width: 620px)").matches) return 3;
  if (window.matchMedia("(max-width: 980px)").matches) return 4;
  return 6;
}

function useGalleryColumnCount() {
  const [count, setCount] = useState(galleryColumnTarget);
  useEffect(() => {
    const update = () => setCount(galleryColumnTarget());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return count;
}

function distributeGalleryColumns(items: GalleryItem[], count: number) {
  const columns = Array.from({ length: Math.max(1, count) }, () => [] as GalleryItem[]);
  items.forEach((item, index) => columns[index % columns.length].push(item));
  return columns;
}

function touchDistance(touches: React.TouchList) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function touchCenter(touches: React.TouchList) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <span className={cn("skeleton", className)} aria-hidden="true" />;
}

function GallerySkeleton({ columns }: { columns: number }) {
  const ratios = [1.32, 0.76, 1, 1.48, 0.66, 1.18, 0.9, 1.6, 0.72, 1.08, 1.34, 0.82];
  const items = ratios.map((ratio, index) => ({ id: index, width: Math.round(ratio * 100), height: 100 }));
  const skeletonColumns = Array.from({ length: Math.max(1, columns) }, () => [] as typeof items);
  items.forEach((item, index) => skeletonColumns[index % skeletonColumns.length].push(item));
  return skeletonColumns.map((column, columnIndex) => (
    <div className="gallery-column" key={`skeleton-column-${columnIndex}`}>
      {column.map((item) => (
        <div key={item.id} className="tile skeleton-tile" style={{ "--tile-ratio": `${item.width || 1} / ${item.height || 1}` } as React.CSSProperties}>
          <Skeleton className="skeleton-media" />
        </div>
      ))}
    </div>
  ));
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<string | { label: string; value: string }> }) {
  const normalized = options.map((option) => typeof option === "string" ? { label: option, value: option } : option);
  return (
    <FluidSelect value={value} onValueChange={onChange}>
      <FluidSelectTrigger className="fluid-select-trigger" placeholder="Select" />
      <FluidSelectContent className="fluid-select-content">
        {normalized.map((item, index) => (
          <FluidSelectItem key={item.value} index={index} value={item.value}>
            {item.label}
          </FluidSelectItem>
        ))}
      </FluidSelectContent>
    </FluidSelect>
  );
}

function Tip({ content, side = "bottom", children }: { content: React.ReactNode; side?: "top" | "right" | "bottom" | "left"; children: React.ReactElement }) {
  return (
    <FluidTooltip content={content} side={side} sideOffset={10}>
      {children}
    </FluidTooltip>
  );
}

function NumberPicker({
  label,
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  precision,
  size = "md",
  fill = false
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  size?: "sm" | "md";
  fill?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef(value);
  const holdRef = useRef<{ timer: number | null; interval: number | null }>({ timer: null, interval: null });

  const decimals = precision ?? (Number.isInteger(step) ? 0 : Math.min(4, (String(step).split(".")[1] || "").length));
  const formatValue = (n: number) => decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { if (!editing) setDraft(formatValue(value)); }, [value, editing, decimals]);

  const clamp = (n: number) => {
    const bounded = Math.max(min, Math.min(max, n));
    if (decimals === 0) return Math.round(bounded);
    const factor = Math.pow(10, decimals);
    return Math.round(bounded * factor) / factor;
  };
  const stepBy = (direction: number) => {
    const next = clamp(valueRef.current + direction * step);
    if (next !== valueRef.current) onChange(next);
  };

  const clearHold = () => {
    if (holdRef.current.timer) window.clearTimeout(holdRef.current.timer);
    if (holdRef.current.interval) window.clearInterval(holdRef.current.interval);
    holdRef.current = { timer: null, interval: null };
  };

  const startHold = (direction: number) => {
    stepBy(direction);
    holdRef.current.timer = window.setTimeout(() => {
      holdRef.current.interval = window.setInterval(() => stepBy(direction), 55);
    }, 320);
  };

  useEffect(() => () => clearHold(), []);

  const beginEdit = () => {
    setDraft(formatValue(value));
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const commitEdit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
    setEditing(false);
  };

  const labelLower = label.toLowerCase();
  return (
    <div
      className={cn("number-picker", size === "sm" && "is-sm", fill && "is-fill")}
      onWheel={(event) => { event.preventDefault(); stepBy(event.deltaY < 0 ? 1 : -1); }}
    >
      <span className="number-picker-label">{label}</span>
      <Tip content={`Decrease ${labelLower}`}><button
        type="button"
        className="number-picker-btn"
        aria-label={`Decrease ${labelLower}`}
        disabled={value <= min}
        onPointerDown={(event) => { event.preventDefault(); startHold(-1); }}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
      ><Minus size={12} /></button></Tip>
      {editing ? (
        <input
          ref={inputRef}
          className="number-picker-input"
          type="number"
          min={min}
          max={Number.isFinite(max) ? max : undefined}
          step={step}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); commitEdit(); }
            else if (event.key === "Escape") { setDraft(formatValue(value)); setEditing(false); }
            else if (event.key === "ArrowUp") { event.preventDefault(); stepBy(1); }
            else if (event.key === "ArrowDown") { event.preventDefault(); stepBy(-1); }
          }}
        />
      ) : (
        <button type="button" className="number-picker-value" onClick={beginEdit} aria-label={`${label}: ${formatValue(value)}, click to edit`}>{formatValue(value)}</button>
      )}
      <Tip content={`Increase ${labelLower}`}><button
        type="button"
        className="number-picker-btn"
        aria-label={`Increase ${labelLower}`}
        disabled={value >= max}
        onPointerDown={(event) => { event.preventDefault(); startHold(1); }}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
      ><Plus size={12} /></button></Tip>
    </div>
  );
}

function AspectPicker({ value, options, onChange }: { value: string; options: AspectPreset[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((item) => item.value === value);
  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", closeOnOutside, true);
    return () => window.removeEventListener("pointerdown", closeOnOutside, true);
  }, [open]);
  return (
    <div className="aspect-picker" ref={pickerRef} data-open-surface={open || undefined}>
      <Tip content="Aspect ratio"><button type="button" data-open-trigger className="aspect-trigger" onClick={() => setOpen((next) => !next)}>
          {selected ? <span className="aspect-shape" style={aspectIconStyle(selected)} /> : <span className="aspect-shape custom" />}
          <span>{selected ? selected.label : "Custom"}</span>
          <ChevronDown size={14} className={cn(open && "flip")} />
        </button></Tip>
      {open ? (
        <div className="aspect-menu" data-open-surface>
          {options.map((option) => (
            <Tip key={option.value} content={`${option.label} ${option.value}`}><button
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
              </button></Tip>
          ))}
          <Tip content="Custom width and height"><button
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
            </button></Tip>
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

function ModelPicker({ value, profiles, onChange, compact = false }: { value: string; profiles: Profile[]; onChange: (value: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selected = profiles.find((profile) => profile.id === value) || profiles[0] || null;
  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", closeOnOutside, true);
    return () => window.removeEventListener("pointerdown", closeOnOutside, true);
  }, [open]);
  return (
    <div className={cn("model-picker", compact && "is-compact")} ref={pickerRef} data-open-surface={open || undefined}>
      <Tip content="Choose model"><button type="button" data-open-trigger className="model-trigger" onClick={() => setOpen((next) => !next)}>
          <span className="model-glyph">{selected?.kind === "video" ? "V" : "I"}</span>
          {compact ? (
            <span className="model-copy"><strong>{selected?.displayName || selected?.label || "No model"}</strong></span>
          ) : (
            <span className="model-copy">
              <strong>{selected?.displayName || selected?.label || "No model"}</strong>
              <em>{selected ? familyLabel(selected) : "No supported workflow"}</em>
            </span>
          )}
          <ChevronDown size={14} className={cn(open && "flip")} />
        </button></Tip>
      {open ? (
        <div className="model-menu" data-open-surface>
          {profiles.map((profile) => (
            <Tip key={profile.id} content={profile.displayName || profile.label}><button
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
              </button></Tip>
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
  const [health, setHealth] = useState<Health | null>(null);
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
  const advanced = true;
  const [settings, setSettings] = useState(false);
  const [zenControls, setZenControls] = useState(Boolean(initialDraft.zenControls));
  const [showNegativePrompt, setShowNegativePrompt] = useState(Boolean(initialDraft.showNegativePrompt));
  const [zenGalleryOpen, setZenGalleryOpen] = useState(initialDraft.zenGalleryOpen !== false);
  const [zenSelectedId, setZenSelectedId] = useState(String(initialDraft.zenSelectedId || ""));
  const [status, setStatus] = useState("Ready");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [galleryLoaded, setGalleryLoaded] = useState(false);
  const [active, setActive] = useState<GalleryItem | null>(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerPan, setViewerPan] = useState({ x: 0, y: 0 });
  const [showDetails, setShowDetails] = useState(Boolean(initialDraft.showDetails));
  const [showGenerationSettings, setShowGenerationSettings] = useState(Boolean(initialDraft.showGenerationSettings));
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
  const touchGestureRef = useRef<TouchGesture | null>(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    refreshHealth();
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
    const textarea = zenPromptRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(128, Math.max(44, textarea.scrollHeight))}px`;
  }, [prompt, prefs.zenMode]);

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
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-open-trigger], [data-open-surface], [data-radix-popper-content-wrapper], [role='listbox'], [role='tooltip']")) return;
      if (zenControls) setZenControls(false);
      if (prefs.zenMode && zenGalleryOpen) setZenGalleryOpen(false);
      if (active && showDetails) setShowDetails(false);
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [active, prefs.zenMode, showDetails, zenControls, zenGalleryOpen]);

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
    function onKeyDown(event: KeyboardEvent) {
      if (settings || active) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length !== 1 && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a, [contenteditable='true'], [role='dialog'], [role='listbox'], [data-radix-popper-content-wrapper]")) return;
      zenPromptRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [settings, active]);

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
      showGenerationSettings,
      showNegativePrompt,
      zenGalleryOpen,
      zenControls,
      zenSelectedId
    };
    try {
      localStorage.setItem("j-ai-studio-draft", JSON.stringify(draft));
    } catch {
      localStorage.setItem("j-ai-studio-draft", JSON.stringify({ ...draft, startImage: "" }));
    }
  }, [mode, prompt, negative, model, textEncoder, vae, clipType, weightDtype, width, height, steps, cfg, denoise, seed, count, frames, fps, sampler, scheduler, customSize, startImage, startImageName, advanced, showDetails, showGenerationSettings, showNegativePrompt, zenGalleryOpen, zenControls, zenSelectedId]);

  useEffect(() => {
    if (!active) return;
    const activeItem = active;
    const doneItems = visibleGallery.filter((item) => item.status === "done" || item.status === "error");
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
        deleteItem(activeItem);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, gallery, mode]);

  useEffect(() => {
    if (!prefs.zenMode || active || settings) return;
    const doneItems = visibleGallery.filter((item) => item.status === "done" || item.status === "error");
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
        const outputs = data.outputs.filter((item) => item.status !== "canceled");
        setGallery(outputs);
        setGalleryLoaded(true);
        const latest = outputs.find((item) => item.type === mode && item.status === "done");
        if (prefs.zenMode && prefs.followLatest && latest && (!zenSelectedId || (latestZenIdRef.current && latest.id !== latestZenIdRef.current))) {
          setZenSelectedId(latest.id);
        }
        if (latest) latestZenIdRef.current = latest.id;
      })
      .catch(() => setGalleryLoaded(true));
  }

  function setPrefs(next: Partial<Preferences>) {
    const merged = { ...prefs, ...next };
    setPrefsState(merged);
    try {
      localStorage.setItem("j-ai-studio-prefs", JSON.stringify(merged));
    } catch {
      showToast("Could not save settings", "error");
    }
  }

  function setZenMode(enabled: boolean) {
    if (!enabled) {
      setZenControls(false);
      setActive(null);
      resetViewer();
    }
    setPrefs({ zenMode: enabled });
  }

  function confirmAction(message: string) {
    return !prefs.confirmActions || window.confirm(message);
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
    showToast(copied ? (!item.url ? "Generation details copied" : item.type === "image" ? "Image copied" : "Output link copied") : "Copy failed", copied ? "success" : "error");
  }

  function refreshModels(notify = true) {
    apiJson<Models>("/api/models")
      .then((data: Models) => {
        setModels(data);
        const profileId = model || "";
        if (!profileId && !notify) {
          const defaultProfile = data.profiles.find((item) => item.id === data.defaults.imageModel) || data.profiles[0];
          if (defaultProfile) applyProfile(defaultProfile);
        }
        if (notify) setStatus("Ready");
      })
      .catch((error) => {
        setStatus(error.message);
        if (notify) showToast("Model refresh failed", "error");
      });
  }

  function refreshHealth() {
    apiJson<Health>("/api/health")
      .then(setHealth)
      .catch((error) => setHealth({ ok: false, error: error instanceof Error ? error.message : "Connection failed" }));
  }

  function refreshPaths() {
    apiJson<Paths>("/api/paths")
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
    setSteps(Number(profile.defaults.steps || profile.constraints?.steps?.default || (profile.kind === "video" ? prefs.defaultVideoSteps : prefs.defaultImageSteps)));
    setCfg(Number(profile.defaults.cfg || profile.constraints?.cfg?.default || 1));
    setSampler(String(profile.defaults.sampler || "euler_ancestral"));
    setScheduler(String(profile.defaults.scheduler || "beta"));
    setDenoise(Number(profile.defaults.denoise || profile.constraints?.denoise?.default || 0.65));
    if (profile.kind === "video") {
      setFrames(Number(profile.defaults.frames || prefs.defaultVideoFrames));
      setFps(Number(profile.defaults.fps || profile.constraints?.fps?.default || prefs.defaultFps));
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
  const countMeta = currentProfile?.constraints?.count || {};
  const stepsMeta = currentProfile?.constraints?.steps || {};
  const cfgMeta = currentProfile?.constraints?.cfg || {};
  const denoiseMeta = currentProfile?.constraints?.denoise || {};
  const fpsMeta = currentProfile?.constraints?.fps || {};
  const promptLimit = settingMax(currentProfile?.constraints?.prompt);
  const negativeLimit = settingMax(currentProfile?.constraints?.negative);
  const promptRemaining = promptLimit ? Math.max(0, promptLimit - prompt.length) : undefined;
  const profileOptions = currentProfile?.options || {};
  const aspectValue = `${width}x${height}`;
  const aspectPickerValue = customSize || !aspectOptions.some((item) => item.value === aspectValue) ? "custom" : aspectValue;
  const visibleGallery = useMemo(() => sortGalleryItems(gallery.filter((item) => item.type === mode && item.status !== "canceled" && (prefs.showFailedItems || item.status !== "error"))), [gallery, mode, prefs.showFailedItems]);
  const galleryColumnCount = useGalleryColumnCount();
  const galleryColumns = useMemo(() => distributeGalleryColumns(visibleGallery, galleryColumnCount), [visibleGallery, galleryColumnCount]);
  const runningCount = visibleGallery.filter((item) => item.status === "pending").length;
  const doneGallery = visibleGallery.filter((item) => item.status === "done" || item.status === "error");
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
        if (items?.length) setGallery((current) => dedupeGalleryItems([...items, ...current]));
      }
      generatePostingRef.current = false;

      await Promise.all(queuedJobs.map(async (jobId) => {
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 1600));
          const job: Job = await apiJson<Job>(`/api/jobs/${jobId}`);
          if (job.status === "missing") {
            setGallery((current) => current.map((item) => item.jobId === jobId ? { ...item, status: "error", filename: "Generation interrupted" } : item));
            return job;
          }
          if (job.status === "done" || job.status === "error" || job.status === "canceled") return job;
          if (job.preview || job.progress?.max) {
            setGallery((current) => current.map((item) => item.jobId === jobId ? {
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
    setGallery((current) => current.filter((item) => item.jobId !== jobId));
    await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => null);
    setStatus("Ready");
  }

  async function cancelQueue() {
    if (!confirmAction("Cancel everything currently queued or generating?")) return;
    setGallery((current) => current.filter((item) => item.status !== "pending" && item.status !== "canceled"));
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
    setShowDetails(typeof window === "undefined" ? true : !window.matchMedia("(max-width: 620px)").matches);
    setActive(item);
  }

  function applyAllSettings(item: GalleryItem) {
    const itemSettings = item.settings || {};
    const nextMode = item.type;
    const matchingProfile = models?.profiles.find((profile) => profile.kind === nextMode && profile.model === item.model);
    const matchingAspects = matchingProfile?.aspectPresets?.length ? matchingProfile.aspectPresets : fallbackAspectPresets[nextMode];
    setMode(nextMode);
    if (matchingProfile) setModel(matchingProfile.id);
    const nextPromptLimit = settingMax(matchingProfile?.constraints?.prompt);
    const nextNegativeLimit = settingMax(matchingProfile?.constraints?.negative);
    setPrompt(clampText(item.prompt || "", nextPromptLimit));
    setNegative(clampText(item.negative || "", nextNegativeLimit));
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
    const doneItems = visibleGallery.filter((item) => item.status === "done" || item.status === "error");
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
    if (!prefs.enterToGenerate || event.key !== "Enter" || event.shiftKey) return;
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
    const drag = zenStripDragRef.current;
    if (drag?.id === event.pointerId) {
      if (!drag.moved) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-zen-id]") as HTMLElement | null;
        const itemId = target?.dataset.zenId;
        if (itemId) setZenSelectedId(itemId);
      }
      window.setTimeout(() => {
        zenStripDragRef.current = null;
      }, 0);
    }
  }

  function selectZenItem(itemId: string) {
    if (zenStripDragRef.current?.moved) return;
    setZenSelectedId(itemId);
  }

  function anchoredPan(nextZoom: number, clientX: number, clientY: number, element: HTMLElement) {
    if (nextZoom <= 1) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    const anchorX = clientX - rect.left - rect.width / 2;
    const anchorY = clientY - rect.top - rect.height / 2;
    const scale = nextZoom / Math.max(viewerZoom, 0.01);
    return {
      x: anchorX - (anchorX - viewerPan.x) * scale,
      y: anchorY - (anchorY - viewerPan.y) * scale
    };
  }

  function anchoredPanFromStart(nextZoom: number, clientX: number, clientY: number, element: HTMLElement, startZoom: number, startPan: { x: number; y: number }) {
    if (nextZoom <= 1) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    const anchorX = clientX - rect.left - rect.width / 2;
    const anchorY = clientY - rect.top - rect.height / 2;
    const scale = nextZoom / Math.max(startZoom, 0.01);
    return {
      x: anchorX - (anchorX - startPan.x) * scale,
      y: anchorY - (anchorY - startPan.y) * scale
    };
  }

  function zoomViewer(nextZoom: number, anchor?: { x: number; y: number; element: HTMLElement }) {
    const clamped = Math.max(0.5, Math.min(6, Number(nextZoom.toFixed(2))));
    if (anchor) setViewerPan(anchoredPan(clamped, anchor.x, anchor.y, anchor.element));
    else if (clamped <= 1) setViewerPan({ x: 0, y: 0 });
    setViewerZoom(clamped);
  }

  function wheelViewer(event: React.WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomViewer(viewerZoom * factor, { x: event.clientX, y: event.clientY, element: event.currentTarget as HTMLElement });
  }

  function clickViewer(event: React.MouseEvent) {
    event.stopPropagation();
    if (Date.now() - viewerDragEndRef.current < 220) return;
    if (viewerDragRef.current?.moved) return;
    const canvas = event.currentTarget as HTMLElement;
    const media = canvas.querySelector("img, video") as HTMLElement | null;
    if (media) {
      const rect = media.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) {
        setActive(null);
        return;
      }
    }
    if (viewerZoom > 1) {
      zoomViewer(1);
    } else {
      zoomViewer(2);
    }
  }

  function startViewerDrag(event: React.PointerEvent) {
    if (event.pointerType === "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    viewerDragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: viewerPan.x, panY: viewerPan.y, moved: false };
    setIsDraggingViewer(true);
  }

  function dragViewer(event: React.PointerEvent) {
    if (event.pointerType === "touch") return;
    const drag = viewerDragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    if (viewerZoom > 1) setViewerPan({ x: drag.panX + dx, y: drag.panY + dy });
  }

  function stopViewerDrag(event: React.PointerEvent) {
    if (event.pointerType === "touch") return;
    if (viewerDragRef.current?.id === event.pointerId) {
      const moved = viewerDragRef.current.moved;
      setIsDraggingViewer(false);
      if (moved) viewerDragEndRef.current = Date.now();
      window.setTimeout(() => { viewerDragRef.current = null; }, 0);
    }
  }

  function startViewerTouch(event: React.TouchEvent) {
    if (event.touches.length === 2) {
      event.preventDefault();
      const center = touchCenter(event.touches);
      touchGestureRef.current = {
        mode: "pinch",
        distance: touchDistance(event.touches),
        zoom: viewerZoom,
        panX: viewerPan.x,
        panY: viewerPan.y,
        centerX: center.x,
        centerY: center.y,
        moved: false
      };
      setIsDraggingViewer(true);
      return;
    }
    if (event.touches.length === 1 && viewerZoom > 1) {
      event.preventDefault();
      const touch = event.touches[0];
      touchGestureRef.current = {
        mode: "pan",
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        panX: viewerPan.x,
        panY: viewerPan.y,
        moved: false
      };
      setIsDraggingViewer(true);
    }
  }

  function moveViewerTouch(event: React.TouchEvent) {
    const gesture = touchGestureRef.current;
    if (!gesture) return;
    event.preventDefault();
    if (gesture.mode === "pinch" && event.touches.length >= 2) {
      const distance = touchDistance(event.touches);
      const center = touchCenter(event.touches);
      const nextZoom = Math.max(0.5, Math.min(6, Number((gesture.zoom * (distance / gesture.distance)).toFixed(2))));
      if (Math.abs(distance - gesture.distance) > 4) gesture.moved = true;
      setViewerZoom(nextZoom);
      setViewerPan(anchoredPanFromStart(nextZoom, center.x, center.y, event.currentTarget as HTMLElement, gesture.zoom, { x: gesture.panX, y: gesture.panY }));
      return;
    }
    if (gesture.mode === "pan" && event.touches.length === 1) {
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) gesture.moved = true;
      setViewerPan({ x: gesture.panX + dx, y: gesture.panY + dy });
    }
  }

  function endViewerTouch(event: React.TouchEvent) {
    const gesture = touchGestureRef.current;
    setIsDraggingViewer(false);
    if (gesture?.moved) {
      viewerDragEndRef.current = Date.now();
    } else if (!gesture && event.changedTouches.length === 1) {
      const nowTap = Date.now();
      if (nowTap - lastTapRef.current < 280) {
        event.preventDefault();
        zoomViewer(viewerZoom > 1 ? 1 : 2.5);
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = nowTap;
    }
    if (viewerZoom <= 1) setViewerPan({ x: 0, y: 0 });
    touchGestureRef.current = null;
  }

  const sidebarControls = (
    <>
      <div className="mode-tabs" role="tablist" aria-label="Generation mode">
        <Tip content="Image generation"><button className={cn(mode === "image" && "active")} onClick={() => changeMode("image")}>Image</button></Tip>
        <Tip content="Video generation"><button className={cn(mode === "video" && "active")} onClick={() => changeMode("video")}>Video</button></Tip>
      </div>
      {mode === "video" ? (
        <div className="number-row">
          <NumberPicker label="Frames" value={frames} onChange={setFrames} min={frameMeta.min || 1} max={frameMeta.max ?? 240} step={frameMeta.step || 4} fill />
          <NumberPicker label="FPS" value={fps} onChange={setFps} min={fpsMeta.min || 1} max={fpsMeta.max ?? 60} step={fpsMeta.step || 1} fill />
        </div>
      ) : (
        <Field label="Seed"><input value={seed} placeholder="Random" onChange={(event) => setSeed(event.target.value)} /></Field>
      )}
      {customSize ? (
        <div className="number-row">
          <NumberPicker label="Width" value={width} onChange={setWidth} min={widthMeta.min ?? 64} max={widthMeta.max ?? 4096} step={widthMeta.step || (mode === "video" ? 32 : 64)} fill />
          <NumberPicker label="Height" value={height} onChange={setHeight} min={heightMeta.min ?? 64} max={heightMeta.max ?? 4096} step={heightMeta.step || (mode === "video" ? 32 : 64)} fill />
        </div>
      ) : null}
      {canUseStartImage ? (
        <Field label="Start image">
          <label className="file-pick">
            <input type="file" accept="image/*" onChange={(event) => readStartImage(event.target.files?.[0])} />
            <span>{startImageName || "Choose image"}</span>
                  {startImageName ? <Tip content="Clear start image"><button type="button" onClick={(event) => { event.preventDefault(); if (confirmAction("Clear the selected start image?")) { setStartImage(""); setStartImageName(""); } }}>Clear</button></Tip> : null}
          </label>
          {currentProfile?.capabilities.denoise ? (
            <NumberPicker label="Denoise" value={denoise} onChange={setDenoise} min={denoiseMeta.min ?? 0} max={denoiseMeta.max ?? 1} step={denoiseMeta.step || 0.05} precision={2} fill />
          ) : null}
        </Field>
      ) : null}
      <div className="sidebar-section">
        <div className="section-title">Advanced</div>
        <div className="advanced-grid">
          {!models ? (
            <>
              <Skeleton className="skeleton-control" />
              <Skeleton className="skeleton-control" />
            </>
          ) : null}
          {currentProfile?.capabilities.textEncoder ? <Field label="Text encoder"><Select value={textEncoder} onChange={setTextEncoder} options={profileOptions.textEncoders || models?.textEncoders || []} /></Field> : null}
          {currentProfile?.capabilities.vae ? <Field label="VAE"><Select value={vae} onChange={setVae} options={profileOptions.vaes || models?.vaes || []} /></Field> : null}
          {currentProfile?.capabilities.weightDtype ? <Field label="Weight dtype"><Select value={weightDtype} onChange={setWeightDtype} options={profileOptions.weightDtypes || models?.weightDtypes || []} /></Field> : null}
          <NumberPicker label="CFG" value={cfg} onChange={setCfg} min={cfgMeta.min ?? 0} max={cfgMeta.max ?? 30} step={cfgMeta.step || 0.5} precision={1} fill />
          <Field label="Sampler"><Select value={sampler} onChange={setSampler} options={profileOptions.samplers?.length ? profileOptions.samplers : models?.samplers?.length ? models.samplers : fallbackSamplers} /></Field>
          <Field label="Scheduler"><Select value={scheduler} onChange={setScheduler} options={profileOptions.schedulers?.length ? profileOptions.schedulers : models?.schedulers?.length ? models.schedulers : fallbackSchedulers} /></Field>
        </div>
      </div>
    </>
  );

  return (
    <div className={cn(prefs.zenMode ? "zen-shell" : "app-shell", showNegativePrompt && "negative-open")}>
      {prefs.zenMode ? (
        <>
          <div className="zen-stage">
            {zenItem ? (
              <button
                className={cn("zen-output", viewerZoom > 1 && "is-zoomed")}
                onClick={() => {
                  if (Date.now() - viewerDragEndRef.current < 220) return;
                  if (viewerDragRef.current?.moved) return;
                  openItem(zenItem);
                }}
                onWheel={wheelViewer}
                onPointerDown={startViewerDrag}
                onPointerMove={dragViewer}
                onPointerUp={stopViewerDrag}
                onPointerCancel={stopViewerDrag}
                onTouchStart={startViewerTouch}
                onTouchMove={moveViewerTouch}
                onTouchEnd={endViewerTouch}
                onTouchCancel={endViewerTouch}
                style={{ "--tile-ratio": `${zenItem.width || 1} / ${zenItem.height || 1}`, "--zoom": viewerZoom, "--pan-x": `${viewerPan.x}px`, "--pan-y": `${viewerPan.y}px` } as React.CSSProperties}
              >
                <Media item={zenItem} muted />
              </button>
            ) : !galleryLoaded ? (
              <div className="zen-empty skeleton-stage">
                <Skeleton className="skeleton-logo" />
              </div>
            ) : (
              <div className="zen-empty">
                <img src="/j-ai-logo.png" alt="" />
              </div>
            )}
            <div className="zen-fade" />
            <div className="bottom-fade" />
          </div>

          {doneGallery.length > 1 ? (
            <div className="zen-arrows">
              <Tip content="Previous output"><button aria-label="Previous output" onClick={() => moveZen(-1)}><ChevronLeft size={22} /></button></Tip>
              <Tip content="Next output"><button aria-label="Next output" onClick={() => moveZen(1)}><ChevronRight size={22} /></button></Tip>
            </div>
          ) : null}

          <Tip content="Controls"><button data-open-trigger className="zen-control-button" aria-label="Controls" onClick={() => setZenControls((value) => !value)}>
            <PanelLeft size={16} />
          </button></Tip>
          {zenItem ? (
            <div className={cn("zen-zoom-dock", zenControls && "with-side")}>
              <Tip content="Zoom out (-)"><button className="icon-button" aria-label="Zoom out" onClick={() => zoomViewer(viewerZoom - 0.25)} disabled={viewerZoom <= 0.5}><ZoomOut size={15} /></button></Tip>
              <Tip content="Reset zoom (0)"><button className="text-button viewer-zoom" onClick={resetViewer}>{viewerZoom !== 1 ? <RotateCcw size={13} /> : null} {Math.round(viewerZoom * 100)}%</button></Tip>
              <Tip content="Zoom in (+)"><button className="icon-button" aria-label="Zoom in" onClick={() => zoomViewer(viewerZoom + 0.25)} disabled={viewerZoom >= 6}><ZoomIn size={15} /></button></Tip>
            </div>
          ) : null}
          {doneGallery.length && !zenGalleryOpen ? (
            <Tip content="Show gallery"><button data-open-trigger className="zen-gallery-restore" aria-label="Show gallery" onClick={() => setZenGalleryOpen(true)}>
              <ChevronDown size={16} />
            </button></Tip>
          ) : null}
          <div className="zen-top-actions">
            <Tip content="Settings"><button className="icon-button" aria-label="Settings" onClick={() => setSettings(true)}><Settings size={15} /></button></Tip>
            <Tip content="Exit zen"><button className="icon-button" aria-label="Exit zen" onClick={() => setZenMode(false)}><Minimize2 size={15} /></button></Tip>
          </div>

          {zenControls ? <button className="sidebar-dismiss" aria-label="Close controls" onClick={() => setZenControls(false)} /> : null}
          <aside data-open-surface className={cn("zen-controls", zenControls && "open")}>
            {sidebarControls}
          </aside>

          <section className="zen-prompt">
            <textarea ref={zenPromptRef} maxLength={promptLimit} value={prompt} placeholder="Describe what to make..." onKeyDown={submitZenPrompt} onChange={(event) => setPrompt(clampText(event.target.value, promptLimit))} />
            <span className={cn("prompt-count", promptRemaining === 0 && "limit")}>{characterMeta(prompt.length, promptLimit)}</span>
            <div data-open-surface className={cn("negative-drawer", showNegativePrompt && "open")}>
              <label className="negative-drawer-label">Negative prompt</label>
              <textarea maxLength={negativeLimit} value={negative} placeholder="What to avoid..." onChange={(event) => setNegative(clampText(event.target.value, negativeLimit))} />
              <span>{characterMeta(negative.length, negativeLimit)}</span>
            </div>
            <div className="zen-prompt-actions">
              <div className="zen-inline-settings">
                {models ? <ModelPicker value={model} profiles={modelProfiles} onChange={chooseModel} compact /> : <Skeleton className="skeleton-control" />}
                <Tip content={showNegativePrompt ? "Hide negative prompt" : "Show negative prompt"}><button data-open-trigger type="button" className={cn("negative-toggle", showNegativePrompt && "active")} onClick={() => setShowNegativePrompt((value) => !value)}>
                  <ChevronUp size={13} className={cn(!showNegativePrompt && "flip")} />
                  Negative
                </button></Tip>
                <AspectPicker value={aspectPickerValue} onChange={(value) => applyAspect(value)} options={aspectOptions} />
                <NumberPicker label="Steps" value={steps} onChange={setSteps} min={stepsMeta.min || 1} max={stepsMeta.max || 150} step={stepsMeta.step || 1} size="sm" />
                {mode === "image" ? <NumberPicker label="Variants" value={count} onChange={setCount} min={countMeta.min || 1} max={countMeta.max ?? 8} step={countMeta.step || 1} size="sm" /> : null}
              </div>
              <Tip content={mode === "image" ? `Generate ${count} image${count === 1 ? "" : "s"}` : "Generate video"}><button className="generate" onClick={generate} disabled={generateDisabled}>
                <Wand2 size={15} />
                Generate
              </button></Tip>
            </div>
          </section>

          {doneGallery.length && zenGalleryOpen ? (
            <div data-open-surface className="zen-gallery-wrap">
              <Tip content="Hide gallery"><button className="zen-gallery-toggle" aria-label="Hide gallery" onClick={() => setZenGalleryOpen(false)}><ChevronUp size={16} /></button></Tip>
              {doneGallery[0]?.id !== zenItem?.id ? <Tip content="Jump to latest output"><button className="zen-latest" onClick={goLatestZen}>Latest</button></Tip> : null}
              <div
                ref={zenStripRef}
                className="zen-gallery-strip"
                onPointerDown={startZenStripDrag}
                onPointerMove={dragZenStrip}
                onPointerUp={stopZenStripDrag}
                onPointerCancel={stopZenStripDrag}
              >
                {doneGallery.map((item) => (
                  <Tip key={item.id} content={titleFromPrompt(item.prompt || item.filename)}><button data-zen-id={item.id} className={cn(item.id === zenItem?.id && "active")} onClick={(event) => { event.stopPropagation(); selectZenItem(item.id); }} onDragStart={(event) => event.preventDefault()}>
                    <Media item={item} muted />
                  </button></Tip>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <main className="stage-gallery">
            <section className="gallery" style={{ "--gallery-columns": galleryColumnCount } as React.CSSProperties}>
          {!galleryLoaded ? <GallerySkeleton columns={galleryColumnCount} /> : visibleGallery.length ? galleryColumns.map((column, columnIndex) => (
            <div className="gallery-column" key={`gallery-column-${columnIndex}`}>
              {column.map((item) => {
            const ratio = item.progress?.max ? Math.min(1, Math.max(0, item.progress.value / item.progress.max)) : 0;
            const indeterminate = !item.progress?.max;
            return (
            <button key={item.id} className={cn("tile", item.status)} style={{ "--tile-ratio": `${item.width || 1} / ${item.height || 1}` } as React.CSSProperties} onClick={() => item.status !== "pending" && openItem(item)}>
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
              ) : item.status === "done" ? <Media item={item} muted /> : <div className="generating stopped"><span>Failed</span></div>}
              <span className="tile-caption">
                <strong>{titleFromPrompt(item.prompt || item.filename)}</strong>
                <em>{item.status === "pending" ? formatElapsed(now - Date.parse(item.createdAt || new Date().toISOString())) : item.durationMs ? formatElapsed(item.durationMs) : item.outputName || item.type}</em>
              </span>
              {item.status === "pending" ? <Tip content="Cancel generation"><span className="tile-action" onClick={(event) => { event.stopPropagation(); cancelJob(item.jobId); }}>Cancel</span></Tip> : null}
              {item.status === "done" ? (
                <span className="tile-hover-actions">
                  {item.url ? <Tip content="Download"><a className="tile-icon" aria-label="Download" href={item.url} download onClick={(event) => event.stopPropagation()}><Download size={13} /></a></Tip> : null}
                  <Tip content="Copy"><span className="tile-icon" role="button" aria-label="Copy" onClick={(event) => { event.stopPropagation(); copyImageAndToast(item); }}><Copy size={13} /></span></Tip>
                </span>
              ) : null}
              {item.status !== "pending" ? <Tip content="Delete from gallery"><span className="tile-delete" onClick={(event) => { event.stopPropagation(); deleteItem(item); }}><Trash2 size={13} /></span></Tip> : null}
            </button>
            );
          })}
            </div>
          )) : (
            <div className="empty">
              <h2>No outputs yet</h2>
            </div>
          )}
            </section>
            <div className="bottom-fade" />
          </main>

          <Tip content="Controls"><button data-open-trigger className="zen-control-button" aria-label="Controls" onClick={() => setZenControls((value) => !value)}>
            <PanelLeft size={16} />
          </button></Tip>
          <div className="zen-top-actions">
            {runningCount ? <Tip content="Cancel all running and queued generations"><button className="queue-button" onClick={cancelQueue}>Cancel queue</button></Tip> : null}
            <Tip content="Settings"><button className="icon-button" aria-label="Settings" onClick={() => setSettings(true)}><Settings size={15} /></button></Tip>
            <Tip content="Zen mode"><button className="icon-button" aria-label="Enter zen mode" onClick={() => setZenMode(true)}><Maximize2 size={15} /></button></Tip>
          </div>

          {zenControls ? <button className="sidebar-dismiss" aria-label="Close controls" onClick={() => setZenControls(false)} /> : null}
          <aside data-open-surface className={cn("zen-controls", zenControls && "open")}>
            {sidebarControls}
          </aside>

          <section className="zen-prompt">
            <textarea ref={zenPromptRef} maxLength={promptLimit} value={prompt} placeholder="Describe what to make..." onKeyDown={submitZenPrompt} onChange={(event) => setPrompt(clampText(event.target.value, promptLimit))} />
            <span className={cn("prompt-count", promptRemaining === 0 && "limit")}>{characterMeta(prompt.length, promptLimit)}</span>
            <div data-open-surface className={cn("negative-drawer", showNegativePrompt && "open")}>
              <label className="negative-drawer-label">Negative prompt</label>
              <textarea maxLength={negativeLimit} value={negative} placeholder="What to avoid..." onChange={(event) => setNegative(clampText(event.target.value, negativeLimit))} />
              <span>{characterMeta(negative.length, negativeLimit)}</span>
            </div>
            <div className="zen-prompt-actions">
              <div className="zen-inline-settings">
                {models ? <ModelPicker value={model} profiles={modelProfiles} onChange={chooseModel} compact /> : <Skeleton className="skeleton-control" />}
                <Tip content={showNegativePrompt ? "Hide negative prompt" : "Show negative prompt"}><button data-open-trigger type="button" className={cn("negative-toggle", showNegativePrompt && "active")} onClick={() => setShowNegativePrompt((value) => !value)}>
                  <ChevronUp size={13} className={cn(!showNegativePrompt && "flip")} />
                  Negative
                </button></Tip>
                <AspectPicker value={aspectPickerValue} onChange={(value) => applyAspect(value)} options={aspectOptions} />
                <NumberPicker label="Steps" value={steps} onChange={setSteps} min={stepsMeta.min || 1} max={stepsMeta.max || 150} step={stepsMeta.step || 1} size="sm" />
                {mode === "image" ? <NumberPicker label="Variants" value={count} onChange={setCount} min={countMeta.min || 1} max={countMeta.max ?? 8} step={countMeta.step || 1} size="sm" /> : null}
              </div>
              <Tip content={mode === "image" ? `Generate ${count} image${count === 1 ? "" : "s"}` : "Generate video"}><button className="generate" onClick={generate} disabled={generateDisabled}>
                <Wand2 size={15} />
                Generate
              </button></Tip>
            </div>
          </section>
        </>
      )}

      {settings ? (
        <div className="scrim modal-scrim" onClick={() => setSettings(false)}>
          <div data-open-surface className="settings-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <div className="settings-brand">
                <img src="/j-ai-logo.png" alt="" />
                <h2>Settings</h2>
              </div>
              <Tip content="Close (Esc)"><button className="icon-button" aria-label="Close settings" onClick={() => setSettings(false)}><X size={15} /></button></Tip>
            </header>

            <div className="settings-grid">
              <section>
                <h3>Project</h3>
                <div className="project-card">
                  <img src="/j-ai-logo.png" alt="" />
                  <div>
                    <strong>J AI Studio</strong>
                    <span>Local image and video studio</span>
                  </div>
                </div>
                <div className="setting-actions single">
                  <Tip content="Open the public GitHub repo"><a className="wide-button link-button" href={githubUrl} target="_blank" rel="noreferrer">GitHub</a></Tip>
                </div>
              </section>

              <section>
                <h3>Connection</h3>
                <div className="setting-row"><span>Studio</span><strong>{window.location.host || "Localhost"}</strong></div>
                <div className="setting-row"><span>ComfyUI</span><strong>{health ? health.comfyUrl || "Not connected" : <Skeleton className="skeleton-text short" />}</strong></div>
                <div className="setting-row"><span>Status</span><strong>{health ? health.ok ? "Connected" : health.error || "Disconnected" : <Skeleton className="skeleton-text tiny" />}</strong></div>
                <div className="setting-actions">
                  <Tip content="Check the local ComfyUI connection"><button onClick={refreshHealth}>Check connection</button></Tip>
                  <Tip content="Rescan local models"><button onClick={() => refreshModels()}>Refresh models</button></Tip>
                  <Tip content="Open ComfyUI in a new tab"><button onClick={() => { window.open(health?.comfyUrl || "http://127.0.0.1:8188", "_blank"); }}>Open ComfyUI</button></Tip>
                </div>
              </section>

              <section>
                <h3>Installed</h3>
                <div className="setting-row"><span>Image models</span><strong>{models ? models.imageModels.length : <Skeleton className="skeleton-text tiny" />}</strong></div>
                <div className="setting-row"><span>Video models</span><strong>{models ? models.videoModels.length : <Skeleton className="skeleton-text tiny" />}</strong></div>
                <div className="setting-row"><span>Workflow</span><strong>{models ? currentProfile?.family || "None" : <Skeleton className="skeleton-text short" />}</strong></div>
                <div className="setting-row"><span>Start image</span><strong>{canUseStartImage ? "Available" : "Hidden for this model"}</strong></div>
                {(models?.unsupportedModels?.length || 0) > 0 ? <div className="setting-row"><span>Unsupported</span><strong>{models?.unsupportedModels?.length || 0}</strong></div> : null}
              </section>

              <section>
                <h3>Generation</h3>
                <Field label="When generating multiple images">
                  <Select
                    value={prefs.variationQueueMode}
                    onChange={(value) => setPrefs({ variationQueueMode: value === "separate" ? "separate" : "batch" })}
                    options={[
                      { label: "Run them all in one batch", value: "batch" },
                      { label: "Queue them as separate jobs", value: "separate" }
                    ]}
                  />
                  <span className="field-meta">{prefs.variationQueueMode === "batch" ? "Faster overall, but you can only cancel the whole batch." : "Each image is its own job, so you can cancel them individually."}</span>
                </Field>
                <label className="toggle-row">
                  <span>
                    <strong>Enter to generate</strong>
                    <em>Press Enter to submit, Shift+Enter for a new line</em>
                  </span>
                  <input type="checkbox" checked={prefs.enterToGenerate} onChange={(event) => setPrefs({ enterToGenerate: event.target.checked })} />
                </label>
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
                <label className="toggle-row">
                  <span>
                    <strong>Confirm actions</strong>
                    <em>Ask before delete, cancel, reset, and cache clearing</em>
                  </span>
                  <input type="checkbox" checked={prefs.confirmActions} onChange={(event) => setPrefs({ confirmActions: event.target.checked })} />
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>Follow latest output</strong>
                    <em>Jump to the newest finished item while generating</em>
                  </span>
                  <input type="checkbox" checked={prefs.followLatest} onChange={(event) => setPrefs({ followLatest: event.target.checked })} />
                </label>
              </section>

              <section>
                <h3>Gallery</h3>
                <div className="setting-row"><span>Total items</span><strong>{galleryLoaded ? gallery.length : <Skeleton className="skeleton-text tiny" />}</strong></div>
                <div className="setting-row"><span>Current tab</span><strong>{galleryLoaded ? `${visibleGallery.length} ${mode === "image" ? "images" : "videos"}` : <Skeleton className="skeleton-text short" />}</strong></div>
                <div className="setting-row"><span>Outputs</span><strong>{paths.outputDir || <Skeleton className="skeleton-text path" />}</strong></div>
                <label className="toggle-row">
                  <span>
                    <strong>Show failed items</strong>
                    <em>Keep interrupted or failed generations visible in the gallery</em>
                  </span>
                  <input type="checkbox" checked={prefs.showFailedItems} onChange={(event) => setPrefs({ showFailedItems: event.target.checked })} />
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>Zen gallery strip</strong>
                    <em>Show the small gallery across the top in zen mode</em>
                  </span>
                  <input type="checkbox" checked={zenGalleryOpen} onChange={(event) => setZenGalleryOpen(event.target.checked)} />
                </label>
                <div className="setting-actions">
                  <Tip content="Copy the output folder path"><button onClick={() => copyAndToast(paths.outputDir || "", "Output path copied")}>Copy output path</button></Tip>
                  <Tip content="Open the output folder"><button onClick={openOutputFolder} disabled={!paths.outputDir}>Open output folder</button></Tip>
                </div>
                <div className="setting-actions">
                  <Tip content="Remove failed and interrupted cards"><button onClick={clearFailedItems}>Clear failed items</button></Tip>
                  <Tip content="Remove finished items from this gallery"><button className="subtle-danger" onClick={clearGallery}>Clear finished gallery</button></Tip>
                </div>
              </section>

              <section>
                <h3>Maintenance</h3>
                <div className="setting-actions">
                  <Tip content="Reset prompts, layout, model choices, and saved settings"><button onClick={resetAllSettings}>Reset all settings</button></Tip>
                  <Tip content="Clear browser cache, stale queue state, and free ComfyUI memory"><button onClick={clearAllCache}>Clear all cache</button></Tip>
                </div>
              </section>

            </div>
          </div>
        </div>
      ) : null}

      {active ? (() => {
        const doneItems = visibleGallery.filter((item) => item.status === "done" || item.status === "error");
        const hasNeighbors = doneItems.length > 1;
        return (
          <div className="scrim" onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            if (Date.now() - viewerDragEndRef.current < 200) return;
            setActive(null);
          }} onWheel={(event) => event.preventDefault()}>
            <div className="viewer-shell" onClick={(event) => event.stopPropagation()}>
              <div className={cn("viewer-stage", showDetails && "with-side")}>
                <div
                  className={cn("viewer-canvas", viewerZoom > 1 && "is-zoomed", isDraggingViewer && "is-dragging")}
                  style={{ "--zoom": viewerZoom, "--pan-x": `${viewerPan.x}px`, "--pan-y": `${viewerPan.y}px` } as React.CSSProperties}
                  onWheel={wheelViewer}
                  onPointerDown={startViewerDrag}
                  onPointerMove={dragViewer}
                  onPointerUp={stopViewerDrag}
                  onPointerCancel={stopViewerDrag}
                  onTouchStart={startViewerTouch}
                  onTouchMove={moveViewerTouch}
                  onTouchEnd={endViewerTouch}
                  onTouchCancel={endViewerTouch}
                  onClick={clickViewer}
                  onDoubleClick={(event) => { event.stopPropagation(); zoomViewer(viewerZoom > 1 ? 1 : 2.5); }}
                >
                  <Media item={active} />
                </div>
                {hasNeighbors ? (
                  <>
                    <Tip content="Previous"><button className="viewer-arrow prev" aria-label="Previous output" onClick={() => moveViewer(-1)}><ChevronLeft size={20} /></button></Tip>
                    <Tip content="Next"><button className="viewer-arrow next" aria-label="Next output" onClick={() => moveViewer(1)}><ChevronRight size={20} /></button></Tip>
                  </>
                ) : null}
                {showDetails ? (
                  <aside data-open-surface className="viewer-side" onWheel={(event) => event.stopPropagation()}>
                    <div className="viewer-side-head">
                      <h3>Details</h3>
                    </div>
                    <div className="viewer-side-body">
                      <div className="prompt-readout">
                        <span>Prompt</span>
                        <div className="readout-box">
                          <p>{active.prompt || "No prompt recorded"}</p>
                          <Tip content="Copy prompt"><button className="readout-copy" aria-label="Copy prompt" onClick={() => copyAndToast(active.prompt || "", "Prompt copied")}><Copy size={13} /></button></Tip>
                        </div>
                      </div>
                      {active.negative ? (
                        <div className="prompt-readout">
                          <span>Negative</span>
                          <div className="readout-box">
                            <p>{active.negative}</p>
                            <Tip content="Copy negative prompt"><button className="readout-copy" aria-label="Copy negative prompt" onClick={() => copyAndToast(active.negative || "", "Negative prompt copied")}><Copy size={13} /></button></Tip>
                          </div>
                        </div>
                      ) : null}
                      <Tip content="Copy this output's full settings into the generator"><button className="copy-all-settings" onClick={() => applyAllSettings(active)}>Copy All Settings</button></Tip>
                      {generationDetailEntries(active).length ? (
                        <details className="settings-disclosure" open={showGenerationSettings} onToggle={(event) => setShowGenerationSettings(event.currentTarget.open)}>
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
                  </aside>
                ) : null}
                <div data-open-trigger className={cn("viewer-dock", showDetails && "with-side")}>
                  <Tip content="Zoom out (-)"><button className="icon-button" aria-label="Zoom out" onClick={() => zoomViewer(viewerZoom - 0.25)} disabled={viewerZoom <= 0.5}><ZoomOut size={15} /></button></Tip>
                  <Tip content="Reset zoom (0)"><button className="text-button viewer-zoom" onClick={resetViewer}>{viewerZoom > 1 ? <RotateCcw size={13} /> : null} {Math.round(viewerZoom * 100)}%</button></Tip>
                  <Tip content="Zoom in (+)"><button className="icon-button" aria-label="Zoom in" onClick={() => zoomViewer(viewerZoom + 0.25)} disabled={viewerZoom >= 6}><ZoomIn size={15} /></button></Tip>
                  <span className="viewer-divider" />
                  <Tip content={active.url ? active.type === "image" ? "Copy image" : "Copy output link" : "Copy generation details"}><button className="icon-button" aria-label={active.url ? active.type === "image" ? "Copy image" : "Copy output link" : "Copy generation details"} onClick={() => copyImageAndToast(active)}><Copy size={15} /></button></Tip>
                  {active.url ? <Tip content="Download file"><a className="icon-button" aria-label="Download file" href={active.url} download><Download size={15} /></a></Tip> : null}
                  <Tip content="Delete (Del)"><button className="icon-button danger-tone" aria-label="Delete from gallery" onClick={() => deleteItem(active)}><Trash2 size={15} /></button></Tip>
                  <span className="viewer-divider" />
                  <Tip content={showDetails ? "Hide details" : "Show details"}><button className={cn("icon-button", showDetails && "active")} aria-label="Toggle details" aria-pressed={showDetails} onClick={() => setShowDetails((value) => !value)}><SlidersHorizontal size={15} /></button></Tip>
                  <Tip content="Close (Esc)"><button className="icon-button" aria-label="Close" onClick={() => setActive(null)}><X size={16} /></button></Tip>
                </div>
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
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [item.url]);
  if (!item.url || failed) return <div className="media-fallback"><span>{titleFromPrompt(item.prompt || item.filename) || "Output unavailable"}</span></div>;
  if (item.type === "video") {
    return (
      <video
        className={cn(!loaded && "media-loading")}
        src={item.url}
        controls={!muted}
        muted={muted}
        loop
        autoPlay={muted}
        preload="metadata"
        draggable={false}
        onLoadedData={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <img
      className={cn(!loaded && "media-loading")}
      src={item.url}
      alt={item.filename}
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      onDragStart={(e) => e.preventDefault()}
    />
  );
}

createRoot(document.getElementById("root")!).render(<App />);
