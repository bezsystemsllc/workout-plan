export function aiProgressHtml(id) {
  return `
    <div class="ai-progress" id="${id}" role="status" aria-live="polite" hidden>
      <div class="ai-progress-head">
        <span class="ai-progress-mark" aria-hidden="true">✦</span>
        <span class="ai-progress-label">Working on it...</span>
      </div>
      <div class="ai-progress-track" aria-hidden="true">
        <span class="ai-progress-fill"></span>
      </div>
    </div>
  `;
}

export function setAiProgress(progress, message, state = "busy") {
  if (!progress) return;
  progress.hidden = false;
  progress.classList.toggle("done", state === "done");
  progress.classList.toggle("error", state === "error");
  progress.setAttribute("aria-busy", String(state === "busy"));
  progress.querySelector(".ai-progress-label").textContent = message;
  progress.querySelector(".ai-progress-mark").textContent =
    state === "done" ? "✓" : state === "error" ? "!" : "✦";
}
