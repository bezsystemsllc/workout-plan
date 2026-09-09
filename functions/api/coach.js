import { runCoach } from "../../lib/server/coach-handler.js";

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const originHeader = request.headers.get("origin") || "";
  const refererHeader = request.headers.get("referer") || "";
  
  let rawBody = "";
  if (method === "POST") {
    rawBody = await request.text();
  }

  const result = await runCoach({
    method,
    rawBody,
    isBase64Encoded: false,
    ip,
    originHeader,
    refererHeader,
    env,
  });

  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}
