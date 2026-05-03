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
  Github,
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

import type { AspectPreset, GalleryItem, Health, Job, Mode, Models, Output, Paths, Preferences, Profile, TouchGesture } from './app/types';
import { defaultPrefs, fallbackAspectPresets, fallbackSamplers, fallbackSchedulers, galleryBatchSize, galleryInitialBatch, githubUrl } from './app/constants';
import { apiJson, copyImage, copyText, loadDraft, loadPrefs } from './app/api';
import { aspectIconStyle, characterMeta, clampText, cn, formatElapsed, formatGeneratedAt, fullGenerationText, generationDetailEntries, settingMax, textLength, titleFromPrompt } from './app/format';
import { dedupeGalleryItems, distributeGalleryColumns, galleryColumnTarget, sortGalleryItems, touchCenter, touchDistance, useGalleryColumnCount } from './app/gallery';
import { Field, NumberPicker, Skeleton, StudioSelect as Select, Tip } from './app/components';
import { StudioView } from './app/StudioView';
import { SidebarControls } from './app/SidebarControls';
import { useGenerationActions } from './app/useGenerationActions';
import { useViewerControls } from './app/useViewerControls';


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
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 620px)").matches : false
  );
  const [zenControls, setZenControls] = useState(Boolean(initialDraft.zenControls));
  const [showNegativePrompt, setShowNegativePrompt] = useState(Boolean(initialDraft.showNegativePrompt));
  const [zenGalleryOpen, setZenGalleryOpen] = useState(initialDraft.zenGalleryOpen !== false);
  const [zenSelectedId, setZenSelectedId] = useState(String(initialDraft.zenSelectedId || ""));
  const [status, setStatus] = useState("Ready");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [galleryLoaded, setGalleryLoaded] = useState(false);
  const [galleryRenderCount, setGalleryRenderCount] = useState(galleryInitialBatch);
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
  const galleryStageRef = useRef<HTMLElement | null>(null);
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
    const query = window.matchMedia("(max-width: 620px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
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
      if (active && showDetails && target.closest("[data-viewer-empty]")) setShowDetails(false);
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
    const viewerItems = visibleGallery.filter((item) => item.status === "pending" || item.status === "done" || item.status === "error");
    const currentIndex = viewerItems.findIndex((item) => item.id === activeItem.id);
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowRight" && currentIndex >= 0) {
        event.preventDefault();
        setViewerZoom(1);
        setViewerPan({ x: 0, y: 0 });
        setActive(viewerItems[(currentIndex + 1) % viewerItems.length]);
      }
      if (event.key === "ArrowLeft" && currentIndex >= 0) {
        event.preventDefault();
        setViewerZoom(1);
        setViewerPan({ x: 0, y: 0 });
        setActive(viewerItems[(currentIndex - 1 + viewerItems.length) % viewerItems.length]);
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
    const zenItems = visibleGallery.filter((item) => item.status === "pending" || item.status === "done" || item.status === "error");
    const currentIndex = Math.max(0, zenItems.findIndex((item) => item.id === zenSelectedId));
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowRight" && zenItems.length) {
        event.preventDefault();
        setZenSelectedId(zenItems[(currentIndex + 1) % zenItems.length].id);
      }
      if (event.key === "ArrowLeft" && zenItems.length) {
        event.preventDefault();
        setZenSelectedId(zenItems[(currentIndex - 1 + zenItems.length) % zenItems.length].id);
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
    if (value === "default") {
      const defaults = currentProfile?.defaults || {};
      setCustomSize(false);
      setWidth(Number(defaults.width || (targetMode === "video" ? 512 : 1024)));
      setHeight(Number(defaults.height || (targetMode === "video" ? 288 : 1024)));
      return;
    }
    if (value === "free" || value === "custom") {
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
  const promptRemaining = promptLimit ? Math.max(0, promptLimit - textLength(prompt)) : undefined;
  const profileOptions = currentProfile?.options || {};
  const aspectValue = `${width}x${height}`;
  const defaultAspectSize = `${Number(currentProfile?.defaults.width || (mode === "video" ? 512 : 1024))}x${Number(currentProfile?.defaults.height || (mode === "video" ? 288 : 1024))}`;
  const aspectPickerValue = aspectValue === defaultAspectSize ? "default" : customSize || !aspectOptions.some((item) => item.value === aspectValue) ? "free" : aspectValue;
  const visibleGallery = useMemo(() => sortGalleryItems(gallery.filter((item) => item.type === mode && item.status !== "canceled" && (prefs.showFailedItems || item.status !== "error"))), [gallery, mode, prefs.showFailedItems]);
  const renderedGallery = useMemo(() => visibleGallery.slice(0, galleryRenderCount), [visibleGallery, galleryRenderCount]);
  const galleryColumnCount = useGalleryColumnCount();
  const galleryColumns = useMemo(() => distributeGalleryColumns(renderedGallery, galleryColumnCount), [renderedGallery, galleryColumnCount]);
  const hasMoreGallery = renderedGallery.length < visibleGallery.length;
  const runningCount = visibleGallery.filter((item) => item.status === "pending").length;
  const doneGallery = visibleGallery.filter((item) => item.status === "done" || item.status === "error");
  const zenGallery = visibleGallery.filter((item) => item.status === "pending" || item.status === "done" || item.status === "error");
  const zenItem = zenGallery.find((item) => item.id === zenSelectedId) || zenGallery[0] || null;
  const zenDisplayItem = zenItem;
  const generateDisabled = !currentProfile || (currentProfile.capabilities.textEncoder && !textEncoder) || (currentProfile.capabilities.vae && !vae);

  useEffect(() => {
    setGalleryRenderCount(galleryInitialBatch);
    galleryStageRef.current?.scrollTo({ top: 0 });
  }, [mode]);

  useEffect(() => {
    setGalleryRenderCount((current) => Math.min(Math.max(galleryInitialBatch, current), Math.max(galleryInitialBatch, visibleGallery.length)));
  }, [visibleGallery.length]);

  function loadMoreGalleryItems() {
    setGalleryRenderCount((current) => Math.min(current + galleryBatchSize, visibleGallery.length));
  }

  function onGalleryScroll(event: React.UIEvent<HTMLElement>) {
    if (!hasMoreGallery) return;
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining < 900) loadMoreGalleryItems();
  }

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



  const generationActions = useGenerationActions({
    active, canUseStartImage, confirmAction, count, currentProfile, denoise, frames, fps, generateDisabled, generatePostingRef, height, loadGallery, mode, model, negative, prefs, prompt, sampler, scheduler, seed, setActive, setGallery, setStatus, setZenSelectedId, showToast, startImage, startImageName, steps, cfg, textEncoder, vae, clipType, weightDtype, width
  });
  const { generate, cancelJob, cancelQueue, clearGallery, clearFailedItems, resetAllSettings, clearAllCache, openOutputFolder, deleteItem } = generationActions;

  const viewerActions = useViewerControls({
    active, deleteItem, doneGallery: zenGallery, generate, generateDisabled, height, lastTapRef, mode, models, prefs, setActive, setCfg, setClipType, setCount, setDenoise, setFps, setFrames, setHeight, setIsDraggingViewer, setMode, setModel, setNegative, setPrompt, setSampler, setScheduler, setSeed, setShowDetails, setStartImage, setStartImageName, setTextEncoder, setVae, setViewerPan, setViewerZoom, setWeightDtype, setWidth, setZenSelectedId, showToast, touchGestureRef, viewerDragEndRef, viewerDragRef, viewerPan, viewerZoom, visibleGallery, width, zenItem, zenStripDragRef, zenStripRef
  });
  const { resetViewer, openItem, applyAllSettings, moveZen, moveViewer, goLatestZen, submitZenPrompt, startZenStripDrag, dragZenStrip, stopZenStripDrag, selectZenItem, zoomViewer, wheelViewer, clickViewer, startViewerDrag, dragViewer, stopViewerDrag, startViewerTouch, moveViewerTouch, endViewerTouch } = viewerActions;

  const sidebarControls = <SidebarControls view={{ canUseStartImage, cfg, cfgMeta, changeMode, clipType, confirmAction, currentProfile, customSize, denoise, denoiseMeta, fps, fpsMeta, frameMeta, frames, height, heightMeta, mode, models, profileOptions, readStartImage, sampler, scheduler, seed, setCfg, setDenoise, setFps, setFrames, setHeight, setSampler, setScheduler, setSeed, setStartImage, setStartImageName, setTextEncoder, setVae, setWeightDtype, setWidth, startImageName, textEncoder, vae, weightDtype, width, widthMeta }} />;

  const view = { active, applyAllSettings, applyAspect, aspectOptions, aspectPickerValue, aspectValue, defaultAspectSize, canUseStartImage, cancelJob, cancelQueue, clearAllCache, clearFailedItems, clearGallery, clickViewer, copyAndToast, copyImageAndToast, count, countMeta, currentProfile, customSize, deleteItem, doneGallery, zenGallery, gallery, galleryColumnCount, galleryColumns, galleryLoaded, galleryStageRef, generate, goLatestZen, hasMoreGallery, health, height, heightMeta, isDraggingViewer, isMobile, loadMoreGalleryItems, mode, model, modelProfiles, models, moveViewer, moveViewerTouch, moveZen, negative, negativeLimit, now, onGalleryScroll, openItem, openOutputFolder, paths, prefs, prompt, promptLimit, refreshHealth, refreshModels, resetAllSettings, resetViewer, runningCount, setActive, setCount, setHeight, setNegative, setPrompt, setSettings, setShowDetails, setShowGenerationSettings, setShowNegativePrompt, setSteps, setWidth, setZenControls, setZenGalleryOpen, setZenMode, showDetails, showGenerationSettings, showNegativePrompt, sidebarControls, startViewerDrag, startViewerTouch, status, steps, stepsMeta, stopViewerDrag, submitZenPrompt, touchGestureRef, viewerDragEndRef, viewerDragRef, viewerPan, viewerZoom, wheelViewer, width, widthMeta, zenControls, zenDisplayItem, zenGalleryOpen, zenItem, zenPromptRef, zenSelectedId, zenStripDragRef, zenStripRef, dragViewer, dragZenStrip, endViewerTouch, selectZenItem, startZenStripDrag, stopZenStripDrag, characterMeta, formatElapsed, generationDetailEntries, titleFromPrompt , zoomViewer, clampText, promptRemaining, chooseModel, visibleGallery, settings, setPrefs };

  return <StudioView view={view} />;
}

createRoot(document.getElementById("root")!).render(<App />);
