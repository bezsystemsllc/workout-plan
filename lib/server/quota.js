// Check every bucket before charging any of them. Redis serializes the script
// across function instances, including simultaneous cold starts.
const RESERVE = `
for i, key in ipairs(KEYS) do
  if tonumber(redis.call('GET', key) or '0') >= tonumber(ARGV[2*i-1]) then
    return {i, redis.call('TTL', key)}
  end
end
for i, key in ipairs(KEYS) do
  if redis.call('INCR', key) == 1 then redis.call('EXPIRE', key, ARGV[2*i]) end
end
return {0, 0}`;

export function envNumber(env, name, fallback, min, max) {
  const value = Number(env[name] || fallback);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

export async function reserveQuota(service, ip, env) {
  const unavailable = { ok: false, reason: "store_unavailable", retryAfterMs: 60000 };
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!token || !env.UPSTASH_REDIS_REST_URL || !env.RATE_LIMIT_SALT) return unavailable;
  try {
    const url = new URL(env.UPSTASH_REDIS_REST_URL);
    if (url.protocol !== "https:") return unavailable;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(env.RATE_LIMIT_SALT),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(ip || "unknown"));
    const client = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    const now = Math.floor(Date.now() / 1000);
    const buckets = [];
    function bucket(scope, limit, seconds, reason) {
      const slot = Math.floor(now / seconds);
      buckets.push({ key: `tempo:{${service}}:${scope}:${slot}`, limit, ttl: seconds - now % seconds, reason });
    }
    if (service === "coach") {
      bucket(client + ":window", envNumber(env, "COACH_RATE_LIMIT", 5, 1, 50),
        envNumber(env, "COACH_RATE_WINDOW_SECONDS", 900, 60, 3600), "window");
      bucket(client + ":day", envNumber(env, "COACH_DAILY_LIMIT", 20, 1, 500), 86400, "daily");
      bucket("global", envNumber(env, "COACH_GLOBAL_DAILY_LIMIT", 100, 1, 10000), 86400, "daily");
    } else {
      bucket(client, 30, 60, "window");
      bucket("global", envNumber(env, "USDA_GLOBAL_HOURLY_LIMIT", 800, 1, 1000), 3600, "window");
    }
    const command = ["EVAL", RESERVE, buckets.length, ...buckets.map(b => b.key),
      ...buckets.flatMap(b => [b.limit, b.ttl])];
    const response = await fetch(url, {
      method: "POST", redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(envNumber(env, "RATE_LIMIT_TIMEOUT_MS", 3000, 500, 10000)),
    });
    if (!response.ok) return unavailable;
    const { result } = await response.json();
    if (!Array.isArray(result) || result.length !== 2) return unavailable;
    const [index, ttl] = result;
    if (index === 0 && ttl === 0) return { ok: true };
    if (!Number.isInteger(index) || !buckets[index - 1] || !Number.isInteger(ttl)) return unavailable;
    return { ok: false, reason: buckets[index - 1].reason, retryAfterMs: Math.max(1, ttl) * 1000 };
  } catch {
    return unavailable;
  }
}
