const crypto = require("node:crypto");

const ACTIONS = new Set(["increase_reps", "increase_load", "hold", "deload", "swap", "rest"]);
const DEFAULT_RATE_WINDOW_SECONDS = 15 * 60;
const MAX_BODY_CHARS = 60000;
const MAX_SNAPSHOT_CHARS = 50000;
const memoryWindowBuckets = new Map();
const memoryDailyBuckets = new Map();
let memoryFallbackWarned = false;

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

  // Bring-your-own-key: a caller-supplied key is used instead of the owner's,
  // so the review runs on the user's own OpenAI account. The key is used for
  // this request only — never stored, never logged.
  const userKey = userApiKey(event);
  if (userKey === null) {
    return unavailable(400, "invalid_user_key", "The supplied OpenAI key is not in a valid format. No changes were applied.");
  }
  const apiKey = userKey || String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return unavailable(503, "missing_api_key", "AI coach needs an OpenAI key — add your own in Settings, or set OPENAI_API_KEY. The rest of Tempo still works.");
  }

  const originFailure = checkAllowedOrigin(event);
  if (originFailure) return originFailure;

  // Owner-funded calls keep the strict shared budget. BYOK callers spend their
  // own credit, so they only need a cap loose enough to stop this function
  // being used as an open relay.
  const rate = await checkRateLimit(clientKey(event, !!userKey), limitsFor(!!userKey));
  if (!rate.ok) return rateLimitResponse(rate);

  if (event.isBase64Encoded) {
    return json(415, { error: "Encoded request bodies are not supported." });
  }
  const rawBody = typeof event.body === "string" ? event.body : "";
  if (rawBody.length > MAX_BODY_CHARS) {
    return json(413, { error: "Coach request is too large." });
  }

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  if (!body || typeof body.snapshot !== "object" || Array.isArray(body.snapshot)) {
    return json(400, { error: "Missing coach snapshot." });
  }

  const snapshotJson = JSON.stringify(body.snapshot);
  if (snapshotJson.length > MAX_SNAPSHOT_CHARS) {
    return json(413, { error: "Coach snapshot is too large." });
  }

  try {
    const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
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
    }, openAITimeoutMs());

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return openAIError(response, payload, !!userKey);
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
    // Message only — an error object could carry request details, and a BYOK
    // request carries the user's key.
    console.error("coach function failed:", err?.message || "unknown error");
    return unavailable(503, "upstream_unavailable", "AI coach is temporarily unavailable. The rest of Tempo still works.");
  }
};

// "" = absent (use the owner key), null = present but malformed, string = use it.
// The character class excludes whitespace and control characters, so the value
// is always safe to place in the outgoing Authorization header.
function userApiKey(event) {
  const raw = header(event, "x-openai-key").trim();
  if (!raw) return "";
  return /^sk-[\x21-\x7e]{16,300}$/.test(raw) ? raw : null;
}

function limitsFor(byok) {
  return byok
    ? { window: envNumber("COACH_BYOK_RATE_LIMIT", 30, 1, 500), daily: envNumber("COACH_BYOK_DAILY_LIMIT", 200, 1, 5000) }
    : { window: rateLimit(), daily: dailyLimit() };
}

function rateLimitResponse(rate) {
  const retrySeconds = Math.max(1, Math.ceil(rate.retryAfterMs / 1000));
  if (rate.reason === "daily") {
    return unavailable(
      429,
      "coach_daily_limit",
      `Daily coach review limit reached. Try again after ${retrySeconds} seconds. No changes were applied.`,
      String(retrySeconds),
    );
  }
  if (rate.reason === "store_unavailable") {
    return unavailable(
      503,
      "rate_limit_unavailable",
      "AI coach is temporarily unavailable because rate limiting could not be verified. No changes were applied.",
      String(retrySeconds),
    );
  }
  return unavailable(
    429,
    "coach_rate_limit",
    `Too many coach reviews. Try again after ${retrySeconds} seconds. No changes were applied.`,
    String(retrySeconds),
  );
}

function checkAllowedOrigin(event) {
  const allowed = allowedOrigins();
  if (!allowed.length) return null;
  const origin = requestOrigin(event);
  if (origin && allowed.includes(origin)) return null;
  return unavailable(403, "origin_not_allowed", "AI coach requests are not allowed from this origin. No changes were applied.");
}

function allowedOrigins() {
  return String(process.env.COACH_ALLOWED_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function requestOrigin(event) {
  const directOrigin = header(event, "origin");
  if (directOrigin) return directOrigin.replace(/\/$/, "");
  const referer = header(event, "referer");
  if (!referer) return "";
  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

async function checkRateLimit(key, limits) {
  const supabase = supabaseConfig();
  if (supabase) {
    try {
      return await checkSupabaseRateLimit(supabase, key, limits);
    } catch (err) {
      console.error("rate limit store failed", err);
      return { ok: false, reason: "store_unavailable", retryAfterMs: 60 * 1000 };
    }
  }

  const upstash = upstashConfig();
  if (upstash) {
    try {
      return await checkUpstashRateLimit(upstash, key, limits);
    } catch (err) {
      console.error("rate limit store failed", err);
      return { ok: false, reason: "store_unavailable", retryAfterMs: 60 * 1000 };
    }
  }
  if (!memoryFallbackWarned) {
    memoryFallbackWarned = true;
    console.warn("coach: no Supabase/Upstash configured — in-memory rate limiting is per-instance and best-effort only. Configure a durable store for production (see README).");
  }
  return checkMemoryRateLimit(key, limits);
}

async function checkSupabaseRateLimit(supabase, key, limits) {
  const now = new Date();
  const windowSeconds = rateWindowSeconds();
  const windowMs = windowSeconds * 1000;
  const windowStamp = Math.floor(now.getTime() / windowMs);
  const windowResetAt = new Date((windowStamp + 1) * windowMs).toISOString();
  const dailyResetAt = new Date(now.getTime() + secondsUntilTomorrow(now) * 1000).toISOString();
  const response = await fetchWithTimeout(`${supabase.url}/rest/v1/rpc/tempo_check_rate_limit`, {
    method: "POST",
    headers: supabaseRestHeaders(supabase.key),
    body: JSON.stringify({
      p_key: key,
      p_window_bucket: String(windowStamp),
      p_window_reset_at: windowResetAt,
      p_daily_bucket: dateStamp(now),
      p_daily_reset_at: dailyResetAt,
      p_window_limit: limits.window,
      p_daily_limit: limits.daily,
    }),
  }, rateLimitTimeoutMs());
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `Supabase rate limit failed with ${response.status}`);
  }

  const result = Array.isArray(body) ? body[0] : body;
  if (result?.ok === true) return { ok: true };
  return {
    ok: false,
    reason: result?.reason === "daily" ? "daily" : "window",
    retryAfterMs: Math.max(1000, Number(result?.retryAfterMs ?? result?.retry_after_ms) || 60 * 1000),
  };
}

async function checkUpstashRateLimit(upstash, key, limits) {
  const now = new Date();
  const windowSeconds = rateWindowSeconds();
  const windowMs = windowSeconds * 1000;
  const windowStamp = Math.floor(now.getTime() / windowMs);
  const windowKey = `tempo:coach:rl:${windowStamp}:${key}`;
  const dailyKey = `tempo:coach:daily:${dateStamp(now)}:${key}`;
  const dailySeconds = secondsUntilTomorrow(now);
  const response = await fetchWithTimeout(`${upstash.url}/multi-exec`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${upstash.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", windowKey],
      ["EXPIRE", windowKey, windowSeconds * 2],
      ["INCR", dailyKey],
      ["EXPIRE", dailyKey, dailySeconds],
    ]),
  }, rateLimitTimeoutMs());
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body) || body.some((item) => item?.error)) {
    throw new Error(body?.error || `Upstash rate limit failed with ${response.status}`);
  }

  // Fail closed on malformed counters — a 200 with non-numeric results must
  // not collapse to count 0 and wave the request through.
  const windowCount = Number(commandResult(body[0]));
  const dailyCount = Number(commandResult(body[2]));
  if (!Number.isFinite(windowCount) || !Number.isFinite(dailyCount)) {
    throw new Error("Upstash rate limit returned malformed counters");
  }
  const windowRetryMs = Math.max(1000, ((windowStamp + 1) * windowMs) - now.getTime());

  if (dailyCount > limits.daily) return { ok: false, reason: "daily", retryAfterMs: dailySeconds * 1000 };
  if (windowCount > limits.window) return { ok: false, reason: "window", retryAfterMs: windowRetryMs };
  return { ok: true };
}

function checkMemoryRateLimit(key, limits) {
  const limit = limits.window;
  const now = Date.now();
  const date = new Date(now);
  const windowMs = rateWindowSeconds() * 1000;
  const windowStamp = Math.floor(now / windowMs);
  const windowResetAt = (windowStamp + 1) * windowMs;
  const dailyResetAt = now + secondsUntilTomorrow(date) * 1000;
  cleanupExpired(memoryWindowBuckets, now);
  cleanupExpired(memoryDailyBuckets, now);

  const window = bumpBucket(memoryWindowBuckets, `${windowStamp}:${key}`, windowResetAt);
  const daily = bumpBucket(memoryDailyBuckets, `${dateStamp(date)}:${key}`, dailyResetAt);

  if (daily.count > limits.daily) return { ok: false, reason: "daily", retryAfterMs: daily.resetAt - now };
  return window.count <= limit
    ? { ok: true }
    : { ok: false, reason: "window", retryAfterMs: window.resetAt - now };
}

function cleanupExpired(map, now) {
  for (const [bucketKey, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(bucketKey);
  }
}

function bumpBucket(map, key, resetAt) {
  const current = map.get(key) || { count: 0, resetAt };
  current.count += 1;
  map.set(key, current);
  return current;
}

function rateLimit() {
  return envNumber("COACH_RATE_LIMIT", 5, 1, 50);
}

function dailyLimit() {
  return envNumber("COACH_DAILY_LIMIT", 20, 1, 500);
}

function rateWindowSeconds() {
  return envNumber("COACH_RATE_WINDOW_SECONDS", DEFAULT_RATE_WINDOW_SECONDS, 60, 3600);
}

function openAITimeoutMs() {
  return envNumber("OPENAI_TIMEOUT_MS", 12000, 3000, 25000);
}

function rateLimitTimeoutMs() {
  return envNumber("RATE_LIMIT_TIMEOUT_MS", 3000, 500, 10000);
}

function envNumber(name, fallback, min, max) {
  const raw = Number(process.env[name] || fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

// BYOK callers get their own bucket namespace so spending their own credit
// never eats into the owner-funded budget for that IP.
function clientKey(event, byok) {
  const forwarded = header(event, "x-forwarded-for");
  const ip = header(event, "x-nf-client-connection-ip")
    || header(event, "client-ip")
    || header(event, "x-real-ip")
    || (forwarded ? forwarded.split(",")[0].trim() : "")
    || "unknown";
  return `${byok ? "byok:" : ""}${hashClientKey(ip)}`;
}

function hashClientKey(ip) {
  const salt = String(process.env.RATE_LIMIT_SALT || process.env.OPENAI_API_KEY || "tempo");
  return crypto.createHmac("sha256", salt).update(String(ip)).digest("hex").slice(0, 32);
}

function upstashConfig() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "");
  return url && token ? { url, token } : null;
}

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  return url && key ? { url, key } : null;
}

function supabaseRestHeaders(key) {
  const headers = {
    "apikey": key,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (looksLikeJwt(key)) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function looksLikeJwt(value) {
  return String(value || "").split(".").length === 3;
}

function dateStamp(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function secondsUntilTomorrow(date) {
  const tomorrow = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return Math.max(60, Math.ceil((tomorrow - date) / 1000));
}

function commandResult(item) {
  return item && typeof item === "object" && "result" in item ? item.result : item;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function header(event, name) {
  const headers = event.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || "";
}

function openAIError(response, payload, byok) {
  const retryAfter = response.headers?.get?.("retry-after") || "";
  const upstreamCode = payload?.error?.code || payload?.error?.type || "";
  const upstreamMessage = payload?.error?.message || "";
  console.warn("OpenAI coach request failed", {
    status: response.status,
    code: upstreamCode,
    message: upstreamMessage,
  });

  if (response.status === 401 || response.status === 403) {
    return byok
      ? unavailable(400, "user_key_auth_failed", "Your OpenAI key was rejected. Check or replace it in Settings. No changes were applied.")
      : unavailable(503, "auth_failed", "AI coach is unavailable because the OpenAI API key is invalid or lacks access. The rest of Tempo still works.");
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
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
