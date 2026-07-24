// Meal generator: assemble each meal from foods the user likes and can eat,
// scaling portions (arithmetic only) to hit their macro targets. Falls back to
// the static template when no preferences are set.

import { FOODS, fitsDiet } from "../data/foods.js";
import { MEALS as RAW_MEALS } from "../data/meals.js";

export const DEFAULT_FOOD_PREFS = {
  diet: "omnivore",
  proteins: ["poultry", "seafood", "eggs", "dairy"],
  carbs: ["rice", "oats", "potato"],
  avoid: [],
  seed: 0,
};

// Each meal takes a share of the day's calories/macros and a set of food slots.
// Shares sum to 1.
const MEAL_DEFS = [
  { id: "breakfast",   name: "Breakfast",   share: 0.22, slots: ["protein", "carb", "fruit"] },
  { id: "mid-morning", name: "Mid-morning", share: 0.12, slots: ["protein", "fat"] },
  { id: "lunch",       name: "Lunch",       share: 0.26, slots: ["protein", "carb", "veg"] },
  { id: "pre-workout", name: "Pre-workout", share: 0.12, slots: ["carb", "protein"] },
  { id: "dinner",      name: "Dinner",      share: 0.22, slots: ["protein", "veg", "fat"] },
  { id: "evening",     name: "Evening",     share: 0.06, slots: ["protein"] },
];

// Portion-multiplier bounds per category, so we never prescribe 0.05 or 9 servings.
const BOUNDS = { protein: [0.4, 3.5], carb: [0.3, 4], fat: [0.3, 2.5], fruit: [0.5, 2], veg: [0.8, 2] };

// Each macro is spread only across the meals that actually have a slot for it,
// so e.g. carbs aren't "lost" on a no-carb dinner. (Sum of shares of qualifying meals.)
const shareSum = (test) => MEAL_DEFS.filter(test).reduce((s, d) => s + d.share, 0);
const SLOT_SHARE = {
  protein: shareSum((d) => d.slots.includes("protein")) || 1,
  carb: shareSum((d) => d.slots.includes("carb") || d.slots.includes("fruit")) || 1,
  fat: shareSum((d) => d.slots.includes("fat")) || 1,
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const roundTo = (n, step) => Math.round(n / step) * step;

// Round the displayed serving to a sensible amount, return the matching multiplier
// (so the macros we compute match what's shown).
function tidyMult(food, mult) {
  const [lo, hi] = BOUNDS[food.cat] || [0.3, 3];
  const amt = food.base * clamp(mult, lo, hi);
  const rounded = food.unit === "g" ? roundTo(amt, amt < 40 ? 5 : 10) : Math.max(0.5, roundTo(amt, 0.5));
  return rounded / food.base;
}

function pick(cat, prefs, seed, used) {
  let pool = FOODS.filter((f) => f.cat === cat && fitsDiet(f, prefs.diet) && !f.allergens.some((a) => prefs.avoid.includes(a)));
  const liked = cat === "protein" ? prefs.proteins : cat === "carb" ? prefs.carbs : null;
  if (liked && liked.length) {
    const favs = pool.filter((f) => liked.includes(f.group));
    if (favs.length) pool = favs; // honor preferences, but never leave a slot empty
  }
  if (!pool.length) return null;
  const fresh = pool.filter((f) => !used.has(f.id));
  const cands = fresh.length ? fresh : pool;
  return cands[seed % cands.length];
}

function buildMeal(def, targets, prefs, seed, used) {
  const has0 = (s) => def.slots.includes(s);
  const mP = has0("protein") ? targets.p * def.share / SLOT_SHARE.protein : 0;
  const mC = has0("carb") || has0("fruit") ? targets.c * def.share / SLOT_SHARE.carb : 0;
  const mF = has0("fat") ? targets.f * def.share / SLOT_SHARE.fat : 0;
  const acc = { kcal: 0, p: 0, f: 0, c: 0 };
  const parts = [];
  const add = (food, mult) => {
    const m = tidyMult(food, mult);
    if (m <= 0 || !food) return;
    parts.push({ food, mult: m });
    acc.kcal += food.per.kcal * m; acc.p += food.per.p * m; acc.f += food.per.f * m; acc.c += food.per.c * m;
  };

  const has = (s) => def.slots.includes(s);
  const protein = has("protein") ? pick("protein", prefs, seed, used) : null;
  const fat     = has("fat")     ? pick("fat", prefs, seed, used) : null;
  const veg     = has("veg")     ? pick("veg", prefs, seed, used) : null;
  const carb    = has("carb")    ? pick("carb", prefs, seed, used) : null;
  const fruit   = has("fruit")   ? pick("fruit", prefs, seed, used) : null;

  if (protein) add(protein, mP / protein.per.p);   // protein → meal protein target
  if (veg) add(veg, 1);                             // veg → one fixed serving
  if (fat) add(fat, (mF - acc.f) / fat.per.f);      // fat → remaining fat target
  // carbs: fill the remainder, splitting fruit + grain when both are present
  let remC = Math.max(0, mC - acc.c);
  if (fruit && carb) {
    add(fruit, (remC * 0.4) / fruit.per.c);
    add(carb, Math.max(0, mC - acc.c) / carb.per.c);
  } else if (carb) {
    add(carb, remC / carb.per.c);
  } else if (fruit) {
    add(fruit, remC / fruit.per.c);
  }

  parts.forEach((p) => used.add(p.food.id));
  return { def, parts };
}

function fmtPart(food, mult) {
  const n = food.base * mult;
  if (food.unit === "g") return `${roundTo(n, n < 40 ? 5 : 10)}g ${food.name}`;
  const q = Math.max(0.5, roundTo(n, 0.5));
  const qs = q % 1 === 0 ? `${q}` : `${q}`;
  if (food.unit === "ea")    return `${qs} ${food.name}${q === 1 ? "" : "s"}`;
  if (food.unit === "slice") return `${qs} ${q === 1 ? "slice" : "slices"} ${food.name}`;
  if (food.unit === "scoop") return `${qs} ${q === 1 ? "scoop" : "scoops"} ${food.name}`;
  if (food.unit === "tbsp")  return `${qs} tbsp ${food.name}`;
  return `${qs} ${food.name}`;
}

export function generateMeals(targets, prefs, seed = 0) {
  const used = new Set();
  const built = MEAL_DEFS.map((def) => buildMeal(def, targets, prefs, seed, used));

  // Portions are rounded to servings people can actually measure, and that
  // rounding moves the daily total. Scaling once leaves the plan sitting above
  // target, so re-measure the rounded result and correct until it converges.
  const realize = (factor) => built.map(({ def, parts }) => {
    const t = { kcal: 0, p: 0, f: 0, c: 0 };
    const items = parts.map((p) => {
      const m = tidyMult(p.food, p.mult * factor);
      t.kcal += p.food.per.kcal * m; t.p += p.food.per.p * m; t.f += p.food.per.f * m; t.c += p.food.per.c * m;
      return fmtPart(p.food, m);
    }).join(" + ");
    return { id: def.id, name: def.name, items, kcal: Math.round(t.kcal), p: Math.round(t.p), f: Math.round(t.f), c: Math.round(t.c) };
  });
  const totalOf = (meals) => meals.reduce((s, m) => s + m.kcal, 0);
  const missBy = (meals) => Math.abs(totalOf(meals) - targets.kcal);

  const raw = built.reduce((s, m) => s + m.parts.reduce((a, p) => a + p.food.per.kcal * p.mult, 0), 0);
  let factor = clamp(targets.kcal / (raw || 1), 0.75, 1.4);
  let meals = realize(factor);

  // Rounding is discrete, so a correction can overshoot — keep a pass only when
  // it actually lands closer, which also stops it oscillating.
  for (let i = 0; i < 3 && missBy(meals) > targets.kcal * 0.01; i++) {
    const total = totalOf(meals);
    if (!total) break;
    const nextFactor = clamp(factor * (targets.kcal / total), 0.75, 1.4);
    if (nextFactor === factor) break;
    const next = realize(nextFactor);
    if (missBy(next) >= missBy(meals)) break;
    factor = nextFactor;
    meals = next;
  }
  return meals;
}

// The meal list the views render — generated from preferences, or the scaled
// static template for users who haven't set preferences yet.
export function getMeals(settings) {
  const targets = settings.targets;
  if (settings.foodPrefs) return generateMeals(targets, settings.foodPrefs, settings.foodPrefs.seed || 0);
  const baseline = settings.baselineKcal || 2100;
  const scale = targets.kcal / baseline;
  return RAW_MEALS.map((m) => ({
    ...m,
    kcal: Math.round(m.kcal * scale), p: Math.round(m.p * scale),
    f: Math.round(m.f * scale), c: Math.round(m.c * scale),
  }));
}
