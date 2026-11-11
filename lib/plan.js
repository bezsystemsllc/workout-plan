// Dynamic workout-plan engine.
//
//   generatePlan(prefs, profile)  → builds a weekly plan from the user's
//                                    days/week, split style, experience, goal
//                                    and owned equipment.
//   getActivePlan()               → the stored plan, or the static fallback
//                                    from data/workouts.js before onboarding.
//
// A plan has the same shape the views already expect:
//   { splits: { mon: {type,day,label}, ... }, workouts: { push:[ex], ... }, meta }
// Day types: "lift" (has `day` key into workouts), "cardio" (treadmill block,
// carries label+detail), "rest".
// A split day that repeats in the week becomes distinct sessions with their own
// exercise selections: "upper" (A), "upper-b", "upper-c".

import { load } from "../storage.js";
import { EXERCISES, CARDIO, exercisesFor } from "../data/exercises.js";
import { SPLITS as DEFAULT_SPLITS, WORKOUTS as DEFAULT_WORKOUTS } from "../data/workouts.js";

// Goal → set/rep/rest scheme + how much treadmill work to slot in.
const GOAL_SCHEME = {
  fat_loss: { compoundReps: "8–10", isoReps: "12–15", coreReps: "15–20", coreTime: "40–60s", restCompound: 75,  restIso: 45, cardioDays: 2, cardio: "intervals" },
  recomp:   { compoundReps: "6–10", isoReps: "10–12", coreReps: "12–15", coreTime: "40–60s", restCompound: 120, restIso: 75, cardioDays: 1, cardio: "steady" },
  muscle:   { compoundReps: "6–8",  isoReps: "8–12",  coreReps: "12–15", coreTime: "45–60s", restCompound: 150, restIso: 90, cardioDays: 0, cardio: "steady" },
  maintain: { compoundReps: "8–10", isoReps: "10–12", coreReps: "12–15", coreTime: "40–60s", restCompound: 120, restIso: 75, cardioDays: 1, cardio: "tempo" },
};

// Experience → working sets and exercises per session.
const EXP = {
  beginner:     { sets: 3, perDay: 5 },
  intermediate: { sets: 4, perDay: 6 },
  advanced:     { sets: 4, perDay: 7 },
};

export const EXPERIENCE = {
  beginner: "Beginner · under 1 yr",
  intermediate: "Intermediate · 1–3 yr",
  advanced: "Advanced · 3+ yr",
};

export const STYLE_OPTIONS = {
  full: { label: "Full body",          keys: ["full"] },
  ul:   { label: "Upper / Lower",      keys: ["upper", "lower"] },
  ppl:  { label: "Push / Pull / Legs", keys: ["push", "pull", "legs"] },
};

export const DAY_LABEL = {
  push: "Push Day", pull: "Pull Day", legs: "Leg Day",
  upper: "Upper Body", lower: "Lower Body", full: "Full Body",
};

// When a split day repeats in the week it becomes distinct sessions
// ("upper", "upper-b", "upper-c" …), each with its own movement template AND
// its own exercise picks — so a repeated day is a different workout, not the
// same one with substitutions.
export const VARIANT_SUFFIX = ["", "-b", "-c", "-d", "-e", "-f"];
const variantKey = (day, n) => day + VARIANT_SUFFIX[n % VARIANT_SUFFIX.length];

export function baseDay(key) {
  return String(key || "").replace(/-[b-f]$/, "");
}

export function variantIndex(key) {
  const m = String(key || "").match(/-([b-f])$/);
  return m ? m[1].charCodeAt(0) - 97 : 0; // "b" (98) → 1, "c" → 2, …
}

export function dayLabelFor(key) {
  const base = baseDay(key);
  const label = DAY_LABEL[base] || (base ? base[0].toUpperCase() + base.slice(1) : "Workout");
  const m = String(key || "").match(/-([b-f])$/);
  return label + (m ? ` · ${m[1].toUpperCase()}` : "");
}

// Ordered movement slots per session, one template per variant. Trimmed to
// `perDay`, so the earlier slots must hold the session's main lifts and the
// tail holds accessories a beginner can lose.
//
// Variants rotate the emphasis rather than reshuffling the same slots: which
// lower-body pattern leads, and whether pressing/pulling is horizontal or
// vertical. Across a week that also covers patterns a single fixed template
// would never reach — full body previously never trained a vertical pull,
// lunge, calf, lateral, rear delt or triceps at all.
//
// A slot may be an array: the first pattern with a candidate in the user's
// equipment pool wins, so e.g. bodyweight users get rows where a full gym
// gets pull-ups instead of losing the slot entirely.
const PULL_DOWN = ["vert-pull", "row"];
const TEMPLATES = {
  full: [
    // A — squat-led, horizontal press/pull
    ["squat", "horiz-press", "row", "hinge", "lateral", "core", "calf"],
    // B — hinge-led, vertical press/pull
    ["hinge", PULL_DOWN, "vert-press", "lunge", "tri-ext", "core", "curl"],
    // C — single-leg-led, incline press, arm/calf detail
    ["lunge", "incline-press", "row", "squat", "curl", "calf", "core"],
    // D — squat-led again but vertical pull and rear-delt focus
    ["squat", "vert-press", PULL_DOWN, "hinge", "rear-delt", "core", "tri-ext"],
  ],
  upper: [
    // A — horizontal emphasis
    ["horiz-press", "row", "vert-press", PULL_DOWN, "curl", "tri-ext", "core"],
    // B — vertical emphasis
    [PULL_DOWN, "vert-press", "row", "incline-press", "rear-delt", "curl", "core"],
    // C — incline/detail emphasis
    ["incline-press", "row", PULL_DOWN, "lateral", "tri-ext", "curl", "core"],
  ],
  lower: [
    ["squat", "hinge", "lunge", "calf", ["knee-extension", "core"], "core", "core"],
    ["hinge", "lunge", "squat", "calf", ["knee-flexion", "core"], "core", "core"],
    ["lunge", "squat", "hinge", "calf", ["knee-extension", "core"], "core", "core"],
  ],
  push: [
    ["horiz-press", "incline-press", "vert-press", "lateral", "tri-ext", "tri-ext", "core"],
    ["vert-press", "horiz-press", "incline-press", "tri-ext", "lateral", "lateral", "core"],
  ],
  pull: [
    ["row", PULL_DOWN, "rear-delt", "curl", "curl", "shrug", "core"],
    [PULL_DOWN, "row", "curl", "rear-delt", "shrug", "curl", "core"],
  ],
  legs: [
    ["squat", "hinge", "lunge", "calf", ["knee-extension", "core"], "core", "core"],
    ["hinge", "lunge", "squat", "calf", ["knee-flexion", "core"], "core", "core"],
    ["lunge", "squat", "hinge", "calf", ["knee-extension", "core"], "core", "core"],
  ],
};

// Weekdays that get a session, spread to leave recovery gaps.
const LIFT_WEEKDAYS = {
  2: ["mon", "thu"],
  3: ["mon", "wed", "fri"],
  4: ["mon", "tue", "thu", "fri"],
  5: ["mon", "tue", "wed", "fri", "sat"],
  6: ["mon", "tue", "wed", "thu", "fri", "sat"],
};
const CARDIO_PREF = ["sat", "tue", "thu", "sun", "wed", "mon", "fri"];
const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const DEFAULT_PREFS = {
  daysPerWeek: 3,
  style: "ppl",
  experience: "intermediate",
  // Matches the home-gym kit: dumbbells, bands, bench bar, EZ bar, bench, treadmill.
  equipment: ["dumbbell", "band", "barbell", "ezbar", "bench", "treadmill"],
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function defaultStyle(days) {
  if (days <= 2) return "full";
  if (days === 3) return "ppl";
  return "ul";
}

// Keep a specific rep prescription (per-leg, time, or band high-rep) but let the
// goal scheme set plain numeric ranges.
function schemeReps(ex, fallback) {
  if (ex.prog === "reps") return ex.reps;
  if (/[/s]/.test(ex.reps)) return ex.reps;
  return fallback;
}

function prescribe(ex, scheme, sets) {
  let reps, rest;
  if (ex.category === "core") {
    reps = ex.prog === "time" ? scheme.coreTime : schemeReps(ex, scheme.coreReps);
    rest = 45;
  } else if (ex.compound) {
    reps = schemeReps(ex, scheme.compoundReps);
    rest = scheme.restCompound;
  } else {
    reps = schemeReps(ex, scheme.isoReps);
    rest = scheme.restIso;
  }
  return {
    id: ex.id, name: ex.name, category: ex.category, pattern: ex.pattern,
    equip: ex.equip, prog: ex.prog, inc: ex.inc, compound: ex.compound,
    sets, reps, rest,
  };
}

function candidatesFor(pattern, pool) {
  if (pattern === "core") return pool.filter(e => e.category === "core");
  return pool.filter(e => e.pattern === pattern);
}

// Equipment "heft" — breaks ties toward the primary lift: barbell first, then
// machines/dumbbells, then cables/bands/bodyweight. Lower wins.
const EQUIP_TIER = { barbell: 0, rack: 0, machine: 1, dumbbell: 1, kettlebell: 1, pullup: 1, ezbar: 2, cable: 2, band: 3, treadmill: 3, bench: 4, bodyweight: 4 };
const tierOf = (e) => Math.min(...e.equip.map(eq => EQUIP_TIER[eq] ?? 3));

// Best-first: loadable lifts before band/bodyweight, compounds before isolation,
// then heavier equipment (so a full-gym user gets barbell squats, not goblets).
const score = (e) => (e.prog === "weight" ? 0 : 1) * 100 + (e.compound ? 0 : 1) * 10 + tierOf(e);
function rank(a, b) {
  return score(a) - score(b);
}

// Small deterministic hash → stable-but-varied pick per (seed, day, slot).
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Pick within a quality window of the ranked candidates, seeded per slot, and
// steer away from exercises sibling variant days (A/B) already claimed.
// A slot may list fallback patterns; the first one with a candidate wins.
function pickExercise(slot, pool, { used, avoid, seedKey, window: win }) {
  for (const pattern of Array.isArray(slot) ? slot : [slot]) {
    // Skip the pattern when its pool is exhausted — never list an exercise twice.
    const cands = candidatesFor(pattern, pool).filter(e => !used.has(e.id)).sort(rank);
    if (!cands.length) continue;
    // Jitter only within the best quality class present (compound/loadable beats
    // band/bodyweight filler), preferring picks sibling variant days haven't used.
    const best = score(cands[0]);
    let tier = cands.filter(e => score(e) <= best + 10);
    const fresh = tier.filter(e => !avoid.has(e.id));
    if (fresh.length) tier = fresh;
    return tier[hash32(seedKey) % Math.min(tier.length, win)];
  }
  return null;
}

function buildDay(dayKey, pool, scheme, exp, seed, avoid = new Set()) {
  const variants = TEMPLATES[baseDay(dayKey)] || TEMPLATES.full;
  const template = variants[variantIndex(dayKey) % variants.length].slice(0, exp.perDay);
  const used = new Set();
  const out = [];
  template.forEach((slot, i) => {
    const ex = pickExercise(slot, pool, {
      used, avoid,
      seedKey: `${seed}:${dayKey}:${String(slot)}:${i}`,
      // Slot 0 is the day's primary lift — keep it among the top 2 candidates;
      // later slots rotate across the top 3 for variety.
      window: i === 0 ? 2 : 3,
    });
    if (!ex) return;
    used.add(ex.id);
    const isCore = ex.category === "core";
    const sets = isCore ? 3 : ex.compound ? exp.sets : Math.min(exp.sets, 3);
    out.push(prescribe(ex, scheme, sets));
  });
  return out;
}

export function buildSplits(style, days, goal) {
  const scheme = GOAL_SCHEME[goal] || GOAL_SCHEME.fat_loss;
  const keys = STYLE_OPTIONS[style].keys;
  const liftDays = LIFT_WEEKDAYS[clamp(days, 2, 6)];
  const splits = {};
  const counts = {};
  liftDays.forEach((wd, i) => {
    const base = keys[i % keys.length];
    const day = variantKey(base, counts[base] || 0);
    counts[base] = (counts[base] || 0) + 1;
    splits[wd] = { type: "lift", day, label: dayLabelFor(day) };
  });
  const block = CARDIO.find(c => c.id === scheme.cardio) || CARDIO[0];
  let added = 0;
  for (const wd of CARDIO_PREF) {
    if (added >= scheme.cardioDays) break;
    if (splits[wd]) continue;
    splits[wd] = { type: "cardio", cardioId: block.id, label: block.label, detail: block.detail };
    added++;
  }
  for (const wd of ALL_DAYS) if (!splits[wd]) splits[wd] = { type: "rest", label: "Rest" };
  return splits;
}

// Build a plan. `opts.preserve` keeps the exercise lists of day-keys that still
// exist (so editing the weekly layout doesn't wipe swaps); `opts.seed` rotates
// exercise choices for "regenerate".
export function generatePlan(prefs, profile, opts = {}) {
  const { seed = 0, preserve = null } = opts;
  const goal = profile?.goal || "fat_loss";
  const scheme = GOAL_SCHEME[goal] || GOAL_SCHEME.fat_loss;
  const exp = EXP[prefs.experience] || EXP.intermediate;
  const style = prefs.style || defaultStyle(prefs.daysPerWeek);
  const pool = exercisesFor(prefs.equipment || []);
  const splits = prefs.splits || buildSplits(style, prefs.daysPerWeek, goal);

  const dayKeys = [...new Set(
    Object.values(splits).filter(s => s.type === "lift").map(s => s.day)
  )];

  const workouts = {};
  const groupAvoid = {}; // baseDay -> exercise ids already used by sibling variants
  dayKeys.forEach((k) => {
    const avoid = groupAvoid[baseDay(k)] || (groupAvoid[baseDay(k)] = new Set());
    const list = preserve?.workouts?.[k] || buildDay(k, pool, scheme, exp, seed, avoid);
    for (const ex of list) if (ex.id) avoid.add(ex.id);
    workouts[k] = list;
  });

  return {
    splits,
    workouts,
    meta: {
      style, daysPerWeek: prefs.daysPerWeek, experience: prefs.experience,
      equipment: prefs.equipment, goal, seed,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function getActivePlan() {
  const settings = load("settings");
  if (settings.plan && settings.plan.workouts) return settings.plan;
  return { splits: DEFAULT_SPLITS, workouts: DEFAULT_WORKOUTS, meta: { fallback: true } };
}

// Same-pattern alternatives (for the swap menu), filtered to owned equipment.
export function alternativesFor(exercise, equipment) {
  const pool = exercisesFor(equipment || DEFAULT_PREFS.equipment);
  const list = exercise.category === "core"
    ? pool.filter(e => e.category === "core")
    : pool.filter(e => e.pattern === exercise.pattern);
  return list.length ? list : [exercise];
}

// Prescribe a swapped-in exercise, keeping the replaced exercise's set count.
export function prescribeExercise(exId, goal, sets) {
  const ex = EXERCISES.find(e => e.id === exId);
  if (!ex) return null;
  const scheme = GOAL_SCHEME[goal] || GOAL_SCHEME.fat_loss;
  const p = prescribe(ex, scheme, sets || 3);
  return p;
}

// ── Weekly-layout editor helpers (Settings) ──
// A weekday's value is a token: "rest" | "cardio" | "lift:<dayKey>".
export function dayFromToken(token, goal) {
  if (token === "cardio") {
    const scheme = GOAL_SCHEME[goal] || GOAL_SCHEME.fat_loss;
    const b = CARDIO.find(c => c.id === scheme.cardio) || CARDIO[0];
    return { type: "cardio", cardioId: b.id, label: b.label, detail: b.detail };
  }
  if (token && token.startsWith("lift:")) {
    const day = token.slice(5);
    return { type: "lift", day, label: dayLabelFor(day) };
  }
  return { type: "rest", label: "Rest" };
}

export function tokenFromDay(split) {
  if (!split) return "rest";
  if (split.type === "lift") return `lift:${split.day}`;
  if (split.type === "cardio" || split.type === "soccer") return "cardio";
  return "rest";
}
