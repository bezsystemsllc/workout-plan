import { load, loadApiKey, todayISO, update } from "../storage.js";
import { getMeals } from "./meals.js";
import { getActivePlan, alternativesFor, prescribeExercise } from "./plan.js";
import { macrosForKcal, SEX } from "./calc.js";
import { COACH_MODEL, COACH_SCHEMA, DEVELOPER_INSTRUCTIONS } from "./coach-contract.js";
import { postResponses, parseJsonReply } from "./openai.js";
import { summarizePlanProgress } from "./plan-progress.js";

const DAY_MS = 86400000;
const OWN_KEY_TIMEOUT_MS = 20000;
const MAX_SNAPSHOT_CHARS = 50000;
// Per-exercise notes go stale — a month-old "increase load" is not advice about
// today's session. After this they stop showing next to exercises.
export const COACH_NOTE_TTL_DAYS = 14;
const ACTIONS = new Set(["increase_reps", "increase_load", "hold", "deload", "swap", "rest"]);

export function buildCoachSnapshot() {
  const settings = load("settings");
  const plan = getActivePlan();

  return {
    version: 1,
    today: todayISO(),
    units: settings.units,
    profile: settings.profile,
    targetWeightLb: settings.targetWeightLb,
    targets: settings.targets,
    trainingPrefs: settings.trainingPrefs || null,
    foodPrefs: settings.foodPrefs || null,
    plan: summarizePlan(plan),
    planProgress: summarizePlanProgress({
      plan, goal: settings.profile?.goal, entries: load("progress"), workouts: load("workouts"),
      meals: load("meals"), mealPlan: getMeals(settings),
    }),
    progress: summarizeProgress(load("progress")),
    meals: summarizeMeals(load("meals"), settings),
    workouts: summarizeWorkouts(load("workouts")),
    recentAdaptations: load("adaptLog").slice(-8).map((entry) => ({
      ts: entry.ts,
      kind: entry.kind,
      summary: entry.summary,
    })),
  };
}

export async function requestCoachReview() {
  const settings = load("settings");
  if (!settings.profile) throw new Error("Complete setup before requesting a coach review.");

  const apiKey = loadApiKey();
  if (!apiKey) throw new Error("Add your OpenAI key in Settings to analyze progress.");

  const snapshotJson = JSON.stringify(buildCoachSnapshot());
  if (snapshotJson.length > MAX_SNAPSHOT_CHARS) {
    throw new Error("Your history is too large to review in one request. Export a backup and clear older entries.");
  }

  const payload = await postResponses(apiKey, {
    model: COACH_MODEL,
    input: [
      { role: "developer", content: [{ type: "input_text", text: DEVELOPER_INSTRUCTIONS }] },
      { role: "user", content: [{ type: "input_text", text: snapshotJson }] },
    ],
    text: {
      format: { type: "json_schema", name: "tempo_coach_recommendation", strict: true, schema: COACH_SCHEMA },
    },
    max_output_tokens: 1200,
  }, { timeoutMs: OWN_KEY_TIMEOUT_MS, what: "coach review" });

  return normalizeRecommendation(parseJsonReply(payload, "recommendation"));
}

// Resolve a review into the concrete changes it would make, so the user can see
// and pick them before anything is written.
//
// Only "swap" is applyable: replacing a stalled movement is a structural choice
// the deterministic engine cannot make. Load/rep actions stay advisory because
// progression.js already decides those from the exact logged numbers, and it is
// better at it than a model reading a summary.
export function planCoachChanges(recommendation, settings = load("settings")) {
  const rec = normalizeRecommendation(recommendation);
  const plan = getActivePlan();
  const goal = plan.meta?.goal || settings.profile?.goal || "fat_loss";
  const equipment = plan.meta?.equipment || settings.trainingPrefs?.equipment || [];
  const canEditPlan = !plan.meta?.fallback && !!settings.plan?.workouts;

  let diet = null;
  const { kcalDelta, proteinDelta, reason } = rec.dietAdjustment;
  if ((kcalDelta || proteinDelta) && settings.profile) {
    const before = { ...settings.targets };
    const after = adjustedTargets(settings, kcalDelta, proteinDelta);
    if (after && (after.kcal !== before.kcal || after.p !== before.p)) {
      diet = { before, after, kcalDelta, proteinDelta, reason };
    }
  }

  const swaps = [];
  const advisory = [];
  for (const note of rec.workoutAdjustments) {
    const swap = note.action === "swap" && canEditPlan
      ? resolveSwap(note, settings.plan, equipment)
      : null;
    if (swap) swaps.push(swap);
    else advisory.push(note);
  }

  return { recommendation: rec, goal, diet, swaps, advisory };
}

// Apply only what the user ticked. `selection.diet` defaults to true when a diet
// change exists; `selection.swaps` is a list of swap keys.
export function applyCoachChanges(planned, selection = {}) {
  const { recommendation: rec, diet, swaps, goal } = planned;
  const applyDiet = !!diet && selection.diet !== false;
  const chosenKeys = new Set(selection.swaps || []);
  const chosen = swaps.filter((s) => chosenKeys.has(s.key));

  let beforeTargets = null;
  let afterTargets = null;
  if (applyDiet) {
    update("settings", (settings) => {
      if (!settings.profile) return settings;
      const next = adjustedTargets(settings, diet.kcalDelta, diet.proteinDelta);
      if (!next) return settings;
      beforeTargets = { ...settings.targets };
      afterTargets = next;
      return { ...settings, targets: next };
    });
  }

  const appliedSwaps = [];
  for (const swap of chosen) {
    const fresh = prescribeExercise(swap.toId, goal, swap.sets);
    if (!fresh) continue;
    let ok = false;
    update("settings", (settings) => {
      const list = settings.plan?.workouts?.[swap.dayKey];
      // Re-check the slot — the plan may have changed since the preview.
      if (!list || list[swap.index]?.name !== swap.fromName) return settings;
      const nextList = [...list];
      nextList[swap.index] = fresh;
      ok = true;
      return {
        ...settings,
        plan: { ...settings.plan, workouts: { ...settings.plan.workouts, [swap.dayKey]: nextList } },
      };
    });
    if (ok) appliedSwaps.push({ from: swap.fromName, to: swap.toName, day: swap.dayKey });
  }

  update("adaptLog", (log) => {
    const next = [...log, {
      ts: new Date().toISOString(),
      kind: "llm-coach",
      summary: rec.summary,
      before: beforeTargets ? { targets: beforeTargets } : {},
      after: {
        ...(afterTargets ? { targets: afterTargets } : {}),
        workoutNotes: planned.advisory,
        appliedSwaps,
        riskFlags: rec.riskFlags,
      },
    }];
    return next.slice(-50);
  });

  return {
    targetChanged: !!afterTargets,
    targets: afterTargets,
    appliedSwaps,
    recommendation: rec,
  };
}

function adjustedTargets(settings, kcalDelta, proteinDelta) {
  if (!settings.profile) return null;
  const currentKcal = Number(settings.targets?.kcal) || 0;
  const floor = (SEX[settings.profile.sex] || SEX.male).kcalFloor;
  const nextKcal = Math.max(floor, roundTo(currentKcal + kcalDelta, 50));
  const baseMacros = macrosForKcal(settings.profile, nextKcal);
  const protein = clampNumber(
    (Number(settings.targets?.p) || baseMacros.p) + proteinDelta,
    proteinFloor(settings.profile),
    proteinCeiling(settings.profile),
    baseMacros.p,
  );
  const fat = baseMacros.f;
  const carbs = Math.max(0, Math.round((nextKcal - protein * 4 - fat * 9) / 4));
  const out = {
    ...settings.targets,
    kcal: nextKcal,
    p: Math.round(protein),
    f: fat,
    c: carbs,
  };
  if (settings.targets?.maintenance) out.maintenance = settings.targets.maintenance;
  return out;
}

// Find the named exercise in the plan and choose a same-pattern replacement the
// user owns the equipment for, preferring one the model actually named.
function resolveSwap(note, plan, equipment) {
  const wanted = normalizeName(note.exercise);
  if (!wanted) return null;
  for (const [dayKey, list] of Object.entries(plan.workouts || {})) {
    const index = list.findIndex((ex) => normalizeName(ex.name) === wanted);
    if (index < 0) continue;
    const current = list[index];
    const inDay = new Set(list.map((ex) => normalizeName(ex.name)));
    const alts = alternativesFor(current, equipment)
      .filter((alt) => alt.id && !inDay.has(normalizeName(alt.name)));
    if (!alts.length) return null;
    const named = normalizeName(note.target);
    const picked = alts.find((alt) => {
      const n = normalizeName(alt.name);
      return named && n && (named.includes(n) || n.includes(named));
    }) || alts[0];
    return {
      key: `${dayKey}:${index}`,
      dayKey,
      index,
      fromName: current.name,
      toId: picked.id,
      toName: picked.name,
      sets: current.sets || 3,
      reason: note.reason,
    };
  }
  return null;
}

export function latestCoachReview() {
  const entry = [...load("adaptLog")].reverse().find((item) => item.kind === "llm-coach");
  if (!entry) return null;
  const ageDays = entry.ts ? Math.floor((Date.now() - new Date(entry.ts).getTime()) / DAY_MS) : null;
  return {
    ts: entry.ts,
    ageDays,
    stale: ageDays != null && ageDays > COACH_NOTE_TTL_DAYS,
    summary: entry.summary,
    targets: entry.after?.targets || null,
    workoutNotes: Array.isArray(entry.after?.workoutNotes)
      ? entry.after.workoutNotes.map(sanitizeWorkoutAdjustment).filter(Boolean)
      : [],
    appliedSwaps: Array.isArray(entry.after?.appliedSwaps) ? entry.after.appliedSwaps : [],
    riskFlags: arrayOfStrings(entry.after?.riskFlags, 5, 200),
  };
}

export function coachNoteForExercise(review, exerciseName) {
  if (review?.stale) return null;
  if (!review?.workoutNotes?.length) return null;
  const name = normalizeName(exerciseName);
  return review.workoutNotes.find((note) => normalizeName(note.exercise) === name)
    || review.workoutNotes.find((note) => {
      const noteName = normalizeName(note.exercise);
      return noteName && (name.includes(noteName) || noteName.includes(name));
    })
    || null;
}

export function normalizeRecommendation(value) {
  const rec = value && typeof value === "object" ? value : {};
  return {
    summary: cleanText(rec.summary, 500, "Hold current plan until more data is logged."),
    riskFlags: arrayOfStrings(rec.riskFlags, 5, 200),
    dietAdjustment: {
      kcalDelta: roundTo(clampNumber(rec.dietAdjustment?.kcalDelta, -250, 250, 0), 50),
      proteinDelta: roundTo(clampNumber(rec.dietAdjustment?.proteinDelta, -30, 30, 0), 5),
      reason: cleanText(rec.dietAdjustment?.reason, 300, "No diet change recommended."),
    },
    workoutAdjustments: Array.isArray(rec.workoutAdjustments)
      ? rec.workoutAdjustments.slice(0, 6).map(sanitizeWorkoutAdjustment).filter(Boolean)
      : [],
    userMessage: cleanText(rec.userMessage, 500, "Keep logging meals, workouts, and weight so future reviews are more accurate."),
  };
}

function summarizePlan(plan) {
  return {
    meta: plan.meta || {},
    weeklySplit: plan.splits,
    workouts: Object.fromEntries(Object.entries(plan.workouts || {}).map(([day, exercises]) => [
      day,
      exercises.map((ex) => ({
        name: ex.name,
        category: ex.category,
        pattern: ex.pattern,
        equipment: ex.equip,
        sets: ex.sets,
        reps: ex.reps,
        progression: ex.prog,
        rest: ex.rest,
      })),
    ])),
  };
}

function summarizeProgress(progress) {
  return [...progress]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-28)
    .map((entry) => ({
      date: entry.date,
      weightLb: entry.weightLb,
      waistIn: entry.waistIn,
    }));
}

function summarizeMeals(meals, settings) {
  const plannedMeals = getMeals(settings);
  const byId = new Map(plannedMeals.map((meal) => [meal.id, meal]));
  return Object.entries(meals)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, entry]) => {
      const totals = mealTotals(entry, byId);
      return {
        date,
        daysAgo: daysAgo(date),
        plannedMeals: plannedMeals.length,
        eatenMeals: entry.checked.length,
        customItems: entry.custom.length,
        waterMl: entry.waterMl || 0,
        totals,
      };
    });
}

function mealTotals(entry, byId) {
  const total = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const id of entry.checked || []) {
    const meal = byId.get(id);
    if (!meal) continue;
    total.kcal += meal.kcal || 0;
    total.p += meal.p || 0;
    total.f += meal.f || 0;
    total.c += meal.c || 0;
  }
  for (const item of entry.custom || []) {
    total.kcal += Number(item.kcal) || 0;
    total.p += Number(item.p) || 0;
    total.f += Number(item.f) || 0;
    total.c += Number(item.c) || 0;
  }
  return {
    kcal: Math.round(total.kcal),
    p: Math.round(total.p),
    f: Math.round(total.f),
    c: Math.round(total.c),
  };
}

function summarizeWorkouts(workouts) {
  return Object.entries(workouts)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-21)
    .map(([date, session]) => ({
      date,
      daysAgo: daysAgo(date),
      day: session.day,
      exercises: (session.exercises || []).map((ex) => ({
        name: ex.name,
        category: ex.category,
        sets: (ex.sets || []).map((set) => ({
          load: set.w,
          reps: set.r,
        })),
      })),
    }));
}

function sanitizeWorkoutAdjustment(item) {
  if (!item || typeof item !== "object") return null;
  const action = ACTIONS.has(item.action) ? item.action : "hold";
  return {
    exercise: cleanText(item.exercise, 80, "Workout"),
    action,
    target: cleanText(item.target, 120, "Hold current prescription."),
    reason: cleanText(item.reason, 220, "Insufficient trend data for a stronger change."),
  };
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function daysAgo(date) {
  const now = new Date(`${todayISO()}T12:00:00`);
  const then = new Date(`${date}T12:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.round((now - then) / DAY_MS));
}

function proteinFloor(profile) {
  return Math.round((profile.weightKg * 2.20462) * 0.6);
}

function proteinCeiling(profile) {
  return Math.round((profile.weightKg * 2.20462) * 1.15);
}

function arrayOfStrings(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, maxLen, "")).filter(Boolean).slice(0, maxItems);
}

function cleanText(value, maxLen, fallback) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, maxLen);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}
