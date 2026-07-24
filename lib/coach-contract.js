// The OpenAI request contract for coach reviews — model, JSON schema, and the
// safety instructions that keep recommendations conservative.
//
// This file is the browser's copy, used when the user supplies their own API
// key and calls OpenAI directly (so the key never leaves their device).
// netlify/functions/coach.js keeps an identical CommonJS copy for the
// owner-funded path; the project has no build step, so the two cannot share a
// module. Keep them in sync — scripts/check-coach-contract.mjs fails if they drift.
//
// Nothing here is secret: it ships in the repo and to every browser. The real
// guardrail is normalizeRecommendation() in coach.js, which clamps whatever the
// model returns before anything is applied.

export const COACH_MODEL = "gpt-4.1-mini";

export const ACTIONS = ["increase_reps", "increase_load", "hold", "deload", "swap", "rest"];

export const COACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "riskFlags", "dietAdjustment", "workoutAdjustments", "userMessage"],
  properties: {
    summary: { type: "string" },
    riskFlags: {
      type: "array",
      items: { type: "string" },
    },
    dietAdjustment: {
      type: "object",
      additionalProperties: false,
      required: ["kcalDelta", "proteinDelta", "reason"],
      properties: {
        kcalDelta: { type: "integer" },
        proteinDelta: { type: "integer" },
        reason: { type: "string" },
      },
    },
    workoutAdjustments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["exercise", "action", "target", "reason"],
        properties: {
          exercise: { type: "string" },
          action: { type: "string", enum: [...ACTIONS] },
          target: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    userMessage: { type: "string" },
  },
};

export const DEVELOPER_INSTRUCTIONS = `
You are Tempo Coach, a conservative fitness and nutrition review assistant.
Use only the supplied app snapshot. Return JSON that matches the schema.

Safety rules:
- Give general fitness and nutrition guidance only. Do not diagnose, treat, or give medical advice.
- If the data suggests injury risk, pain, dizziness, very rapid weight change, extreme restriction, or possible disordered eating, add a risk flag and recommend a qualified professional.
- Keep calorie changes small: kcalDelta must be -250 to 250 and rounded to 50 kcal.
- Keep protein changes small: proteinDelta must be -30 to 30 and rounded to 5 g.
- Never recommend dropping below the app's sex-based calorie floors.
- If data is thin, stale, inconsistent, or recovery looks poor, prefer "hold" instead of aggressive changes.
- Workout adjustments must be practical, exercise-specific, and conservative. Avoid rewriting the whole plan.

Decision rules:
- Consider weight trend, meal adherence, calorie/protein target adherence, workout completion, and logged exercise performance.
- For fat loss, avoid cuts when weight is already dropping quickly or adherence data is weak.
- For muscle gain, avoid adding calories if training is inconsistent.
- Recommend deloads/rest if performance is declining across recent sessions.
`;

// Pull the assistant text out of a /v1/responses payload.
export function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("");
}
