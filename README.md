# J AI Studio

Simple local image and video generation for ComfyUI, without the graph editor.

J AI Studio is a small React + Express app that sits in front of a running ComfyUI server. It discovers the models and generation options that ComfyUI already has installed, then gives you a cleaner prompt-first UI for image and video jobs.

## What It Does

- Generates images and videos from one interface
- Shows installed ComfyUI image models, video models, text encoders, VAEs, samplers, and schedulers
- Includes prompt, negative prompt, aspect ratio, width, height, seed, steps, CFG, and batch variation controls
- Includes video controls for frames and FPS
- Keeps advanced model settings available without making them the default workflow
- Shows generated outputs in a persistent local gallery with fullscreen preview and download controls
- Shows queue progress, prompt labels, cancel controls, and recovered ComfyUI history
- Runs locally; no hosted service or model files are included

## Requirements

- Node.js 20 or newer
- A running ComfyUI server
- ComfyUI models installed locally

For image generation, the current workflow expects ComfyUI nodes for `UNETLoader`, `CLIPLoader`, `VAELoader`, `EmptySD3LatentImage`, `KSampler`, `VAEDecode`, and `SaveImage`.

For video generation, it expects Wan-style video support through `Wan22ImageToVideoLatent` plus ComfyUI's `CreateVideo` and `SaveVideo` nodes.

## ComfyUI Setup

J AI Studio does not bundle ComfyUI. Keep ComfyUI as its own install, then run J AI Studio beside it. This keeps the repo small and lets you update ComfyUI or models without replacing the app.

1. Install and start ComfyUI.
2. Confirm ComfyUI opens at `http://127.0.0.1:8188`.
3. Put image models, video models, text encoders, and VAEs in ComfyUI's normal model folders.
4. Open `http://127.0.0.1:8188/object_info` in a browser if you want to confirm ComfyUI is exposing its nodes.
5. Start J AI Studio and open `http://127.0.0.1:8787`.

The model picker is populated from ComfyUI's `/object_info` response, but it only lists model families that J AI Studio has a matching workflow for. Current built-in workflows cover Z-Image/Z-Anime-style image models and Wan-style video models. Other model files stay hidden from the main picker until a matching workflow profile exists.

## Quick Start

Start ComfyUI first. By default, J AI Studio connects to:

```text
http://127.0.0.1:8188
```

Then run the app:

```bash
npm install
npm run build
npm start
```

Open:

```text
http://127.0.0.1:8787
```

## Configuration

Copy `.env.example` to `.env` if you want to change the default ports.

```bash
COMFY_URL=http://127.0.0.1:8188
HOST=127.0.0.1
PORT=8787
```

`COMFY_URL` is the ComfyUI server J AI Studio should talk to. `HOST` and `PORT` control where J AI Studio itself is served.

## Development

```bash
npm install
npm run dev
```

The dev command starts Vite and the local API server together.

## Local Hosting

For normal local use, keep ComfyUI running and start J AI Studio with:

```bash
npm run build
npm start
```

To make it reachable from another device on your network, set `HOST=0.0.0.0` and open the chosen `PORT` in your firewall. Do this only on a trusted network.

## Desktop Shortcut

On Windows, you can make a shortcut that starts ComfyUI, starts J AI Studio, and opens the browser. Point the shortcut at a PowerShell script like this:

```powershell
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = Join-Path $root "J-AI-Studio"
$comfyRoot = Join-Path $root "SwarmUI\dlbackend\comfy\ComfyUI"
$python = Join-Path $root "SwarmUI\dlbackend\comfy\python_embeded\python.exe"

if (-not (Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process $python "main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch" -WorkingDirectory $comfyRoot -WindowStyle Hidden
}

if (-not (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process node "server/index.js" -WorkingDirectory $appRoot -WindowStyle Hidden
}

Start-Process "http://127.0.0.1:8787/"
```

## Troubleshooting

If no models appear, make sure ComfyUI is running and that `COMFY_URL` points to the right server.

If image generation fails, confirm the selected model works with the selected text encoder and VAE in ComfyUI.

If video generation is missing or fails, confirm your ComfyUI install has the Wan video latent node and video save nodes available.

If outputs generate but do not preview, check that ComfyUI can serve the file from its `/view` endpoint. J AI Studio also recovers recent ComfyUI history into its local gallery if the app restarts.

## Notes

J AI Studio does not download models, include models, or publish generated outputs. Models stay in your ComfyUI installation. Gallery metadata is stored locally in `data/gallery.json`, and generated files stay in ComfyUI's output folder.
