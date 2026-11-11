import { renderToday } from "./views/today.js";
import { renderWorkout } from "./views/workout.js";
import { renderMeals } from "./views/meals.js";
import { renderProgress } from "./views/progress.js";
import { renderSettings } from "./views/settings.js";
import { load } from "./storage.js";
import { RULES } from "./data/meals.js";
import { openInfo } from "./lib/modal.js";

const APP = document.getElementById("app");

// Initialize saved color theme
const savedTheme = localStorage.getItem("tempo_theme");
if (savedTheme) {
  document.documentElement.setAttribute("data-theme", savedTheme);
}

const ROUTES = {
  today: { title: "Today", render: renderToday },
  workout: { title: "Workout", render: renderWorkout },
  meals: { title: "Meals", render: renderMeals },
  progress: { title: "Progress", render: renderProgress },
  settings: { title: "Settings", render: renderSettings },
};

export function navigate(name) {
  if (location.pathname !== `/${name}`) history.pushState({}, "", `/${name}`);
  route();
}

function currentTab() {
  const seg = location.pathname.replace(/^\/+/, "").split("/")[0];
  return ROUTES[seg] ? seg : "today";
}

let routeTimer = null;

function route() {
  const settings = load("settings");
  const needsOnboarding = !settings.profile;
  const requestedTab = currentTab();
  const tab = needsOnboarding ? "settings" : requestedTab;
  const def = ROUTES[tab];
  // Hide the tab bar until onboarding is done — otherwise the tabs look
  // clickable but every route is pinned back to Welcome.
  document.body.classList.toggle("onboarding", needsOnboarding);
  document.getElementById("view-title").textContent = needsOnboarding ? "Welcome" : def.title;
  for (const el of document.querySelectorAll(".tab")) {
    el.classList.toggle("active", el.dataset.tab === tab);
  }

  const renderContent = () => {
    APP.innerHTML = "";
    try {
      def.render(APP, { onboarding: needsOnboarding, requestedTab });
    } catch (e) {
      console.error("View failed to render:", e);
      APP.innerHTML = `<section class="card"><h2>Something went wrong</h2><p class="hint">The app hit an error rendering this page — your data is safe.</p><button class="primary" id="err-reload" style="width:100%;margin-top:10px">Reload app</button></section>`;
      APP.querySelector("#err-reload").addEventListener("click", () => location.reload());
    }
    window.scrollTo(0, 0);
  };

  clearTimeout(routeTimer);
  if (APP.innerHTML.trim() !== "") {
    APP.classList.add("fade-out");
    routeTimer = setTimeout(() => {
      routeTimer = null;
      renderContent();
      APP.classList.remove("fade-out");
    }, 150);
  } else {
    APP.classList.remove("fade-out");
    renderContent();
  }
}

// Back/forward buttons
window.addEventListener("popstate", route);

// Intercept tab clicks → client-side navigation (no full page reload).
document.querySelector(".tabs").addEventListener("click", (e) => {
  const a = e.target.closest("a.tab");
  if (!a) return;
  e.preventDefault();
  navigate(a.dataset.tab);
});

document.getElementById("today-date").textContent = new Date().toLocaleDateString(undefined, {
  weekday: "long", month: "short", day: "numeric",
});

// Daily-rules help sheet — reachable from any page via the header button.
document.getElementById("help-btn")?.addEventListener("click", () => {
  openInfo("Daily rules", `<p class="modal-lead">A few habits to keep every day:</p><ul class="help-rules">${RULES.map((r) => `<li>${r}</li>`).join("")}</ul>`);
});

route();

// Register the service worker for offline use + installability (PWA).
if ("serviceWorker" in navigator) {
  let refreshing = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      reg.update();
      // A worker already waiting at launch can take over now — nothing has
      // been typed yet. Workers that finish installing mid-session stay
      // waiting until the next launch, so an update never reloads the app
      // under the user's fingers (discarding unsaved set inputs).
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }).catch((e) => console.warn("SW registration failed", e));
  });
}
