const MODEL = "qwen2.5:0.5b-instruct";
const SYSTEM_PROMPT = "You are a helpful, honest assistant running in a small local model. Be clear when you are uncertain. Do not claim to have live internet access. Keep answers focused.";
const $ = (id) => document.getElementById(id);

const statusTitle = $("statusTitle");
const statusText = $("statusText");
const pullButton = $("pullButton");
const pullStatus = $("pullStatus");
const pullPercent = $("pullPercent");
const pullProgress = $("pullProgress");
const chat = $("chat");
const promptBox = $("prompt");
const sendButton = $("sendButton");
const refreshButton = $("refreshButton");
const exportButton = $("exportButton");

let installed = false;
let busy = false;
let pulling = false;
let messages = [{ role: "system", content: SYSTEM_PROMPT }];
let activeAssistant = null;
let activeController = null;

function setStatus(title, text, kind) {
  statusTitle.textContent = title;
  statusText.textContent = text;
  statusTitle.dataset.kind = kind || "neutral";
}

function setChatControls() {
  promptBox.disabled = !installed || busy || pulling;
  sendButton.disabled = !installed || busy || pulling || !promptBox.value.trim();
  pullButton.disabled = busy || pulling || !window.ollamaAvailable;
  exportButton.disabled = messages.filter((item) => item.role !== "system").length === 0;
}

function addMessage(role, text, extraClass) {
  const item = document.createElement("div");
  item.className = "message " + role + (extraClass ? " " + extraClass : "");
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "Ollama · Qwen2.5";
  const body = document.createElement("div");
  body.textContent = text || "";
  item.append(label, body);
  chat.append(item);
  chat.scrollTop = chat.scrollHeight;
  return body;
}

function showWelcome() {
  chat.innerHTML = "";
  const welcome = document.createElement("div");
  welcome.className = "welcome";
  const icon = document.createElement("div");
  icon.className = "spark";
  icon.textContent = "✦";
  const heading = document.createElement("h3");
  heading.textContent = "Ready when you are.";
  const paragraph = document.createElement("p");
  paragraph.textContent = "Check the connection, download the model, then start chatting.";
  welcome.append(icon, heading, paragraph);
  chat.append(welcome);
}

async function refreshStatus() {
  refreshButton.disabled = true;
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const data = await response.json();
    window.ollamaAvailable = Boolean(data.ollamaAvailable);
    installed = Boolean(data.installed);
    if (!data.ollamaAvailable) {
      setStatus("Ollama is starting", data.error || "The private Ollama process is not ready yet. Refresh in a few seconds.", "warning");
      pullStatus.textContent = "Waiting for Ollama";
    } else if (installed) {
      setStatus("Connected · model ready", "Ollama " + data.version + " · " + MODEL + " is installed in this Codespace.", "success");
      pullStatus.textContent = "Model installed";
      pullPercent.textContent = "100%";
      pullProgress.style.width = "100%";
    } else {
      setStatus("Connected · model not installed", "Ollama " + data.version + " is running. Download the model below to begin.", "success");
      pullStatus.textContent = "Ready to download";
    }
  } catch (error) {
    window.ollamaAvailable = false;
    installed = false;
    setStatus("Cannot reach the app server", error.message || "Refresh the Codespace port or check the startup logs.", "warning");
  } finally {
    refreshButton.disabled = false;
    setChatControls();
  }
}

async function readNDJSON(response, onItem) {
  if (!response.ok) {
    let message = "Request failed (HTTP " + response.status + ").";
    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch {}
    throw new Error(message);
  }
  if (!response.body) throw new Error("This browser did not provide a streaming response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const result = await reader.read();
    buffer += decoder.decode(result.value || new Uint8Array(), { stream: !result.done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const item = JSON.parse(trimmed);
      if (item.error) throw new Error(item.error);
      onItem(item);
    }
    if (result.done) break;
  }
  if (buffer.trim()) {
    const item = JSON.parse(buffer.trim());
    if (item.error) throw new Error(item.error);
    onItem(item);
  }
}

async function downloadModel() {
  if (!window.ollamaAvailable || pulling || busy) return;
  pulling = true;
  pullButton.textContent = "Downloading…";
  pullStatus.textContent = "Starting model download";
  pullPercent.textContent = "0%";
  pullProgress.style.width = "0%";
  setStatus("Downloading model", "Ollama is pulling approximately 398 MB into the Codespace. Keep this tab open.", "warning");
  setChatControls();
  try {
    const response = await fetch("/api/pull", { method: "POST" });
    await readNDJSON(response, (item) => {
      if (item.status) pullStatus.textContent = item.status;
      if (Number.isFinite(item.completed) && Number.isFinite(item.total) && item.total > 0) {
        const percent = Math.min(100, Math.round(item.completed / item.total * 100));
        pullPercent.textContent = percent + "%";
        pullProgress.style.width = percent + "%";
      }
    });
    pullStatus.textContent = "Model installed";
    pullPercent.textContent = "100%";
    pullProgress.style.width = "100%";
    await refreshStatus();
    showWelcome();
  } catch (error) {
    setStatus("Model download failed", error.message || "Check whether the Codespace can reach ollama.com.", "warning");
    pullStatus.textContent = "Download failed";
  } finally {
    pulling = false;
    pullButton.textContent = "Download model";
    setChatControls();
  }
}

async function sendMessage(event) {
  if (event) event.preventDefault();
  const text = promptBox.value.trim();
  if (!text || !installed || busy || pulling) return;
  promptBox.value = "";
  messages.push({ role: "user", content: text });
  const userCount = messages.filter((item) => item.role === "user").length;
  if (userCount > 8) messages = [messages[0], ...messages.slice(-16)];
  if (chat.querySelector(".welcome")) chat.innerHTML = "";
  addMessage("user", text);
  activeAssistant = addMessage("assistant", "");
  busy = true;
  activeController = new AbortController();
  setChatControls();
  setStatus("Generating locally", "The model is running on Codespaces CPU. This can take a while.", "success");

  let answer = "";
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: messages.slice(-18) }),
      signal: activeController.signal
    });
    await readNDJSON(response, (item) => {
      const piece = item.message && item.message.content ? item.message.content : "";
      if (piece) {
        answer += piece;
        activeAssistant.textContent = answer;
        chat.scrollTop = chat.scrollHeight;
      }
      if (item.done) {
        const count = item.eval_count || 0;
        const seconds = item.eval_duration ? item.eval_duration / 1e9 : 0;
        if (count && seconds > 0) setStatus("Response complete", "Generated " + count + " tokens · " + (count / seconds).toFixed(1) + " tokens/second.", "success");
      }
    });
    if (answer) messages.push({ role: "assistant", content: answer });
    if (!answer) activeAssistant.textContent = "(The model returned an empty response.)";
  } catch (error) {
    const stopped = error.name === "AbortError";
    activeAssistant.textContent = stopped ? (answer || "Generation stopped.") : ("Error: " + (error.message || "Could not complete the request."));
    activeAssistant.parentElement.classList.add("error");
    if (!stopped) setStatus("Chat request failed", error.message || "Try again after checking Ollama status.", "warning");
  } finally {
    activeAssistant = null;
    activeController = null;
    busy = false;
    setChatControls();
    promptBox.focus();
  }
}

function exportChat() {
  const text = messages.filter((item) => item.role !== "system")
    .map((item) => (item.role === "user" ? "You" : "Ollama") + ":\n" + item.content)
    .join("\n\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ollama-chromebook-chat.txt";
  link.click();
  URL.revokeObjectURL(url);
}

$("chatForm").addEventListener("submit", sendMessage);
promptBox.addEventListener("input", setChatControls);
promptBox.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
pullButton.addEventListener("click", downloadModel);
refreshButton.addEventListener("click", refreshStatus);
$("clearButton").addEventListener("click", () => {
  messages = [{ role: "system", content: SYSTEM_PROMPT }];
  showWelcome();
  setChatControls();
});
exportButton.addEventListener("click", exportChat);

refreshStatus();
setInterval(() => {
  if (!busy && !pulling) refreshStatus();
}, 10000);
