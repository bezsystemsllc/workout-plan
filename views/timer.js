let active = null;

export function mountTimer(initialSeconds = 90) {
  if (active) active.close();
  const root = document.getElementById("rest-timer-root");
  let remaining = initialSeconds;
  let timeout = null;
  let endAt = performance.now() + remaining * 1000;
  let beeped = false;
  const previousFocus = document.activeElement;
  const onKeydown = (e) => {
    if (e.key === "Escape") active?.close();
    if (e.key === "Tab") trapFocus(root.querySelector(".timer-modal"), e);
  };

  root.innerHTML = `
    <div class="timer-modal" role="dialog" aria-modal="true" aria-labelledby="tm-title">
      <div class="panel">
        <div class="muted small" id="tm-title">Rest timer</div>
        <div class="countdown" id="tm-count" aria-live="polite">${fmt(remaining)}</div>
        <div class="presets">
          <button data-s="60">60s</button>
          <button data-s="90">90s</button>
          <button data-s="120">120s</button>
        </div>
        <div class="row" style="justify-content:center">
          <button id="tm-pm15">−15s</button>
          <button id="tm-p15">+15s</button>
          <button class="primary" id="tm-close">Done</button>
        </div>
      </div>
    </div>
  `;

  const countEl = root.querySelector("#tm-count");
  let rendered = remaining;

  function tick() {
    const now = performance.now();
    remaining = Math.max(0, Math.ceil((endAt - now) / 1000));
    if (remaining !== rendered) {
      countEl.textContent = fmt(remaining);
      rendered = remaining;
    }
    if (remaining <= 0 && !beeped) {
      beeped = true;
      beep();
    }
    if (remaining > 0) scheduleTick();
    else timeout = null;
  }

  function scheduleTick() {
    clearTimeout(timeout);
    const msLeft = endAt - performance.now();
    const delay = Math.max(50, Math.min(1000, msLeft % 1000 || 1000));
    timeout = setTimeout(tick, delay);
  }

  function reset(s) {
    endAt = performance.now() + s * 1000;
    beeped = false;
    tick();
  }

  for (const btn of root.querySelectorAll("button[data-s]")) {
    btn.addEventListener("click", () => reset(+btn.dataset.s));
  }
  root.querySelector("#tm-p15").addEventListener("click", () => {
    endAt += 15000;
    beeped = false;
    tick();
  });
  root.querySelector("#tm-pm15").addEventListener("click", () => {
    endAt -= 15000;
    tick();
  });
  root.querySelector("#tm-close").addEventListener("click", () => active.close());
  document.addEventListener("keydown", onKeydown);

  active = {
    close() {
      clearTimeout(timeout);
      document.removeEventListener("keydown", onKeydown);
      root.innerHTML = "";
      if (previousFocus && typeof previousFocus.focus === "function" && document.contains(previousFocus)) {
        previousFocus.focus();
      }
      active = null;
    },
  };

  scheduleTick();
  root.querySelector("#tm-close")?.focus();
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    o.start(); o.stop(ctx.currentTime + 0.6);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch (e) { /* audio not allowed yet */ }
}

function trapFocus(wrap, e) {
  if (!wrap) return;
  const focusable = [...wrap.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (!focusable.length) {
    e.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
