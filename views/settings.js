import { clearStorage, load, update } from "../storage.js";
import {
  ACTIVITY, GOAL, SEX, computeTargets, projectTargetWeightLb,
  bmr, tdee, kgToLb, lbToKg, cmToFtIn, ftInToCm,
} from "../lib/calc.js";
import {
  generatePlan, buildSplits, DEFAULT_PREFS, STYLE_OPTIONS, EXPERIENCE,
  DAY_LABEL, dayFromToken, tokenFromDay,
} from "../lib/plan.js";
import { EQUIPMENT, EQUIPMENT_PRESETS } from "../data/exercises.js";
import { DIETS, PROTEIN_GROUPS, CARB_GROUPS, ALLERGENS, proteinGroupsForDiet } from "../data/foods.js";
import { DEFAULT_FOOD_PREFS } from "../lib/meals.js";
import { notify, confirmAction, toast } from "../lib/modal.js";
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

export function renderSettings(root, { onboarding = false } = {}) {
  const settings = load("settings");
  const isOnboarding = onboarding || !settings.profile;
  const profile = settings.profile || { ...ONBOARDING_DEFAULT };
  const units = settings.units || "imperial";

  let draft = { ...profile };
  let draftUnits = units;
  let draftPrefs = { ...DEFAULT_PREFS, ...(settings.trainingPrefs || {}) };
  let draftSplits = settings.plan?.splits
    ? { ...settings.plan.splits }
    : buildSplits(draftPrefs.style, draftPrefs.daysPerWeek, draft.goal);
  let draftFood = { ...DEFAULT_FOOD_PREFS, ...(settings.foodPrefs || {}) };
  let step = 0; // current wizard step (persists across rerenders)

  function resetSplits() {
    draftSplits = buildSplits(draftPrefs.style, draftPrefs.daysPerWeek, draft.goal);
  }

  // Training-plan configuration card (generator + weekly-layout editor).
  function trainingCard() {
    const eqSet = [...draftPrefs.equipment].sort().join(",");
    const activePreset = Object.entries(EQUIPMENT_PRESETS).find(([, v]) => [...v.equipment].sort().join(",") === eqSet)?.[0];
    return `
      <section class="card">
        <h2>Training plan</h2>
        <p class="hint">Built from these plus your goal (${GOAL[draft.goal].label}). Swap exercises and tweak sets anytime on the Workout tab.</p>

        <h3>Lifting days / week</h3>
        <div class="seg">
          ${[2,3,4,5,6].map(d => `<button class="${draftPrefs.daysPerWeek === d ? "active" : ""}" data-days="${d}">${d}</button>`).join("")}
        </div>

        <h3>Split style</h3>
        <div class="grid-2">
          ${Object.entries(STYLE_OPTIONS).map(([k, v]) => `<button class="${draftPrefs.style === k ? "primary" : ""}" data-style="${k}">${v.label}</button>`).join("")}
        </div>

        <h3>Experience</h3>
        <div class="opt-stack">
          ${Object.entries(EXPERIENCE).map(([k, label]) => `<button class="opt ${draftPrefs.experience === k ? "selected" : ""}" data-exp="${k}"><b>${label}</b></button>`).join("")}
        </div>

        <h3>Equipment</h3>
        <p class="hint" style="margin-top:0">Where do you train? Pick a preset, then fine-tune below.</p>
        <div class="grid-2">
          ${Object.entries(EQUIPMENT_PRESETS).map(([k, v]) => `<button class="${activePreset === k ? "primary" : ""}" data-preset="${k}">${v.label}</button>`).join("")}
        </div>
        <div class="chips" style="margin-top:10px">
          ${Object.entries(EQUIPMENT).filter(([k]) => k !== "bodyweight").map(([k, label]) =>
            `<button class="chip ${draftPrefs.equipment.includes(k) ? "on" : ""}" data-equip="${k}">${label}</button>`).join("")}
        </div>
      </section>
    `;
  }

  // Weekly-layout editor — its own wizard step so the Training step stays light.
  function layoutCard() {
    const liftKeys = STYLE_OPTIONS[draftPrefs.style].keys;
    const dayOptions = [["rest", "Rest"], ["cardio", "Cardio"], ...liftKeys.map(k => [`lift:${k}`, DAY_LABEL[k]])];
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
    root.querySelector("#f-reset")?.addEventListener("click", doReset);

    paintChrome();
    applyTrack(false);
  }

  async function doSave() {
    const err = validate(draft);
    if (err) { step = 0; rerender(); await notify(err, { title: "Check your inputs" }); return; }
    const targets = computeTargets(draft);
    const targetWeightLb = projectTargetWeightLb(draft);
    const plan = generatePlan({ ...draftPrefs, splits: draftSplits }, draft, { preserve: settings.plan });
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
    toast(isOnboarding ? "All set — let's go." : "Profile updated.");
    navigate("today");
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
