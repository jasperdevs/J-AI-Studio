# Contributing

J AI Studio is a local ComfyUI front end. Keep changes focused, test with a local ComfyUI server when the change touches generation, and avoid committing generated outputs, local model files, logs, or `.env` files.

## Development

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run build
```

## Pull requests

- Keep UI changes consistent with the existing component system.
- Keep server changes local-only by default.
- Document any new environment variables in `.env.example` and the README.
- Do not add model downloads or generated media to the repository.
