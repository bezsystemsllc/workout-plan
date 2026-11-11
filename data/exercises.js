// Exercise library for the dynamic plan generator.
//
// Each exercise is tagged by:
//   category : "push" | "pull" | "legs" | "core"   (cardio lives in CARDIO below)
//   pattern  : movement pattern — used to slot into day templates and to find
//              swap alternatives (same pattern = interchangeable).
//   equip    : equipment needed. Generator keeps only exercises whose equipment
//              is a subset of what the user owns. "bodyweight" is always owned.
//   compound : true for multi-joint lifts (drives set/rep/rest scheme).
//   prog     : how it advances — "weight" | "reps" | "time".
//   inc      : weight step (lb) for weight-progression lifts.
//   reps     : baseline rep prescription (generator overrides per goal).
//
export const EQUIPMENT = {
  dumbbell:  "Dumbbells",
  kettlebell:"Kettlebells",
  barbell:   "Barbell + plates",
  rack:      "Squat rack",
  bench:     "Adjustable bench",
  leg_developer: "Plate-loaded leg attachment",
  preacher_pad: "Preacher curl pad",
  ezbar:     "EZ curl bar",
  band:      "Resistance bands",
  band_anchor: "Band anchor",
  machine:   "Weight machines",
  cable:     "Cable machine",
  pullup:    "Pull-up bar",
  treadmill: "Treadmill",
  bodyweight:"Bodyweight only",
};

// Quick "where do you train?" presets. Selecting one fills the equipment list;
// the user can still toggle individual items afterwards.
export const EQUIPMENT_PRESETS = {
  full_gym:    { label: "Full gym",    equipment: ["dumbbell","kettlebell","barbell","rack","bench","ezbar","band","band_anchor","machine","cable","pullup","treadmill"] },
  home_gym:    { label: "Home gym",    equipment: ["dumbbell","kettlebell","barbell","rack","bench","ezbar","band","band_anchor","pullup","treadmill"] },
  marcy_home:  { label: "Marcy home gym", equipment: ["kettlebell","barbell","bench","leg_developer","preacher_pad","ezbar","band","treadmill"] },
  home_basics: { label: "Home basics", equipment: ["dumbbell","barbell","bench","ezbar","band","treadmill"] },
  bands:       { label: "Bands",       equipment: ["band"] },
  bodyweight:  { label: "Bodyweight",  equipment: [] },
};

// What the app assumes everyone has, regardless of selection.
const ALWAYS_OWNED = ["bodyweight"];

const E = (o) => ({ prog: "weight", inc: 5, compound: false, ...o });

export const EXERCISES = [
  // ── PUSH ─────────────────────────────────────────────────────────────────
  E({ id: "bb-bench",       name: "Barbell bench press",        category: "push", pattern: "horiz-press", equip: ["barbell","bench"], compound: true,  reps: "6–8" }),
  E({ id: "db-bench",       name: "Dumbbell bench press",       category: "push", pattern: "horiz-press", equip: ["dumbbell","bench"], compound: true,  reps: "8–10" }),
  E({ id: "db-floor-press", name: "Dumbbell floor press",       category: "push", pattern: "horiz-press", equip: ["dumbbell"],         compound: true,  reps: "8–10" }),
  E({ id: "band-chest",     name: "Band chest press",           category: "push", pattern: "horiz-press", equip: ["band","band_anchor"], compound: true,  prog: "reps", reps: "12–20" }),
  E({ id: "pushup",         name: "Push-up",                    category: "push", pattern: "horiz-press", equip: ["bodyweight"],       compound: true,  prog: "reps", reps: "AMRAP" }),
  E({ id: "db-incline",     name: "Incline dumbbell press",     category: "push", pattern: "incline-press", equip: ["dumbbell","bench"], compound: true, reps: "8–10" }),
  E({ id: "db-ohp-seated",  name: "Seated dumbbell press",      category: "push", pattern: "vert-press", equip: ["dumbbell","bench"], compound: true,  reps: "8–10" }),
  E({ id: "db-ohp-stand",   name: "Standing dumbbell press",    category: "push", pattern: "vert-press", equip: ["dumbbell"],         compound: true,  reps: "8–10" }),
  E({ id: "band-ohp",       name: "Band overhead press",        category: "push", pattern: "vert-press", equip: ["band"],             compound: true,  prog: "reps", reps: "12–20" }),
  E({ id: "db-lateral",     name: "Dumbbell lateral raise",     category: "push", pattern: "lateral",    equip: ["dumbbell"],         inc: 2.5, reps: "12–15" }),
  E({ id: "band-lateral",   name: "Band lateral raise",         category: "push", pattern: "lateral",    equip: ["band"],             prog: "reps", reps: "15–20" }),
  E({ id: "db-tri-ext",     name: "Dumbbell overhead extension",category: "push", pattern: "tri-ext",    equip: ["dumbbell"],         inc: 2.5, reps: "10–12" }),
  E({ id: "ez-skull",       name: "EZ-bar skullcrusher",        category: "push", pattern: "tri-ext",    equip: ["ezbar","bench"],    inc: 2.5, reps: "10–12" }),
  E({ id: "band-pushdown",  name: "Band triceps pushdown",      category: "push", pattern: "tri-ext",    equip: ["band","band_anchor"], prog: "reps", reps: "15–20" }),
  E({ id: "bench-dip",      name: "Bench dip",                  category: "push", pattern: "tri-ext",    equip: ["bench"],            prog: "reps", reps: "10–15" }),
  E({ id: "pike-pushup",    name: "Pike push-up",               category: "push", pattern: "vert-press", equip: ["bodyweight"],       compound: true,  prog: "reps", reps: "8–15" }),
  E({ id: "decline-pushup", name: "Decline push-up (feet up)",  category: "push", pattern: "incline-press", equip: ["bodyweight"],    compound: true,  prog: "reps", reps: "10–20" }),
  E({ id: "diamond-pushup", name: "Diamond push-up",            category: "push", pattern: "tri-ext",    equip: ["bodyweight"],       prog: "reps", reps: "8–15" }),

  // ── PULL ─────────────────────────────────────────────────────────────────
  E({ id: "bb-row",         name: "Barbell bent-over row",      category: "pull", pattern: "row",        equip: ["barbell"],          compound: true,  reps: "6–8" }),
  E({ id: "db-row-1arm",    name: "Single-arm dumbbell row",    category: "pull", pattern: "row",        equip: ["dumbbell","bench"], compound: true,  reps: "8–10" }),
  E({ id: "db-row-bent",    name: "Bent-over dumbbell row",     category: "pull", pattern: "row",        equip: ["dumbbell"],         compound: true,  reps: "8–10" }),
  E({ id: "band-row",       name: "Seated band row",            category: "pull", pattern: "row",        equip: ["band"],             compound: true,  prog: "reps", reps: "12–20" }),
  E({ id: "band-pulldown",  name: "Band lat pulldown",          category: "pull", pattern: "vert-pull",  equip: ["band","band_anchor"], compound: true,  prog: "reps", reps: "12–20" }),
  E({ id: "db-pullover",    name: "Dumbbell pullover",          category: "pull", pattern: "vert-pull",  equip: ["dumbbell","bench"], compound: true,  reps: "10–12" }),
  E({ id: "band-facepull",  name: "Band face pull",             category: "pull", pattern: "rear-delt",  equip: ["band","band_anchor"], prog: "reps", reps: "15–20" }),
  E({ id: "band-pullapart", name: "Band pull-apart",            category: "pull", pattern: "rear-delt",  equip: ["band"],             prog: "reps", reps: "15–20" }),
  E({ id: "db-rear-fly",    name: "Dumbbell rear-delt fly",     category: "pull", pattern: "rear-delt",  equip: ["dumbbell"],         inc: 2.5, reps: "12–15" }),
  E({ id: "ez-curl",        name: "EZ-bar curl",                category: "pull", pattern: "curl",       equip: ["ezbar"],            inc: 2.5, reps: "8–12" }),
  E({ id: "ez-preacher",    name: "EZ-bar preacher curl",       category: "pull", pattern: "curl",       equip: ["ezbar","preacher_pad"], inc: 2.5, reps: "8–12" }),
  E({ id: "db-curl",        name: "Dumbbell biceps curl",       category: "pull", pattern: "curl",       equip: ["dumbbell"],         inc: 2.5, reps: "10–12" }),
  E({ id: "db-hammer",      name: "Dumbbell hammer curl",       category: "pull", pattern: "curl",       equip: ["dumbbell"],         inc: 2.5, reps: "10–12" }),
  E({ id: "band-curl",      name: "Band biceps curl",           category: "pull", pattern: "curl",       equip: ["band"],             prog: "reps", reps: "15–20" }),
  E({ id: "db-shrug",       name: "Dumbbell shrug",             category: "pull", pattern: "shrug",      equip: ["dumbbell"],         reps: "12–15" }),
  E({ id: "inv-row",        name: "Inverted row (table/bar)",   category: "pull", pattern: "row",        equip: ["bodyweight"],       compound: true,  prog: "reps", reps: "8–15" }),
  E({ id: "superman",       name: "Superman hold",              category: "pull", pattern: "rear-delt",  equip: ["bodyweight"],       prog: "time", reps: "20–40s" }),

  // ── LEGS ─────────────────────────────────────────────────────────────────
  E({ id: "db-goblet",      name: "Goblet squat",               category: "legs", pattern: "squat",      equip: ["dumbbell"],         compound: true,  reps: "10–12" }),
  E({ id: "db-box-squat",   name: "Dumbbell box squat",         category: "legs", pattern: "squat",      equip: ["dumbbell","bench"], compound: true,  reps: "10–12" }),
  E({ id: "bw-squat",       name: "Bodyweight squat",           category: "legs", pattern: "squat",      equip: ["bodyweight"],       compound: true,  prog: "reps", reps: "15–25" }),
  E({ id: "db-rdl",         name: "Dumbbell Romanian deadlift", category: "legs", pattern: "hinge",      equip: ["dumbbell"],         compound: true,  reps: "8–12" }),
  E({ id: "bb-rdl",         name: "Barbell Romanian deadlift",  category: "legs", pattern: "hinge",      equip: ["barbell"],          compound: true,  reps: "8–12" }),
  E({ id: "band-goodmorn",  name: "Band good morning",          category: "legs", pattern: "hinge",      equip: ["band"],             compound: true,  prog: "reps", reps: "15–20" }),
  E({ id: "db-lunge",       name: "Dumbbell walking lunge",     category: "legs", pattern: "lunge",      equip: ["dumbbell"],         compound: true,  reps: "10/leg" }),
  E({ id: "db-bulgarian",   name: "Bulgarian split squat",      category: "legs", pattern: "lunge",      equip: ["dumbbell","bench"], compound: true,  reps: "10/leg" }),
  E({ id: "db-stepup",      name: "Dumbbell step-up",           category: "legs", pattern: "lunge",      equip: ["dumbbell","bench"], compound: true,  reps: "10/leg" }),
  E({ id: "db-calf",        name: "Dumbbell calf raise",        category: "legs", pattern: "calf",       equip: ["dumbbell"],         reps: "15–20" }),
  E({ id: "bw-calf",        name: "Standing calf raise",        category: "legs", pattern: "calf",       equip: ["bodyweight"],       prog: "reps", reps: "20–25" }),
  E({ id: "glute-bridge",   name: "Glute bridge",               category: "legs", pattern: "hinge",      equip: ["bodyweight"],       compound: true,  prog: "reps", reps: "15–20" }),
  E({ id: "rev-lunge",      name: "Reverse lunge",              category: "legs", pattern: "lunge",      equip: ["bodyweight"],       compound: true,  prog: "reps", reps: "12/leg" }),
  E({ id: "bench-leg-extension", name: "Plate-loaded leg extension", category: "legs", pattern: "knee-extension", equip: ["leg_developer"], reps: "12–15" }),
  E({ id: "bench-leg-curl", name: "Plate-loaded lying leg curl", category: "legs", pattern: "knee-flexion", equip: ["leg_developer"], reps: "12–15" }),

  // ── CORE ─────────────────────────────────────────────────────────────────
  E({ id: "plank",          name: "Plank",                      category: "core", pattern: "core-iso",   equip: ["bodyweight"],       prog: "time", reps: "30–60s" }),
  E({ id: "weighted-plank", name: "Weighted plank",             category: "core", pattern: "core-iso",   equip: ["dumbbell"],         prog: "time", reps: "30–45s" }),
  E({ id: "leg-raise",      name: "Lying leg raise",            category: "core", pattern: "core-flex",  equip: ["bodyweight"],       prog: "reps", reps: "12–15" }),
  E({ id: "russian-twist",  name: "Russian twist",              category: "core", pattern: "core-rot",   equip: ["dumbbell"],         prog: "reps", reps: "20" }),
  E({ id: "band-crunch",    name: "Band crunch",                category: "core", pattern: "core-flex",  equip: ["band","band_anchor"], prog: "reps", reps: "15–20" }),
  E({ id: "dead-bug",       name: "Dead bug",                   category: "core", pattern: "core-iso",   equip: ["bodyweight"],       prog: "reps", reps: "10/side" }),
  E({ id: "bicycle",        name: "Bicycle crunch",             category: "core", pattern: "core-rot",   equip: ["bodyweight"],       prog: "reps", reps: "15/side" }),
  E({ id: "side-plank",     name: "Side plank",                 category: "core", pattern: "core-iso",   equip: ["bodyweight"],       prog: "time", reps: "20–40s/side" }),

  // ── GYM: barbell rack, machines, cables, pull-up bar ──────────────────────
  E({ id: "bb-ohp",         name: "Barbell overhead press",     category: "push", pattern: "vert-press", equip: ["barbell"],          compound: true,  reps: "6–8" }),
  E({ id: "mach-chest",     name: "Machine chest press",        category: "push", pattern: "horiz-press",equip: ["machine"],          compound: true,  reps: "8–10" }),
  E({ id: "mach-shoulder",  name: "Machine shoulder press",     category: "push", pattern: "vert-press", equip: ["machine"],          compound: true,  reps: "8–10" }),
  E({ id: "cable-lateral",  name: "Cable lateral raise",        category: "push", pattern: "lateral",    equip: ["cable"],            inc: 2.5, reps: "12–15" }),
  E({ id: "cable-pushdown", name: "Cable triceps pushdown",     category: "push", pattern: "tri-ext",    equip: ["cable"],            reps: "10–15" }),
  E({ id: "pullup",         name: "Pull-up",                    category: "pull", pattern: "vert-pull",  equip: ["pullup"],           compound: true,  prog: "reps", reps: "AMRAP" }),
  E({ id: "lat-pulldown",   name: "Lat pulldown",               category: "pull", pattern: "vert-pull",  equip: ["machine"],          compound: true,  reps: "10–12" }),
  E({ id: "cable-row",      name: "Seated cable row",           category: "pull", pattern: "row",        equip: ["cable"],            compound: true,  reps: "10–12" }),
  E({ id: "cable-curl",     name: "Cable curl",                 category: "pull", pattern: "curl",       equip: ["cable"],            inc: 2.5, reps: "10–12" }),
  E({ id: "cable-facepull", name: "Cable face pull",            category: "pull", pattern: "rear-delt",  equip: ["cable"],            prog: "reps", reps: "15–20" }),
  E({ id: "hang-leg-raise", name: "Hanging leg raise",          category: "core", pattern: "core-flex",  equip: ["pullup"],           prog: "reps", reps: "10–15" }),
  E({ id: "bb-squat",       name: "Barbell back squat",         category: "legs", pattern: "squat",      equip: ["barbell","rack"],   compound: true,  reps: "6–8" }),
  E({ id: "leg-press",      name: "Leg press",                  category: "legs", pattern: "squat",      equip: ["machine"],          compound: true,  inc: 10, reps: "10–12" }),
  E({ id: "bb-deadlift",    name: "Barbell deadlift",           category: "legs", pattern: "hinge",      equip: ["barbell"],          compound: true,  reps: "5–8" }),
  E({ id: "bb-hipthrust",   name: "Barbell hip thrust",         category: "legs", pattern: "hinge",      equip: ["barbell","bench"],  compound: true,  reps: "8–12" }),
  E({ id: "leg-curl",       name: "Seated leg curl",            category: "legs", pattern: "hinge",      equip: ["machine"],          reps: "12–15" }),
  E({ id: "mach-calf",      name: "Calf raise (machine)",       category: "legs", pattern: "calf",       equip: ["machine"],          reps: "12–15" }),

  // ── KETTLEBELL ────────────────────────────────────────────────────────────
  E({ id: "kb-swing",       name: "Kettlebell swing",           category: "legs", pattern: "hinge",      equip: ["kettlebell"],       compound: true, prog: "reps", reps: "15–20" }),
  E({ id: "kb-tgu",         name: "Turkish get-up",             category: "core", pattern: "core-iso",   equip: ["kettlebell"],       prog: "reps", reps: "3–5/side" }),
  E({ id: "kb-goblet",      name: "Kettlebell goblet squat",    category: "legs", pattern: "squat",      equip: ["kettlebell"],       compound: true, inc: 10, reps: "10–12" }),
  E({ id: "kb-press",       name: "Kettlebell shoulder press",  category: "push", pattern: "vert-press", equip: ["kettlebell"],       compound: true, inc: 10, reps: "6–8" }),
  E({ id: "kb-row",         name: "Kettlebell row",             category: "pull", pattern: "row",        equip: ["kettlebell"],       compound: true, inc: 10, reps: "8–10" }),
];

// Treadmill conditioning blocks. Not set-logged — shown as the day's prescription.
// `fit` ranks how well each suits a goal so the generator can pick sensibly.
export const CARDIO = [
  { id: "intervals", label: "Treadmill intervals", detail: "5 min warm-up, then 8× (1 min hard / 90s easy), 5 min cool-down (~25 min)", best: "fat_loss" },
  { id: "incline",   label: "Incline walk",        detail: "30–40 min brisk walk at 8–12% incline — low-impact fat burn",            best: "fat_loss" },
  { id: "steady",    label: "Steady-state run",    detail: "25–30 min easy conversational pace (Zone 2)",                            best: "recomp" },
  { id: "tempo",     label: "Tempo run",           detail: "10 min easy, 15 min comfortably-hard, 5 min easy",                       best: "maintain" },
];

export function exercisesFor(ownedEquip) {
  const owned = new Set([...ownedEquip, ...ALWAYS_OWNED]);
  return EXERCISES.filter(e => e.equip.every(eq => owned.has(eq)));
}
