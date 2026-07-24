import { getMeals } from "../lib/meals.js";
import { getActivePlan } from "../lib/plan.js";
import { load, loadApiKey, update, todayISO } from "../storage.js";
import { waterTargetMl, mlToOz, mealTimes, fmtTime12, toMin, pct, barClass } from "../lib/calc.js";
import { dateNavHtml, wireDateNav } from "../lib/date-nav.js";
import { esc } from "../lib/html.js";
import { confirmForm, notify, toast } from "../lib/modal.js";
import { analyzeMealPhoto } from "../lib/meal-photo.js";

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

  // Photo logging runs on the user's own key only — the image goes straight to
  // OpenAI from this device and is never stored.
  function photoCardHtml() {
    if (!loadApiKey()) {
      return `<p class="hint" style="margin-top:10px">📷 Want to log a meal from a photo? Add your own OpenAI key in Settings — the photo goes straight to OpenAI from this device and is never saved.</p>`;
    }
    return `
      <button class="ghost" id="photo-log" style="width:100%;margin-top:10px">📷 Log from a photo</button>
      <input type="file" id="photo-input" accept="image/*" capture="environment" hidden />
      <p class="hint">Estimated from the photo — check the numbers before adding. Portion size from a photo is a guess.</p>
    `;
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
    const savedFoods = load("savedFoods");
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
                    <td>${esc(c.name)}</td>
                    <td class="num">${c.kcal}</td>
                    <td class="num">${c.p}</td>
                    <td class="num">${c.f}</td>
                    <td class="num">${c.c}</td>
                    <td><button class="ghost small" data-rm="${i}" aria-label="Remove ${esc(c.name)}" style="min-height:32px;padding:4px 8px">✕</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `}
        ${photoCardHtml()}
        ${savedFoods.length ? `
          <label style="margin-top:10px">Quick-add from My Foods</label>
          <div class="row" style="gap:8px">
            <select id="cf-saved" style="flex:1">
              <option value="">— pick a saved food —</option>
              ${savedFoods.map((f, i) => `<option value="${i}">${esc(f.name)} · ${esc(f.kcal)} kcal</option>`).join("")}
            </select>
            <button class="ghost" id="cf-saved-rm" title="Forget selected food" aria-label="Forget selected food" style="min-width:44px">🗑</button>
          </div>
        ` : ""}
        <div class="grid-2" style="margin-top:10px">
          <div><label>Name</label><input id="cf-name" type="text" placeholder="Pizza slice" /></div>
          <div><label>kcal</label><input id="cf-kcal" type="number" inputmode="numeric" min="0" /></div>
          <div><label>Protein (g)</label><input id="cf-p" type="number" inputmode="numeric" min="0" /></div>
          <div><label>Fat (g)</label><input id="cf-f" type="number" inputmode="numeric" min="0" /></div>
          <div><label>Carbs (g)</label><input id="cf-c" type="number" inputmode="numeric" min="0" /></div>
          <div><label>Qty</label><input id="cf-qty" type="number" inputmode="decimal" step="0.25" min="0.25" value="1" /></div>
        </div>
        <label class="cf-save-row"><input type="checkbox" id="cf-save" checked /> Save to My Foods for next time</label>
        <button class="primary" id="cf-add" style="width:100%;margin-top:10px">Add item</button>
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

    root.querySelector("#cf-saved")?.addEventListener("change", (e) => {
      if (e.target.value === "") return;
      const f = savedFoods[+e.target.value];
      root.querySelector("#cf-name").value = f.name;
      root.querySelector("#cf-kcal").value = f.kcal;
      root.querySelector("#cf-p").value = f.p;
      root.querySelector("#cf-f").value = f.f;
      root.querySelector("#cf-c").value = f.c;
      root.querySelector("#cf-qty").value = 1;
    });
    root.querySelector("#cf-saved-rm")?.addEventListener("click", () => {
      const i = root.querySelector("#cf-saved").value;
      if (i === "") return;
      const name = savedFoods[+i].name;
      update("savedFoods", (list) => list.filter((f) => f.name.toLowerCase() !== name.toLowerCase()));
      toast(`Removed ${name} from My Foods`);
      render();
    });

    root.querySelector("#cf-add")?.addEventListener("click", async () => {
      const name = root.querySelector("#cf-name").value.trim();
      const kcal = +root.querySelector("#cf-kcal").value || 0;
      if (!name || !kcal) { await notify("Need at least a name and calories.", { title: "Missing info" }); return; }
      const qty = Math.max(0.25, +root.querySelector("#cf-qty").value || 1);
      const base = {
        name, kcal,
        p: +root.querySelector("#cf-p").value || 0,
        f: +root.querySelector("#cf-f").value || 0,
        c: +root.querySelector("#cf-c").value || 0,
      };
      const s = getState();
      s.custom.push({
        name: qty !== 1 ? `${name} ×${qty}` : name,
        kcal: Math.round(base.kcal * qty),
        p: Math.round(base.p * qty),
        f: Math.round(base.f * qty),
        c: Math.round(base.c * qty),
      });
      setState(s);
      if (root.querySelector("#cf-save").checked) {
        update("savedFoods", (list) => {
          const key = name.toLowerCase();
          return [...list.filter((f) => f.name.toLowerCase() !== key), base].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
      toast(`Added ${name}${qty !== 1 ? ` ×${qty}` : ""}`);
      render();
    });

    const photoInput = root.querySelector("#photo-input");
    root.querySelector("#photo-log")?.addEventListener("click", () => photoInput?.click());
    photoInput?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // let the same photo be picked again after a cancel
      if (!file) return;

      const btn = root.querySelector("#photo-log");
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Reading photo…";
      let result;
      try {
        result = await analyzeMealPhoto(loadApiKey(), file);
      } catch (err) {
        await notify(err.message || "Couldn't read that photo.", { title: "Photo not analyzed" });
        return;
      } finally {
        if (document.contains(btn)) { btn.disabled = false; btn.textContent = label; }
      }

      if (!result.items.length) {
        await notify(result.note || "No food was recognized in that photo. Try a clearer, closer shot.", { title: "Nothing to add" });
        return;
      }

      const chosen = await confirmForm(photoReviewHtml(result), {
        title: "Add from photo",
        okLabel: "Add selected",
        collect: (wrap) => [...wrap.querySelectorAll("[data-item-row]")]
          .filter((row) => row.querySelector("input[type=checkbox]").checked)
          .map((row) => ({
            name: row.dataset.name,
            kcal: Math.max(1, Math.round(+row.querySelector("[data-f=kcal]").value || 0)),
            p: Math.max(0, Math.round(+row.querySelector("[data-f=p]").value || 0)),
            f: Math.max(0, Math.round(+row.querySelector("[data-f=f]").value || 0)),
            c: Math.max(0, Math.round(+row.querySelector("[data-f=c]").value || 0)),
          })),
      });
      if (!chosen || !chosen.length) return;

      const s = getState();
      for (const item of chosen) s.custom.push(item);
      setState(s);
      toast(`Added ${chosen.length} item${chosen.length > 1 ? "s" : ""} from photo`);
      render();
    });
  }

  render();
}

// Draft from the photo: every item editable and opt-out-able, with the model's
// own confidence shown so a guessed portion isn't mistaken for a measurement.
function photoReviewHtml(result) {
  const rows = result.items.map((item, i) => `
    <div class="photo-item" data-item-row data-name="${esc(item.name)}">
      <label class="photo-item-head">
        <input type="checkbox" ${item.confidence === "low" ? "" : "checked"} />
        <span>
          <b>${esc(item.name)}</b>
          <span class="coach-why">${esc(item.portion)}${item.portion ? " · " : ""}<span class="conf conf-${esc(item.confidence)}">${esc(item.confidence)} confidence</span></span>
        </span>
      </label>
      <div class="photo-macros">
        <label><span>kcal</span><input type="number" inputmode="numeric" min="0" data-f="kcal" value="${esc(item.kcal)}" /></label>
        <label><span>P</span><input type="number" inputmode="numeric" min="0" data-f="p" value="${esc(item.p)}" /></label>
        <label><span>F</span><input type="number" inputmode="numeric" min="0" data-f="f" value="${esc(item.f)}" /></label>
        <label><span>C</span><input type="number" inputmode="numeric" min="0" data-f="c" value="${esc(item.c)}" /></label>
      </div>
    </div>
  `).join("");

  return `
    <p class="hint" style="margin-top:0">Estimated from your photo. Portion size is the least reliable part — correct anything that looks off before adding. Low-confidence items start unticked.</p>
    ${rows}
    ${result.note ? `<p class="coach-why">${esc(result.note)}</p>` : ""}
    <p class="coach-why">The photo was not saved.</p>
  `;
}
