import path from "node:path";
import { fileURLToPath } from "node:url";

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(__dirname, "..");
export const comfyUrl = process.env.COMFY_URL || "http://127.0.0.1:8188";
export const host = process.env.HOST || "127.0.0.1";
export const port = Number(process.env.PORT || 8787);
export const comfyOutputDir = process.env.COMFY_OUTPUT_DIR || "";
export const localHosts = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export async function comfy(pathname, options = {}) {
  const response = await fetch(`${comfyUrl}${pathname}`, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Comfy ${response.status}: ${text || response.statusText}`);
  }
  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response.arrayBuffer();
}

export function optionsFor(info, node, key) {
  const value = info?.[node]?.input?.required?.[key]?.[0];
  if (Array.isArray(value)) return value;
  if (value?.options) return value.options;
  return [];
}
export function nodeRange(info, node, key, fallback = {}) {
  const meta = info?.[node]?.input?.required?.[key]?.[1];
  return typeof meta === "object" && !Array.isArray(meta) ? { ...fallback, ...meta } : fallback;
}

export function textRange(info, node, key) {
  const meta = info?.[node]?.input?.required?.[key]?.[1];
  if (typeof meta !== "object" || Array.isArray(meta)) return {};
  const tooltip = String(meta.tooltip || "");
  const match = tooltip.match(/maximum(?: length)? (?:is |of )?([0-9,]+)\s*(?:characters|chars)?/i);
  const parsedMax = match ? Number(match[1].replace(/,/g, "")) : undefined;
  return {
    ...meta,
    max: Number(meta.max || meta.maxLength || meta.max_length || parsedMax || 0) || undefined
  };
}
