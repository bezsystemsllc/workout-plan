// Regression tests for the meal generator.
//
//   node scripts/test-meals.mjs

import { generateMeals, DEFAULT_FOOD_PREFS } from "../lib/meals.js";
import { FOODS, MEAL_KIND, fitsMeal, fitsDiet } from "../data/foods.js";

let failures = 0;
const check = (name, cond, extra = "") => {
  if (!cond) { failures++; console.log(`FAIL: ${name}${extra ? ` — ${extra}` : ""}`); }
  else console.log(`ok:   ${name}`);
};

const targetsFor = (kcal) => ({
  kcal,
  p: Math.round(kcal * 0.30 / 4),
  f: Math.round(kcal * 0.28 / 9),
  c: Math.round(kcal * 0.42 / 4),
});
const byName = new Map(FOODS.map(f => [f.name, f]));
// Map a rendered item string ("310g 0% Greek yogurt") back to its food.
const foodsIn = (items) => FOODS.filter(f => items.includes(f.name));

// ── Meal appropriateness: no dinner protein at breakfast, no roast at 9pm ──
for (const seed of [0, 1, 2, 3, 4, 5]) {
  const meals = generateMeals(targetsFor(2100), DEFAULT_FOOD_PREFS, seed);
  for (const meal of meals) {
    const kind = MEAL_KIND[meal.id];
    const bad = foodsIn(meal.items).filter(f => !fitsMeal(f, kind));
    check(`seed ${seed}: ${meal.id} only uses ${kind} foods`, bad.length === 0,
      bad.map(f => f.name).join(", ") + ` in "${meal.items}"`);
  }
}

// Specific regressions from the report: chicken/salmon at breakfast, eggs at dinner.
const breakfastProteins = new Set();
const eveningProteins = new Set();
for (let seed = 0; seed < 12; seed++) {
  const meals = generateMeals(targetsFor(2100), DEFAULT_FOOD_PREFS, seed);
  for (const f of foodsIn(meals.find(m => m.id === "breakfast").items)) {
    if (f.cat === "protein") breakfastProteins.add(f.name);
  }
  for (const f of foodsIn(meals.find(m => m.id === "evening").items)) {
    if (f.cat === "protein") eveningProteins.add(f.name);
  }
}
for (const banned of ["chicken breast", "salmon", "tilapia", "lean ground beef", "pork loin", "shrimp"]) {
  check(`breakfast never serves ${banned}`, !breakfastProteins.has(banned), [...breakfastProteins].join(", "));
  check(`evening never serves ${banned}`, !eveningProteins.has(banned), [...eveningProteins].join(", "));
}
check("breakfast does use morning proteins", breakfastProteins.size > 0, [...breakfastProteins].join(", "));

// ── Calorie accuracy after serving rounding ──
const offs = [];
for (const kcal of [1400, 1600, 1800, 2000, 2200, 2600, 3000]) {
  for (const seed of [0, 1, 2, 3]) {
    const total = generateMeals(targetsFor(kcal), DEFAULT_FOOD_PREFS, seed).reduce((s, m) => s + m.kcal, 0);
    offs.push(Math.abs(total - kcal) / kcal * 100);
  }
}
const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
check("mean calorie error under 2%", mean < 2, `${mean.toFixed(2)}%`);
check("worst calorie error under 8%", Math.max(...offs) < 8, `${Math.max(...offs).toFixed(1)}%`);

// ── Diets and allergens still produce a full day ──
for (const diet of ["omnivore", "vegetarian", "pescatarian", "vegan"]) {
  const prefs = { ...DEFAULT_FOOD_PREFS, diet, proteins: [], carbs: [] };
  const meals = generateMeals(targetsFor(2000), prefs, 1);
  check(`${diet}: all six meals have food`, meals.every(m => m.items.length > 0),
    JSON.stringify(meals.map(m => m.items)));
  const used = meals.flatMap(m => foodsIn(m.items));
  check(`${diet}: every food is allowed`, used.every(f => fitsDiet(f, diet)),
    used.filter(f => !fitsDiet(f, diet)).map(f => f.name).join(", "));
}

const allergic = { ...DEFAULT_FOOD_PREFS, avoid: ["dairy", "egg", "fish", "shellfish", "nuts"], proteins: [], carbs: [] };
const allergicMeals = generateMeals(targetsFor(2000), allergic, 2);
check("heavy allergen list still yields six meals", allergicMeals.every(m => m.items.length > 0),
  JSON.stringify(allergicMeals.map(m => m.items)));
check("no avoided allergen appears",
  allergicMeals.flatMap(m => foodsIn(m.items)).every(f => !f.allergens.some(a => allergic.avoid.includes(a))));

// ── Determinism and variety ──
check("same seed reproduces the day",
  JSON.stringify(generateMeals(targetsFor(2100), DEFAULT_FOOD_PREFS, 7))
  === JSON.stringify(generateMeals(targetsFor(2100), DEFAULT_FOOD_PREFS, 7)));
check("different seeds give different days",
  JSON.stringify(generateMeals(targetsFor(2100), DEFAULT_FOOD_PREFS, 7))
  !== JSON.stringify(generateMeals(targetsFor(2100), DEFAULT_FOOD_PREFS, 8)));

const day = generateMeals(targetsFor(2100), DEFAULT_FOOD_PREFS, 0);
const allFoods = day.flatMap(m => foodsIn(m.items).map(f => f.id));
check("a food is not repeated across the day", new Set(allFoods).size === allFoods.length,
  allFoods.join(", "));

console.log(failures ? `\n${failures} FAILURES` : "\nALL PASS");
process.exit(failures ? 1 : 0);
