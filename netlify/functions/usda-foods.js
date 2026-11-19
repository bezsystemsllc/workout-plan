import { reserveQuota } from "../../lib/server/quota.js";
import { json, lookupFood } from "../../lib/server/usda.js";

const cachedFoods = new Map();

export async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Use GET to look up a food." });
  const query = (event.queryStringParameters?.q || "").trim();
  if (!query || query.length > 100) return json(400, { error: "Enter a food name of up to 100 characters." });
  const key = process.env.USDA_FOODDATA_API_KEY?.trim();
  if (!key) return json(503, { error: "USDA food search is unavailable on this deployment." });

  const cached = cachedFoods.get(query.toLowerCase());
  if (cached && cached.expires > Date.now()) return cached.response;
  const quota = await reserveQuota("usda", event.headers?.["x-nf-client-connection-ip"], process.env);
  if (!quota.ok) {
    const limited = quota.reason !== "store_unavailable";
    const response = json(limited ? 429 : 503, { error: limited
      ? "Food search limit reached. Please try again later."
      : "Food search is temporarily unavailable." });
    response.headers["Retry-After"] = String(Math.ceil(quota.retryAfterMs / 1000));
    return response;
  }
  const response = await lookupFood(query, key);
  if (response.statusCode === 200) {
    if (cachedFoods.size >= 128) cachedFoods.delete(cachedFoods.keys().next().value);
    cachedFoods.set(query.toLowerCase(), { response, expires: Date.now() + 3600000 });
  }
  return response;
}
