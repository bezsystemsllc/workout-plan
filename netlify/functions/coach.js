import { runCoach } from "../../lib/server/coach-handler.js";

export const handler = async (event) => {
  const forwarded = event.headers["x-forwarded-for"] || "";
  const ip = event.headers["x-nf-client-connection-ip"]
    || event.headers["client-ip"]
    || event.headers["x-real-ip"]
    || (forwarded ? forwarded.split(",")[0].trim() : "")
    || "unknown";

  return await runCoach({
    method: event.httpMethod,
    rawBody: typeof event.body === "string" ? event.body : "",
    isBase64Encoded: event.isBase64Encoded,
    ip,
    originHeader: event.headers.origin || "",
    refererHeader: event.headers.referer || "",
    env: process.env,
  });
};
