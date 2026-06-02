// Schematic stick-figure SVG icons. 48x48 viewBox, renders at 40px.
// Use currentColor so they pick up the theme. End-of-rep position drawn.
// These are for quick recognition only — use the "Watch demo" link for real form.

const wrap = (inner) => `<svg class="ex-icon" viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

// Reusable bits
const bar = (x1, y, x2) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke-width="2.5"/><circle cx="${x1}" cy="${y}" r="2.8" fill="currentColor"/><circle cx="${x2}" cy="${y}" r="2.8" fill="currentColor"/>`;
const dumbbell = (cx, cy, horiz = true) => horiz
  ? `<line x1="${cx-5}" y1="${cy}" x2="${cx+5}" y2="${cy}" stroke-width="2.5"/><rect x="${cx-7}" y="${cy-3}" width="3" height="6" fill="currentColor"/><rect x="${cx+4}" y="${cy-3}" width="3" height="6" fill="currentColor"/>`
  : `<line x1="${cx}" y1="${cy-5}" x2="${cx}" y2="${cy+5}" stroke-width="2.5"/><rect x="${cx-3}" y="${cy-7}" width="6" height="3" fill="currentColor"/><rect x="${cx-3}" y="${cy+4}" width="6" height="3" fill="currentColor"/>`;
const head = (cx, cy, r = 3) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor"/>`;

export const ICONS = {
  "Barbell bench press": wrap(`
    <rect x="8" y="32" width="32" height="3" rx="1" fill="currentColor" opacity="0.4"/>
    ${head(10, 28)}
    <line x1="12" y1="30" x2="34" y2="30"/>
    <line x1="34" y1="30" x2="40" y2="38"/>
    <line x1="24" y1="30" x2="20" y2="18"/>
    <line x1="28" y1="30" x2="28" y2="18"/>
    ${bar(12, 17, 36)}
  `),

  "Dumbbell overhead press": wrap(`
    ${head(24, 12)}
    <line x1="24" y1="15" x2="24" y2="32"/>
    <line x1="24" y1="32" x2="19" y2="44"/>
    <line x1="24" y1="32" x2="29" y2="44"/>
    <line x1="24" y1="18" x2="14" y2="8"/>
    <line x1="24" y1="18" x2="34" y2="8"/>
    ${dumbbell(14, 7)}
    ${dumbbell(34, 7)}
  `),

  "Incline dumbbell press": wrap(`
    <line x1="6" y1="42" x2="38" y2="20" stroke-width="2" opacity="0.4"/>
    <line x1="38" y1="20" x2="38" y2="42" stroke-width="2" opacity="0.4"/>
    ${head(12, 32)}
    <line x1="14" y1="34" x2="32" y2="24"/>
    <line x1="22" y1="29" x2="14" y2="18"/>
    <line x1="26" y1="27" x2="26" y2="14"/>
    ${dumbbell(14, 17)}
    ${dumbbell(26, 13)}
  `),

  "Dumbbell lateral raise": wrap(`
    ${head(24, 10)}
    <line x1="24" y1="13" x2="24" y2="32"/>
    <line x1="24" y1="32" x2="20" y2="44"/>
    <line x1="24" y1="32" x2="28" y2="44"/>
    <line x1="24" y1="16" x2="8" y2="18"/>
    <line x1="24" y1="16" x2="40" y2="18"/>
    ${dumbbell(8, 18)}
    ${dumbbell(40, 18)}
  `),

  "Tricep pushdown (band)": wrap(`
    <line x1="24" y1="2" x2="24" y2="10" stroke-dasharray="2 2" opacity="0.6"/>
    ${head(24, 13)}
    <line x1="24" y1="16" x2="24" y2="32"/>
    <line x1="24" y1="32" x2="20" y2="44"/>
    <line x1="24" y1="32" x2="28" y2="44"/>
    <line x1="24" y1="18" x2="18" y2="26"/>
    <line x1="18" y1="26" x2="22" y2="34"/>
    <line x1="24" y1="18" x2="30" y2="26"/>
    <line x1="30" y1="26" x2="26" y2="34"/>
    <line x1="22" y1="34" x2="22" y2="40" stroke-width="3"/>
    <line x1="26" y1="34" x2="26" y2="40" stroke-width="3"/>
  `),

  "Hanging leg raise": wrap(`
    <line x1="6" y1="6" x2="42" y2="6" stroke-width="2.5"/>
    <line x1="24" y1="6" x2="24" y2="10"/>
    ${head(24, 13)}
    <line x1="24" y1="16" x2="24" y2="26"/>
    <line x1="24" y1="26" x2="38" y2="22"/>
    <line x1="38" y1="22" x2="40" y2="14"/>
  `),

  "Weighted plank (seconds)": wrap(`
    <line x1="6" y1="34" x2="42" y2="34" opacity="0.4"/>
    ${head(8, 28)}
    <line x1="10" y1="29" x2="38" y2="29"/>
    <line x1="14" y1="29" x2="14" y2="34"/>
    <line x1="34" y1="29" x2="38" y2="34"/>
    <rect x="20" y="22" width="14" height="6" rx="1" fill="currentColor" opacity="0.7"/>
    <text x="27" y="27" font-size="6" fill="white" text-anchor="middle" font-weight="bold">25</text>
  `),

  "Barbell row": wrap(`
    ${head(10, 14)}
    <line x1="12" y1="16" x2="34" y2="22"/>
    <line x1="34" y1="22" x2="38" y2="38"/>
    <line x1="20" y1="18" x2="14" y2="28"/>
    <line x1="14" y1="28" x2="14" y2="38"/>
    <line x1="26" y1="20" x2="22" y2="32"/>
    ${bar(8, 32, 36)}
  `),

  "Pull-up (band-assist ok)": wrap(`
    <line x1="4" y1="6" x2="44" y2="6" stroke-width="2.5"/>
    <line x1="18" y1="6" x2="18" y2="12"/>
    <line x1="30" y1="6" x2="30" y2="12"/>
    ${head(24, 16)}
    <line x1="24" y1="19" x2="24" y2="32"/>
    <line x1="18" y1="12" x2="22" y2="20"/>
    <line x1="30" y1="12" x2="26" y2="20"/>
    <line x1="24" y1="32" x2="20" y2="42"/>
    <line x1="24" y1="32" x2="28" y2="42"/>
  `),

  "Single-arm DB row": wrap(`
    <rect x="6" y="34" width="20" height="3" fill="currentColor" opacity="0.4"/>
    ${head(10, 20)}
    <line x1="12" y1="22" x2="30" y2="28"/>
    <line x1="30" y1="28" x2="38" y2="36"/>
    <line x1="14" y1="22" x2="14" y2="34"/>
    <line x1="22" y1="25" x2="22" y2="32"/>
    <line x1="24" y1="26" x2="34" y2="22"/>
    ${dumbbell(36, 22)}
  `),

  "Face pull (band)": wrap(`
    <line x1="44" y1="6" x2="44" y2="20" stroke-dasharray="2 2" opacity="0.6"/>
    ${head(14, 16)}
    <line x1="14" y1="19" x2="14" y2="34"/>
    <line x1="14" y1="34" x2="10" y2="44"/>
    <line x1="14" y1="34" x2="18" y2="44"/>
    <line x1="14" y1="22" x2="22" y2="18"/>
    <line x1="22" y1="18" x2="20" y2="12"/>
    <line x1="14" y1="22" x2="22" y2="22"/>
    <line x1="22" y1="22" x2="20" y2="16"/>
    <path d="M 20 14 Q 32 14 44 18" opacity="0.6"/>
  `),

  "Dumbbell bicep curl": wrap(`
    ${head(24, 8)}
    <line x1="24" y1="11" x2="24" y2="28"/>
    <line x1="24" y1="28" x2="20" y2="42"/>
    <line x1="24" y1="28" x2="28" y2="42"/>
    <line x1="20" y1="14" x2="14" y2="22"/>
    <line x1="14" y1="22" x2="18" y2="16"/>
    <line x1="28" y1="14" x2="34" y2="22"/>
    <line x1="34" y1="22" x2="30" y2="16"/>
    ${dumbbell(17, 14)}
    ${dumbbell(31, 14)}
  `),

  "Cable/band crunch": wrap(`
    <line x1="24" y1="2" x2="24" y2="10" stroke-dasharray="2 2" opacity="0.6"/>
    <rect x="14" y="38" width="20" height="4" rx="1" fill="currentColor" opacity="0.4"/>
    <line x1="20" y1="32" x2="20" y2="38"/>
    <line x1="28" y1="32" x2="28" y2="38"/>
    ${head(24, 22)}
    <path d="M 22 25 Q 18 32 22 38"/>
    <path d="M 26 25 Q 30 32 28 38"/>
    <line x1="22" y1="18" x2="24" y2="12"/>
    <line x1="26" y1="18" x2="24" y2="12"/>
  `),

  "Russian twist (w/ plate)": wrap(`
    <line x1="6" y1="40" x2="42" y2="40" opacity="0.4"/>
    ${head(20, 12)}
    <line x1="20" y1="15" x2="28" y2="30"/>
    <line x1="28" y1="30" x2="40" y2="34"/>
    <line x1="28" y1="30" x2="40" y2="38"/>
    <line x1="22" y1="18" x2="14" y2="22"/>
    <line x1="14" y1="22" x2="8" y2="18"/>
    <circle cx="8" cy="18" r="5" fill="none" stroke-width="2.5"/>
    <line x1="6" y1="18" x2="10" y2="18"/>
  `),

  "Barbell back squat": wrap(`
    ${head(24, 10)}
    ${bar(8, 14, 40)}
    <line x1="24" y1="13" x2="24" y2="26"/>
    <line x1="24" y1="26" x2="16" y2="32"/>
    <line x1="16" y1="32" x2="18" y2="44"/>
    <line x1="24" y1="26" x2="32" y2="32"/>
    <line x1="32" y1="32" x2="30" y2="44"/>
  `),

  "Romanian deadlift": wrap(`
    ${head(14, 12)}
    <line x1="16" y1="14" x2="34" y2="22"/>
    <line x1="34" y1="22" x2="38" y2="42"/>
    <line x1="26" y1="18" x2="22" y2="34"/>
    <line x1="22" y1="34" x2="22" y2="42"/>
    ${bar(6, 32, 36)}
    <line x1="22" y1="32" x2="22" y2="22" opacity="0.5"/>
  `),

  "Bulgarian split squat (DB)": wrap(`
    <rect x="32" y="32" width="14" height="3" fill="currentColor" opacity="0.4"/>
    ${head(16, 8)}
    <line x1="16" y1="11" x2="16" y2="26"/>
    <line x1="16" y1="26" x2="12" y2="36"/>
    <line x1="12" y1="36" x2="14" y2="44"/>
    <line x1="16" y1="26" x2="26" y2="30"/>
    <line x1="26" y1="30" x2="36" y2="32"/>
    <line x1="14" y1="14" x2="10" y2="24"/>
    <line x1="18" y1="14" x2="22" y2="24"/>
    ${dumbbell(10, 25, false)}
    ${dumbbell(22, 25, false)}
  `),

  "Standing calf raise": wrap(`
    ${head(24, 8)}
    <line x1="24" y1="11" x2="24" y2="30"/>
    <line x1="24" y1="30" x2="20" y2="40"/>
    <line x1="24" y1="30" x2="28" y2="40"/>
    <line x1="22" y1="14" x2="18" y2="22"/>
    <line x1="26" y1="14" x2="30" y2="22"/>
    <line x1="16" y1="40" x2="22" y2="40"/>
    <line x1="26" y1="40" x2="32" y2="40"/>
    <line x1="8" y1="44" x2="40" y2="44" opacity="0.4"/>
    <path d="M 14 44 L 20 40 M 28 40 L 34 44" opacity="0.4"/>
  `),

  "Plank (seconds)": wrap(`
    <line x1="6" y1="34" x2="42" y2="34" opacity="0.4"/>
    ${head(8, 28)}
    <line x1="10" y1="29" x2="38" y2="29"/>
    <line x1="14" y1="29" x2="14" y2="34"/>
    <line x1="34" y1="29" x2="38" y2="34"/>
  `),
};

// Generic per-category fallbacks for generated exercises without a bespoke icon.
const CATEGORY_ICONS = {
  push: wrap(`
    ${head(24, 12)}
    <line x1="24" y1="15" x2="24" y2="30"/>
    <line x1="24" y1="30" x2="19" y2="42"/>
    <line x1="24" y1="30" x2="29" y2="42"/>
    <line x1="24" y1="18" x2="15" y2="9"/>
    <line x1="24" y1="18" x2="33" y2="9"/>
    <line x1="10" y1="9" x2="18" y2="9" stroke-width="3"/>
    <line x1="30" y1="9" x2="38" y2="9" stroke-width="3"/>
  `),
  pull: wrap(`
    ${head(12, 14)}
    <line x1="14" y1="16" x2="34" y2="22"/>
    <line x1="34" y1="22" x2="38" y2="38"/>
    <line x1="20" y1="18" x2="16" y2="30"/>
    <line x1="16" y1="30" x2="16" y2="40"/>
    <line x1="26" y1="20" x2="24" y2="30"/>
    ${bar(10, 32, 36)}
  `),
  legs: wrap(`
    ${head(24, 10)}
    ${bar(12, 16, 36)}
    <line x1="24" y1="13" x2="24" y2="26"/>
    <line x1="24" y1="26" x2="16" y2="32"/>
    <line x1="16" y1="32" x2="18" y2="44"/>
    <line x1="24" y1="26" x2="32" y2="32"/>
    <line x1="32" y1="32" x2="30" y2="44"/>
  `),
  core: wrap(`
    <line x1="6" y1="34" x2="42" y2="34" opacity="0.4"/>
    ${head(8, 28)}
    <line x1="10" y1="29" x2="38" y2="29"/>
    <line x1="14" y1="29" x2="14" y2="34"/>
    <line x1="34" y1="29" x2="38" y2="34"/>
  `),
  cardio: wrap(`
    ${head(28, 10)}
    <line x1="28" y1="13" x2="22" y2="26"/>
    <line x1="22" y1="26" x2="12" y2="30"/>
    <line x1="22" y1="26" x2="30" y2="36"/>
    <line x1="30" y1="36" x2="26" y2="44"/>
    <line x1="26" y1="16" x2="34" y2="20"/>
    <line x1="26" y1="16" x2="18" y2="13"/>
  `),
};

export function iconFor(name, category) {
  return ICONS[name] || CATEGORY_ICONS[category] || "";
}

export function demoLink(name) {
  const q = encodeURIComponent(name.replace(/\(.*?\)/g, "").trim() + " proper form");
  return `https://www.youtube.com/results?search_query=${q}`;
}
