import { getActivePlan } from "../lib/plan.js";
import { iconFor } from "../data/exercise-icons.js";
import { getMeals } from "../lib/meals.js";
import { dailyMotivation, greeting } from "../data/motivation.js";
import { waterTargetMl, mlToOz, mealTimes, fmtTime12, toMin, pct, barClass } from "../lib/calc.js";
import { getActiveSuggestions, dismissSuggestion } from "../lib/adaptations.js";
import { esc } from "../lib/html.js";
import { load, todayISO, weekdayKey } from "../storage.js";
import { navigate } from "../app.js";

export function renderToday(root) {
  const plan = getActivePlan();
  const dow = weekdayKey();
  const split = plan.splits[dow];
  const today = todayISO();
  const settings = load("settings");
  const mealsState = load("meals")[today] || { checked: [], custom: [], waterMl: 0 };
  const targets = settings.targets;
  const metric = settings.units === "metric";
  const waterUnit = metric ? "mL" : "oz";
  const waterTargetMlVal = waterTargetMl(settings.profile, { trainingToday: split.type !== "rest" });
  const showWater = (ml) => metric ? Math.round(ml) : mlToOz(ml);

  const MEALS = getMeals(settings);
  const consumed = computeConsumed(mealsState, MEALS);
  const suggestions = getActiveSuggestions();
  const times = mealTimes(settings.profile?.wakeTime, settings.profile?.sleepTime);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nextMeal = MEALS
    .filter(m => !mealsState.checked.includes(m.id) && times[m.id])
    .map(m => ({ m, t: toMin(times[m.id]) }))
    .filter(x => x.t >= nowMin - 30)
    .sort((a, b) => a.t - b.t)[0];

  root.innerHTML = `
    <section class="card welcome">
      <div class="welcome-greeting">${greeting()} 👋</div>
      <p class="welcome-quote">${dailyMotivation()}</p>
    </section>
    ${suggestions.map(renderSuggestion).join("")}
    <section class="card">
      <h2>${esc(split.label)}</h2>
      ${renderTrainingSummary(split, plan.workouts)}
      ${split.type === "lift"
        ? `<button class="primary" id="go-workout" style="margin-top:10px;width:100%">Start workout →</button>`
        : ""}
    </section>

    <section class="card">
      <div class="spread">
        <h2 style="margin:0">Today's meals</h2>
        <span class="muted">${mealsState.checked.length}/${MEALS.length} eaten</span>
      </div>
      <div style="margin-top:10px">
        <div class="spread small"><span>Calories</span><span><b>${consumed.kcal}</b> / ${targets.kcal}</span></div>
        <div class="bar ${barClass(consumed.kcal, targets.kcal)}" style="margin-top:4px"><span style="width:${pct(consumed.kcal, targets.kcal)}%"></span></div>
      </div>
      <div class="macros-grid">
        <div class="m"><b>${consumed.p}g</b><span>Protein / ${targets.p}g</span></div>
        <div class="m"><b>${consumed.f}g</b><span>Fat / ${targets.f}g</span></div>
        <div class="m"><b>${consumed.c}g</b><span>Carbs / ${targets.c}g</span></div>
        <div class="m"><b>${targets.kcal - consumed.kcal}</b><span>kcal left</span></div>
      </div>
      <div style="margin-top:12px">
        <div class="spread small"><span>💧 Water</span><span><b>${showWater(mealsState.waterMl || 0)}</b> / ${showWater(waterTargetMlVal)} ${waterUnit}</span></div>
        <div class="bar" style="margin-top:4px"><span style="width:${pct(mealsState.waterMl || 0, waterTargetMlVal)}%"></span></div>
      </div>
      ${nextMeal ? `
        <div class="next-meal">
          <span class="muted small">Next up</span>
          <div><b>${esc(nextMeal.m.name)}</b> · <span class="meal-time">${esc(fmtTime12(times[nextMeal.m.id]))}</span></div>
          <div class="hint">${esc(nextMeal.m.items)}</div>
        </div>
      ` : ""}
      <button class="ghost" id="go-meals" style="margin-top:10px;width:100%">Open meal plan →</button>
    </section>
  `;

  root.querySelector("#go-meals")?.addEventListener("click", () => navigate("meals"));
  root.querySelector("#go-workout")?.addEventListener("click", () => navigate("workout"));

  for (const btn of root.querySelectorAll("button[data-sugg-apply]")) {
    btn.addEventListener("click", () => {
      const s = suggestions.find(x => x.id === btn.dataset.suggApply);
      s?.apply();
      renderToday(root);
    });
  }
  for (const btn of root.querySelectorAll("button[data-sugg-dismiss]")) {
    btn.addEventListener("click", () => {
      dismissSuggestion(btn.dataset.suggDismiss);
      renderToday(root);
    });
  }
}

function renderSuggestion(s) {
  return `
    <section class="card suggestion suggestion-${esc(s.severity)}">
      <div class="sugg-title">${esc(s.title)}</div>
      <div class="sugg-body">${esc(s.body)}</div>
      <div class="row" style="margin-top:10px;gap:8px">
        <button class="primary" data-sugg-apply="${esc(s.id)}">Accept</button>
        <button class="ghost" data-sugg-dismiss="${esc(s.id)}">Dismiss</button>
      </div>
    </section>
  `;
}

function renderTrainingSummary(split, workouts) {
  if (split.type === "rest") {
    return `<p class="muted" style="margin:6px 0 0">Recovery day. Walk, stretch, sleep.</p>`;
  }
  if (split.type === "cardio") {
    return `
      <div class="cardio-block">
        <span class="ex-icon-wrap">${iconFor(null, "cardio")}</span>
        <p class="muted" style="margin:0">${esc(split.detail || "Conditioning day — treadmill.")}</p>
      </div>`;
  }
  if (split.type === "soccer") { // legacy fallback plan
    return `<p class="muted" style="margin:6px 0 0">Game day. Hydrate, warm up your hamstrings.</p>`;
  }
  const exercises = workouts[split.day] || [];
  return `
    <ul class="today-ex-list">
      ${exercises.map(e => `
        <li>
          <span class="ex-icon-wrap">${iconFor(e.name, e.category)}</span>
          <div style="flex:1">
            <div><b>${esc(e.name)}</b></div>
            <div class="meta">${esc(e.sets)}×${esc(e.reps)}</div>
          </div>
        </li>
      `).join("")}
    </ul>
  `;
}

function computeConsumed(state, meals) {
  const total = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const id of state.checked) {
    const m = meals.find(x => x.id === id);
    if (m) { total.kcal += m.kcal; total.p += m.p; total.f += m.f; total.c += m.c; }
  }
  for (const c of state.custom) {
    total.kcal += +c.kcal || 0; total.p += +c.p || 0; total.f += +c.f || 0; total.c += +c.c || 0;
  }
  return total;
}
