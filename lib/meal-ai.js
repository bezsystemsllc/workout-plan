// Estimate a meal's foods and macros from a photo, using the user's own OpenAI
// key so the image goes straight from this device to OpenAI.
//
// The photo is never stored: it is downscaled in memory, sent, and discarded.
// Only the numbers the user confirms are written to the meal log.
//
// Portion size from a flat photo is genuinely uncertain — hidden volume, no
// scale reference, invisible oils. Results are drafts for the user to correct,
// never a silent auto-log. The schema asks for confidence so the UI can say so.

import { postResponses, parseJsonReply } from "./openai.js";

export const MEAL_PHOTO_MODEL = "gpt-4.1-mini";

// Long edge in pixels. Big enough to read a plate, small enough to keep the
// request quick and cheap.
const MAX_EDGE = 768;
const JPEG_QUALITY = 0.8;
const MAX_DATA_URL_CHARS = 900000; // ~650KB of image data

const INSTRUCTIONS = `
You identify foods in a photo of a meal and estimate their nutrition.

Rules:
- List each distinct food as its own item. Combine garnishes into the dish they belong to.
- Estimate the portion actually visible, using plate, cutlery, hands, or containers for scale.
- State the portion in everyday units the person can check, e.g. "about 1 cup", "2 slices", "150 g".
- Account for visible cooking fat, dressings, and sauces.
- confidence: "high" only when the food and portion are both clear; "low" when the food is
  ambiguous, mostly hidden, or the portion is a guess.
- If the image is not food, return an empty items array and explain in note.
- Do not invent foods you cannot see. Fewer, accurate items beat a long speculative list.
- kcal, protein, fat and carbs are for the whole portion described, not per 100 g.
`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "note"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "portion", "kcal", "protein", "fat", "carbs", "confidence"],
        properties: {
          name: { type: "string" },
          portion: { type: "string" },
          kcal: { type: "integer" },
          protein: { type: "integer" },
          fat: { type: "integer" },
          carbs: { type: "integer" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    note: { type: "string" },
  },
};

// Downscale to a JPEG data URL, honouring EXIF orientation so phone photos
// aren't sideways. Never returns the original bytes.
export async function toDownscaledDataUrl(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("That file isn't an image. Take or pick a photo of your meal.");
  }
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error("That photo is too large to send. Try a closer, simpler shot.");
  }
  return dataUrl;
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch { /* fall through to the <img> path */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image couldn't be read. Try another photo."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function analyzeMealPhoto(apiKey, file) {
  const dataUrl = await toDownscaledDataUrl(file);
  const payload = await postResponses(apiKey, {
    model: MEAL_PHOTO_MODEL,
    input: [
      { role: "developer", content: [{ type: "input_text", text: INSTRUCTIONS }] },
      {
        role: "user",
        content: [
          { type: "input_text", text: "Identify the foods in this meal and estimate the nutrition of each." },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "meal_photo_items", strict: true, schema: SCHEMA } },
    max_output_tokens: 900,
  }, { timeoutMs: 30000, what: "photo analysis" });

  return sanitizeMealPhotoResult(parseJsonReply(payload, "meal estimate"));
}

// Never trust the model's numbers — clamp to the same ranges storage accepts.
export function sanitizeMealPhotoResult(value) {
  const raw = value && typeof value === "object" ? value : {};
  const items = Array.isArray(raw.items) ? raw.items.slice(0, 12) : [];
  return {
    note: text(raw.note, 240),
    items: items.map(sanitizeItem).filter(Boolean),
  };
}

function sanitizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const name = text(item.name, 80);
  if (!name) return null;
  // storage.js drops foods with no calories, so keep a floor of 1 to avoid an
  // item that appears to log and then vanishes on reload.
  const kcal = Math.max(1, Math.round(num(item.kcal, 0, 5000)));
  return {
    name,
    portion: text(item.portion, 60),
    kcal,
    p: Math.round(num(item.protein, 0, 500)),
    f: Math.round(num(item.fat, 0, 500)),
    c: Math.round(num(item.carbs, 0, 800)),
    confidence: ["high", "medium", "low"].includes(item.confidence) ? item.confidence : "low",
  };
}

function num(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function text(value, maxLen) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}
