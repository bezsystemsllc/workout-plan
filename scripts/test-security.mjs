import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runCoach } from "../lib/server/coach-handler.js";
import { reserveQuota } from "../lib/server/quota.js";
import { handler as search } from "../netlify/functions/usda-foods.js";
import { postResponses } from "../lib/openai.js";

const manifest = JSON.parse(readFileSync(new URL("./public-assets.json", import.meta.url)));
const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const precache = [...worker.matchAll(/^  "\.\/(.+)",$/gm)].map(match => match[1]);
assert.deepEqual(new Set(manifest), new Set([...precache, "sw.js"]));

const env = {
  UPSTASH_REDIS_REST_URL: "https://quota.invalid", UPSTASH_REDIS_REST_TOKEN: "test",
  RATE_LIMIT_SALT: "test", USDA_FOODDATA_API_KEY: "test", OPENAI_API_KEY: "test",
};
Object.assign(process.env, env);
let result = [0, 0], lookups = 0, responses = 0, reservations = 0;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith(env.UPSTASH_REDIS_REST_URL)) {
    reservations++;
    const [command, script, count, ...args] = JSON.parse(init.body);
    assert.equal(command, "EVAL");
    assert.match(script, /redis.call\('INCR'/);
    assert.equal(args.length, count * 3);
    return Response.json({ result });
  }
  if (String(url).startsWith("https://api.openai.com/")) {
    assert.equal(JSON.parse(init.body).store, false);
    responses++;
    return Response.json({output_text: "{}"});
  }
  assert.equal(new URL(url).hostname, "api.nal.usda.gov");
  lookups++;
  return Response.json({foods: []});
};
const event = q => ({httpMethod: "GET", queryStringParameters: {q}, headers: {}});
const coach = {method:"POST", rawBody:'{"snapshot":{}}', env, ip:"localhost"};
assert.equal((await search(event("apple"))).statusCode, 200);
assert.equal((await search(event("Apple"))).statusCode, 200);
assert.equal(lookups, 1);
assert.equal(reservations, 1);
result = [2, 30];
assert.equal((await search(event("pear"))).statusCode, 429);
result = [3, 45];
assert.equal((await runCoach(coach)).statusCode, 429);
assert.equal(responses, 0);
result = null;
assert.equal((await runCoach(coach)).statusCode, 503);
assert.equal((await search(event("pear"))).statusCode, 503);
assert.equal(lookups, 1);
assert.equal((await reserveQuota("coach", "ip", {})).reason, "store_unavailable");
result = [0, 0];
assert.equal((await runCoach(coach)).statusCode, 200);
await postResponses("test", { store: true });
assert.equal(responses, 2);

const data = new Map([["cut-to-abs:v1:openai-key", "legacy"]]);
Object.defineProperty(globalThis, "localStorage", {value: {
  getItem: key => data.get(key) || null,
  setItem: (key, value) => data.set(key, value),
  removeItem: key => data.delete(key),
}});
globalThis.window = {addEventListener() {}};
const first = await import("../storage.js?first");
assert.equal(first.loadApiKey(), "legacy");
assert.equal(data.size, 0);
first.saveApiKey("temporary");
assert.equal(data.size, 0);
const reload = await import("../storage.js?reload");
assert.equal(reload.loadApiKey(), "");
first.saveApiKey("remembered", true);
assert.equal(reload.loadApiKey(), "remembered");
reload.saveApiKey("");
assert.equal(first.loadApiKey(), "");
console.log("Public assets, quota failures, cache, AI retention and credential migration passed.");
