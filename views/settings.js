import { clearStorage, load, loadApiKey, saveApiKey, update } from "../storage.js";
import {
  ACTIVITY, GOAL, computeTargets, projectTargetWeightLb,
  kgToLb, lbToKg, cmToFtIn, ftInToCm,
} from "../lib/calc.js";
import {
  generatePlan, buildSplits, DEFAULT_PREFS, STYLE_OPTIONS, TRAINING_TYPES, EXPERIENCE,
  dayLabelFor, dayFromToken, tokenFromDay, VARIANT_SUFFIX,
} from "../lib/plan.js";
import { EQUIPMENT, EQUIPMENT_PRESETS, EXERCISES } from "../data/exercises.js";
import { DIETS, FOODS, PROTEIN_GROUPS, CARB_GROUPS, ALLERGENS, fitsDiet, proteinGroupsForDiet } from "../data/foods.js";
import { DEFAULT_FOOD_PREFS, getMealWeek } from "../lib/meals.js";
import { notify, confirmAction, confirmForm, toast } from "../lib/modal.js";
import { esc } from "../lib/html.js";
import { DEFAULT_OPENAI_MODEL } from "../lib/openai.js";
import { readFamiliarLifts, normalizeFamiliarLifts } from "../lib/familiar-lifts.js";
import { matchWorkoutRoutine } from "../lib/workout-ai.js";
import { isUsdaMatch, searchUsdaFoods } from "../lib/usda-foods.js";
import { suggestFoodPreferences } from "../lib/food-preferences-ai.js";
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

export function renderSettings(root, { onboarding = false, requestedTab = "today", section = "", suggestedRoutine = "" } = {}) {
  const settings = load("settings");
  const isOnboarding = onboarding || (!settings.profile && !(settings.mealSetupPending && settings.plan));
  const profile = settings.profile || { ...ONBOARDING_DEFAULT, goal: settings.plan?.meta?.goal || ONBOARDING_DEFAULT.goal };
  const units = settings.units || "imperial";

  let draft = { ...profile };
  let draftUnits = units;
  const savedPrefs = { ...DEFAULT_PREFS, ...(settings.trainingPrefs || {}) };
  let draftPrefs = isOnboarding ? { ...savedPrefs, style: "full", experience: "beginner", equipment: [], equipmentMode: "presets" } : { ...savedPrefs };
  draftPrefs.equipmentMode ??= matchingPreset() ? "presets" : "custom";
  let equipmentPanel = draftPrefs.equipmentMode;
  let draftSplits = settings.plan?.splits
    ? { ...settings.plan.splits }
    : buildSplits(draftPrefs.style, draftPrefs.daysPerWeek, draft.goal);
  let draftFood = { ...DEFAULT_FOOD_PREFS, ...(settings.foodPrefs || {}) };
  let step = 0; // current wizard step (persists across rerenders)
  let furthestStep = 0;
  let activeSection = ["workout", "meals", "profile", "appearance", "ai"].includes(section) ? section : "";
  let workoutSetup = suggestedRoutine ? "ai" : "presets";
  let foodSetup = "presets";
  let routine = suggestedRoutine;
  let routineMatch = null;
  let foodDescription = "";
  let foodDraftApplied = false;
  let familiarLifts = settings.familiarLifts || [];
  let liftDescription = "";
  let liftsOpen = false;

  function liftSummary(lift) {
    const exercise = EXERCISES.find(ex => ex.id === lift.id);
    return `${esc(exercise.name)} · ${lift.weight} ${lift.unit}${exercise.equip.includes("dumbbell") ? " per dumbbell" : ""}${lift.reps ? ` × ${lift.reps} reps` : ""}`;
  }

  function familiarLiftsHtml() {
    return `<details id="familiar-lifts" ${liftsOpen ? "open" : ""}>
      <summary>Add familiar lifts (optional)</summary>
      ${familiarLifts.length ? `<ul>${familiarLifts.map(lift => `<li>${liftSummary(lift)}</li>`).join("")}</ul>` : ""}
      ${loadApiKey() ? `<label for="lift-description">What weights do you already use?</label>
        <textarea id="lift-description" rows="2" maxlength="800" placeholder="Dumbbell Romanian deadlift: 25 lb in each hand for 8 reps.">${esc(liftDescription)}</textarea>
        <button type="button" id="read-lifts">Review weights with AI</button>
        <p class="hint" id="lift-status" role="status"></p>` : setupKeyForm("lifts")}
    </details>`;
  }

  const planSeed = settings.plan?.meta?.seed ?? Math.floor(Math.random() * 1000000);

  function draftTargets() {
    return !settings.profile || activeSection === "profile" ? computeTargets(draft) : settings.targets;
  }

  function buildDraftPlan(splits) {
    return generatePlan({ ...draftPrefs, splits }, draft, {
      seed: planSeed,
      preserve: equipmentChanged() || draftPrefs.trainingType !== savedPrefs.trainingType || draftPrefs.style !== savedPrefs.style || routineMatch ? null : settings.plan,
      exerciseIds: routineMatch?.exerciseIds,
    });
  }

  function workoutPreview() {
    const plan = buildDraftPlan(draftSplits);
    const usedEquipment = [...new Set(Object.values(plan.workouts).flatMap(list => list.flatMap(ex => ex.equip)))];
    return `
      <h3>${STYLE_OPTIONS[draftPrefs.style].label} · ${TRAINING_TYPES[draftPrefs.trainingType].label}</h3>
      <p class="hint">Equipment used · ${usedEquipment.map(id => EQUIPMENT[id]).filter(Boolean).join(", ") || "No matching equipment"}</p>
      ${Object.values(plan.workouts).some(list => list.length < 4) ? `<p class="hint">Some sessions have fewer exercises because this focus and equipment have a limited selection. Tempo does not add exercises outside your choices.</p>` : ""}
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
          <button type="button" data-setup="${section}" data-mode="${mode}" aria-pressed="${selected === mode}">${label}</button>
        `).join("")}
      </div>`;
  }

  function setupKeyForm(section) {
    return `
      <form data-setup-key="${section}">
        <p class="hint">Enter your own OpenAI key to use this optional AI feature.</p>
        <label for="${section}-setup-key">OpenAI API key</label>
        <input id="${section}-setup-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" />
        <label><input type="checkbox" data-remember-key /> Remember key on this device</label>
        <button type="submit" class="primary">Use key and continue</button>
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
        <p class="hint" id="workout-routine-hint">Tell Tempo what you want to train, how many days a week, and what equipment you want to use. Try “Three days of upper-body calisthenics with a pull-up bar,” or “Legs only, twice a week, with dumbbells.”</p>
        <textarea id="workout-routine" rows="3" maxlength="800" aria-describedby="workout-routine-hint">${esc(routine)}</textarea>
        <button id="match-workout" type="button" class="primary">Build workout preview</button>
        <p class="hint" id="workout-match-status" role="status">${routineMatch ? "Workout preview ready." : "Uses your saved OpenAI key."}</p>
        ${routineMatch ? `
          ${isOnboarding ? `<div id="workout-preview">${workoutPreview()}</div>` : ""}
          <div class="training-buttons">
            <button id="edit-workout-plan" type="button">Edit plan settings</button>
          </div>` : ""}
        ` : setupKeyForm("workout")) : ""}
        ${workoutSetup === "presets" ? `
        <p class="hint">Built from these plus your goal (${GOAL[draft.goal].label}). Swap exercises and tweak sets anytime on the Workout tab.</p>

        <h3>Strength days / week</h3>
        <div class="seg">
          ${[2,3,4,5,6].map(d => `<button aria-pressed="${draftPrefs.daysPerWeek === d}" data-days="${d}">${d}</button>`).join("")}
        </div>

        <div class="training-combinations">
        <label for="training-focus">Workout focus</label>
        <select id="training-focus">
          ${Object.entries(STYLE_OPTIONS).map(([id, option]) => `<option value="${id}" ${draftPrefs.style === id ? "selected" : ""}>${option.label}</option>`).join("")}
        </select>
        <p class="hint">Applies to strength sessions. Adjust cardio and rest days in Weekly layout.</p>
        <label for="training-type">Training type</label>
        <select id="training-type" aria-describedby="training-type-hint">
          ${Object.entries(TRAINING_TYPES).map(([id, option]) => `<option value="${id}" ${draftPrefs.trainingType === id ? "selected" : ""}>${option.label}</option>`).join("")}
        </select>
        <p class="hint" id="training-type-hint">${TRAINING_TYPES[draftPrefs.trainingType].description} Your equipment selections are kept when you switch types.</p>
        </div>

        <h3 id="experience-heading">Experience</h3>
        <div class="opt-stack" role="group" aria-labelledby="experience-heading">
          ${Object.entries(EXPERIENCE).map(([k, label]) => `
            <button type="button" class="opt" data-exp="${k}" aria-pressed="${draftPrefs.experience === k}">
              <b>${label}</b>
            </button>`).join("")}
        </div>

        <h3>Equipment</h3>
        <div class="seg" role="group" aria-label="Equipment options">
          <button type="button" data-equipment-panel="presets" aria-pressed="${equipmentPanel === "presets"}">Presets</button>
          <button type="button" data-equipment-panel="custom" aria-pressed="${equipmentPanel === "custom"}">Custom</button>
        </div>
        ${equipmentPanel === "presets" ? `
          <p class="hint">${activePreset ? "Pick an equipment preset." : "Your custom equipment is active. Choose a preset to switch."}</p>
          <div class="training-buttons">
            ${Object.entries(EQUIPMENT_PRESETS).map(([k, v]) => `<button type="button" data-preset="${k}" aria-pressed="${activePreset === k}">${v.label}</button>`).join("")}
          </div>` : `
          <p class="hint">Select the equipment you want to use. Clear all selections for bodyweight only.</p>
          <div class="chips training-buttons">
            ${Object.entries(EQUIPMENT).filter(([k]) => k !== "bodyweight").map(([k, label]) => {
              const selected = draftPrefs.equipment.includes(k);
              return `<button type="button" class="chip" data-equip="${k}" aria-pressed="${selected}">${label}</button>`;
            }).join("")}
          </div>`}
        ${settings.plan && equipmentChanged() ? `<p class="hint">Saving rebuilds your workouts and resets exercise swaps. Your weekly layout and workout logs are kept.</p>` : ""}
        ` : ""}
        ${familiarLiftsHtml()}
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
        <p class="hint">Set what each day is. Lift days use your ${STYLE_OPTIONS[draftPrefs.style].label} focus; cardio uses a treadmill when available, otherwise an outdoor walk.</p>
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
        <p class="hint">Use your own OpenAI key to enable workout setup, photo comparisons, meal analysis, and coach reviews with <b>${DEFAULT_OPENAI_MODEL}</b>. Requests go directly to OpenAI. By default the key clears when you reload or close this tab.</p>
        ${saved ? `<p class="hint" style="margin-top:0">Saved key: <b>sk-…${esc(saved.slice(-4))}</b></p>` : ""}
        <label for="f-api-key">OpenAI API key</label>
        <input id="f-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="${saved ? "Enter a new key to replace" : "sk-…"}" />
        <label><input type="checkbox" data-remember-key /> Remember key on this device</label>
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
            <button type="button" class="theme-card" data-set-theme="${t.id}" aria-pressed="${active === t.id}">
              <span class="theme-swatch" data-theme="${t.id}" aria-hidden="true"></span>
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
        <button id="suggest-food" class="primary" type="button">Build meal preview</button>
        <p id="food-match-status" class="hint" role="status">${foodDraftApplied ? "Draft ready. Continue to Review to save your plans." : "Uses your own OpenAI key."}</p>
        ` : setupKeyForm("food")) : ""}
        ${foodSetup === "presets" ? `
        <p class="hint">Choose your diet, favorite food groups, and foods to avoid.</p>
        ${preferredFoods.length ? `
          <p class="hint">Preferred ingredients · ${preferredFoods.map(food => esc(food.name)).join(", ")}</p>
          <button id="clear-preferred-foods" type="button">Clear preferred ingredients</button>` : ""}

        <h3>Diet</h3>
        <div class="grid-2">
          ${Object.entries(DIETS).map(([k, label]) => `<button aria-pressed="${draftFood.diet === k}" data-diet="${k}">${label}</button>`).join("")}
        </div>

        <h3>Protein sources you like</h3>
        <div class="chips">
          ${proteins.map((k) => `<button class="chip" aria-pressed="${draftFood.proteins.includes(k)}" data-protein="${k}">${PROTEIN_GROUPS[k]}</button>`).join("")}
        </div>

        <h3>Carb sources you like</h3>
        <div class="chips">
          ${Object.entries(CARB_GROUPS).map(([k, label]) => `<button class="chip" aria-pressed="${draftFood.carbs.includes(k)}" data-carb="${k}">${label}</button>`).join("")}
        </div>

        <h3>Avoid</h3>
        <div class="chips">
          ${Object.entries(ALLERGENS).map(([k, label]) => `<button class="chip" aria-pressed="${draftFood.avoid.includes(k)}" data-avoid="${k}">${label}</button>`).join("")}
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

  // Keep onboarding controls mounted while showing only the current step.
  function workoutSetupSteps() {
    const goals = { fat_loss: "Lose fat", muscle: "Build muscle", recomp: "Build muscle and lose fat", maintain: "Maintain my fitness" };
    return [
      { title: "Goal", html: `<section class="card"><h2>What’s your workout goal?</h2>
        <div class="opt-stack">${Object.entries(goals).map(([id, label]) =>
          `<button class="opt" data-goal="${id}" aria-pressed="${draft.goal === id}">${esc(label)}</button>`).join("")}</div></section>` },
      { title: "Workout", html: `<section class="card"><h2>Your workout week</h2>
        <label for="setup-days">Workout days per week</label>
        <select id="setup-days">${[2,3,4,5,6].map(n => `<option ${draftPrefs.daysPerWeek === n ? "selected" : ""}>${n}</option>`).join("")}</select>
        <label for="setup-experience">Training experience</label>
        <select id="setup-experience">${Object.entries(EXPERIENCE).map(([id,label]) => `<option value="${id}" ${draftPrefs.experience === id ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>
        <label for="setup-equipment">Available equipment</label>
        <select id="setup-equipment">${Object.entries(EQUIPMENT_PRESETS).map(([id,preset]) => `<option value="${id}" ${matchingPreset() === id ? "selected" : ""}>${esc(preset.label)}</option>`).join("")}</select>
        <p class="hint">Workout days: ${WEEKDAYS.filter(([day]) => draftSplits[day]?.type === "lift").map(([,label]) => label).join(", ")}. You can change these later.</p>
        ${familiarLiftsHtml()}
      </section>` },
    ];
  }

  function buildSteps() {
    if (isOnboarding) return workoutSetupSteps();
    const ftin = cmToFtIn(draft.heightCm);
    const wDisp = draftUnits === "imperial" ? kgToLb(draft.weightKg) : draft.weightKg;

    return [
      { title: "You", html: `
        <section class="card">
          <h2>Your profile</h2>
          <p class="hint">These details help estimate your daily nutrition targets.</p>
          <h3>Units</h3>
          <div class="grid-2">
            <button aria-pressed="${draftUnits === "imperial"}" data-units="imperial">Imperial (lb, ft/in)</button>
            <button aria-pressed="${draftUnits === "metric"}" data-units="metric">Metric (kg, cm)</button>
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
          <p class="hint" style="margin-top:0">Used to estimate daily calorie needs.</p>
          <div class="grid-2">
            <button aria-pressed="${draft.sex === "male"}" data-sex="male">Male</button>
            <button aria-pressed="${draft.sex === "female"}" data-sex="female">Female</button>
          </div>
        </section>` },

      { title: "Activity", html: `
        <section class="card">
          <h2>Activity & schedule</h2>
          <h3>Activity level</h3>
          <div class="opt-stack">
            ${Object.entries(ACTIVITY).map(([k, v]) => `
              <button class="opt" aria-pressed="${draft.activity === k}" data-activity="${k}">
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
              <button class="opt" aria-pressed="${draft.goal === k}" data-goal="${k}">
                <b>${v.label}</b><span class="opt-desc">${goalDesc(k)}</span>
              </button>`).join("")}
          </div>
        </section>` },

      { title: "Food", html: foodCard() },

      { title: "Training", html: trainingCard() },

      { title: "Layout", html: layoutCard() },

    ];

  }

  function rerender() {
    const steps = buildSteps();
    step = Math.min(step, steps.length - 1);

    const sections = [
      ["workout", "Workout plan", "Choose a template or describe your routine and equipment."],
      ["meals", "Meal plan", "Set food preferences or build a weekly plan with AI."],
      ["profile", "Profile & goals", "Update your measurements, targets, and daily schedule."],
      ["appearance", "Appearance", "Choose your Tempo theme."],
      ["ai", "AI key", "Manage your own OpenAI key."],
    ];
    const visibleSteps = { workout: [4, 5], meals: settings.mealSetupPending && !settings.profile ? [0, 1, 3] : [3], profile: [0, 1, 2] }[activeSection] || [];
    root.innerHTML = isOnboarding ? `
      <div class="wiz-head"></div>
      <div class="wizard"><div class="wizard-track">${steps.map(s => `<div class="wizard-step">${s.html}</div>`).join("")}</div></div>
      <div class="wiz-nav"></div>` : `
      ${activeSection ? `<button type="button" class="ghost" id="settings-back">← Settings</button>
        <p class="hint">${visibleSteps.length ? "Changes stay in a draft until you preview and save." : ""}</p>` : `
        <p class="hint">Manage your plans and preferences.</p>
        <div class="settings-menu">
          ${sections.map(([id, title, detail]) => `<button type="button" data-settings-section="${id}"><b>${title}</b><span>${detail}</span></button>`).join("")}
        </div>`}
      ${steps.map((s, i) => `<div ${visibleSteps.includes(i) ? "" : "hidden"}>${s.html}</div>`).join("")}
      ${visibleSteps.length && !(activeSection === "meals" && foodSetup === "ai") ? `<button type="button" class="primary today-action" id="preview-settings" ${activeSection === "workout" && workoutSetup === "ai" && !routineMatch ? "disabled" : ""}>${activeSection === "workout" ? "Preview workout plan" : activeSection === "meals" ? "Preview meal plan" : "Preview changes"}</button>` : ""}
      ${activeSection === "appearance" ? themePickerCard() : ""}
      ${activeSection === "ai" ? coachKeyCard() : ""}
      ${!activeSection ? `<details class="card settings-data"><summary>Data & backup</summary>
        <p class="hint">Your plans and logs are saved in this browser.</p>
        <button type="button" id="settings-backup">Open backup tools</button>
        <button class="ghost danger" id="f-reset">Reset all data</button>
      </details>` : ""}
    `;
    for (const button of root.querySelectorAll("[data-settings-section]")) {
      button.addEventListener("click", () => openSection(button.dataset.settingsSection));
    }
    root.querySelector("#settings-back")?.addEventListener("click", async () => {
      if (hasDraftChanges() && !await confirmAction("Your unsaved edits will be discarded.", { title: "Leave this section?", okLabel: "Discard edits", cancelLabel: "Keep editing" })) return;
      navigate("settings");
    });
    root.querySelector("#settings-backup")?.addEventListener("click", () => navigate("progress", { section: "backup" }));
    root.querySelector("#preview-settings")?.addEventListener("click", previewSettings);

    const track = root.querySelector(".wizard-track");
    const head = root.querySelector(".wiz-head");
    const nav = root.querySelector(".wiz-nav");

    function syncStep() {
      if (!isOnboarding) return;
      [...track.children].forEach((child, i) => { child.hidden = i !== step; });
    }

    function paintChrome() {
      if (!isOnboarding) return;
      head.innerHTML = `
        <span class="wiz-step-label">Step ${step + 1} of ${steps.length} · ${steps[step].title}</span>
        <div class="wiz-dots">
          ${steps.map((s, i) => `<button class="wiz-dot ${i === step ? "active" : ""}" aria-current="${i === step ? "step" : "false"}" data-goto="${i}" aria-label="Go to ${s.title}" ${isOnboarding && i > furthestStep ? "disabled" : ""}></button>`).join("")}
        </div>`;
      nav.innerHTML = `
        <button class="ghost" id="wiz-back" ${step === 0 ? "disabled" : ""}>← Back</button>
        ${step < steps.length - 1
          ? `<button class="primary" id="wiz-next">Next →</button>`
          : `<button class="primary" id="f-save">${isOnboarding ? "Use this workout plan" : "Save changes"}</button>`}`;
      nav.querySelector("#wiz-back")?.addEventListener("click", () => setStep(step - 1));
      nav.querySelector("#wiz-next")?.addEventListener("click", () => setStep(step + 1));
      nav.querySelector("#f-save")?.addEventListener("click", doSave);
      for (const d of head.querySelectorAll("button[data-goto]")) d.addEventListener("click", () => setStep(+d.dataset.goto));
    }

    function setStep(n, scrollTarget) {
      step = Math.max(0, Math.min(steps.length - 1, n));
      furthestStep = Math.max(furthestStep, step);
      paintChrome();
      syncStep();
      if (scrollTarget) scrollTarget.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    }

    const liftDetails = root.querySelector("#familiar-lifts");
    liftDetails?.addEventListener("toggle", () => { if (liftDetails.isConnected) liftsOpen = liftDetails.open; });
    const liftInput = root.querySelector("#lift-description");
    liftInput?.addEventListener("input", () => { liftDescription = liftInput.value; });
    root.querySelector("#read-lifts")?.addEventListener("click", async event => {
      if (!liftDescription.trim()) { liftInput.focus(); return; }
      const button = event.currentTarget;
      const status = root.querySelector("#lift-status");
      button.disabled = true;
      liftInput.readOnly = true;
      status.textContent = "Reading your weights…";
      try {
        const lifts = await readFamiliarLifts(loadApiKey(), liftDescription);
        if (!button.isConnected) return;
        status.textContent = "";
        const confirmed = await confirmForm(`<ul>${lifts.map(lift => `<li>${liftSummary(lift)}</li>`).join("")}</ul>
          <p>Use these starting weights for exercises in your plan?</p>`, { title: "Check your weights", okLabel: "Use these weights", cancelLabel: "Edit description" });
        if (confirmed && button.isConnected) {
          familiarLifts = normalizeFamiliarLifts([...familiarLifts, ...lifts]);
          liftDescription = "";
          liftsOpen = true;
          rerender();
        }
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
        liftInput.readOnly = false;
      }
    });

    root.querySelector("#setup-days")?.addEventListener("change", event => {
      draftPrefs.daysPerWeek = Number(event.target.value);
      resetSplits();
      rerender();
      root.querySelector("#setup-days").focus();
    });
    root.querySelector("#setup-experience")?.addEventListener("change", event => { draftPrefs.experience = event.target.value; });
    root.querySelector("#setup-equipment")?.addEventListener("change", event => { draftPrefs.equipment = [...EQUIPMENT_PRESETS[event.target.value].equipment]; });

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
    });
    root.querySelector("#f-age")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value);
      if (!isNaN(v)) { draft.age = v; }
    });
    root.querySelector("#f-cm")?.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) { draft.heightCm = v; }
    });
    root.querySelector("#f-ft")?.addEventListener("input", () => updateHeightFromFtIn());
    root.querySelector("#f-in")?.addEventListener("input", () => updateHeightFromFtIn());
    function updateHeightFromFtIn() {
      const ft = parseInt(root.querySelector("#f-ft")?.value) || 0;
      const inches = parseFloat(root.querySelector("#f-in")?.value) || 0;
      draft.heightCm = ftInToCm(ft, inches);
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
        let rows = [];
        if (candidates.length) {
          foodStatus.textContent = "Looking up ingredients in USDA FoodData Central…";
          const results = await Promise.allSettled(candidates.map(food => searchUsdaFoods(food.name)));
          if (!foodButton.isConnected) return;
          rows = candidates.map((food, i) => {
            const items = results[i].value?.items.filter(item => isUsdaMatch(item, food)) || [];
            const saved = foodPrefs.usdaFoods.find(item => item.foodId === food.id);
            if (saved && !items.some(item => item.fdcId === saved.fdcId)) items.unshift(saved);
            return { food, items, saved };
          }).filter(row => row.items.length);
          const limitError = results.find(result => result.status === "rejected" && result.reason?.status === 429);
          if (limitError) usdaNote = `${limitError.reason.message} You can still use this plan with Tempo’s estimates for ingredients without a USDA match.`;
          else if (results.some(result => result.status === "rejected")) usdaNote = "Some USDA lookups were unavailable. Tempo estimates are used where no USDA entry was selected.";
          else if (!rows.length) usdaNote = "No usable USDA entries were found. This plan uses Tempo estimates.";
        }
        foodPrefs.weekly = true;
        const week = getMealWeek({ targets: draftTargets(), foodPrefs });
        if (week.some(meals => meals.some(meal => !meal.items))) {
          throw new Error("Tempo couldn’t fill every meal with foods that match these restrictions.");
        }
        const excluded = foodPrefs.avoid.map(id => ALLERGENS[id]).filter(Boolean).join(", ");
        const accepted = await confirmForm(`
          <p><b>${esc(DIETS[foodPrefs.diet])}</b> · Avoid: ${esc(excluded || "None selected")}</p>
          ${unmatchedFoods.length ? `<p class="hint">Unavailable in the meal planner: ${esc(unmatchedFoods.join(", "))}.</p>` : ""}
          <p class="hint">This plan repeats each week. Tempo calculates portions from your nutrition targets. Review the ingredients and exclusions before saving.</p>
          ${rows.length ? `<details class="compact-details"><summary>Ingredient nutrition sources</summary>
            <p class="hint">USDA entries are optional. Choose a match only if the ingredient and preparation agree. Portions below update when you change a source.</p>
            ${rows.map(({ food, items, saved }, i) => `<label>${esc(food.name)}
              <select data-usda-row="${i}"><option value="">Use Tempo estimates</option>
                ${items.map(item => `<option value="${item.fdcId}" ${saved?.fdcId === item.fdcId ? "selected" : ""}>${esc(item.name)}</option>`).join("")}
              </select></label>`).join("")}
          </details>` : ""}
          ${usdaNote ? `<p class="hint">${esc(usdaNote)}</p>` : ""}
          <div data-meal-preview>${mealDaysPreview(week)}</div>`, {
          title: "Meal plan preview", okLabel: isOnboarding ? "Use in setup" : "Save meal plan",
          onMount: wrap => {
            for (const select of wrap.querySelectorAll("[data-usda-row]")) select.addEventListener("change", () => {
              const selections = [...wrap.querySelectorAll("[data-usda-row]")].flatMap(select => {
                const { food, items } = rows[Number(select.dataset.usdaRow)];
                const item = items.find(entry => entry.fdcId === Number(select.value));
                return item ? [{ ...item, foodId: food.id }] : [];
              });
              foodPrefs.usdaFoods = foodPrefs.usdaFoods.filter(item => !rows.some(row => row.food.id === item.foodId)).concat(selections);
              wrap.querySelector("[data-meal-preview]").innerHTML = mealDaysPreview(getMealWeek({ targets: draftTargets(), foodPrefs }));
            });
          },
        });
        if (!foodButton.isConnected) return;
        if (accepted) {
          draftFood = foodPrefs;
          foodDraftApplied = true;
          if (isOnboarding) rerender();
          else doSave();
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
        if (foodButton.isConnected) syncStep();
      }
    });

    for (const btn of root.querySelectorAll("button[data-days]")) btn.addEventListener("click", () => { draftPrefs.daysPerWeek = +btn.dataset.days; resetSplits(); rerender(); });
    root.querySelector("#training-focus")?.addEventListener("change", event => {
      draftPrefs.style = event.target.value;
      routineMatch = null;
      resetSplits();
      rerender();
      root.querySelector("#training-focus")?.focus({ preventScroll: true });
    });
    root.querySelector("#training-type")?.addEventListener("change", event => {
      draftPrefs.trainingType = event.target.value;
      routineMatch = null;
      rerender();
      root.querySelector("#training-type")?.focus({ preventScroll: true });
    });
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
      syncStep();
      try {
        const match = await matchWorkoutRoutine(apiKey, description, draftPrefs);
        if (!matchButton.isConnected) return;
        const style = match.daysPerWeek === 2 && match.style === "ppl" ? "full" : match.style;
        const scheduleChanged = style !== draftPrefs.style || match.daysPerWeek !== draftPrefs.daysPerWeek;
        draftPrefs.style = style;
        draftPrefs.trainingType = match.trainingType;
        draftPrefs.daysPerWeek = match.daysPerWeek;
        if (match.equipment !== null) {
          draftPrefs.equipment = match.equipment;
          draftPrefs.customEquipment = match.equipment;
          draftPrefs.equipmentMode = equipmentPanel = "custom";
        }
        routineMatch = { ...match, style };
        if (scheduleChanged) resetSplits();
        rerender();
        if (!isOnboarding) await previewSettings();
      } catch (error) {
        if (matchButton.isConnected) matchStatus.textContent = error.message || "Tempo couldn’t match that routine. Try again.";
      } finally {
        matchButton.disabled = false;
        matchButton.removeAttribute("aria-busy");
        matchButton.textContent = idleLabel;
        routineInput.readOnly = false;
        if (matchButton.isConnected) syncStep();
      }
    });
    for (const sel of root.querySelectorAll("select[data-day]")) sel.addEventListener("change", (e) => {
      draftSplits = { ...draftSplits, [e.target.dataset.day]: dayFromToken(e.target.value, draft.goal) };
      const preview = root.querySelector("#workout-preview");
      if (preview) preview.innerHTML = workoutPreview();
    });
    root.querySelector("#shuffle-ex")?.addEventListener("click", async () => {
      if (!await checkWorkoutSelection()) return;
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
      const remember = input.closest("form, section").querySelector("[data-remember-key]").checked;
      const stored = saveApiKey(value, remember);
      input.value = "";
      toast(remember && stored ? "Key remembered on this device" : "Key ready for this tab");
      rerender();
      if (nextField) root.querySelector(nextField)?.focus();
    }

    for (const form of root.querySelectorAll("[data-setup-key]")) {
      form.addEventListener("submit", event => {
        event.preventDefault();
        const nextField = { workout: "#workout-routine", food: "#food-description", lifts: "#lift-description" }[form.dataset.setupKey];
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
    syncStep();
  }

  const initialDraft = JSON.stringify([draft, draftUnits, draftPrefs, draftSplits, draftFood, familiarLifts]);
  function hasDraftChanges() {
    return JSON.stringify([draft, draftUnits, draftPrefs, draftSplits, draftFood, familiarLifts]) !== initialDraft;
  }

  function openSection(next) {
    activeSection = next;
    history.replaceState({}, "", `/settings?section=${next}`);
    rerender();
    window.scrollTo(0, 0);
  }

  async function checkWorkoutSelection() {
    const plan = buildDraftPlan(draftSplits);
    if (Object.values(plan.workouts).some(list => !list.length)) {
      await notify("No exercises match one or more sessions. Choose equipment that fits your training type, or change your focus or training type. Your saved plan is unchanged.", { title: "Check your workout choices" });
      return false;
    }
    return true;
  }

  async function previewSettings() {
    const err = validate(draft);
    if (err) { await notify(err, { title: "Check your inputs" }); return; }
    if (activeSection !== "meals" && !await checkWorkoutSelection()) return;
    const targets = computeTargets(draft);
    const mealTargets = draftTargets();
    const html = activeSection === "workout" ? workoutPreview()
      : activeSection === "meals" ? mealDaysPreview(getMealWeek({ targets: mealTargets, foodPrefs: draftFood }))
      : `<p>Daily targets: <b>${targets.kcal} kcal</b> · ${targets.p} g protein · ${targets.c} g carbs · ${targets.f} g fat.</p>${workoutPreview()}<p class="hint">Your meal portions update to match these targets.</p>`;
    const accepted = await confirmForm(html, {
      title: activeSection === "workout" ? "Workout plan preview" : activeSection === "meals" ? "Meal plan preview" : "Review your changes",
      okLabel: activeSection === "workout" ? "Save workout plan" : activeSection === "meals" ? "Save meal plan" : "Save changes",
    });
    if (accepted) doSave();
  }

  async function doSave() {
    const err = validate(draft);
    if (err) { step = 0; if (!isOnboarding) activeSection = "profile"; rerender(); await notify(err, { title: "Check your inputs" }); return; }
    if ((isOnboarding || activeSection !== "meals") && !await checkWorkoutSelection()) return;
    const targets = computeTargets(draft);
    update("settings", (s) => ({
      ...s,
      ...((!isOnboarding && (activeSection === "profile" || (activeSection === "meals" && !settings.profile))) ? {
        profile: { ...draft }, units: draftUnits, targets, targetWeightLb: projectTargetWeightLb(draft),
      } : {}),
      ...((isOnboarding || activeSection === "workout" || activeSection === "profile") ? {
        trainingPrefs: draftPrefs, plan: buildDraftPlan(draftSplits),
      } : {}),
      ...(isOnboarding || activeSection === "workout" ? { familiarLifts } : {}),
      ...(isOnboarding ? { mealSetupPending: true } : {}),
      ...(activeSection === "meals" && !isOnboarding ? { foodPrefs: { ...draftFood }, mealSetupPending: false } : {}),
    }));
    toast(isOnboarding ? "All set — let's go." : activeSection === "workout" ? "Workout plan saved." : activeSection === "meals" ? "Meal plan saved." : "Profile updated.");
    navigate(isOnboarding ? requestedTab === "settings" ? "today" : requestedTab : activeSection === "workout" ? "workout" : activeSection === "meals" ? "meals" : "settings");
  }

  async function doReset() {
    const ok = await confirmAction(
      "This erases everything: profile, workouts, meals, water, progress entries, and adaptation history. There is no undo.",
      { title: "Reset all data?", okLabel: "Erase everything", danger: true });
    if (!ok) return;
    clearStorage();
    location.reload();
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

function goalDesc(k) {
  return {
    fat_loss: "~400 kcal deficit. Lose fat, preserve muscle.",
    recomp:   "Maintenance kcal. Slow simultaneous fat loss + muscle gain.",
    muscle:   "+250 kcal surplus. Build muscle with minimal fat gain.",
    maintain: "Stay at current weight, no body composition change.",
  }[k] || "";
}
