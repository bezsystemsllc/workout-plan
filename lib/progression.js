// Auto-progression: derive the next session's target from logged history.
// Double-progression model — climb reps within the range at a fixed load, then
// add weight and reset to the bottom of the range. Bands/bodyweight/planks
// progress by reps or seconds instead of load.
//
// Surfaced in the workout view as a per-exercise target chip + set placeholders.

const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const roundTo = (v, step) => Math.round(v / (step || 5)) * (step || 5);
const KG_TO_LB = 2.20462;

const SEX_FACTOR = { male: 1, female: 0.75 };
const ACTIVITY_FACTOR = {
  sedentary: 0.7,
  light: 0.82,
  moderate: 0.92,
  very: 1,
  athlete: 1.08,
};
const EXPERIENCE_FACTOR = {
  beginner: 0.85,
  intermediate: 1,
  advanced: 1.12,
};
const PATTERN_START_LOAD = {
  "horiz-press": 0.12,
  "incline-press": 0.1,
  "vert-press": 0.07,
  "vert-pull": 0.1,
  row: 0.12,
  "rear-delt": 0.025,
  curl: 0.04,
  shrug: 0.15,
  squat: 0.15,
  hinge: 0.18,
  lunge: 0.07,
  calf: 0.15,
  lateral: 0.025,
  "tri-ext": 0.04,
};
const CATEGORY_START_LOAD = { push: 0.08, pull: 0.1, legs: 0.12, core: 0.05 };

function range(reps) {
  const m = String(reps).match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (m) return [+m[1], +m[2]];
  const one = String(reps).match(/(\d+)/);
  return one ? [+one[1], +one[1]] : [8, 12];
}

// Most-recent-first logged sessions for a workout day.
export function sessionsForDay(day, allWorkouts) {
  return Object.entries(allWorkouts)
    .filter(([, s]) => s.day === day)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, s]) => ({ date, ...s }));
}

export function buildProgressionHistory(day, allWorkouts, sessions = sessionsForDay(day, allWorkouts)) {
  const byName = new Map();
  for (const session of sessions) {
    for (const ex of session.exercises || []) {
      if (!byName.has(ex.name)) byName.set(ex.name, []);
      byName.get(ex.name).push(ex);
    }
  }
  return byName;
}

function sessionsFor(name, day, allWorkouts) {
  return buildProgressionHistory(day, allWorkouts).get(name) || [];
}

const logged = (ex) => ex.sets.filter(s => num(s.r) > 0);

export function progressionFor(meta, day, allWorkouts, historyByExercise = null, starterContext = null) {
  const isTime = meta.prog === "time";
  const metric = starterContext?.units === "metric";
  const wUnit = metric ? "kg" : "lb";
  const step = loadStep(meta, metric);
  const unit = isTime ? "s" : "";
  const [lo, hi] = range(meta.reps);
  const allHistory = historyByExercise
    ? (historyByExercise.get(meta.name) || [])
    : sessionsFor(meta.name, day, allWorkouts);
  const history = allHistory.filter(ex => logged(ex).length);

  if (!history.length) {
    const starter = starterFor(meta, starterContext, lo, isTime);
    return {
      kind: "new",
      text: starter?.text || "First session — pick a load you control for every set.",
      target: starter?.target || null,
    };
  }

  const sets = logged(history[0]);
  const reps = sets.map(s => num(s.r));
  const minReps = Math.min(...reps);
  const topWeight = Math.max(...sets.map(s => num(s.w)), 0);
  const enough = sets.length >= Math.max(1, Math.floor(meta.sets * 0.6));
  const hitTop = enough && reps.every(r => r >= hi);

  // ── Load-based (dumbbell / barbell / EZ-bar) ──
  if (meta.prog === "weight" && topWeight > 0) {
    const prev = history[1] ? logged(history[1]) : null;
    const prevMin = prev ? Math.min(...prev.map(s => num(s.r))) : null;
    if (minReps < lo && prevMin != null && prevMin < lo) {
      const w = roundTo(topWeight * 0.9, step);
      return { kind: "deload", text: `Deload to ${w} ${wUnit} — under ${lo} reps two sessions running.`, target: { w, r: hi } };
    }
    if (hitTop) {
      const w = topWeight + step;
      return { kind: "up", text: `Go up → ${w} ${wUnit} × ${lo} (you hit ${hi}s last time).`, target: { w, r: lo } };
    }
    return { kind: "hold", text: `Hold ${topWeight} ${wUnit} — beat ${reps.join("/")} reps.`, target: { w: topWeight, r: Math.min(hi, minReps + 1) } };
  }

  // ── Rep / time-based (bands, bodyweight, planks) ──
  const resistance = sets.map(s => String(s.w || "").trim()).find(Boolean) || defaultLoadLabel(meta);
  if (hitTop) {
    const tgt = isTime ? hi + 10 : hi + 2;
    const how = isTime ? `${tgt}${unit}` : `${tgt}+ reps or a harder variation`;
    return { kind: "up", text: `Progress → ${how} (topped the range last time).`, target: { w: resistance, r: tgt } };
  }
  return { kind: "hold", text: `Beat ${reps.join("/")}${unit} from last time.`, target: { w: resistance, r: Math.min(hi, minReps + (isTime ? 5 : 1)) } };
}

function starterFor(meta, context, lowRep, isTime) {
  const profile = context?.profile;
  const experience = context?.experience || "beginner";
  const metric = context?.units === "metric";
  const wUnit = metric ? "kg" : "lb";
  if (usesBand(meta)) {
    const resistance = starterBand(meta, profile, experience);
    return {
      text: `Starter: use a ${resistance} for ${lowRep} clean reps and leave 2-3 reps in reserve.`,
      target: { w: resistance, r: lowRep },
    };
  }
  if (usesBodyweight(meta)) {
    return {
      text: `Starter: use bodyweight for ${lowRep} clean reps and leave 2-3 reps in reserve.`,
      target: { w: "bodyweight", r: lowRep },
    };
  }
  if (isTime) {
    return {
      text: `Starter: aim for ${lowRep}s with steady breathing; stop before form breaks.`,
      target: { w: "", r: lowRep },
    };
  }
  if (meta.prog !== "weight") {
    return {
      text: `Starter: aim for ${lowRep} clean reps and leave 2-3 reps in reserve.`,
      target: { w: "", r: lowRep },
    };
  }
  if (!profile?.weightKg) {
    return {
      text: `Starter: choose a light load for ${lowRep} clean reps and leave 2-3 reps in reserve.`,
      target: { w: "", r: lowRep },
    };
  }

  const bodyWeightLb = profile.weightKg * KG_TO_LB;
  const patternFactor = PATTERN_START_LOAD[meta.pattern] || CATEGORY_START_LOAD[meta.category] || 0.08;
  const activityFactor = ACTIVITY_FACTOR[profile.activity] || ACTIVITY_FACTOR.moderate;
  const sexFactor = SEX_FACTOR[profile.sex] || SEX_FACTOR.male;
  const experienceFactor = EXPERIENCE_FACTOR[experience] || EXPERIENCE_FACTOR.beginner;
  const equipmentFactor = equipmentLoadFactor(meta);
  const rawLb = bodyWeightLb * patternFactor * activityFactor * sexFactor * experienceFactor * equipmentFactor;
  const step = loadStep(meta, metric);
  const raw = metric ? rawLb / KG_TO_LB : rawLb;
  const minLoad = metric ? step : (step <= 2.5 ? 2.5 : 5);
  const recommended = Math.max(minLoad, roundTo(raw, step));

  // Below the empty bar (45 lb / 20 kg) a barbell lift can't be loaded that light.
  if (usesHeavyBar(meta) && recommended < (metric ? 20 : 45)) {
    return {
      text: `Starter: use the lightest bar or dumbbells for ${lowRep} clean reps; leave 2-3 reps in reserve.`,
      target: { w: "", r: lowRep },
    };
  }

  return {
    text: `Starter: try about ${recommended} ${wUnit} × ${lowRep}; go lighter if form changes.`,
    target: { w: recommended, r: lowRep },
  };
}

// Progression increment in the user's display unit. `inc` is authored in lb
// (data/exercises.js); metric users step in sensible kg plate sizes instead.
function loadStep(meta, metric) {
  const inc = meta.inc || 5;
  if (!metric) return inc;
  if (inc >= 10) return 5;
  if (inc > 2.5) return 2.5;
  return 1.25;
}

function equipmentLoadFactor(meta) {
  const equip = meta.equip || [];
  if (equip.includes("barbell") || equip.includes("machine")) return 2;
  if (equip.includes("ezbar")) return 1.4;
  return 1;
}

function usesHeavyBar(meta) {
  const equip = meta.equip || [];
  return equip.includes("barbell") || equip.includes("ezbar");
}

function usesBand(meta) {
  return (meta.equip || []).includes("band");
}

function usesBodyweight(meta) {
  return (meta.equip || []).includes("bodyweight") && meta.prog !== "weight";
}

function starterBand(meta, profile, experience) {
  if (!meta.compound || ["rear-delt", "lateral", "tri-ext", "curl", "core-flex"].includes(meta.pattern)) {
    return "light band";
  }
  const activity = profile?.activity || "sedentary";
  if (experience === "advanced" || activity === "very" || activity === "athlete") return "medium band";
  return "light-medium band";
}

function defaultLoadLabel(meta) {
  if (usesBand(meta)) return "light band";
  if (usesBodyweight(meta)) return "bodyweight";
  return "";
}
