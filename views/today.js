import { getActivePlan, dayLabelFor } from "../lib/plan.js";
import { iconFor, exerciseDemoHtml } from "../data/exercise-icons.js";
import { getMeals } from "../lib/meals.js";
import { greeting } from "../data/motivation.js";
import { waterTargetMl, mlToOz, mealTimes, fmtTime12, toMin, pct, barClass } from "../lib/calc.js";
import { getActiveSuggestions, dismissSuggestion } from "../lib/adaptations.js";
import { applyCoachChanges, planCoachChanges, latestCoachReview, requestCoachReview, COACH_NOTE_TTL_DAYS } from "../lib/coach.js";
import { esc } from "../lib/html.js";
import { confirmForm, toast } from "../lib/modal.js";
import { load, loadApiKey, logWater, update, todayISO, weekdayKey } from "../storage.js";
import { navigate } from "../app.js";
import { aiProgressHtml, setAiProgress } from "../lib/ai-progress.js";

export function renderToday(root) {
  const plan = getActivePlan();
  const dow = weekdayKey();
  const scheduled = plan.splits[dow];
  const today = todayISO();
  const session = load("workouts")[today];
  const split = session ? { type: "lift", day: session.day, label: dayLabelFor(session.day) } : scheduled;
  const exercises = session?.exercises || plan.workouts[split.day] || [];
  const sets = session?.exercises.flatMap(ex => ex.sets) || [];
  const finished = sets.length > 0 && sets.every(set => String(set.r ?? "").trim());
  const settings = load("settings");
  const mealsState = load("meals")[today] || { checked: [], custom: [], waterMl: 0 };
  const targets = settings.targets;
  const metric = settings.units === "metric";
  const waterUnit = metric ? "mL" : "oz";
  const waterTargetMlVal = waterTargetMl(settings.profile, { trainingToday: split.type !== "rest" });
  const showWater = (ml) => metric ? Math.round(ml) : mlToOz(ml);

  const MEALS = getMeals(settings, today);
  const consumed = computeConsumed(mealsState, MEALS);
  const suggestions = getActiveSuggestions();
  const coachReview = latestCoachReview();
  const times = mealTimes(settings.profile?.wakeTime, settings.profile?.sleepTime);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nextMeal = MEALS
    .filter(m => !mealsState.checked.includes(m.id) && times[m.id])
    .map(m => ({ m, t: toMin(times[m.id]) }))
    .filter(x => x.t >= nowMin - 30)
    .sort((a, b) => a.t - b.t)[0];

  root.innerHTML = `
    <p class="today-greeting">${greeting()}</p>
    <section class="card">
      ${split.type === "rest" ? "<h2>Rest day</h2>" : `
        <div class="spread today-workout-heading">
          <h2 style="margin:0">Today's workout</h2>
          <span class="muted">${esc(split.label)}</span>
        </div>
        ${split.type === "lift" ? `
          <p class="hint">${exercises.length} exercises</p>
          <button class="primary today-action" id="go-workout">${finished ? "View completed workout" : session ? "Resume workout" : "Start workout"}</button>
          <details class="compact-details"><summary>View exercises</summary>${renderTrainingSummary(split, { [split.day]: exercises })}</details>
        ` : renderTrainingSummary(split, plan.workouts)}
      `}
      <button class="ghost today-action" id="update-workout">Edit weekly plan</button>
    </section>
    ${suggestions.map(renderSuggestion).join("")}

    ${settings.mealSetupPending ? `<section class="card"><h2>Meals</h2>
      <button class="today-action" id="go-meals">Set up meals</button></section>` : `
    <section class="card">
      <div class="spread">
        <h2 style="margin:0">Today's meals</h2>
        <span class="muted">${mealsState.checked.length}/${MEALS.length} eaten</span>
      </div>
      <div style="margin-top:10px">
        <div class="spread small"><span>Calories</span><span><b>${consumed.kcal}</b> / ${targets.kcal}</span></div>
        <div class="bar ${barClass(consumed.kcal, targets.kcal)}" style="margin-top:4px"><span style="width:${pct(consumed.kcal, targets.kcal)}%"></span></div>
      </div>
      <details class="compact-details"><summary>Nutrition details</summary>
      <div class="macros-grid">
        <div class="m"><b>${consumed.p}g</b><span>Protein / ${targets.p}g</span></div>
        <div class="m"><b>${consumed.f}g</b><span>Fat / ${targets.f}g</span></div>
        <div class="m"><b>${consumed.c}g</b><span>Carbs / ${targets.c}g</span></div>
        <div class="m"><b>${targets.kcal - consumed.kcal}</b><span>kcal left</span></div>
      </div>
      </details>
      ${nextMeal ? `
        <div class="next-meal">
          <span class="muted small">Next up</span>
          <div><b>${esc(nextMeal.m.name)}</b> · <span class="meal-time">${esc(fmtTime12(times[nextMeal.m.id]))}</span></div>
          <div class="hint">${esc(nextMeal.m.items)}</div>
          <button class="primary today-action" id="mark-meal">Mark as eaten</button>
        </div>
      ` : ""}
      <button class="today-action" id="go-meals">Open meal plan</button>
    </section>`}

    <section class="card today-hydration">
      <div class="water-stats-row">
        <h2>Hydration</h2>
        <span><b class="water-amount-current">${showWater(mealsState.waterMl || 0)}</b> / ${showWater(waterTargetMlVal)} ${waterUnit} (${pct(mealsState.waterMl || 0, waterTargetMlVal)}%)</span>
      </div>
      <div class="water-bar-track">
        <div class="water-bar-fill" style="width:${pct(mealsState.waterMl || 0, waterTargetMlVal)}%"></div>
      </div>
      <div class="hint" style="margin:2px 0 6px 0;font-size:12px">
        ${(mealsState.waterMl || 0) >= waterTargetMlVal ? "✨ Daily target hit! Hydration on point." : `${showWater(Math.max(0, waterTargetMlVal - (mealsState.waterMl || 0)))} ${waterUnit} left today`}
      </div>

      <div class="water-grid">
        <button class="water-tile" type="button" data-add-water="${metric ? 250 : 237}" title="Add 1 glass">
          <span class="water-tile-icon">🥛</span>
          <span class="water-tile-val">+${metric ? "250" : "8"}</span>
          <span class="water-tile-sub">Glass</span>
        </button>
        <button class="water-tile" type="button" data-add-water="${metric ? 500 : 473}" title="Add 1 bottle">
          <span class="water-tile-icon">💧</span>
          <span class="water-tile-val">+${metric ? "500" : "16"}</span>
          <span class="water-tile-sub">Bottle</span>
        </button>
        <button class="water-tile" type="button" data-add-water="${metric ? 750 : 710}" title="Add 1 shaker">
          <span class="water-tile-icon">🥤</span>
          <span class="water-tile-val">+${metric ? "750" : "24"}</span>
          <span class="water-tile-sub">Shaker</span>
        </button>
        <button class="water-tile undo-tile" type="button" data-add-water="0" title="Undo last drink" ${mealsState.lastWaterMl ? "" : "disabled"}>
          <span class="water-tile-icon">↩️</span>
          <span class="water-tile-val">${mealsState.lastWaterMl ? "−" + showWater(mealsState.lastWaterMl) : "—"}</span>
          <span class="water-tile-sub">Undo</span>
        </button>
      </div>
    </section>

    <details class="card today-coach">
      <summary>Coach review</summary>
      <p class="hint">Review recent meals, workouts, and weight trends using your own OpenAI key.</p>
      ${loadApiKey()
        ? `<button class="primary today-action" id="coach-review">Analyze progress</button>`
        : `<button class="primary today-action" id="coach-review" data-needs-key>Set up AI coach key</button>`}
      ${aiProgressHtml("coach-ai-progress")}
      ${coachReview ? `<details class="compact-details"><summary>Latest coach review</summary>${renderCoachReviewSummary(coachReview)}</details>` : ""}
    </details>
  `;

  root.querySelector("#mark-meal")?.addEventListener("click", () => {
    update("meals", all => {
      const state = all[today] || mealsState;
      return { ...all, [today]: { ...state, checked: [...new Set([...state.checked, nextMeal.m.id])] } };
    });
    toast(`${nextMeal.m.name} marked as eaten`);
    renderToday(root);
  });
  root.querySelector("#go-meals")?.addEventListener("click", () => settings.mealSetupPending ? navigate("settings", { section: "meals" }) : navigate("meals"));
  root.querySelector("#go-workout")?.addEventListener("click", () => navigate("workout"));
  root.querySelector("#update-workout")?.addEventListener("click", () => navigate("settings", { section: "workout" }));

  for (const b of root.querySelectorAll("button[data-add-water]")) {
    b.addEventListener("click", () => {
      const ml = logWater(today, Number(b.dataset.addWater));
      const absAmount = showWater(Math.abs(ml));
      const msg = ml > 0 ? `+${absAmount} ${waterUnit} water logged 💧` : `−${absAmount} ${waterUnit} removed`;
      toast(msg);
      renderToday(root);
    });
  }
  root.querySelector("#coach-review")?.addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    if (btn.hasAttribute("data-needs-key")) {
      navigate("settings", { section: "ai" });
      return;
    }
    const previousLabel = btn.textContent;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = "Analyzing progress…";
    const progress = root.querySelector("#coach-ai-progress");
    setAiProgress(progress, "Checking your recent trends…");
    try {
      const rec = await requestCoachReview().finally(() => {
        btn.removeAttribute("aria-busy");
        btn.textContent = previousLabel;
      });
      setAiProgress(progress, "Review ready", "done");
      const planned = planCoachChanges(rec);
      const hasChanges = !!planned.diet || planned.swaps.length > 0;
      const selection = await confirmForm(coachReviewHtml(planned), {
        title: "Coach review",
        okLabel: hasChanges ? "Apply selected" : "Save notes",
        collect: (wrap) => ({
          diet: wrap.querySelector("#coach-apply-diet")?.checked !== false,
          swaps: [...wrap.querySelectorAll("input[data-swap-key]")]
            .filter((el) => el.checked)
            .map((el) => el.dataset.swapKey),
        }),
      });
      if (!selection) return;
      const applied = applyCoachChanges(planned, selection);
      toast(describeApplied(applied));
      renderToday(root);
    } catch (err) {
      setAiProgress(progress, err.message || "Coach review failed. Try again.", "error");
    } finally {
      if (document.contains(btn)) {
        btn.disabled = false;
      }
    }
  });

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

// Review sheet: exactly what will change, each item opt-out-able, with advice
// that changes nothing kept visually separate. All model text is escaped — it
// is untrusted input rendered into a raw-HTML modal body.
function coachReviewHtml(planned) {
  const { recommendation: rec, diet, swaps, advisory } = planned;
  const out = [`<p class="coach-summary">${esc(rec.summary)}</p>`];

  if (rec.riskFlags.length) {
    out.push(`
      <div class="coach-flags">
        <b>Safety flags</b>
        <ul>${rec.riskFlags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      </div>`);
  }

  out.push(`<h3 class="coach-h">Changes to apply</h3>`);
  if (!diet && !swaps.length) {
    out.push(`<p class="hint">None — the coach recommends holding your current targets and plan.</p>`);
  }
  if (diet) {
    out.push(`
      <label class="coach-opt">
        <input type="checkbox" id="coach-apply-diet" checked />
        <span>
          <b>Update daily targets</b>
          <span class="coach-delta">${esc(diet.before.kcal)} → ${esc(diet.after.kcal)} kcal · ${esc(diet.before.p)} → ${esc(diet.after.p)} g protein</span>
          <span class="coach-why">${esc(diet.reason)}</span>
          <span class="coach-why">Your meal plan regenerates to match the new targets.</span>
        </span>
      </label>`);
  }
  for (const swap of swaps) {
    out.push(`
      <label class="coach-opt">
        <input type="checkbox" data-swap-key="${esc(swap.key)}" checked />
        <span>
          <b>Swap ${esc(swap.fromName)} → ${esc(swap.toName)}</b>
          <span class="coach-delta">${esc(dayLabelFor(swap.dayKey))}</span>
          <span class="coach-why">${esc(swap.reason)}</span>
        </span>
      </label>`);
  }

  if (advisory.length) {
    out.push(`<h3 class="coach-h">Advice — nothing changes</h3>`);
    out.push(`<p class="hint">These show as tips beside the exercise on the Workout tab. Your logged sets still drive the actual load and rep targets.</p>`);
    out.push(`<ul class="coach-advice">${advisory.map((n) => `
      <li>
        <b>${esc(n.exercise)}</b> — ${esc(actionLabel(n.action))}: ${esc(n.target)}
        <span class="coach-why">${esc(n.reason)}</span>
      </li>`).join("")}</ul>`);
  }

  out.push(`<p class="coach-msg">${esc(rec.userMessage)}</p>`);
  return out.join("");
}

function describeApplied(applied) {
  const bits = [];
  if (applied.targetChanged) bits.push(`targets → ${applied.targets.kcal} kcal`);
  if (applied.appliedSwaps.length) {
    bits.push(`${applied.appliedSwaps.length} exercise${applied.appliedSwaps.length > 1 ? "s" : ""} swapped`);
  }
  return bits.length ? `Applied: ${bits.join(" · ")}` : "Saved coach notes";
}

function actionLabel(action) {
  return {
    increase_reps: "increase reps",
    increase_load: "increase load",
    hold: "hold",
    deload: "deload",
    swap: "swap",
    rest: "rest",
  }[action] || "hold";
}

export function renderCoachReviewSummary(review) {
  const notes = review.stale ? [] : review.workoutNotes.slice(0, 2);
  const age = review.stale ? " · outdated" : "";
  return `
    <div class="next-meal">
      <span class="muted small">Latest review${review.ts ? ` · ${esc(new Date(review.ts).toLocaleDateString())}` : ""}${age}</span>
      <div><b>${esc(review.summary)}</b></div>
      ${review.targets ? `<div class="hint">Targets: ${esc(review.targets.kcal)} kcal, ${esc(review.targets.p)}g protein</div>` : ""}
      ${review.appliedSwaps?.length ? `<div class="hint">Swapped: ${esc(review.appliedSwaps.map(s => `${s.from} → ${s.to}`).join(", "))}</div>` : ""}
      ${review.stale ? `<div class="hint">Older than ${COACH_NOTE_TTL_DAYS} days — run a new analysis for current advice.</div>` : ""}
      ${notes.length ? `
        <ul class="today-ex-list" style="margin-top:8px">
          ${notes.map((note) => `
            <li>
              <div style="flex:1">
                <div><b>${esc(note.exercise)}</b></div>
                <div class="meta">${esc(actionLabel(note.action))}: ${esc(note.target)}</div>
              </div>
            </li>
          `).join("")}
        </ul>
      ` : ""}
    </div>
  `;
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
  if (split.type === "cardio") {
    return `
      <div class="cardio-block">
        <span class="ex-icon-wrap">${iconFor(split.label, "cardio")}</span>
        <div>
          <p class="muted" style="margin:0">${esc(split.detail || "Conditioning day — treadmill.")}</p>
          ${exerciseDemoHtml(split.label)}
        </div>
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
            <div class="meta">${Array.isArray(e.sets) ? `${e.sets.length} sets` : `${esc(e.sets)}×${esc(e.reps)}`}</div>
            ${exerciseDemoHtml(e.name)}
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
