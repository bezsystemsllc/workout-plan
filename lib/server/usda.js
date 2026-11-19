const FOOD_SEARCH = "https://api.nal.usda.gov/fdc/v1/foods/search";

export function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function foodResult(food) {
  if (typeof food?.description !== "string" || !food.description.trim() || !Array.isArray(food.foodNutrients)) return null;
  const amounts = new Map(food.foodNutrients.map(nutrient => [nutrient.nutrientId, nutrient.value]));
  const kcal = amounts.get(1008) ?? amounts.get(2047) ?? amounts.get(2048);
  const p = amounts.get(1003);
  const f = amounts.get(1004);
  const c = amounts.get(1005);
  if (![kcal, p, f, c].every(value => Number.isFinite(value) && value >= 0)) return null;
  return {
    fdcId: food.fdcId,
    name: food.description.trim().slice(0, 80),
    portion: "100 g",
    kcal,
    p,
    f,
    c,
  };
}

export async function lookupFood(query, key) {
  const url = new URL(FOOD_SEARCH);
  url.searchParams.set("api_key", key);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, dataType: ["Foundation", "SR Legacy"], pageSize: 10 }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 429) return json(429, { error: "USDA food search has reached its request limit. Please try again later." });
    if (!response.ok) return json(502, { error: "USDA food search is temporarily unavailable." });
    const { foods } = await response.json();
    if (!Array.isArray(foods)) return json(502, { error: "USDA returned an unreadable food list." });
    const items = foods.map(foodResult).filter(Boolean).slice(0, 6);
    return json(200, { items, source: "USDA FoodData Central" });
  } catch {
    return json(502, { error: "Couldn’t reach USDA FoodData Central. Try again." });
  }
}
