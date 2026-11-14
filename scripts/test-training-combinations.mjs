// Run with: node scripts/test-training-combinations.mjs
import assert from "node:assert/strict";
import { STYLE_OPTIONS, TRAINING_TYPES } from "../data/training.js";
import { EQUIPMENT } from "../data/exercises.js";
import { generatePlan, buildSplits, alternativesFor } from "../lib/plan.js";
import { matchWorkoutRoutine } from "../lib/workout-ai.js";
import { load, save, exportJSON, importJSON } from "../storage.js";
import { planCoachChanges } from "../lib/coach.js";

const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
const equipment = Object.keys(EQUIPMENT);
const weighted = new Set(["dumbbell", "kettlebell", "barbell", "ezbar", "machine", "cable", "leg_developer"]);
function checkExercises(plan, style, type) {
  for (const list of Object.values(plan.workouts)) {
    assert.ok(list.length > 0, `${style}/${type}: empty session`);
    assert.equal(new Set(list.map(ex => ex.id)).size, list.length);
    for (const ex of list) {
      if (STYLE_OPTIONS[style].categories) assert.ok(STYLE_OPTIONS[style].categories.includes(ex.category), `${style}: ${ex.name}`);
      if (type === "weights") assert.ok(ex.equip.some(eq => weighted.has(eq)), ex.name);
      if (type === "calisthenics") assert.ok(ex.equip.every(eq => ["bodyweight", "pullup", "bench"].includes(eq)), ex.name);
      if (type === "bands") assert.ok(ex.equip.every(eq => ["bodyweight", "band", "band_anchor", "pullup", "bench"].includes(eq)), ex.name);
    }
  }
}
let count = 0;
for (const style of Object.keys(STYLE_OPTIONS)) {
  for (const trainingType of Object.keys(TRAINING_TYPES)) {
    for (const daysPerWeek of [2, 3, 4, 5, 6]) {
      const prefs = { style, trainingType, daysPerWeek, equipment, experience: "advanced" };
      const plan = generatePlan(prefs, { goal: "recomp" });
      assert.equal(Object.keys(plan.workouts).length, daysPerWeek);
      checkExercises(plan, style, trainingType);
      save("settings", { ...load("settings"), trainingPrefs: prefs, plan });
      importJSON(exportJSON());
      assert.equal(load("settings").trainingPrefs.style, style);
      assert.equal(load("settings").trainingPrefs.trainingType, trainingType);
      assert.equal(load("settings").plan.meta.trainingType, trainingType);
      count++;
    }
  }
}
console.log(`PASS: ${count} combinations, day counts, exercise restrictions, and backup round trips`);
const prefs = { style: "upper", trainingType: "calisthenics", daysPerWeek: 3, equipment, experience: "intermediate" };
const old = generatePlan({ ...prefs, style: "ul", trainingType: "weights" }, { goal: "recomp" });
const plan = generatePlan(prefs, { goal: "recomp" }, { preserve: old, exerciseIds: ["db-bench", "bw-squat", "pushup"] });
checkExercises(plan, "upper", "calisthenics");
assert.ok(!Object.values(plan.splits).some(split => split.cardioId));
const pushup = Object.values(plan.workouts).flat().find(ex => ex.id === "pushup");
assert.ok(pushup);
assert.ok(alternativesFor(pushup, equipment, plan.meta).every(ex => !ex.equip.some(eq => weighted.has(eq))));
save("settings", { ...load("settings"), trainingPrefs: prefs, plan });
const review = planCoachChanges({ workoutAdjustments: [{ exercise: "Push-up", action: "swap", target: "Dumbbell bench press", reason: "Test" }] });
assert.ok(review.swaps.every(swap => swap.toId !== "db-bench"));
console.log("PASS: preserved plans, requested exercises, swaps, and Coach changes respect restrictions");

let response = { style: "legs", trainingType: "weights", daysPerWeek: 2, equipment: ["dumbbell"], exerciseIds: ["db-goblet", "pushup", "bw-squat"] };
globalThis.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  assert.ok(body.text.format.schema.properties.style.enum.includes("legs"));
  assert.ok(body.text.format.schema.properties.trainingType.enum.includes("calisthenics"));
  return { ok: true, json: async () => ({ output_text: JSON.stringify(response) }) };
};
let match = await matchWorkoutRoutine("test", "Legs only with dumbbells", prefs);
assert.deepEqual(match.exerciseIds, ["db-goblet"]);
assert.equal(match.trainingType, "weights");
response = { style: "upper", trainingType: null, daysPerWeek: 3, equipment: null, exerciseIds: ["pushup", "db-bench"] };
match = await matchWorkoutRoutine("test", "Keep my current training type", prefs);
assert.equal(match.trainingType, "calisthenics");
assert.deepEqual(match.exerciseIds, ["pushup"]);
response.trainingType = "invalid";
await assert.rejects(() => matchWorkoutRoutine("test", "Test", prefs));
console.log("PASS: AI matching keeps unspecified training type and filters incompatible exercises");

save("settings", { ...load("settings"), trainingPrefs: { style: "ul", daysPerWeek: 4, equipment }, plan: old });
importJSON(exportJSON());
assert.equal(load("settings").trainingPrefs.trainingType, "mixed");
assert.equal(load("settings").trainingPrefs.style, "ul");
const empty = generatePlan({ ...prefs, style: "legs", trainingType: "weights", equipment: [] }, { goal: "recomp" });
assert.ok(Object.values(empty.workouts).every(list => list.length === 0));
const splits = buildSplits("core", 2, "fat_loss");
const snapshot = JSON.stringify(splits);
generatePlan({ ...prefs, style: "core", splits }, { goal: "fat_loss" });
assert.equal(JSON.stringify(splits), snapshot);
console.log("PASS: legacy defaults, incompatible equipment never substitutes bodyweight, and draft schedule is not mutated");
