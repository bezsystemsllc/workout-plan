let active = null;

export function mountTimer(initialSeconds = 90) {
  if (active) active.close();
  const root = document.getElementById("rest-timer-root");
  let remaining = initialSeconds;
  let raf = null;
  let endAt = performance.now() + remaining * 1000;
  let beeped = false;

  root.innerHTML = `
    <div class="timer-modal" role="dialog" aria-label="Rest timer">
      <div class="panel">
        <div class="muted small">Rest timer</div>
        <div class="countdown" id="tm-count">${fmt(remaining)}</div>
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

  function tick() {
    const now = performance.now();
    remaining = Math.max(0, Math.ceil((endAt - now) / 1000));
    countEl.textContent = fmt(remaining);
    if (remaining <= 0 && !beeped) {
      beeped = true;
      beep();
    }
    if (remaining > 0) raf = requestAnimationFrame(tick);
  }

  function reset(s) {
    endAt = performance.now() + s * 1000;
    beeped = false;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  for (const btn of root.querySelectorAll("button[data-s]")) {
    btn.addEventListener("click", () => reset(+btn.dataset.s));
  }
  root.querySelector("#tm-p15").addEventListener("click", () => {
    endAt += 15000; beeped = false; if (!raf) raf = requestAnimationFrame(tick);
  });
  root.querySelector("#tm-pm15").addEventListener("click", () => {
    endAt -= 15000;
  });
  root.querySelector("#tm-close").addEventListener("click", () => active.close());

  active = {
    close() {
      cancelAnimationFrame(raf);
      root.innerHTML = "";
      active = null;
    },
  };

  raf = requestAnimationFrame(tick);
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
