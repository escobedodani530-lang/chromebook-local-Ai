#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$HOME/.ollama-chromebook-lab"
mkdir -p "$LOG_DIR"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama is not installed in this Codespace image."
  echo "Rebuild the Codespace container from the repository's .devcontainer/Dockerfile."
  exit 1
fi

export OLLAMA_HOST="127.0.0.1:11434"
export OLLAMA_MAX_LOADED_MODELS="1"
export OLLAMA_NUM_PARALLEL="1"
export OLLAMA_KEEP_ALIVE="5m"

if ! curl -fsS --max-time 2 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  nohup ollama serve >"$LOG_DIR/ollama.log" 2>&1 </dev/null &
  echo $! >"$LOG_DIR/ollama.pid"
fi

ready=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "Ollama did not start. Recent log output:"
  tail -n 40 "$LOG_DIR/ollama.log" 2>/dev/null || true
  exit 1
fi

if ! curl -fsS --max-time 2 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
  nohup node "$ROOT_DIR/ollama-chromebook/server.mjs" >"$LOG_DIR/web.log" 2>&1 </dev/null &
  echo $! >"$LOG_DIR/web.pid"
fi

web_ready=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    web_ready=1
    break
  fi
  sleep 1
done

if [ "$web_ready" -ne 1 ]; then
  echo "The Ollama web interface did not start. Recent log output:"
  tail -n 40 "$LOG_DIR/web.log" 2>/dev/null || true
  exit 1
fi

echo "Ollama is running privately at 127.0.0.1:11434."
echo "The browser interface is listening on port 3000."
echo "Open the forwarded port 3000 in the Codespaces Ports panel."
echo "Model download is manual from the page; no model is downloaded automatically."
