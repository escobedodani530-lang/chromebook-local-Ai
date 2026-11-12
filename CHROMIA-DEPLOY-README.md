# CHROMIA Vercel test deployment

This branch is a separate deployment experiment. It does not alter the main branch's CHROMIA files.

The build downloads the pinned MicroLLM engine modules, tokenizer, WASM accelerator, and approximately 80 MiB model during deployment, then serves all runtime assets from the same HTTPS origin as the page. This avoids the blocked jsDelivr dependency and avoids cross-origin Worker imports at runtime.

## Deploy settings

- Branch: `chromia-vercel-test`
- Framework preset: Other
- Build command: `npm run build`
- Output directory: `dist`
- Install command: leave automatic/default; there are no third-party npm dependencies
- Entry URL after deploy: `/`

The build verifies the model's PGW1 signature and rejects a model over 99,000,000 bytes to leave room under the Vercel Hobby static-upload ceiling.

The school filter must explicitly permit the resulting `*.vercel.app` site for it to be usable on the managed Chromebook. This deployment does not attempt to evade filtering.
