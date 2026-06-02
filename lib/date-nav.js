// Reusable date navigator: ◀  [Mon, May 26]  ▶  Today
// Returns HTML and a wire(root, onChange) function.

import { todayISO } from "../storage.js";

export function dateNavHtml(currentISO) {
  const today = todayISO();
  const isToday = currentISO === today;
  const d = new Date(currentISO + "T12:00:00"); // noon to dodge DST edge
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const when = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const isPast = currentISO < today;
  const isFuture = currentISO > today;

  return `
    <div class="date-nav">
      <button class="arrow" data-date-step="-1" aria-label="Previous day">◀</button>
      <label class="date-label" for="date-picker-input">
        <span class="weekday">${isToday ? "Today" : isFuture ? "Future" : weekday}</span>
        <span class="when">${when}</span>
        <input id="date-picker-input" type="date" value="${currentISO}" max="${today}" />
      </label>
      ${isToday
        ? `<button class="arrow" data-date-step="+1" disabled aria-label="Next day" style="opacity:0.4">▶</button>`
        : `<button class="arrow" data-date-step="+1" aria-label="Next day">▶</button>`}
      ${!isToday ? `<button class="arrow" data-date-today>Today</button>` : ""}
    </div>
    ${isPast ? `<div class="past-banner">⚠ Viewing past date — changes will edit history.</div>` : ""}
  `;
}

export function wireDateNav(root, currentISO, onChange) {
  for (const btn of root.querySelectorAll("button[data-date-step]")) {
    if (btn.disabled) continue;
    btn.addEventListener("click", () => {
      const step = parseInt(btn.dataset.dateStep);
      onChange(addDays(currentISO, step));
    });
  }
  const label = root.querySelector(".date-label");
  label?.addEventListener("click", (e) => {
    if (e.target.tagName !== "INPUT") root.querySelector("#date-picker-input")?.showPicker?.();
  });
  root.querySelector("#date-picker-input")?.addEventListener("change", (e) => {
    if (e.target.value) onChange(e.target.value);
  });
  root.querySelector("button[data-date-today]")?.addEventListener("click", () => onChange(todayISO()));
}

function addDays(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
