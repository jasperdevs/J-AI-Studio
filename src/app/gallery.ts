import { useEffect, useState } from 'react';
import type React from 'react';
import type { GalleryItem } from './types';

export type GalleryPhoto = {
  src: string;
  width: number;
  height: number;
  key: string;
  item: GalleryItem;
};

export function dedupeGalleryItems(items: GalleryItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url || item.id;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function galleryTime(item: GalleryItem) {
  const parsed = Date.parse(item.createdAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortGalleryItems(items: GalleryItem[]) {
  return [...items].sort((a, b) => {
    const timeDelta = galleryTime(b) - galleryTime(a);
    if (timeDelta) return timeDelta;
    const aIndex = Number(a.index ?? 0);
    const bIndex = Number(b.index ?? 0);
    if (a.jobId && b.jobId && a.jobId === b.jobId && aIndex !== bIndex) return aIndex - bIndex;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

export function galleryColumnTarget() {
  if (typeof window === "undefined") return 6;
  if (window.matchMedia("(max-width: 620px)").matches) return 3;
  if (window.matchMedia("(max-width: 980px)").matches) return 4;
  return 6;
}

export function useGalleryColumnCount() {
  const [count, setCount] = useState(galleryColumnTarget);
  useEffect(() => {
    const update = () => setCount(galleryColumnTarget());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return count;
}

export function galleryPhoto(item: GalleryItem): GalleryPhoto {
  const width = Math.max(1, Number(item.width || 1));
  const height = Math.max(1, Number(item.height || 1));
  return {
    src: item.url || item.preview || "/j-ai-logo.png",
    width,
    height,
    key: item.id,
    item
  };
}

export function touchDistance(touches: React.TouchList) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

export function touchCenter(touches: React.TouchList) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}
