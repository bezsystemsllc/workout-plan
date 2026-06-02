// Auto-progression: derive the next session's target from logged history.
// Double-progression model — climb reps within the range at a fixed load, then
// add weight and reset to the bottom of the range. Bands/bodyweight/planks
// progress by reps or seconds instead of load.
//
// Surfaced in the workout view as a per-exercise target chip + set placeholders.

const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const roundTo = (v, step) => Math.round(v / (step || 5)) * (step || 5);

function range(reps) {
  const m = String(reps).match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (m) return [+m[1], +m[2]];
  const one = String(reps).match(/(\d+)/);
  return one ? [+one[1], +one[1]] : [8, 12];
}

// Most-recent-first sessions of `day` that include this exercise.
function sessionsFor(name, day, allWorkouts) {
  return Object.entries(allWorkouts)
    .filter(([, s]) => s.day === day)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, s]) => s.exercises.find(e => e.name === name))
    .filter(Boolean);
}

const logged = (ex) => ex.sets.filter(s => num(s.r) > 0);

export function progressionFor(meta, day, allWorkouts) {
  const isTime = meta.prog === "time";
  const unit = isTime ? "s" : "";
  const [lo, hi] = range(meta.reps);
  const history = sessionsFor(meta.name, day, allWorkouts).filter(ex => logged(ex).length);

  if (!history.length) {
    return { kind: "new", text: "First session — pick a load you control for every set.", target: null };
  }

  const sets = logged(history[0]);
  const reps = sets.map(s => num(s.r));
  const minReps = Math.min(...reps);
  const topWeight = Math.max(...sets.map(s => num(s.w)), 0);
  const enough = sets.length >= Math.max(1, Math.floor(meta.sets * 0.6));
  const hitTop = enough && reps.every(r => r >= hi);

  // ── Load-based (dumbbell / barbell / EZ-bar) ──
  if (meta.prog === "weight" && topWeight > 0) {
    const prev = history[1] ? logged(history[1]) : null;
    const prevMin = prev ? Math.min(...prev.map(s => num(s.r))) : null;
    if (minReps < lo && prevMin != null && prevMin < lo) {
      const w = roundTo(topWeight * 0.9, meta.inc);
      return { kind: "deload", text: `Deload to ${w} lb — under ${lo} reps two sessions running.`, target: { w, r: hi } };
    }
    if (hitTop) {
      const w = topWeight + (meta.inc || 5);
      return { kind: "up", text: `Go up → ${w} lb × ${lo} (you hit ${hi}s last time).`, target: { w, r: lo } };
    }
    return { kind: "hold", text: `Hold ${topWeight} lb — beat ${reps.join("/")} reps.`, target: { w: topWeight, r: Math.min(hi, minReps + 1) } };
  }

  // ── Rep / time-based (bands, bodyweight, planks) ──
  if (hitTop) {
    const tgt = isTime ? hi + 10 : hi + 2;
    const how = isTime ? `${tgt}${unit}` : `${tgt}+ reps or a harder variation`;
    return { kind: "up", text: `Progress → ${how} (topped the range last time).`, target: { w: topWeight || "", r: tgt } };
  }
  return { kind: "hold", text: `Beat ${reps.join("/")}${unit} from last time.`, target: { w: topWeight || "", r: Math.min(hi, minReps + (isTime ? 5 : 1)) } };
}
