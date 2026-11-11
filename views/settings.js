import { clearStorage, load, loadApiKey, saveApiKey, update } from "../storage.js";
import {
  ACTIVITY, GOAL, SEX, computeTargets, projectTargetWeightLb,
  bmr, tdee, kgToLb, lbToKg, cmToFtIn, ftInToCm,
} from "../lib/calc.js";
import {
  generatePlan, buildSplits, DEFAULT_PREFS, STYLE_OPTIONS, EXPERIENCE,
  dayLabelFor, dayFromToken, tokenFromDay, VARIANT_SUFFIX,
} from "../lib/plan.js";
import { EQUIPMENT, EQUIPMENT_PRESETS } from "../data/exercises.js";
import { DIETS, FOODS, PROTEIN_GROUPS, CARB_GROUPS, ALLERGENS, fitsDiet, proteinGroupsForDiet } from "../data/foods.js";
import { DEFAULT_FOOD_PREFS, getMeals, getMealWeek } from "../lib/meals.js";
import { notify, confirmAction, confirmForm, toast } from "../lib/modal.js";
import { esc } from "../lib/html.js";
import { DEFAULT_OPENAI_MODEL } from "../lib/openai.js";
import { matchWorkoutRoutine } from "../lib/workout-ai.js";
import { isUsdaMatch, searchUsdaFoods } from "../lib/usda-foods.js";
import { suggestFoodPreferences } from "../lib/food-preferences-ai.js";
import { compareProgressPhotos } from "../lib/progress-photo-ai.js";
import { THEMES, currentTheme, applyTheme } from "../lib/theme.js";
import { navigate } from "../app.js";

const WEEKDAYS = [["mon","Mon"],["tue","Tue"],["wed","Wed"],["thu","Thu"],["fri","Fri"],["sat","Sat"],["sun","Sun"]];

const ONBOARDING_DEFAULT = {
  weightKg: 71.7,   // 158 lb
  heightCm: 170.2,  // 5'7"
  age: 30,
  sex: "male",
  activity: "moderate",
  goal: "fat_loss",
  wakeTime: "06:30",
  sleepTime: "22:30",
};

export function renderSettings(root, { onboarding = false, requestedTab = "today" } = {}) {
  const settings = load("settings");
  const isOnboarding = onboarding || !settings.profile;
  const profile = settings.profile || { ...ONBOARDING_DEFAULT };
  const units = settings.units || "imperial";

  let draft = { ...profile };
  let draftUnits = units;
  const savedPrefs = { ...DEFAULT_PREFS, ...(settings.trainingPrefs || {}) };
  let draftPrefs = { ...savedPrefs };
  draftPrefs.equipmentMode ??= matchingPreset() ? "presets" : "custom";
  let equipmentPanel = draftPrefs.equipmentMode;
  let draftSplits = settings.plan?.splits
    ? { ...settings.plan.splits }
    : buildSplits(draftPrefs.style, draftPrefs.daysPerWeek, draft.goal);
  let draftFood = { ...DEFAULT_FOOD_PREFS, ...(settings.foodPrefs || {}) };
  let step = 0; // current wizard step (persists across rerenders)
  let furthestStep = 0;
  let workoutSetup = null;
  let foodSetup = null;
  let routine = "";
  let routineMatch = null;
  let foodDescription = "";
  let foodDraftApplied = false;
  const planSeed = settings.plan?.meta?.seed ?? Math.floor(Math.random() * 1000000);

  function buildDraftPlan(splits) {
    return generatePlan({ ...draftPrefs, splits }, draft, {
      seed: planSeed,
      preserve: equipmentChanged() || routineMatch ? null : settings.plan,
      exerciseIds: routineMatch?.exerciseIds,
    });
  }

  function workoutPreview() {
    const plan = buildDraftPlan(draftSplits);
    return `
      <h3>${STYLE_OPTIONS[draftPrefs.style].label}</h3>
      <p class="hint">Equipment · ${draftPrefs.equipment.map(id => EQUIPMENT[id]).filter(Boolean).join(", ") || "Bodyweight only"}</p>
      <ul class="workout-preview-days">
        ${WEEKDAYS.map(([day, label]) => {
          const split = plan.splits[day];
          if (!split || split.type === "rest") return "";
          const exercises = plan.workouts[split.day] || [];
          return `<li><b>${label} · ${esc(split.label)}</b>${exercises.length
            ? `<br>${exercises.map(ex => esc(ex.name)).join(", ")}`
            : ""}</li>`;
        }).join("")}
      </ul>`;
  }

  function resetSplits() {
    draftSplits = buildSplits(draftPrefs.style, draftPrefs.daysPerWeek, draft.goal);
  }

  function equipmentChanged() {
    return draftPrefs.equipment.length !== savedPrefs.equipment.length ||
      draftPrefs.equipment.some(item => !savedPrefs.equipment.includes(item));
  }

  function matchingPreset() {
    const selected = new Set(draftPrefs.equipment);
    return Object.keys(EQUIPMENT_PRESETS).find(key => {
      const equipment = EQUIPMENT_PRESETS[key].equipment;
      return equipment.length === selected.size && equipment.every(id => selected.has(id));
    });
  }

  function setupChoices(section, selected) {
    return `
      <div class="seg" role="group" aria-label="${section === "workout" ? "Workout" : "Meal"} setup method">
        ${[["presets", "Use presets"], ["ai", "Build with AI"]].map(([mode, label]) => `
          <button type="button" data-setup="${section}" data-mode="${mode}" class="${selected === mode ? "active" : ""}" aria-pressed="${selected === mode}">${label}</button>
        `).join("")}
      </div>`;
  }

  function setupKeyForm(section) {
    return `
      <form data-setup-key="${section}">
        <p class="hint">Enter your own OpenAI key to continue with AI, or choose Use presets.</p>
        <label for="${section}-setup-key">OpenAI API key</label>
        <input id="${section}-setup-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" />
        <button type="submit" class="primary">Save key and continue</button>
      </form>`;
  }

  // Training-plan configuration card (generator + weekly-layout editor).
  function trainingCard() {
    const activePreset = draftPrefs.equipmentMode === "presets" ? matchingPreset() : undefined;
    return `
      <section class="card">
        <h2>Workout setup</h2>
        ${setupChoices("workout", workoutSetup)}
        ${workoutSetup === "ai" ? (loadApiKey() ? `
        <label for="workout-routine">Describe your workout and equipment</label>
        <p class="hint" id="workout-routine-hint">Tell Tempo what you want to train, how many days a week, and what equipment you want to use. Try “Three full-body days with push-ups and rows. I only have dumbbells and a bench.”</p>
        <textarea id="workout-routine" rows="3" maxlength="800" aria-describedby="workout-routine-hint">${esc(routine)}</textarea>
        <button id="match-workout" type="button" class="primary">Suggest workout template</button>
        <p class="hint" id="workout-match-status" role="status">${routineMatch ? "Workout preview ready." : "Uses your saved OpenAI key."}</p>
        ${routineMatch ? `
          <div id="workout-preview">${workoutPreview()}</div>
          <div class="training-buttons">
            ${!isOnboarding ? `<button id="use-workout-plan" type="button" class="primary">Save workout plan</button>` : ""}
            <button id="edit-workout-plan" type="button">Edit plan settings</button>
          </div>` : ""}
        ` : setupKeyForm("workout")) : ""}
        ${workoutSetup === "presets" ? `
        <p class="hint">Built from these plus your goal (${GOAL[draft.goal].label}). Swap exercises and tweak sets anytime on the Workout tab.</p>

        <h3>Lifting days / week</h3>
        <div class="seg">
          ${[2,3,4,5,6].map(d => `<button class="${draftPrefs.daysPerWeek === d ? "active" : ""}" data-days="${d}">${d}</button>`).join("")}
        </div>

        <h3>Split style</h3>
        <div class="training-buttons">
          ${Object.entries(STYLE_OPTIONS).map(([k, v]) => `<button class="${draftPrefs.style === k ? "primary" : ""}" data-style="${k}">${v.label}</button>`).join("")}
        </div>

        <h3>Experience</h3>
        <div class="opt-stack">
          ${Object.entries(EXPERIENCE).map(([k, label]) => `<button class="opt ${draftPrefs.experience === k ? "selected" : ""}" data-exp="${k}"><b>${label}</b></button>`).join("")}
        </div>

        <h3>Equipment</h3>
        <div class="seg" role="group" aria-label="Equipment options">
          <button type="button" data-equipment-panel="presets" class="${equipmentPanel === "presets" ? "active" : ""}" aria-pressed="${equipmentPanel === "presets"}">Presets</button>
          <button type="button" data-equipment-panel="custom" class="${equipmentPanel === "custom" ? "active" : ""}" aria-pressed="${equipmentPanel === "custom"}">Custom</button>
        </div>
        ${equipmentPanel === "presets" ? `
          <p class="hint">${activePreset ? "Pick an equipment preset." : "Your custom equipment is active. Choose a preset to switch."}</p>
          <div class="training-buttons">
            ${Object.entries(EQUIPMENT_PRESETS).map(([k, v]) => `<button type="button" class="${activePreset === k ? "primary" : ""}" data-preset="${k}" aria-pressed="${activePreset === k}">${v.label}</button>`).join("")}
          </div>` : `
          <p class="hint">Select the equipment you want to use. Clear all selections for bodyweight only.</p>
          <div class="chips training-buttons">
            ${Object.entries(EQUIPMENT).filter(([k]) => k !== "bodyweight").map(([k, label]) => {
              const selected = draftPrefs.equipment.includes(k);
              return `<button type="button" class="chip ${selected ? "on" : ""}" data-equip="${k}" aria-pressed="${selected}">${label}</button>`;
            }).join("")}
          </div>`}
        ${settings.plan && equipmentChanged() ? `<p class="hint">Saving rebuilds your workouts and resets exercise swaps. Your weekly layout and workout logs are kept.</p>` : ""}
        ` : ""}
      </section>
    `;
  }

  // Weekly-layout editor — its own wizard step so the Training step stays light.
  function layoutCard() {
    const liftKeys = STYLE_OPTIONS[draftPrefs.style].keys;
    // Offer A and B variants of each split day; C only when the generated
    // layout already uses it (e.g. 5-day upper/lower).
    const inUse = new Set(Object.values(draftSplits).filter(s => s.type === "lift").map(s => s.day));
    // Always offer A and B; deeper variants only once the generated layout uses
    // them, so a 3-day week isn't asked to choose between six near-identical rows.
    const variantKeys = liftKeys.flatMap((k) => {
      const all = VARIANT_SUFFIX.map((s) => k + s);
      return all.filter((key, i) => i < 2 || inUse.has(key));
    });
    const dayOptions = [["rest", "Rest"], ["cardio", "Cardio"], ...variantKeys.map(k => [`lift:${k}`, dayLabelFor(k)])];
    return `
      <section class="card">
        <h2>Weekly layout</h2>
        <p class="hint">Set what each day is. Lift days use your ${STYLE_OPTIONS[draftPrefs.style].label} split; cardio days are treadmill work.</p>
        <div class="week-edit">
          ${WEEKDAYS.map(([wd, lbl]) => `
            <div class="week-row">
              <span class="wd">${lbl}</span>
              <select data-day="${wd}">
                ${dayOptions.map(([val, olbl]) => `<option value="${val}" ${tokenFromDay(draftSplits[wd]) === val ? "selected" : ""}>${olbl}</option>`).join("")}
              </select>
            </div>
          `).join("")}
        </div>
        ${settings.plan && !isOnboarding ? `<button class="ghost" id="shuffle-ex" style="width:100%;margin-top:12px">🎲 Shuffle exercises (keep layout)</button>` : ""}
      </section>
    `;
  }

  // Optional own-key card for the AI coach. Kept out of the wizard so setup
  // stays seven steps — this is a power-user setting, not part of onboarding.
  function coachKeyCard() {
    const saved = loadApiKey();
    return `
      <section class="card" id="ai-coach-key">
        <h2>AI coach key</h2>
        <p class="hint">Use your own OpenAI key to enable workout setup, photo comparisons, meal analysis, and coach reviews with <b>${DEFAULT_OPENAI_MODEL}</b>. Tempo stores the key in this browser and sends requests directly to OpenAI.</p>
        ${saved ? `<p class="hint" style="margin-top:0">Saved key: <b>sk-…${esc(saved.slice(-4))}</b></p>` : ""}
        <label for="f-api-key">OpenAI API key</label>
        <input id="f-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="${saved ? "Enter a new key to replace" : "sk-…"}" />
        <p class="hint" style="margin-top:8px">Create a project-scoped key with a spending limit at platform.openai.com — don't paste an org-wide key.</p>
        <div class="grid-2" style="margin-top:6px">
          <button class="primary" id="f-api-save">${saved ? "Replace key" : "Save key"}</button>
          <button class="ghost danger" id="f-api-clear" ${saved ? "" : "disabled"}>Remove key</button>
        </div>
      </section>
    `;
  }

  function themePickerCard() {
    const active = currentTheme();
    return `
      <section class="card" style="margin-top:14px">
        <h2>Appearance</h2>
        <p class="hint">Pick a color palette. Applies instantly on this device.</p>
        <div class="theme-picker-grid">
          ${THEMES.map(t => `
            <button type="button" class="theme-card ${active === t.id ? "active" : ""}" data-set-theme="${t.id}" aria-pressed="${active === t.id}">
              <span class="theme-swatch" style="background:${t.swatch}"></span>
              <span class="theme-card-text">
                <b>${t.name}</b>
                <span class="muted small">${t.desc}</span>
              </span>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  }


  // Food-preferences step — drives the meal generator.
  function foodCard() {
    const proteins = proteinGroupsForDiet(draftFood.diet);
    const preferredFoods = FOODS.filter(food => draftFood.preferredFoods?.includes(food.id));
    return `
      <section class="card">
        <h2>Meal setup</h2>
        ${setupChoices("food", foodSetup)}
        ${foodSetup === "ai" ? (loadApiKey() ? `
        <label for="food-description">Describe how you like to eat</label>
        <textarea id="food-description" rows="3" maxlength="800" placeholder="I like salmon, canned tuna, eggs, and rice. I avoid dairy.">${esc(foodDescription)}</textarea>
        <button id="suggest-food" class="primary" type="button">Suggest weekly meal plan</button>
        <p id="food-match-status" class="hint" role="status">${foodDraftApplied ? "Preferences applied to your draft. Save from Review." : "Uses your own OpenAI key."}</p>
        ` : setupKeyForm("food")) : ""}
        ${foodSetup === "presets" ? `
        <p class="hint">Choose your diet, favorite food groups, and foods to avoid.</p>
        ${preferredFoods.length ? `
          <p class="hint">Preferred ingredients · ${preferredFoods.map(food => esc(food.name)).join(", ")}</p>
          <button id="clear-preferred-foods" type="button">Clear preferred ingredients</button>` : ""}

        <h3>Diet</h3>
        <div class="grid-2">
          ${Object.entries(DIETS).map(([k, label]) => `<button class="${draftFood.diet === k ? "primary" : ""}" data-diet="${k}">${label}</button>`).join("")}
        </div>

        <h3>Protein sources you like</h3>
        <div class="chips">
          ${proteins.map((k) => `<button class="chip ${draftFood.proteins.includes(k) ? "on" : ""}" data-protein="${k}">${PROTEIN_GROUPS[k]}</button>`).join("")}
        </div>

        <h3>Carb sources you like</h3>
        <div class="chips">
          ${Object.entries(CARB_GROUPS).map(([k, label]) => `<button class="chip ${draftFood.carbs.includes(k) ? "on" : ""}" data-carb="${k}">${label}</button>`).join("")}
        </div>

        <h3>Avoid</h3>
        <div class="chips">
          ${Object.entries(ALLERGENS).map(([k, label]) => `<button class="chip ${draftFood.avoid.includes(k) ? "on" : ""}" data-avoid="${k}">${label}</button>`).join("")}
        </div>
        ` : ""}
      </section>
    `;
  }

  function mealDaysPreview(week) {
    return week.map((meals, i) => `
      <details ${i === 0 ? "open" : ""}>
        <summary>${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]}</summary>
        <ul class="workout-preview-days">
          ${meals.map(meal => `<li><b>${esc(meal.name)}</b><br>${esc(meal.items || "No matching foods for this meal.")}<br>
            <span class="hint">~${meal.kcal} kcal · ${meal.p} g protein · ${meal.c} g carbs · ${meal.f} g fat</span></li>`).join("")}
        </ul>
      </details>`).join("");
  }

  function setupPlanPreview(targets) {
    const mealSettings = { targets, foodPrefs: draftFood };
    const liftDays = WEEKDAYS.filter(([day]) => draftSplits[day]?.type === "lift").map(([, label]) => label);
    return `
      <h3>Weekly workout plan</h3>
      <p>${STYLE_OPTIONS[draftPrefs.style].label} · ${liftDays.join(", ") || "No lifting days scheduled"}</p>
      <h3>${draftFood.weekly ? "Weekly meal plan" : "Daily meal plan"}</h3>
      ${draftFood.weekly ? mealDaysPreview(getMealWeek(mealSettings)) : `<ul class="workout-preview-days">
        ${getMeals(mealSettings).map(meal => `<li><b>${esc(meal.name)}</b><br>${esc(meal.items || "No matching foods for this meal.")}</li>`).join("")}
      </ul>`}`;
  }

  // Each step is one card; they're all rendered into a horizontal track and
  // shown one at a time, so existing input wiring keeps working unchanged.
  function buildSteps() {
    const targets = computeTargets(draft);
    const ftin = cmToFtIn(draft.heightCm);
    const wDisp = draftUnits === "imperial" ? kgToLb(draft.weightKg) : draft.weightKg;

    return [
      { title: "You", html: `
        <section class="card">
          <h2>${isOnboarding ? "Welcome 👋" : "Your profile"}</h2>
          <p class="hint">${isOnboarding ? "Set your goal, food preferences, and workout routine. You’ll review both plans before you start." : "Edit anything, then Save — your targets recalculate."}</p>
          <h3>Units</h3>
          <div class="grid-2">
            <button class="${draftUnits === "imperial" ? "primary" : ""}" data-units="imperial">Imperial (lb, ft/in)</button>
            <button class="${draftUnits === "metric" ? "primary" : ""}" data-units="metric">Metric (kg, cm)</button>
          </div>
          <h3>Body stats</h3>
          <div class="grid-2">
            <div>
              <label>Weight (${draftUnits === "imperial" ? "lb" : "kg"})</label>
              <input id="f-weight" type="number" inputmode="decimal" step="0.1" min="50" value="${wDisp}" />
            </div>
            <div>
              <label>Age</label>
              <input id="f-age" type="number" inputmode="numeric" min="13" max="100" value="${draft.age}" />
            </div>
            ${draftUnits === "imperial" ? `
              <div><label>Height — ft</label><input id="f-ft" type="number" inputmode="numeric" min="3" max="8" value="${ftin.ft}" /></div>
              <div><label>Height — in</label><input id="f-in" type="number" inputmode="decimal" step="0.1" min="0" max="11.9" value="${ftin.in}" /></div>
            ` : `
              <div><label>Height (cm)</label><input id="f-cm" type="number" inputmode="decimal" step="0.1" min="120" max="230" value="${draft.heightCm}" /></div>
              <div></div>
            `}
          </div>
          <h3>Sex</h3>
          <p class="hint" style="margin-top:0">Adjusts BMR, your minimum-safe calorie floor, and your essential-fat minimum.</p>
          <div class="grid-2">
            <button class="${draft.sex === "male" ? "primary" : ""}" data-sex="male">Male</button>
            <button class="${draft.sex === "female" ? "primary" : ""}" data-sex="female">Female</button>
          </div>
        </section>` },

      { title: "Activity", html: `
        <section class="card">
          <h2>Activity & schedule</h2>
          <h3>Activity level</h3>
          <div class="opt-stack">
            ${Object.entries(ACTIVITY).map(([k, v]) => `
              <button class="opt ${draft.activity === k ? "selected" : ""}" data-activity="${k}">
                <b>${v.label}</b><span class="opt-desc">${v.desc}</span>
              </button>`).join("")}
          </div>
          <h3>Schedule (for meal timing)</h3>
          <div class="grid-2">
            <div><label>Wake time</label><input id="f-wake" type="time" value="${draft.wakeTime || "06:30"}" /></div>
            <div><label>Bed time</label><input id="f-sleep" type="time" value="${draft.sleepTime || "22:30"}" /></div>
          </div>
        </section>` },

      { title: "Goal", html: `
        <section class="card">
          <h2>Your goal</h2>
          <p class="hint">Sets your calorie target and training rep ranges.</p>
          <div class="opt-stack">
            ${Object.entries(GOAL).map(([k, v]) => `
              <button class="opt ${draft.goal === k ? "selected" : ""}" data-goal="${k}">
                <b>${v.label}</b><span class="opt-desc">${goalDesc(k)}</span>
              </button>`).join("")}
          </div>
        </section>` },

      { title: "Food", html: foodCard() },

      { title: "Training", html: trainingCard() },

      { title: "Layout", html: layoutCard() },

      { title: "Review", html: `
        <section class="card">
          <h2>Your targets</h2>
          <div class="macros-grid">
            <div class="m"><b>${targets.kcal}</b><span>kcal/day</span></div>
            <div class="m"><b>${targets.p}g</b><span>Protein</span></div>
            <div class="m"><b>${targets.f}g</b><span>Fat</span></div>
            <div class="m"><b>${targets.c}g</b><span>Carbs</span></div>
          </div>
          <div class="hint" style="margin-top:8px">${targetsHint(draft)}</div>
          ${isOnboarding ? `<div id="setup-plan-preview">${setupPlanPreview(targets)}</div>` : ""}
          <p class="hint" style="margin-top:10px">${isOnboarding ? "Tap Start tracking to save both plans." : "Tap Save changes to apply."}</p>
        </section>` },
    ];
  }

  function rerender() {
    const steps = buildSteps();
    step = Math.min(step, steps.length - 1);

    root.innerHTML = `
      <div class="wiz-head"></div>
      <div class="wizard"><div class="wizard-track">${steps.map(s => `<div class="wizard-step">${s.html}</div>`).join("")}</div></div>
      <div class="wiz-nav"></div>
      ${!isOnboarding ? themePickerCard() : ""}
      ${!isOnboarding ? coachKeyCard() : ""}
      ${!isOnboarding ? `
        <section class="card">
          <h2>Progress photos</h2>
          <p class="hint">Choose an earlier and a recent photo in similar lighting, clothing, and poses. Tempo sends both photos directly to OpenAI using your saved key when you compare them. Tempo does not save the photos.</p>
          <form id="progress-photo-form">
            <fieldset class="progress-photo-fields">
              <label>Earlier photo <input type="file" name="earlier" accept="image/*" required></label>
              <label>Recent photo <input type="file" name="recent" accept="image/*" required></label>
              <label>Training notes (optional)
                <textarea name="notes" rows="2" maxlength="800" placeholder="Time between photos, workouts per week, or lifts that have stalled"></textarea>
              </label>
              <button type="submit" class="primary">Compare photos with AI</button>
            </fieldset>
          </form>
          <p id="progress-photo-status" class="hint" role="status"></p>
          <a id="photo-key-link" href="#ai-coach-key" hidden>Go to AI coach key</a>
          <div id="progress-photo-result" hidden>
            <h3>Visible changes</h3>
            <p data-photo-comparison></p>
            <h3>Next step</h3>
            <p data-photo-advice></p>
            <button type="button" data-photo-routine hidden>Use suggestion in Training</button>
          </div>
        </section>` : ""}
      ${!isOnboarding ? `<button class="ghost danger" id="f-reset" style="width:100%;margin-top:10px">Reset all data</button>` : ""}
    `;

    const wizard = root.querySelector(".wizard");
    const track = root.querySelector(".wizard-track");
    const head = root.querySelector(".wiz-head");
    const nav = root.querySelector(".wiz-nav");

    function applyTrack(animate) {
      track.style.transition = animate ? "transform .3s ease" : "none";
      wizard.style.transition = animate ? "height .3s ease" : "none";
      track.style.transform = `translateX(-${step * 100}%)`;
      const el = track.children[step];
      if (el) wizard.style.height = el.offsetHeight + "px";
    }

    root.querySelector("#setup-plan-preview")?.addEventListener("toggle", () => applyTrack(false), true);

    function paintChrome() {
      head.innerHTML = `
        <span class="wiz-step-label">Step ${step + 1} of ${steps.length} · ${steps[step].title}</span>
        <div class="wiz-dots">
          ${steps.map((s, i) => `<button class="wiz-dot ${i === step ? "active" : ""}" data-goto="${i}" aria-label="Go to ${s.title}" ${isOnboarding && i > furthestStep ? "disabled" : ""}></button>`).join("")}
        </div>`;
      nav.innerHTML = `
        <button class="ghost" id="wiz-back" ${step === 0 ? "disabled" : ""}>← Back</button>
        ${step < steps.length - 1
          ? `<button class="primary" id="wiz-next">Next →</button>`
          : `<button class="primary" id="f-save">${isOnboarding ? "Start tracking →" : "Save changes"}</button>`}`;
      nav.querySelector("#wiz-back")?.addEventListener("click", () => setStep(step - 1));
      nav.querySelector("#wiz-next")?.addEventListener("click", () => setStep(step + 1));
      nav.querySelector("#f-save")?.addEventListener("click", doSave);
      for (const d of head.querySelectorAll("button[data-goto]")) d.addEventListener("click", () => setStep(+d.dataset.goto));
    }

    function setStep(n, scrollTarget) {
      step = Math.max(0, Math.min(steps.length - 1, n));
      furthestStep = Math.max(furthestStep, step);
      const setupPreview = root.querySelector("#setup-plan-preview");
      if (setupPreview && step === steps.length - 1) {
        setupPreview.innerHTML = setupPlanPreview(computeTargets(draft));
      }
      paintChrome();
      applyTrack(true);
      if (scrollTarget) scrollTarget.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // ── Form wiring (all steps are in the DOM at once) ──
    for (const button of root.querySelectorAll("button[data-setup]")) {
      button.addEventListener("click", () => {
        const { setup, mode } = button.dataset;
        if (setup === "workout") workoutSetup = mode;
        else foodSetup = mode;
        rerender();
        const focusTarget = root.querySelector(`#${setup}-setup-key`) ||
          root.querySelector(`[data-setup="${setup}"][data-mode="${mode}"]`);
        focusTarget?.focus({ preventScroll: true });
      });
    }

    root.querySelector("#f-weight")?.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      if (isNaN(v)) return;
      draft.weightKg = draftUnits === "imperial" ? lbToKg(v) : v;
      rerenderPreview();
    });
    root.querySelector("#f-age")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value);
      if (!isNaN(v)) { draft.age = v; rerenderPreview(); }
    });
    root.querySelector("#f-cm")?.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) { draft.heightCm = v; rerenderPreview(); }
    });
    root.querySelector("#f-ft")?.addEventListener("input", () => updateHeightFromFtIn());
    root.querySelector("#f-in")?.addEventListener("input", () => updateHeightFromFtIn());
    function updateHeightFromFtIn() {
      const ft = parseInt(root.querySelector("#f-ft")?.value) || 0;
      const inches = parseFloat(root.querySelector("#f-in")?.value) || 0;
      draft.heightCm = ftInToCm(ft, inches);
      rerenderPreview();
    }
    root.querySelector("#f-wake")?.addEventListener("change", (e) => { draft.wakeTime = e.target.value; });
    root.querySelector("#f-sleep")?.addEventListener("change", (e) => { draft.sleepTime = e.target.value; });

    for (const btn of root.querySelectorAll("button[data-units]")) btn.addEventListener("click", () => { draftUnits = btn.dataset.units; rerender(); });
    for (const btn of root.querySelectorAll("button[data-sex]")) btn.addEventListener("click", () => { draft.sex = btn.dataset.sex; rerender(); });
    for (const btn of root.querySelectorAll("button[data-activity]")) btn.addEventListener("click", () => { draft.activity = btn.dataset.activity; rerender(); });
    for (const btn of root.querySelectorAll("button[data-goal]")) btn.addEventListener("click", () => { draft.goal = btn.dataset.goal; resetSplits(); rerender(); });

    for (const btn of root.querySelectorAll("button[data-diet]")) btn.addEventListener("click", () => {
      draftFood.diet = btn.dataset.diet;
      const allowed = proteinGroupsForDiet(draftFood.diet);
      draftFood.proteins = draftFood.proteins.filter((p) => allowed.includes(p));
      rerender();
    });
    const toggleFood = (key, val) => { draftFood[key] = draftFood[key].includes(val) ? draftFood[key].filter((x) => x !== val) : [...draftFood[key], val]; };
    for (const btn of root.querySelectorAll("button[data-protein]")) btn.addEventListener("click", () => { toggleFood("proteins", btn.dataset.protein); rerender(); });
    for (const btn of root.querySelectorAll("button[data-carb]")) btn.addEventListener("click", () => { toggleFood("carbs", btn.dataset.carb); rerender(); });
    for (const btn of root.querySelectorAll("button[data-avoid]")) btn.addEventListener("click", () => { toggleFood("avoid", btn.dataset.avoid); rerender(); });

    const foodInput = root.querySelector("#food-description");
    const foodButton = root.querySelector("#suggest-food");
    const foodStatus = root.querySelector("#food-match-status");
    root.querySelector("#clear-preferred-foods")?.addEventListener("click", () => {
      draftFood.preferredFoods = [];
      draftFood.usdaFoods = [];
      rerender();
    });
    foodInput?.addEventListener("input", () => { foodDescription = foodInput.value; });
    foodButton?.addEventListener("click", async () => {
      const description = foodDescription.trim();
      if (!description) {
        foodStatus.textContent = "Describe your food preferences first.";
        foodInput.focus();
        return;
      }
      const key = loadApiKey();
      if (!key) {
        rerender();
        root.querySelector("#food-setup-key")?.focus();
        return;
      }
      const idleLabel = foodButton.textContent;
      foodButton.disabled = true;
      foodButton.setAttribute("aria-busy", "true");
      foodButton.textContent = "Building a meal preview…";
      foodStatus.textContent = "Matching your food preferences…";
      foodInput.readOnly = true;
      try {
        const { foodPrefs, unmatchedFoods } = await suggestFoodPreferences(key, description, draftFood);
        if (!foodButton.isConnected) return;
        const candidates = FOODS.filter(food => foodPrefs.preferredFoods.includes(food.id) &&
          food.unit === "g" && fitsDiet(food, foodPrefs.diet) &&
          !food.allergens.some(allergen => foodPrefs.avoid.includes(allergen))).slice(0, 4);
        foodPrefs.usdaFoods = (draftFood.usdaFoods || []).filter(item => foodPrefs.preferredFoods.includes(item.foodId));
        let usdaNote = "";
        if (candidates.length) {
          foodStatus.textContent = "Looking up ingredients in USDA FoodData Central…";
          const results = await Promise.allSettled(candidates.map(food => searchUsdaFoods(food.name)));
          if (!foodButton.isConnected) return;
          const rows = candidates.map((food, i) => {
            const items = results[i].value?.items.filter(item => isUsdaMatch(item, food)) || [];
            const saved = foodPrefs.usdaFoods.find(item => item.foodId === food.id);
            if (saved && !items.some(item => item.fdcId === saved.fdcId)) items.unshift(saved);
            return { food, items, saved };
          }).filter(row => row.items.length);
          if (rows.length) {
            const selections = await confirmForm(`
              <p class="hint">Choose a USDA entry only if it matches the ingredient and how you prepare it. Tempo can use its estimates for the rest.</p>
              ${rows.map(({ food, items, saved }, i) => `
                <p><label>${esc(food.name)}<br>
                  <select data-usda-row="${i}">
                    <option value="">Use Tempo estimates</option>
                    ${items.map(item => `<option value="${item.fdcId}" ${saved?.fdcId === item.fdcId ? "selected" : ""}>${esc(item.name)}</option>`).join("")}
                  </select>
                </label></p>`).join("")}`,
            { title: "Match ingredients to USDA", okLabel: "Preview meal plan", collect: wrap =>
              [...wrap.querySelectorAll("[data-usda-row]")].flatMap((select, i) => {
                const { food, items } = rows[i];
                const item = items.find(entry => entry.fdcId === Number(select.value));
                return item ? [{ ...item, foodId: food.id }] : [];
              }) });
            if (!foodButton.isConnected) return;
            if (!selections) {
              foodStatus.textContent = "You can edit your description and try again.";
              return;
            }
            foodPrefs.usdaFoods = foodPrefs.usdaFoods.filter(item => !rows.some(row => row.food.id === item.foodId)).concat(selections);
          }
          const limitError = results.find(result => result.status === "rejected" && result.reason?.status === 429);
          if (limitError) usdaNote = `${limitError.reason.message} You can still use this plan with Tempo’s estimates for ingredients without a USDA match.`;
          else if (results.some(result => result.status === "rejected")) usdaNote = "Some USDA lookups were unavailable. Tempo estimates are used where no USDA entry was selected.";
          else if (!rows.length) usdaNote = "No usable USDA entries were found. This plan uses Tempo estimates.";
        }
        foodPrefs.weekly = true;
        const week = getMealWeek({ targets: computeTargets(draft), foodPrefs });
        if (week.some(meals => meals.some(meal => !meal.items))) {
          throw new Error("Tempo couldn’t fill every meal with foods that match these restrictions.");
        }
        const excluded = foodPrefs.avoid.map(id => ALLERGENS[id]).filter(Boolean).join(", ");
        const accepted = await confirmForm(`
          <p><b>${esc(DIETS[foodPrefs.diet])}</b> · Avoid: ${esc(excluded || "None selected")}</p>
          ${unmatchedFoods.length ? `<p class="hint">Unavailable in the meal planner: ${esc(unmatchedFoods.join(", "))}.</p>` : ""}
          <p class="hint">This plan repeats each week. Tempo calculates portions from your nutrition targets and uses USDA nutrition values where you confirmed a match.</p>
          ${mealDaysPreview(week)}
          ${foodPrefs.usdaFoods.length ? `<p class="hint">USDA FoodData Central entries: ${foodPrefs.usdaFoods.map(item => esc(item.name)).join("; ")}.</p>` : ""}
          ${usdaNote ? `<p class="hint">${esc(usdaNote)}</p>` : ""}
          <p class="hint">Review the ingredients and exclusions before using this plan.</p>`,
        { title: "Suggested weekly meal plan", okLabel: "Use this plan" });
        if (!foodButton.isConnected) return;
        if (accepted) {
          draftFood = foodPrefs;
          foodDraftApplied = true;
          rerender();
        } else {
          foodStatus.textContent = "You can edit your description and try again.";
        }
      } catch (error) {
        if (foodButton.isConnected) foodStatus.textContent = error.message || "Couldn’t suggest a meal plan. Try again.";
      } finally {
        foodButton.disabled = false;
        foodButton.removeAttribute("aria-busy");
        foodButton.textContent = idleLabel;
        foodInput.readOnly = false;
        if (foodButton.isConnected) applyTrack(false);
      }
    });

    for (const btn of root.querySelectorAll("button[data-days]")) btn.addEventListener("click", () => { draftPrefs.daysPerWeek = +btn.dataset.days; resetSplits(); rerender(); });
    for (const btn of root.querySelectorAll("button[data-style]")) btn.addEventListener("click", () => { draftPrefs.style = btn.dataset.style; resetSplits(); rerender(); });
    for (const btn of root.querySelectorAll("button[data-exp]")) btn.addEventListener("click", () => { draftPrefs.experience = btn.dataset.exp; rerender(); });
    for (const btn of root.querySelectorAll("button[data-equipment-panel]")) btn.addEventListener("click", () => {
      equipmentPanel = btn.dataset.equipmentPanel;
      if (equipmentPanel === "custom") {
        draftPrefs.equipmentMode = "custom";
        draftPrefs.customEquipment ??= [...draftPrefs.equipment];
        draftPrefs.equipment = draftPrefs.customEquipment;
      }
      rerender();
      root.querySelector(`[data-equipment-panel="${equipmentPanel}"]`)?.focus({ preventScroll: true });
    });
    for (const btn of root.querySelectorAll("button[data-preset]")) btn.addEventListener("click", () => {
      const preset = btn.dataset.preset;
      if (draftPrefs.equipmentMode === "custom") draftPrefs.customEquipment = draftPrefs.equipment;
      draftPrefs.equipmentMode = "presets";
      draftPrefs.equipment = [...EQUIPMENT_PRESETS[preset].equipment];
      rerender();
      root.querySelector(`[data-preset="${preset}"]`)?.focus({ preventScroll: true });
    });
    for (const btn of root.querySelectorAll("button[data-equip]")) btn.addEventListener("click", () => {
      const k = btn.dataset.equip;
      draftPrefs.equipment = draftPrefs.equipment.includes(k) ? draftPrefs.equipment.filter(x => x !== k) : [...draftPrefs.equipment, k];
      draftPrefs.customEquipment = draftPrefs.equipment;
      rerender();
      root.querySelector(`[data-equip="${k}"]`)?.focus({ preventScroll: true });
    });
    const routineInput = root.querySelector("#workout-routine");
    const matchButton = root.querySelector("#match-workout");
    const matchStatus = root.querySelector("#workout-match-status");
    root.querySelector("#use-workout-plan")?.addEventListener("click", () => doSave("workout"));
    root.querySelector("#edit-workout-plan")?.addEventListener("click", () => {
      workoutSetup = "presets";
      rerender();
      root.querySelector('[data-setup="workout"][data-mode="presets"]')?.focus();
    });
    routineInput?.addEventListener("input", () => { routine = routineInput.value; });
    matchButton?.addEventListener("click", async () => {
      const description = routine.trim();
      if (!description) {
        matchStatus.textContent = "Describe your routine first.";
        routineInput.focus();
        return;
      }
      const apiKey = loadApiKey();
      if (!apiKey) {
        rerender();
        root.querySelector("#workout-setup-key")?.focus();
        return;
      }
      const idleLabel = matchButton.textContent;
      matchButton.disabled = true;
      matchButton.setAttribute("aria-busy", "true");
      matchButton.textContent = "Finding a template…";
      routineInput.readOnly = true;
      matchStatus.textContent = "Finding a workout template…";
      applyTrack(false);
      try {
        const match = await matchWorkoutRoutine(apiKey, description, draftPrefs);
        if (!matchButton.isConnected) return;
        const style = match.daysPerWeek === 2 && match.style === "ppl" ? "full" : match.style;
        const scheduleChanged = style !== draftPrefs.style || match.daysPerWeek !== draftPrefs.daysPerWeek;
        draftPrefs.style = style;
        draftPrefs.daysPerWeek = match.daysPerWeek;
        if (match.equipment !== null) {
          draftPrefs.equipment = match.equipment;
          draftPrefs.customEquipment = match.equipment;
          draftPrefs.equipmentMode = equipmentPanel = "custom";
        }
        routineMatch = { ...match, style };
        if (scheduleChanged) resetSplits();
        if (match.equipment !== null && !match.equipment.includes("treadmill")) {
          draftSplits = Object.fromEntries(Object.entries(draftSplits).map(([day, split]) => [
            day, split.type === "cardio" && split.cardioId === "intervals"
              ? { type: "cardio", label: "Brisk walk", detail: "Walk outdoors for 20–30 minutes." }
              : split,
          ]));
        }
        rerender();
      } catch (error) {
        if (matchButton.isConnected) matchStatus.textContent = error.message || "Tempo couldn’t match that routine. Try again.";
      } finally {
        matchButton.disabled = false;
        matchButton.removeAttribute("aria-busy");
        matchButton.textContent = idleLabel;
        routineInput.readOnly = false;
        if (matchButton.isConnected) applyTrack(false);
      }
    });
    for (const sel of root.querySelectorAll("select[data-day]")) sel.addEventListener("change", (e) => {
      draftSplits = { ...draftSplits, [e.target.dataset.day]: dayFromToken(e.target.value, draft.goal) };
      const preview = root.querySelector("#workout-preview");
      if (preview) preview.innerHTML = workoutPreview();
    });
    root.querySelector("#shuffle-ex")?.addEventListener("click", async () => {
      const ok = await confirmAction(
        "Rebuild every exercise from scratch? Your weekly layout stays, but any per-exercise swaps are discarded.",
        { title: "Shuffle exercises?", okLabel: "Shuffle" });
      if (!ok) return;
      const seed = (settings.plan?.meta?.seed || 0) + 1;
      const plan = generatePlan({ ...draftPrefs, splits: draftSplits }, draft, { seed });
      update("settings", (s) => ({ ...s, trainingPrefs: draftPrefs, plan }));
      toast("Fresh exercises generated");
      navigate("workout");
    });
    async function saveKeyFrom(input, nextField) {
      const value = input.value.trim();
      if (!value) { await notify("Paste your OpenAI key first.", { title: "No key entered" }); return; }
      if (!/^sk-\S{16,}$/.test(value)) {
        await notify("That doesn't look like an OpenAI key — it should start with \"sk-\".", { title: "Check the key" });
        return;
      }
      saveApiKey(value);
      if (loadApiKey() !== value) return;
      input.value = "";
      toast("OpenAI key saved to this browser");
      rerender();
      if (nextField) root.querySelector(nextField)?.focus();
    }

    for (const form of root.querySelectorAll("[data-setup-key]")) {
      form.addEventListener("submit", event => {
        event.preventDefault();
        const nextField = form.dataset.setupKey === "workout" ? "#workout-routine" : "#food-description";
        saveKeyFrom(form.querySelector("input"), nextField);
      });
    }
    root.querySelector("#f-api-save")?.addEventListener("click", () => saveKeyFrom(root.querySelector("#f-api-key")));
    root.querySelector("#f-api-clear")?.addEventListener("click", async () => {
      const ok = await confirmAction(
        "AI features require a saved OpenAI key.",
        { title: "Remove your key?", okLabel: "Remove", danger: true });
      if (!ok) return;
      saveApiKey("");
      toast("Coach key removed");
      rerender();
    });
    root.querySelector("#progress-photo-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = root.querySelector("#progress-photo-status");
      const result = root.querySelector("#progress-photo-result");
      const photoKeyLink = root.querySelector("#photo-key-link");
      result.hidden = true;
      photoKeyLink.hidden = true;
      const apiKey = loadApiKey();
      if (!apiKey) {
        status.textContent = "Save an OpenAI key in Settings to compare your photos.";
        photoKeyLink.hidden = false;
        return;
      }
      const files = new FormData(form);
      const fields = form.querySelector("fieldset");
      const compareButton = form.querySelector('button[type="submit"]');
      const idleLabel = compareButton.textContent;
      fields.disabled = true;
      compareButton.setAttribute("aria-busy", "true");
      compareButton.textContent = "Comparing photos…";
      status.textContent = "Comparing your photos…";
      try {
        const review = await compareProgressPhotos(apiKey, files.get("earlier"), files.get("recent"), {
          goal: draft.goal,
          split: STYLE_OPTIONS[draftPrefs.style].label,
          daysPerWeek: draftPrefs.daysPerWeek,
          equipment: draftPrefs.equipment.map(id => EQUIPMENT[id]).filter(Boolean),
          notes: String(files.get("notes") || "").trim().slice(0, 800),
        });
        if (!form.isConnected) return;
        result.querySelector("[data-photo-comparison]").textContent = review.comparison;
        result.querySelector("[data-photo-advice]").textContent = review.advice;
        const useRoutine = result.querySelector("[data-photo-routine]");
        useRoutine.hidden = !review.routine;
        useRoutine.onclick = () => {
          workoutSetup = "ai";
          routine = review.routine;
          routineMatch = null;
          step = steps.findIndex(item => item.title === "Training");
          rerender();
          window.scrollTo({ top: 0 });
        };
        result.hidden = false;
        status.textContent = "Photo comparison ready.";
        form.reset();
      } catch (error) {
        status.textContent = error.message || "The photo comparison failed. Try again.";
      } finally {
        compareButton.textContent = idleLabel;
        compareButton.removeAttribute("aria-busy");
        fields.disabled = false;
      }
    });
    for (const card of root.querySelectorAll("[data-set-theme]")) {
      card.addEventListener("click", () => {
        const themeId = card.dataset.setTheme;
        applyTheme(themeId);
        const t = THEMES.find((x) => x.id === themeId);
        toast(`${t?.name || themeId} theme applied`);
        rerender();
      });
    }

    root.querySelector("#f-reset")?.addEventListener("click", doReset);

    paintChrome();
    applyTrack(false);
  }

  async function doSave(destination) {
    const err = validate(draft);
    if (err) { step = 0; rerender(); await notify(err, { title: "Check your inputs" }); return; }
    saveDraft(draftSplits);
    toast(destination === "workout" ? "Workout plan saved." : isOnboarding ? "All set — let's go." : "Profile updated.");
    navigate(destination === "workout" || (isOnboarding && requestedTab === "workout") ? "workout" : "today");
  }

  function saveDraft(splits) {
    const targets = computeTargets(draft);
    const targetWeightLb = projectTargetWeightLb(draft);
    const plan = buildDraftPlan(splits);
    update("settings", (s) => ({
      ...s,
      profile: { ...draft },
      units: draftUnits,
      targets,
      targetWeightLb,
      trainingPrefs: draftPrefs,
      foodPrefs: { ...draftFood },
      plan,
    }));
  }

  async function doReset() {
    const ok = await confirmAction(
      "This erases everything: profile, workouts, meals, water, progress entries, and adaptation history. There is no undo.",
      { title: "Reset all data?", okLabel: "Erase everything", danger: true });
    if (!ok) return;
    clearStorage();
    location.reload();
  }

  // Lightweight live preview of the Review step without a full rerender.
  function rerenderPreview() {
    const targets = computeTargets(draft);
    const grid = root.querySelector(".macros-grid");
    if (!grid) return;
    grid.innerHTML = `
      <div class="m"><b>${targets.kcal}</b><span>kcal/day</span></div>
      <div class="m"><b>${targets.p}g</b><span>Protein</span></div>
      <div class="m"><b>${targets.f}g</b><span>Fat</span></div>
      <div class="m"><b>${targets.c}g</b><span>Carbs</span></div>
    `;
    const hint = grid.nextElementSibling;
    if (hint) hint.textContent = targetsHint(draft);
  }

  rerender();
}

function validate(p) {
  if (!p.weightKg || isNaN(p.weightKg) || p.weightKg < 30 || p.weightKg > 250) {
    return "Weight must be between 30 and 250 kg (66–551 lb).";
  }
  if (!p.heightCm || isNaN(p.heightCm) || p.heightCm < 120 || p.heightCm > 230) {
    return "Height must be between 120 and 230 cm (3'11\"–7'7\").";
  }
  if (!p.age || isNaN(p.age) || p.age < 13 || p.age > 100) {
    return "Age must be between 13 and 100.";
  }
  if (!["male", "female"].includes(p.sex)) return "Pick a sex (for BMR formula).";
  if (!p.activity || !p.goal) return "Pick activity level and goal.";
  return null;
}

function targetsHint(p) {
  const delta = GOAL[p.goal].kcalDelta;
  const sx = SEX[p.sex] || SEX.male;
  let s = `BMR: ${bmr(p)} kcal · TDEE: ${tdee(p)} kcal · ${delta >= 0 ? "+" : ""}${delta} for goal`;
  if (tdee(p) + delta < sx.kcalFloor) s += ` · floored to ${sx.kcalFloor} (${p.sex} minimum)`;
  return s;
}

function goalDesc(k) {
  return {
    fat_loss: "~400 kcal deficit. Lose fat, preserve muscle.",
    recomp:   "Maintenance kcal. Slow simultaneous fat loss + muscle gain.",
    muscle:   "+250 kcal surplus. Build muscle with minimal fat gain.",
    maintain: "Stay at current weight, no body composition change.",
  }[k] || "";
}
