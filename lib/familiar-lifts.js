import { EXERCISES } from "../data/exercises.js";
import { DEFAULT_OPENAI_MODEL, parseJsonReply, postResponses } from "./openai.js";

const weighted = EXERCISES.filter(ex => ex.prog === "weight");

export function normalizeFamiliarLifts(entries) {
  const byId = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!weighted.some(ex => ex.id === entry?.id) || !Number.isFinite(entry.weight) ||
        entry.weight <= 0 || !["lb", "kg"].includes(entry.unit) ||
        !(entry.reps === null || (Number.isSafeInteger(entry.reps) && entry.reps > 0))) continue;
    const { id, weight, unit, reps } = entry;
    byId.set(id, { id, weight, unit, reps });
  }
  return [...byId.values()];
}

export async function readFamiliarLifts(key, description) {
  const payload = await postResponses(key, {
    model: DEFAULT_OPENAI_MODEL,
    input: [
      { role: "developer", content: `Extract only familiar working weights explicitly reported by the user. Do not estimate loads, infer missing units, or use goals, maximum lifts or equipment inventory. Match exact exercise variants from this catalog: ${JSON.stringify(weighted.map(ex => [ex.id, ex.name]))}. For dumbbells, record weight per dumbbell; if the basis is unclear, omit the lift. Return reps only if stated, otherwise null. Omit ambiguous entries.` },
      { role: "user", content: description },
    ],
    text: { format: { type: "json_schema", name: "familiar_lifts", strict: true, schema: {
      type: "object", additionalProperties: false, required: ["lifts"],
      properties: { lifts: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["id", "weight", "unit", "reps"],
        properties: { id: { type: "string", enum: weighted.map(ex => ex.id) }, weight: { type: "number" },
          unit: { type: "string", enum: ["lb", "kg"] }, reps: { type: ["integer", "null"] } },
      } } },
    } } },
    max_output_tokens: 800,
  }, { what: "starting weights" });
  const lifts = normalizeFamiliarLifts(parseJsonReply(payload, "starting weights")?.lifts);
  if (!lifts.length) throw new Error("Include an exercise and the weight you use in lb or kg. For dumbbells, give the weight of one dumbbell.");
  return lifts;
}
