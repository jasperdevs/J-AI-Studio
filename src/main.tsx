import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import {
  Aperture,
  ChevronDown,
  Clapperboard,
  Copy,
  Download,
  GalleryHorizontal,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Monitor,
  Power,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X
} from "lucide-react";
import "./styles.css";

type Mode = "image" | "video";
type Output = { url: string; filename: string; type: "image" | "video" };
type GalleryItem = Output & { id: string; status: "done" | "pending" | "error"; prompt?: string };
type Job = { status: string; outputs: Output[]; error?: string };
type Models = {
  imageModels: string[];
  videoModels: string[];
  textEncoders: string[];
  vaes: string[];
  samplers: string[];
  schedulers: string[];
  defaults: Record<string, string>;
  capabilities: Record<string, boolean>;
};

const aspectPresets = {
  image: [
    { label: "Square", value: "1024x1024", w: 1024, h: 1024 },
    { label: "Portrait", value: "832x1248", w: 832, h: 1248 },
    { label: "Landscape", value: "1248x832", w: 1248, h: 832 },
    { label: "Small test", value: "512x512", w: 512, h: 512 }
  ],
  video: [
    { label: "Wide", value: "512x288", w: 512, h: 288 },
    { label: "Portrait", value: "288x512", w: 288, h: 512 },
    { label: "Square", value: "384x384", w: 384, h: 384 },
    { label: "Small test", value: "320x192", w: 320, h: 192 }
  ]
};

const fallbackSamplers = ["euler_ancestral", "euler", "uni_pc", "dpmpp_2m", "dpmpp_sde"];
const fallbackSchedulers = ["beta", "simple", "normal", "karras", "sgm_uniform"];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options, icon: Icon }: { value: string; onChange: (value: string) => void; options: string[]; icon?: React.ComponentType<{ size?: number }> }) {
  return (
    <div className="select">
      {Icon ? <Icon size={14} /> : null}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string }) {
  return (
    <div className="stat">
      <Icon size={14} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function App() {
  const [mode, setMode] = useState<Mode>("image");
  const [models, setModels] = useState<Models | null>(null);
  const [prompt, setPrompt] = useState("anime portrait, silver hair, golden eyes, clean linework, soft warm lighting");
  const [negative, setNegative] = useState("low quality, blurry, bad anatomy, text, watermark");
  const [model, setModel] = useState("");
  const [textEncoder, setTextEncoder] = useState("");
  const [vae, setVae] = useState("");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(8);
  const [cfg, setCfg] = useState(1);
  const [seed, setSeed] = useState("");
  const [count, setCount] = useState(1);
  const [frames, setFrames] = useState(33);
  const [fps, setFps] = useState(16);
  const [sampler, setSampler] = useState("euler_ancestral");
  const [scheduler, setScheduler] = useState("beta");
  const [advanced, setAdvanced] = useState(false);
  const [settings, setSettings] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [active, setActive] = useState<GalleryItem | null>(null);
  const [referenceImage, setReferenceImage] = useState("");
  const [referenceName, setReferenceName] = useState("");

  useEffect(() => {
    refreshModels();
    fetch("/api/gallery")
      .then((res) => res.json())
      .then((data: { outputs: Output[] }) => {
        setGallery(data.outputs.map((item) => ({ ...item, id: item.url, status: "done" as const })));
      })
      .catch(() => null);
  }, []);

  function refreshModels() {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data: Models) => {
        setModels(data);
        setModel((current) => current || data.defaults.imageModel || "");
        setTextEncoder((current) => current || data.defaults.imageTextEncoder || "");
        setVae((current) => current || data.defaults.imageVae || "");
      })
      .catch((error) => setStatus(error.message));
  }

  function changeMode(next: Mode) {
    setMode(next);
    if (!models) return;
    if (next === "image") {
      setModel(models.defaults.imageModel || "");
      setTextEncoder(models.defaults.imageTextEncoder || "");
      setVae(models.defaults.imageVae || "");
      applyAspect("1024x1024", next);
      setSteps(8);
      setCfg(1);
      setSampler("euler_ancestral");
      setScheduler("beta");
    } else {
      setModel(models.defaults.videoModel || "");
      setTextEncoder(models.defaults.videoTextEncoder || "");
      setVae(models.defaults.videoVae || "");
      applyAspect("512x288", next);
      setSteps(12);
      setCfg(5);
      setSampler("uni_pc");
      setScheduler("simple");
    }
  }

  function applyAspect(value: string, targetMode = mode) {
    const preset = aspectPresets[targetMode].find((item) => item.value === value);
    if (!preset) return;
    setWidth(preset.w);
    setHeight(preset.h);
  }

  const modelOptions = useMemo(() => {
    if (!models) return [];
    return mode === "image" ? models.imageModels : models.videoModels;
  }, [mode, models]);

  const aspectValue = `${width}x${height}`;
  const canUseReference = mode === "image" && Boolean(models?.capabilities.referenceImage);
  const runningCount = gallery.filter((item) => item.status === "pending").length;

  async function readReference(file: File | undefined) {
    if (!file) return;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setReferenceImage(data);
    setReferenceName(file.name);
  }

  async function generate() {
    const pendingCount = mode === "image" ? count : 1;
    const ids: string[] = Array.from({ length: pendingCount }, () => crypto.randomUUID());
    const pending = ids.map((id, index) => ({
      id,
      url: "",
      filename: mode === "image" ? `Image ${index + 1}` : "Video clip",
      type: mode,
      status: "pending" as const,
      prompt
    }));

    setGallery((current) => [...pending, ...current]);
    setStatus(mode === "image" ? `Queued ${pendingCount} image${pendingCount === 1 ? "" : "s"}` : "Queued video");

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: mode,
        prompt,
        negative,
        model,
        textEncoder,
        vae,
        width,
        height,
        steps,
        cfg,
        sampler,
        scheduler,
        seed,
        count,
        frames,
        fps,
        referenceImage: canUseReference ? referenceImage : ""
      })
    });
    const { jobId } = await response.json();

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1600));
      const job: Job = await fetch(`/api/jobs/${jobId}`).then((res) => res.json());
      if (job.status === "done") {
        const completed = job.outputs.map((item, index) => ({
          ...item,
          id: item.url,
          status: "done" as const,
          prompt: pending[index]?.prompt || prompt
        }));
        setGallery((current) => [...completed, ...current.filter((item) => !ids.includes(item.id))]);
        setActive((current) => current || completed[0] || null);
        setStatus(`${job.outputs.length} output${job.outputs.length === 1 ? "" : "s"} added`);
        return;
      }
      if (job.status === "error") {
        setGallery((current) => current.map((item) => (ids.includes(item.id) ? { ...item, status: "error" as const, filename: "Failed" } : item)));
        setStatus(job.error || "Generation failed");
        return;
      }
      setStatus(job.status === "queued" ? "Queued" : "Rendering on the right");
    }
  }

  async function shutdown() {
    setStatus("Closing localhost...");
    await fetch("/api/shutdown", { method: "POST" }).catch(() => null);
  }

  return (
    <div className="app-shell">
      <aside className="left-panel">
        <header className="brand">
          <div className="mark"><Aperture size={17} /></div>
          <div>
            <h1>J AI Studio</h1>
            <p>Local Comfy, simple prompts.</p>
          </div>
        </header>

        <div className="mode-tabs" role="tablist" aria-label="Generation mode">
          <button className={cn(mode === "image" && "active")} onClick={() => changeMode("image")}><ImageIcon size={15} /> Image</button>
          <button className={cn(mode === "video" && "active")} onClick={() => changeMode("video")}><Clapperboard size={15} /> Video</button>
        </div>

        <section className="panel">
          <Field label={mode === "image" ? "Image model" : "Video model"}>
            <Select value={model} onChange={setModel} options={modelOptions} icon={Sparkles} />
          </Field>
          <Field label="Prompt">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </Field>
          <Field label="Negative prompt">
            <textarea className="short" value={negative} onChange={(event) => setNegative(event.target.value)} />
          </Field>
        </section>

        <section className="panel compact-panel">
          <div className="section-title">{mode === "image" ? <ImageIcon size={14} /> : <Clapperboard size={14} />} Output</div>
          <div className="split">
            <Field label="Aspect">
              <Select value={aspectPresets[mode].some((item) => item.value === aspectValue) ? aspectValue : "custom"} onChange={(value) => applyAspect(value)} options={[...aspectPresets[mode].map((item) => item.value), "custom"]} />
            </Field>
            {mode === "image" ? (
              <Field label="Variations">
                <input type="number" min={1} max={8} value={count} onChange={(event) => setCount(Math.max(1, Math.min(8, Number(event.target.value))))} />
              </Field>
            ) : (
              <Field label="Frames">
                <input type="number" min={5} value={frames} step={4} onChange={(event) => setFrames(Number(event.target.value))} />
              </Field>
            )}
          </div>
          <div className="split">
            <Field label="Width"><input type="number" value={width} step={mode === "video" ? 32 : 64} onChange={(event) => setWidth(Number(event.target.value))} /></Field>
            <Field label="Height"><input type="number" value={height} step={mode === "video" ? 32 : 64} onChange={(event) => setHeight(Number(event.target.value))} /></Field>
          </div>
          {mode === "video" ? <Field label="FPS"><input type="number" min={1} value={fps} onChange={(event) => setFps(Number(event.target.value))} /></Field> : null}
        </section>

        {canUseReference ? (
          <section className="panel compact-panel">
            <div className="section-title"><ImagePlus size={14} /> Reference image</div>
            <label className="file-pick">
              <input type="file" accept="image/*" onChange={(event) => readReference(event.target.files?.[0])} />
              <span>{referenceName || "Choose image"}</span>
              {referenceName ? <button type="button" onClick={(event) => { event.preventDefault(); setReferenceImage(""); setReferenceName(""); }}>Clear</button> : null}
            </label>
          </section>
        ) : null}

        <section className="panel compact-panel">
          <button className="advanced-toggle" onClick={() => setAdvanced((value) => !value)}>
            <SlidersHorizontal size={14} /> Advanced <ChevronDown size={14} className={cn(advanced && "flip")} />
          </button>
          {advanced ? (
            <div className="advanced-grid">
              <Field label="Text encoder"><Select value={textEncoder} onChange={setTextEncoder} options={models?.textEncoders || []} /></Field>
              <Field label="VAE"><Select value={vae} onChange={setVae} options={models?.vaes || []} /></Field>
              <Field label="Steps"><input type="number" value={steps} onChange={(event) => setSteps(Number(event.target.value))} /></Field>
              <Field label="CFG"><input type="number" value={cfg} step="0.1" onChange={(event) => setCfg(Number(event.target.value))} /></Field>
              <Field label="Sampler"><Select value={sampler} onChange={setSampler} options={models?.samplers?.length ? models.samplers : fallbackSamplers} /></Field>
              <Field label="Scheduler"><Select value={scheduler} onChange={setScheduler} options={models?.schedulers?.length ? models.schedulers : fallbackSchedulers} /></Field>
              <Field label="Seed"><input value={seed} placeholder="Random" onChange={(event) => setSeed(event.target.value)} /></Field>
            </div>
          ) : null}
        </section>

        <button className="generate" onClick={generate} disabled={!model || !textEncoder || !vae}>
          <Wand2 size={16} />
          {mode === "image" ? `Generate ${count}` : "Generate video"}
        </button>

        <div className="status-row">
          <span>{status}</span>
        </div>
      </aside>

      <main className="workspace">
        <div className="topbar">
          <Stat icon={Monitor} label="Backend" value="ComfyUI" />
          <Stat icon={mode === "image" ? ImageIcon : Clapperboard} label="Mode" value={mode === "image" ? `${count} variation${count === 1 ? "" : "s"}` : `${frames} frames`} />
          <Stat icon={GalleryHorizontal} label="Running" value={`${runningCount}`} />
          <button className="icon-button" title="Refresh models" onClick={refreshModels}><RefreshCw size={15} /></button>
          <button className="icon-button" title="Settings" onClick={() => setSettings(true)}><Settings2 size={15} /></button>
        </div>

        <section className="gallery">
          {gallery.length ? gallery.map((item) => (
            <button key={item.id} className={cn("tile", item.status)} onClick={() => item.status === "done" && setActive(item)}>
              {item.status === "pending" ? <div className="generating"><Loader2 size={18} className="spin" /><span>Generating</span></div> : <Media item={item} muted />}
              <span>{item.status === "done" ? item.type : item.filename}</span>
            </button>
          )) : (
            <div className="empty">
              <Sparkles size={22} />
              <h2>No outputs yet</h2>
              <p>Start a batch and each pending result appears here while Comfy renders.</p>
            </div>
          )}
        </section>
      </main>

      {settings ? (
        <div className="viewer" onClick={() => setSettings(false)}>
          <div className="settings-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Settings</h2>
              <button className="icon-button" onClick={() => setSettings(false)}><X size={15} /></button>
            </header>
            <p>J AI Studio is served locally on this computer. Closing localhost stops this app server; ComfyUI can stay running for the next launch.</p>
            <button className="danger-button" onClick={shutdown}><Power size={15} /> Close localhost</button>
          </div>
        </div>
      ) : null}

      {active ? (
        <div className="viewer" onClick={() => setActive(null)}>
          <div className="viewer-bar" onClick={(event) => event.stopPropagation()}>
            <button className="icon-button" title="Copy output link" onClick={() => navigator.clipboard.writeText(active.url)}><Copy size={15} /></button>
            <a className="icon-button" href={active.url} download><Download size={15} /></a>
            <button className="icon-button" onClick={() => setActive(null)}><X size={15} /></button>
          </div>
          <div className="viewer-media" onClick={(event) => event.stopPropagation()}><Media item={active} /></div>
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
