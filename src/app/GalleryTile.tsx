import React from 'react';
import { Copy, Download, Trash2 } from 'lucide-react';
import { cn } from './format';
import { Media, Tip } from './components';
import type { GalleryItem } from './types';

type GalleryTileProps = {
  item: GalleryItem;
  width: number;
  height: number;
  now: number;
  formatElapsed: (value: number) => string;
  titleFromPrompt: (value?: string) => string;
  openItem: (item: GalleryItem) => void;
  cancelJob: (jobId?: string) => void;
  copyImageAndToast: (item: GalleryItem) => void;
  deleteItem: (item: GalleryItem) => void;
};

export function GalleryTile({ cancelJob, copyImageAndToast, deleteItem, formatElapsed, height, item, now, openItem, titleFromPrompt, width }: GalleryTileProps) {
  const ratio = item.progress?.max ? Math.min(1, Math.max(0, item.progress.value / item.progress.max)) : 0;
  const indeterminate = !item.progress?.max;
  return (
    <button className={cn("tile", item.status)} style={{ width, height } as React.CSSProperties} onClick={() => item.status !== "pending" && openItem(item)}>
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
                <span className="generate-step-label is-queued">{item.progress?.node === "running" ? "Rendering" : "Queued"}</span>
              )}
            </span>
            <span className="generate-elapsed">{formatElapsed(now - Date.parse(item.createdAt || new Date().toISOString()))}</span>
          </div>
          <div className={cn("generate-bar", indeterminate && "is-indeterminate")}>
            <div className="generate-bar-fill" />
          </div>
        </div>
      ) : item.status === "done" ? <Media item={item} muted /> : <div className="generating stopped"><span>{titleFromPrompt(item.filename || "Failed")}</span></div>}
      <span className="tile-caption">
        <strong>{titleFromPrompt(item.prompt || item.filename)}</strong>
        <em>{item.status === "pending" ? formatElapsed(now - Date.parse(item.createdAt || new Date().toISOString())) : item.durationMs ? formatElapsed(item.durationMs) : item.outputName || item.type}</em>
      </span>
      {item.status === "pending" ? <Tip content="Cancel generation"><span className="tile-action" onClick={(event) => { event.stopPropagation(); cancelJob(item.jobId); }}>Cancel</span></Tip> : null}
      {item.status !== "pending" ? (
        <span className="tile-hover-actions">
          {item.url ? <Tip content="Download" side="left"><a className="tile-icon" aria-label="Download" href={item.url} download onClick={(event) => event.stopPropagation()}><Download size={13} /></a></Tip> : null}
          {item.status === "done" ? <Tip content="Copy" side="left"><span className="tile-icon" role="button" aria-label="Copy" onClick={(event) => { event.stopPropagation(); copyImageAndToast(item); }}><Copy size={14} /></span></Tip> : null}
          <Tip content="Delete from gallery" side="left"><span className="tile-delete" role="button" aria-label="Delete from gallery" onClick={(event) => { event.stopPropagation(); deleteItem(item); }}><Trash2 size={14} /></span></Tip>
        </span>
      ) : null}
    </button>
  );
}
