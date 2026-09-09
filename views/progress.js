import { load, update, exportJSON, importJSON, todayISO } from "../storage.js";
import { lbToKg, kgToLb, inToCm, cmToIn } from "../lib/calc.js";
import { notify, confirmAction, toast } from "../lib/modal.js";
import { esc } from "../lib/html.js";
import { getExerciseHistory, getAllTimePRs } from "../lib/records.js";
import { getActivePlan } from "../lib/plan.js";

const HISTORY_ROW_LIMIT = 120;
const CHART_POINT_LIMIT = 180;

export function renderProgress(root) {
  const settings = load("settings");
  const metric = settings.units === "metric";
  const wUnit = metric ? "kg" : "lb";
  const waistUnit = metric ? "cm" : "in";

  const dispW = (lb) => lb == null ? null : (metric ? lbToKg(lb) : lb);
  const dispWaist = (inches) => inches == null ? null : (metric ? inToCm(inches) : inches);
  const targetDispW = dispW(settings.targetWeightLb);

  let activeTab = "body"; // "body" | "strength"
  let selectedExercise = null;

  function render() {
    const entries = [...load("progress")].sort((a, b) => a.date.localeCompare(b.date));
    const stats = computeStats(entries, settings.targetWeightLb);
    const visibleHistory = entries.slice(-HISTORY_ROW_LIMIT).reverse();
    const hiddenHistoryCount = Math.max(0, entries.length - visibleHistory.length);

    const allWorkouts = load("workouts");
    const allPRs = getAllTimePRs(allWorkouts);
    const plan = getActivePlan();

    // Collect all exercises with logged history or in current plan
    const exerciseSet = new Set(Object.keys(allPRs));
    for (const day of Object.values(plan.workouts || {})) {
      for (const ex of day) if (ex && ex.name) exerciseSet.add(ex.name);
    }
    const exerciseList = Array.from(exerciseSet).sort((a, b) => {
      const prA = allPRs[a]?.totalSets || 0;
      const prB = allPRs[b]?.totalSets || 0;
      return prB - prA || a.localeCompare(b);
    });

    if (!selectedExercise && exerciseList.length > 0) {
      selectedExercise = exerciseList[0];
    }

    root.innerHTML = `
      <div class="seg" style="margin-bottom:14px">
        <button class="${activeTab === "body" ? "active" : ""}" id="tab-body">⚖️ Body & Weight</button>
        <button class="${activeTab === "strength" ? "active" : ""}" id="tab-strength">🏋️ Strength & PRs</button>
      </div>

      ${activeTab === "body" ? renderBodySection(entries, stats, visibleHistory, hiddenHistoryCount) : renderStrengthSection(allWorkouts, allPRs, exerciseList)}

      <section class="card">
        <h2>Backup & Data</h2>
        <p class="hint">localStorage is per-browser. Export regularly so you don't lose your data if cookies clear.</p>
        <div class="grid-2">
          <button id="p-export">Export JSON</button>
          <button id="p-import">Import JSON</button>
        </div>
        <input type="file" id="p-file" accept="application/json" hidden />
      </section>
    `;

    // Tab switching
    root.querySelector("#tab-body")?.addEventListener("click", () => {
      activeTab = "body";
      render();
    });
    root.querySelector("#tab-strength")?.addEventListener("click", () => {
      activeTab = "strength";
      render();
    });

    if (activeTab === "body") {
      wireBodyEvents(render);
    } else {
      wireStrengthEvents(render, allWorkouts);
    }

    wireBackupEvents(render);
  }

  function renderBodySection(entries, stats, visibleHistory, hiddenHistoryCount) {
    return `
      <section class="card">
        <h2>Log entry</h2>
        <div class="grid-2">
          <div><label>Date</label><input id="p-date" type="date" value="${todayISO()}" max="${todayISO()}" /></div>
          <div><label>Weight (${wUnit})</label><input id="p-w" type="number" inputmode="decimal" step="0.1" /></div>
          <div><label>Waist (${waistUnit})</label><input id="p-waist" type="number" inputmode="decimal" step="0.1" /></div>
          <div style="display:flex;align-items:flex-end"><button class="primary" id="p-save" style="width:100%">Save</button></div>
        </div>
        <div class="hint">Weigh in same time each morning, post-bathroom, pre-food.</div>
      </section>

      <section class="card">
        <h2>Trend</h2>
        ${entries.length < 2
          ? `<p class="empty small">Log at least 2 entries to see the trend.</p>`
          : renderChart(entries, metric)}
        <div class="macros-grid" style="margin-top:10px">
          <div class="m"><b>${entries.length}</b><span>entries</span></div>
          <div class="m"><b>${dispW(stats.currentWeight) ?? "—"}</b><span>current ${wUnit}</span></div>
          <div class="m"><b>${dispW(stats.movingAvg) ?? "—"}</b><span>7-day avg</span></div>
          <div class="m"><b>${stats.lost >= 0 ? (metric ? lbToKg(stats.lost) : stats.lost) : "—"}</b><span>${wUnit} lost</span></div>
        </div>
        ${stats.weeksToGo !== null
          ? `<p class="hint">At current rate, ~${stats.weeksToGo} weeks to reach ${targetDispW} ${wUnit}.</p>`
          : ""}
      </section>

      <section class="card">
        <h2>History</h2>
        ${entries.length === 0
          ? `<p class="empty small">No entries yet.</p>`
          : `
            ${hiddenHistoryCount ? `<p class="hint">Showing the most recent ${visibleHistory.length} of ${entries.length} entries. Export JSON for the full history.</p>` : ""}
            <table class="entry-table">
              <thead><tr><th>Date</th><th class="num">Weight (${wUnit})</th><th class="num">Waist (${waistUnit})</th><th></th></tr></thead>
              <tbody>
                ${visibleHistory.map((e) => `
                  <tr>
                    <td>${esc(e.date)}</td>
                    <td class="num">${dispW(e.weightLb) ?? "—"}</td>
                    <td class="num">${dispWaist(e.waistIn) ?? "—"}</td>
                    <td><button class="ghost small" data-rm-date="${esc(e.date)}" aria-label="Delete entry for ${esc(e.date)}" style="min-height:32px;padding:4px 8px">✕</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `}
      </section>
    `;
  }

  function renderStrengthSection(allWorkouts, allPRs, exerciseList) {
    if (exerciseList.length === 0) {
      return `
        <section class="card">
          <h2>Strength Progression</h2>
          <p class="empty small">No workouts logged yet. Start logging sessions to track your strength curves and PRs!</p>
        </section>
      `;
    }

    const currentEx = selectedExercise || exerciseList[0];
    const history = getExerciseHistory(currentEx, allWorkouts);
    const pr = allPRs[currentEx];

    return `
      <section class="card">
        <div class="spread" style="align-items:center">
          <h2 style="margin:0">Exercise Progression</h2>
          <span class="muted small">${history.length} logged sessions</span>
        </div>

        <div style="margin-top:12px">
          <label for="strength-ex-select">Select Exercise</label>
          <select id="strength-ex-select" style="width:100%;font-weight:600">
            ${exerciseList.map((name) => `
              <option value="${esc(name)}" ${name === currentEx ? "selected" : ""}>
                ${esc(name)} ${allPRs[name]?.best1RM ? `(Best: ${allPRs[name].best1RM} ${wUnit})` : ""}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="strength-chart-wrap" style="margin-top:14px">
          ${history.length < 2
            ? `<div class="empty small" style="padding:28px 12px;text-align:center">Log at least 2 sessions for <b>${esc(currentEx)}</b> to see its strength curve.</div>`
            : renderStrengthChart(history, metric)}
        </div>

        <div class="macros-grid" style="margin-top:14px">
          <div class="m">
            <span class="m-label">Best 1RM</span>
            <b>${pr?.best1RM ? `${pr.best1RM} ${wUnit}` : "—"}</b>
            <span class="m-target">${pr?.best1RMDate || "—"}</span>
          </div>
          <div class="m">
            <span class="m-label">Max Load</span>
            <b>${pr?.maxWeight ? `${pr.maxWeight} ${wUnit}` : "—"}</b>
            <span class="m-target">${pr?.bestRepsAtWeight ? `${pr.bestRepsAtWeight.reps} reps` : "—"}</span>
          </div>
          <div class="m">
            <span class="m-label">Total Sets</span>
            <b>${pr?.totalSets || 0}</b>
            <span class="m-target">completed</span>
          </div>
          <div class="m">
            <span class="m-label">Total Volume</span>
            <b>${pr?.totalVolume ? `${Math.round(pr.totalVolume).toLocaleString()}` : "0"}</b>
            <span class="m-target">${wUnit} lifted</span>
          </div>
        </div>
      </section>

      <!-- Lifetime PR Leaderboard -->
      <section class="card">
        <div class="spread">
          <h2 style="margin:0">🏆 Lifetime PR Board</h2>
          <span class="muted small">${Object.keys(allPRs).length} exercises</span>
        </div>
        <p class="hint">Your personal bests across logged movements.</p>

        <div class="pr-grid" style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">
          ${Object.values(allPRs).filter(p => p.best1RM > 0).map(p => `
            <div class="pr-card">
              <div class="pr-card-header">
                <b>${esc(p.name)}</b>
                <span class="pr-crown">🏆</span>
              </div>
              <div class="pr-card-body">
                <div><span>Est. 1RM</span><b>${p.best1RM} ${wUnit}</b></div>
                <div><span>Max Load</span><b>${p.maxWeight} ${wUnit} × ${p.bestRepsAtWeight.reps}</b></div>
              </div>
              <div class="pr-card-date muted small">${esc(p.best1RMDate || "")}</div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function wireBodyEvents(rerender) {
    root.querySelector("#p-save")?.addEventListener("click", async () => {
      const date = root.querySelector("#p-date").value;
      const wRaw = parseFloat(root.querySelector("#p-w").value);
      const waistRaw = parseFloat(root.querySelector("#p-waist").value);
      if (!date || (isNaN(wRaw) && isNaN(waistRaw))) {
        await notify("Need a date and at least one measurement (weight or waist).", { title: "Missing info" });
        return;
      }
      if (!validISODate(date) || date > todayISO()) {
        await notify("Choose today or an earlier valid date.", { title: "Check your date" });
        return;
      }
      const weightLb = isNaN(wRaw) ? null : (metric ? kgToLb(wRaw) : wRaw);
      const waistIn = isNaN(waistRaw) ? null : (metric ? cmToIn(waistRaw) : waistRaw);
      const err = measurementError(weightLb, waistIn, metric);
      if (err) {
        await notify(err, { title: "Check your entry" });
        return;
      }
      const outlier = weightOutlier(load("progress"), date, weightLb, metric);
      if (outlier) {
        const ok = await confirmAction(
          `This is ${outlier.delta} ${outlier.unit} from your last logged weight. Save it anyway?`,
          { title: "Unusual weight change?", okLabel: "Save anyway" },
        );
        if (!ok) return;
      }
      update("progress", (list) => {
        const filtered = list.filter((e) => e.date !== date);
        filtered.push({ date, weightLb, waistIn });
        return filtered;
      });
      toast(`Saved entry for ${date}`);
      rerender();
    });

    for (const btn of root.querySelectorAll("button[data-rm-date]")) {
      btn.addEventListener("click", async () => {
        const d = btn.dataset.rmDate;
        const ok = await confirmAction(`Delete entry for ${d}?`, {
          title: "Delete entry?", okLabel: "Delete", danger: true,
        });
        if (!ok) return;
        update("progress", (list) => list.filter((e) => e.date !== d));
        rerender();
      });
    }
  }

  function wireStrengthEvents(rerender, allWorkouts) {
    root.querySelector("#strength-ex-select")?.addEventListener("change", (e) => {
      selectedExercise = e.target.value;
      rerender();
    });

    // Tooltip interaction for chart points
    const dots = root.querySelectorAll(".strength-dot");
    const tip = root.querySelector("#chart-tip");
    for (const dot of dots) {
      const showTip = () => {
        if (!tip) return;
        tip.innerHTML = `<b>${dot.dataset.date}</b> • Est 1RM: <b>${dot.dataset.orm} ${wUnit}</b> (Load: ${dot.dataset.w} ${wUnit})`;
        tip.style.opacity = "1";
      };
      dot.addEventListener("mouseenter", showTip);
      dot.addEventListener("touchstart", showTip, { passive: true });
    }
  }

  function wireBackupEvents(rerender) {
    root.querySelector("#p-export")?.addEventListener("click", () => {
      const blob = new Blob([exportJSON()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tempo-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    root.querySelector("#p-import")?.addEventListener("click", () => root.querySelector("#p-file").click());
    root.querySelector("#p-file")?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ok = await confirmAction(
        "Importing will REPLACE all current data (profile, workouts, meals, saved foods, and progress). This cannot be undone.",
        { title: "Replace all data?", okLabel: "Import + replace", danger: true },
      );
      if (!ok) return;
      try {
        const text = await file.text();
        importJSON(text);
        toast("Imported. Reloading…");
        setTimeout(() => location.reload(), 800);
      } catch (err) {
        await notify(err.message, { title: "Import failed" });
      }
    });
  }

  render();
}

function renderStrengthChart(sessions, metric = false) {
  const W = 340, H = 190, PAD = 32;
  const xs = sessions.map(s => new Date(s.date).getTime());
  const ys = sessions.map(s => s.best1RM);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.max(0, Math.min(...ys) - (metric ? 5 : 10));
  const yMax = Math.max(...ys) + (metric ? 5 : 10);

  const sx = (x) => PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - PAD * 2);
  const sy = (y) => H - PAD - ((y - yMin) / (yMax - yMin || 1)) * (H - PAD * 2);

  const path = sessions.map((s, i) => `${i ? "L" : "M"} ${sx(xs[i]).toFixed(1)} ${sy(ys[i]).toFixed(1)}`).join(" ");
  const area = `${path} L ${sx(xs[xs.length - 1]).toFixed(1)} ${H - PAD} L ${sx(xs[0]).toFixed(1)} ${H - PAD} Z`;

  const dots = sessions.map((s, i) => `
    <circle
      class="dot strength-dot"
      cx="${sx(xs[i]).toFixed(1)}"
      cy="${sy(ys[i]).toFixed(1)}"
      r="4.5"
      data-date="${esc(s.date)}"
      data-orm="${s.best1RM}"
      data-w="${s.maxWeight}"
      tabindex="0"
    />
  `).join("");

  const ticks = 4;
  const yLabels = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = yMin + ((yMax - yMin) * i) / ticks;
    return `
      <line class="grid" x1="${PAD}" x2="${W - PAD}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" />
      <text class="lbl" x="4" y="${(sy(v) + 3).toFixed(1)}">${Math.round(v)}</text>
    `;
  }).join("");

  return `
    <div id="chart-tip" class="chart-tooltip">Tap a point to see details</div>
    <svg class="chart strength-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="1RM Strength trend">
      <defs>
        <linearGradient id="strength-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      ${yLabels}
      <path class="chart-area" d="${area}" fill="url(#strength-grad)" />
      <path class="line" d="${path}" stroke="var(--accent)" stroke-width="3" />
      ${dots}
    </svg>
  `;
}

function validISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function measurementError(weightLb, waistIn, metric) {
  if (weightLb != null && (weightLb < 50 || weightLb > 800)) {
    return metric ? "Weight must be between 23 and 363 kg." : "Weight must be between 50 and 800 lb.";
  }
  if (waistIn != null && (waistIn < 10 || waistIn > 100)) {
    return metric ? "Waist must be between 25 and 254 cm." : "Waist must be between 10 and 100 in.";
  }
  return null;
}

function weightOutlier(entries, date, weightLb, metric) {
  if (weightLb == null) return null;
  const previous = entries
    .filter((e) => e.weightLb != null && e.date !== date && e.date < date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!previous) return null;
  const days = (new Date(date) - new Date(previous.date)) / 86400000;
  const deltaLb = +(weightLb - previous.weightLb).toFixed(1);
  if (days <= 14 && Math.abs(deltaLb) >= 8) {
    return metric
      ? { delta: lbToKg(Math.abs(deltaLb)), unit: "kg" }
      : { delta: Math.abs(deltaLb), unit: "lb" };
  }
  return null;
}

function computeStats(entries, target) {
  const weights = entries.filter((e) => e.weightLb != null);
  if (!weights.length) return { currentWeight: null, movingAvg: null, lost: 0, weeksToGo: null };
  const current = weights[weights.length - 1].weightLb;
  const start = weights[0].weightLb;
  const recent = weights.slice(-7);
  const avg = +(recent.reduce((s, e) => s + e.weightLb, 0) / recent.length).toFixed(1);
  const lost = +(start - current).toFixed(1);

  let weeksToGo = null;
  if (weights.length >= 3 && current > target) {
    const first = weights[0];
    const last = weights[weights.length - 1];
    const days = (new Date(last.date) - new Date(first.date)) / 86400000;
    const ratePerWeek = (first.weightLb - last.weightLb) / (days / 7);
    if (ratePerWeek > 0.1) {
      weeksToGo = Math.ceil((current - target) / ratePerWeek);
    }
  }
  return { currentWeight: current, movingAvg: avg, lost, weeksToGo };
}

function renderChart(entries, metric = false) {
  const points = samplePoints(entries.filter((e) => e.weightLb != null), CHART_POINT_LIMIT);
  if (points.length < 2) return "";

  const W = 320, H = 180, PAD = 28;
  const xs = points.map((p) => new Date(p.date).getTime());
  const ys = points.map((p) => metric ? +(p.weightLb / 2.20462).toFixed(1) : p.weightLb);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys) - 1, yMax = Math.max(...ys) + 1;

  const sx = (x) => PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - PAD * 2);
  const sy = (y) => H - PAD - ((y - yMin) / (yMax - yMin || 1)) * (H - PAD * 2);

  const path = points.map((p, i) => `${i ? "L" : "M"} ${sx(xs[i]).toFixed(1)} ${sy(ys[i]).toFixed(1)}`).join(" ");
  const dots = points.map((p, i) => `<circle class="dot" cx="${sx(xs[i]).toFixed(1)}" cy="${sy(ys[i]).toFixed(1)}" r="3" />`).join("");

  const ticks = 4;
  const yLabels = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = yMin + ((yMax - yMin) * i) / ticks;
    return `
      <line class="grid" x1="${PAD}" x2="${W - PAD}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" />
      <text class="lbl" x="4" y="${(sy(v) + 3).toFixed(1)}">${v.toFixed(1)}</text>
    `;
  }).join("");

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Weight trend">
      ${yLabels}
      <path class="line" d="${path}" />
      ${dots}
    </svg>
  `;
}

function samplePoints(points, limit) {
  if (points.length <= limit) return points;
  const last = points.length - 1;
  return Array.from({ length: limit }, (_, i) => points[Math.round((i * last) / (limit - 1))]);
}
