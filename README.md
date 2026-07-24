# Tempo

> A dependency-free, installable workout & nutrition tracker that builds a training plan around **your** goal, schedule, and equipment — then adapts as you progress.

Tempo is a mobile-first **PWA** with **no frameworks and no accounts**. Core tracking runs in the browser, works offline, and stores data locally. An optional AI coach uses a Netlify Function when enabled.

## Features

- **🧠 Dynamic workout plans** — generates a weekly split and exercise selection from your goal, days per week, experience level, and the equipment you actually own (dumbbells, kettlebells, barbell + rack, machines, cables, pull-up bar, bands, bench, treadmill, or just bodyweight). When a split day repeats in your week it becomes distinct A/B (and C) sessions with different exercises, selection is seeded per user so no two plans look alike, and **Shuffle exercises** rebuilds the whole selection anytime.
- **📈 Auto-progression** — reads your logged history and prescribes the next session's load and reps using double progression, with deload detection and rep/time variants for bands and planks.
- **🔁 Fully customizable** — swap any exercise for a same-pattern alternative, add/remove sets, add or remove exercises, and reshape your week — all of it persists to your plan.
- **🍽️ Preference-based meal plans** — sex-aware calorie & macro targets (Mifflin-St Jeor + activity, with safe-calorie and essential-fat floors), then **generates each meal from a tagged food database filtered to your diet, preferred proteins/carbs, and allergens** — scaling portions to hit your macros (no LLM, no network). Schedules meal times around your sleep/wake and tracks water.
- **🔄 Adaptive** — recalibrates your calorie target from your weight trend, flags when you've hit your goal, and can request an optional AI coach review of recent diet, workout, and weight trends.
- **📊 Progress tracking** — weight/waist log, trend chart, moving average, and an ETA to your target.
- **📱 Mobile-first UI** — stepped setup wizard, bottom tab bar, safe-area aware, large touch targets, dark/light theme, rest timer with audio + vibration.
- **📲 Installable & offline** — a full PWA: add it to your home screen and it launches full-screen and runs offline (service-worker app-shell cache).
- **🔒 Private by default** — data lives in `localStorage`; the AI coach sends a compact recent snapshot only when you tap **Analyze progress**. Export/import JSON backups anytime.

## Tech stack

- **Vanilla JavaScript** (ES modules), HTML, and CSS — **no build step, no dependencies, no npm install**.
- Optional Netlify Function for AI coach reviews.
- State persisted to `localStorage` with JSON export/import.
- Client-side routing via the History API (clean `/workout`-style URLs).
- **PWA** — web app manifest + service worker (offline app-shell cache), no install libraries.
- Deploys as plain static files (Netlify config included).

## Getting started

```bash
git clone <your-repo-url>
cd workout-plan
python3 serve.py 8753
# open http://localhost:8753
```

`serve.py` is a tiny stdlib-only dev server that adds no-cache headers and an SPA fallback so deep links like `/workout` work on refresh. Any static server works, but with plain `python3 -m http.server` refreshing a deep link will 404. The optional AI coach button requires Netlify Functions, so it only runs on the deployed Netlify site or a Netlify local dev server.

There is nothing to build or install.

## Install (PWA)

On a deployed (HTTPS) URL, Tempo can be installed like a native app:

- **iOS Safari** — Share → *Add to Home Screen*.
- **Android Chrome / desktop Chrome & Edge** — use the install icon in the address bar (or ⋮ → *Install Tempo*).

Once installed it launches full-screen and works offline — the app shell and your data are cached on-device.

## How it works

| Concern | Where |
|---|---|
| Calorie & macro math (BMR/TDEE, sex floors, water, meal timing) | [`lib/calc.js`](lib/calc.js) |
| Workout plan generator | [`lib/plan.js`](lib/plan.js) |
| Exercise library (equipment-tagged) | [`data/exercises.js`](data/exercises.js) |
| Auto-progression engine | [`lib/progression.js`](lib/progression.js) |
| Calorie recalibration & goal detection | [`lib/adaptations.js`](lib/adaptations.js) |
| Optional AI coach snapshot/apply flow | [`lib/coach.js`](lib/coach.js), [`netlify/functions/coach.js`](netlify/functions/coach.js) |
| Offline cache | [`sw.js`](sw.js) |
| Storage / backup | [`storage.js`](storage.js) |
| Routing + shell | [`app.js`](app.js), [`index.html`](index.html) |

## Project structure

```
.
├── index.html            # App shell + bottom tab bar
├── app.js                # History-API router + SW registration
├── storage.js            # localStorage wrapper + JSON export/import
├── styles.css            # All styling (CSS variables, dark/light)
├── manifest.webmanifest  # PWA manifest (name, icons, theme)
├── sw.js                 # Service worker (offline app-shell cache)
├── icon-192.png          # PWA / home-screen icon
├── icon-512.png          # PWA / maskable icon
├── serve.py              # Dev server (no-cache + SPA fallback)
├── netlify.toml          # Static deploy config + SPA redirect
├── netlify/functions/    # Optional AI coach function
├── _headers              # Security headers (CSP, HSTS, etc.)
├── data/
│   ├── exercises.js      # Exercise library + treadmill cardio blocks
│   ├── foods.js          # Tagged food database (diet/allergen/macros)
│   ├── workouts.js       # Static fallback split (pre-onboarding)
│   ├── meals.js          # Meal template + rules (fallback)
│   ├── motivation.js     # Daily welcome quotes
│   └── exercise-icons.js # Inline SVG icons
├── lib/
│   ├── plan.js           # Workout plan generator + active-plan accessor
│   ├── meals.js          # Preference-based meal generator
│   ├── progression.js    # Next-session load/rep prescription
│   ├── adaptations.js    # Calorie/goal suggestion engine
│   ├── calc.js           # BMR/TDEE/macros/water/meal timing
│   ├── modal.js          # Promise-based modals + toasts
│   └── date-nav.js       # Date navigator
└── views/
    ├── today.js          # Dashboard
    ├── workout.js        # Session logging + customization
    ├── meals.js          # Meal checklist + water + off-plan items
    ├── progress.js       # Weight/waist log + chart + backup
    └── settings.js       # Stepped setup wizard (profile + training plan)
```

## Deployment

The app is still served as static files. The included [`netlify.toml`](netlify.toml) and [`_headers`](_headers) configure the function directory, strict CSP, and the `/* → /index.html` redirect that makes clean URLs work in production. Deploy by connecting the repo to Netlify.

Netlify settings:

- Build command: leave blank
- Publish directory: `.`
- Function directory: handled by `netlify.toml`
- Environment import template: copy [`netlify.env.example`](netlify.env.example) to `netlify.env`, fill in real values, then import `netlify.env` into Netlify.
- Environment variables: set `OPENAI_API_KEY` to enable **Coach review**. Optional: set `OPENAI_MODEL` to choose the model; otherwise the function uses `gpt-4.1-mini`.
- Abuse controls: coach calls are rate-limited by client IP before any OpenAI call is made. Set `COACH_RATE_LIMIT` for requests per window, `COACH_RATE_WINDOW_SECONDS` for the window size, and `COACH_DAILY_LIMIT` for the daily cap. Defaults: `5` requests per `900` seconds and `20` requests per day.
- Production rate-limit store: Supabase is supported without extra npm dependencies. Run [`supabase-rate-limit.sql`](supabase-rate-limit.sql) in Supabase SQL Editor, then set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Netlify. Older Supabase projects can use `SUPABASE_SERVICE_ROLE_KEY` instead of `SUPABASE_SECRET_KEY`.
- Alternate rate-limit store: set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` if you prefer Upstash Redis. Without Supabase or Upstash, the function uses an in-memory fallback that is best-effort only on serverless cold starts.
- Optional origin guard: set `COACH_ALLOWED_ORIGIN` to your deployed site origin, such as `https://your-site.netlify.app` or your custom domain. Multiple origins can be comma-separated.
- Optional privacy hardening: set `RATE_LIMIT_SALT` so IP addresses are hashed before they become rate-limit keys.
- Optional timeout tuning: set `OPENAI_TIMEOUT_MS` and `RATE_LIMIT_TIMEOUT_MS` if you need different upstream timeouts. Defaults are `12000` ms and `3000` ms.

If `OPENAI_API_KEY` is missing, invalid, out of quota, rate-limited, or OpenAI is unavailable, the coach review shows a friendly unavailable message and applies no changes. Meal tracking, workouts, progress logging, offline PWA behavior, and the deterministic adaptation engine continue to work.

## Data & privacy

Core data is stored in your browser's `localStorage` and there are no accounts or analytics. The AI coach is opt-in per review: when you tap **Analyze progress**, the app sends a compact recent snapshot to the same-origin Netlify Function, which calls OpenAI using the server-side `OPENAI_API_KEY`. Use **Progress → Backup** to export/import a JSON snapshot (recommended before clearing browser data).

## Disclaimer

Tempo is for general fitness tracking only and is **not medical, nutritional, or training advice**. Calorie and macro figures are estimates (Mifflin-St Jeor equation with activity multipliers) and individual needs vary. Consult a qualified professional before starting any diet or exercise program.

## License

[MIT](LICENSE) — do whatever you like, just keep the copyright notice.
