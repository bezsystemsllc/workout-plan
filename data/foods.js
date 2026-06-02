// Tagged food library for the meal generator. Pure static data — the builder
// filters these by diet + allergens + preferences, then scales portions to hit
// the user's macro targets (no LLM, no network).
//
// Each food:
//   cat   : "protein" | "carb" | "fat" | "veg" | "fruit" (its slot role)
//   group : preference bucket (poultry, rice, …) matched against the user's picks
//   diet  : most-restrictive diet it satisfies (vegan ⊂ vegetarian ⊂ pescatarian ⊂ omnivore)
//   allergens : tags to exclude when the user avoids them
//   unit/base : a base serving (e.g. 100 g, 1 scoop); the builder scales `base`
//   per   : macros for one base serving

const F = (id, name, cat, group, diet, allergens, unit, base, kcal, p, f, c) =>
  ({ id, name, cat, group, diet, allergens, unit, base, per: { kcal, p, f, c } });

export const FOODS = [
  // ── PROTEIN ───────────────────────────────────────────────────────────────
  F("chicken",  "chicken breast",   "protein", "poultry", "omnivore",    [],            "g", 100, 165, 31, 3.6, 0),
  F("turkey",   "turkey breast",    "protein", "poultry", "omnivore",    [],            "g", 100, 135, 30, 1,   0),
  F("beef",     "lean ground beef", "protein", "redmeat", "omnivore",    [],            "g", 100, 176, 20, 10,  0),
  F("pork",     "pork loin",        "protein", "redmeat", "omnivore",    [],            "g", 100, 143, 26, 3.5, 0),
  F("salmon",   "salmon",           "protein", "seafood", "pescatarian", ["fish"],      "g", 100, 208, 20, 13,  0),
  F("tilapia",  "tilapia",          "protein", "seafood", "pescatarian", ["fish"],      "g", 100, 96,  20, 2,   0),
  F("tuna",     "canned tuna",      "protein", "seafood", "pescatarian", ["fish"],      "g", 100, 116, 26, 1,   0),
  F("shrimp",   "shrimp",           "protein", "seafood", "pescatarian", ["shellfish"], "g", 100, 99,  24, 0.3, 0.2),
  F("eggs",     "egg",              "protein", "eggs",    "vegetarian",  ["egg"],       "ea", 1,  72,  6.3, 4.8, 0.4),
  F("eggwhite", "egg whites",       "protein", "eggs",    "vegetarian",  ["egg"],       "g", 100, 52,  11, 0.2, 0.7),
  F("yogurt",   "0% Greek yogurt",  "protein", "dairy",   "vegetarian",  ["dairy"],     "g", 100, 59,  10, 0.4, 3.6),
  F("cottage",  "cottage cheese",   "protein", "dairy",   "vegetarian",  ["dairy"],     "g", 100, 98,  11, 4.3, 3.4),
  F("whey",     "whey protein",     "protein", "dairy",   "vegetarian",  ["dairy"],     "scoop", 1, 120, 24, 1.5, 3),
  F("tofu",     "firm tofu",        "protein", "soy",     "vegan",       ["soy"],       "g", 100, 144, 15, 9,   3),
  F("tempeh",   "tempeh",           "protein", "soy",     "vegan",       ["soy"],       "g", 100, 192, 20, 11,  8),
  F("edamame",  "edamame",          "protein", "soy",     "vegan",       ["soy"],       "g", 100, 121, 12, 5,   9),
  F("lentils",  "lentils",          "protein", "legumes", "vegan",       [],            "g", 100, 116, 9,  0.4, 20),
  F("beans",    "black beans",      "protein", "legumes", "vegan",       [],            "g", 100, 132, 9,  0.5, 24),
  F("chickpeas","chickpeas",        "protein", "legumes", "vegan",       [],            "g", 100, 164, 9,  2.6, 27),

  // ── CARB ──────────────────────────────────────────────────────────────────
  F("whiterice","white rice",       "carb", "rice",   "vegan", [],          "g", 100, 130, 2.7, 0.3, 28),
  F("brownrice","brown rice",       "carb", "rice",   "vegan", [],          "g", 100, 123, 2.7, 1,   26),
  F("oats",     "oats",             "carb", "oats",   "vegan", ["gluten"],  "g", 100, 379, 13,  7,   68),
  F("potato",   "potato",           "carb", "potato", "vegan", [],          "g", 100, 87,  1.9, 0.1, 20),
  F("sweetpot", "sweet potato",     "carb", "potato", "vegan", [],          "g", 100, 86,  1.6, 0.1, 20),
  F("bread",    "whole-wheat bread","carb", "bread",  "vegan", ["gluten"],  "slice", 1, 80, 4,  1,   14),
  F("pasta",    "pasta",            "carb", "pasta",  "vegan", ["gluten"],  "g", 100, 131, 5,  1.1, 25),
  F("quinoa",   "quinoa",           "carb", "quinoa", "vegan", [],          "g", 100, 120, 4.4, 1.9, 21),

  // ── FRUIT ─────────────────────────────────────────────────────────────────
  F("banana",   "banana",  "fruit", "fruit", "vegan", [], "ea", 1,  105, 1.3, 0.4, 27),
  F("apple",    "apple",   "fruit", "fruit", "vegan", [], "ea", 1,  95,  0.5, 0.3, 25),
  F("berries",  "berries", "fruit", "fruit", "vegan", [], "g", 100, 57,  0.7, 0.3, 14),
  F("orange",   "orange",  "fruit", "fruit", "vegan", [], "ea", 1,  62,  1.2, 0.2, 15),

  // ── FAT ───────────────────────────────────────────────────────────────────
  F("oliveoil", "olive oil",     "fat", "oil",     "vegan", [],        "tbsp", 1, 119, 0,   13.5, 0),
  F("avocado",  "avocado",       "fat", "avocado", "vegan", [],        "ea", 0.5, 120, 1.5, 11,   6),
  F("almonds",  "almonds",       "fat", "nuts",    "vegan", ["nuts"],  "g", 15,  87,  3.2, 7.5,  3.3),
  F("pb",       "peanut butter", "fat", "nuts",    "vegan", ["nuts"],  "tbsp", 1, 94,  4,   8,    3),
  F("chia",     "chia seeds",    "fat", "seeds",   "vegan", [],        "tbsp", 1, 58,  2,   4,    5),

  // ── VEG ───────────────────────────────────────────────────────────────────
  F("broccoli", "broccoli",         "veg", "veg", "vegan", [], "g", 100, 34, 2.8, 0.4, 7),
  F("greens",   "salad greens",     "veg", "veg", "vegan", [], "g", 100, 20, 1.5, 0.2, 3),
  F("spinach",  "spinach",          "veg", "veg", "vegan", [], "g", 100, 23, 2.9, 0.4, 3.6),
  F("mixedveg", "mixed vegetables", "veg", "veg", "vegan", [], "g", 100, 65, 2.6, 0.5, 13),
  F("peppers",  "bell peppers",     "veg", "veg", "vegan", [], "g", 100, 31, 1,   0.3, 6),
];

// ── Preference vocabulary (used by the Settings UI) ──────────────────────────
export const DIETS = { omnivore: "Omnivore", vegetarian: "Vegetarian", pescatarian: "Pescatarian", vegan: "Vegan" };
export const PROTEIN_GROUPS = { poultry: "Poultry", redmeat: "Red meat", seafood: "Fish & seafood", eggs: "Eggs", dairy: "Dairy & whey", soy: "Tofu & soy", legumes: "Beans & legumes" };
export const CARB_GROUPS = { rice: "Rice", oats: "Oats", potato: "Potato", bread: "Bread", pasta: "Pasta", quinoa: "Quinoa" };
export const ALLERGENS = { dairy: "Dairy", gluten: "Gluten", nuts: "Nuts", soy: "Soy", egg: "Eggs", shellfish: "Shellfish", fish: "Fish" };

// A diet permits foods tagged at its tier or looser.
const DIET_ALLOW = {
  vegan:       new Set(["vegan"]),
  vegetarian:  new Set(["vegan", "vegetarian"]),
  pescatarian: new Set(["vegan", "vegetarian", "pescatarian"]),
  omnivore:    new Set(["vegan", "vegetarian", "pescatarian", "omnivore"]),
};
export const fitsDiet = (food, diet) => (DIET_ALLOW[diet] || DIET_ALLOW.omnivore).has(food.diet);

// Which protein buckets are even possible for a diet (drives the Settings chips).
export function proteinGroupsForDiet(diet) {
  if (diet === "vegan") return ["soy", "legumes"];
  if (diet === "vegetarian") return ["eggs", "dairy", "soy", "legumes"];
  if (diet === "pescatarian") return ["seafood", "eggs", "dairy", "soy", "legumes"];
  return Object.keys(PROTEIN_GROUPS); // omnivore
}
