import React from 'react';
import { Toaster } from 'sonner';
import { RowsPhotoAlbum } from 'react-photo-album';
import 'react-photo-album/rows.css';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Download, Github, Maximize2, Minimize2, PanelLeft, RotateCcw, Settings, SlidersHorizontal, Trash2, Wand2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { githubUrl } from './constants';
import { cn } from './format';
import { galleryPhoto, type GalleryPhoto } from './gallery';
import { AspectPicker, Field, GallerySkeleton, Media, ModelPicker, NumberPicker, Skeleton, StudioSelect as Select, Tip } from './components';
import { GalleryTile } from './GalleryTile';
import type { GalleryItem } from './types';
export function StudioView({ view }: { view: Record<string, any> }) {
  const { active, applyAllSettings, applyAspect, aspectOptions, aspectPickerValue, aspectValue, defaultAspectSize, canUseStartImage, cancelJob, cancelQueue, characterMeta, clearAllCache, clearFailedItems, clearGallery, clickViewer, copyAndToast, copyImageAndToast, count, countMeta, currentProfile, customSize, deleteItem, zenGallery, formatElapsed, gallery, galleryColumnCount, galleryColumns, galleryLoaded, galleryStageRef, generate, generationDetailEntries, goLatestZen, hasMoreGallery, health, height, heightMeta, isDraggingViewer, isMobile, loadMoreGalleryItems, mode, model, modelProfiles, models, moveViewer, moveViewerTouch, moveZen, negative, negativeLimit, now, onGalleryScroll, openItem, openOutputFolder, paths, prefs, prompt, promptLimit, refreshHealth, refreshModels, resetAllSettings, resetViewer, runningCount, setActive, setCount, setHeight, setNegative, setPrompt, setSettings, setShowDetails, setShowGenerationSettings, setShowNegativePrompt, setSteps, setWidth, setZenControls, setZenGalleryOpen, setZenMode, showDetails, settings, showGenerationSettings, showNegativePrompt, sidebarControls, startViewerDrag, startViewerTouch, steps, stepsMeta, stopViewerDrag, submitZenPrompt, viewerDragEndRef, viewerDragRef, viewerPan, viewerZoom, wheelViewer, width, widthMeta, zenControls, zenDisplayItem, zenGalleryOpen, zenItem, zenPromptRef, zenStripRef, dragViewer, dragZenStrip, endViewerTouch, selectZenItem, startZenStripDrag, stopZenStripDrag, titleFromPrompt, zoomViewer, clampText, promptRemaining, chooseModel, visibleGallery, setPrefs } = view;
  return (
    <div className={cn(prefs.zenMode ? "zen-shell" : "app-shell", showNegativePrompt && "negative-open")}>
      {prefs.zenMode ? (
        <>
          <div className="zen-stage">
            {zenDisplayItem ? (
              <button
                className={cn("zen-output", viewerZoom > 1 && "is-zoomed", isDraggingViewer && "is-dragging", zenDisplayItem.status === "pending" && "is-pending")}
                onClick={() => {
                  if (zenDisplayItem.status === "pending") return;
                  if (Date.now() - viewerDragEndRef.current < 220) return;
                  if (viewerDragRef.current?.moved) return;
                  openItem(zenDisplayItem);
                }}
                onWheel={wheelViewer}
                onPointerDown={startViewerDrag}
                onPointerMove={dragViewer}
                onPointerUp={stopViewerDrag}
                onPointerCancel={stopViewerDrag}
                onTouchStart={startViewerTouch}
                onTouchMove={moveViewerTouch}
                onTouchEnd={endViewerTouch}
                onTouchCancel={endViewerTouch}
                style={{ "--tile-ratio": `${zenDisplayItem.width || 1} / ${zenDisplayItem.height || 1}`, "--zoom": viewerZoom, "--pan-x": `${viewerPan.x}px`, "--pan-y": `${viewerPan.y}px` } as React.CSSProperties}
              >
                {zenDisplayItem.status === "pending" ? (() => {
                  const ratio = zenDisplayItem.progress?.max ? Math.min(1, Math.max(0, zenDisplayItem.progress.value / zenDisplayItem.progress.max)) : 0;
                  const indeterminate = !zenDisplayItem.progress?.max;
                  return (
                    <div className={cn("generating", "zen-generating", zenDisplayItem.preview && "has-preview")} style={{ "--progress-ratio": ratio } as React.CSSProperties}>
                      {zenDisplayItem.preview ? <img className="generate-preview" src={zenDisplayItem.preview} alt="" draggable={false} /> : null}
                      {!zenDisplayItem.preview ? <div className="noise-layer" /> : null}
                      <div className="generate-overlay">
                        <span className="generate-step">
                          {zenDisplayItem.progress?.max ? (
                            <>
                              <span className="generate-step-label">Step</span>
                              <span className="generate-step-count">{zenDisplayItem.progress.value}<i>/</i>{zenDisplayItem.progress.max}</span>
                            </>
                          ) : (
                            <span className="generate-step-label is-queued">{zenDisplayItem.progress?.node === "running" ? "Rendering" : "Queued"}</span>
                          )}
                        </span>
                        <span className="generate-elapsed">{formatElapsed(now - Date.parse(zenDisplayItem.createdAt || new Date().toISOString()))}</span>
                      </div>
                      <div className={cn("generate-bar", indeterminate && "is-indeterminate")}>
                        <div className="generate-bar-fill" />
                      </div>
                    </div>
                  );
                })() : <Media item={zenDisplayItem} muted />}
              </button>
            ) : !galleryLoaded ? (
              <div className="zen-empty skeleton-stage">
                <Skeleton className="skeleton-logo" />
              </div>
            ) : (
              <div className="zen-empty">
                <img src="/j-ai-logo.png" alt="" />
              </div>
            )}
            <div className="zen-fade" />
            <div className="bottom-fade" />
          </div>
          {zenGallery.length > 1 ? (
            <div className="zen-arrows">
              <Tip content="Previous output"><button aria-label="Previous output" onClick={() => moveZen(-1)}><ChevronLeft size={22} /></button></Tip>
              <Tip content="Next output"><button aria-label="Next output" onClick={() => moveZen(1)}><ChevronRight size={22} /></button></Tip>
            </div>
          ) : null}
          <Tip content="Controls"><button data-open-trigger className="zen-control-button" aria-label="Controls" onClick={() => setZenControls((value: boolean) => !value)}>
            <PanelLeft size={16} />
          </button></Tip>
          {zenItem ? (
            <div className={cn("zen-zoom-dock", zenControls && "with-side")}>
              <Tip content="Zoom out (-)"><button className="icon-button" aria-label="Zoom out" onClick={() => zoomViewer(viewerZoom - 0.25)} disabled={viewerZoom <= 0.5}><ZoomOut size={15} /></button></Tip>
              <Tip content="Reset zoom (0)"><button className="text-button viewer-zoom" onClick={resetViewer}>{viewerZoom !== 1 ? <RotateCcw size={13} /> : null} {Math.round(viewerZoom * 100)}%</button></Tip>
              <Tip content="Zoom in (+)"><button className="icon-button" aria-label="Zoom in" onClick={() => zoomViewer(viewerZoom + 0.25)} disabled={viewerZoom >= 6}><ZoomIn size={15} /></button></Tip>
            </div>
          ) : null}
          {zenGallery.length && !zenGalleryOpen ? (
            <Tip content="Show gallery"><button data-open-trigger className="zen-gallery-restore" aria-label="Show gallery" onClick={() => setZenGalleryOpen(true)}>
              <ChevronDown size={16} />
            </button></Tip>
          ) : null}
          <div className="zen-top-actions">
            <Tip content="Settings"><button className="icon-button" aria-label="Settings" onClick={() => setSettings(true)}><Settings size={15} /></button></Tip>
            <Tip content="Exit zen"><button className="icon-button" aria-label="Exit zen" onClick={() => setZenMode(false)}><Minimize2 size={15} /></button></Tip>
          </div>
          {zenControls ? <button className="sidebar-dismiss" aria-label="Close controls" onClick={() => setZenControls(false)} /> : null}
          <aside data-open-surface className={cn("zen-controls", zenControls && "open")}>
            {sidebarControls}
          </aside>
          <section className="zen-prompt">
            <textarea ref={zenPromptRef} value={prompt} placeholder="Describe what to make..." onKeyDown={submitZenPrompt} onChange={(event) => setPrompt(clampText(event.target.value, promptLimit))} />
            <span className={cn("prompt-count", promptRemaining === 0 && "limit")}>{characterMeta(prompt, promptLimit)}</span>
            <div data-open-surface className={cn("negative-drawer", showNegativePrompt && "open")}>
              <label className="negative-drawer-label">Negative prompt</label>
              <textarea value={negative} placeholder="What to avoid..." onChange={(event) => setNegative(clampText(event.target.value, negativeLimit))} />
              <span>{characterMeta(negative, negativeLimit)}</span>
            </div>
            <div className="zen-prompt-actions">
              <div className="prompt-left-actions">
                <Tip content={showNegativePrompt ? "Hide negative prompt" : "Show negative prompt"}><button data-open-trigger type="button" className={cn("negative-toggle", showNegativePrompt && "active")} onClick={() => setShowNegativePrompt((value: boolean) => !value)}>
                  <ChevronUp size={13} className={cn(!showNegativePrompt && "flip")} />
                  Negative
                </button></Tip>
              </div>
              <div className="zen-inline-settings">
                {models ? <ModelPicker value={model} profiles={modelProfiles} onChange={chooseModel} compact /> : <Skeleton className="skeleton-control" />}
                <AspectPicker value={aspectPickerValue} onChange={(value) => applyAspect(value)} options={aspectOptions} currentSize={aspectValue} defaultSize={defaultAspectSize} />
                {customSize ? (
                  <>
                    <NumberPicker label="Width" value={width} onChange={setWidth} min={widthMeta.min ?? 64} max={widthMeta.max ?? 4096} step={widthMeta.step || (mode === "video" ? 32 : 64)} size="sm" />
                    <NumberPicker label="Height" value={height} onChange={setHeight} min={heightMeta.min ?? 64} max={heightMeta.max ?? 4096} step={heightMeta.step || (mode === "video" ? 32 : 64)} size="sm" />
                  </>
                ) : null}
                <NumberPicker label="Steps" value={steps} onChange={setSteps} min={stepsMeta.min || 1} max={stepsMeta.max || 150} step={stepsMeta.step || 1} size="sm" />
                {mode === "image" ? <NumberPicker label="Variants" value={count} onChange={setCount} min={countMeta.min || 1} max={countMeta.max ?? 8} step={countMeta.step || 1} size="sm" /> : null}
              </div>
              <Tip content={mode === "image" ? `Generate ${count} image${count === 1 ? "" : "s"}` : "Generate video"}><button className="generate" onClick={generate} disabled={!currentProfile}>
                <Wand2 size={15} />
                Generate
              </button></Tip>
            </div>
          </section>
          {zenGallery.length && zenGalleryOpen ? (
            <div data-open-surface className="zen-gallery-wrap">
              <Tip content="Hide gallery"><button className="zen-gallery-toggle" aria-label="Hide gallery" onClick={() => setZenGalleryOpen(false)}><ChevronUp size={16} /></button></Tip>
              {zenGallery[0]?.id !== zenItem?.id ? <Tip content="Jump to latest output"><button className="zen-latest" onClick={goLatestZen}>Latest</button></Tip> : null}
              <div
                ref={zenStripRef}
                className="zen-gallery-strip"
                onPointerDown={startZenStripDrag}
                onPointerMove={dragZenStrip}
                onPointerUp={stopZenStripDrag}
                onPointerCancel={stopZenStripDrag}
              >
                {zenGallery.map((item: GalleryItem) => (
                  <Tip key={item.id} content={titleFromPrompt(item.prompt || item.filename)}><button data-zen-id={item.id} className={cn(item.id === zenItem?.id && "active")} onClick={(event) => { event.stopPropagation(); selectZenItem(item.id); }} onDragStart={(event) => event.preventDefault()}>
                    <Media item={item} muted />
                  </button></Tip>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <main ref={galleryStageRef} className="stage-gallery" onScroll={onGalleryScroll}>
            <section className="gallery" style={{ "--gallery-columns": galleryColumnCount } as React.CSSProperties}>
          {!galleryLoaded ? <GallerySkeleton columns={galleryColumnCount} /> : visibleGallery.length ? (
            <RowsPhotoAlbum<GalleryPhoto>
              photos={visibleGallery.map(galleryPhoto)}
              spacing={7}
              padding={0}
              targetRowHeight={(containerWidth) => containerWidth < 620 ? 132 : containerWidth < 1100 ? 178 : 214}
              rowConstraints={(containerWidth) => ({ singleRowMaxHeight: containerWidth < 620 ? 150 : 230 })}
              render={{
                photo: (_, { photo, width: photoWidth, height: photoHeight }) => {
                  const item = photo.item;
                  return <GalleryTile key={item.id} cancelJob={cancelJob} copyImageAndToast={copyImageAndToast} deleteItem={deleteItem} formatElapsed={formatElapsed} height={photoHeight} item={item} now={now} openItem={openItem} titleFromPrompt={titleFromPrompt} width={photoWidth} />;
                }
              }}
            />
          ) : (
            <div className="empty">
              <img src="/j-ai-logo.png" alt="" />
              <h2>No outputs yet</h2>
            </div>
          )}
            </section>
            {galleryLoaded && hasMoreGallery ? (
              <button className="gallery-load-more" onClick={loadMoreGalleryItems}>
                Load more
              </button>
            ) : null}
            <div className="bottom-fade" />
          </main>
          <Tip content="Controls"><button data-open-trigger className="zen-control-button" aria-label="Controls" onClick={() => setZenControls((value: boolean) => !value)}>
            <PanelLeft size={16} />
          </button></Tip>
          <div className="zen-top-actions">
            {runningCount ? <Tip content="Cancel all running and queued generations"><button className="queue-button" onClick={cancelQueue}>Cancel queue</button></Tip> : null}
            <Tip content="Settings"><button className="icon-button" aria-label="Settings" onClick={() => setSettings(true)}><Settings size={15} /></button></Tip>
            <Tip content="Zen mode"><button className="icon-button" aria-label="Enter zen mode" onClick={() => setZenMode(true)}><Maximize2 size={15} /></button></Tip>
          </div>
          {zenControls ? <button className="sidebar-dismiss" aria-label="Close controls" onClick={() => setZenControls(false)} /> : null}
          <aside data-open-surface className={cn("zen-controls", zenControls && "open")}>
            {sidebarControls}
          </aside>
          <section className="zen-prompt">
            <textarea ref={zenPromptRef} value={prompt} placeholder="Describe what to make..." onKeyDown={submitZenPrompt} onChange={(event) => setPrompt(clampText(event.target.value, promptLimit))} />
            <span className={cn("prompt-count", promptRemaining === 0 && "limit")}>{characterMeta(prompt, promptLimit)}</span>
            <div data-open-surface className={cn("negative-drawer", showNegativePrompt && "open")}>
              <label className="negative-drawer-label">Negative prompt</label>
              <textarea value={negative} placeholder="What to avoid..." onChange={(event) => setNegative(clampText(event.target.value, negativeLimit))} />
              <span>{characterMeta(negative, negativeLimit)}</span>
            </div>
            <div className="zen-prompt-actions">
              <div className="prompt-left-actions">
                <Tip content={showNegativePrompt ? "Hide negative prompt" : "Show negative prompt"}><button data-open-trigger type="button" className={cn("negative-toggle", showNegativePrompt && "active")} onClick={() => setShowNegativePrompt((value: boolean) => !value)}>
                  <ChevronUp size={13} className={cn(!showNegativePrompt && "flip")} />
                  Negative
                </button></Tip>
              </div>
              <div className="zen-inline-settings">
                {models ? <ModelPicker value={model} profiles={modelProfiles} onChange={chooseModel} compact /> : <Skeleton className="skeleton-control" />}
                <AspectPicker value={aspectPickerValue} onChange={(value) => applyAspect(value)} options={aspectOptions} currentSize={aspectValue} defaultSize={defaultAspectSize} />
                {customSize ? (
                  <>
                    <NumberPicker label="Width" value={width} onChange={setWidth} min={widthMeta.min ?? 64} max={widthMeta.max ?? 4096} step={widthMeta.step || (mode === "video" ? 32 : 64)} size="sm" />
                    <NumberPicker label="Height" value={height} onChange={setHeight} min={heightMeta.min ?? 64} max={heightMeta.max ?? 4096} step={heightMeta.step || (mode === "video" ? 32 : 64)} size="sm" />
                  </>
                ) : null}
                <NumberPicker label="Steps" value={steps} onChange={setSteps} min={stepsMeta.min || 1} max={stepsMeta.max || 150} step={stepsMeta.step || 1} size="sm" />
                {mode === "image" ? <NumberPicker label="Variants" value={count} onChange={setCount} min={countMeta.min || 1} max={countMeta.max ?? 8} step={countMeta.step || 1} size="sm" /> : null}
              </div>
              <Tip content={mode === "image" ? `Generate ${count} image${count === 1 ? "" : "s"}` : "Generate video"}><button className="generate" onClick={generate} disabled={!currentProfile}>
                <Wand2 size={15} />
                Generate
              </button></Tip>
            </div>
          </section>
        </>
      )}
      {settings ? (
        <div className="scrim modal-scrim" onClick={() => setSettings(false)}>
          <div data-open-surface className="settings-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <div className="settings-brand">
                <img src="/j-ai-logo.png" alt="" />
                <h2>Settings</h2>
              </div>
              <Tip content="Close (Esc)"><button className="icon-button" aria-label="Close settings" onClick={() => setSettings(false)}><X size={15} /></button></Tip>
            </header>
            <div className="settings-grid">
              <section>
                <h3>Project</h3>
                <div className="project-card">
                  <img src="/j-ai-logo.png" alt="" />
                  <div>
                    <strong>J AI Studio</strong>
                    <span>Local image and video studio</span>
                  </div>
                </div>
                <div className="setting-actions single">
                  <Tip content="Open the public GitHub repo"><a className="wide-button link-button" href={githubUrl} target="_blank" rel="noreferrer"><Github size={15} /> GitHub</a></Tip>
                </div>
              </section>
              <section>
                <h3>Connection</h3>
                <div className="setting-row"><span>Studio</span><strong>{window.location.host || "Localhost"}</strong></div>
                <div className="setting-row"><span>ComfyUI</span><strong>{health ? health.comfyUrl || "Not connected" : <Skeleton className="skeleton-text short" />}</strong></div>
                <div className="setting-row"><span>Status</span><strong>{health ? health.ok ? "Connected" : health.error || "Disconnected" : <Skeleton className="skeleton-text tiny" />}</strong></div>
                <div className="setting-actions">
                  <Tip content="Check the local ComfyUI connection"><button onClick={refreshHealth}>Check connection</button></Tip>
                  <Tip content="Rescan local models"><button onClick={() => refreshModels()}>Refresh models</button></Tip>
                  <Tip content="Open ComfyUI in a new tab"><button onClick={() => { window.open(health?.comfyUrl || "http://127.0.0.1:8188", "_blank"); }}>Open ComfyUI</button></Tip>
                </div>
              </section>
              <section>
                <h3>Installed</h3>
                <div className="setting-row"><span>Image models</span><strong>{models ? models.imageModels.length : <Skeleton className="skeleton-text tiny" />}</strong></div>
                <div className="setting-row"><span>Video models</span><strong>{models ? models.videoModels.length : <Skeleton className="skeleton-text tiny" />}</strong></div>
                <div className="setting-row"><span>Workflow</span><strong>{models ? currentProfile?.family || "None" : <Skeleton className="skeleton-text short" />}</strong></div>
                <div className="setting-row"><span>Start image</span><strong>{canUseStartImage ? "Available" : "Hidden for this model"}</strong></div>
                {(models?.unsupportedModels?.length || 0) > 0 ? <div className="setting-row"><span>Unsupported</span><strong>{models?.unsupportedModels?.length || 0}</strong></div> : null}
              </section>
              <section>
                <h3>Generation</h3>
                <Field label="When generating multiple images">
                  <Select
                    value={prefs.variationQueueMode}
                    onChange={(value) => setPrefs({ variationQueueMode: value === "separate" ? "separate" : "batch" })}
                    options={[
                      { label: "One Comfy batch", value: "batch" },
                      { label: "Queue them as separate jobs", value: "separate" }
                    ]}
                  />
                  <span className="field-meta">{prefs.variationQueueMode === "batch" ? "One Comfy prompt with a larger latent batch. It is not separate parallel queue workers." : "Multiple Comfy prompts. They still follow ComfyUI's normal queue order."}</span>
                </Field>
                <label className="toggle-row">
                  <span>
                    <strong>Enter to generate</strong>
                    <em>Press Enter to submit, Shift+Enter for a new line</em>
                  </span>
                  <input type="checkbox" checked={prefs.enterToGenerate} onChange={(event) => setPrefs({ enterToGenerate: event.target.checked })} />
                </label>
              </section>
              <section>
                <h3>Experience</h3>
                <label className="toggle-row">
                  <span>
                    <strong>Zen mode</strong>
                    <em>Prompt-first fullscreen layout</em>
                  </span>
                  <input type="checkbox" checked={prefs.zenMode} onChange={(event) => setZenMode(event.target.checked)} />
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>Confirm actions</strong>
                    <em>Ask before delete, cancel, reset, and cache clearing</em>
                  </span>
                  <input type="checkbox" checked={prefs.confirmActions} onChange={(event) => setPrefs({ confirmActions: event.target.checked })} />
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>Follow latest output</strong>
                    <em>Jump to the newest finished item while generating</em>
                  </span>
                  <input type="checkbox" checked={prefs.followLatest} onChange={(event) => setPrefs({ followLatest: event.target.checked })} />
                </label>
              </section>
              <section>
                <h3>Gallery</h3>
                <div className="setting-row"><span>Total items</span><strong>{galleryLoaded ? gallery.length : <Skeleton className="skeleton-text tiny" />}</strong></div>
                <div className="setting-row"><span>Current tab</span><strong>{galleryLoaded ? `${visibleGallery.length} ${mode === "image" ? "images" : "videos"}` : <Skeleton className="skeleton-text short" />}</strong></div>
                <div className="setting-row"><span>Outputs</span><strong>{paths.outputDir || <Skeleton className="skeleton-text path" />}</strong></div>
                <label className="toggle-row">
                  <span>
                    <strong>Show failed items</strong>
                    <em>Keep interrupted or failed generations visible in the gallery</em>
                  </span>
                  <input type="checkbox" checked={prefs.showFailedItems} onChange={(event) => setPrefs({ showFailedItems: event.target.checked })} />
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>Zen gallery strip</strong>
                    <em>Show the small gallery across the top in zen mode</em>
                  </span>
                  <input type="checkbox" checked={zenGalleryOpen} onChange={(event) => setZenGalleryOpen(event.target.checked)} />
                </label>
                <div className="setting-actions">
                  <Tip content="Copy the output folder path"><button onClick={() => copyAndToast(paths.outputDir || "", "Output path copied")}>Copy output path</button></Tip>
                  <Tip content="Open the output folder"><button onClick={openOutputFolder} disabled={!paths.outputDir}>Open output folder</button></Tip>
                </div>
                <div className="setting-actions">
                  <Tip content="Remove failed and interrupted cards"><button onClick={clearFailedItems}>Clear failed items</button></Tip>
                  <Tip content="Remove finished items from this gallery"><button className="subtle-danger" onClick={clearGallery}>Clear finished gallery</button></Tip>
                </div>
              </section>
              <section>
                <h3>Maintenance</h3>
                <div className="setting-actions">
                  <Tip content="Reset prompts, layout, model choices, and saved settings"><button onClick={resetAllSettings}>Reset all settings</button></Tip>
                  <Tip content="Clear browser cache, stale queue state, and free ComfyUI memory"><button onClick={clearAllCache}>Clear all cache</button></Tip>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
      {active ? (() => {
        const viewerItems = visibleGallery.filter((item: GalleryItem) => item.status === "pending" || item.status === "done" || item.status === "error");
        const hasNeighbors = viewerItems.length > 1;
        return (
          <div className="scrim" onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            if (Date.now() - viewerDragEndRef.current < 200) return;
            setActive(null);
          }} onWheel={(event) => event.preventDefault()}>
            <div className="viewer-shell" onClick={(event) => event.stopPropagation()}>
              <div className={cn("viewer-stage", showDetails && "with-side")} data-viewer-empty>
                <div
                  className={cn("viewer-canvas", viewerZoom > 1 && "is-zoomed", isDraggingViewer && "is-dragging")}
                  data-open-surface
                  style={{ "--zoom": viewerZoom, "--pan-x": `${viewerPan.x}px`, "--pan-y": `${viewerPan.y}px` } as React.CSSProperties}
                  onWheel={wheelViewer}
                  onPointerDown={startViewerDrag}
                  onPointerMove={dragViewer}
                  onPointerUp={stopViewerDrag}
                  onPointerCancel={stopViewerDrag}
                  onTouchStart={startViewerTouch}
                  onTouchMove={moveViewerTouch}
                  onTouchEnd={endViewerTouch}
                  onTouchCancel={endViewerTouch}
                  onClick={clickViewer}
                  onDoubleClick={(event) => { event.stopPropagation(); zoomViewer(viewerZoom > 1 ? 1 : 2.5); }}
                >
                  {active.status === "pending" ? (() => {
                    const ratio = active.progress?.max ? Math.min(1, Math.max(0, active.progress.value / active.progress.max)) : 0;
                    return (
                      <div className={cn("generating", "zen-generating", active.preview && "has-preview")} style={{ "--progress-ratio": ratio } as React.CSSProperties}>
                        {active.preview ? <img className="generate-preview" src={active.preview} alt="" draggable={false} /> : null}
                        {!active.preview ? <div className="noise-layer" /> : null}
                        <div className="generate-overlay">
                          {active.progress?.max ? <span className="generate-step"><span className="generate-step-label">Step</span><span className="generate-step-count">{active.progress.value}<i>/</i>{active.progress.max}</span></span> : <span className="generate-step-label is-queued">{active.progress?.node === "running" ? "Rendering" : "Queued"}</span>}
                          <span className="generate-elapsed">{formatElapsed(now - Date.parse(active.createdAt || new Date().toISOString()))}</span>
                        </div>
                        <div className={cn("generate-bar", !active.progress?.max && "is-indeterminate")}><div className="generate-bar-fill" /></div>
                      </div>
                    );
                  })() : <Media item={active} />}
                </div>
                {hasNeighbors ? (
                  <>
                    <Tip content="Previous"><button className="viewer-arrow prev" aria-label="Previous output" onClick={() => moveViewer(-1)}><ChevronLeft size={20} /></button></Tip>
                    <Tip content="Next"><button className="viewer-arrow next" aria-label="Next output" onClick={() => moveViewer(1)}><ChevronRight size={20} /></button></Tip>
                  </>
                ) : null}
                {showDetails ? (
                  <aside data-open-surface className="viewer-side" onWheel={(event) => event.stopPropagation()}>
                    <div className="viewer-side-head">
                      <h3>Details</h3>
                    </div>
                    <div className="viewer-side-body">
                      <div className="prompt-readout">
                        <span>Prompt</span>
                        <div className="readout-box">
                          <p>{active.prompt || "No prompt recorded"}</p>
                          <Tip content="Copy prompt"><button className="readout-copy" aria-label="Copy prompt" onClick={() => copyAndToast(active.prompt || "", "Prompt copied")}><Copy size={13} /></button></Tip>
                        </div>
                      </div>
                      {active.negative ? (
                        <div className="prompt-readout">
                          <span>Negative</span>
                          <div className="readout-box">
                            <p>{active.negative}</p>
                            <Tip content="Copy negative prompt"><button className="readout-copy" aria-label="Copy negative prompt" onClick={() => copyAndToast(active.negative || "", "Negative prompt copied")}><Copy size={13} /></button></Tip>
                          </div>
                        </div>
                      ) : null}
                      <Tip content="Copy this output's full settings into the generator"><button className="copy-all-settings" onClick={() => applyAllSettings(active)}>Copy All Settings</button></Tip>
                      {generationDetailEntries(active).length ? (
                        <details className="settings-disclosure" open={showGenerationSettings} onToggle={(event) => setShowGenerationSettings(event.currentTarget.open)}>
                          <summary>Generation settings</summary>
                          <div className="detail-grid">
                            {generationDetailEntries(active).map(([key, value]: [string, string]) => (
                              <React.Fragment key={key}>
                                <span>{key}</span><strong>{value}</strong>
                              </React.Fragment>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </aside>
                ) : null}
                <div data-open-trigger className={cn("viewer-dock", showDetails && "with-side")}>
                  <Tip content="Zoom out (-)"><button className="icon-button" aria-label="Zoom out" onClick={() => zoomViewer(viewerZoom - 0.25)} disabled={viewerZoom <= 0.5}><ZoomOut size={15} /></button></Tip>
                  <Tip content="Reset zoom (0)"><button className="text-button viewer-zoom" onClick={resetViewer}>{viewerZoom > 1 ? <RotateCcw size={13} /> : null} {Math.round(viewerZoom * 100)}%</button></Tip>
                  <Tip content="Zoom in (+)"><button className="icon-button" aria-label="Zoom in" onClick={() => zoomViewer(viewerZoom + 0.25)} disabled={viewerZoom >= 6}><ZoomIn size={15} /></button></Tip>
                  <span className="viewer-divider" />
                  <Tip content={active.url ? active.type === "image" ? "Copy image" : "Copy output link" : "Copy generation details"}><button className="icon-button" aria-label={active.url ? active.type === "image" ? "Copy image" : "Copy output link" : "Copy generation details"} onClick={() => copyImageAndToast(active)}><Copy size={15} /></button></Tip>
                  {active.url ? <Tip content="Download file"><a className="icon-button" aria-label="Download file" href={active.url} download><Download size={15} /></a></Tip> : null}
                  <Tip content="Delete (Del)"><button className="icon-button danger-tone" aria-label="Delete from gallery" onClick={() => deleteItem(active)}><Trash2 size={15} /></button></Tip>
                  <span className="viewer-divider" />
                  <Tip content={showDetails ? "Hide details" : "Show details"}><button className={cn("icon-button", showDetails && "active")} aria-label="Toggle details" aria-pressed={showDetails} onClick={() => setShowDetails((value: boolean) => !value)}><SlidersHorizontal size={15} /></button></Tip>
                  <Tip content="Close (Esc)"><button className="icon-button" aria-label="Close" onClick={() => setActive(null)}><X size={16} /></button></Tip>
                </div>
              </div>
            </div>
          </div>
        );
      })() : null}
      <Toaster theme="dark" position={isMobile ? "top-center" : "bottom-left"} richColors closeButton toastOptions={{ className: "sonner-toast" }} />
    </div>
  );
}
