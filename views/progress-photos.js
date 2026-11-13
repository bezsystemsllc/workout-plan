import { load, loadApiKey } from "../storage.js";
import { DEFAULT_PREFS, STYLE_OPTIONS } from "../lib/plan.js";
import { EQUIPMENT } from "../data/exercises.js";
import { compareProgressPhotos } from "../lib/progress-photo-ai.js";
import { navigate } from "../app.js";

export function progressPhotosHtml() {
  return `<details class="card progress-photos">
    <summary>Compare progress photos</summary>
    <p class="hint">Choose an earlier and a recent photo in similar lighting, clothing, and poses. Tempo sends both photos directly to OpenAI using your saved key when you compare them. Tempo does not save the photos.</p>
    <form id="progress-photo-form">
      <fieldset class="progress-photo-fields">
        <label>Earlier photo <input type="file" name="earlier" accept="image/*" required></label>
        <label>Recent photo <input type="file" name="recent" accept="image/*" required></label>
        <label>Training notes (optional)
          <textarea name="notes" rows="2" maxlength="800" placeholder="Time between photos, workouts per week, or lifts that have stalled"></textarea>
        </label>
        <button type="submit" class="primary">Compare photos with AI</button>
      </fieldset>
    </form>
    <p id="progress-photo-status" class="hint" role="status"></p>
    <button type="button" id="photo-key-link" hidden>Set up AI key</button>
    <div id="progress-photo-result" hidden>
      <h3>Visible changes</h3><p data-photo-comparison></p>
      <h3>Next step</h3><p data-photo-advice></p>
      <button type="button" data-photo-routine hidden>Review workout suggestion</button>
    </div>
  </details>`;
}

export function wireProgressPhotos(root) {
  const settings = load("settings");
  const prefs = { ...DEFAULT_PREFS, ...settings.trainingPrefs };
  root.querySelector("#photo-key-link")?.addEventListener("click", () => navigate("settings", { section: "ai" }));
  root.querySelector("#progress-photo-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = root.querySelector("#progress-photo-status");
    const result = root.querySelector("#progress-photo-result");
    const photoKeyLink = root.querySelector("#photo-key-link");
    result.hidden = true;
    photoKeyLink.hidden = true;
    const apiKey = loadApiKey();
    if (!apiKey) {
      status.textContent = "Save an OpenAI key in Settings to compare your photos.";
      photoKeyLink.hidden = false;
      return;
    }
    const files = new FormData(form);
    const fields = form.querySelector("fieldset");
    const compareButton = form.querySelector('button[type="submit"]');
    const idleLabel = compareButton.textContent;
    fields.disabled = true;
    compareButton.setAttribute("aria-busy", "true");
    compareButton.textContent = "Comparing photos…";
    status.textContent = "Comparing your photos…";
    try {
      const review = await compareProgressPhotos(apiKey, files.get("earlier"), files.get("recent"), {
        goal: settings.profile?.goal,
        split: STYLE_OPTIONS[prefs.style]?.label,
        daysPerWeek: prefs.daysPerWeek,
        equipment: prefs.equipment.map(id => EQUIPMENT[id]).filter(Boolean),
        notes: String(files.get("notes") || "").trim().slice(0, 800),
      });
      if (!form.isConnected) return;
      result.querySelector("[data-photo-comparison]").textContent = review.comparison;
      result.querySelector("[data-photo-advice]").textContent = review.advice;
      const useRoutine = result.querySelector("[data-photo-routine]");
      useRoutine.hidden = !review.routine;
      useRoutine.onclick = () => {
        navigate("settings", { section: "workout", routine: review.routine });
      };
      result.hidden = false;
      status.textContent = "Photo comparison ready.";
      form.reset();
    } catch (error) {
      status.textContent = error.message || "The photo comparison failed. Try again.";
    } finally {
      compareButton.textContent = idleLabel;
      compareButton.removeAttribute("aria-busy");
      fields.disabled = false;
    }
  });
}
