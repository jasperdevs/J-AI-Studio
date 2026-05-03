// @ts-nocheck
import React from 'react';
import { fallbackSamplers, fallbackSchedulers } from './constants';
import { cn } from './format';
import { Field, NumberPicker, Skeleton, StudioSelect as Select, Tip } from './components';

export function SidebarControls({ view }: { view: any }) {
  const {
    canUseStartImage, cfg, cfgMeta, changeMode, clipType, currentProfile, customSize, denoise,
    denoiseMeta, fps, fpsMeta, frameMeta, frames, height, heightMeta, mode, models,
    profileOptions, readStartImage, sampler, scheduler, seed, setCfg, setDenoise, setFps,
    setFrames, setHeight, setSampler, setScheduler, setSeed, setStartImage, setStartImageName,
    setTextEncoder, setVae, setWeightDtype, setWidth, startImageName, textEncoder, vae,
    weightDtype, width, widthMeta, confirmAction
  } = view;
  return (
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
}
