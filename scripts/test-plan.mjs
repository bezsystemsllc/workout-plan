// Regression tests for the workout plan generator.
//
//   node scripts/test-plan.mjs
//
// No test framework — this repo has no build step and no dependencies.

import {
  generatePlan, buildSplits, dayLabelFor, baseDay, variantIndex,
} from "../lib/plan.js";

let failures = 0;
const check = (name, cond, extra = "") => {
  if (!cond) { failures++; console.log(`FAIL: ${name}${extra ? ` — ${extra}` : ""}`); }
  else console.log(`ok:   ${name}`);
};

const GYM = ["dumbbell", "kettlebell", "barbell", "rack", "bench", "ezbar", "band", "pullup", "treadmill"];
const names = (plan, k) => (plan.workouts[k] || []).map(e => e.name);
const patterns = (plan, k) => (plan.workouts[k] || []).map(e => e.pattern);
const build = (over, profile = { goal: "recomp" }, opts = { seed: 42 }) => {
  const prefs = { daysPerWeek: 4, style: "ul", experience: "intermediate", equipment: GYM, ...over };
  return generatePlan({ ...prefs, splits: buildSplits(prefs.style, prefs.daysPerWeek, profile.goal) }, profile, opts);
};

// ── Variant keys and labels ──
check("variantIndex base", variantIndex("full") === 0);
check("variantIndex b", variantIndex("full-b") === 1, String(variantIndex("full-b")));
check("variantIndex d", variantIndex("full-d") === 3, String(variantIndex("full-d")));
check("baseDay strips variant", baseDay("legs-c") === "legs");
check("label A has no suffix", dayLabelFor("push") === "Push Day", dayLabelFor("push"));
check("label B", dayLabelFor("upper-b") === "Upper Body · B", dayLabelFor("upper-b"));
check("label D", dayLabelFor("full-d") === "Full Body · D", dayLabelFor("full-d"));
check("label unknown key", dayLabelFor("custom") === "Custom", dayLabelFor("custom"));

// ── Determinism ──
const a1 = build({});
const a2 = build({});
check("same seed reproduces the plan", JSON.stringify(a1.workouts) === JSON.stringify(a2.workouts));
check("different seed changes the plan",
  JSON.stringify(build({}, { goal: "recomp" }, { seed: 43 }).workouts) !== JSON.stringify(a1.workouts));

// ── No duplicate exercise inside one session ──
for (const [k, list] of Object.entries(a1.workouts)) {
  const ids = list.map(e => e.id);
  check(`no duplicate exercise in ${k}`, new Set(ids).size === ids.length, JSON.stringify(ids));
}

// ── Repeated split days are genuinely different sessions ──
const fb = build({ style: "full", daysPerWeek: 4 });
const fbKeys = Object.keys(fb.workouts);
check("4-day full body yields 4 day keys", fbKeys.length === 4, JSON.stringify(fbKeys));
check("no two full-body sessions identical",
  new Set(fbKeys.map(k => names(fb, k).join("|"))).size === 4);
check("no two full-body pattern templates identical",
  new Set(fbKeys.map(k => patterns(fb, k).join("|"))).size === 4);
check("lower-body emphasis rotates across variants",
  new Set(fbKeys.map(k => fb.workouts[k][0].pattern)).size >= 2,
  JSON.stringify(fbKeys.map(k => fb.workouts[k][0].pattern)));

// ── Coverage: a full-body week must reach what one fixed template missed ──
const fbPatterns = new Set(fbKeys.flatMap(k => patterns(fb, k)));
for (const need of ["vert-pull", "lunge", "calf", "lateral", "tri-ext", "rear-delt", "curl", "incline-press", "vert-press", "squat", "hinge", "row", "horiz-press"]) {
  check(`full-body week trains ${need}`, fbPatterns.has(need), [...fbPatterns].sort().join(","));
}
check("full-body week trains core", [...fbPatterns].some(p => p.startsWith("core")));

// ── Upper/lower variants differ too ──
const ul = build({ style: "ul", daysPerWeek: 4 }, { goal: "recomp" }, { seed: 9 });
check("upper A/B templates differ",
  patterns(ul, "upper").join("|") !== patterns(ul, "upper-b").join("|"));
check("upper A/B share at most 2 exercises",
  names(ul, "upper").filter(n => names(ul, "upper-b").includes(n)).length <= 2);
check("lower A/B lead with different patterns",
  ul.workouts.lower[0].pattern !== ul.workouts["lower-b"][0].pattern,
  `${ul.workouts.lower[0].pattern} vs ${ul.workouts["lower-b"][0].pattern}`);

// ── Split shapes ──
const six = buildSplits("ppl", 6, "muscle");
check("6-day PPL variant keys",
  JSON.stringify(Object.values(six).filter(s => s.type === "lift").map(s => s.day).sort())
    === JSON.stringify(["legs", "legs-b", "pull", "pull-b", "push", "push-b"]));

// ── Experience controls session length ──
check("beginner push = 5", build({ style: "ppl", daysPerWeek: 3, experience: "beginner" }).workouts.push.length === 5);
check("advanced push = 7", build({ style: "ppl", daysPerWeek: 3, experience: "advanced" }).workouts.push.length === 7);

// ── Goal drives the rep scheme ──
const fat = build({}, { goal: "fat_loss" }, { seed: 5 });
const mus = build({}, { goal: "muscle" }, { seed: 5 });
const pick = (p) => Object.values(p.workouts).flat().find(e => e.compound && e.prog === "weight");
check("goal changes compound rep range", pick(fat).reps !== pick(mus).reps, `${pick(fat).reps} vs ${pick(mus).reps}`);

// ── Equipment is respected, and fallback slots keep sessions full ──
const bw = build({ style: "full", equipment: [] }, { goal: "fat_loss" }, { seed: 4 });
const bwAll = Object.values(bw.workouts).flat();
check("bodyweight pool respected", bwAll.every(e => e.equip.every(eq => eq === "bodyweight")),
  JSON.stringify(bwAll.map(e => e.name)));
check("bodyweight sessions are not stubs", Object.values(bw.workouts).every(l => l.length >= 4),
  JSON.stringify(Object.values(bw.workouts).map(l => l.length)));
check("vert-pull slot falls back to a row for bodyweight", bwAll.some(e => e.pattern === "row"));

const bands = build({ style: "full", equipment: ["band"] }, { goal: "fat_loss" }, { seed: 3 });
check("bands-only plan builds", Object.values(bands.workouts).every(l => l.length >= 3));

// ── Primary slot quality ──
check("upper slot 0 is a compound", !!ul.workouts.upper[0].compound, JSON.stringify(ul.workouts.upper[0]));

// ── preserve keeps existing day lists ──
const preserved = generatePlan(
  { daysPerWeek: 4, style: "ul", experience: "intermediate", equipment: GYM, splits: buildSplits("ul", 4, "recomp") },
  { goal: "recomp" }, { seed: 99, preserve: ul });
check("preserve keeps the existing upper day",
  JSON.stringify(preserved.workouts.upper) === JSON.stringify(ul.workouts.upper));

console.log(failures ? `\n${failures} FAILURES` : "\nALL PASS");
process.exit(failures ? 1 : 0);
