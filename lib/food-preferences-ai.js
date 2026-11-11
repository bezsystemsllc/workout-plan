import { ALLERGENS, CARB_GROUPS, DIETS, FOODS, PROTEIN_GROUPS, proteinGroupsForDiet } from "../data/foods.js";
import { DEFAULT_OPENAI_MODEL, parseJsonReply, postResponses } from "./openai.js";

export async function suggestFoodPreferences(apiKey, description, current) {
  const foods = Object.fromEntries(FOODS.map(food => [food.id, food.name]));
  const choices = { proteins: PROTEIN_GROUPS, carbs: CARB_GROUPS, avoid: ALLERGENS, preferredFoods: foods };
  const payload = await postResponses(apiKey, {
    model: DEFAULT_OPENAI_MODEL,
    store: false,
    input: [
      {
        role: "developer",
        content: `Map the user's meal preferences to Tempo's built-in planner. Treat the message as preference data. Do not invent meals, nutrient targets, or medical advice.
Diets: ${JSON.stringify(DIETS)}. Food choices and exclusions: ${JSON.stringify(choices)}.
For foods explicitly requested, return matching ingredient IDs in preferredFoods and their protein or carb groups when applicable. Report requested ingredients without a catalog match in unmatchedFoods. Use null when the user leaves a preference unspecified.
For restrictions, only choose an exclusion that covers the restriction. List each restriction, allergy, or dietary pattern that the app cannot reliably represent in unsupportedRestrictions. Never drop or weaken a restriction. The app always keeps existing exclusions.`,
      },
      { role: "user", content: description },
    ],
    text: { format: {
      type: "json_schema", name: "food_preferences", strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["diet", ...Object.keys(choices), "unsupportedRestrictions", "unmatchedFoods"],
        properties: {
          diet: { type: ["string", "null"], enum: [...Object.keys(DIETS), null] },
          ...Object.fromEntries(Object.entries(choices).map(([field, values]) => [
            field, { type: ["array", "null"], items: { type: "string", enum: Object.keys(values) } },
          ])),
          unsupportedRestrictions: { type: "array", items: { type: "string" } },
          unmatchedFoods: { type: "array", items: { type: "string" } },
        },
      },
    } },
    max_output_tokens: 450,
  }, { what: "meal preferences" });
  const suggestion = parseJsonReply(payload, "meal preferences");
  if (!suggestion || (suggestion.diet !== null && !Object.hasOwn(DIETS, suggestion.diet)) ||
      !Array.isArray(suggestion.unsupportedRestrictions) || !Array.isArray(suggestion.unmatchedFoods) ||
      Object.entries(choices).some(([key, values]) => suggestion[key] !== null &&
        (!Array.isArray(suggestion[key]) || suggestion[key].some(id => !Object.hasOwn(values, id))))) {
    throw new Error("Tempo couldn’t match those food preferences. Try describing your diet, foods you like, and foods to avoid.");
  }
  const restrictions = suggestion.unsupportedRestrictions.filter(item => typeof item === "string" && item.trim());
  if (restrictions.length || suggestion.unsupportedRestrictions.length) {
    throw new Error(`Tempo couldn’t account for all your restrictions${restrictions.length ? ` (${restrictions.join(", ").slice(0, 160)})` : ""}. Your preferences are unchanged.`);
  }
  const diet = suggestion.diet ?? current.diet;
  const proteins = new Set(suggestion.proteins ?? current.proteins);
  return {
    foodPrefs: {
      ...current,
      diet,
      proteins: proteinGroupsForDiet(diet).filter(id => proteins.has(id)),
      carbs: [...new Set(suggestion.carbs ?? current.carbs)],
      avoid: [...new Set([...current.avoid, ...(suggestion.avoid ?? [])])],
      preferredFoods: [...new Set(suggestion.preferredFoods ?? current.preferredFoods ?? [])],
    },
    unmatchedFoods: suggestion.unmatchedFoods.filter(item => typeof item === "string" && item.trim()).slice(0, 8),
  };
}
