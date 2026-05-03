import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Aperture,
  BadgeCheck,
  ChevronDown,
  Clapperboard,
  Columns3,
  Copy,
  Download,
  Film,
  GalleryHorizontal,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Monitor,
  PanelsTopLeft,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Wand2,
  X
} from "lucide-react";
import "./styles.css";

type Mode = "image" | "video";
type Output = { url: string; filename: string; type: "image" | "video" };
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

const ratios = [
  { label: "1:1", w: 1024, h: 1024, icon: Square },
  { label: "Portrait", w: 832, h: 1248, icon: PanelsTopLeft },
  { label: "Wide", w: 1248, h: 832, icon: Columns3 },
  { label: "Video", w: 512, h: 288, icon: Film }
];

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
      {Icon ? <Icon size={15} /> : null}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={15} />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string }) {
  return (
    <div className="stat">
      <Icon size={15} />
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
  const [status, setStatus] = useState("Ready");
  const [isGenerating, setIsGenerating] = useState(false);
  const [gallery, setGallery] = useState<Output[]>([]);
  const [active, setActive] = useState<Output | null>(null);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data: Models) => {
        setModels(data);
        setModel(data.defaults.imageModel || "");
        setTextEncoder(data.defaults.imageTextEncoder || "");
        setVae(data.defaults.imageVae || "");
      })
      .catch((error) => setStatus(error.message));
  }, []);

  function changeMode(next: Mode) {
    setMode(next);
    if (!models) return;
    if (next === "image") {
      setModel(models.defaults.imageModel || "");
      setTextEncoder(models.defaults.imageTextEncoder || "");
      setVae(models.defaults.imageVae || "");
      setWidth(1024);
      setHeight(1024);
      setSteps(8);
      setCfg(1);
      setSampler("euler_ancestral");
      setScheduler("beta");
    } else {
      setModel(models.defaults.videoModel || "");
      setTextEncoder(models.defaults.videoTextEncoder || "");
      setVae(models.defaults.videoVae || "");
      setWidth(512);
      setHeight(288);
      setSteps(12);
      setCfg(5);
      setCount(1);
      setSampler("uni_pc");
      setScheduler("simple");
    }
  }

  const modelOptions = useMemo(() => {
    if (!models) return [];
    return mode === "image" ? models.imageModels : models.videoModels;
  }, [mode, models]);

  async function generate() {
    if (isGenerating) return;
    setIsGenerating(true);
    setStatus(mode === "image" ? `Generating ${count} image${count === 1 ? "" : "s"}...` : "Generating video...");
    try {
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
          fps
        })
      });
      const { jobId } = await response.json();
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 1600));
        const job: Job = await fetch(`/api/jobs/${jobId}`).then((res) => res.json());
        if (job.status === "done") {
          setStatus(`${job.outputs.length} output${job.outputs.length === 1 ? "" : "s"} added`);
          setGallery((current) => [...job.outputs, ...current]);
          setActive(job.outputs[0] || null);
          return;
        }
        if (job.status === "error") {
          setStatus(job.error || "Generation failed");
          return;
        }
        setStatus(job.status === "queued" ? "Queued" : mode === "image" ? "Rendering images" : "Rendering video");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="left-panel">
        <header className="brand">
          <div className="mark"><Aperture size={18} /></div>
          <div>
            <h1>J AI Studio</h1>
            <p>Local Comfy, no graph work.</p>
          </div>
        </header>

        <div className="mode-tabs" role="tablist" aria-label="Generation mode">
          <button className={cn(mode === "image" && "active")} onClick={() => changeMode("image")}><ImageIcon size={16} /> Image stills</button>
          <button className={cn(mode === "video" && "active")} onClick={() => changeMode("video")}><Clapperboard size={16} /> Video clip</button>
        </div>

        <div className={cn("mode-summary", mode === "video" && "video")}>
          {mode === "image" ? <ImageIcon size={16} /> : <Clapperboard size={16} />}
          <div>
            <strong>{mode === "image" ? "Image mode" : "Video mode"}</strong>
            <span>{mode === "image" ? "Creates one batch of still images from the prompt." : "Creates one motion clip; image batching is turned off."}</span>
          </div>
        </div>

        <section className="panel">
          <Field label="Model">
            <Select value={model} onChange={setModel} options={modelOptions} icon={Sparkles} />
          </Field>
          <Field label="Prompt">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </Field>
          <Field label="Negative">
            <textarea className="short" value={negative} onChange={(event) => setNegative(event.target.value)} />
          </Field>
        </section>

        <section className="panel">
          <div className="section-title"><Maximize2 size={15} /> Aspect</div>
          <div className="ratio-grid">
            {ratios.map((ratio) => {
              const Icon = ratio.icon;
              const selected = width === ratio.w && height === ratio.h;
              return (
                <button key={ratio.label} className={cn("ratio", selected && "selected")} onClick={() => { setWidth(ratio.w); setHeight(ratio.h); }}>
                  <Icon size={17} />
                  <span>{ratio.label}</span>
                  <em>{ratio.w}x{ratio.h}</em>
                </button>
              );
            })}
          </div>
          <div className="split">
            <Field label="Width"><input type="number" value={width} step={mode === "video" ? 32 : 64} onChange={(event) => setWidth(Number(event.target.value))} /></Field>
            <Field label="Height"><input type="number" value={height} step={mode === "video" ? 32 : 64} onChange={(event) => setHeight(Number(event.target.value))} /></Field>
          </div>
        </section>

        <section className="panel">
          <div className="section-title">{mode === "image" ? <ImageIcon size={15} /> : <Film size={15} />} Output</div>
          {mode === "image" ? (
            <div className="split">
              <Field label="Images at once">
                <input type="number" min={1} max={8} value={count} onChange={(event) => setCount(Math.max(1, Math.min(8, Number(event.target.value))))} />
              </Field>
              <Field label="Seed">
                <input value={seed} placeholder="Random" onChange={(event) => setSeed(event.target.value)} />
              </Field>
            </div>
          ) : (
            <div className="split">
              <Field label="Frames"><input type="number" min={5} value={frames} step={4} onChange={(event) => setFrames(Number(event.target.value))} /></Field>
              <Field label="FPS"><input type="number" min={1} value={fps} onChange={(event) => setFps(Number(event.target.value))} /></Field>
            </div>
          )}
        </section>

        <section className="panel">
          <button className="advanced-toggle" onClick={() => setAdvanced((value) => !value)}>
            <SlidersHorizontal size={15} /> Advanced <ChevronDown size={15} className={cn(advanced && "flip")} />
          </button>
          {advanced ? (
            <div className="advanced-grid">
              <Field label="Text encoder"><Select value={textEncoder} onChange={setTextEncoder} options={models?.textEncoders || []} /></Field>
              <Field label="VAE"><Select value={vae} onChange={setVae} options={models?.vaes || []} /></Field>
              <Field label="Steps"><input type="number" value={steps} onChange={(event) => setSteps(Number(event.target.value))} /></Field>
              <Field label="CFG"><input type="number" value={cfg} step="0.1" onChange={(event) => setCfg(Number(event.target.value))} /></Field>
              <Field label="Sampler"><Select value={sampler} onChange={setSampler} options={models?.samplers?.length ? models.samplers : fallbackSamplers} /></Field>
              <Field label="Scheduler"><Select value={scheduler} onChange={setScheduler} options={models?.schedulers?.length ? models.schedulers : fallbackSchedulers} /></Field>
            </div>
          ) : null}
        </section>

        <button className="generate" onClick={generate} disabled={!model || !textEncoder || !vae || isGenerating}>
          {isGenerating ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
          {mode === "image" ? `Generate ${count} image${count === 1 ? "" : "s"}` : "Generate video clip"}
        </button>

        <div className="status-row">
          <BadgeCheck size={15} />
          <span>{status}</span>
        </div>
      </aside>

      <main className="workspace">
        <div className="topbar">
          <Stat icon={Monitor} label="Backend" value="ComfyUI" />
          <Stat icon={mode === "image" ? ImageIcon : Clapperboard} label="Mode" value={mode === "image" ? `${count} image${count === 1 ? "" : "s"}` : `${frames} frames`} />
          <Stat icon={GalleryHorizontal} label="Gallery" value={`${gallery.length} items`} />
          <button className="icon-button" title="Refresh models" onClick={() => location.reload()}><RefreshCw size={16} /></button>
        </div>
        <section className="hero-preview">
          {active ? <Media item={active} /> : (
            <div className="empty">
              <Sparkles size={26} />
              <h2>Prompt on the left. Results land here.</h2>
              <p>Image is the default. Video is optional and only runs from the Video tab.</p>
            </div>
          )}
        </section>
        <section className="gallery">
          {gallery.map((item) => (
            <button key={item.url} className="tile" onClick={() => setActive(item)}>
              <Media item={item} muted />
              <span>{item.type}</span>
            </button>
          ))}
        </section>
      </main>

      {active ? (
        <div className="viewer" onClick={() => setActive(null)}>
          <div className="viewer-bar" onClick={(event) => event.stopPropagation()}>
            <button className="icon-button" title="Copy output link" onClick={() => navigator.clipboard.writeText(active.url)}><Copy size={16} /></button>
            <a className="icon-button" href={active.url} download><Download size={16} /></a>
            <button className="icon-button" onClick={() => setActive(null)}><X size={16} /></button>
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
