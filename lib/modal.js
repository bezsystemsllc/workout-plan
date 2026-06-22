// Promise-based modal / toast component. Replaces window.alert / window.confirm
// with styled in-app dialogs. Mounts into #modal-root.
//
// Usage:
//   await notify("Saved.");
//   const ok = await confirmAction("Delete?", { danger: true, okLabel: "Delete" });
//   toast("Logged off-plan item");

let activeResolve = null;
let escListener = null;
let previousFocus = null;

function root() { return document.getElementById("modal-root"); }

function cleanup() {
  root().querySelector(".modal-backdrop")?.remove();
  if (escListener) {
    document.removeEventListener("keydown", escListener);
    escListener = null;
  }
  if (previousFocus && typeof previousFocus.focus === "function" && document.contains(previousFocus)) {
    previousFocus.focus();
  }
  previousFocus = null;
}

function close(value) {
  cleanup();
  if (activeResolve) {
    const r = activeResolve;
    activeResolve = null;
    r(value);
  }
}

function show({ title, message, html, buttons }) {
  // If a modal is already up, resolve it first so we don't strand the promise
  if (activeResolve) close(null);

  return new Promise((resolve) => {
    activeResolve = resolve;
    previousFocus = document.activeElement;
    const wrap = document.createElement("div");
    const titleId = `modal-title-${Date.now()}`;
    wrap.className = "modal-backdrop";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    if (title) wrap.setAttribute("aria-labelledby", titleId);
    wrap.innerHTML = `
      <div class="modal-panel">
        ${title ? `<div class="modal-title" id="${titleId}">${esc(title)}</div>` : ""}
        <div class="modal-message">${html ?? esc(message)}</div>
        <div class="modal-buttons">
          ${buttons.map((b, i) => `<button data-i="${i}" class="${b.cls || ""}">${esc(b.label)}</button>`).join("")}
        </div>
      </div>
    `;
    root().appendChild(wrap);

    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) close(null);
    });
    for (const btn of wrap.querySelectorAll("button[data-i]")) {
      btn.addEventListener("click", () => close(buttons[+btn.dataset.i].value));
    }
    escListener = (e) => {
      if (e.key === "Escape") close(null);
      if (e.key === "Tab") trapFocus(wrap, e);
    };
    document.addEventListener("keydown", escListener);

    (wrap.querySelector("button.primary") || wrap.querySelector("button"))?.focus();
  });
}

// Info sheet with trusted HTML body (e.g. the daily-rules list). Content must
// be app-controlled — it is NOT escaped.
export function openInfo(title, html) {
  return show({
    title, html,
    buttons: [{ label: "Got it", value: true, cls: "primary" }],
  });
}

export async function notify(message, { title = null } = {}) {
  await show({
    title, message,
    buttons: [{ label: "OK", value: true, cls: "primary" }],
  });
}

export async function confirmAction(message, { title = null, danger = false, okLabel = "OK", cancelLabel = "Cancel" } = {}) {
  const v = await show({
    title, message,
    buttons: [
      { label: cancelLabel, value: false },
      { label: okLabel, value: true, cls: danger ? "primary danger" : "primary" },
    ],
  });
  return !!v;
}

export function toast(message, { duration = 2400 } = {}) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  root().appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, duration);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function trapFocus(wrap, e) {
  const focusable = [...wrap.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (!focusable.length) {
    e.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
