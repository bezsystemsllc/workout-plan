// Personal records (PRs), 1RM calculations, and celebratory confetti engine.

const num = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

/**
 * Estimate 1 Rep Max using the Epley formula: 1RM = Weight * (1 + Reps / 30)
 * Standard across strength and hypertrophy training.
 */
export function estimate1RM(weight, reps) {
  const w = num(weight);
  const r = num(reps);
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

/**
 * Extract all historical logged sets for an exercise across all saved workouts.
 * Returns chronologically sorted sessions.
 */
export function getExerciseHistory(exerciseName, allWorkouts) {
  if (!allWorkouts || typeof allWorkouts !== "object") return [];

  const sessions = [];
  const sortedDates = Object.keys(allWorkouts).sort();

  for (const date of sortedDates) {
    const session = allWorkouts[date];
    if (!session || !Array.isArray(session.exercises)) continue;

    const ex = session.exercises.find((e) => e && e.name === exerciseName);
    if (!ex || !Array.isArray(ex.sets)) continue;

    const validSets = ex.sets
      .filter((s) => s && num(s.r) > 0)
      .map((s) => ({
        w: num(s.w),
        r: num(s.r),
        est1RM: estimate1RM(s.w, s.r),
      }));

    if (validSets.length > 0) {
      const maxWeight = Math.max(...validSets.map((s) => s.w));
      const best1RM = Math.max(...validSets.map((s) => s.est1RM));
      const volume = validSets.reduce((sum, s) => sum + s.w * s.r, 0);

      sessions.push({
        date,
        sets: validSets,
        maxWeight,
        best1RM,
        volume,
      });
    }
  }

  return sessions;
}

/**
 * Compute lifetime PRs across all exercises in the database.
 */
export function getAllTimePRs(allWorkouts) {
  if (!allWorkouts || typeof allWorkouts !== "object") return {};

  const prMap = {};

  for (const [date, session] of Object.entries(allWorkouts)) {
    if (!session || !Array.isArray(session.exercises)) continue;

    for (const ex of session.exercises) {
      if (!ex || !ex.name || !Array.isArray(ex.sets)) continue;
      const name = ex.name;

      if (!prMap[name]) {
        prMap[name] = {
          name,
          category: ex.category || "lift",
          maxWeight: 0,
          maxWeightDate: null,
          best1RM: 0,
          best1RMDate: null,
          bestRepsAtWeight: { weight: 0, reps: 0, date: null },
          totalSets: 0,
          totalVolume: 0,
        };
      }

      const rec = prMap[name];
      for (const s of ex.sets) {
        const w = num(s.w);
        const r = num(s.r);
        if (r <= 0) continue;

        rec.totalSets++;
        rec.totalVolume += w * r;

        const est = estimate1RM(w, r);
        if (est > rec.best1RM && w > 0) {
          rec.best1RM = est;
          rec.best1RMDate = date;
        }

        if (w > rec.maxWeight && w > 0) {
          rec.maxWeight = w;
          rec.maxWeightDate = date;
          rec.bestRepsAtWeight = { weight: w, reps: r, date };
        } else if (w === rec.maxWeight && r > rec.bestRepsAtWeight.reps && w > 0) {
          rec.bestRepsAtWeight = { weight: w, reps: r, date };
        }
      }
    }
  }

  return prMap;
}

/**
 * Check if a newly completed set constitutes an all-time PR for this exercise.
 */
export function checkSetForPR(exerciseName, weight, reps, allWorkouts, currentDate, currentSetIndex = -1) {
  const w = num(weight);
  const r = num(reps);
  if (w <= 0 || r <= 0) return { isPR: false };

  const current1RM = estimate1RM(w, r);
  let priorBest1RM = 0;
  let priorMaxWeight = 0;

  for (const [date, session] of Object.entries(allWorkouts || {})) {
    if (!session || !Array.isArray(session.exercises)) continue;
    const ex = session.exercises.find((e) => e && e.name === exerciseName);
    if (!ex || !Array.isArray(ex.sets)) continue;

    ex.sets.forEach((s, idx) => {
      // Exclude the current set being tested if it's already in state
      if (date === currentDate && idx === currentSetIndex) return;

      const sw = num(s.w);
      const sr = num(s.r);
      if (sr <= 0) return;

      if (sw > priorMaxWeight) priorMaxWeight = sw;
      const s1RM = estimate1RM(sw, sr);
      if (s1RM > priorBest1RM) priorBest1RM = s1RM;
    });
  }

  // If this is the very first time logging this exercise, don't celebrate as PR unless heavy
  if (priorBest1RM === 0 && priorMaxWeight === 0) {
    return { isPR: false, isFirst: true };
  }

  if (current1RM > priorBest1RM) {
    return {
      isPR: true,
      type: "1rm",
      prev: priorBest1RM,
      current: current1RM,
      label: `Est. 1RM ${current1RM} (previous: ${priorBest1RM})`,
    };
  }

  if (w > priorMaxWeight) {
    return {
      isPR: true,
      type: "weight",
      prev: priorMaxWeight,
      current: w,
      label: `Max Weight ${w} (previous: ${priorMaxWeight})`,
    };
  }

  return { isPR: false };
}

/**
 * Confetti particle blast celebration.
 * Pure canvas implementation, 0 external dependencies.
 */
export function launchConfetti() {
  try {
    const existing = document.getElementById("confetti-canvas");
    if (existing) existing.remove();

    const canvas = document.createElement("canvas");
    canvas.id = "confetti-canvas";
    canvas.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 99999;
    `;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const colors = ["#4ade80", "#22c55e", "#f59e0b", "#fbbf24", "#38bdf8", "#ec4899", "#a855f7"];
    const particles = [];
    const count = 70;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: w * 0.5 + (Math.random() - 0.5) * 80,
        y: h * 0.4 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 12 - 4,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        alpha: 1,
        gravity: 0.35,
      });
    }

    let start = performance.now();
    const duration = 1800; // 1.8 seconds

    function frame(now) {
      const elapsed = now - start;
      if (elapsed > duration) {
        canvas.remove();
        return;
      }

      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.rotSpeed;
        p.vx *= 0.98;
        p.alpha = Math.max(0, 1 - elapsed / duration);

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  } catch (e) {
    // Graceful fallback if canvas is unsupported
  }
}
