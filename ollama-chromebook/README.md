# Ollama Chromebook Lab

A browser chat interface backed by a real Ollama process running inside GitHub Codespaces. The Chromebook does not need Linux, Crostini, a local install, a GPU, or an Ollama API key.

## What runs where

- Chromebook: opens the private forwarded browser page and sends chat messages.
- GitHub Codespaces: runs the Ollama server and Qwen model on a remote CPU.
- Model: qwen2.5:0.5b-instruct, Q4_K_M, approximately 398 MB.
- API: Ollama's local HTTP API is bound to 127.0.0.1 inside the Codespace. Only the browser UI on port 3000 is forwarded, and that port is configured as Private.

This is not local inference on the Chromebook, and it is not Ollama Cloud. Chat prompts are sent to the private Codespace server so the remote model can answer. Do not enter passwords, school records, personal secrets, or sensitive information.

## Start it

1. Open this repository on GitHub.
2. Select the main branch.
3. Choose Code, then Codespaces, then Create codespace on main.
4. Keep the machine type at 2 cores. Do not choose a larger machine.
5. Wait for the Codespace to finish building. Its startup command launches Ollama and the web interface.
6. Open the Ports panel. Open port 3000 in the browser. Its visibility must say Private.
7. On the page, select Download model. The first download is about 398 MB and is stored in the Codespace.
8. When the status says the model is installed, start chatting.

The model is not downloaded automatically. No API key or GitHub secret is required.

## Cost guardrails

GitHub currently includes Codespaces usage for personal accounts, but it is a monthly quota, not unlimited hosting. The Free personal-account allowance is 120 core-hours and 15 GB-month of storage. A 2-core machine uses 2 core-hours for each active hour, so the compute allowance can cover up to about 60 active hours if no other Codespaces use it. Check the current billing page before starting.

When an included allowance is exhausted, GitHub says use is restricted until the quota renews unless a payment method and spending limit are configured. Do not add a payment method or enable paid overages for this experiment. Stop the Codespace when you finish; simply closing the browser tab does not stop it. GitHub's default idle timeout is 30 minutes, but stop it yourself from github.com/codespaces.

## School-managed Chromebook note

This works only if GitHub Codespaces and its private forwarded port are allowed by your school's device/network policy. If ContentKeeper or the Chromebook blocks Codespaces, stop and ask school IT whether this approved development service can be allowed. Do not use a VPN, proxy, tunnel, alternate hostname, or public port to get around a block.

## Limitations

- Qwen2.5 0.5B is a small model. It is much weaker than large hosted assistants and may hallucinate.
- It runs on CPU in the default Codespace, so generation may be slow.
- The model download uses Codespace storage and outbound transfer.
- Conversation history exists only in the current browser tab. Export it before closing if needed.
- The Ollama server is not exposed directly. Do not change port 3000 from Private or forward port 11434.

## Troubleshooting

- If port 3000 is absent, check the Codespaces terminal output and rerun: bash ollama-chromebook/start.sh
- If the page says Ollama is starting, refresh after a few seconds.
- If model download fails, check whether the Codespace can reach ollama.com. Do not enter an API key.
- If the Codespace is out of included usage, wait for the monthly allowance reset rather than enabling paid billing.
