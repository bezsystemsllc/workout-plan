export async function searchUsdaFoods(value) {
  const query = value.trim();
  if (!query || query.length > 100) throw new Error("Enter a food name of up to 100 characters.");
  const response = await fetch(`/api/usda-foods?${new URLSearchParams({ q: query })}`);
  if (response.status === 429) {
    const error = new Error("USDA food search has reached its request limit. Please try again later.");
    error.status = response.status;
    throw error;
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(result?.items)) {
    throw new Error(result?.error || "USDA food search is unavailable on this deployment.");
  }
  return result;
}

export function isUsdaMatch(item, food) {
  const key = { protein: "p", fat: "f", carb: "c", fruit: "c" }[food.cat];
  return food.unit === "g" && Number.isSafeInteger(item?.fdcId) && item.fdcId > 0 &&
    typeof item.name === "string" && item.name.trim().length > 0 &&
    Number.isFinite(item.kcal) && item.kcal > 0 && item.kcal <= 1000 &&
    ["p", "f", "c"].every(n => Number.isFinite(item[n]) && item[n] >= 0 && item[n] <= 100) &&
    (!key || item[key] > 0);
}
