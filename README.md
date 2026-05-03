# J AI Studio

Simple local studio for ComfyUI image and video generation.

J AI Studio keeps the normal prompt workflow up front and hides the graph work. It discovers the models, VAEs, text encoders, samplers, and schedulers from your running ComfyUI instance so the picker shows what is actually installed.

## Features

- Image and video generation in one UI
- Installed model discovery from ComfyUI
- Prompt and negative prompt controls
- Aspect ratio picker with manual size override
- Advanced controls for encoder, VAE, steps, CFG, sampler, scheduler, seed, variations, frames, and FPS
- Session gallery with fullscreen preview and download controls
- Monochrome shadcn-style interface

## Requirements

- Node.js 20+
- A local ComfyUI server
- Image or video models already installed in ComfyUI

## Run

```bash
npm install
npm run build
npm start
```

By default the app connects to `http://127.0.0.1:8188` and serves at `http://127.0.0.1:8787`.

To use a different ComfyUI server:

```bash
COMFY_URL=http://127.0.0.1:8188 npm start
```

## Development

```bash
npm run dev
```

## Notes

This repo does not include models or generated outputs. Keep model files in ComfyUI.
