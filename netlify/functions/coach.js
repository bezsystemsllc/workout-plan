const ACTIONS = new Set(["increase_reps", "increase_load", "hold", "deload", "swap", "rest"]);

const COACH_SCHEMA = {
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

const DEVELOPER_INSTRUCTIONS = `
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  if (!String(process.env.OPENAI_API_KEY || "").trim()) {
    return unavailable(503, "missing_api_key", "AI coach is disabled because OPENAI_API_KEY is not set. The rest of Tempo still works.");
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  if (!body || typeof body.snapshot !== "object" || Array.isArray(body.snapshot)) {
    return json(400, { error: "Missing coach snapshot." });
  }

  const snapshotJson = JSON.stringify(body.snapshot);
  if (snapshotJson.length > 50000) {
    return json(413, { error: "Coach snapshot is too large." });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          { role: "developer", content: [{ type: "input_text", text: DEVELOPER_INSTRUCTIONS }] },
          { role: "user", content: [{ type: "input_text", text: snapshotJson }] },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "tempo_coach_recommendation",
            strict: true,
            schema: COACH_SCHEMA,
          },
        },
        max_output_tokens: 1200,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return openAIError(response, payload);
    }

    const text = extractOutputText(payload);
    if (!text) return unavailable(502, "empty_ai_response", "AI coach returned no recommendation. No changes were applied.");

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return unavailable(502, "invalid_ai_response", "AI coach returned an unreadable recommendation. No changes were applied.");
    }

    const recommendation = sanitizeRecommendation(parsed);
    return json(200, { recommendation });
  } catch (err) {
    console.error("coach function failed", err);
    return unavailable(503, "upstream_unavailable", "AI coach is temporarily unavailable. The rest of Tempo still works.");
  }
};

function openAIError(response, payload) {
  const retryAfter = response.headers?.get?.("retry-after") || "";
  const upstreamCode = payload?.error?.code || payload?.error?.type || "";
  const upstreamMessage = payload?.error?.message || "";
  console.warn("OpenAI coach request failed", {
    status: response.status,
    code: upstreamCode,
    message: upstreamMessage,
  });

  if (response.status === 401 || response.status === 403) {
    return unavailable(503, "auth_failed", "AI coach is unavailable because the OpenAI API key is invalid or lacks access. The rest of Tempo still works.");
  }
  if (response.status === 429) {
    return unavailable(429, "quota_or_rate_limit", "AI coach is temporarily unavailable because the OpenAI quota or rate limit was reached. No changes were applied.", retryAfter);
  }
  if (response.status === 404 || upstreamCode === "model_not_found") {
    return unavailable(503, "model_unavailable", "AI coach is unavailable because the configured OpenAI model is not available. Check OPENAI_MODEL or leave it unset.");
  }
  if (response.status >= 500) {
    return unavailable(503, "upstream_unavailable", "AI coach is temporarily unavailable. The rest of Tempo still works.", retryAfter);
  }
  return unavailable(502, "openai_request_failed", "AI coach request failed. No changes were applied.");
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("");
}

function sanitizeRecommendation(value) {
  const rec = value && typeof value === "object" ? value : {};
  return {
    summary: cleanText(rec.summary, 500, "Hold current plan until more data is logged."),
    riskFlags: arrayOfStrings(rec.riskFlags, 5, 200),
    dietAdjustment: {
      kcalDelta: roundTo(clampNumber(rec.dietAdjustment?.kcalDelta, -250, 250, 0), 50),
      proteinDelta: roundTo(clampNumber(rec.dietAdjustment?.proteinDelta, -30, 30, 0), 5),
      reason: cleanText(rec.dietAdjustment?.reason, 300, "No diet change recommended."),
    },
    workoutAdjustments: Array.isArray(rec.workoutAdjustments)
      ? rec.workoutAdjustments.slice(0, 6).map(sanitizeWorkoutAdjustment).filter(Boolean)
      : [],
    userMessage: cleanText(rec.userMessage, 500, "Keep logging meals, workouts, and weight so future reviews are more accurate."),
  };
}

function sanitizeWorkoutAdjustment(item) {
  if (!item || typeof item !== "object") return null;
  const action = ACTIONS.has(item.action) ? item.action : "hold";
  return {
    exercise: cleanText(item.exercise, 80, "Workout"),
    action,
    target: cleanText(item.target, 120, "Hold current prescription."),
    reason: cleanText(item.reason, 220, "Insufficient trend data for a stronger change."),
  };
}

function arrayOfStrings(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, maxLen, "")).filter(Boolean).slice(0, maxItems);
}

function cleanText(value, maxLen, fallback) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, maxLen);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function unavailable(statusCode, code, message, retryAfter = "") {
  return json(statusCode, {
    code,
    error: message,
    retryAfter: retryAfter || undefined,
  }, retryAfter ? { "Retry-After": retryAfter } : {});
}

function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...headers },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
