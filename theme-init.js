// Applies the saved color theme before first paint so the page never flashes
// the default palette. Loaded as a tiny blocking classic script in <head>
// (CSP allows 'self' scripts; inline scripts are blocked).
//
// With no saved choice, follow the device: light OS → "light", else "emerald".
// The resolved value is NOT saved, so a later OS change still applies.
(function () {
  var theme = null;
  try { theme = localStorage.getItem("tempo_theme"); } catch (e) { /* storage blocked */ }
  if (!theme) {
    var prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    theme = prefersLight ? "light" : "emerald";
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
