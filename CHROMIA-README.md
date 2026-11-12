# CHROMIA AI 4.0

Experimental local inference for Chromebook using SmolLM2-135M-Instruct (Q4). The model runs in the browser; a hosting provider is used only to serve the app and model assets.

## Main-branch files

- `CHROMIA.html` — original hosted version; currently depends on jsDelivr for the engine and is not expected to work on networks that block jsDelivr.
- `CHROMIA-LOCAL-FILE.html` — experimental local-file version that creates a module Worker from a Blob and imports the pinned engine from GitHub raw. It may run with WASM/CPU rather than WebGPU. It is not yet verified on the target Chromebook.
- `CHROMIA-compatibility-test.html` — diagnostic page. It checks Blob Worker support, GitHub raw/CORS, tokenizer, WASM, the model host (only the first response chunk), and WebGPU availability.

## Hosted deployment experiment

The separate `chromia-vercel-test` branch contains a build that downloads the pinned engine modules, tokenizer and Q4 model at deploy time, then serves them all from one HTTPS origin. The branch also includes configuration files for Vercel, Render, and Firebase Hosting.

- Branch: [chromia-vercel-test](https://github.com/escobedodani530-lang/chromebook-local-Ai/tree/chromia-vercel-test)
- Vercel config: `vercel.json`
- Render Blueprint: `render.yaml`
- Firebase Hosting config: `firebase.json`
- Build: `npm run build`
- Output folder: `dist`

The Vercel and Render/Firebase deployments have not yet been run. A deployment's public hostname must be allowed by the school network to be usable on the managed Chromebook. Do not use proxies, VPNs, tunnels, or other methods to evade school filtering; request approval or an allowlist from school IT if needed.

## Privacy and limitations

The model and engine are downloaded from their pinned upstream repository during the build and served from the host. Inference happens locally in the browser, and CHROMIA does not send conversation text to an AI API. The hosted site will still serve/download the model file to the browser. The Celeron Chromebook may generate slowly, especially without WebGPU. The model is small and can make mistakes.
