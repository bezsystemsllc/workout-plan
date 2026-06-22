import { load, update, exportJSON, importJSON, todayISO } from "../storage.js";
import { lbToKg, kgToLb, inToCm, cmToIn } from "../lib/calc.js";
import { notify, confirmAction, toast } from "../lib/modal.js";
import { esc } from "../lib/html.js";

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

  function render() {
    const entries = [...load("progress")].sort((a, b) => a.date.localeCompare(b.date));
    const stats = computeStats(entries, settings.targetWeightLb);
    const visibleHistory = entries.slice(-HISTORY_ROW_LIMIT).reverse();
    const hiddenHistoryCount = Math.max(0, entries.length - visibleHistory.length);

    root.innerHTML = `
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

      <section class="card">
        <h2>Backup</h2>
        <p class="hint">localStorage is per-browser. Export regularly so you don't lose data if you clear cookies.</p>
        <div class="grid-2">
          <button id="p-export">Export JSON</button>
          <button id="p-import">Import JSON</button>
        </div>
        <input type="file" id="p-file" accept="application/json" hidden />
      </section>
    `;

    root.querySelector("#p-save").addEventListener("click", async () => {
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
        const filtered = list.filter(e => e.date !== date);
        filtered.push({ date, weightLb, waistIn });
        return filtered;
      });
      toast(`Saved entry for ${date}`);
      render();
    });

    for (const btn of root.querySelectorAll("button[data-rm-date]")) {
      btn.addEventListener("click", async () => {
        const d = btn.dataset.rmDate;
        const ok = await confirmAction(`Delete entry for ${d}?`, {
          title: "Delete entry?", okLabel: "Delete", danger: true,
        });
        if (!ok) return;
        update("progress", (list) => list.filter(e => e.date !== d));
        render();
      });
    }

    root.querySelector("#p-export").addEventListener("click", () => {
      const blob = new Blob([exportJSON()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `tempo-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    root.querySelector("#p-import").addEventListener("click", () => root.querySelector("#p-file").click());
    root.querySelector("#p-file").addEventListener("change", async (e) => {
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

function validISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T12:00:00");
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
    .filter(e => e.weightLb != null && e.date !== date && e.date < date)
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
  const weights = entries.filter(e => e.weightLb != null);
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
  const points = samplePoints(entries.filter(e => e.weightLb != null), CHART_POINT_LIMIT);
  if (points.length < 2) return "";

  const W = 320, H = 180, PAD = 28;
  const xs = points.map(p => new Date(p.date).getTime());
  const ys = points.map(p => metric ? +(p.weightLb / 2.20462).toFixed(1) : p.weightLb);
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
