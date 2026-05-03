import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { Select as FluidSelect, SelectContent as FluidSelectContent, SelectItem as FluidSelectItem, SelectTrigger as FluidSelectTrigger } from '@/components/ui/select';
import { Tooltip as FluidTooltip } from '@/components/ui/tooltip';
import type { AspectPreset, Output, Profile, Provider } from './types';
import { aspectIconStyle, cn, titleFromPrompt } from './format';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Media({ item, muted = false }: { item: Output; muted?: boolean }) {
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
      onDragStart={(event) => event.preventDefault()}
    />
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={cn("skeleton", className)} aria-hidden="true" />;
}

export function GallerySkeleton({ columns }: { columns: number }) {
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

export function StudioSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<string | { label: string; value: string }> }) {
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

export function Tip({ content, side = "bottom", children }: { content: React.ReactNode; side?: "top" | "right" | "bottom" | "left"; children: React.ReactElement }) {
  return (
    <FluidTooltip content={content} side={side} sideOffset={8} delayDuration={120}>
      {children}
    </FluidTooltip>
  );
}

export function NumberPicker({
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

export function AspectPicker({ value, options, onChange, currentSize }: { value: string; options: AspectPreset[]; onChange: (value: string) => void; currentSize: string }) {
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
          <span>{selected ? selected.label : "Free"}</span>
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
          <Tip content="Free aspect, no fixed ratio"><button
              type="button"
              className={cn("aspect-option", value === "free" && "active")}
              onClick={() => {
                onChange("free");
                setOpen(false);
              }}
            >
              <span className="aspect-shape custom" />
              <span>Free</span>
              <em>{currentSize}</em>
            </button></Tip>
        </div>
      ) : null}
    </div>
  );
}

export function familyLabel(profile: Profile | null) {
  if (!profile) return "";
  if (profile.family === "z-image") return "Z image";
  if (profile.family === "checkpoint") return "Checkpoint";
  if (profile.family === "wan") return "Wan video";
  return profile.family;
}

export function providerInitials(name = "AI") {
  return name
    .split(/\s|-/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AI";
}

export function ProviderLogo({ provider, compact = false }: { provider?: Provider; compact?: boolean }) {
  const label = provider?.name || "Local model";
  return (
    <span className={cn("provider-logo", compact && "is-compact")} aria-label={label} title={label}>
      {provider?.logoUrl ? <img src={provider.logoUrl} alt="" loading="lazy" /> : <span>{providerInitials(label)}</span>}
    </span>
  );
}

export function ModelPicker({ value, profiles, onChange, compact = false }: { value: string; profiles: Profile[]; onChange: (value: string) => void; compact?: boolean }) {
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
          <ProviderLogo provider={selected?.provider} compact={compact} />
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
                <ProviderLogo provider={profile.provider} />
                <span className="model-copy">
                  <strong>{profile.displayName || profile.label}</strong>
                  <em>{profile.provider?.name || profile.description || familyLabel(profile)}</em>
                </span>
                <span className="model-badge">{familyLabel(profile)}</span>
              </button></Tip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
