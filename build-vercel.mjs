import { mkdir, readFile, writeFile, stat, open, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

const REV = "74b33db844a27b5f18f532802bbb6e3db495ea2d";
const RAW = "https://raw.githubusercontent.com/robss2020/microllm-lab/" + REV;
const MEDIA = "https://media.githubusercontent.com/media/robss2020/microllm-lab/" + REV;
const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const ENGINE = join(DIST, "engine");
const MODELS = join(DIST, "models");

async function downloadText(url, destination, validate) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error("Download failed (" + response.status + "): " + url);
  const text = await response.text();
  if (validate) validate(text);
  await writeFile(destination, text, "utf8");
}

async function downloadBinary(url, destination, expectedMagic) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error("Binary download failed (" + response.status + "): " + url);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  const handle = await open(destination, "r");
  const first = Buffer.alloc(4);
  try { await handle.read(first, 0, 4, 0); } finally { await handle.close(); }
  const validMagic = expectedMagic === "WASM"
    ? first[0] === 0 && first[1] === 0x61 && first[2] === 0x73 && first[3] === 0x6d
    : first.toString("latin1") === expectedMagic;
  if (!validMagic) {
    throw new Error("Unexpected file signature for " + destination + ": " + Array.from(first).join(","));
  }
  const size = (await stat(destination)).size;
  console.log("Downloaded " + destination + " (" + size + " bytes)");
  return size;
}

await rm(DIST, { recursive: true, force: true });
await mkdir(ENGINE, { recursive: true });
await mkdir(join(ENGINE, "models", "smollm2-135m-instruct"), { recursive: true });
await mkdir(MODELS, { recursive: true });

const engineFiles = [
  "worker.js",
  "tokenizer.js",
  "weights.js",
  "infer.js",
  "wasm.js",
  "webgpu.js",
  "webgpu-metal.js",
  "webgpu-gpt2.js",
  "fused-gpt2.js"
];
for (const filename of engineFiles) {
  await downloadText(RAW + "/engine/" + filename, join(ENGINE, filename));
}
await downloadBinary(RAW + "/engine/kernels.wasm", join(ENGINE, "kernels.wasm"), "WASM");

const tokenizerPath = join(ENGINE, "models", "smollm2-135m-instruct", "tokenizer.json");
await downloadText(
  RAW + "/models/smollm2-135m-instruct/tokenizer.json",
  tokenizerPath,
  value => {
    const parsed = JSON.parse(value);
    if (!parsed.model || !parsed.model.vocab) throw new Error("Tokenizer JSON validation failed");
  }
);

const modelPath = join(MODELS, "model.q4.bin");
const modelBytes = await downloadBinary(
  MEDIA + "/models/smollm2-135m-instruct/model.q4.bin",
  modelPath,
  "PGW1"
);
if (modelBytes > 99_000_000) {
  throw new Error("Model exceeds Vercel Hobby static file limit safety margin: " + modelBytes);
}

let html = await readFile(join(ROOT, "CHROMIA.html"), "utf8");
const replacements = [
  [
    'const ROOT = "https://cdn.jsdelivr.net/gh/robss2020/microllm-lab@" + REV;',
    'const ROOT = "./engine";'
  ],
  [
    'const MODEL_URL = "https://media.githubusercontent.com/media/robss2020/microllm-lab/" + REV + "/models/smollm2-135m-instruct/model.q4.bin";',
    'const MODEL_URL = "./models/model.q4.bin";'
  ],
  [
    'new Worker("./CHROMIA-worker.js",{type:"module",name:"CHROMIA-local-inference"})',
    'new Worker("./engine/worker.js",{type:"module",name:"CHROMIA-local-inference"})'
  ]
];
for (const [before, after] of replacements) {
  if (!html.includes(before)) throw new Error("CHROMIA source did not match expected version: " + before);
  html = html.replace(before, after);
}
await writeFile(join(DIST, "index.html"), html, "utf8");
await writeFile(join(DIST, "CHROMIA.html"), html, "utf8");

console.log("CHROMIA Vercel build complete. All model and engine assets are same-origin.");
