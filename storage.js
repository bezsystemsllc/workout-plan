const KEY = "cut-to-abs:v1";

const DEFAULT_STATE = {
  workouts: {},
  meals: {},
  progress: [],
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

function readAll() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? mergeDefaults(JSON.parse(raw)) : structuredClone(DEFAULT_STATE);
  } catch (e) {
    console.warn("storage read failed", e);
    cache = structuredClone(DEFAULT_STATE);
  }
  return cache;
}

// One-level deep merge so adding new settings.* keys doesn't break old saves.
function mergeDefaults(saved) {
  const out = structuredClone(DEFAULT_STATE);
  for (const k of Object.keys(saved)) {
    const sv = saved[k];
    if (sv && typeof sv === "object" && !Array.isArray(sv) && out[k] && typeof out[k] === "object") {
      out[k] = { ...out[k], ...sv };
    } else {
      out[k] = sv;
    }
  }
  return out;
}

function writeAll() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn("storage write failed (quota?)", e);
    // Lazy import to avoid pulling UI layer into storage's module graph at boot
    import("./lib/modal.js").then(({ toast }) =>
      toast("Couldn't save — storage may be full. Export and clear photos.")
    );
  }
}

export function load(section) {
  return readAll()[section];
}

export function save(section, value) {
  readAll();
  cache[section] = value;
  writeAll();
}

export function update(section, mutator) {
  readAll();
  const next = mutator(cache[section]);
  if (next !== undefined) cache[section] = next;
  writeAll();
}

export function exportJSON() {
  return JSON.stringify(readAll(), null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Backup must be a JSON object.");
  }
  const expected = ["workouts", "meals", "progress", "settings"];
  const hasAny = expected.some(k => k in parsed);
  if (!hasAny) {
    throw new Error("File doesn't look like a Tempo backup (missing workouts/meals/progress/settings).");
  }
  cache = mergeDefaults(parsed);
  writeAll();
}

export function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export function weekdayKey(date = new Date()) {
  return ["sun","mon","tue","wed","thu","fri","sat"][date.getDay()];
}
