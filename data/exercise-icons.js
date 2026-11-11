// Dynamic, animated SVG exercise illustrations.
// 48x48 viewBox with:
//   - Category color coding (data-cat="push|pull|legs|core|cardio")
//   - Clear equipment geometry (barbell plates, dumbbells, kettlebells, cables, bands, benches, machines)
//   - Target muscle highlight + directional motion guides
//   - Smooth CSS keyframe rep animations (.ex-anim-*) so the movement pattern is immediately obvious.

const wrap = (cat, inner) =>
  `<svg class="ex-icon ex-cat-${cat}" data-cat="${cat}" viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

// ── Reusable SVG primitives ──────────────────────────────────────────────────
const head = (cx, cy, r = 3.2) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;

const muscle = (cx, cy, r = 3.5) =>
  `<circle class="ex-muscle-glow" cx="${cx}" cy="${cy}" r="${r}" fill="var(--ex-hi, currentColor)" opacity="0.35" stroke="none"/>`;

const floor = (y = 43) =>
  `<line x1="5" y1="${y}" x2="43" y2="${y}" stroke-width="1.5" opacity="0.28"/>`;

const benchFlat = (x = 8, y = 33, w = 28) => `
  <rect x="${x}" y="${y}" width="${w}" height="3" rx="1.5" fill="currentColor" opacity="0.38" stroke="none"/>
  <line x1="${x + 4}" y1="${y + 3}" x2="${x + 4}" y2="43" stroke-width="1.8" opacity="0.38"/>
  <line x1="${x + w - 4}" y1="${y + 3}" x2="${x + w - 4}" y2="43" stroke-width="1.8" opacity="0.38"/>
`;

const bar = (x1, y, x2) => `
  <line x1="${x1 - 2}" y1="${y}" x2="${x2 + 2}" y2="${y}" stroke-width="2.2"/>
  <rect x="${x1 - 1}" y="${y - 4.5}" width="2.8" height="9" rx="1" fill="currentColor" stroke="none"/>
  <rect x="${x1 + 2.2}" y="${y - 3.2}" width="2" height="6.4" rx="0.8" fill="currentColor" opacity="0.75" stroke="none"/>
  <rect x="${x2 - 1.8}" y="${y - 4.5}" width="2.8" height="9" rx="1" fill="currentColor" stroke="none"/>
  <rect x="${x2 - 4.2}" y="${y - 3.2}" width="2" height="6.4" rx="0.8" fill="currentColor" opacity="0.75" stroke="none"/>
`;

const plateSide = (cx, cy, r = 5.5) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" opacity="0.22"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" stroke-width="2.2"/>
  <circle cx="${cx}" cy="${cy}" r="1.6" fill="currentColor" stroke="none"/>
`;

const dumbbell = (cx, cy, horiz = true) => horiz
  ? `<line x1="${cx - 4.5}" y1="${cy}" x2="${cx + 4.5}" y2="${cy}" stroke-width="2.2"/>
     <rect x="${cx - 6.5}" y="${cy - 3}" width="2.6" height="6" rx="0.8" fill="currentColor" stroke="none"/>
     <rect x="${cx + 3.9}" y="${cy - 3}" width="2.6" height="6" rx="0.8" fill="currentColor" stroke="none"/>`
  : `<line x1="${cx}" y1="${cy - 4.5}" x2="${cx}" y2="${cy + 4.5}" stroke-width="2.2"/>
     <rect x="${cx - 3}" y="${cy - 6.5}" width="6" height="2.6" rx="0.8" fill="currentColor" stroke="none"/>
     <rect x="${cx - 3}" y="${cy + 3.9}" width="6" height="2.6" rx="0.8" fill="currentColor" stroke="none"/>`;

const kettlebell = (cx, cy, scale = 1) => `
  <g transform="translate(${cx},${cy}) scale(${scale})">
    <path d="M -2.4 -2.2 C -2.4 -5.2 2.4 -5.2 2.4 -2.2" stroke-width="1.8" fill="none"/>
    <circle cx="0" cy="1.5" r="4" fill="currentColor" stroke="none"/>
  </g>
`;

const arrowUp = (x, y1, y2) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke-width="1.4" stroke-dasharray="2 2" opacity="0.55"/>
  <polyline points="${x - 2.2},${y2 + 2.5} ${x},${y2} ${x + 2.2},${y2 + 2.5}" stroke-width="1.4" opacity="0.7"/>
`;

const arrowDown = (x, y1, y2) => `
  <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke-width="1.4" stroke-dasharray="2 2" opacity="0.55"/>
  <polyline points="${x - 2.2},${y2 - 2.5} ${x},${y2} ${x + 2.2},${y2 - 2.5}" stroke-width="1.4" opacity="0.7"/>
`;

// ── Pattern & Exercise Specific Builders ─────────────────────────────────────

const ICON_BUILDERS = {
  // ── PUSH: Horizontal Press ─────────────────────────────────────────────────
  "Barbell bench press": () => wrap("push", `
    ${floor()}
    ${benchFlat(6, 33, 28)}
    <line x1="12" y1="12" x2="12" y2="33" stroke-width="1.6" opacity="0.3"/>
    ${head(10, 28.5)}
    ${muscle(20, 28, 4)}
    <line x1="13" y1="30" x2="31" y2="30" stroke-width="2.6"/>
    <line x1="31" y1="30" x2="37" y2="36"/>
    <line x1="37" y1="36" x2="37" y2="43"/>
    ${arrowUp(41, 24, 13)}
    <g class="ex-anim-press-v">
      <line x1="20" y1="29" x2="19" y2="16"/>
      <line x1="24" y1="29" x2="25" y2="16"/>
      ${plateSide(22, 15, 5.2)}
    </g>
  `),

  "Dumbbell bench press": () => wrap("push", `
    ${floor()}
    ${benchFlat(6, 33, 28)}
    ${head(10, 28.5)}
    ${muscle(20, 28, 4)}
    <line x1="13" y1="30" x2="31" y2="30" stroke-width="2.6"/>
    <line x1="31" y1="30" x2="37" y2="36"/>
    <line x1="37" y1="36" x2="37" y2="43"/>
    ${arrowUp(41, 24, 13)}
    <g class="ex-anim-press-v">
      <line x1="19" y1="29" x2="17" y2="17"/>
      <line x1="25" y1="29" x2="27" y2="17"/>
      ${dumbbell(17, 16)}
      ${dumbbell(27, 16)}
    </g>
  `),

  "Dumbbell floor press": () => wrap("push", `
    ${floor(38)}
    ${head(9, 34)}
    ${muscle(19, 33, 3.8)}
    <line x1="12" y1="35" x2="29" y2="35" stroke-width="2.6"/>
    <line x1="29" y1="35" x2="35" y2="27"/>
    <line x1="35" y1="27" x2="41" y2="38"/>
    ${arrowUp(20, 25, 15)}
    <g class="ex-anim-press-v">
      <line x1="18" y1="35" x2="18" y2="21"/>
      <line x1="23" y1="35" x2="23" y2="21"/>
      ${dumbbell(18, 20)}
      ${dumbbell(25, 20)}
    </g>
  `),

  "Band chest press": () => wrap("push", `
    ${floor()}
    <line x1="6" y1="8" x2="6" y2="43" stroke-width="2.5" opacity="0.45"/>
    ${head(22, 12)}
    ${muscle(24, 19, 3.8)}
    <line x1="22" y1="15" x2="20" y2="30" stroke-width="2.4"/>
    <line x1="20" y1="30" x2="15" y2="43"/>
    <line x1="20" y1="30" x2="27" y2="43"/>
    <g class="ex-anim-shift-r">
      <line x1="6" y1="19" x2="36" y2="19" stroke-dasharray="2.5 2" opacity="0.65"/>
      <line x1="22" y1="18" x2="36" y2="19" stroke-width="2.2"/>
      <circle cx="37" cy="19" r="2" fill="currentColor"/>
    </g>
  `),

  "Push-up": () => wrap("push", `
    ${floor(39)}
    <g class="ex-anim-pushup">
      ${head(38, 21)}
      ${muscle(31, 24, 3.8)}
      <line x1="35" y1="23" x2="10" y2="35" stroke-width="2.6"/>
      <line x1="32" y1="25" x2="32" y2="39" stroke-width="2.2"/>
      <line x1="10" y1="35" x2="9" y2="39" stroke-width="2"/>
    </g>
    ${arrowUp(38, 16, 9)}
  `),

  "Machine chest press": () => wrap("push", `
    ${floor()}
    <line x1="12" y1="10" x2="12" y2="43" stroke-width="2.5" opacity="0.4"/>
    <line x1="12" y1="30" x2="22" y2="30" stroke-width="2.5" opacity="0.4"/>
    ${head(17, 14)}
    ${muscle(20, 21, 3.8)}
    <line x1="17" y1="17" x2="17" y2="30" stroke-width="2.5"/>
    <line x1="17" y1="30" x2="25" y2="33"/>
    <line x1="25" y1="33" x2="25" y2="43"/>
    <g class="ex-anim-shift-r">
      <line x1="18" y1="21" x2="33" y2="21" stroke-width="2.3"/>
      <line x1="33" y1="11" x2="33" y2="32" stroke-width="2.5" opacity="0.75"/>
      <rect x="31" y="19" width="4" height="5" rx="1" fill="currentColor"/>
    </g>
  `),

  // ── PUSH: Incline Press ────────────────────────────────────────────────────
  "Incline dumbbell press": () => wrap("push", `
    ${floor()}
    <line x1="8" y1="39" x2="28" y2="21" stroke-width="3" opacity="0.38"/>
    <line x1="18" y1="30" x2="18" y2="43" stroke-width="1.8" opacity="0.38"/>
    ${head(25, 18)}
    ${muscle(21, 24, 3.8)}
    <line x1="23" y1="21" x2="14" y2="31" stroke-width="2.5"/>
    <line x1="14" y1="31" x2="22" y2="34"/>
    <line x1="22" y1="34" x2="24" y2="43"/>
    ${arrowUp(36, 20, 9)}
    <g class="ex-anim-press-v">
      <line x1="21" y1="24" x2="21" y2="11"/>
      <line x1="24" y1="22" x2="28" y2="11"/>
      ${dumbbell(20, 10)}
      ${dumbbell(29, 10)}
    </g>
  `),

  "Decline push-up (feet up)": () => wrap("push", `
    ${floor(40)}
    <rect x="5" y="29" width="11" height="11" rx="1.5" fill="currentColor" opacity="0.32" stroke="none"/>
    <g class="ex-anim-pushup">
      ${head(39, 25)}
      ${muscle(32, 26, 3.6)}
      <line x1="36" y1="26" x2="13" y2="28" stroke-width="2.5"/>
      <line x1="33" y1="27" x2="34" y2="40" stroke-width="2.2"/>
    </g>
  `),

  // ── PUSH: Vertical Press ───────────────────────────────────────────────────
  "Barbell overhead press": () => wrap("push", `
    ${floor()}
    ${head(24, 17)}
    ${muscle(19, 20, 3.2)}
    ${muscle(29, 20, 3.2)}
    <line x1="24" y1="20" x2="24" y2="32" stroke-width="2.5"/>
    <line x1="24" y1="32" x2="19" y2="43"/>
    <line x1="24" y1="32" x2="29" y2="43"/>
    <g class="ex-anim-press-v">
      <line x1="20" y1="21" x2="16" y2="10"/>
      <line x1="28" y1="21" x2="32" y2="10"/>
      ${bar(9, 9, 39)}
    </g>
  `),

  "Seated dumbbell press": () => wrap("push", `
    ${floor()}
    <line x1="16" y1="22" x2="16" y2="43" stroke-width="2.2" opacity="0.38"/>
    <line x1="16" y1="34" x2="28" y2="34" stroke-width="2.5" opacity="0.38"/>
    ${head(24, 18)}
    ${muscle(19, 22, 3.2)}
    ${muscle(29, 22, 3.2)}
    <line x1="24" y1="21" x2="24" y2="33" stroke-width="2.5"/>
    <line x1="24" y1="33" x2="31" y2="35"/>
    <line x1="31" y1="35" x2="31" y2="43"/>
    <g class="ex-anim-press-v">
      <line x1="20" y1="22" x2="14" y2="10"/>
      <line x1="28" y1="22" x2="34" y2="10"/>
      ${dumbbell(14, 9)}
      ${dumbbell(34, 9)}
    </g>
  `),

  "Standing dumbbell press": () => wrap("push", `
    ${floor()}
    ${head(24, 17)}
    ${muscle(19, 21, 3.2)}
    ${muscle(29, 21, 3.2)}
    <line x1="24" y1="20" x2="24" y2="32" stroke-width="2.5"/>
    <line x1="24" y1="32" x2="19" y2="43"/>
    <line x1="24" y1="32" x2="29" y2="43"/>
    <g class="ex-anim-press-v">
      <line x1="20" y1="21" x2="14" y2="9"/>
      <line x1="28" y1="21" x2="34" y2="9"/>
      ${dumbbell(14, 8)}
      ${dumbbell(34, 8)}
    </g>
  `),

  "Band overhead press": () => wrap("push", `
    ${floor()}
    ${head(24, 17)}
    ${muscle(19, 21, 3.2)}
    ${muscle(29, 21, 3.2)}
    <line x1="24" y1="20" x2="24" y2="32" stroke-width="2.5"/>
    <line x1="24" y1="32" x2="19" y2="43"/>
    <line x1="24" y1="32" x2="29" y2="43"/>
    <g class="ex-anim-press-v">
      <line x1="19" y1="43" x2="14" y2="10" stroke-dasharray="2 2" opacity="0.55"/>
      <line x1="29" y1="43" x2="34" y2="10" stroke-dasharray="2 2" opacity="0.55"/>
      <line x1="20" y1="21" x2="14" y2="10"/>
      <line x1="28" y1="21" x2="34" y2="10"/>
      <circle cx="14" cy="10" r="2" fill="currentColor"/>
      <circle cx="34" cy="10" r="2" fill="currentColor"/>
    </g>
  `),

  "Pike push-up": () => wrap("push", `
    ${floor(40)}
    <g class="ex-anim-pushup">
      ${muscle(31, 27, 3.8)}
      <line x1="11" y1="40" x2="22" y2="16" stroke-width="2.5"/>
      <line x1="22" y1="16" x2="33" y2="29" stroke-width="2.5"/>
      ${head(34, 33, 3)}
      <line x1="31" y1="27" x2="37" y2="40" stroke-width="2.2"/>
    </g>
    ${arrowDown(37, 15, 25)}
  `),

  "Machine shoulder press": () => wrap("push", `
    ${floor()}
    <rect x="8" y="10" width="4" height="33" rx="1" fill="currentColor" opacity="0.32" stroke="none"/>
    ${head(24, 18)}
    ${muscle(19, 22, 3.2)}
    ${muscle(29, 22, 3.2)}
    <line x1="24" y1="21" x2="24" y2="33" stroke-width="2.5"/>
    <line x1="24" y1="33" x2="19" y2="43"/>
    <line x1="24" y1="33" x2="29" y2="43"/>
    <g class="ex-anim-press-v">
      <line x1="12" y1="10" x2="38" y2="10" stroke-width="2.4" opacity="0.65"/>
      <line x1="20" y1="22" x2="16" y2="10"/>
      <line x1="28" y1="22" x2="32" y2="10"/>
    </g>
  `),

  "Kettlebell shoulder press": () => wrap("push", `
    ${floor()}
    ${head(23, 17)}
    ${muscle(28, 20, 3.5)}
    <line x1="23" y1="20" x2="23" y2="32" stroke-width="2.5"/>
    <line x1="23" y1="32" x2="18" y2="43"/>
    <line x1="23" y1="32" x2="28" y2="43"/>
    <line x1="20" y1="21" x2="15" y2="28"/>
    <g class="ex-anim-press-v">
      <line x1="26" y1="21" x2="33" y2="9"/>
      ${kettlebell(35, 10, 0.95)}
    </g>
  `),

  // ── PUSH: Lateral Raise ────────────────────────────────────────────────────
  "Dumbbell lateral raise": () => wrap("push", `
    ${floor()}
    ${head(24, 11)}
    ${muscle(18, 16, 3.2)}
    ${muscle(30, 16, 3.2)}
    <line x1="24" y1="14" x2="24" y2="30" stroke-width="2.5"/>
    <line x1="24" y1="30" x2="19" y2="43"/>
    <line x1="24" y1="30" x2="29" y2="43"/>
    <path d="M 11 26 A 14 14 0 0 1 10 14" stroke-width="1.3" stroke-dasharray="2 2" opacity="0.5"/>
    <path d="M 37 26 A 14 14 0 0 0 38 14" stroke-width="1.3" stroke-dasharray="2 2" opacity="0.5"/>
    <g class="ex-anim-lat-l">
      <line x1="21" y1="16" x2="8" y2="17" stroke-width="2.2"/>
      ${dumbbell(7, 17)}
    </g>
    <g class="ex-anim-lat-r">
      <line x1="27" y1="16" x2="40" y2="17" stroke-width="2.2"/>
      ${dumbbell(41, 17)}
    </g>
  `),

  "Band lateral raise": () => wrap("push", `
    ${floor()}
    ${head(24, 11)}
    ${muscle(18, 16, 3.2)}
    ${muscle(30, 16, 3.2)}
    <line x1="24" y1="14" x2="24" y2="30" stroke-width="2.5"/>
    <line x1="24" y1="30" x2="19" y2="43"/>
    <line x1="24" y1="30" x2="29" y2="43"/>
    <line x1="24" y1="43" x2="9" y2="18" stroke-dasharray="2 2" opacity="0.55"/>
    <line x1="24" y1="43" x2="39" y2="18" stroke-dasharray="2 2" opacity="0.55"/>
    <g class="ex-anim-lat-l">
      <line x1="21" y1="16" x2="9" y2="18" stroke-width="2.2"/>
      <circle cx="9" cy="18" r="2" fill="currentColor"/>
    </g>
    <g class="ex-anim-lat-r">
      <line x1="27" y1="16" x2="39" y2="18" stroke-width="2.2"/>
      <circle cx="39" cy="18" r="2" fill="currentColor"/>
    </g>
  `),

  "Cable lateral raise": () => wrap("push", `
    ${floor()}
    <line x1="8" y1="8" x2="8" y2="43" stroke-width="2.4" opacity="0.4"/>
    <circle cx="8" cy="40" r="2" fill="currentColor" opacity="0.6"/>
    ${head(24, 11)}
    ${muscle(29, 16, 3.5)}
    <line x1="24" y1="14" x2="24" y2="30" stroke-width="2.5"/>
    <line x1="24" y1="30" x2="19" y2="43"/>
    <line x1="24" y1="30" x2="29" y2="43"/>
    <line x1="21" y1="16" x2="17" y2="26"/>
    <line x1="8" y1="40" x2="40" y2="17" stroke-dasharray="2 2" opacity="0.55"/>
    <g class="ex-anim-lat-r">
      <line x1="27" y1="16" x2="40" y2="17" stroke-width="2.2"/>
      <circle cx="40" cy="17" r="2.2" fill="currentColor"/>
    </g>
  `),

  // ── PUSH: Triceps Extension ────────────────────────────────────────────────
  "Band triceps pushdown": () => wrap("push", `
    ${floor()}
    <circle cx="34" cy="6" r="2.2" fill="currentColor" opacity="0.6"/>
    <line x1="34" y1="6" x2="29" y2="27" stroke-dasharray="2 2" opacity="0.6"/>
    ${head(19, 12)}
    ${muscle(21, 21, 3.2)}
    <line x1="19" y1="15" x2="19" y2="30" stroke-width="2.5"/>
    <line x1="19" y1="30" x2="15" y2="43"/>
    <line x1="19" y1="30" x2="23" y2="43"/>
    <line x1="19" y1="17" x2="23" y2="24" stroke-width="2.2"/>
    ${arrowDown(38, 18, 30)}
    <g class="ex-anim-pushdown">
      <line x1="23" y1="24" x2="29" y2="31" stroke-width="2.4"/>
      <circle cx="29" cy="31" r="2" fill="currentColor"/>
    </g>
  `),

  "Cable triceps pushdown": () => wrap("push", `
    ${floor()}
    <line x1="36" y1="6" x2="36" y2="43" stroke-width="2.5" opacity="0.4"/>
    <circle cx="34" cy="7" r="2" fill="currentColor" opacity="0.7"/>
    <line x1="34" y1="7" x2="28" y2="26" stroke-width="1.5" opacity="0.6"/>
    ${head(18, 12)}
    ${muscle(20, 21, 3.2)}
    <line x1="18" y1="15" x2="18" y2="30" stroke-width="2.5"/>
    <line x1="18" y1="30" x2="14" y2="43"/>
    <line x1="18" y1="30" x2="22" y2="43"/>
    <line x1="18" y1="17" x2="22" y2="24" stroke-width="2.2"/>
    <g class="ex-anim-pushdown">
      <line x1="22" y1="24" x2="28" y2="31" stroke-width="2.4"/>
      <line x1="25" y1="31" x2="31" y2="31" stroke-width="2.5"/>
    </g>
  `),

  "Dumbbell overhead extension": () => wrap("push", `
    ${floor()}
    ${head(24, 18)}
    ${muscle(19, 14, 3)}
    ${muscle(29, 14, 3)}
    <line x1="24" y1="21" x2="24" y2="33" stroke-width="2.5"/>
    <line x1="24" y1="33" x2="19" y2="43"/>
    <line x1="24" y1="33" x2="29" y2="43"/>
    <line x1="21" y1="21" x2="19" y2="12" stroke-width="2.2"/>
    <line x1="27" y1="21" x2="29" y2="12" stroke-width="2.2"/>
    <g class="ex-anim-press-v">
      <line x1="19" y1="12" x2="24" y2="7"/>
      <line x1="29" y1="12" x2="24" y2="7"/>
      ${dumbbell(24, 6, false)}
    </g>
  `),

  "EZ-bar skullcrusher": () => wrap("push", `
    ${floor()}
    ${benchFlat(6, 33, 28)}
    ${head(10, 28.5)}
    ${muscle(18, 22, 3.2)}
    <line x1="13" y1="30" x2="31" y2="30" stroke-width="2.5"/>
    <line x1="31" y1="30" x2="37" y2="36"/>
    <line x1="37" y1="36" x2="37" y2="43"/>
    <line x1="18" y1="29" x2="18" y2="19" stroke-width="2.2"/>
    <g class="ex-anim-press-v">
      <line x1="18" y1="19" x2="13" y2="13" stroke-width="2.2"/>
      ${plateSide(12, 12, 4)}
    </g>
  `),

  "Bench dip": () => wrap("push", `
    ${floor(41)}
    <rect x="6" y="27" width="12" height="14" rx="1.5" fill="currentColor" opacity="0.35" stroke="none"/>
    <g class="ex-anim-squat">
      ${head(22, 15)}
      ${muscle(19, 22, 3.4)}
      <line x1="22" y1="18" x2="22" y2="31" stroke-width="2.5"/>
      <line x1="21" y1="20" x2="15" y2="24" stroke-width="2.2"/>
      <line x1="15" y1="24" x2="15" y2="27" stroke-width="2.2"/>
      <line x1="22" y1="31" x2="38" y2="40" stroke-width="2.4"/>
    </g>
  `),

  "Diamond push-up": () => wrap("push", `
    ${floor(39)}
    <polygon points="33,39 36,35 39,39" fill="currentColor" opacity="0.6" stroke="none"/>
    <g class="ex-anim-pushup">
      ${head(39, 21)}
      ${muscle(33, 26, 3.6)}
      <line x1="36" y1="23" x2="10" y2="35" stroke-width="2.6"/>
      <line x1="33" y1="25" x2="36" y2="38" stroke-width="2.2"/>
      <line x1="10" y1="35" x2="9" y2="39" stroke-width="2"/>
    </g>
  `),

  // ── PULL: Rows ─────────────────────────────────────────────────────────────
  "Barbell bent-over row": () => wrap("pull", `
    ${floor()}
    ${head(12, 15)}
    ${muscle(23, 18, 4)}
    <line x1="15" y1="17" x2="32" y2="23" stroke-width="2.6"/>
    <line x1="32" y1="23" x2="29" y2="33"/>
    <line x1="29" y1="33" x2="32" y2="43"/>
    ${arrowUp(12, 35, 24)}
    <g class="ex-anim-row-v">
      <line x1="21" y1="19" x2="20" y2="31" stroke-width="2.2"/>
      ${plateSide(20, 33, 5.2)}
    </g>
  `),

  "Single-arm dumbbell row": () => wrap("pull", `
    ${floor()}
    ${benchFlat(6, 33, 20)}
    ${head(9, 20)}
    ${muscle(23, 21, 3.8)}
    <line x1="12" y1="21" x2="31" y2="23" stroke-width="2.6"/>
    <line x1="15" y1="21" x2="14" y2="33" stroke-width="2"/>
    <line x1="31" y1="23" x2="24" y2="33" stroke-width="2"/>
    <line x1="31" y1="23" x2="38" y2="43" stroke-width="2.2"/>
    <g class="ex-anim-row-v">
      <line x1="23" y1="22" x2="26" y2="30" stroke-width="2.3"/>
      ${dumbbell(25, 31)}
    </g>
  `),

  "Bent-over dumbbell row": () => wrap("pull", `
    ${floor()}
    ${head(12, 15)}
    ${muscle(23, 18, 4)}
    <line x1="15" y1="17" x2="32" y2="23" stroke-width="2.6"/>
    <line x1="32" y1="23" x2="29" y2="33"/>
    <line x1="29" y1="33" x2="32" y2="43"/>
    <g class="ex-anim-row-v">
      <line x1="21" y1="19" x2="20" y2="31" stroke-width="2.2"/>
      ${dumbbell(20, 32)}
    </g>
  `),

  "Seated band row": () => wrap("pull", `
    ${floor(39)}
    ${head(15, 18)}
    ${muscle(13, 25, 3.6)}
    <line x1="15" y1="21" x2="15" y2="37" stroke-width="2.6"/>
    <line x1="15" y1="37" x2="38" y2="37" stroke-width="2.4"/>
    <line x1="38" y1="33" x2="38" y2="39" stroke-width="2.4"/>
    <g class="ex-anim-shift-l">
      <line x1="38" y1="35" x2="20" y2="27" stroke-dasharray="2.5 2" opacity="0.6"/>
      <line x1="15" y1="24" x2="20" y2="27" stroke-width="2.2"/>
      <circle cx="20" cy="27" r="2" fill="currentColor"/>
    </g>
  `),

  "Seated cable row": () => wrap("pull", `
    ${floor(39)}
    <line x1="40" y1="12" x2="40" y2="39" stroke-width="2.6" opacity="0.4"/>
    <circle cx="38" cy="28" r="2" fill="currentColor" opacity="0.7"/>
    ${head(16, 17)}
    ${muscle(14, 25, 3.8)}
    <line x1="16" y1="20" x2="16" y2="36" stroke-width="2.6"/>
    <line x1="16" y1="36" x2="36" y2="36" stroke-width="2.4"/>
    <g class="ex-anim-shift-l">
      <line x1="38" y1="28" x2="22" y2="28" stroke-width="1.5" opacity="0.65"/>
      <line x1="16" y1="24" x2="22" y2="28" stroke-width="2.3"/>
      <circle cx="22" cy="28" r="2" fill="currentColor"/>
    </g>
  `),

  "Inverted row (table/bar)": () => wrap("pull", `
    ${floor(41)}
    <line x1="18" y1="14" x2="18" y2="41" stroke-width="2" opacity="0.38"/>
    <circle cx="18" cy="16" r="2.4" fill="currentColor"/>
    <g class="ex-anim-row-v">
      ${head(12, 23)}
      ${muscle(17, 26, 3.6)}
      <line x1="15" y1="25" x2="39" y2="39" stroke-width="2.6"/>
      <line x1="19" y1="27" x2="18" y2="16" stroke-width="2.2"/>
    </g>
  `),

  "Kettlebell row": () => wrap("pull", `
    ${floor()}
    ${head(12, 15)}
    ${muscle(23, 18, 4)}
    <line x1="15" y1="17" x2="32" y2="23" stroke-width="2.6"/>
    <line x1="32" y1="23" x2="29" y2="33"/>
    <line x1="29" y1="33" x2="32" y2="43"/>
    <g class="ex-anim-row-v">
      <line x1="21" y1="19" x2="20" y2="30" stroke-width="2.2"/>
      ${kettlebell(20, 33, 1.05)}
    </g>
  `),

  // ── PULL: Vertical Pull ────────────────────────────────────────────────────
  "Pull-up": () => wrap("pull", `
    <line x1="6" y1="7" x2="42" y2="7" stroke-width="2.8" opacity="0.75"/>
    <line x1="16" y1="7" x2="19" y2="15" stroke-width="2.2"/>
    <line x1="32" y1="7" x2="29" y2="15" stroke-width="2.2"/>
    <g class="ex-anim-pullup">
      ${head(24, 12)}
      ${muscle(20, 19, 3.4)}
      ${muscle(28, 19, 3.4)}
      <line x1="19" y1="15" x2="24" y2="17" stroke-width="2.2"/>
      <line x1="29" y1="15" x2="24" y2="17" stroke-width="2.2"/>
      <line x1="24" y1="15" x2="24" y2="30" stroke-width="2.6"/>
      <line x1="24" y1="30" x2="20" y2="42"/>
      <line x1="24" y1="30" x2="28" y2="42"/>
    </g>
  `),

  "Lat pulldown": () => wrap("pull", `
    ${floor()}
    <line x1="24" y1="3" x2="24" y2="12" stroke-width="1.6" opacity="0.6"/>
    ${head(24, 21)}
    ${muscle(19, 26, 3.4)}
    ${muscle(29, 26, 3.4)}
    <line x1="24" y1="24" x2="24" y2="35" stroke-width="2.6"/>
    <line x1="24" y1="35" x2="18" y2="43"/>
    <line x1="24" y1="35" x2="30" y2="43"/>
    <g class="ex-anim-pushdown">
      <path d="M 10 14 L 15 11 L 33 11 L 38 14" stroke-width="2.4"/>
      <line x1="13" y1="13" x2="20" y2="24" stroke-width="2.2"/>
      <line x1="35" y1="13" x2="28" y2="24" stroke-width="2.2"/>
    </g>
  `),

  "Band lat pulldown": () => wrap("pull", `
    ${floor()}
    <circle cx="24" cy="5" r="2.2" fill="currentColor" opacity="0.7"/>
    <line x1="24" y1="5" x2="15" y2="15" stroke-dasharray="2 2" opacity="0.6"/>
    <line x1="24" y1="5" x2="33" y2="15" stroke-dasharray="2 2" opacity="0.6"/>
    ${head(24, 21)}
    ${muscle(19, 26, 3.4)}
    ${muscle(29, 26, 3.4)}
    <line x1="24" y1="24" x2="24" y2="36" stroke-width="2.6"/>
    <line x1="24" y1="36" x2="18" y2="43"/>
    <line x1="24" y1="36" x2="30" y2="43"/>
    <g class="ex-anim-pushdown">
      <line x1="15" y1="15" x2="20" y2="25" stroke-width="2.2"/>
      <line x1="33" y1="15" x2="28" y2="25" stroke-width="2.2"/>
      <circle cx="15" cy="15" r="1.8" fill="currentColor"/>
      <circle cx="33" cy="15" r="1.8" fill="currentColor"/>
    </g>
  `),

  "Dumbbell pullover": () => wrap("pull", `
    ${floor()}
    ${benchFlat(10, 32, 26)}
    ${head(14, 28)}
    ${muscle(22, 29, 3.8)}
    <line x1="17" y1="29" x2="33" y2="29" stroke-width="2.6"/>
    <line x1="33" y1="29" x2="39" y2="36"/>
    <line x1="39" y1="36" x2="39" y2="43"/>
    <path d="M 8 20 A 14 14 0 0 1 20 14" stroke-width="1.3" stroke-dasharray="2 2" opacity="0.55"/>
    <g class="ex-anim-lat-r">
      <line x1="18" y1="28" x2="10" y2="17" stroke-width="2.3"/>
      ${dumbbell(9, 16, false)}
    </g>
  `),

  // ── PULL: Rear Delt / Upper Back ───────────────────────────────────────────
  "Band face pull": () => wrap("pull", `
    ${floor()}
    <circle cx="41" cy="15" r="2.2" fill="currentColor" opacity="0.65"/>
    ${head(16, 15)}
    ${muscle(15, 21, 3.6)}
    <line x1="16" y1="18" x2="16" y2="31" stroke-width="2.5"/>
    <line x1="16" y1="31" x2="12" y2="43"/>
    <line x1="16" y1="31" x2="21" y2="43"/>
    <g class="ex-anim-shift-l">
      <line x1="41" y1="15" x2="21" y2="15" stroke-dasharray="2.5 2" opacity="0.6"/>
      <line x1="16" y1="21" x2="24" y2="19" stroke-width="2.2"/>
      <line x1="24" y1="19" x2="20" y2="14" stroke-width="2.2"/>
    </g>
  `),

  "Cable face pull": () => wrap("pull", `
    ${floor()}
    <line x1="41" y1="7" x2="41" y2="43" stroke-width="2.5" opacity="0.4"/>
    <circle cx="39" cy="15" r="2" fill="currentColor" opacity="0.7"/>
    ${head(16, 15)}
    ${muscle(15, 21, 3.6)}
    <line x1="16" y1="18" x2="16" y2="31" stroke-width="2.5"/>
    <line x1="16" y1="31" x2="12" y2="43"/>
    <line x1="16" y1="31" x2="21" y2="43"/>
    <g class="ex-anim-shift-l">
      <line x1="39" y1="15" x2="21" y2="15" stroke-width="1.5" opacity="0.65"/>
      <line x1="16" y1="21" x2="24" y2="19" stroke-width="2.2"/>
      <line x1="24" y1="19" x2="20" y2="14" stroke-width="2.2"/>
    </g>
  `),

  "Dumbbell rear-delt fly": () => wrap("pull", `
    ${floor()}
    ${head(12, 16)}
    ${muscle(21, 17, 3.8)}
    <line x1="15" y1="18" x2="32" y2="23" stroke-width="2.6"/>
    <line x1="32" y1="23" x2="29" y2="33"/>
    <line x1="29" y1="33" x2="32" y2="43"/>
    <g class="ex-anim-row-v">
      <line x1="21" y1="19" x2="14" y2="11" stroke-width="2.2"/>
      <line x1="21" y1="19" x2="27" y2="29" stroke-width="2.2"/>
      ${dumbbell(14, 10)}
      ${dumbbell(27, 30)}
    </g>
  `),

  "Superman hold": () => wrap("pull", `
    ${floor(37)}
    <g class="ex-anim-pulse">
      ${muscle(24, 33, 4)}
      ${head(37, 26, 2.8)}
      <path d="M 9 27 Q 24 38 35 28" stroke-width="2.6"/>
      <line x1="34" y1="28" x2="43" y2="23" stroke-width="2.2"/>
    </g>
  `),

  // ── PULL: Biceps Curls & Shrugs ────────────────────────────────────────────
  "Dumbbell biceps curl": () => wrap("pull", `
    ${floor()}
    ${head(22, 11)}
    ${muscle(26, 20, 3.6)}
    <line x1="22" y1="14" x2="22" y2="30" stroke-width="2.6"/>
    <line x1="22" y1="30" x2="17" y2="43"/>
    <line x1="22" y1="30" x2="26" y2="43"/>
    <line x1="23" y1="16" x2="25" y2="24" stroke-width="2.2"/>
    <path d="M 33 25 A 9 9 0 0 0 31 15" stroke-width="1.3" stroke-dasharray="2 2" opacity="0.55"/>
    <g class="ex-anim-curl">
      <line x1="25" y1="24" x2="32" y2="17" stroke-width="2.3"/>
      ${dumbbell(33, 16)}
    </g>
  `),

  "Dumbbell hammer curl": () => wrap("pull", `
    ${floor()}
    ${head(22, 11)}
    ${muscle(26, 20, 3.6)}
    <line x1="22" y1="14" x2="22" y2="30" stroke-width="2.6"/>
    <line x1="22" y1="30" x2="17" y2="43"/>
    <line x1="22" y1="30" x2="26" y2="43"/>
    <line x1="23" y1="16" x2="25" y2="24" stroke-width="2.2"/>
    <g class="ex-anim-curl">
      <line x1="25" y1="24" x2="32" y2="17" stroke-width="2.3"/>
      ${dumbbell(33, 16, false)}
    </g>
  `),

  "EZ-bar curl": () => wrap("pull", `
    ${floor()}
    ${head(24, 11)}
    ${muscle(19, 19, 3)}
    ${muscle(29, 19, 3)}
    <line x1="24" y1="14" x2="24" y2="30" stroke-width="2.6"/>
    <line x1="24" y1="30" x2="19" y2="43"/>
    <line x1="24" y1="30" x2="29" y2="43"/>
    <line x1="20" y1="16" x2="17" y2="24" stroke-width="2.2"/>
    <line x1="28" y1="16" x2="31" y2="24" stroke-width="2.2"/>
    <g class="ex-anim-row-v">
      <path d="M 11 20 L 16 20 L 19 22 L 24 20 L 29 22 L 32 20 L 37 20" stroke-width="2.2"/>
      <rect x="10" y="16.5" width="2.5" height="7" rx="0.8" fill="currentColor" stroke="none"/>
      <rect x="35.5" y="16.5" width="2.5" height="7" rx="0.8" fill="currentColor" stroke="none"/>
    </g>
  `),

  "Band biceps curl": () => wrap("pull", `
    ${floor()}
    ${head(22, 11)}
    ${muscle(26, 20, 3.6)}
    <line x1="22" y1="14" x2="22" y2="30" stroke-width="2.6"/>
    <line x1="22" y1="30" x2="17" y2="43"/>
    <line x1="22" y1="30" x2="26" y2="43"/>
    <line x1="23" y1="16" x2="25" y2="24" stroke-width="2.2"/>
    <line x1="26" y1="43" x2="32" y2="17" stroke-dasharray="2 2" opacity="0.6"/>
    <g class="ex-anim-curl">
      <line x1="25" y1="24" x2="32" y2="17" stroke-width="2.3"/>
      <circle cx="32" cy="17" r="2" fill="currentColor"/>
    </g>
  `),

  "Cable curl": () => wrap("pull", `
    ${floor()}
    <line x1="39" y1="8" x2="39" y2="43" stroke-width="2.5" opacity="0.4"/>
    <circle cx="37" cy="40" r="2" fill="currentColor" opacity="0.7"/>
    ${head(20, 11)}
    ${muscle(24, 20, 3.6)}
    <line x1="20" y1="14" x2="20" y2="30" stroke-width="2.6"/>
    <line x1="20" y1="30" x2="15" y2="43"/>
    <line x1="20" y1="30" x2="24" y2="43"/>
    <line x1="21" y1="16" x2="23" y2="24" stroke-width="2.2"/>
    <line x1="37" y1="40" x2="30" y2="18" stroke-width="1.4" opacity="0.6"/>
    <g class="ex-anim-curl">
      <line x1="23" y1="24" x2="30" y2="18" stroke-width="2.3"/>
      <circle cx="30" cy="18" r="2" fill="currentColor"/>
    </g>
  `),

  "Dumbbell shrug": () => wrap("pull", `
    ${floor()}
    ${head(24, 11)}
    ${muscle(20, 15, 3.5)}
    ${muscle(28, 15, 3.5)}
    <line x1="24" y1="14" x2="24" y2="30" stroke-width="2.6"/>
    <line x1="24" y1="30" x2="19" y2="43"/>
    <line x1="24" y1="30" x2="29" y2="43"/>
    <g class="ex-anim-row-v">
      <line x1="20" y1="15" x2="15" y2="17" stroke-width="2.3"/>
      <line x1="15" y1="17" x2="15" y2="28" stroke-width="2.2"/>
      <line x1="28" y1="15" x2="33" y2="17" stroke-width="2.3"/>
      <line x1="33" y1="17" x2="33" y2="28" stroke-width="2.2"/>
      ${dumbbell(15, 29)}
      ${dumbbell(33, 29)}
    </g>
  `),

  // ── LEGS: Squats ───────────────────────────────────────────────────────────
  "Barbell back squat": () => wrap("legs", `
    ${floor()}
    <g class="ex-anim-squat">
      ${head(24, 10)}
      ${bar(9, 15, 39)}
      ${muscle(17, 29, 3.8)}
      ${muscle(31, 29, 3.8)}
      <line x1="24" y1="13" x2="24" y2="27" stroke-width="2.6"/>
      <line x1="24" y1="27" x2="15" y2="33" stroke-width="2.5"/>
      <line x1="24" y1="27" x2="33" y2="33" stroke-width="2.5"/>
    </g>
    <line x1="15" y1="33" x2="17" y2="43" stroke-width="2.4"/>
    <line x1="33" y1="33" x2="31" y2="43" stroke-width="2.4"/>
  `),

  "Goblet squat": () => wrap("legs", `
    ${floor()}
    <g class="ex-anim-squat">
      ${head(24, 10)}
      ${muscle(17, 29, 3.6)}
      ${muscle(31, 29, 3.6)}
      <line x1="24" y1="13" x2="24" y2="27" stroke-width="2.6"/>
      <line x1="20" y1="16" x2="24" y2="21"/>
      <line x1="28" y1="16" x2="24" y2="21"/>
      ${dumbbell(24, 19, false)}
      <line x1="24" y1="27" x2="15" y2="33" stroke-width="2.5"/>
      <line x1="24" y1="27" x2="33" y2="33" stroke-width="2.5"/>
    </g>
    <line x1="15" y1="33" x2="17" y2="43" stroke-width="2.4"/>
    <line x1="33" y1="33" x2="31" y2="43" stroke-width="2.4"/>
  `),

  "Kettlebell goblet squat": () => wrap("legs", `
    ${floor()}
    <g class="ex-anim-squat">
      ${head(24, 10)}
      ${muscle(17, 29, 3.6)}
      ${muscle(31, 29, 3.6)}
      <line x1="24" y1="13" x2="24" y2="27" stroke-width="2.6"/>
      <line x1="20" y1="16" x2="24" y2="21"/>
      <line x1="28" y1="16" x2="24" y2="21"/>
      ${kettlebell(24, 20, 0.95)}
      <line x1="24" y1="27" x2="15" y2="33" stroke-width="2.5"/>
      <line x1="24" y1="27" x2="33" y2="33" stroke-width="2.5"/>
    </g>
    <line x1="15" y1="33" x2="17" y2="43" stroke-width="2.4"/>
    <line x1="33" y1="33" x2="31" y2="43" stroke-width="2.4"/>
  `),

  "Dumbbell box squat": () => wrap("legs", `
    ${floor()}
    <rect x="11" y="33" width="12" height="10" rx="1.5" fill="currentColor" opacity="0.32" stroke="none"/>
    <g class="ex-anim-squat">
      ${head(22, 11)}
      ${muscle(26, 29, 3.8)}
      <line x1="22" y1="14" x2="19" y2="28" stroke-width="2.6"/>
      <line x1="19" y1="28" x2="30" y2="31" stroke-width="2.5"/>
      <line x1="21" y1="17" x2="23" y2="27"/>
      ${dumbbell(23, 28)}
    </g>
    <line x1="30" y1="31" x2="30" y2="43" stroke-width="2.4"/>
  `),

  "Bodyweight squat": () => wrap("legs", `
    ${floor()}
    <g class="ex-anim-squat">
      ${head(22, 11)}
      ${muscle(26, 29, 3.8)}
      <line x1="22" y1="14" x2="19" y2="28" stroke-width="2.6"/>
      <line x1="22" y1="17" x2="34" y2="17" stroke-width="2.2"/>
      <line x1="19" y1="28" x2="30" y2="32" stroke-width="2.5"/>
    </g>
    <line x1="30" y1="32" x2="30" y2="43" stroke-width="2.4"/>
  `),

  "Leg press": () => wrap("legs", `
    ${floor(41)}
    <line x1="7" y1="28" x2="18" y2="38" stroke-width="3" opacity="0.4"/>
    <line x1="18" y1="38" x2="27" y2="38" stroke-width="3" opacity="0.4"/>
    ${head(11, 25)}
    ${muscle(23, 30, 4)}
    <line x1="13" y1="28" x2="20" y2="36" stroke-width="2.6"/>
    <g class="ex-anim-press-v">
      <line x1="20" y1="36" x2="26" y2="27" stroke-width="2.4"/>
      <line x1="26" y1="27" x2="34" y2="19" stroke-width="2.4"/>
      <line x1="30" y1="14" x2="39" y2="23" stroke-width="3.2"/>
      ${plateSide(37, 16, 4.2)}
    </g>
  `),

  // ── LEGS: Hinges ───────────────────────────────────────────────────────────
  "Barbell deadlift": () => wrap("legs", `
    ${floor()}
    <g class="ex-anim-hinge">
      ${head(16, 12)}
      ${muscle(30, 23, 4.2)}
      <line x1="18" y1="15" x2="30" y2="23" stroke-width="2.6"/>
      <line x1="22" y1="18" x2="22" y2="33" stroke-width="2.2"/>
      ${plateSide(22, 34, 6)}
    </g>
    <line x1="30" y1="23" x2="27" y2="33" stroke-width="2.5"/>
    <line x1="27" y1="33" x2="29" y2="43" stroke-width="2.4"/>
  `),

  "Dumbbell Romanian deadlift": () => wrap("legs", `
    ${floor()}
    <g class="ex-anim-hinge">
      ${head(14, 14)}
      ${muscle(32, 24, 4.2)}
      <line x1="17" y1="16" x2="32" y2="22" stroke-width="2.6"/>
      <line x1="22" y1="18" x2="22" y2="32" stroke-width="2.2"/>
      ${dumbbell(22, 33)}
    </g>
    <line x1="32" y1="22" x2="30" y2="33" stroke-width="2.5"/>
    <line x1="30" y1="33" x2="31" y2="43" stroke-width="2.4"/>
  `),

  "Band good morning": () => wrap("legs", `
    ${floor()}
    <line x1="30" y1="43" x2="17" y2="16" stroke-dasharray="2.5 2" opacity="0.6"/>
    <g class="ex-anim-hinge">
      ${head(14, 14)}
      ${muscle(32, 24, 4)}
      <line x1="17" y1="16" x2="32" y2="22" stroke-width="2.6"/>
    </g>
    <line x1="32" y1="22" x2="30" y2="43" stroke-width="2.5"/>
  `),

  "Barbell hip thrust": () => wrap("legs", `
    ${floor(41)}
    <rect x="6" y="29" width="10" height="12" rx="1.5" fill="currentColor" opacity="0.35" stroke="none"/>
    <g class="ex-anim-squat">
      ${head(11, 24)}
      ${muscle(24, 28, 4.2)}
      <line x1="13" y1="28" x2="25" y2="27" stroke-width="2.6"/>
      <line x1="25" y1="27" x2="36" y2="28" stroke-width="2.5"/>
      ${plateSide(25, 25, 4.8)}
    </g>
    <line x1="36" y1="28" x2="36" y2="41" stroke-width="2.4"/>
  `),

  "Glute bridge": () => wrap("legs", `
    ${floor(40)}
    <g class="ex-anim-squat">
      ${head(10, 36)}
      ${muscle(24, 28, 4)}
      <line x1="13" y1="37" x2="25" y2="27" stroke-width="2.6"/>
      <line x1="25" y1="27" x2="34" y2="27" stroke-width="2.5"/>
    </g>
    <line x1="34" y1="27" x2="37" y2="40" stroke-width="2.4"/>
  `),

  "Seated leg curl": () => wrap("legs", `
    ${floor()}
    <line x1="13" y1="16" x2="13" y2="43" stroke-width="2.5" opacity="0.38"/>
    <line x1="13" y1="31" x2="28" y2="31" stroke-width="2.5" opacity="0.38"/>
    ${head(18, 14)}
    ${muscle(24, 32, 3.8)}
    <line x1="18" y1="17" x2="18" y2="30" stroke-width="2.6"/>
    <line x1="18" y1="30" x2="30" y2="30" stroke-width="2.6"/>
    <g class="ex-anim-curl">
      <line x1="30" y1="30" x2="27" y2="41" stroke-width="2.4"/>
      <circle cx="29" cy="40" r="2.3" fill="currentColor"/>
    </g>
  `),

  "Kettlebell swing": () => wrap("legs", `
    ${floor()}
    ${head(20, 12)}
    ${muscle(16, 26, 4)}
    <line x1="20" y1="15" x2="16" y2="27" stroke-width="2.6"/>
    <line x1="16" y1="27" x2="19" y2="35" stroke-width="2.5"/>
    <line x1="19" y1="35" x2="17" y2="43" stroke-width="2.4"/>
    <path d="M 18 33 A 18 18 0 0 0 38 19" stroke-width="1.3" stroke-dasharray="2 2" opacity="0.55"/>
    <g class="ex-anim-swing">
      <line x1="19" y1="18" x2="35" y2="18" stroke-width="2.2"/>
      ${kettlebell(38, 18, 1)}
    </g>
  `),

  // ── LEGS: Lunges & Split Squats ────────────────────────────────────────────
  "Bulgarian split squat": () => wrap("legs", `
    ${floor()}
    <rect x="34" y="33" width="10" height="10" rx="1.5" fill="currentColor" opacity="0.35" stroke="none"/>
    <g class="ex-anim-squat">
      ${head(17, 10)}
      ${muscle(14, 29, 3.8)}
      <line x1="17" y1="13" x2="17" y2="26" stroke-width="2.6"/>
      <line x1="17" y1="26" x2="11" y2="32" stroke-width="2.5"/>
      <line x1="17" y1="26" x2="26" y2="34" stroke-width="2.4"/>
      <line x1="26" y1="34" x2="36" y2="33" stroke-width="2.2"/>
      <line x1="17" y1="17" x2="17" y2="28"/>
      ${dumbbell(17, 29)}
    </g>
    <line x1="11" y1="32" x2="11" y2="43" stroke-width="2.4"/>
  `),

  "Dumbbell walking lunge": () => wrap("legs", `
    ${floor()}
    <g class="ex-anim-squat">
      ${head(22, 10)}
      ${muscle(16, 29, 3.8)}
      <line x1="22" y1="13" x2="22" y2="26" stroke-width="2.6"/>
      <line x1="22" y1="26" x2="13" y2="32" stroke-width="2.5"/>
      <line x1="22" y1="26" x2="30" y2="36" stroke-width="2.4"/>
      <line x1="30" y1="36" x2="38" y2="42" stroke-width="2.2"/>
      <line x1="22" y1="17" x2="22" y2="28"/>
      ${dumbbell(22, 29)}
    </g>
    <line x1="13" y1="32" x2="13" y2="43" stroke-width="2.4"/>
  `),

  "Dumbbell step-up": () => wrap("legs", `
    ${floor()}
    <rect x="26" y="32" width="14" height="11" rx="1.5" fill="currentColor" opacity="0.35" stroke="none"/>
    <g class="ex-anim-press-v">
      ${head(21, 9)}
      ${muscle(28, 24, 3.8)}
      <line x1="21" y1="12" x2="21" y2="25" stroke-width="2.6"/>
      <line x1="21" y1="25" x2="31" y2="24" stroke-width="2.5"/>
      <line x1="31" y1="24" x2="31" y2="32" stroke-width="2.4"/>
      <line x1="21" y1="25" x2="16" y2="42" stroke-width="2.4"/>
      <line x1="21" y1="16" x2="21" y2="26"/>
      ${dumbbell(21, 27)}
    </g>
  `),

  "Reverse lunge": () => wrap("legs", `
    ${floor()}
    <g class="ex-anim-squat">
      ${head(22, 10)}
      ${muscle(16, 29, 3.8)}
      <line x1="22" y1="13" x2="22" y2="26" stroke-width="2.6"/>
      <line x1="22" y1="17" x2="16" y2="21" stroke-width="2.2"/>
      <line x1="22" y1="26" x2="13" y2="32" stroke-width="2.5"/>
      <line x1="22" y1="26" x2="30" y2="36" stroke-width="2.4"/>
      <line x1="30" y1="36" x2="38" y2="42" stroke-width="2.2"/>
    </g>
    <line x1="13" y1="32" x2="13" y2="43" stroke-width="2.4"/>
  `),

  // ── LEGS: Calves ───────────────────────────────────────────────────────────
  "Standing calf raise": () => wrap("legs", `
    ${floor()}
    <rect x="14" y="39" width="20" height="4" rx="1" fill="currentColor" opacity="0.38" stroke="none"/>
    <g class="ex-anim-calf">
      ${head(24, 9)}
      ${muscle(20, 34, 3.2)}
      ${muscle(28, 34, 3.2)}
      <line x1="24" y1="12" x2="24" y2="27" stroke-width="2.6"/>
      <line x1="24" y1="27" x2="20" y2="38" stroke-width="2.4"/>
      <line x1="24" y1="27" x2="28" y2="38" stroke-width="2.4"/>
      <line x1="17" y1="39" x2="21" y2="38" stroke-width="2.2"/>
      <line x1="27" y1="38" x2="31" y2="39" stroke-width="2.2"/>
    </g>
  `),

  "Dumbbell calf raise": () => wrap("legs", `
    ${floor()}
    <rect x="14" y="39" width="20" height="4" rx="1" fill="currentColor" opacity="0.38" stroke="none"/>
    <g class="ex-anim-calf">
      ${head(24, 9)}
      ${muscle(20, 34, 3.2)}
      ${muscle(28, 34, 3.2)}
      <line x1="24" y1="12" x2="24" y2="27" stroke-width="2.6"/>
      <line x1="20" y1="15" x2="16" y2="25"/>
      <line x1="28" y1="15" x2="32" y2="25"/>
      ${dumbbell(15, 26)}
      ${dumbbell(33, 26)}
      <line x1="24" y1="27" x2="20" y2="38" stroke-width="2.4"/>
      <line x1="24" y1="27" x2="28" y2="38" stroke-width="2.4"/>
    </g>
  `),

  "Calf raise (machine)": () => wrap("legs", `
    ${floor()}
    <rect x="14" y="39" width="20" height="4" rx="1" fill="currentColor" opacity="0.38" stroke="none"/>
    <g class="ex-anim-calf">
      <rect x="15" y="12" width="18" height="3.5" rx="1.5" fill="currentColor" opacity="0.6" stroke="none"/>
      ${head(24, 9)}
      ${muscle(20, 34, 3.2)}
      ${muscle(28, 34, 3.2)}
      <line x1="24" y1="13" x2="24" y2="27" stroke-width="2.6"/>
      <line x1="24" y1="27" x2="20" y2="38" stroke-width="2.4"/>
      <line x1="24" y1="27" x2="28" y2="38" stroke-width="2.4"/>
    </g>
  `),

  // ── CORE ───────────────────────────────────────────────────────────────────
  "Plank": () => wrap("core", `
    ${floor(37)}
    <g class="ex-anim-pulse">
      ${head(10, 27)}
      ${muscle(23, 30, 4)}
      <line x1="13" y1="28" x2="38" y2="31" stroke-width="2.8"/>
      <line x1="16" y1="28" x2="14" y2="37" stroke-width="2.2"/>
      <line x1="14" y1="37" x2="9" y2="37" stroke-width="2.2"/>
      <line x1="38" y1="31" x2="39" y2="37" stroke-width="2.2"/>
    </g>
  `),

  "Weighted plank": () => wrap("core", `
    ${floor(37)}
    <g class="ex-anim-pulse">
      ${head(10, 27)}
      ${muscle(23, 31, 4)}
      <line x1="13" y1="28" x2="38" y2="31" stroke-width="2.8"/>
      <line x1="16" y1="28" x2="14" y2="37" stroke-width="2.2"/>
      <line x1="14" y1="37" x2="9" y2="37" stroke-width="2.2"/>
      <line x1="38" y1="31" x2="39" y2="37" stroke-width="2.2"/>
      <rect x="20" y="23" width="12" height="4.5" rx="1" fill="currentColor" opacity="0.8" stroke="none"/>
    </g>
  `),

  "Side plank": () => wrap("core", `
    ${floor(39)}
    <g class="ex-anim-pulse">
      ${head(12, 21)}
      ${muscle(23, 29, 4)}
      <line x1="15" y1="23" x2="39" y2="38" stroke-width="2.8"/>
      <line x1="16" y1="24" x2="14" y2="39" stroke-width="2.3"/>
      <line x1="18" y1="24" x2="21" y2="14" stroke-width="2"/>
    </g>
  `),

  "Dead bug": () => wrap("core", `
    ${floor(38)}
    ${head(11, 34)}
    ${muscle(22, 34, 3.8)}
    <line x1="14" y1="36" x2="29" y2="36" stroke-width="2.8"/>
    <line x1="29" y1="36" x2="29" y2="25" stroke-width="2.2"/>
    <line x1="29" y1="25" x2="36" y2="25" stroke-width="2.2"/>
    <g class="ex-anim-lat-l">
      <line x1="17" y1="35" x2="11" y2="22" stroke-width="2.2"/>
    </g>
    <g class="ex-anim-lat-r">
      <line x1="29" y1="35" x2="41" y2="26" stroke-width="2.2"/>
    </g>
  `),

  "Turkish get-up": () => wrap("core", `
    ${floor(41)}
    ${head(20, 21)}
    ${muscle(22, 29, 3.8)}
    <line x1="20" y1="24" x2="24" y2="35" stroke-width="2.6"/>
    <line x1="19" y1="25" x2="12" y2="41" stroke-width="2.2"/>
    <line x1="24" y1="35" x2="33" y2="32" stroke-width="2.3"/>
    <line x1="33" y1="32" x2="35" y2="41" stroke-width="2.2"/>
    <g class="ex-anim-press-v">
      <line x1="21" y1="24" x2="21" y2="10" stroke-width="2.3"/>
      ${kettlebell(23, 9, 0.95)}
    </g>
  `),

  "Hanging leg raise": () => wrap("core", `
    <line x1="8" y1="6" x2="40" y2="6" stroke-width="2.8" opacity="0.75"/>
    <line x1="21" y1="6" x2="21" y2="14" stroke-width="2.2"/>
    ${head(21, 16)}
    ${muscle(23, 27, 3.8)}
    <line x1="21" y1="19" x2="21" y2="30" stroke-width="2.6"/>
    <g class="ex-anim-legraise">
      <line x1="21" y1="30" x2="37" y2="26" stroke-width="2.6"/>
      <line x1="37" y1="26" x2="40" y2="23" stroke-width="2.2"/>
    </g>
  `),

  "Lying leg raise": () => wrap("core", `
    ${floor(38)}
    ${head(10, 35)}
    ${muscle(22, 34, 3.8)}
    <line x1="13" y1="36" x2="26" y2="36" stroke-width="2.8"/>
    <g class="ex-anim-legraise">
      <line x1="26" y1="36" x2="38" y2="18" stroke-width="2.6"/>
    </g>
  `),

  "Band crunch": () => wrap("core", `
    ${floor(40)}
    <circle cx="24" cy="5" r="2" fill="currentColor" opacity="0.65"/>
    <line x1="24" y1="5" x2="27" y2="20" stroke-dasharray="2 2" opacity="0.6"/>
    <line x1="17" y1="33" x2="17" y2="40" stroke-width="2.4"/>
    <line x1="17" y1="40" x2="10" y2="40" stroke-width="2.4"/>
    <g class="ex-anim-crunch">
      ${muscle(22, 28, 3.8)}
      <path d="M 17 33 Q 20 22 28 23" stroke-width="2.6"/>
      ${head(31, 24, 3)}
    </g>
  `),

  "Russian twist": () => wrap("core", `
    ${floor(39)}
    <line x1="24" y1="37" x2="34" y2="29" stroke-width="2.4"/>
    <line x1="34" y1="29" x2="40" y2="36" stroke-width="2.4"/>
    <g class="ex-anim-twist">
      ${head(16, 17)}
      ${muscle(21, 28, 4)}
      <line x1="17" y1="20" x2="24" y2="37" stroke-width="2.6"/>
      <line x1="19" y1="24" x2="12" y2="26" stroke-width="2.2"/>
      ${plateSide(10, 26, 4.2)}
    </g>
  `),

  "Bicycle crunch": () => wrap("core", `
    ${floor(38)}
    <g class="ex-anim-twist">
      ${head(12, 28)}
      ${muscle(22, 33, 3.8)}
      <line x1="14" y1="31" x2="26" y2="36" stroke-width="2.6"/>
      <line x1="14" y1="29" x2="23" y2="26" stroke-width="2.2"/>
      <line x1="26" y1="36" x2="23" y2="26" stroke-width="2.4"/>
      <line x1="23" y1="26" x2="31" y2="28" stroke-width="2.2"/>
      <line x1="26" y1="36" x2="40" y2="31" stroke-width="2.4"/>
    </g>
  `),

  // ── CARDIO ─────────────────────────────────────────────────────────────────
  "Treadmill intervals": () => wrap("cardio", `
    <line x1="6" y1="41" x2="40" y2="41" stroke-width="3" opacity="0.45"/>
    <line x1="36" y1="41" x2="40" y2="17" stroke-width="2.2" opacity="0.45"/>
    <g class="ex-anim-run">
      ${head(27, 11)}
      ${muscle(22, 24, 3.8)}
      <line x1="26" y1="14" x2="21" y2="26" stroke-width="2.6"/>
      <line x1="24" y1="17" x2="31" y2="21" stroke-width="2.2"/>
      <line x1="24" y1="17" x2="16" y2="15" stroke-width="2.2"/>
      <line x1="21" y1="26" x2="29" y2="33" stroke-width="2.4"/>
      <line x1="29" y1="33" x2="26" y2="40" stroke-width="2.2"/>
      <line x1="21" y1="26" x2="13" y2="31" stroke-width="2.4"/>
    </g>
  `),

  "Incline walk": () => wrap("cardio", `
    <line x1="6" y1="42" x2="41" y2="32" stroke-width="3" opacity="0.45"/>
    <line x1="37" y1="33" x2="40" y2="14" stroke-width="2.2" opacity="0.45"/>
    <g class="ex-anim-run">
      ${head(24, 11)}
      ${muscle(23, 25, 3.6)}
      <line x1="24" y1="14" x2="22" y2="26" stroke-width="2.6"/>
      <line x1="23" y1="17" x2="30" y2="22" stroke-width="2.2"/>
      <line x1="22" y1="26" x2="29" y2="35" stroke-width="2.4"/>
      <line x1="22" y1="26" x2="16" y2="38" stroke-width="2.4"/>
    </g>
  `),
};

// Legacy & alias names mapped to the exact icon builders above
const ALIAS_MAP = {
  "Dumbbell overhead press": "Standing dumbbell press",
  "Tricep pushdown (band)": "Band triceps pushdown",
  "Weighted plank (seconds)": "Weighted plank",
  "Plank (seconds)": "Plank",
  "Barbell row": "Barbell bent-over row",
  "Pull-up (band-assist ok)": "Pull-up",
  "Single-arm DB row": "Single-arm dumbbell row",
  "Face pull (band)": "Band face pull",
  "Dumbbell bicep curl": "Dumbbell biceps curl",
  "Cable/band crunch": "Band crunch",
  "Russian twist (w/ plate)": "Russian twist",
  "Romanian deadlift": "Dumbbell Romanian deadlift",
  "Bulgarian split squat (DB)": "Bulgarian split squat",
  "Steady-state run": "Treadmill intervals",
  "Tempo run": "Treadmill intervals",
};

export const ICONS = Object.fromEntries([
  ...Object.entries(ICON_BUILDERS).map(([k, fn]) => [k, fn()]),
  ...Object.entries(ALIAS_MAP).map(([alias, target]) => [alias, ICON_BUILDERS[target]()]),
]);

export const CATEGORY_ICONS = {
  push: ICONS["Standing dumbbell press"],
  pull: ICONS["Barbell bent-over row"],
  legs: ICONS["Barbell back squat"],
  core: ICONS["Plank"],
  cardio: ICONS["Treadmill intervals"],
};

export function iconFor(name, category) {
  if (name && ICONS[name]) return ICONS[name];
  if (name) {
    const lower = name.toLowerCase();
    if (lower.includes("incline") && lower.includes("walk")) return ICONS["Incline walk"];
    if (lower.includes("squat")) return ICONS["Barbell back squat"];
    if (lower.includes("lunge") || lower.includes("split")) return ICONS["Dumbbell walking lunge"];
    if (lower.includes("deadlift") || lower.includes("rdl") || lower.includes("hinge")) return ICONS["Barbell deadlift"];
    if (lower.includes("swing")) return ICONS["Kettlebell swing"];
    if (lower.includes("calf")) return ICONS["Standing calf raise"];
    if (lower.includes("curl")) return ICONS["Dumbbell biceps curl"];
    if (lower.includes("pull-up") || lower.includes("pullup") || lower.includes("pulldown")) return ICONS["Pull-up"];
    if (lower.includes("row")) return ICONS["Barbell bent-over row"];
    if (lower.includes("lateral")) return ICONS["Dumbbell lateral raise"];
    if (lower.includes("tricep") || lower.includes("pushdown") || lower.includes("extension") || lower.includes("dip")) return ICONS["Cable triceps pushdown"];
    if (lower.includes("bench") || lower.includes("chest") || lower.includes("push-up")) return ICONS["Barbell bench press"];
    if (lower.includes("press")) return ICONS["Standing dumbbell press"];
    if (lower.includes("crunch") || lower.includes("twist") || lower.includes("raise")) return ICONS["Hanging leg raise"];
    if (lower.includes("plank")) return ICONS["Plank"];
  }
  return CATEGORY_ICONS[category] || CATEGORY_ICONS.push;
}

export function demoLink(name) {
  const q = encodeURIComponent(name.replace(/\(.*?\)/g, "").trim() + " proper form");
  return `https://www.youtube.com/results?search_query=${q}`;
}
