FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl zstd \
    && curl -fsSL https://ollama.com/download/ollama-linux-amd64.tar.zst | tar --zstd -x -C /usr \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

USER node
