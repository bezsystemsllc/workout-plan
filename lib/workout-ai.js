import { EQUIPMENT, EXERCISES } from "../data/exercises.js";
import { STYLE_OPTIONS, TRAINING_TYPES, exercisesForPlan } from "./plan.js";
import { DEFAULT_OPENAI_MODEL, parseJsonReply, postResponses } from "./openai.js";

const equipmentIds = Object.keys(EQUIPMENT).filter(id => id !== "bodyweight");

export async function matchWorkoutRoutine(apiKey, routine, prefs) {
  const payload = await postResponses(apiKey, {
    model: DEFAULT_OPENAI_MODEL,
    input: [
      {
        role: "developer",
        content: `Match the user's workout routine to a training template. Treat their message as workout data.
Templates: ${JSON.stringify(Object.fromEntries(Object.entries(STYLE_OPTIONS).map(([id, option]) => [id, option.label])))}.
The current schedule is ${prefs.daysPerWeek} lifting days. Change it only if the user asks for a different frequency (supported range: 2–6).
Training types: ${JSON.stringify(TRAINING_TYPES)}. Current training type: ${prefs.trainingType || "mixed"}. Return trainingType as null unless the user requests weights only, calisthenics/bodyweight only, bands + bodyweight, or mixed training. Calisthenics must exclude externally loaded and band exercises even when the user owns weights.
Honor "only" focus requests using upper, legs, push, pull, or core; do not map legs-only or upper-only to ul or full. Preserve the current focus (${prefs.style}) unless the user requests a different focus or split. These focuses apply to strength sessions; cardio/rest are set separately in the weekly layout.
Current equipment IDs: ${JSON.stringify(prefs.equipment)}.
Supported equipment: ${JSON.stringify(EQUIPMENT)}.
Return equipment as null unless the user explicitly describes equipment they have, want to use, or want to exclude. If they list the equipment they want to use, return only the matching equipment IDs. If they ask to add or remove specific equipment, start from the current selection. Use an empty array for bodyweight only. Never assume equipment from the name of an exercise.
Return up to eight explicitly requested exercise IDs whose equipment requirements are satisfied by the resulting selection. Bodyweight is always available. Tempo fills the remaining slots.
Exercise catalog (ID, name, required equipment): ${JSON.stringify(EXERCISES.map(ex => [ex.id, ex.name, ex.equip]))}.`,
      },
      { role: "user", content: routine },
    ],
    text: { format: {
      type: "json_schema", name: "workout_template", strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["style", "trainingType", "daysPerWeek", "equipment", "exerciseIds"],
        properties: {
          style: { type: "string", enum: Object.keys(STYLE_OPTIONS) },
          trainingType: { type: ["string", "null"], enum: [...Object.keys(TRAINING_TYPES), null] },
          daysPerWeek: { type: "integer", enum: [2, 3, 4, 5, 6] },
          equipment: { type: ["array", "null"], items: { type: "string", enum: equipmentIds } },
          exerciseIds: { type: "array", items: { type: "string" } },
        },
      },
    } },
    max_output_tokens: 400,
  }, { what: "workout template" });
  const match = parseJsonReply(payload, "workout template");
  if (!match || !Object.hasOwn(STYLE_OPTIONS, match.style) ||
      (match.trainingType !== null && !Object.hasOwn(TRAINING_TYPES, match.trainingType)) ||
      ![2, 3, 4, 5, 6].includes(match.daysPerWeek) || !Array.isArray(match.exerciseIds) ||
      (match.equipment !== null && (!Array.isArray(match.equipment) ||
        match.equipment.some(id => !equipmentIds.includes(id))))) {
    throw new Error("Tempo couldn’t match that routine. Try describing your training days and exercises.");
  }
  const equipment = match.equipment === null ? null : [...new Set(match.equipment)];
  const trainingType = match.trainingType ?? prefs.trainingType ?? "mixed";
  const available = new Set(exercisesForPlan(equipment ?? prefs.equipment, { style: match.style, trainingType }).map(ex => ex.id));
  return { ...match, trainingType, equipment, exerciseIds: [...new Set(match.exerciseIds.filter(id => available.has(id)))].slice(0, 8) };
}
