// @ts-nocheck
import { fallbackAspectPresets } from './constants';
import { clampText, settingMax } from './format';
import { touchCenter, touchDistance } from './gallery';

export function useViewerControls(view: any) {
  const {
    active, deleteItem, doneGallery, generate, generateDisabled, height, itemSettings, lastTapRef,
    mode, models, prefs, setActive, setCfg, setClipType, setCount, setDenoise, setFps,
    setFrames, setHeight, setIsDraggingViewer, setMode, setModel, setNegative, setPrompt,
    setSampler, setScheduler, setSeed, setShowDetails, setStartImage, setStartImageName,
    setTextEncoder, setVae, setViewerPan, setViewerZoom, setWeightDtype, setWidth,
    setZenSelectedId, showToast, touchGestureRef, viewerDragEndRef, viewerDragRef, viewerPan,
    viewerZoom, visibleGallery, width, zenItem, zenStripDragRef, zenStripRef
  } = view;
  function resetViewer() {
    setViewerZoom(1);
    setViewerPan({ x: 0, y: 0 });
  }

  function openItem(item: GalleryItem) {
    resetViewer();
    setZenSelectedId(item.id);
    setShowDetails(typeof window === "undefined" ? true : !window.matchMedia("(max-width: 620px)").matches);
    setActive(item);
  }

  function applyAllSettings(item: GalleryItem) {
    const itemSettings = item.settings || {};
    const nextMode = item.type;
    const matchingProfile = models?.profiles.find((profile) => profile.kind === nextMode && profile.model === item.model);
    const matchingAspects = matchingProfile?.aspectPresets?.length ? matchingProfile.aspectPresets : fallbackAspectPresets[nextMode];
    setMode(nextMode);
    if (matchingProfile) setModel(matchingProfile.id);
    const nextPromptLimit = settingMax(matchingProfile?.constraints?.prompt);
    const nextNegativeLimit = settingMax(matchingProfile?.constraints?.negative);
    setPrompt(clampText(item.prompt || "", nextPromptLimit));
    setNegative(clampText(item.negative || "", nextNegativeLimit));
    setWidth(Number(item.width || itemSettings.width || width));
    setHeight(Number(item.height || itemSettings.height || height));
    if (itemSettings.steps) setSteps(Number(itemSettings.steps));
    if (itemSettings.cfg) setCfg(Number(itemSettings.cfg));
    if (itemSettings.denoise) setDenoise(Number(itemSettings.denoise));
    if (itemSettings.seed && itemSettings.seed !== "Random") setSeed(String(itemSettings.seed));
    else setSeed("");
    if (itemSettings.count) setCount(Number(itemSettings.count));
    if (itemSettings.frames) setFrames(Number(itemSettings.frames));
    if (itemSettings.fps) setFps(Number(itemSettings.fps));
    if (itemSettings.sampler) setSampler(String(itemSettings.sampler));
    if (itemSettings.scheduler) setScheduler(String(itemSettings.scheduler));
    if (itemSettings.textEncoder) setTextEncoder(String(itemSettings.textEncoder));
    if (itemSettings.vae) setVae(String(itemSettings.vae));
    if (itemSettings.clipType) setClipType(String(itemSettings.clipType));
    if (itemSettings.weightDtype) setWeightDtype(String(itemSettings.weightDtype));
    setStartImage(item.referenceImage || "");
    setStartImageName(item.referenceImageName || String(itemSettings.referenceImageName || ""));
    setCustomSize(!matchingAspects.some((option) => option.w === Number(item.width) && option.h === Number(item.height)));
    showToast("All settings applied", "success");
  }

  function moveZen(direction: 1 | -1) {
    if (!doneGallery.length) return;
    const currentIndex = Math.max(0, doneGallery.findIndex((item) => item.id === zenItem?.id));
    setZenSelectedId(doneGallery[(currentIndex + direction + doneGallery.length) % doneGallery.length].id);
  }

  function moveViewer(direction: 1 | -1) {
    if (!active) return;
    const doneItems = visibleGallery.filter((item) => item.status === "done" || item.status === "error");
    const currentIndex = doneItems.findIndex((item) => item.id === active.id);
    if (currentIndex < 0 || doneItems.length < 2) return;
    resetViewer();
    setActive(doneItems[(currentIndex + direction + doneItems.length) % doneItems.length]);
  }

  function goLatestZen() {
    const latest = doneGallery[0];
    if (latest) setZenSelectedId(latest.id);
  }

  function submitZenPrompt(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!prefs.enterToGenerate || event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!generateDisabled) generate();
  }

  function startZenStripDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!zenStripRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    zenStripDragRef.current = { id: event.pointerId, x: event.clientX, scrollLeft: zenStripRef.current.scrollLeft, moved: false };
  }

  function dragZenStrip(event: React.PointerEvent<HTMLDivElement>) {
    const drag = zenStripDragRef.current;
    if (!drag || drag.id !== event.pointerId || !zenStripRef.current) return;
    if (Math.abs(event.clientX - drag.x) > 4) drag.moved = true;
    zenStripRef.current.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
  }

  function stopZenStripDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = zenStripDragRef.current;
    if (drag?.id === event.pointerId) {
      if (!drag.moved) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-zen-id]") as HTMLElement | null;
        const itemId = target?.dataset.zenId;
        if (itemId) setZenSelectedId(itemId);
      }
      window.setTimeout(() => {
        zenStripDragRef.current = null;
      }, 0);
    }
  }

  function selectZenItem(itemId: string) {
    if (zenStripDragRef.current?.moved) return;
    setZenSelectedId(itemId);
  }

  function anchoredPan(nextZoom: number, clientX: number, clientY: number, element: HTMLElement) {
    if (nextZoom <= 1) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    const anchorX = clientX - rect.left - rect.width / 2;
    const anchorY = clientY - rect.top - rect.height / 2;
    const scale = nextZoom / Math.max(viewerZoom, 0.01);
    return {
      x: anchorX - (anchorX - viewerPan.x) * scale,
      y: anchorY - (anchorY - viewerPan.y) * scale
    };
  }

  function anchoredPanFromStart(nextZoom: number, clientX: number, clientY: number, element: HTMLElement, startZoom: number, startPan: { x: number; y: number }) {
    if (nextZoom <= 1) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    const anchorX = clientX - rect.left - rect.width / 2;
    const anchorY = clientY - rect.top - rect.height / 2;
    const scale = nextZoom / Math.max(startZoom, 0.01);
    return {
      x: anchorX - (anchorX - startPan.x) * scale,
      y: anchorY - (anchorY - startPan.y) * scale
    };
  }

  function zoomViewer(nextZoom: number, anchor?: { x: number; y: number; element: HTMLElement }) {
    const clamped = Math.max(0.5, Math.min(6, Number(nextZoom.toFixed(2))));
    if (anchor) setViewerPan(anchoredPan(clamped, anchor.x, anchor.y, anchor.element));
    else if (clamped <= 1) setViewerPan({ x: 0, y: 0 });
    setViewerZoom(clamped);
  }

  function wheelViewer(event: React.WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomViewer(viewerZoom * factor, { x: event.clientX, y: event.clientY, element: event.currentTarget as HTMLElement });
  }

  function clickViewer(event: React.MouseEvent) {
    event.stopPropagation();
    if (Date.now() - viewerDragEndRef.current < 220) return;
    if (viewerDragRef.current?.moved) return;
    const canvas = event.currentTarget as HTMLElement;
    const media = canvas.querySelector("img, video") as HTMLElement | null;
    if (media) {
      const rect = media.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) {
        setActive(null);
        return;
      }
    }
    if (viewerZoom > 1) {
      zoomViewer(1);
    } else {
      zoomViewer(2);
    }
  }

  function startViewerDrag(event: React.PointerEvent) {
    if (event.pointerType === "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    viewerDragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: viewerPan.x, panY: viewerPan.y, moved: false };
    setIsDraggingViewer(true);
  }

  function dragViewer(event: React.PointerEvent) {
    if (event.pointerType === "touch") return;
    const drag = viewerDragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    if (viewerZoom > 1) setViewerPan({ x: drag.panX + dx, y: drag.panY + dy });
  }

  function stopViewerDrag(event: React.PointerEvent) {
    if (event.pointerType === "touch") return;
    if (viewerDragRef.current?.id === event.pointerId) {
      const moved = viewerDragRef.current.moved;
      setIsDraggingViewer(false);
      if (moved) viewerDragEndRef.current = Date.now();
      window.setTimeout(() => { viewerDragRef.current = null; }, 0);
    }
  }

  function startViewerTouch(event: React.TouchEvent) {
    if (event.touches.length === 2) {
      event.preventDefault();
      const center = touchCenter(event.touches);
      touchGestureRef.current = {
        mode: "pinch",
        distance: touchDistance(event.touches),
        zoom: viewerZoom,
        panX: viewerPan.x,
        panY: viewerPan.y,
        centerX: center.x,
        centerY: center.y,
        moved: false
      };
      setIsDraggingViewer(true);
      return;
    }
    if (event.touches.length === 1 && viewerZoom > 1) {
      event.preventDefault();
      const touch = event.touches[0];
      touchGestureRef.current = {
        mode: "pan",
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        panX: viewerPan.x,
        panY: viewerPan.y,
        moved: false
      };
      setIsDraggingViewer(true);
    }
  }

  function moveViewerTouch(event: React.TouchEvent) {
    const gesture = touchGestureRef.current;
    if (!gesture) return;
    event.preventDefault();
    if (gesture.mode === "pinch" && event.touches.length >= 2) {
      const distance = touchDistance(event.touches);
      const center = touchCenter(event.touches);
      const nextZoom = Math.max(0.5, Math.min(6, Number((gesture.zoom * (distance / gesture.distance)).toFixed(2))));
      if (Math.abs(distance - gesture.distance) > 4) gesture.moved = true;
      setViewerZoom(nextZoom);
      setViewerPan(anchoredPanFromStart(nextZoom, center.x, center.y, event.currentTarget as HTMLElement, gesture.zoom, { x: gesture.panX, y: gesture.panY }));
      return;
    }
    if (gesture.mode === "pan" && event.touches.length === 1) {
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) gesture.moved = true;
      setViewerPan({ x: gesture.panX + dx, y: gesture.panY + dy });
    }
  }

  function endViewerTouch(event: React.TouchEvent) {
    const gesture = touchGestureRef.current;
    setIsDraggingViewer(false);
    if (gesture?.moved) {
      viewerDragEndRef.current = Date.now();
    } else if (!gesture && event.changedTouches.length === 1) {
      const nowTap = Date.now();
      if (nowTap - lastTapRef.current < 280) {
        event.preventDefault();
        zoomViewer(viewerZoom > 1 ? 1 : 2.5);
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = nowTap;
    }
    if (viewerZoom <= 1) setViewerPan({ x: 0, y: 0 });
    touchGestureRef.current = null;
  }
  return { resetViewer, openItem, applyAllSettings, moveZen, moveViewer, goLatestZen, submitZenPrompt, startZenStripDrag, dragZenStrip, stopZenStripDrag, selectZenItem, zoomViewer, wheelViewer, clickViewer, startViewerDrag, dragViewer, stopViewerDrag, startViewerTouch, moveViewerTouch, endViewerTouch };
}
