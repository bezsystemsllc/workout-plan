// Persistent Rest Timer with Modal and Floating Mini-Dock modes.
import { esc } from "../lib/html.js";

let activeTimer = null;

export function mountTimer(initialSeconds = 90, { exerciseName = "Rest", autoMinimize = false } = {}) {
  if (activeTimer) {
    // If a timer is already running and user starts a new one, reset with new duration
    activeTimer.reset(initialSeconds, exerciseName);
    if (!autoMinimize) activeTimer.expand();
    return;
  }

  const root = document.getElementById("rest-timer-root");
  if (!root) return;

  let totalDuration = initialSeconds;
  let remaining = initialSeconds;
  let isPaused = false;
  let isMinimized = autoMinimize;
  let timeout = null;
  let endAt = performance.now() + remaining * 1000;
  let pausedRemaining = remaining;
  let beeped = false;
  let currentExName = exerciseName;

  const previousFocus = document.activeElement;

  function render() {
    if (remaining <= 0 && beeped) {
      renderCompleted();
      return;
    }

    if (isMinimized) {
      renderFloatingBar();
    } else {
      renderModal();
    }
  }

  function renderModal() {
    const progressPct = Math.min(100, Math.max(0, Math.round(((totalDuration - remaining) / (totalDuration || 1)) * 100)));

    root.innerHTML = `
      <div class="timer-modal" id="timer-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tm-title">
        <div class="panel">
          <div class="timer-header spread">
            <div>
              <div class="muted small" id="tm-title">${esc(currentExName)}</div>
              <div class="timer-subhead">Rest Countdown</div>
            </div>
            <div class="row" style="gap:4px">
              <button class="ghost small timer-btn-action" id="tm-minimize" title="Minimize to floating bar" aria-label="Minimize timer">▾ Minimize</button>
              <button class="ghost small timer-btn-action" id="tm-dismiss" title="Close timer" aria-label="Close timer">✕</button>
            </div>
          </div>

          <div class="timer-clock-wrap">
            <div class="countdown ${isPaused ? "paused" : ""}" id="tm-count" aria-live="polite">${fmt(remaining)}</div>
            <div class="timer-progress-bar">
              <div class="timer-progress-fill" style="width:${progressPct}%"></div>
            </div>
          </div>

          <div class="presets">
            <button data-s="45">45s</button>
            <button data-s="60">60s</button>
            <button data-s="90">90s</button>
            <button data-s="120">120s</button>
            <button data-s="180">3m</button>
          </div>

          <div class="row timer-controls" style="justify-content:center;gap:8px">
            <button id="tm-pm15" class="ghost">−15s</button>
            <button id="tm-pause" class="ghost">${isPaused ? "▶ Resume" : "⏸ Pause"}</button>
            <button id="tm-p15" class="ghost">+15s</button>
            <button class="primary" id="tm-close">Done</button>
          </div>
        </div>
      </div>
    `;

    root.querySelector("#tm-minimize").addEventListener("click", () => {
      isMinimized = true;
      render();
    });

    root.querySelector("#tm-dismiss").addEventListener("click", close);
    root.querySelector("#tm-close").addEventListener("click", close);

    root.querySelector("#timer-modal-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "timer-modal-backdrop") {
        isMinimized = true;
        render();
      }
    });

    root.querySelector("#tm-pause").addEventListener("click", togglePause);
    root.querySelector("#tm-p15").addEventListener("click", () => addSeconds(15));
    root.querySelector("#tm-pm15").addEventListener("click", () => addSeconds(-15));

    for (const btn of root.querySelectorAll("button[data-s]")) {
      btn.addEventListener("click", () => reset(+btn.dataset.s));
    }
  }

  function renderFloatingBar() {
    const progressPct = Math.min(100, Math.max(0, Math.round(((totalDuration - remaining) / (totalDuration || 1)) * 100)));

    root.innerHTML = `
      <div class="floating-timer-bar" id="floating-timer-bar" role="region" aria-label="Active rest timer">
        <div class="floating-timer-fill" style="width:${progressPct}%"></div>
        <div class="floating-timer-content">
          <div class="floating-timer-left" id="floating-expand-btn">
            <span class="floating-pulse ${isPaused ? "paused" : ""}"></span>
            <span class="floating-name">${esc(currentExName)}</span>
            <span class="floating-digits" id="tm-mini-count">${fmt(remaining)}</span>
          </div>
          <div class="floating-timer-actions">
            <button class="floating-action-btn" id="floating-p15" title="Add 15s" aria-label="Add 15 seconds">+15s</button>
            <button class="floating-action-btn" id="floating-pause" title="${isPaused ? "Resume" : "Pause"}" aria-label="${isPaused ? "Resume" : "Pause"}">
              ${isPaused ? "▶" : "⏸"}
            </button>
            <button class="floating-action-btn expand-btn" id="floating-expand" title="Expand modal" aria-label="Expand timer modal">⤢</button>
            <button class="floating-action-btn close-btn" id="floating-close" title="Dismiss timer" aria-label="Dismiss timer">✕</button>
          </div>
        </div>
      </div>
    `;

    root.querySelector("#floating-expand-btn").addEventListener("click", expand);
    root.querySelector("#floating-expand").addEventListener("click", expand);
    root.querySelector("#floating-close").addEventListener("click", close);
    root.querySelector("#floating-pause").addEventListener("click", togglePause);
    root.querySelector("#floating-p15").addEventListener("click", () => addSeconds(15));
  }

  function renderCompleted() {
    root.innerHTML = `
      <div class="floating-timer-bar timer-completed-bar" role="alert">
        <div class="floating-timer-content">
          <div class="floating-timer-left">
            <span class="timer-bell-icon">🔔</span>
            <b>Rest complete!</b>
            <span class="muted small">Time for your next set.</span>
          </div>
          <button class="primary small" id="tm-done-btn" style="min-height:34px;padding:4px 12px">Let's Lift</button>
        </div>
      </div>
    `;

    root.querySelector("#tm-done-btn").addEventListener("click", close);
    setTimeout(() => {
      if (remaining <= 0) close();
    }, 8000);
  }

  function tick() {
    if (isPaused) return;

    const now = performance.now();
    remaining = Math.max(0, Math.ceil((endAt - now) / 1000));

    // Update digits in place if element exists to avoid tearing DOM
    const countEl = root.querySelector("#tm-count");
    const miniCountEl = root.querySelector("#tm-mini-count");
    if (countEl) countEl.textContent = fmt(remaining);
    if (miniCountEl) miniCountEl.textContent = fmt(remaining);

    // Update progress bars
    const progressPct = Math.min(100, Math.max(0, Math.round(((totalDuration - remaining) / (totalDuration || 1)) * 100)));
    const fillEl = root.querySelector(".timer-progress-fill") || root.querySelector(".floating-timer-fill");
    if (fillEl) fillEl.style.width = `${progressPct}%`;

    if (remaining <= 0 && !beeped) {
      beeped = true;
      playRestTone();
      render();
      return;
    }

    if (remaining > 0) {
      scheduleTick();
    } else {
      timeout = null;
    }
  }

  function scheduleTick() {
    clearTimeout(timeout);
    const msLeft = endAt - performance.now();
    const delay = Math.max(50, Math.min(1000, msLeft % 1000 || 1000));
    timeout = setTimeout(tick, delay);
  }

  function togglePause() {
    if (isPaused) {
      isPaused = false;
      endAt = performance.now() + pausedRemaining * 1000;
      scheduleTick();
    } else {
      isPaused = true;
      clearTimeout(timeout);
      pausedRemaining = remaining;
    }
    render();
  }

  function addSeconds(s) {
    if (isPaused) {
      pausedRemaining = Math.max(5, pausedRemaining + s);
      remaining = pausedRemaining;
    } else {
      endAt += s * 1000;
      remaining = Math.max(5, remaining + s);
    }
    if (s > 0 && remaining > totalDuration) totalDuration = remaining;
    beeped = false;
    render();
  }

  function reset(s, newExName) {
    if (newExName) currentExName = newExName;
    totalDuration = s;
    remaining = s;
    pausedRemaining = s;
    isPaused = false;
    beeped = false;
    endAt = performance.now() + s * 1000;
    render();
    scheduleTick();
  }

  function expand() {
    isMinimized = false;
    render();
  }

  function close() {
    clearTimeout(timeout);
    document.removeEventListener("keydown", onKeydown);
    root.innerHTML = "";
    if (previousFocus && typeof previousFocus.focus === "function" && document.contains(previousFocus)) {
      previousFocus.focus();
    }
    activeTimer = null;
  }

  const onKeydown = (e) => {
    if (e.key === "Escape") {
      if (!isMinimized) {
        isMinimized = true;
        render();
      } else {
        close();
      }
    }
  };
  document.addEventListener("keydown", onKeydown);

  activeTimer = {
    reset,
    expand,
    close,
    isMinimized: () => isMinimized,
  };

  render();
  scheduleTick();
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function playRestTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;

    // Double chime: 587 Hz (D5) -> 880 Hz (A5)
    [
      { freq: 587.33, start: 0, dur: 0.25 },
      { freq: 880,    start: 0.28, dur: 0.45 },
    ].forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.35, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

      osc.start(now + start);
      osc.stop(now + start + dur);
    });

    if (navigator.vibrate) {
      navigator.vibrate([180, 80, 240]);
    }
  } catch (e) {
    // Web audio playback before user gesture fallback
  }
}
