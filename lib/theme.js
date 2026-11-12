// Color theme helpers. theme-init.js sets the initial data-theme before first
// paint; these keep it, localStorage, and the browser UI color in sync.

const STORAGE_KEY = "tempo_theme";

export const THEMES = [
  { id: "emerald", name: "Emerald",  desc: "Midnight & mint" },
  { id: "oled",    name: "OLED",     desc: "True black & sky" },
  { id: "amber",   name: "Sunset",   desc: "Ember & gold" },
  { id: "light",   name: "Frost",    desc: "Crisp daylight" },
];

export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "emerald";
}

export function applyTheme(id) {
  if (!THEMES.some((t) => t.id === id)) return;
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage blocked — still apply for this session */ }
  document.documentElement.setAttribute("data-theme", id);
  syncThemeColor();
}

// Match the mobile browser / PWA status bar to the active background.
export function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (bg) meta.setAttribute("content", bg);
}
