import { expectedRate } from "./adaptations.js";
import { todayISO } from "../storage.js";

const DAY_MS = 86400000;
const dateKey = (timestamp) => new Date(timestamp).toISOString().slice(0, 10);
const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function measuredChange(entries, field) {
  const measured = entries.filter(entry => Number.isFinite(entry[field]));
  const first = measured[0];
  const last = measured.at(-1);
  if (!first || !last) return null;
  const days = (Date.parse(last.date) - Date.parse(first.date)) / DAY_MS;
  return days >= 7 ? { days, change: last[field] - first[field] } : null;
}

export function summarizePlanProgress({ plan, goal, entries, workouts, meals, mealPlan, today = todayISO() }) {
  const todayTime = Date.parse(today);
  const planStart = Date.parse(plan.meta?.generatedAt?.slice(0, 10));
  const startTime = Math.max(todayTime - 28 * DAY_MS, Number.isFinite(planStart) ? Math.min(planStart, todayTime) : 0);
  const from = dateKey(startTime);
  const completedDays = (todayTime - startTime) / DAY_MS;
  const mealIds = mealPlan.map(meal => meal.id);
  let scheduledLifts = 0;
  let scheduledLiftsLogged = 0;
  let fullMealChecklists = 0;
  for (let time = startTime; time < todayTime; time += DAY_MS) {
    const date = dateKey(time);
    const split = plan.splits[weekdays[new Date(time).getUTCDay()]];
    const session = workouts[date];
    if (split?.type === "lift") {
      scheduledLifts++;
      if (session?.day === split.day && session.exercises.some(ex => ex.sets.some(set => Number(set.r) > 0))) {
        scheduledLiftsLogged++;
      }
    }
    const checked = meals[date]?.checked;
    if (mealIds.length && checked && mealIds.every(id => checked.includes(id))) fullMealChecklists++;
  }
  const recent = entries.filter(entry => entry.date >= from && entry.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weight = measuredChange(recent, "weightLb");
  const waist = measuredChange(recent, "waistIn");
  const weeklyTargetLb = -expectedRate(goal);
  return {
    from, completedDays, scheduledLifts, scheduledLiftsLogged, fullMealChecklists,
    fourWeekTargetLb: weeklyTargetLb * 4,
    weight: weight && { days: weight.days, changeLb: weight.change, targetLb: weeklyTargetLb * weight.days / 7 },
    waist: waist && { days: waist.days, changeIn: waist.change },
  };
}
