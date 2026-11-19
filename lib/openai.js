// Direct browser → OpenAI calls made with the user's own key.
//
// Only used on the bring-your-own-key path: the key goes straight from this
// device to OpenAI and never touches the site's server. The owner-funded coach
// path still runs through netlify/functions/coach.js instead.

export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";

const DEFAULT_TIMEOUT_MS = 20000;

export async function postResponses(apiKey, body, { timeoutMs = DEFAULT_TIMEOUT_MS, what = "request" } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        ...(body.model === DEFAULT_OPENAI_MODEL ? { reasoning: { effort: "none" } } : {}),
        ...body,
        store: false,
      }),
    });
  } catch (err) {
    throw new Error(err?.name === "AbortError"
      ? `The ${what} timed out talking to OpenAI. Nothing was saved.`
      : "Couldn't reach OpenAI. Check your connection — the rest of Tempo still works.");
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(response.status, payload, body.model));
  return payload;
}

function errorMessage(status, payload, model) {
  const code = payload?.error?.code || payload?.error?.type || "";
  if (status === 401 || status === 403) {
    return "Your OpenAI key was rejected — it may be revoked or lack access. Update it in Settings.";
  }
  if (status === 429) {
    return "Your OpenAI account hit its rate limit or is out of credit. Nothing was saved.";
  }
  if (status === 404 || code === "model_not_found") {
    return `Your OpenAI account can't access the ${model} model. Nothing was saved.`;
  }
  if (status === 413) {
    return "That request was too large for OpenAI. Try again with a smaller image.";
  }
  if (status >= 500) {
    return "OpenAI is temporarily unavailable. Nothing was saved.";
  }
  return "The request to OpenAI failed. Nothing was saved.";
}

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

// Parse a strict-schema JSON reply, with the same failure wording everywhere.
export function parseJsonReply(payload, what = "result") {
  const text = extractOutputText(payload);
  if (!text) throw new Error(`OpenAI returned no ${what}. Nothing was saved.`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`OpenAI returned an unreadable ${what}. Nothing was saved.`);
  }
}
