import { clearStorage, load, loadApiKey, saveApiKey, update } from "../storage.js";
import {
  ACTIVITY, GOAL, SEX, computeTargets, projectTargetWeightLb,
  bmr, tdee, kgToLb, lbToKg, cmToFtIn, ftInToCm,
} from "../lib/calc.js";
import {
  generatePlan, buildSplits, DEFAULT_PREFS, STYLE_OPTIONS, EXPERIENCE,
  DAY_LABEL, dayLabelFor, dayFromToken, tokenFromDay, VARIANT_SUFFIX,
} from "../lib/plan.js";
import { EQUIPMENT, EQUIPMENT_PRESETS } from "../data/exercises.js";
import { DIETS, PROTEIN_GROUPS, CARB_GROUPS, ALLERGENS, proteinGroupsForDiet } from "../data/foods.js";
import { DEFAULT_FOOD_PREFS } from "../lib/meals.js";
import { notify, confirmAction, toast } from "../lib/modal.js";
import { esc } from "../lib/html.js";
import { matchWorkoutRoutine } from "../lib/workout-ai.js";
import { compareProgressPhotos } from "../lib/progress-photo-ai.js";
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
  let draftSplits = settings.plan?.splits
    ? { ...settings.plan.splits }
    : buildSplits(draftPrefs.style, draftPrefs.daysPerWeek, draft.goal);
  let draftFood = { ...DEFAULT_FOOD_PREFS, ...(settings.foodPrefs || {}) };
  let step = 0; // current wizard step (persists across rerenders)
  let routine = "";
  let routineMatch = null;

  function resetSplits() {
    draftSplits = buildSplits(draftPrefs.style, draftPrefs.daysPerWeek, draft.goal);
  }

  function equipmentChanged() {
    return draftPrefs.equipment.length !== savedPrefs.equipment.length ||
      draftPrefs.equipment.some(item => !savedPrefs.equipment.includes(item));
  }

  // Training-plan configuration card (generator + weekly-layout editor).
  function trainingCard() {
    const eqSet = [...draftPrefs.equipment].sort().join(",");
    const activePreset = Object.entries(EQUIPMENT_PRESETS).find(([, v]) => [...v.equipment].sort().join(",") === eqSet)?.[0];
    return `
      <section class="card">
        <h2>Training plan</h2>
        <p class="hint">Built from these plus your goal (${GOAL[draft.goal].label}). Swap exercises and tweak sets anytime on the Workout tab.</p>

        <label for="workout-routine">Describe your workout routine</label>
        <p class="hint" id="workout-routine-hint">List the exercises you want, such as push-ups, pull-ups, deadlifts, or bench press. Add how many days you train if you know. Tempo will pick a template and fill in the rest using your equipment.</p>
        <textarea id="workout-routine" rows="3" maxlength="800" aria-describedby="workout-routine-hint">${esc(routine)}</textarea>
        <button id="match-workout" type="button">Suggest template with AI</button>
        <p class="hint" id="workout-match-status" role="status">${routineMatch ? "Template selected. Review your choices below and save to rebuild your workouts." : "Uses your saved OpenAI key."}</p>

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
        <p class="hint" style="margin-top:0">Where do you train? Pick a preset, then fine-tune below.</p>
        <div class="training-buttons">
          ${Object.entries(EQUIPMENT_PRESETS).map(([k, v]) => `<button class="${activePreset === k ? "primary" : ""}" data-preset="${k}">${v.label}</button>`).join("")}
        </div>
        <div class="chips training-buttons" style="margin-top:10px">
          ${Object.entries(EQUIPMENT).filter(([k]) => k !== "bodyweight").map(([k, label]) =>
            `<button class="chip ${draftPrefs.equipment.includes(k) ? "on" : ""}" data-equip="${k}">${label}</button>`).join("")}
        </div>
        ${settings.plan && equipmentChanged() ? `<p class="hint">Saving rebuilds your workouts and resets exercise swaps. Your weekly layout and workout logs are kept.</p>` : ""}
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
      <section class="card">
        <h2>AI coach key</h2>
        <p class="hint">Optional. Add your own OpenAI key and coach reviews run on your account instead of the site's shared quota. Your key is stored only in this browser on this device, is never included in your backup file, and is sent straight to OpenAI — it never passes through this site's server.</p>
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
    const currentTheme = localStorage.getItem("tempo_theme") || "emerald";
    const themes = [
      { id: "emerald", name: "Emerald Cyber", desc: "Dark neon green", accent: "#10b981" },
      { id: "oled", name: "OLED Midnight", desc: "Pure black & cyan", accent: "#38bdf8" },
      { id: "amber", name: "Sunset Amber", desc: "Charcoal & warm gold", accent: "#f59e0b" },
      { id: "light", name: "Frost Light", desc: "Crisp daylight", accent: "#059669" },
    ];

    return `
      <section class="card" style="margin-top:14px">
        <h2>Appearance & Theme</h2>
        <p class="hint">Personalize your color palette and display aesthetics.</p>
        <div class="theme-picker-grid">
          ${themes.map(t => `
            <div class="theme-card ${currentTheme === t.id ? "active" : ""}" data-set-theme="${t.id}">
              <div class="theme-swatch" style="background: ${t.accent}; border-color: ${t.accent}"></div>
              <div>
                <b style="font-size:13px;display:block">${t.name}</b>
                <span class="muted small">${t.desc}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }


  // Food-preferences step — drives the meal generator.
  function foodCard() {
    const proteins = proteinGroupsForDiet(draftFood.diet);
    return `
      <section class="card">
        <h2>Food preferences</h2>
        <p class="hint">Your meals are built from foods you actually eat, scaled to your macros.</p>

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
      </section>
    `;
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
          <p class="hint">${isOnboarding ? "A few quick steps and we'll build your calorie, macro, and training targets." : "Edit anything, then Save — your targets recalculate."}</p>
          ${isOnboarding ? `<button class="primary setup-fast-start" id="starter-plan">Start starter workout</button>` : ""}
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
          <p class="hint" style="margin-top:10px">${isOnboarding ? "All set — tap Start tracking." : "Tap Save changes to apply."}</p>
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
              <button type="submit">Compare photos with AI</button>
            </fieldset>
          </form>
          <p id="progress-photo-status" class="hint" role="status"></p>
          <div id="progress-photo-result" hidden>
            <h3>Visible changes</h3>
            <p data-photo-comparison></p>
            <h3>Training guidance</h3>
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

    function paintChrome() {
      head.innerHTML = `
        <span class="wiz-step-label">Step ${step + 1} of ${steps.length} · ${steps[step].title}</span>
        <div class="wiz-dots">
          ${steps.map((s, i) => `<button class="wiz-dot ${i === step ? "active" : ""}" data-goto="${i}" aria-label="Go to ${s.title}"></button>`).join("")}
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

    function setStep(n) {
      step = Math.max(0, Math.min(steps.length - 1, n));
      paintChrome();
      applyTrack(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // ── Form wiring (all steps are in the DOM at once) ──
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

    for (const btn of root.querySelectorAll("button[data-days]")) btn.addEventListener("click", () => { draftPrefs.daysPerWeek = +btn.dataset.days; resetSplits(); rerender(); });
    for (const btn of root.querySelectorAll("button[data-style]")) btn.addEventListener("click", () => { draftPrefs.style = btn.dataset.style; resetSplits(); rerender(); });
    for (const btn of root.querySelectorAll("button[data-exp]")) btn.addEventListener("click", () => { draftPrefs.experience = btn.dataset.exp; rerender(); });
    for (const btn of root.querySelectorAll("button[data-preset]")) btn.addEventListener("click", () => { draftPrefs.equipment = [...EQUIPMENT_PRESETS[btn.dataset.preset].equipment]; rerender(); });
    for (const btn of root.querySelectorAll("button[data-equip]")) btn.addEventListener("click", () => {
      const k = btn.dataset.equip;
      draftPrefs.equipment = draftPrefs.equipment.includes(k) ? draftPrefs.equipment.filter(x => x !== k) : [...draftPrefs.equipment, k];
      rerender();
    });
    const routineInput = root.querySelector("#workout-routine");
    const matchButton = root.querySelector("#match-workout");
    const matchStatus = root.querySelector("#workout-match-status");
    routineInput.addEventListener("input", () => { routine = routineInput.value; });
    matchButton.addEventListener("click", async () => {
      const description = routine.trim();
      if (!description) {
        matchStatus.textContent = "Describe your routine first.";
        routineInput.focus();
        return;
      }
      const apiKey = loadApiKey();
      if (!apiKey) {
        matchStatus.textContent = "Save an OpenAI key in Settings to use this feature.";
        return;
      }
      matchButton.disabled = true;
      routineInput.readOnly = true;
      matchStatus.textContent = "Finding a workout template…";
      try {
        const match = await matchWorkoutRoutine(apiKey, description, draftPrefs);
        if (!matchButton.isConnected) return;
        const style = match.daysPerWeek === 2 && match.style === "ppl" ? "full" : match.style;
        const scheduleChanged = style !== draftPrefs.style || match.daysPerWeek !== draftPrefs.daysPerWeek;
        draftPrefs.style = style;
        draftPrefs.daysPerWeek = match.daysPerWeek;
        routineMatch = match;
        if (scheduleChanged) resetSplits();
        rerender();
      } catch (error) {
        if (matchButton.isConnected) matchStatus.textContent = error.message || "Tempo couldn’t match that routine. Try again.";
      } finally {
        matchButton.disabled = false;
        routineInput.readOnly = false;
      }
    });
    for (const sel of root.querySelectorAll("select[data-day]")) sel.addEventListener("change", (e) => {
      draftSplits = { ...draftSplits, [e.target.dataset.day]: dayFromToken(e.target.value, draft.goal) };
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
    root.querySelector("#f-api-save")?.addEventListener("click", async () => {
      const input = root.querySelector("#f-api-key");
      const value = input.value.trim();
      if (!value) { await notify("Paste your OpenAI key first.", { title: "No key entered" }); return; }
      if (!/^sk-\S{16,}$/.test(value)) {
        await notify("That doesn't look like an OpenAI key — it should start with \"sk-\".", { title: "Check the key" });
        return;
      }
      saveApiKey(value);
      input.value = "";
      toast("Coach key saved to this device");
      rerender();
    });
    root.querySelector("#f-api-clear")?.addEventListener("click", async () => {
      const ok = await confirmAction(
        "Coach reviews will go back to the site's shared quota, which may be limited or unavailable.",
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
      result.hidden = true;
      const apiKey = loadApiKey();
      if (!apiKey) {
        status.textContent = "Save an OpenAI key in Settings to compare your photos.";
        return;
      }
      const files = new FormData(form);
      const fields = form.querySelector("fieldset");
      fields.disabled = true;
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
        fields.disabled = false;
      }
    });
    for (const card of root.querySelectorAll("[data-set-theme]")) {
      card.addEventListener("click", () => {
        const themeId = card.dataset.setTheme;
        localStorage.setItem("tempo_theme", themeId);
        document.documentElement.setAttribute("data-theme", themeId);
        toast(`Applied ${themeId} theme`);
        rerender();
      });
    }

    root.querySelector("#f-reset")?.addEventListener("click", doReset);
    root.querySelector("#starter-plan")?.addEventListener("click", doStarterPlan);

    paintChrome();
    applyTrack(false);
  }

  async function doSave() {
    const err = validate(draft);
    if (err) { step = 0; rerender(); await notify(err, { title: "Check your inputs" }); return; }
    saveDraft(draftSplits);
    toast(isOnboarding ? "All set — let's go." : "Profile updated.");
    navigate(isOnboarding && requestedTab === "workout" ? "workout" : "today");
  }

  async function doStarterPlan() {
    const err = validate(draft);
    if (err) { await notify(err, { title: "Check your inputs" }); return; }
    saveDraft(starterSplits());
    toast("Starter workout ready");
    navigate("workout");
  }

  function saveDraft(splits) {
    const targets = computeTargets(draft);
    const targetWeightLb = projectTargetWeightLb(draft);
    // Keep the existing seed unless this is the first plan.
    const seed = settings.plan?.meta?.seed ?? Math.floor(Math.random() * 1000000);
    const preserve = equipmentChanged() || routineMatch ? null : settings.plan;
    const plan = generatePlan({ ...draftPrefs, splits }, draft, {
      preserve, seed, exerciseIds: routineMatch?.exerciseIds,
    });
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

  function starterSplits() {
    const splits = { ...draftSplits };
    const today = weekdayKey(new Date());
    if (splits[today]?.type !== "lift") {
      const dayKey = STYLE_OPTIONS[draftPrefs.style].keys[0];
      splits[today] = { type: "lift", day: dayKey, label: DAY_LABEL[dayKey] || "Workout" };
    }
    return splits;
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

function weekdayKey(date) {
  return ["sun","mon","tue","wed","thu","fri","sat"][date.getDay()];
}
