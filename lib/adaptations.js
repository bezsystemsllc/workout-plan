// Adaptation engine: examines current state and returns suggestion objects
// that the UI can render as Accept/Dismiss banners.
//
// Each suggestion:
//   { id, severity, title, body, apply, kind }
// `apply` is a closure that mutates storage and is called when user accepts.
// `id` must be stable per "decision moment" so dismiss doesn't re-surface it.

import { load, update } from "../storage.js";
import { computeTargets, macrosForKcal, SEX } from "./calc.js";

const DAY_MS = 86400000;

export function getActiveSuggestions() {
  const settings = load("settings");
  const profile = settings.profile;
  if (!profile) return [];

  const progress = [...load("progress")].sort((a, b) => a.date.localeCompare(b.date));
  const workouts = load("workouts");
  const dismissed = load("dismissed");

  const suggestions = [];
  push(suggestions, kcalRecalSuggestion(progress, settings, profile));
  push(suggestions, goalReachedSuggestion(progress, settings, profile));

  return suggestions.filter(s => s && !isDismissed(dismissed, s.id));
}

function push(arr, s) { if (s) arr.push(s); }

function isDismissed(dismissed, id) {
  const ts = dismissed[id];
  if (!ts) return false;
  // Dismissals expire after 7 days so we re-evaluate
  return Date.now() - new Date(ts).getTime() < 7 * DAY_MS;
}

export function dismissSuggestion(id) {
  update("dismissed", (d) => ({ ...d, [id]: new Date().toISOString() }));
}

function logAdaptation(entry) {
  update("adaptLog", (log) => {
    const next = [...log, { ts: new Date().toISOString(), ...entry }];
    return next.slice(-50); // keep last 50
  });
}

// ─── Detector: weekly calorie recalibration ─────────────────────────────────
function kcalRecalSuggestion(progress, settings, profile) {
  const weighted = progress.filter(p => p.weightLb != null);
  if (weighted.length < 4) return null;

  const last = weighted[weighted.length - 1];
  const lastDate = new Date(last.date);
  if (Date.now() - lastDate.getTime() > 5 * DAY_MS) return null; // stale data

  // 14-day window (or whatever we have, min 4 points spanning >= 10 days)
  const cutoff = new Date(lastDate.getTime() - 14 * DAY_MS);
  const window = weighted.filter(p => new Date(p.date) >= cutoff);
  if (window.length < 4) return null;

  const first = window[0];
  const days = (new Date(last.date) - new Date(first.date)) / DAY_MS;
  if (days < 10) return null;

  const actualPerWeek = ((first.weightLb - last.weightLb) / days) * 7; // positive = losing
  const expectedPerWeek = expectedRate(profile.goal);
  const delta = actualPerWeek - expectedPerWeek; // > 0 = losing faster than expected

  // Tolerance band: ±0.3 lb/wk is noise
  if (Math.abs(delta) < 0.3) return null;

  // Decide kcal adjustment. Each 100 kcal/day ≈ 0.2 lb/wk shift.
  let kcalDelta;
  let direction;
  if (delta > 0.3 && profile.goal !== "muscle") {
    // Losing too fast → add calories back (protects muscle)
    kcalDelta = Math.round(Math.min(250, delta * 500) / 50) * 50;
    direction = "add";
  } else if (delta < -0.3) {
    // Not losing fast enough (or gaining when shouldn't)
    kcalDelta = -Math.round(Math.min(250, -delta * 500) / 50) * 50;
    direction = "subtract";
  } else {
    return null;
  }

  const currentKcal = settings.targets.kcal;
  const newKcal = Math.max((SEX[profile.sex] || SEX.male).kcalFloor, currentKcal + kcalDelta);
  if (newKcal === currentKcal) return null;

  // Stable id so dismiss covers this whole "week"
  const weekId = isoWeek(lastDate);
  const id = `kcal-recal-${weekId}`;

  const summary = direction === "add"
    ? `Trend: losing ${actualPerWeek.toFixed(1)} lb/wk — faster than the ${expectedPerWeek.toFixed(1)} lb/wk target. Adding ${kcalDelta} kcal protects muscle.`
    : `Trend: ${Math.abs(actualPerWeek).toFixed(1)} lb/wk vs ${expectedPerWeek.toFixed(1)} lb/wk target. Cutting ${Math.abs(kcalDelta)} kcal to get back on pace.`;

  return {
    id,
    kind: "kcal-recal",
    severity: "info",
    title: `Recalibrate calories: ${currentKcal} → ${newKcal}`,
    body: summary,
    apply: () => {
      const before = { ...settings.targets };
      const after = { kcal: newKcal, ...macrosForKcal(profile, newKcal) };
      update("settings", (s) => ({ ...s, targets: after }));
      // Auto-dismiss this id so it doesn't re-fire next render — the trend
      // needs another week to reflect the new intake.
      dismissSuggestion(id);
      logAdaptation({ kind: "kcal-recal", summary, before, after });
    },
  };
}

function expectedRate(goal) {
  return { fat_loss: 0.5, recomp: 0, muscle: -0.25, maintain: 0 }[goal] ?? 0;
}

// ─── Detector: goal reached ──────────────────────────────────────────────────
function goalReachedSuggestion(progress, settings, profile) {
  const weighted = progress.filter(p => p.weightLb != null);
  if (!weighted.length) return null;
  const current = weighted[weighted.length - 1].weightLb;
  const target = settings.targetWeightLb;

  if (profile.goal === "fat_loss" && current <= target) {
    const id = `goal-reached-fatloss-${target}`;
    return {
      id,
      kind: "goal-reached",
      severity: "celebrate",
      title: "🎉 You hit your target weight",
      body: `You're at ${current} lb (target was ${target} lb). Time to switch goals — keep losing risks muscle. Recomp or maintain are better next steps.`,
      apply: () => {
        const before = { goal: profile.goal };
        update("settings", (s) => ({
          ...s,
          profile: { ...s.profile, goal: "maintain" },
          targets: computeTargets({ ...profile, goal: "maintain" }),
        }));
        dismissSuggestion(id);
        logAdaptation({ kind: "goal-reached", summary: "Switched goal: fat_loss → maintain", before, after: { goal: "maintain" } });
      },
    };
  }
  return null;
}

// Per-exercise progression moved to lib/progression.js (used inline in the
// workout view). This module now owns only the Accept/Dismiss banner detectors.

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const wk = 1 + Math.round(((d - firstThursday) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}
