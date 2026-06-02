// Calorie + macro derivation from user profile.
// Internally stores weight in kg, height in cm. UI converts based on units pref.

export const ACTIVITY = {
  sedentary:   { mult: 1.2,   label: "Sedentary",    desc: "Desk job, little exercise" },
  light:       { mult: 1.375, label: "Lightly active", desc: "Light exercise 1–3×/wk" },
  moderate:    { mult: 1.55,  label: "Moderate",     desc: "Exercise 3–5×/wk (your default)" },
  very:        { mult: 1.725, label: "Very active",  desc: "Exercise 6–7×/wk + sport" },
  athlete:     { mult: 1.9,   label: "Athlete",      desc: "Twice-daily / hard physical job" },
};

export const GOAL = {
  fat_loss: { kcalDelta: -400, proteinPerLb: 1.0, fatPct: 0.28, label: "Fat loss" },
  recomp:   { kcalDelta:    0, proteinPerLb: 1.0, fatPct: 0.28, label: "Body recomp" },
  muscle:   { kcalDelta:  250, proteinPerLb: 0.9, fatPct: 0.25, label: "Lean muscle gain" },
  maintain: { kcalDelta:    0, proteinPerLb: 0.8, fatPct: 0.30, label: "Maintain" },
};

// Mifflin-St Jeor BMR in kcal/day. weight kg, height cm, age years.
export function bmr({ weightKg, heightCm, age, sex }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === "male" ? 5 : -161));
}

export function tdee(profile) {
  return Math.round(bmr(profile) * ACTIVITY[profile.activity].mult);
}

// Sex-based physiology beyond raw BMR (which already uses the Mifflin-St Jeor
// sex term). Captures body-composition and dietary differences:
//   kcalFloor   — lowest safe daily intake without medical supervision.
//   minFatPerLb — dietary-fat floor (g/lb); women need more for hormonal health.
//   lossMult / gainMult — default goal-weight target, since healthy body-fat
//                 ranges and rates of muscle gain differ by sex.
export const SEX = {
  male:   { kcalFloor: 1500, minFatPerLb: 0.30, lossMult: 0.92, gainMult: 1.05 },
  female: { kcalFloor: 1200, minFatPerLb: 0.40, lossMult: 0.95, gainMult: 1.04 },
};

const sexOf = (profile) => SEX[profile?.sex] || SEX.male;

// Split a calorie target into protein/fat/carb grams for this profile, honoring
// the sex-based dietary-fat floor. Shared by computeTargets and the calorie
// recalibration so the two never drift apart.
export function macrosForKcal(profile, kcal) {
  const goal = GOAL[profile.goal];
  const weightLb = kgToLb(profile.weightKg);
  const p = Math.round(weightLb * goal.proteinPerLb);
  const f = Math.round(Math.max((kcal * goal.fatPct) / 9, sexOf(profile).minFatPerLb * weightLb));
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return { p, f, c };
}

export function computeTargets(profile) {
  if (!profile) return null;
  const maintenance = tdee(profile);
  const kcal = Math.max(sexOf(profile).kcalFloor, maintenance + GOAL[profile.goal].kcalDelta);
  return { kcal, ...macrosForKcal(profile, kcal), maintenance };
}

export function projectTargetWeightLb(profile) {
  if (!profile) return null;
  const lb = kgToLb(profile.weightKg);
  const sex = sexOf(profile);
  if (profile.goal === "fat_loss") return Math.round(lb * sex.lossMult);
  if (profile.goal === "muscle")   return Math.round(lb * sex.gainMult);
  return Math.round(lb);
}

// Conversions
export const kgToLb = (kg) => +(kg * 2.20462).toFixed(1);
export const lbToKg = (lb) => +(lb / 2.20462).toFixed(2);
export const cmToIn = (cm) => +(cm / 2.54).toFixed(1);
export const inToCm = (inches) => +(inches * 2.54).toFixed(1);
export const cmToFtIn = (cm) => {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inches = +(totalIn - ft * 12).toFixed(1);
  return { ft, in: inches };
};
export const ftInToCm = (ft, inches) => +((ft * 12 + inches) * 2.54).toFixed(1);

// Water target in mL/day. Base 35 mL/kg + extras for activity, fat-loss, training day.
// Heuristic, not medical guidance. Returns mL (round to nearest 100).
export function waterTargetMl(profile, { trainingToday = false } = {}) {
  if (!profile) return 2500;
  let ml = profile.weightKg * 35;
  const act = profile.activity;
  if (act === "very" || act === "athlete") ml += 500;
  else if (act === "moderate") ml += 300;
  if (profile.goal === "fat_loss") ml += 400; // satiety + protein metabolism
  if (profile.goal === "muscle")  ml += 300;  // higher protein, more synthesis
  if (trainingToday) ml += 500;
  return Math.round(ml / 100) * 100;
}

export const mlToOz = (ml) => +(ml / 29.5735).toFixed(1);

// Progress-bar helpers shared by the Today + Meals views.
export function pct(a, b) { return Math.min(100, Math.round((a / b) * 100)); }
export function barClass(a, b) {
  if (a > b * 1.05) return "over";
  if (a > b * 0.9) return "warn";
  return "";
}

// Meal timing — derives target time per meal from wake/sleep + optional training time.
// Returns "HH:MM" strings.
//
// Strategy:
//   breakfast    = wake + 60 min
//   mid-morning  = wake + 4 hr
//   lunch        = wake + 6 hr 30
//   pre-workout  = training - 45 min, or sleep - 6 hr 30 if no training
//   dinner       = training + 75 min if training in evening, else sleep - 3 hr
//   evening      = sleep - 90 min  (light, slow-digesting)
//
// trainingTime: optional "HH:MM" of today's lifting/soccer session.
export function mealTimes(wakeStr = "06:30", sleepStr = "22:30", trainingStr = null) {
  const wake = toMin(wakeStr);
  let sleep = toMin(sleepStr);
  if (sleep < wake) sleep += 24 * 60; // handle past-midnight bedtime
  const train = trainingStr ? toMin(trainingStr) : null;

  const eveningTime = sleep - 90;
  const preTime = train != null ? train - 45 : sleep - 390;
  const dinTime = train != null && train >= wake + 8 * 60 ? train + 75 : sleep - 180;

  return {
    "breakfast":   toHHMM(wake + 60),
    "mid-morning": toHHMM(wake + 240),
    "lunch":       toHHMM(wake + 390),
    "pre-workout": toHHMM(preTime),
    "dinner":      toHHMM(dinTime),
    "evening":     toHHMM(eveningTime),
  };
}

export function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function toHHMM(mins) {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Format "HH:MM" → human "7:30 am"
export function fmtTime12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
