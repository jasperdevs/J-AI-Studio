import type { GalleryItem, Preferences } from './types';
import { defaultPrefs } from './constants';
import { fullGenerationText } from './format';

export async function copyText(text: string) {
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

export async function copyImage(item: GalleryItem) {
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

export async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : response.statusText || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export function loadPrefs(): Preferences {
  try {
    const saved = localStorage.getItem("j-ai-studio-prefs");
    if (!saved) return { ...defaultPrefs };
    const parsed = JSON.parse(saved);
    return { ...defaultPrefs, ...parsed };
  } catch {
    return { ...defaultPrefs };
  }
}

export function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem("j-ai-studio-draft") || "{}");
  } catch {
    return {};
  }
}
