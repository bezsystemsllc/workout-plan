import { FOODS } from "./data/foods.js";
import { isUsdaMatch } from "./lib/usda-foods.js";

const KEY = "cut-to-abs:v1";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const TOP_LEVEL_KEYS = new Set(["workouts", "meals", "progress", "savedFoods", "dismissed", "adaptLog", "settings"]);
const SECTION_KEYS = Object.fromEntries([...TOP_LEVEL_KEYS].map((section) => [section, `${KEY}:${section}`]));
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const DEFAULT_STATE = {
  workouts: {},
  meals: {},
  progress: [],
  // Reusable user-entered foods ("My Foods" pantry) — quick-add templates.
  savedFoods: [],
  // suggestionId -> ISO timestamp when dismissed. Keep tiny.
  dismissed: {},
  // Adaptation audit log: { ts, kind, summary, before, after }
  adaptLog: [],
  settings: {
    // profile is null until onboarding completes. Then app derives targets from it.
    profile: null,
    units: "imperial",          // "imperial" | "metric"
    targets: { kcal: 2100, p: 160, f: 65, c: 200 },
    targetWeightLb: 148,
    baselineKcal: 2100,         // for meal portion scaling
  },
};

let cache = null;
let sectionSerialized = {};
let monolithicFallbackActive = false;

function readAll() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    monolithicFallbackActive = !!raw;
    cache = raw ? normalizeState(JSON.parse(raw)) : structuredClone(DEFAULT_STATE);
    for (const section of TOP_LEVEL_KEYS) {
      const rawSection = localStorage.getItem(SECTION_KEYS[section]);
      if (!rawSection) continue;
      try {
        cache[section] = normalizeSection(section, JSON.parse(rawSection));
      } catch (e) {
        console.warn(`storage section ignored: ${section}`, e);
        // Stash the unreadable section so a later write can't destroy it.
        try { localStorage.setItem(`${SECTION_KEYS[section]}:recovery`, rawSection); } catch { /* best effort */ }
      }
    }
    rememberSerializedSections();
    if (raw) writeAll();
  } catch (e) {
    console.warn("storage read failed", e);
    // Stash the unreadable blob so a later write doesn't destroy it permanently.
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) localStorage.setItem(`${KEY}:recovery`, raw);
    } catch { /* best effort */ }
    cache = structuredClone(DEFAULT_STATE);
    sectionSerialized = {};
    monolithicFallbackActive = false;
  }
  return cache;
}

// Another tab writing our keys invalidates this tab's in-memory cache, so a
// later write here can't clobber the other tab's newer data wholesale.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === KEY || e.key.startsWith(`${KEY}:`)) {
      cache = null;
      sectionSerialized = {};
    }
  });
}

function normalizeState(saved, { strict = false } = {}) {
  assertPlainObject(saved, "Backup", strict);
  const out = structuredClone(DEFAULT_STATE);
  if (!isPlainObject(saved)) return out;

  if (strict) {
    const unknown = Object.keys(saved).filter(k => !TOP_LEVEL_KEYS.has(k));
    if (unknown.length) throw new Error(`Backup contains unsupported section: ${unknown[0]}.`);
  }

  if ("workouts" in saved) out.workouts = normalizeWorkoutLog(saved.workouts, strict);
  if ("meals" in saved) out.meals = normalizeMeals(saved.meals, strict);
  if ("progress" in saved) out.progress = normalizeProgress(saved.progress, strict);
  if ("savedFoods" in saved) out.savedFoods = normalizeFoodList(saved.savedFoods, strict);
  if ("dismissed" in saved) out.dismissed = normalizeStringMap(saved.dismissed, strict);
  if ("adaptLog" in saved) out.adaptLog = normalizeAdaptLog(saved.adaptLog, strict);
  if ("settings" in saved) out.settings = normalizeSettings(saved.settings, strict);
  return out;
}

function normalizeSection(section, value, strict = false) {
  if (section === "workouts") return normalizeWorkoutLog(value, strict);
  if (section === "meals") return normalizeMeals(value, strict);
  if (section === "progress") return normalizeProgress(value, strict);
  if (section === "savedFoods") return normalizeFoodList(value, strict);
  if (section === "dismissed") return normalizeStringMap(value, strict);
  if (section === "adaptLog") return normalizeAdaptLog(value, strict);
  if (section === "settings") return normalizeSettings(value, strict);
  if (strict) throw new Error(`Unsupported section: ${section}.`);
  return value;
}

function normalizeWorkoutLog(value, strict) {
  assertPlainObject(value, "workouts", strict);
  if (!isPlainObject(value)) return {};
  const out = {};
  for (const [date, session] of Object.entries(value)) {
    if (!isISODate(date) || !isPlainObject(session)) {
      if (strict) throw new Error(`Invalid workout entry for ${date}.`);
      continue;
    }
    const exercises = normalizeLoggedExercises(session.exercises, strict);
    if (!exercises.length) continue;
    out[date] = { day: safeString(session.day, 40, "full"), exercises };
  }
  return out;
}

function normalizeLoggedExercises(value, strict) {
  assertArray(value, "workout exercises", strict);
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((ex) => {
    if (!isPlainObject(ex)) {
      if (strict) throw new Error("Invalid workout exercise.");
      return null;
    }
    const sets = normalizeSets(ex.sets, strict);
    if (!sets.length) return null;
    return {
      name: safeString(ex.name, 120, "Exercise"),
      category: safeString(ex.category, 30, ""),
      sets,
    };
  }).filter(Boolean);
}

function normalizeSets(value, strict) {
  assertArray(value, "exercise sets", strict);
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((set) => {
    if (!isPlainObject(set)) {
      if (strict) throw new Error("Invalid set entry.");
      return null;
    }
    return { w: safeLoadText(set.w), r: safeNumberText(set.r) };
  }).filter(Boolean);
}

function normalizeMeals(value, strict) {
  assertPlainObject(value, "meals", strict);
  if (!isPlainObject(value)) return {};
  const out = {};
  for (const [date, entry] of Object.entries(value)) {
    if (!isISODate(date) || !isPlainObject(entry)) {
      if (strict) throw new Error(`Invalid meal entry for ${date}.`);
      continue;
    }
    out[date] = {
      checked: normalizeStringArray(entry.checked, 80, 60),
      custom: normalizeFoodList(entry.custom, strict),
      waterMl: clampNumber(entry.waterMl, 0, 20000, 0),
    };
  }
  return out;
}

function normalizeFoodList(value, strict) {
  assertArray(value, "food list", strict);
  if (!Array.isArray(value)) return [];
  return value.slice(0, 300).map((food) => {
    if (!isPlainObject(food)) {
      if (strict) throw new Error("Invalid food entry.");
      return null;
    }
    return normalizeFood(food);
  }).filter(Boolean);
}

function normalizeFood(food) {
  const name = safeString(food.name, 120, "").trim();
  const kcal = clampNumber(food.kcal, 0, 10000, 0);
  if (!name || !kcal) return null;
  return {
    name,
    kcal: Math.round(kcal),
    p: Math.round(clampNumber(food.p, 0, 1000, 0)),
    f: Math.round(clampNumber(food.f, 0, 1000, 0)),
    c: Math.round(clampNumber(food.c, 0, 1000, 0)),
  };
}

function normalizeProgress(value, strict) {
  assertArray(value, "progress", strict);
  if (!Array.isArray(value)) return [];
  return value.slice(0, 2000).map((entry) => {
    if (!isPlainObject(entry) || !isISODate(entry.date)) {
      if (strict) throw new Error("Invalid progress entry.");
      return null;
    }
    return {
      date: entry.date,
      weightLb: nullableNumber(entry.weightLb, 50, 800),
      waistIn: nullableNumber(entry.waistIn, 10, 100),
    };
  }).filter(Boolean);
}

function normalizeStringMap(value, strict) {
  assertPlainObject(value, "string map", strict);
  if (!isPlainObject(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof k !== "string") continue;
    out[safeString(k, 120)] = safeString(v, 80);
  }
  return out;
}

function normalizeAdaptLog(value, strict) {
  assertArray(value, "adaptation log", strict);
  if (!Array.isArray(value)) return [];
  return value.slice(-50).map((entry) => {
    if (!isPlainObject(entry)) {
      if (strict) throw new Error("Invalid adaptation log entry.");
      return null;
    }
    return {
      ts: safeString(entry.ts, 80),
      kind: safeString(entry.kind, 60),
      summary: safeString(entry.summary, 400),
      before: isPlainObject(entry.before) ? entry.before : {},
      after: isPlainObject(entry.after) ? entry.after : {},
    };
  }).filter(Boolean);
}

function normalizeSettings(value, strict) {
  assertPlainObject(value, "settings", strict);
  if (!isPlainObject(value)) return structuredClone(DEFAULT_STATE.settings);
  const out = structuredClone(DEFAULT_STATE.settings);
  out.units = value.units === "metric" ? "metric" : "imperial";
  out.profile = normalizeProfile(value.profile, strict);
  out.targets = normalizeTargets(value.targets);
  out.targetWeightLb = clampNumber(value.targetWeightLb, 50, 800, DEFAULT_STATE.settings.targetWeightLb);
  out.baselineKcal = clampNumber(value.baselineKcal, 500, 10000, DEFAULT_STATE.settings.baselineKcal);

  if (isPlainObject(value.trainingPrefs)) {
    out.trainingPrefs = {
      daysPerWeek: Math.round(clampNumber(value.trainingPrefs.daysPerWeek, 2, 6, 3)),
      style: ["full", "ul", "ppl"].includes(value.trainingPrefs.style) ? value.trainingPrefs.style : "ppl",
      experience: ["beginner", "intermediate", "advanced"].includes(value.trainingPrefs.experience) ? value.trainingPrefs.experience : "intermediate",
      equipment: normalizeStringArray(value.trainingPrefs.equipment, 30, 40),
      ...(["presets", "custom"].includes(value.trainingPrefs.equipmentMode)
        ? { equipmentMode: value.trainingPrefs.equipmentMode } : {}),
      ...(Array.isArray(value.trainingPrefs.customEquipment)
        ? { customEquipment: normalizeStringArray(value.trainingPrefs.customEquipment, 30, 40) } : {}),
    };
  }
  if (isPlainObject(value.foodPrefs)) {
    out.foodPrefs = {
      diet: ["omnivore", "vegetarian", "pescatarian", "vegan"].includes(value.foodPrefs.diet) ? value.foodPrefs.diet : "omnivore",
      proteins: normalizeStringArray(value.foodPrefs.proteins, 20, 40),
      carbs: normalizeStringArray(value.foodPrefs.carbs, 20, 40),
      preferredFoods: normalizeStringArray(value.foodPrefs.preferredFoods, 60, 40),
      avoid: normalizeStringArray(value.foodPrefs.avoid, 20, 40),
      usdaFoods: FOODS.flatMap(food => {
        const item = Array.isArray(value.foodPrefs.usdaFoods)
          ? value.foodPrefs.usdaFoods.find(entry => entry?.foodId === food.id)
          : null;
        if (!isUsdaMatch(item, food)) return [];
        const { fdcId, name, kcal, p, f, c } = item;
        return [{ foodId: food.id, fdcId, name: name.slice(0, 80), kcal, p, f, c }];
      }),
      seed: Math.round(clampNumber(value.foodPrefs.seed, 0, 1000000, 0)),
    };
  }
  if (isPlainObject(value.plan)) out.plan = normalizePlan(value.plan, strict);
  return out;
}

function normalizeProfile(value, strict) {
  if (value == null) return null;
  assertPlainObject(value, "profile", strict);
  if (!isPlainObject(value)) return null;
  return {
    weightKg: clampNumber(value.weightKg, 30, 250, 71.7),
    heightCm: clampNumber(value.heightCm, 120, 230, 170.2),
    age: Math.round(clampNumber(value.age, 13, 100, 30)),
    sex: value.sex === "female" ? "female" : "male",
    activity: ["sedentary", "light", "moderate", "very", "athlete"].includes(value.activity) ? value.activity : "moderate",
    goal: ["fat_loss", "recomp", "muscle", "maintain"].includes(value.goal) ? value.goal : "fat_loss",
    wakeTime: safeTime(value.wakeTime, "06:30"),
    sleepTime: safeTime(value.sleepTime, "22:30"),
  };
}

function normalizeTargets(value) {
  if (!isPlainObject(value)) return { ...DEFAULT_STATE.settings.targets };
  const out = {
    kcal: Math.round(clampNumber(value.kcal, 500, 10000, DEFAULT_STATE.settings.targets.kcal)),
    p: Math.round(clampNumber(value.p, 0, 1000, DEFAULT_STATE.settings.targets.p)),
    f: Math.round(clampNumber(value.f, 0, 1000, DEFAULT_STATE.settings.targets.f)),
    c: Math.round(clampNumber(value.c, 0, 2000, DEFAULT_STATE.settings.targets.c)),
  };
  if (Number.isFinite(+value.maintenance)) out.maintenance = Math.round(clampNumber(value.maintenance, 500, 10000, value.maintenance));
  return out;
}

function normalizePlan(value, strict) {
  assertPlainObject(value.workouts, "plan workouts", strict);
  assertPlainObject(value.splits, "plan splits", strict);
  const workouts = {};
  if (isPlainObject(value.workouts)) {
    for (const [day, list] of Object.entries(value.workouts)) {
      if (!Array.isArray(list)) {
        if (strict) throw new Error(`Invalid workout template for ${day}.`);
        continue;
      }
      workouts[safeString(day, 40)] = list.slice(0, 40).map(normalizePlanExercise).filter(Boolean);
    }
  }
  const splits = {};
  if (isPlainObject(value.splits)) {
    for (const [day, split] of Object.entries(value.splits)) {
      if (!isPlainObject(split)) {
        if (strict) throw new Error(`Invalid split for ${day}.`);
        continue;
      }
      splits[safeString(day, 10)] = {
        type: ["lift", "cardio", "soccer", "rest"].includes(split.type) ? split.type : "rest",
        day: safeString(split.day, 40, ""),
        label: safeString(split.label, 120, "Rest"),
        detail: safeString(split.detail, 240, ""),
        cardioId: safeString(split.cardioId, 60, ""),
      };
    }
  }
  for (const wd of WEEKDAYS) {
    if (!splits[wd]) splits[wd] = { type: "rest", day: "", label: "Rest", detail: "", cardioId: "" };
  }
  return {
    splits,
    workouts,
    meta: normalizePlanMeta(value.meta),
  };
}

function normalizePlanMeta(value) {
  if (!isPlainObject(value)) return {};
  const out = {
    style: safeString(value.style, 20, ""),
    daysPerWeek: Math.round(clampNumber(value.daysPerWeek, 2, 6, 3)),
    experience: safeString(value.experience, 30, ""),
    equipment: normalizeStringArray(value.equipment, 30, 40),
    goal: safeString(value.goal, 30, ""),
    seed: Math.round(clampNumber(value.seed, 0, 1000000, 0)),
    generatedAt: safeString(value.generatedAt, 80, ""),
  };
  if (value.fallback === true) out.fallback = true;
  return out;
}

function normalizePlanExercise(ex) {
  if (!isPlainObject(ex)) return null;
  const name = safeString(ex.name, 120, "").trim();
  if (!name) return null;
  return {
    id: safeString(ex.id, 80, ""),
    name,
    category: safeString(ex.category, 30, ""),
    pattern: safeString(ex.pattern, 60, ""),
    equip: normalizeStringArray(ex.equip, 20, 40),
    prog: ["weight", "reps", "time"].includes(ex.prog) ? ex.prog : "weight",
    inc: clampNumber(ex.inc, 0, 100, 5),
    compound: !!ex.compound,
    sets: Math.round(clampNumber(ex.sets, 1, 20, 3)),
    reps: safeString(ex.reps, 40, "8-12"),
    rest: Math.round(clampNumber(ex.rest, 0, 900, 90)),
  };
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertPlainObject(value, label, strict) {
  if (strict && !isPlainObject(value)) throw new Error(`${label} must be an object.`);
}

function assertArray(value, label, strict) {
  if (strict && !Array.isArray(value)) throw new Error(`${label} must be an array.`);
}

function safeString(value, max = 200, fallback = "") {
  if (value == null) return fallback;
  return String(value).slice(0, max);
}

function safeTime(value, fallback) {
  const v = safeString(value, 5, fallback);
  return TIME_RE.test(v) ? v : fallback;
}

function safeNumberText(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? String(value).slice(0, 20) : "";
}

function safeLoadText(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return String(value).slice(0, 20);
  // Keep free-text loads ("light band", accented words) intact — views escape
  // on render; only strip markup-relevant and control characters here.
  return String(value).replace(/[<>&"'\u0000-\u001f]/g, "").trim().slice(0, 40);
}

function normalizeStringArray(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => safeString(v, maxLen).trim()).filter(Boolean))].slice(0, maxItems);
}

function nullableNumber(value, min, max) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isISODate(value) {
  if (!ISO_DATE_RE.test(value)) return false;
  // Round-trip entirely in UTC — a local-time parse breaks for UTC+13/+14
  // (Auckland DST, Tonga, Kiritimati) and silently drops every dated entry.
  const d = new Date(value + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function looksLikeBackup(parsed) {
  return ["workouts", "meals", "progress", "settings"].some(k => k in parsed);
}

function ensureBackupShape(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Backup must be a JSON object.");
  }
  if (!looksLikeBackup(parsed)) {
    throw new Error("File doesn't look like a Tempo backup (missing workouts/meals/progress/settings).");
  }
  const unknown = Object.keys(parsed).filter(k => !TOP_LEVEL_KEYS.has(k));
  if (unknown.length) {
    throw new Error(`Backup contains unsupported section: ${unknown[0]}.`);
  }
}

function rememberSerializedSections() {
  sectionSerialized = {};
  for (const section of TOP_LEVEL_KEYS) {
    sectionSerialized[section] = JSON.stringify(cache[section]);
  }
}

function reportWriteFailure(e) {
  console.warn("storage write failed (quota?)", e);
  // Lazy import to avoid pulling UI layer into storage's module graph at boot
  import("./lib/modal.js").then(({ toast }) =>
    toast("Couldn't save — storage may be full. Export and clear photos.")
  );
}

function writeSection(section) {
  if (!TOP_LEVEL_KEYS.has(section)) {
    writeAll();
    return;
  }
  try {
    const serialized = JSON.stringify(cache[section]);
    if (sectionSerialized[section] === serialized) return;
    localStorage.setItem(SECTION_KEYS[section], serialized);
    sectionSerialized[section] = serialized;
    if (monolithicFallbackActive) writeAll();
    else localStorage.removeItem(KEY);
  } catch (e) {
    reportWriteFailure(e);
  }
}

function writeAll() {
  try {
    for (const section of TOP_LEVEL_KEYS) {
      const serialized = JSON.stringify(cache[section]);
      localStorage.setItem(SECTION_KEYS[section], serialized);
      sectionSerialized[section] = serialized;
    }
    localStorage.removeItem(KEY);
    monolithicFallbackActive = false;
  } catch (e) {
    reportWriteFailure(e);
  }
}

export function load(section) {
  return readAll()[section];
}

export function save(section, value) {
  readAll();
  cache[section] = value;
  writeSection(section);
}

export function update(section, mutator) {
  readAll();
  const next = mutator(cache[section]);
  if (next !== undefined) cache[section] = next;
  writeSection(section);
}

export function exportJSON() {
  return JSON.stringify(readAll(), null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  ensureBackupShape(parsed);
  readAll(); // make sure the pre-import state is loaded so we can roll back
  const next = normalizeState(parsed, { strict: true });
  const serialized = {};
  for (const section of TOP_LEVEL_KEYS) serialized[section] = JSON.stringify(next[section]);
  const previous = { ...sectionSerialized };
  try {
    for (const section of TOP_LEVEL_KEYS) localStorage.setItem(SECTION_KEYS[section], serialized[section]);
    localStorage.removeItem(KEY);
  } catch (e) {
    // Roll back any sections already written so storage isn't half old, half new.
    try {
      for (const section of TOP_LEVEL_KEYS) {
        if (previous[section] != null) localStorage.setItem(SECTION_KEYS[section], previous[section]);
      }
    } catch { /* rollback is best-effort */ }
    throw new Error("Couldn't save the imported backup — storage may be full. Your existing data was kept.");
  }
  cache = next;
  sectionSerialized = serialized;
  monolithicFallbackActive = false;
}

// The user's own OpenAI key is deliberately NOT part of the managed state:
// readAll()/exportJSON() never see it, so a backup file can be shared without
// leaking it. It stays in this browser profile on this device.
const API_KEY_STORAGE = `${KEY}:openai-key`;

export function loadApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function saveApiKey(value) {
  const key = String(value || "").trim();
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key);
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch (e) {
    reportWriteFailure(e);
  }
}

export function clearStorage() {
  cache = null;
  sectionSerialized = {};
  monolithicFallbackActive = false;
  localStorage.removeItem(KEY);
  localStorage.removeItem(`${KEY}:recovery`);
  localStorage.removeItem(API_KEY_STORAGE);
  for (const key of Object.values(SECTION_KEYS)) {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}:recovery`);
  }
}

export function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export function weekdayKey(date = new Date()) {
  return ["sun","mon","tue","wed","thu","fri","sat"][date.getDay()];
}
