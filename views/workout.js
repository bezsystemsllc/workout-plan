import { getActivePlan, alternativesFor, prescribeExercise, dayLabelFor, DEFAULT_PREFS } from "../lib/plan.js";
import { EXERCISES, exercisesFor } from "../data/exercises.js";
import { iconFor, demoLink } from "../data/exercise-icons.js";
import { coachNoteForExercise, latestCoachReview } from "../lib/coach.js";
import { buildProgressionHistory, progressionFor, sessionsForDay } from "../lib/progression.js";
import { confirmAction, toast } from "../lib/modal.js";
import { dateNavHtml, wireDateNav } from "../lib/date-nav.js";
import { esc } from "../lib/html.js";
import { load, update, todayISO } from "../storage.js";
import { mountTimer } from "./timer.js";

export function renderWorkout(root) {
  let viewedDate = todayISO();

  function render() {
    const plan = getActivePlan();
    const allWorkouts = load("workouts");
    const dow = weekday(viewedDate);
    const split = plan.splits[dow];
    const existing = allWorkouts[viewedDate];

    // What to show:
    //   1. A logged session for this date → show it (its own day type)
    //   2. Else a lift day → show that day's prescribed workout
    //   3. Else a picker to log a lift on a rest/cardio day
    const day = existing?.day || (split.type === "lift" ? split.day : null);

    if (day) {
      renderSessionView(root, viewedDate, day, allWorkouts, render, split, plan);
    } else {
      renderPickerView(root, viewedDate, split, render, plan);
    }

    wireDateNav(root, viewedDate, (next) => {
      viewedDate = next;
      render();
    });
  }

  render();
}

function renderPickerView(root, dateKey, split, rerender, plan) {
  const dayKeys = Object.keys(plan.workouts);
  root.innerHTML = `
    ${dateNavHtml(dateKey)}
    <section class="card">
      <h2>${esc(split.label)}</h2>
      <p class="muted">${esc(split.type === "rest" ? "Rest day — recovery." : (split.detail || "Conditioning day."))} Want to log a lift anyway?</p>
      <div class="grid-2" style="margin-top:8px">
        ${dayKeys.map(k => `<button data-pick="${esc(k)}">${esc(dayLabelFor(k))}</button>`).join("")}
      </div>
    </section>
  `;
  for (const b of root.querySelectorAll("button[data-pick]")) {
    b.addEventListener("click", () => {
      const pick = b.dataset.pick;
      update("workouts", (all) => ({
        ...all,
        [dateKey]: { day: pick, exercises: blankSession(plan.workouts[pick]) },
      }));
      rerender();
    });
  }
}

function renderSessionView(root, dateKey, day, allWorkouts, rerender, split, plan) {
  const template = plan.workouts[day] || [];
  const existing = allWorkouts[dateKey];
  const isLogged = !!existing;
  const isToday = dateKey === todayISO();
  const canCustomize = !plan.meta?.fallback && !!plan.workouts[day];
  const equipment = plan.meta?.equipment || DEFAULT_PREFS.equipment;
  const settings = load("settings");
  const goal = plan.meta?.goal || settings.profile?.goal || "fat_loss";
  const starterContext = {
    profile: settings.profile,
    experience: plan.meta?.experience || settings.trainingPrefs?.experience || "beginner",
    units: settings.units || "imperial",
  };
  const daySessions = sessionsForDay(day, allWorkouts);
  const lastSession = daySessions.find(s => s.date !== dateKey) || null;
  const progressionHistory = buildProgressionHistory(day, allWorkouts, daySessions);
  const coachReview = latestCoachReview();

  const metaByName = Object.fromEntries(template.map(m => [m.name, hydrateExerciseMeta(m)]));
  const session = isLogged
    ? existing
    : { day, exercises: blankSession(template) };

  const items = session.exercises.map((logged, ei) => {
    const meta = metaByName[logged.name] || hydrateExerciseMeta({
      name: logged.name, category: logged.category, reps: "8–12",
      rest: 90, sets: logged.sets.length,
    });
    return { meta, logged, ei };
  });

  function setSession(next) {
    update("workouts", (all) => ({ ...all, [dateKey]: next }));
  }
  function setTemplate(nextList) {
    update("settings", (s) => ({
      ...s,
      plan: { ...s.plan, workouts: { ...s.plan.workouts, [day]: nextList } },
    }));
  }

  const pool = exercisesFor(equipment);
  const activeSet = findActiveSet(items);

  root.innerHTML = `
    ${dateNavHtml(dateKey)}
    <section class="card">
      <div class="spread"><h2 style="margin:0">${esc(dayLabelFor(day))}</h2><span class="muted">${esc(dateKey)}</span></div>
      ${lastSession ? `<div class="hint">Last ${esc(dayLabelFor(day))} session: ${esc(lastSession.date)}</div>` : `<div class="hint">No prior ${esc(dayLabelFor(day))} session — set your starting weights.</div>`}
      ${!isToday && split.type !== "lift" ? `<div class="hint" style="margin-top:6px">${esc(split.label)} on this date — logging a lift anyway.</div>` : ""}
    </section>

    ${renderGuidedSet(activeSet, items, lastSession, day, allWorkouts, progressionHistory, starterContext)}

    <details class="workout-details">
      <summary>
        <span>Full workout</span>
        <span class="muted small">${esc(completedSets(items))}/${esc(totalSets(items))} sets</span>
      </summary>
      <div class="workout-details-body">
        ${items.map(it => renderExercise(
          it.meta,
          it.logged,
          lastSession?.exercises?.find(e => e.name === it.meta.name),
          it.ei,
          day,
          allWorkouts,
          progressionHistory,
          starterContext,
          canCustomize,
          equipment,
          coachNoteForExercise(coachReview, it.meta.name),
        )).join("")}
      </div>
    </details>

    ${canCustomize ? `
      <section class="card add-ex">
        <label>Add an exercise</label>
        <div class="row" style="gap:8px">
          <select id="add-ex-select" style="flex:1">
            ${pool.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("")}
          </select>
          <button class="ghost" id="add-ex-btn">Add</button>
        </div>
      </section>
    ` : ""}

    <section class="card save-bar">
      <button class="primary" id="finish" style="width:100%">${isLogged ? "Update session" : "Save session"}</button>
      ${isLogged ? `<button class="danger ghost" id="clear" style="width:100%;margin-top:8px">Discard this session</button>` : ""}
    </section>
  `;

  for (const inp of root.querySelectorAll("input[data-ei]")) {
    inp.addEventListener("input", (e) => {
      const ei = +e.target.dataset.ei, si = +e.target.dataset.si, field = e.target.dataset.field;
      session.exercises[ei].sets[si][field] = e.target.value;
    });
  }

  root.querySelector("button[data-complete-set]")?.addEventListener("click", () => {
    if (!activeSet) return;
    const loadEl = root.querySelector("[data-guide-field='w']");
    const repsEl = root.querySelector("[data-guide-field='r']");
    const ei = +loadEl?.dataset.ei;
    const si = +loadEl?.dataset.si;
    if (!Number.isInteger(ei) || !Number.isInteger(si) || !session.exercises[ei]?.sets[si]) return;

    session.exercises[ei].sets[si].w = loadEl.value;
    session.exercises[ei].sets[si].r = repsEl.value;
    if (!String(repsEl.value).trim()) {
      toast("Enter reps or time before moving on");
      repsEl.focus();
      return;
    }

    setSession(session);
    const done = !findActiveSet(itemsAfter(session, items));
    toast(done ? "Workout complete" : "Set saved");
    rerender();
    if (!done) mountTimer(activeSet.meta.rest || 90);
  });

  for (const btn of root.querySelectorAll("button[data-rest]")) {
    btn.addEventListener("click", () => mountTimer(+btn.dataset.rest));
  }

  // ── Customization (only when a generated plan is active) ──
  for (const sel of root.querySelectorAll("select[data-swap]")) {
    sel.addEventListener("change", (e) => swapExercise(+e.target.dataset.swap, e.target.value));
  }
  for (const btn of root.querySelectorAll("button[data-addset]")) {
    btn.addEventListener("click", () => changeSets(+btn.dataset.addset, +1));
  }
  for (const btn of root.querySelectorAll("button[data-rmset]")) {
    btn.addEventListener("click", () => changeSets(+btn.dataset.rmset, -1));
  }
  for (const btn of root.querySelectorAll("button[data-rmex]")) {
    btn.addEventListener("click", () => removeExercise(+btn.dataset.rmex));
  }
  root.querySelector("#add-ex-btn")?.addEventListener("click", () => {
    const id = root.querySelector("#add-ex-select").value;
    addExercise(id);
  });

  root.querySelector("#finish").addEventListener("click", () => {
    setSession(session);
    toast(isLogged ? "Session updated" : "Session saved — beat these numbers next time");
    rerender();
  });
  root.querySelector("#clear")?.addEventListener("click", async () => {
    const ok = await confirmAction(`Discard logged session for ${dateKey}?`, {
      title: "Discard session?", okLabel: "Discard", danger: true,
    });
    if (!ok) return;
    update("workouts", (all) => { const c = { ...all }; delete c[dateKey]; return c; });
    rerender();
  });

  // Snapshot current inputs so structural edits don't drop unsaved values.
  function snapshot() { setSession(session); }
  function editSavedSession(fn) {
    update("workouts", (all) => {
      const s = structuredClone(all[dateKey]);
      fn(s);
      return { ...all, [dateKey]: s };
    });
  }

  function swapExercise(ei, newId) {
    const name = session.exercises[ei].name;
    const keepSets = session.exercises[ei].sets.length;
    const fresh = prescribeExercise(newId, goal, keepSets);
    if (!fresh || fresh.name === name) return;
    snapshot();
    const tIdx = template.findIndex(m => m.name === name);
    if (tIdx >= 0) { const list = [...template]; list[tIdx] = fresh; setTemplate(list); }
    editSavedSession(s => { s.exercises[ei] = { name: fresh.name, category: fresh.category, sets: blankSets(fresh.sets) }; });
    toast(`Swapped to ${fresh.name}`);
    rerender();
  }

  function changeSets(ei, delta) {
    const count = session.exercises[ei].sets.length;
    const next = count + delta;
    if (next < 1 || next > 10) return;
    snapshot();
    const name = session.exercises[ei].name;
    const tIdx = template.findIndex(m => m.name === name);
    if (tIdx >= 0) { const list = [...template]; list[tIdx] = { ...list[tIdx], sets: next }; setTemplate(list); }
    editSavedSession(s => {
      if (delta > 0) s.exercises[ei].sets.push({ w: "", r: "" });
      else s.exercises[ei].sets.pop();
    });
    rerender();
  }

  function removeExercise(ei) {
    const name = session.exercises[ei].name;
    snapshot();
    const tIdx = template.findIndex(m => m.name === name);
    if (tIdx >= 0) setTemplate(template.filter((_, i) => i !== tIdx));
    editSavedSession(s => { s.exercises.splice(ei, 1); });
    toast(`Removed ${name}`);
    rerender();
  }

  function addExercise(id) {
    const fresh = prescribeExercise(id, goal, 3);
    if (!fresh) return;
    if (session.exercises.some(e => e.name === fresh.name)) { toast(`${fresh.name} is already in this day`); return; }
    snapshot();
    setTemplate([...template, fresh]);
    editSavedSession(s => { s.exercises.push({ name: fresh.name, category: fresh.category, sets: blankSets(fresh.sets) }); });
    toast(`Added ${fresh.name}`);
    rerender();
  }
}

function renderGuidedSet(activeSet, items, lastSession, day, allWorkouts, progressionHistory, starterContext) {
  const total = totalSets(items);
  const complete = completedSets(items);
  if (!activeSet) {
    return `
      <section class="card guided-set guided-complete">
        <div class="spread">
          <div>
            <div class="muted small">Workout complete</div>
            <h2>All sets logged</h2>
          </div>
          <span class="guided-progress">${esc(complete)}/${esc(total)}</span>
        </div>
      </section>
    `;
  }

  const { meta, logged, ei, si } = activeSet;
  const lastEx = lastSession?.exercises?.find(e => e.name === meta.name);
  const lastSet = lastEx?.sets?.[si];
  const prog = progressionFor(meta, day, allWorkouts, progressionHistory, starterContext);
  const loadInput = loadInputFor(meta, starterContext?.units);
  const current = logged.sets[si] || { w: "", r: "" };
  const targetW = prog.target?.w ?? "";
  const targetR = prog.target?.r ?? "";
  const lastLbl = lastSet && (lastSet.w || lastSet.r) ? `${lastSet.w || "-"} x ${lastSet.r || "-"}` : "-";
  const hasNext = !!nextSetAfter(items, ei, si);

  return `
    <section class="card guided-set">
      <div class="guided-top">
        <div class="ex-title">
          <span class="ex-icon-wrap">${iconFor(meta.name, meta.category)}</span>
          <div>
            <div class="muted small">Set ${esc(si + 1)} of ${esc(logged.sets.length)}</div>
            <div class="ex-name">${esc(meta.name)}</div>
          </div>
        </div>
        <span class="guided-progress">${esc(complete)}/${esc(total)}</span>
      </div>
      ${prog.text ? `<div class="overload-hint hint-${esc(prog.kind)}">${PROG_ICON[prog.kind] || "•"} ${esc(prog.text)}</div>` : ""}
      <div class="guided-meta">
        <div><span>Target</span><b>${esc(meta.reps)}</b></div>
        <div><span>Last</span><b>${esc(lastLbl)}</b></div>
        <div><span>Rest</span><b>${esc(meta.rest)}s</b></div>
      </div>
      <div class="guided-inputs">
        <label>
          <span>${esc(loadInput.label)}</span>
          <input type="${loadInput.type}" inputmode="${loadInput.inputmode}" ${loadInput.type === "number" ? 'step="0.5" min="0"' : ""} data-guide-field="w" data-ei="${ei}" data-si="${si}" data-field="w" value="${esc(current.w)}" placeholder="${esc(targetW || lastSet?.w || "")}" />
        </label>
        <label>
          <span>Reps/time</span>
          <input type="number" inputmode="numeric" min="0" data-guide-field="r" data-ei="${ei}" data-si="${si}" data-field="r" value="${esc(current.r)}" placeholder="${esc(targetR || lastSet?.r || "")}" />
        </label>
      </div>
      <button class="primary guided-next" data-complete-set>${hasNext ? "Next set" : "Finish workout"}</button>
    </section>
  `;
}

function renderExercise(meta, logged, lastEx, ei, day, allWorkouts, progressionHistory, starterContext, canCustomize, equipment, coachNote) {
  const lastSets = lastEx?.sets || [];
  const prog = progressionFor(meta, day, allWorkouts, progressionHistory, starterContext);
  const chip = prog.text ? `<div class="overload-hint hint-${esc(prog.kind)}">${PROG_ICON[prog.kind] || "💡"} ${esc(prog.text)}</div>` : "";
  const coachChip = coachNote
    ? `<div class="overload-hint hint-hold">Coach: ${esc(coachActionLabel(coachNote.action))} — ${esc(coachNote.target)}. ${esc(coachNote.reason)}</div>`
    : "";
  const tW = prog.target?.w ?? "";
  const tR = prog.target?.r ?? "";
  const loadInput = loadInputFor(meta, starterContext?.units);
  const alts = canCustomize ? alternativesFor(meta, equipment) : [];

  return `
    <section class="card exercise" data-ex="${ei}">
      <div class="ex-head">
        <div class="ex-title">
          <span class="ex-icon-wrap">${iconFor(meta.name, meta.category)}</span>
          <div>
            <div class="ex-name">${esc(meta.name)}</div>
            <a class="ex-demo" href="${esc(demoLink(meta.name))}" target="_blank" rel="noopener noreferrer">▶ Watch demo</a>
          </div>
        </div>
        <div class="ex-head-right">
          <span class="ex-target">${esc(meta.sets)}×${esc(meta.reps)}</span>
          ${canCustomize && alts.length > 1 ? `
            <label class="swap" title="Swap exercise">
              <span aria-hidden="true">⇄</span>
              <select data-swap="${ei}" aria-label="Swap ${esc(meta.name)}">
                ${alts.map(a => `<option value="${esc(a.id)}" ${a.name === meta.name ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
              </select>
            </label>` : ""}
        </div>
      </div>
      ${chip}
      ${coachChip}
      <div class="set-row" style="margin-top:8px">
        <span class="idx muted small">#</span>
        <label class="muted small" style="margin:0">${loadInput.label}</label>
        <label class="muted small" style="margin:0">Reps</label>
        <span class="last">Last</span>
      </div>
      ${logged.sets.map((s, si) => {
        const l = lastSets[si];
        const lastLbl = l && (l.w || l.r) ? `${l.w || "—"}×${l.r || "—"}` : "—";
        return `
          <div class="set-row">
            <span class="idx">${si + 1}</span>
            <input type="${loadInput.type}" inputmode="${loadInput.inputmode}" ${loadInput.type === "number" ? 'step="0.5" min="0"' : ""} data-ei="${ei}" data-si="${si}" data-field="w" value="${esc(s.w)}" placeholder="${esc(tW || l?.w || "")}" />
            <input type="number" inputmode="numeric" min="0" data-ei="${ei}" data-si="${si}" data-field="r" value="${esc(s.r)}" placeholder="${esc(tR || l?.r || "")}" />
            <span class="last">${esc(lastLbl)}</span>
          </div>
        `;
      }).join("")}
      <div class="set-actions">
        ${canCustomize ? `
          <button class="ghost small" data-addset="${ei}">＋ set</button>
          ${logged.sets.length > 1 ? `<button class="ghost small" data-rmset="${ei}">－ set</button>` : ""}
          <button class="ghost small" data-rmex="${ei}" title="Remove exercise" aria-label="Remove ${esc(meta.name)}">✕</button>
        ` : ""}
        <button class="ghost small" data-rest="${esc(meta.rest)}">⏱ ${esc(meta.rest)}s rest</button>
      </div>
    </section>
  `;
}

const PROG_ICON = { up: "↑", hold: "→", deload: "⤵", new: "•" };
function coachActionLabel(action) {
  return {
    increase_reps: "increase reps",
    increase_load: "increase load",
    hold: "hold",
    deload: "deload",
    swap: "swap",
    rest: "rest",
  }[action] || "hold";
}

const EXERCISE_ALIASES = {
  "Barbell row": "Barbell bent-over row",
  "Bulgarian split squat (DB)": "Bulgarian split squat",
  "Cable/band crunch": "Band crunch",
  "Dumbbell bicep curl": "Dumbbell biceps curl",
  "Dumbbell overhead press": "Seated dumbbell press",
  "Face pull (band)": "Band face pull",
  "Plank (seconds)": "Plank",
  "Pull-up (band-assist ok)": "Pull-up",
  "Romanian deadlift": "Dumbbell Romanian deadlift",
  "Russian twist (w/ plate)": "Russian twist",
  "Single-arm DB row": "Single-arm dumbbell row",
  "Tricep pushdown (band)": "Band triceps pushdown",
  "Weighted plank (seconds)": "Weighted plank",
};

function hydrateExerciseMeta(ex) {
  const matchName = EXERCISE_ALIASES[ex.name] || ex.name;
  const match = EXERCISES.find(e => e.name === matchName);
  if (!match) return ex;
  return {
    ...match,
    ...ex,
    category: ex.category || match.category,
    pattern: ex.pattern || match.pattern,
    equip: ex.equip || match.equip,
    prog: ex.prog || match.prog,
    inc: ex.inc ?? match.inc,
    compound: ex.compound ?? match.compound,
    reps: ex.reps && ex.reps !== "—" ? ex.reps : match.reps,
  };
}

function loadInputFor(meta, units) {
  const equip = meta.equip || [];
  if (equip.includes("band")) return { label: "Band", type: "text", inputmode: "text" };
  if (equip.includes("bodyweight") && meta.prog !== "weight") return { label: "Load", type: "text", inputmode: "text" };
  return { label: `Weight (${units === "metric" ? "kg" : "lb"})`, type: "number", inputmode: "decimal" };
}

function findActiveSet(items) {
  for (const item of items) {
    const si = item.logged.sets.findIndex(set => !setComplete(set));
    if (si >= 0) return { ...item, si };
  }
  return null;
}

function nextSetAfter(items, ei, si) {
  let found = false;
  for (const item of items) {
    for (let i = 0; i < item.logged.sets.length; i++) {
      if (found && !setComplete(item.logged.sets[i])) return { ...item, si: i };
      if (item.ei === ei && i === si) found = true;
    }
  }
  return null;
}

function itemsAfter(session, items) {
  return items.map(item => ({ ...item, logged: session.exercises[item.ei] || item.logged }));
}

function completedSets(items) {
  return items.reduce((sum, item) => sum + item.logged.sets.filter(setComplete).length, 0);
}

function totalSets(items) {
  return items.reduce((sum, item) => sum + item.logged.sets.length, 0);
}

function setComplete(set) {
  return String(set?.r || "").trim() !== "";
}

function blankSets(n) { return Array.from({ length: n }, () => ({ w: "", r: "" })); }
function blankSession(list) {
  return list.map(e => ({ name: e.name, category: e.category, sets: blankSets(e.sets) }));
}

function weekday(iso) {
  const d = new Date(iso + "T12:00:00");
  return ["sun","mon","tue","wed","thu","fri","sat"][d.getDay()];
}
