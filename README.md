# J AI Studio

Simple local image and video generation for ComfyUI, without the graph editor.

J AI Studio is a small React + Express app that sits in front of a running ComfyUI server. It discovers the models and generation options that ComfyUI already has installed, then gives you a cleaner prompt-first UI for image and video jobs.

## What It Does

- Generates images and videos from one interface
- Shows installed ComfyUI image models, video models, text encoders, VAEs, samplers, and schedulers
- Includes prompt, negative prompt, aspect ratio, width, height, seed, steps, CFG, and batch variation controls
- Includes video controls for frames and FPS
- Keeps advanced model settings available without making them the default workflow
- Shows generated outputs in a session gallery with fullscreen preview and download controls
- Runs locally; no hosted service or model files are included

## Requirements

- Node.js 20 or newer
- A running ComfyUI server
- ComfyUI models installed locally

For image generation, the current workflow expects ComfyUI nodes for `UNETLoader`, `CLIPLoader`, `VAELoader`, `EmptySD3LatentImage`, `KSampler`, `VAEDecode`, and `SaveImage`.

For video generation, it expects Wan-style video support through `Wan22ImageToVideoLatent` plus ComfyUI's `CreateVideo` and `SaveVideo` nodes.

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

## Troubleshooting

If no models appear, make sure ComfyUI is running and that `COMFY_URL` points to the right server.

If image generation fails, confirm the selected model works with the selected text encoder and VAE in ComfyUI.

If video generation is missing or fails, confirm your ComfyUI install has the Wan video latent node and video save nodes available.

If outputs generate but do not preview, check that ComfyUI can serve the file from its `/view` endpoint.

## Notes

J AI Studio does not download models, include models, or publish generated outputs. Models stay in your ComfyUI installation, and gallery items are only kept for the current browser session.
