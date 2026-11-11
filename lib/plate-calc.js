// Barbell plate calculator and warm-up set ladder generator.
import { esc } from "./html.js";

const PLATES_LB = [
  { weight: 45, color: "#ef4444", text: "#fff", h: 72 },
  { weight: 35, color: "#3b82f6", text: "#fff", h: 64 },
  { weight: 25, color: "#eab308", text: "#000", h: 56 },
  { weight: 10, color: "#22c55e", text: "#fff", h: 48 },
  { weight: 5,  color: "#cbd5e1", text: "#0f172a", h: 40 },
  { weight: 2.5, color: "#475569", text: "#fff", h: 32 },
];

const PLATES_KG = [
  { weight: 25,  color: "#ef4444", text: "#fff", h: 72 },
  { weight: 20,  color: "#3b82f6", text: "#fff", h: 66 },
  { weight: 15,  color: "#eab308", text: "#000", h: 58 },
  { weight: 10,  color: "#22c55e", text: "#fff", h: 50 },
  { weight: 5,   color: "#cbd5e1", text: "#0f172a", h: 42 },
  { weight: 2.5, color: "#475569", text: "#fff", h: 34 },
  { weight: 1.25, color: "#94a3b8", text: "#0f172a", h: 28 },
];

export function calculatePlates(targetWeight, barWeight, metric = false) {
  const availablePlates = metric ? PLATES_KG : PLATES_LB;
  const target = Math.max(barWeight, parseFloat(targetWeight) || barWeight);
  let perSideNeeded = (target - barWeight) / 2;

  const plates = [];
  for (const p of availablePlates) {
    const count = Math.floor(perSideNeeded / p.weight);
    if (count > 0) {
      plates.push({ ...p, count });
      perSideNeeded = Math.round((perSideNeeded - count * p.weight) * 100) / 100;
    }
  }

  const loadedWeight = barWeight + plates.reduce((sum, p) => sum + p.weight * p.count * 2, 0);

  return {
    target,
    barWeight,
    loadedWeight: Math.round(loadedWeight * 10) / 10,
    remainderPerSide: perSideNeeded,
    plates, // plates needed per side
  };
}

export function generateWarmupLadder(targetWeight, barWeight, metric = false) {
  const target = Math.max(barWeight, parseFloat(targetWeight) || barWeight);
  const step = metric ? 2.5 : 5;
  const roundTo = (val) => Math.max(barWeight, Math.round(val / step) * step);

  if (target <= barWeight) {
    return [
      { pct: 100, weight: barWeight, reps: "8-10", label: "Working load (Bar only)" },
    ];
  }

  return [
    { pct: Math.round((barWeight / target) * 100), weight: barWeight, reps: "10", label: "Warm-up (Bar)" },
    { pct: 50, weight: roundTo(target * 0.5), reps: "5", label: "Warm-up" },
    { pct: 70, weight: roundTo(target * 0.7), reps: "3", label: "Prep" },
    { pct: 85, weight: roundTo(target * 0.85), reps: "1-2", label: "Primer" },
    { pct: 100, weight: target, reps: "Working", label: "Target Set" },
  ];
}

export function openPlateCalculator({
  targetWeight = 135,
  metric = false,
  exerciseName = "Barbell Exercise",
  onApply = null,
} = {}) {
  const root = document.getElementById("modal-root");
  if (!root) return;

  const defaultBar = metric ? 20 : 45;
  let currentTarget = parseFloat(targetWeight) || defaultBar;
  let currentBar = defaultBar;
  const unit = metric ? "kg" : "lb";
  const previousFocus = document.activeElement;

  root.querySelector("#plate-modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "plate-modal-backdrop";
  backdrop.id = "plate-modal-backdrop";
  root.appendChild(backdrop);
  document.body.classList.add("modal-open");

  const onKeydown = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeydown);
  // Wired once — render() replaces only the backdrop's children.
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  function render() {
    const result = calculatePlates(currentTarget, currentBar, metric);
    const warmup = generateWarmupLadder(currentTarget, currentBar, metric);

    backdrop.innerHTML = `
      <div class="plate-modal-panel card" role="dialog" aria-modal="true" aria-labelledby="pm-title">
          <div class="spread">
            <div class="modal-title-wrap">
              <span class="muted small">Plate & Warm-up Calculator</span>
              <h2 id="pm-title" style="margin:0">${esc(exerciseName)}</h2>
            </div>
            <button class="ghost small" id="pm-close" aria-label="Close" style="min-height:36px;padding:4px 10px">✕</button>
          </div>

          <div class="plate-controls" style="margin-top:14px">
            <div class="grid-2">
              <div>
                <label for="pm-target-w">Target Weight (${unit})</label>
                <div class="row" style="gap:6px">
                  <button class="ghost small" id="pm-minus10">−${metric ? 5 : 10}</button>
                  <input id="pm-target-w" type="number" step="${metric ? "2.5" : "5"}" min="${currentBar}" value="${currentTarget}" style="text-align:center;font-weight:700;font-size:18px" />
                  <button class="ghost small" id="pm-plus10">+${metric ? 5 : 10}</button>
                </div>
              </div>
              <div>
                <label>Bar Weight</label>
                <div class="seg" style="margin-top:2px">
                  <button class="${currentBar === defaultBar ? "active" : ""}" data-bar="${defaultBar}">
                    ${defaultBar} ${unit} (Olympic)
                  </button>
                  <button class="${currentBar === (metric ? 15 : 35) ? "active" : ""}" data-bar="${metric ? 15 : 35}">
                    ${metric ? 15 : 35} ${unit}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Barbell Sleeve Graphic -->
          <div class="sleeve-container" aria-label="Visual plate arrangement per side">
            <div class="sleeve-header">
              <span class="sleeve-summary">Each side: <b>${Math.max(0, (result.loadedWeight - result.barWeight) / 2)} ${unit}</b></span>
              ${result.remainderPerSide > 0 ? `<span class="sleeve-warn">⚠ Remainder: ${result.remainderPerSide * 2} ${unit}</span>` : ""}
            </div>
            <div class="barbell-graphic">
              <div class="bar-shaft"></div>
              <div class="bar-collar"></div>
              <div class="bar-sleeve">
                ${result.plates.length === 0
                  ? `<span class="empty-bar-label">Empty Bar (${currentBar} ${unit})</span>`
                  : result.plates.map((p) =>
                      Array.from({ length: p.count }).map(() => `
                        <div class="plate-disk" style="height:${p.h}px;background:${p.color};color:${p.text}" title="${p.weight} ${unit}">
                          <span>${p.weight}</span>
                        </div>
                      `).join("")
                    ).join("")}
              </div>
            </div>
          </div>

          <!-- Plates breakdown chips -->
          <div class="plate-chips">
            ${result.plates.length === 0
              ? `<div class="hint">No plates needed — just the empty bar.</div>`
              : result.plates.map((p) => `
                  <span class="plate-chip" style="border-left: 4px solid ${p.color}">
                    <b>${p.count}×</b> ${p.weight} ${unit}
                  </span>
                `).join("")}
          </div>

          <!-- Warm-up Ladder -->
          <div class="warmup-section" style="margin-top:14px">
            <h3 style="margin:0 0 8px 0;font-size:14px;color:var(--muted)">Warm-up Ladder</h3>
            <table class="warmup-table">
              <thead>
                <tr>
                  <th>Set</th>
                  <th class="num">Weight</th>
                  <th class="num">Reps</th>
                  <th>Plates / side</th>
                </tr>
              </thead>
              <tbody>
                ${warmup.map((w, idx) => {
                  const pBreak = calculatePlates(w.weight, currentBar, metric);
                  const pStr = pBreak.plates.map((p) => `${p.count}×${p.weight}`).join(" + ") || "Empty bar";
                  const isTarget = idx === warmup.length - 1;
                  return `
                    <tr class="${isTarget ? "target-row" : ""}">
                      <td><b>${w.label}</b></td>
                      <td class="num"><b>${w.weight}</b> ${unit}</td>
                      <td class="num">${w.reps}</td>
                      <td class="muted small">${esc(pStr)}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>

          <div class="plate-footer" style="margin-top:16px;display:flex;gap:8px">
            ${onApply ? `<button class="primary" id="pm-apply" style="flex:1">Use ${currentTarget} ${unit}</button>` : ""}
            <button class="ghost" id="pm-done" style="flex:1">Done</button>
          </div>
      </div>
    `;

    // Wire events
    backdrop.querySelector("#pm-close").addEventListener("click", close);
    backdrop.querySelector("#pm-done").addEventListener("click", close);

    backdrop.querySelector("#pm-target-w").addEventListener("change", (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v) && v >= currentBar) {
        currentTarget = v;
        render();
      }
    });

    backdrop.querySelector("#pm-minus10").addEventListener("click", () => {
      const delta = metric ? 5 : 10;
      currentTarget = Math.max(currentBar, currentTarget - delta);
      render();
    });

    backdrop.querySelector("#pm-plus10").addEventListener("click", () => {
      const delta = metric ? 5 : 10;
      currentTarget += delta;
      render();
    });

    for (const btn of backdrop.querySelectorAll("button[data-bar]")) {
      btn.addEventListener("click", () => {
        currentBar = parseFloat(btn.dataset.bar);
        if (currentTarget < currentBar) currentTarget = currentBar;
        render();
      });
    }

    backdrop.querySelector("#pm-apply")?.addEventListener("click", () => {
      const inputVal = parseFloat(backdrop.querySelector("#pm-target-w")?.value);
      if (!isNaN(inputVal) && inputVal >= currentBar) currentTarget = inputVal;
      if (onApply) onApply(currentTarget);
      close();
    });
  }

  function close() {
    document.removeEventListener("keydown", onKeydown);
    backdrop.remove();
    if (!root.querySelector(".modal-backdrop")) {
      document.body.classList.remove("modal-open");
    }
    if (previousFocus && typeof previousFocus.focus === "function" && document.contains(previousFocus)) {
      previousFocus.focus();
    }
  }

  render();
}
