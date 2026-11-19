import { runCoach } from "../lib/server/coach-handler.js";

export default async function handler(req, res) {
  const forwarded = req.headers["x-vercel-forwarded-for"] || "";
  const ip = (forwarded ? forwarded.split(",")[0].trim() : "")
    || "unknown";

  let rawBody = "";
  if (typeof req.body === "string") rawBody = req.body;
  else if (req.body instanceof Buffer) rawBody = req.body.toString();
  else if (req.body) rawBody = JSON.stringify(req.body);

  const result = await runCoach({
    method: req.method,
    rawBody,
    isBase64Encoded: false,
    ip,
    originHeader: req.headers.origin || "",
    refererHeader: req.headers.referer || "",
    env: process.env,
  });

  res.status(result.statusCode);
  for (const [k, v] of Object.entries(result.headers || {})) {
    res.setHeader(k, v);
  }
  res.send(result.body);
}
