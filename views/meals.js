import { getMeals } from "../lib/meals.js";
import { getActivePlan } from "../lib/plan.js";
import { load, update, todayISO } from "../storage.js";
import { waterTargetMl, mlToOz, mealTimes, fmtTime12, toMin, pct, barClass } from "../lib/calc.js";
import { dateNavHtml, wireDateNav } from "../lib/date-nav.js";
import { notify, toast } from "../lib/modal.js";

export function renderMeals(root) {
  const today = todayISO();
  let viewedDate = today;
  const settings = load("settings");
  const targets = settings.targets;
  const profile = settings.profile;
  const metric = settings.units === "metric";
  const waterUnit = metric ? "mL" : "oz";
  const waterStep = metric ? 250 : 8;
  const showWater = (ml) => metric ? Math.round(ml) : mlToOz(ml);

  // Meals from the food-preference generator (or scaled static template if unset).
  let MEALS = getMeals(settings);
  const generated = !!settings.foodPrefs;

  function getState() {
    const all = load("meals");
    const s = all[viewedDate] || { checked: [], custom: [], waterMl: 0 };
    if (s.waterMl == null) s.waterMl = 0;
    return s;
  }

  function setState(next) {
    update("meals", (all) => ({ ...all, [viewedDate]: next }));
  }

  function totals(state) {
    const t = { kcal: 0, p: 0, f: 0, c: 0 };
    for (const id of state.checked) {
      const m = MEALS.find(x => x.id === id);
      if (m) { t.kcal += m.kcal; t.p += m.p; t.f += m.f; t.c += m.c; }
    }
    for (const c of state.custom) {
      t.kcal += +c.kcal || 0; t.p += +c.p || 0; t.f += +c.f || 0; t.c += +c.c || 0;
    }
    return t;
  }

  function render() {
    const state = getState();
    const t = totals(state);
    const remaining = targets.kcal - t.kcal;
    const isToday = viewedDate === today;
    const dow = new Date(viewedDate + "T12:00:00").getDay();
    const dowKey = ["sun","mon","tue","wed","thu","fri","sat"][dow];
    const trainingDay = getActivePlan().splits[dowKey].type !== "rest";
    const waterTargetMlVal = waterTargetMl(profile, { trainingToday: trainingDay });
    const times = mealTimes(profile?.wakeTime, profile?.sleepTime);
    const cutoff = fmtTime12(times["evening"]);
    const nowMin = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : -1;

    root.innerHTML = `
      ${dateNavHtml(viewedDate)}
      <section class="card">
        <div class="spread"><h2 style="margin:0">${isToday ? "Today" : "Day view"}</h2><span class="muted">${viewedDate}</span></div>
        <div style="margin-top:10px">
          <div class="spread small"><span>Calories</span><span><b>${t.kcal}</b> / ${targets.kcal}</span></div>
          <div class="bar ${barClass(t.kcal, targets.kcal)}" style="margin-top:4px"><span style="width:${pct(t.kcal, targets.kcal)}%"></span></div>
          <div class="hint">${remaining >= 0 ? `${remaining} kcal remaining` : `${-remaining} kcal over target`}</div>
        </div>
        <div class="macros-grid">
          <div class="m"><span class="m-label">Calories</span><b>${t.kcal}</b><span class="m-target">/ ${targets.kcal}</span></div>
          <div class="m"><span class="m-label">Protein</span><b>${t.p}g</b><span class="m-target">/ ${targets.p}g</span></div>
          <div class="m"><span class="m-label">Fat</span><b>${t.f}g</b><span class="m-target">/ ${targets.f}g</span></div>
          <div class="m"><span class="m-label">Carbs</span><b>${t.c}g</b><span class="m-target">/ ${targets.c}g</span></div>
        </div>
      </section>

      <section class="card">
        <div class="spread">
          <h2 style="margin:0">💧 Water</h2>
          <span class="muted small">${trainingDay ? "training day +" : ""}${profile?.goal === "fat_loss" ? " cut bonus" : profile?.goal === "muscle" ? " bulk bonus" : ""}</span>
        </div>
        <div style="margin-top:10px">
          <div class="spread small"><span>Intake</span><span><b>${showWater(state.waterMl)}</b> / ${showWater(waterTargetMlVal)} ${waterUnit}</span></div>
          <div class="bar" style="margin-top:4px"><span style="width:${pct(state.waterMl, waterTargetMlVal)}%"></span></div>
          <div class="hint">${state.waterMl >= waterTargetMlVal ? "Target hit. Nice." : `${showWater(waterTargetMlVal - state.waterMl)} ${waterUnit} to go`}</div>
        </div>
        <div class="row" style="margin-top:10px;justify-content:space-between;gap:6px">
          <button id="w-minus" style="flex:1">− ${waterStep} ${waterUnit}</button>
          <button class="primary" id="w-cup" style="flex:1.4">+ 1 cup (${metric ? "250 mL" : "8 oz"})</button>
          <button id="w-bottle" style="flex:1">+ ${metric ? "500 mL" : "16 oz"}</button>
        </div>
      </section>

      <section class="card">
        <div class="spread">
          <h2 style="margin:0">Meal plan</h2>
          ${generated ? `<button class="ghost small" id="shuffle-meals" style="min-height:32px;padding:4px 10px">🎲 Shuffle</button>` : ""}
        </div>
        <div class="hint">Times based on wake ${fmtTime12(profile?.wakeTime || "06:30")} / bed ${fmtTime12(profile?.sleepTime || "22:30")}. Last bite by <b>${cutoff}</b>. Adjust in Settings.</div>
        ${generated ? `<div class="hint">Built from your food preferences to hit your macros — portions are estimates, tweak to taste.</div>` : ""}
        <ul class="checklist">
          ${MEALS.map(m => {
            const done = state.checked.includes(m.id);
            const t = times[m.id];
            const isNext = !done && t && Math.abs(toMin(t) - nowMin) < 90 && toMin(t) >= nowMin - 30;
            return `
              <li class="${done ? "done" : ""} ${isNext ? "next" : ""}">
                <input type="checkbox" data-id="${m.id}" ${done ? "checked" : ""} />
                <div style="flex:1">
                  <div class="meal-name">${m.name} ${t ? `<span class="meal-time">${fmtTime12(t)}</span>` : ""}</div>
                  <div class="meal-macros">${m.items}</div>
                  <div class="meal-macros">${m.kcal} kcal · ${m.p}g protein · ${m.f}g fat · ${m.c}g carbs</div>
                </div>
              </li>
            `;
          }).join("")}
        </ul>
      </section>

      <section class="card">
        <h2>Off-plan items</h2>
        ${state.custom.length === 0
          ? `<p class="empty small">Nothing logged off-plan today.</p>`
          : `
            <table class="entry-table">
              <thead><tr><th>Item</th><th class="num">kcal</th><th class="num">Protein</th><th class="num">Fat</th><th class="num">Carbs</th><th></th></tr></thead>
              <tbody>
                ${state.custom.map((c, i) => `
                  <tr>
                    <td>${escape(c.name)}</td>
                    <td class="num">${c.kcal}</td>
                    <td class="num">${c.p}</td>
                    <td class="num">${c.f}</td>
                    <td class="num">${c.c}</td>
                    <td><button class="ghost small" data-rm="${i}" style="min-height:32px;padding:4px 8px">✕</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `}
        <div class="grid-2" style="margin-top:10px">
          <div><label>Name</label><input id="cf-name" type="text" placeholder="Pizza slice" /></div>
          <div><label>kcal</label><input id="cf-kcal" type="number" inputmode="numeric" min="0" /></div>
          <div><label>Protein (g)</label><input id="cf-p" type="number" inputmode="numeric" min="0" /></div>
          <div><label>Fat (g)</label><input id="cf-f" type="number" inputmode="numeric" min="0" /></div>
          <div><label>Carbs (g)</label><input id="cf-c" type="number" inputmode="numeric" min="0" /></div>
          <div style="display:flex;align-items:flex-end"><button class="primary" id="cf-add" style="width:100%">Add item</button></div>
        </div>
      </section>
    `;

    wireDateNav(root, viewedDate, (next) => {
      viewedDate = next;
      render();
    });

    const bumpWater = (deltaMl) => {
      const s = getState();
      s.waterMl = Math.max(0, s.waterMl + deltaMl);
      setState(s);
      render();
    };
    root.querySelector("#w-cup")?.addEventListener("click", () => bumpWater(250));
    root.querySelector("#w-bottle")?.addEventListener("click", () => bumpWater(500));
    root.querySelector("#w-minus")?.addEventListener("click", () => bumpWater(metric ? -250 : -237));

    root.querySelector("#shuffle-meals")?.addEventListener("click", () => {
      const seed = (settings.foodPrefs.seed || 0) + 1;
      settings.foodPrefs = { ...settings.foodPrefs, seed };
      update("settings", (s) => ({ ...s, foodPrefs: { ...s.foodPrefs, seed } }));
      MEALS = getMeals(settings);
      toast("Fresh meals generated");
      render();
    });

    for (const cb of root.querySelectorAll('input[type="checkbox"][data-id]')) {
      cb.addEventListener("change", (e) => {
        const id = e.target.dataset.id;
        const s = getState();
        s.checked = e.target.checked
          ? [...new Set([...s.checked, id])]
          : s.checked.filter(x => x !== id);
        setState(s);
        render();
      });
    }

    for (const btn of root.querySelectorAll('button[data-rm]')) {
      btn.addEventListener("click", (e) => {
        const i = +e.currentTarget.dataset.rm;
        const s = getState();
        s.custom.splice(i, 1);
        setState(s);
        render();
      });
    }

    root.querySelector("#cf-add")?.addEventListener("click", async () => {
      const name = root.querySelector("#cf-name").value.trim();
      const kcal = +root.querySelector("#cf-kcal").value || 0;
      if (!name || !kcal) { await notify("Need at least a name and calories.", { title: "Missing info" }); return; }
      const item = {
        name,
        kcal,
        p: +root.querySelector("#cf-p").value || 0,
        f: +root.querySelector("#cf-f").value || 0,
        c: +root.querySelector("#cf-c").value || 0,
      };
      const s = getState();
      s.custom.push(item);
      setState(s);
      toast(`Added ${name} (${kcal} kcal)`);
      render();
    });
  }

  render();
}

function escape(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
