import { navigate } from "../app.js";
import { getMeals } from "../lib/meals.js";
import { getActivePlan } from "../lib/plan.js";
import { load, loadApiKey, logWater, update, todayISO } from "../storage.js";
import { waterTargetMl, mlToOz, mealTimes, fmtTime12, toMin, pct, barClass } from "../lib/calc.js";
import { dateNavHtml, wireDateNav } from "../lib/date-nav.js";
import { esc } from "../lib/html.js";
import { confirmForm, notify, toast } from "../lib/modal.js";
import { analyzeMealPhoto, searchFoods } from "../lib/meal-ai.js";
import { aiProgressHtml, setAiProgress } from "../lib/ai-progress.js";

export function renderMeals(root) {
  const today = todayISO();
  let viewedDate = today;
  let logOpen = false;
  let logMode = "";
  const settings = load("settings");
  if (settings.mealSetupPending) {
    root.innerHTML = `<section class="card"><h2>Set up your meals</h2>
      <p>Choose foods you like and anything you avoid.</p>
      <button class="primary today-action" id="setup-meals">Set up meals</button></section>`;
    root.querySelector("#setup-meals").addEventListener("click", () => navigate("settings", { section: "meals" }));
    return;
  }
  const targets = settings.targets;
  const profile = settings.profile;
  const metric = settings.units === "metric";
  const waterUnit = metric ? "mL" : "oz";
  const showWater = (ml) => metric ? Math.round(ml) : mlToOz(ml);

  // Meals from the food-preference generator (or scaled static template if unset).
  let MEALS;
  const generated = !!settings.foodPrefs;

  function getState() {
    const all = load("meals");
    const s = all[viewedDate] || { checked: [], custom: [], waterMl: 0 };
    if (s.waterMl == null) s.waterMl = 0;
    return s;
  }

  function foodLookupHtml() {
    const key = loadApiKey();
    return `
      <div data-log-panel="describe" hidden>
        ${key ? `<label for="food-q">Describe what you ate</label>
          <input id="food-q" type="text" maxlength="200" placeholder="2 eggs and a slice of toast" />
          <button type="button" class="primary today-action" id="food-search">Estimate with AI</button>`
          : `<p class="hint">Use your own OpenAI key for AI food logging.</p><button type="button" data-log-key>Set up AI key</button>`}
      </div>
      <div data-log-panel="photo" hidden>
        ${key ? `<p class="hint">Take a photo or choose one from your library. You can review the estimate before logging it.</p>
          <button type="button" class="primary today-action" id="photo-log">Choose or take a photo</button>
          <input type="file" id="photo-input" accept="image/*" capture="environment" hidden />`
          : `<p class="hint">Use your own OpenAI key for photo logging.</p><button type="button" data-log-key>Set up AI key</button>`}
      </div>
      ${aiProgressHtml("meal-ai-progress")}
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
    MEALS = getMeals(settings, viewedDate);
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
    const nowMin = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : -1;

    root.innerHTML = `
      ${dateNavHtml(viewedDate)}
      <section class="card">
        <div class="spread">
          <h2 style="margin:0">Meal plan</h2>
          ${generated ? `<button class="ghost small" id="shuffle-meals" style="min-height:32px;padding:4px 10px">🎲 ${settings.foodPrefs.weekly ? "Shuffle week" : "Shuffle"}</button>` : ""}
        </div>
        <div class="hint">Suggested meal times use your wake time (${fmtTime12(profile?.wakeTime || "06:30")}) and bedtime (${fmtTime12(profile?.sleepTime || "22:30")}). Change your schedule in Settings.</div>
        ${generated ? `<div class="hint">Built from your food preferences to hit your macros — portions are estimates, tweak to taste.</div>` : ""}
        <ul class="checklist">
          ${MEALS.map(m => {
            const done = state.checked.includes(m.id);
            const t = times[m.id];
            const isNext = !done && t && Math.abs(toMin(t) - nowMin) < 90 && toMin(t) >= nowMin - 30;
            return `
              <li class="${done ? "done" : ""} ${isNext ? "next" : ""}">
                <label class="meal-check"><input type="checkbox" data-id="${m.id}" aria-label="Mark ${esc(m.name)} as eaten" ${done ? "checked" : ""} />
                  <span>${done ? "Eaten" : "Mark as eaten"}</span></label>
                <div style="flex:1">
                  <div class="meal-name">${m.name} ${t ? `<span class="meal-time">${fmtTime12(t)}</span>` : ""}</div>
                  <div class="meal-macros">${m.items}</div>
                  <div class="meal-macros">${m.kcal} kcal · ${m.p}g protein · ${m.f}g fat · ${m.c}g carbs</div>
                </div>
              </li>
            `;
          }).join("")}
        </ul>
        <button type="button" class="today-action" id="edit-meal-plan">Update meal plan</button>
      </section>

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
          <h2 style="margin:0">💧 Water Intake</h2>
          <span class="muted small">${trainingDay ? "training day +" : ""}${profile?.goal === "fat_loss" ? " cut bonus" : profile?.goal === "muscle" ? " bulk bonus" : ""}</span>
        </div>
        <div class="water-tracker" style="margin-top:10px">
          <div class="water-stats-row">
            <span>Intake</span>
            <span><b class="water-amount-current">${showWater(state.waterMl)}</b> / ${showWater(waterTargetMlVal)} ${waterUnit} (${pct(state.waterMl, waterTargetMlVal)}%)</span>
          </div>
          <div class="water-bar-track">
            <div class="water-bar-fill" style="width:${pct(state.waterMl, waterTargetMlVal)}%"></div>
          </div>
          <div class="hint" style="margin:2px 0 8px 0;font-size:12px">
            ${state.waterMl >= waterTargetMlVal ? "✨ Daily target hit! Hydration on point." : `${showWater(Math.max(0, waterTargetMlVal - state.waterMl))} ${waterUnit} to go`}
          </div>

          <div class="water-grid">
            <button class="water-tile" type="button" id="w-cup" title="Add 1 glass">
              <span class="water-tile-icon">🥛</span>
              <span class="water-tile-val">+${metric ? "250" : "8"}</span>
              <span class="water-tile-sub">Glass</span>
            </button>
            <button class="water-tile" type="button" id="w-bottle" title="Add 1 bottle">
              <span class="water-tile-icon">💧</span>
              <span class="water-tile-val">+${metric ? "500" : "16"}</span>
              <span class="water-tile-sub">Bottle</span>
            </button>
            <button class="water-tile" type="button" id="w-shaker" title="Add 1 shaker">
              <span class="water-tile-icon">🥤</span>
              <span class="water-tile-val">+${metric ? "750" : "24"}</span>
              <span class="water-tile-sub">Shaker</span>
            </button>
            <button class="water-tile undo-tile" type="button" id="w-minus" title="Undo last drink" ${state.lastWaterMl ? "" : "disabled"}>
              <span class="water-tile-icon">↩️</span>
              <span class="water-tile-val">${state.lastWaterMl ? "−" + showWater(state.lastWaterMl) : "—"}</span>
              <span class="water-tile-sub">Undo</span>
            </button>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Food log</h2>
        ${state.custom.length === 0
          ? `<p class="empty small">No extra food logged for this day.</p>`
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
        <button type="button" class="primary today-action" id="log-food" aria-expanded="false" aria-controls="food-log-options">Log other food</button>
        <div id="food-log-options" hidden>
          <div class="log-methods" role="group" aria-label="How to log food">
            ${[["describe", "Describe it"], ["photo", "Take a photo"], ["saved", "Saved foods"], ["manual", "Enter manually"]].map(([id, label]) => `<button type="button" data-log-mode="${id}" aria-pressed="false">${label}</button>`).join("")}
          </div>
        ${foodLookupHtml()}
        <div data-log-panel="saved" hidden>
        ${savedFoods.length ? `
          <label style="margin-top:10px">Quick-add from My Foods</label>
          <div class="row" style="gap:8px">
            <select id="cf-saved" style="flex:1;min-width:0">
              <option value="">— pick a saved food —</option>
              ${savedFoods.map((f, i) => `<option value="${i}">${esc(f.name)} · ${esc(f.kcal)} kcal</option>`).join("")}
            </select>
            <button class="ghost" id="cf-saved-rm" title="Forget selected food" aria-label="Forget selected food" style="min-width:44px">🗑</button>
          </div>
        ` : `<p class="hint">No saved foods yet. Enter a food manually and save it for next time.</p>`}
        </div>
        <div data-log-panel="manual saved" hidden>
        <div class="grid-2" style="margin-top:10px">
          <div><label>Name</label><input id="cf-name" type="text" placeholder="Pizza slice" /></div>
          <div><label>kcal</label><input id="cf-kcal" type="number" inputmode="numeric" min="0" /></div>
          <div><label>Protein (g)</label><input id="cf-p" type="number" inputmode="numeric" min="0" /></div>
          <div><label>Fat (g)</label><input id="cf-f" type="number" inputmode="numeric" min="0" /></div>
          <div><label>Carbs (g)</label><input id="cf-c" type="number" inputmode="numeric" min="0" /></div>
          <div><label>Qty</label><input id="cf-qty" type="number" inputmode="decimal" step="0.25" min="0.25" value="1" /></div>
        </div>
        <label class="cf-save-row"><input type="checkbox" id="cf-save" checked /> Save to My Foods for next time</label>
        <button class="primary" id="cf-add" style="width:100%;margin-top:10px">Log food item</button>
        </div>
        </div>
      </section>
    `;

    function showLogControls() {
      root.querySelector("#food-log-options").hidden = !logOpen;
      const toggle = root.querySelector("#log-food");
      toggle.setAttribute("aria-expanded", String(logOpen));
      toggle.textContent = logOpen ? "Close food entry" : "Log other food";
      for (const panel of root.querySelectorAll("[data-log-panel]")) {
        panel.hidden = !panel.dataset.logPanel.split(" ").includes(logMode);
      }
      for (const button of root.querySelectorAll("[data-log-mode]")) {
        const selected = button.dataset.logMode === logMode;
        button.setAttribute("aria-pressed", String(selected));
        button.classList.toggle("primary", selected);
      }
    }
    root.querySelector("#log-food").addEventListener("click", () => {
      logOpen = !logOpen;
      showLogControls();
      if (logOpen) root.querySelector("[data-log-mode]").focus();
    });
    for (const button of root.querySelectorAll("[data-log-mode]")) button.addEventListener("click", () => {
      logMode = button.dataset.logMode;
      showLogControls();
    });
    for (const button of root.querySelectorAll("[data-log-key]")) button.addEventListener("click", () => navigate("settings", { section: "ai" }));
    showLogControls();
    root.querySelector("#edit-meal-plan")?.addEventListener("click", () => navigate("settings", { section: "meals" }));

    wireDateNav(root, viewedDate, (next) => {
      viewedDate = next;
      render();
    });

    const bumpWater = (amount) => {
      const deltaMl = logWater(viewedDate, amount);
      const absAmount = showWater(Math.abs(deltaMl));
      const msg = deltaMl > 0 ? `+${absAmount} ${waterUnit} water logged 💧` : `−${absAmount} ${waterUnit} removed`;
      toast(msg);
      render();
    };
    root.querySelector("#w-cup")?.addEventListener("click", () => bumpWater(metric ? 250 : 237));
    root.querySelector("#w-bottle")?.addEventListener("click", () => bumpWater(metric ? 500 : 473));
    root.querySelector("#w-shaker")?.addEventListener("click", () => bumpWater(metric ? 750 : 710));
    root.querySelector("#w-minus")?.addEventListener("click", () => bumpWater(0));

    root.querySelector("#shuffle-meals")?.addEventListener("click", () => {
      const seed = (settings.foodPrefs.seed || 0) + 1;
      settings.foodPrefs = { ...settings.foodPrefs, seed };
      update("settings", (s) => ({ ...s, foodPrefs: { ...s.foodPrefs, seed } }));
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

    // Food lookup and AI estimates share an editable draft.
    let aiBusy = false;
    async function runFoodLookup(btn, busyLabel, emptyMessage, errorTitle, lead, run) {
      if (!btn || aiBusy) return;
      aiBusy = true;
      const progress = root.querySelector("#meal-ai-progress");
      const buttons = [...root.querySelectorAll("#food-search, #photo-log")];
      const labels = new Map(buttons.map((button) => [button, button.textContent]));
      for (const button of buttons) button.disabled = true;
      btn.textContent = busyLabel;
      setAiProgress(progress, busyLabel);
      let result;
      try {
        result = await run();
      } catch (err) {
        setAiProgress(progress, "Couldn't finish", "error");
        await notify(err.message || "That lookup failed.", { title: errorTitle });
        return;
      } finally {
        aiBusy = false;
        for (const button of buttons) {
          if (!document.contains(button)) continue;
          button.disabled = false;
          button.textContent = labels.get(button);
        }
      }

      if (!btn.isConnected) return;
      if (!result.items.length) {
        setAiProgress(progress, "Finished — nothing found", "done");
        await notify(result.note || emptyMessage, { title: "Nothing to add" });
        return;
      }

      setAiProgress(progress, "Ready to review", "done");
      const chosen = await confirmForm(mealItemsReviewHtml(result, lead), {
        title: `Add to ${viewedDate === today ? "today" : viewedDate}`,
        okLabel: "Add selected",
        collect: (wrap) => ({
          save: wrap.querySelector("#ai-save-foods")?.checked === true,
          items: [...wrap.querySelectorAll("[data-item-row]")]
            .filter((row) => row.querySelector("input[type=checkbox]").checked)
            .map((row) => ({
              name: row.dataset.name,
              kcal: Math.max(1, Math.round(+row.querySelector("[data-f=kcal]").value || 0)),
              p: Math.max(0, Math.round(+row.querySelector("[data-f=p]").value || 0)),
              f: Math.max(0, Math.round(+row.querySelector("[data-f=f]").value || 0)),
              c: Math.max(0, Math.round(+row.querySelector("[data-f=c]").value || 0)),
            })),
        }),
      });
      if (!chosen || !chosen.items.length) return;

      const s = getState();
      for (const item of chosen.items) s.custom.push(item);
      setState(s);
      if (chosen.save) {
        update("savedFoods", (list) => {
          const next = [...list];
          for (const item of chosen.items) {
            const key = item.name.toLowerCase();
            const at = next.findIndex((f) => f.name.toLowerCase() === key);
            if (at >= 0) next[at] = item;
            else next.push(item);
          }
          return next.sort((a, b) => a.name.localeCompare(b.name));
        });
      }
      toast(`Added ${chosen.items.length} item${chosen.items.length > 1 ? "s" : ""}`);
      render();
    }

    const photoInput = root.querySelector("#photo-input");
    root.querySelector("#photo-log")?.addEventListener("click", () => photoInput?.click());
    photoInput?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // let the same photo be picked again after a cancel
      if (!file) return;
      await runFoodLookup(
        root.querySelector("#photo-log"), "Reading photo…",
        "No food was recognized in that photo. Try a clearer, closer shot.",
        "Photo not analyzed",
        "Estimated from your photo. Portion size is the least reliable part — correct anything that looks off. The photo was not saved.",
        () => analyzeMealPhoto(loadApiKey(), file),
      );
    });

    const queryInput = root.querySelector("#food-q");
    const doSearch = () => runFoodLookup(
      root.querySelector("#food-search"), "Searching…",
      "That didn't look like a food. Try naming the dish and how much.",
      "Lookup failed",
      "Typical values for what you described. Check the portion — that's where these are most often wrong.",
      () => searchFoods(loadApiKey(), queryInput.value),
    );
    root.querySelector("#food-search")?.addEventListener("click", doSearch);
    queryInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doSearch(); }
    });
  }

  render();
}

// Draft from a photo or a lookup: every item editable and opt-out-able, with
// the model's own confidence shown so a guess isn't mistaken for a measurement.
function mealItemsReviewHtml(result, lead) {
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
    <p class="hint" style="margin-top:0">${esc(lead)} Low-confidence items start unticked.</p>
    ${rows}
    ${result.note ? `<p class="coach-why">${esc(result.note)}</p>` : ""}
    <label class="cf-save-row"><input type="checkbox" id="ai-save-foods" /> Save these to My Foods for next time</label>
  `;
}
