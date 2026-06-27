import { load, todayISO, update } from "../storage.js";
import { getMeals } from "./meals.js";
import { getActivePlan } from "./plan.js";
import { macrosForKcal, SEX } from "./calc.js";

const DAY_MS = 86400000;
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

  let response;
  try {
    response = await fetch("/.netlify/functions/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: buildCoachSnapshot() }),
    });
  } catch {
    throw new Error("Coach review is unavailable right now. Your diet, workout, and progress tracking still work.");
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Coach review needs Netlify Functions. The rest of Tempo works without it.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(coachErrorMessage(data, response.status));
  return normalizeRecommendation(data.recommendation);
}

export function applyCoachRecommendation(recommendation) {
  const rec = normalizeRecommendation(recommendation);
  let beforeTargets = null;
  let afterTargets = null;

  update("settings", (settings) => {
    if (!settings.profile) return settings;
    const kcalDelta = rec.dietAdjustment.kcalDelta;
    const proteinDelta = rec.dietAdjustment.proteinDelta;
    if (!kcalDelta && !proteinDelta) return settings;

    beforeTargets = { ...settings.targets };
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
    afterTargets = {
      ...settings.targets,
      kcal: nextKcal,
      p: Math.round(protein),
      f: fat,
      c: carbs,
    };
    if (beforeTargets.maintenance) afterTargets.maintenance = beforeTargets.maintenance;

    return { ...settings, targets: afterTargets };
  });

  update("adaptLog", (log) => {
    const next = [...log, {
      ts: new Date().toISOString(),
      kind: "llm-coach",
      summary: rec.summary,
      before: beforeTargets ? { targets: beforeTargets } : {},
      after: {
        ...(afterTargets ? { targets: afterTargets } : {}),
        workoutNotes: rec.workoutAdjustments,
        riskFlags: rec.riskFlags,
      },
    }];
    return next.slice(-50);
  });

  return {
    targetChanged: !!afterTargets,
    targets: afterTargets,
    recommendation: rec,
  };
}

export function latestCoachReview() {
  const entry = [...load("adaptLog")].reverse().find((item) => item.kind === "llm-coach");
  if (!entry) return null;
  return {
    ts: entry.ts,
    summary: entry.summary,
    targets: entry.after?.targets || null,
    workoutNotes: Array.isArray(entry.after?.workoutNotes)
      ? entry.after.workoutNotes.map(sanitizeWorkoutAdjustment).filter(Boolean)
      : [],
    riskFlags: arrayOfStrings(entry.after?.riskFlags, 5, 200),
  };
}

export function coachNoteForExercise(review, exerciseName) {
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

function coachErrorMessage(data, status) {
  const fallback = "Coach review is unavailable right now. No changes were applied.";
  if (!data || typeof data !== "object") return fallback;
  if (data.code === "missing_api_key") {
    return "Coach review is disabled because OPENAI_API_KEY is not set in Netlify. The rest of Tempo still works.";
  }
  if (data.code === "auth_failed") {
    return "Coach review is unavailable because the OpenAI API key is invalid or lacks access. The rest of Tempo still works.";
  }
  if (data.code === "quota_or_rate_limit") {
    const retry = data.retryAfter ? ` Try again after ${data.retryAfter} seconds.` : "";
    return `Coach review is temporarily unavailable because the OpenAI quota or rate limit was reached.${retry} No changes were applied.`;
  }
  if (data.code === "coach_rate_limit") {
    const retry = data.retryAfter ? ` Try again after ${data.retryAfter} seconds.` : "";
    return `Too many coach reviews.${retry} No changes were applied.`;
  }
  if (data.code === "origin_not_allowed") {
    return "Coach review is not allowed from this site URL. Check COACH_ALLOWED_ORIGIN in Netlify.";
  }
  if (data.code === "model_unavailable") {
    return "Coach review is unavailable because the configured OpenAI model is not available. Check OPENAI_MODEL or leave it unset.";
  }
  if (data.code === "upstream_unavailable") {
    return "Coach review is temporarily unavailable. Your regular workout and nutrition tracking still work.";
  }
  return data.error || (status >= 500 ? "Coach review is temporarily unavailable. No changes were applied." : fallback);
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
