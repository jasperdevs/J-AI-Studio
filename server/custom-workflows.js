import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { dataDir } from './gallery-store.js';
import { root } from './comfy.js';

export const bundledWorkflowsDir = path.join(root, "workflows");
export const userWorkflowsDir = path.join(dataDir, "workflows");

function safeId(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `workflow-${crypto.randomUUID()}`;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function graphFromJson(raw) {
  if (raw?.graph && typeof raw.graph === "object") return raw.graph;
  const copy = { ...raw };
  delete copy.jAiStudio;
  delete copy.j_ai_studio;
  delete copy.metadata;
  return copy;
}

function metadataFromJson(raw, file) {
  const meta = raw?.jAiStudio || raw?.j_ai_studio || {};
  const id = safeId(meta.id || path.basename(file || "", path.extname(file || "")));
  const graph = graphFromJson(raw);
  const controls = meta.controls || {};
  const graphDefault = (key) => {
    const mapping = controls[key];
    return mapping?.node && mapping?.input ? graph?.[mapping.node]?.inputs?.[mapping.input] : undefined;
  };
  const classes = [...new Set(Object.values(graph || {}).map((node) => node?.class_type).filter(Boolean))];
  return {
    id,
    profileId: `custom:${id}`,
    name: meta.name || id,
    description: meta.description || "Custom ComfyUI workflow",
    kind: meta.kind === "video" ? "video" : "image",
    family: meta.family || "custom",
    graph,
    controls,
    requiredNodes: Array.isArray(meta.requiredNodes) && meta.requiredNodes.length ? meta.requiredNodes : classes,
    defaults: {
      model: graphDefault("model") || "",
      textEncoder: graphDefault("textEncoder") || "",
      vae: graphDefault("vae") || "",
      clipType: graphDefault("clipType") || "",
      weightDtype: graphDefault("weightDtype") || "",
      sampler: graphDefault("sampler") || "",
      scheduler: graphDefault("scheduler") || "",
      width: graphDefault("width") || undefined,
      height: graphDefault("height") || undefined,
      steps: graphDefault("steps") || undefined,
      cfg: graphDefault("cfg") || undefined,
      denoise: graphDefault("denoise") || undefined,
      count: graphDefault("count") || undefined,
      frames: graphDefault("frames") || undefined,
      fps: graphDefault("fps") || undefined,
      ...(meta.defaults || {})
    },
    aspectRatios: meta.aspectRatios || meta.aspects || [],
    capabilities: {
      negativePrompt: Boolean(controls.negative),
      variations: Boolean(controls.count),
      frames: Boolean(controls.frames),
      fps: Boolean(controls.fps),
      startImage: Boolean(controls.startImage),
      denoise: Boolean(controls.denoise),
      textEncoder: Boolean(controls.textEncoder),
      vae: Boolean(controls.vae),
      clipType: Boolean(controls.clipType),
      weightDtype: Boolean(controls.weightDtype),
      ...(meta.capabilities || {})
    },
    path: file || ""
  };
}

function validateGraph(graph) {
  if (!graph || typeof graph !== "object" || !Object.keys(graph).length) throw new Error("Workflow JSON does not contain a ComfyUI API graph.");
  for (const [id, node] of Object.entries(graph)) {
    if (!node?.class_type) throw new Error(`Workflow node ${id} is missing class_type.`);
    for (const value of Object.values(node.inputs || {})) {
      if (Array.isArray(value) && typeof value[0] === "string" && !graph[value[0]]) {
        throw new Error(`Workflow node ${id} references missing node ${value[0]}.`);
      }
    }
  }
}

export function loadCustomWorkflows() {
  const dirs = [bundledWorkflowsDir, userWorkflowsDir];
  const items = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      const fullPath = path.join(dir, file);
      const raw = readJson(fullPath);
      if (!raw) continue;
      const workflow = metadataFromJson(raw, fullPath);
      try {
        validateGraph(workflow.graph);
      } catch {
        continue;
      }
      if (workflow.graph && Object.keys(workflow.graph).length) items.push(workflow);
    }
  }
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function getCustomWorkflow(profileId) {
  return loadCustomWorkflows().find((workflow) => workflow.profileId === profileId || workflow.id === profileId || `custom:${workflow.id}` === profileId) || null;
}

export function saveCustomWorkflow(raw) {
  const workflow = metadataFromJson(raw);
  validateGraph(workflow.graph);
  fs.mkdirSync(userWorkflowsDir, { recursive: true });
  const file = path.join(userWorkflowsDir, `${workflow.id}.json`);
  fs.writeFileSync(file, JSON.stringify(raw, null, 2));
  return { ...workflow, path: file };
}
