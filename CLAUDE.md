# Prism — project memory

> This file is auto-loaded by Claude Code as project memory in **every**
> environment (claude.ai/code on the web, the VS Code / JetBrains extension,
> and the CLI). It is how a new session picks up where the last one left off —
> Claude Code session history lives on the local machine and is **not** synced,
> so anything worth remembering across sessions or machines goes here and gets
> committed. Keep the "Session log" at the bottom current.

## What Prism is

A flat, minimal, data-first **design system for Home Assistant**: a theme plus a
growing set of custom Lovelace cards. Two parts working together:

1. **Theme** — `themes/prism.yaml`. Gives native HA a calm flat look and
   publishes `--prism-*` **design tokens**.
2. **Custom cards** — read those tokens, so switching Prism themes re-skins
   every card automatically.

Design direction: flat and clear (no 3D / drop shadows), strong information
hierarchy (one dominant value per tile), and **never a bare number** — every
card carries context (trend, sparkline, severity bands, count, etc.).

## Repo layout

| Path | What |
|------|------|
| `src/prism-shared.js` | The `window.PrismUI` runtime: design tokens (`TOKEN_STYLE`), formatting/value helpers, history helpers, the `registerCard` helper, `bindTap`, and the **`PrismEditor` base class** every card editor extends. Load-order first. |
| `src/prism-*-card.js` | One file per card. Each is an IIFE that defines a card element + its editor element and calls `P.registerCard(...)`. |
| `prism.js` | **Generated** shippable bundle (concatenation of `src/*.js`). Do not edit by hand. |
| `build.sh` / `build.ps1` | Concatenate `src/*.js` (shared first) → `prism.js`. **Both** list the source files and must be kept in sync. |
| `test/smoke.js` | Node smoke test — runs each card's `setConfig` + render under a tiny DOM shim. No browser. Lists sources in bundle order + a `cards` array of `[tag, config]` cases. |
| `test/preview.html` | Offline browser preview with a mock `hass` (fake states + history + registries + `callService`). Loads `../prism.js`. Toggle light/dark + accent. |
| `test/shot.js` | Playwright render check → screenshots; also regenerates the committed showcase images in `docs/assets/`. |
| `examples/*.yaml` | Full dashboard examples to paste into HA raw config. |
| `docs/` | Theming guide + per-card option docs. |
| `hacs.json` | HACS metadata (`filename: prism.js`). |

`main` is the default branch. Version lives in `src/prism-shared.js` as
`const VERSION` (currently **0.3.0**); the console banner and bundle both read it.

## The card pattern (how every card is built)

Each `src/prism-<name>-card.js` is an IIFE (`(function () { 'use strict'; const P = window.PrismUI; ... })()`) that:

1. Defines a **card element** (`extends HTMLElement`) with:
   - `setConfig(config)` — validate + normalize into `this._config`; throw on
     missing required config.
   - `set hass(hass)` — store + `this._render()`.
   - `_render()` — build `this.shadowRoot.innerHTML` from a `<style>` that
     starts with `${P.TOKEN_STYLE}` and a `.prism-card` root; bind events after.
   - `getCardSize()` / `getGridOptions()` for layout.
   - `static getConfigElement()` + `static getStubConfig(hass)`.
2. Defines an **editor element** (`extends P.PrismEditor`) implementing
   `_fields(stack)` — append controls built from the base-class helpers
   (`_titleField`, `_accentField`, `_picker`, `_tf`, `_select`, `_switch`,
   `_section`, `_hint`, `_listField`). Config changes go through `_patch(key,val)`
   or `_fire(cfg)`.
3. `customElements.define(...)` for both, then `P.registerCard({ type, name, description })`.

Shared conventions used across cards:
- `OFF_STATES = ['off','unavailable','unknown','idle','closed','none','']` and an
  `isActive()`/`_active()` test for "on-ness".
- `TOGGLE_DOMAINS` = light/switch/fan/input_boolean/humidifier/siren for inline toggles.
- Colours resolve via `P.resolveAccent(cfg.accent)` (theme token / preset name / hex).
- Escape all interpolated text with `P.esc(...)`.
- Tap vs. hold via `P.bindTap(el, onTap, onHold)`; more-info via a
  `hass-more-info` CustomEvent `{ detail: { entityId }, bubbles, composed }`.

## Checklist: adding a new card

1. Create `src/prism-<name>-card.js` following the pattern above.
2. Add the file to **both** `build.sh` and `build.ps1` (same position).
3. Add it to the `for (const f of [...])` source list **and** the `cards`
   test array in `test/smoke.js` (cover each meaningful config variant).
4. Add a demo entry to `test/preview.html` `CARDS` (add mock states/registry
   entries if needed).
5. Bump `VERSION` in `src/prism-shared.js`.
6. Update `README.md` (card table + a quick-start block) and, if useful,
   `examples/overview-dashboard.yaml`.
7. Run `bash build.sh && node test/smoke.js` (both must pass).
8. Browser-check (see below) — the DOM shim can't catch real render bugs.

## Dev workflow / commands

```bash
bash build.sh          # regenerate prism.js from src/  (or: pwsh ./build.ps1)
node test/smoke.js     # DOM-shim render + helper checks; exits non-zero on failure
```

**Browser check** (Playwright is a devDependency; a Chromium is pre-installed in
Claude Code web sessions):

```bash
npm install            # once, to get the playwright package (node_modules is gitignored)
node test/shot.js      # full screenshots — NOTE: overwrites docs/assets/preview-*.png
```

In the Claude Code web sandbox, `chromium.launch()` tries to download a browser;
pass the pre-installed one instead:
`chromium.launch({ executablePath: '/opt/pw-browsers/chromium-<ver>/chrome-linux/chrome' })`
(find the version dir under `/opt/pw-browsers/`). Use an ad-hoc script that reads
into a card's `shadowRoot` to assert real render output + zero console errors,
rather than `test/shot.js`, when you don't want to touch the committed showcase
images.

## Releases

Releases are **automated** by `.github/workflows/release.yml`. On every push to
`main` (and on manual dispatch) it reads `VERSION` from `src/prism-shared.js`;
if no `v<VERSION>` release exists yet, it builds the bundle, runs the smoke test,
and publishes `v<VERSION>` with `prism.js` attached (`--generate-notes`). So the
release step of shipping is just **bump `VERSION` in a merged PR** — no manual
tagging. To re-publish or cut the current version on demand, run the **Release**
workflow via *Actions → Release → Run workflow*. (Requires the repo's Actions
token to have write access: Settings → Actions → General → *Read and write
permissions*.)

## Showcase images

The README showcase (`docs/assets/preview-{light,dark}.png`) is **auto-regenerated**
by `.github/workflows/showcase.yml`. On any push to `main` touching `src/**`,
`prism.js`, `test/preview.html`, `test/shot.js`, or `themes/**`, it installs a
Chromium, runs `bash build.sh` + `node test/shot.js`, and commits the updated
images back to `main` (only if changed; commit is `[skip ci]` so it never loops
or re-triggers the release). Also runnable on demand via *Actions → Showcase →
Run workflow*. So a new card only needs its `test/preview.html` demo entry — the
showcase updates itself. (Manual local regen still works too; the sandbox needs
`chromium.launch({ executablePath: '/opt/pw-browsers/chromium-<ver>/chrome-linux/chrome' })`.)

## Session log

Newest first. One short entry per working session: what shipped + open threads.

### 2026-07-18 — Weather card: full-colour animated icon set (v0.15.0)
- **User feedback:** the currentColor/accent icons rendered monochrome; they
  supplied a **multi-colour** replacement set (gradients + hex). Reworked
  `src/prism-weather-anim.js` to full colour — dropped currentColor entirely.
- Assets (viewBox 64): user's `partly-cloudy` (fixed a stray malformed/unused
  `linearGradient` in its defs), `pouring` (their "heavy rain" w/ splashes),
  `snowy`, `thunderstorm`, `windy`, `hail` verbatim; authored `clear-day`
  (radial `sun-grad` FFD166→F77F00 + orange rays), `clear-night` (cream moon +
  gold stars), `cloudy` (layered #E2EAF4/#C4D2E6), `rainy` (grey cloud + blue
  drops), `fog` to match. Snow/hail flakes kept white **+ a faint #B7CBE0
  outline** so they stay visible on a white light-theme card. MAP now routes
  `windy`/`windy-variant`→windy and `hail`→hail (were folded before).
  `weatherAnim(state)` no longer takes an `animated` flag (colours live in the
  `<style>`, so stripping it would drop colour).
- Weather card: `.icon` dropped `color:accent`; `animate:false` now adds a
  `.no-anim` class (`.icon.no-anim svg * { animation:none !important }`) instead
  of the removed strip. Forecast card unchanged.
- VERSION 0.14.0 → 0.15.0. Verified in real Chromium: all 11 states render in
  colour on light + dark (orange sun, blue rain, yellow bolt, green wind leaf,
  outlined white snow/hail); weather card sun uses `url(#sun-grad)`, not accent.
  No console errors.

### 2026-07-18 — Weather card: currentColor animated icon set (v0.14.0)
- **User request:** use a supplied set of animated `currentColor` SVGs for the
  weather (current-conditions) card's hero icon (theme-inheriting), keyed by HA
  weather state (normalized from Tomorrow.io).
- Added **`src/prism-weather-anim.js`** — a helper module (augments `PrismUI`,
  no card) exposing `P.weatherAnim(state, {animated})` + `P.WEATHER_ANIM`. An
  asset map of 9 inline animated SVGs (viewBox 64, all `currentColor`): the
  user's `partly-cloudy` + `rainy` verbatim, plus authored clear-day / clear-
  night / cloudy / pouring / thunderstorm / snowy / fog in the same style. HA
  state → asset map (incl. lightning-rainy/snowy-rainy/hail/windy/exceptional),
  cloud fallback. `animated:false` strips the `<style>` block. Loads right after
  prism-shared in build order (build.sh/ps1/smoke).
- **weather card** now renders `P.weatherAnim(condition,…)` instead of
  `P.weatherIcon(…)`; `.icon` is 88px and `color:accent`, so `currentColor`
  resolves to the accent and the glyph adapts light/dark. Dropped WEATHER_CSS
  from the weather card. **Forecast card unchanged** (keeps the compact
  `weatherIcon` set).
- VERSION 0.13.0 → 0.14.0. Verified in real Chromium: partly-cloudy glyph in
  accent blue (sun-rays + floating cloud, currentColor→accent), mapping
  (sunny→rays, lightning-rainy→bolt, unknown→cloud) + animate:false strip all
  correct. No console errors.

### 2026-07-18 — Lightning + Lux cards (v0.13.0)
- **`prism-lightning-card`** (`src/prism-lightning-card.js`): strike count as the
  dominant (accent-coloured) value, "Last …" relative time + "… km away" sub
  lines, and the shared animated `weatherIcon('lightning')` (flickering bolt).
  Config: `count_entity` (req-ish) / `distance_entity` / `time_entity` (timestamp
  or minutes-ago), `accent` (amber), `animate`. `relTime` handles ISO or numeric.
- **`prism-lux-card`** (`src/prism-lux-card.js`): a "living sun" — SVG disc + 12
  rays whose size/length scale with `log10(lux)/log10(1e5)` and whose colour
  warms by band (Dark→Bright sun); rays rotate + disc pulses (CSS, reduced-motion
  aware via TOKEN_STYLE). Moon under 1 lx. Reads lux state or an `attribute`.
- Now 22 cards. Wired build.sh / build.ps1 / smoke.js (lightning_*/illuminance
  fixtures + 4 cases) / preview.html (mocks + 2 demos). README table + 2
  quick-starts; full docs/cards.md sections + sizing rows. VERSION 0.12.0 →
  0.13.0.
- Verified in real Chromium (screenshots): lightning → amber "7 strikes", "Last
  12m ago", "8 km away", flickering bolt; lux → warm sun w/ 12 long rays,
  "18,500 lx", "Daylight". No console errors.

### 2026-07-18 — Air Quality (AQI) card (v0.12.0)
- Added **`prism-aqi-card`** (`src/prism-aqi-card.js`): flat AQI tile, same
  segmented-scale family as the UV card. Big value coloured by US EPA category,
  a category pill + health advice, and a **6 equal-block scale** (Good/Moderate/
  Sensitive/Unhealthy/Very unhealthy/Hazardous) with a marker positioned by
  block index + fractional progress; boundary ticks 0/50/100/150/200/300/500.
  Reads an AQI sensor state (0–500) or an `attribute`.
- Now 20 cards. Wired build.sh / build.ps1 / smoke.js (sensor.aqi fixture +
  2 cases) / preview.html (mock + demo). README table + quick-start; full
  docs/cards.md section + sizing row. VERSION 0.11.0 → 0.12.0.
- Verified in real Chromium (screenshot): AQI 128 → orange "Sensitive",
  "Sensitive groups may feel effects.", marker at 42.5% (in the orange block,
  between the 100 and 150 ticks). No console errors.

### 2026-07-18 — Auto-regenerated showcase images
- Regenerated `docs/assets/preview-{light,dark}.png` to include the UV + rain
  cards (full weather set now in the showcase).
- **Automated it:** added `.github/workflows/showcase.yml` — on push to `main`
  touching src/prism.js/preview/shot/themes (or manual dispatch), it installs
  Chromium, runs `build.sh` + `test/shot.js`, and commits the refreshed images
  back to main if they changed (`[skip ci]` avoids loops / release re-trigger).
  Bumped `test/shot.js` settle waits (600→1000, 400→600) so async weather/
  forecast cards populate in CI. No VERSION bump (CI infra only).
- Adding a card now just needs its preview.html demo; the showcase self-updates.

### 2026-07-18 — Rain card: animated gauge (v0.11.0)
- **User request:** a rain card with a "cool animated gauge" showing rainfall
  amounts; sensors available = event / 24h / hourly / intensity(in/hr) / weekly /
  monthly; event amount + intensity are the biggest.
- Added **`prism-rain-card`** (`src/prism-rain-card.js`): a flat measuring
  cylinder (SVG, clip-path water fill) that fills to `event / max`; raindrops
  fall into it (count/speed from the intensity rain-rate band) and a clipped
  wave animates the water surface (reduced-motion stills both). Big **event**
  value dominant; sub line = intensity value + rate descriptor (Light/Moderate/
  Heavy/Violent, coloured by level); chips for hourly(1h)/daily(24h)/weekly(Wk)/
  monthly(Mo). Tap gauge or chip → more-info.
  - Config: `event_entity` (req) + `intensity_entity` / `hourly_entity` /
    `daily_entity` / `weekly_entity` / `monthly_entity`, `max` (default 1 in /
    25 mm), `animate`, `accent` (default blue). Intensity normalised to mm/h for
    bands; inches → 2 dp else 1 dp.
- Now 19 cards. Wired build.sh / build.ps1 / smoke.js (rain_* fixtures + 2 cases)
  / preview.html (rain_* mock + demo). README table + quick-start; full
  docs/cards.md section + sizing row. VERSION 0.10.0 → 0.11.0.
- Verified in real Chromium (screenshot): tube ~42% full, 5 drops (Moderate),
  0.42 in event, "0.15 in/h · Moderate", chips 1h/24h/Wk/Mo. No console errors.
- **Possible next:** regenerate showcase to include UV + rain cards; an
  air-quality (AQI) card.

### 2026-07-18 — Weather card: local-sensor overrides (v0.10.0)
- **User request:** pair a weather service (condition + forecast) with local
  station sensors (Ecowitt) for the numeric readings.
- Added optional per-field sensor overrides to `prism-weather-card`:
  `temperature_entity`, `feels_like_entity`, `humidity_entity`,
  `wind_speed_entity`, `wind_bearing_entity` (deg or cardinal), `pressure_entity`.
  Each field prefers its override sensor (value + unit), else the weather
  entity's attribute; the **condition icon and today's H/L always stay from the
  weather `entity`**. New helpers `fieldNum`/`fieldUnit`; wind direction handles
  numeric degrees or a cardinal string. Editor gains a "Local sensor sources"
  section (6 sensor pickers).
- Wired smoke (eco_* sensor fixtures + override case) + preview ("Weather (local
  sensors)" demo with eco_temp/hum/wind/dir). README quick-start comment +
  docs/cards.md override table + example. VERSION 0.9.1 → 0.10.0.
- Verified in real Chromium: local card → 19° (eco_temp), "Partly cloudy" (kept
  from service), chips 58% / 12 mph W / 1,013 hPa (pressure fell back to
  service). No console errors.

### 2026-07-18 — Fix forecast card `type` option collision (v0.9.1)
- **Bug (user-reported):** `prism-forecast-card`'s daily/hourly option was named
  `type`, which collides with Lovelace's reserved card-type key. A config with
  `type: daily` overrode `type: custom:prism-forecast-card` → HA "Unknown type:
  daily". The README even had two `type:` lines. Second latent bug: since
  `_config.type` was actually the card-type string, `fetchForecast` was called
  with `'custom:prism-forecast-card'` as the forecast type → invalid → the strip
  always showed "Forecast unavailable".
- **Fix:** renamed the option to **`forecast_type`** (matching HA's core
  weather-forecast card) throughout the card (setConfig default, editor select,
  fetch key, `_render`, stub). Updated README quick-start (removed the duplicate
  `type:`), docs/cards.md option table + example, smoke cases, preview demo.
  VERSION 0.9.0 → 0.9.1.
- Verified in real Chromium: daily → Today/Sun/Mon…, hourly → Now/11 PM/12 AM…,
  no console errors. **Users must update to v0.9.1** for the forecast card to
  fetch (0.9.0's was effectively broken).

### 2026-07-18 — UV index card (v0.9.0) — weather set complete
- Added **`prism-uv-card`** (`src/prism-uv-card.js`): flat UV-index tile. Big
  value coloured by its WHO risk band, a category pill + sun-protection advice,
  and a flat segmented **UV-ramp scale** (green→yellow→orange→red→purple, widths
  3/3/2/3/1 over a 0–12 scale) with a marker at the value and boundary-aligned
  ticks (0/3/6/8/11+). Reads a UV sensor state, or a `weather.*` `uv_index`
  attribute (`attribute` override). Bands: 0–2 Low, 3–5 Moderate, 6–7 High,
  8–10 Very high, 11+ Extreme.
- Now **18 cards** — rounds out the weather set (wind / weather / forecast / sun
  / uv). Wired into build.sh / build.ps1 / smoke.js (sensor.uv_index fixture +
  weather.x uv_index attr + 2 cases) / preview.html (mock + demo). README table +
  quick-start; full docs/cards.md section + sizing row. VERSION 0.8.0 → 0.9.0.
- Verified in real Chromium (screenshot): UV 7 → orange "High" pill,
  "Protection required", marker in the High segment at 58.3%, ticks aligned. No
  console errors.
- **Possible next:** an air-quality (AQI) card (same segmented-scale pattern);
  regenerate showcase to include the UV card.

### 2026-07-18 — Sun (sunrise/sunset) card (v0.8.0)
- Added **`prism-sun-card`** (`src/prism-sun-card.js`): a flat sun-path arc.
  Semicircular sky dome (SVG polyline arc); the traveled portion (sunrise→now)
  is filled with the accent, the sun rides the arc with 8 rays, sunrise/sunset
  icons + times sit at each end, and a live "Sets in / Rises in" countdown is
  centered. Night → moon on the horizon, arc rests. Reads `sun.sun`
  (`next_rising`/`next_setting`/`elevation`/state). Daytime progress: today's
  sunset = next_setting; today's sunrise ≈ next_rising − 1 day (viz-good).
- Now 17 cards. Wired into build.sh / build.ps1 / smoke.js (sun.sun fixture +
  2 cases) / preview.html (sun.sun mock anchored to today 20:24 / tomorrow 06:12
  + demo). README table + quick-start; full docs/cards.md section + sizing row.
  VERSION 0.7.0 → 0.8.0.
- Verified in real Chromium (screenshot): amber dome with sun mid-arc + rays,
  filled traveled portion, horizon line, 06:12 AM / 08:24 PM ends, countdown.
  No console errors.
- **Possible next:** UV index / air-quality card; regenerate showcase images to
  include the weather/forecast/sun cards.

### 2026-07-18 — Weather + Forecast cards + shared flat icon set (v0.7.0)
- Added a **shared flat weather-icon system** to `prism-shared.js`: `weatherIcon`
  (inline SVG per HA condition — sun/moon/cloud/rain/pouring/snow/sleet/hail/
  fog/lightning/windy/exceptional), `WEATHER_CSS` (flat palette + gentle
  animations, stilled by the reduced-motion rule), `WEATHER_LABELS`, and
  `fetchForecast(hass, id, type)` (calls `weather.get_forecasts` via callWS with
  `return_response`). Google-weather-ish but flat + theme-driven.
- **`prism-weather-card`** (`src/prism-weather-card.js`): current conditions —
  big temperature, animated condition icon, feels-like + today H/L (from the
  daily forecast), and humidity/wind/pressure chips. Reads a `weather.*` entity.
- **`prism-forecast-card`** (`src/prism-forecast-card.js`): daily/hourly strip —
  one column per period (Today/Now + weekday/hour), flat icon, hi/lo, precip
  chance; horizontal scroll on overflow. `type`/`count`/`show_precip`/`animate`.
- Both throttle the forecast fetch (15 min) and re-render on resolve. Now 16 cards.
- Wired into build.sh / build.ps1 / smoke.js (weather.x fixture enriched +
  get_forecasts branch in callWS + 4 cases) / preview.html (weather.home enriched
  + daily/hourly forecast mock + 2 demos). README table + 2 quick-starts; full
  docs/cards.md sections + sizing rows. VERSION 0.6.0 → 0.7.0.
- Verified in real Chromium (screenshots): weather card 18° "Partly cloudy",
  Feels 16° H:21 L:9, chips 62% / 24 km/h NW / 1,013 hPa, flat partly-cloudy
  icon; forecast 7 cols Today…Fri with distinct flat icons, hi/lo, precip. No
  console errors.
- **Possible next:** regenerate showcase images to include the two weather cards;
  a UV / air-quality / sun (sunrise-sunset) card to round out the weather set.

### 2026-07-18 — Wind card (v0.6.0)
- Added **`prism-wind-card`** (`src/prism-wind-card.js`): flat, data-first wind
  tile. Dominant wind-speed value; a flat **compass rose** with an accent arrow
  pointing to the source bearing + the cardinal in the middle; a **Beaufort**
  descriptor; a **gusts** chip; and animated flat **wind-streak** accents whose
  count/speed scale with the Beaufort level (respects prefers-reduced-motion).
  - Reads a `weather.*` entity (`wind_speed`/`wind_bearing`/`wind_gust_speed`/
    `wind_speed_unit`) or individual `speed_entity`/`direction_entity`/
    `gust_entity` sensors. Direction accepts degrees or a cardinal string.
  - Helpers: `toKmh` (unit normalise for Beaufort), `beaufort`, `cardinalOf`/
    `parseBearing` (16-point), `windPt` (compass polar). Now 14 cards.
- Wired into build.sh / build.ps1 / smoke.js (weather fixture + 2 cases) /
  preview.html (weather.home mock + demo). README table + quick-start; full
  docs/cards.md section (so the auto doc-link anchor resolves) + sizing row.
  VERSION 0.5.1 → 0.6.0.
- Verified in real Chromium: NW compass + arrow, 24 km/h "Moderate breeze",
  "from the northwest · 315°", gusts 41, 4 streaks, no console errors.
- **Possible next:** more weather cards (temperature/humidity/forecast strip);
  regenerate showcase images to include the wind card.

### 2026-07-18 — Automated release workflow
- Added `.github/workflows/release.yml`: on push to `main` / manual dispatch it
  reads `VERSION` from `src/prism-shared.js` and, if no `v<VERSION>` release
  exists, builds + smoke-tests + publishes the GitHub Release with `prism.js`
  attached (`gh release create … --generate-notes`). Idempotent (skips if the
  release already exists). Makes "bump VERSION in a merged PR" the whole release.
- Context: GitHub/HACS were still showing v0.2.0 because Releases are separate
  from the code `VERSION` const and none had been cut for 0.3–0.5.1. This
  environment can't push tags (git relay 403s) or create releases via the MCP
  tools, so the workflow is how v0.5.1 gets published — merging it (or a manual
  dispatch) triggers the first auto-release. Needs Actions token write access
  (Settings → Actions → General → Read and write permissions).

### 2026-07-18 — Card-picker doc links + filter-card docs (v0.5.1)
- HA has no supported API to add a named custom category (e.g. "Prism cards")
  to the card picker — `window.customCards` only takes `type`/`name`/`preview`/
  `description`/`documentationURL`, no group/category field. The practical way
  to jump to Prism cards is the picker search: every card's `name` is prefixed
  "Prism …", so typing `prism` filters to exactly the 13 cards.
- Improved discoverability: `registerCard` now auto-sets a `documentationURL`
  on every card (derived from its type via new `P.docsUrl(type)`), so each
  Prism card shows a **Documentation** link on its picker tile. A card may
  override the default. Anchors point at `docs/cards.md#custom<type>`.
- Documented the previously-missing **filter card** in `docs/cards.md` (full
  option table + examples) so its doc anchor resolves; verified all 13 anchors
  match a heading in the file.
- VERSION 0.5.0 → 0.5.1. (User asked for 0.2.1, but that would move the version
  backward past released work / break HACS semver ordering — confirmed 0.5.1.)

### 2026-07-18 — Filter card: group-by-area sub-headers (v0.5.0)
- Added `group_by: area` to `prism-filter-card`: matches are bucketed under
  area sub-headers (each with a per-group count). Named areas sort alphabetically
  first, entities with no area fall into a "No area" bucket last
  (`ungrouped_label` overrides the label). Works in both `list` and `chips`
  layouts; the total count badge still shows the grand total.
- Refactored the two inline row/chip builders into `rowHtml`/`chipHtml` closures
  + a `bucketHtml` helper so flat and grouped paths share one renderer; new
  `groupByArea(hass, ids, label)` helper. Global `.row`/`.chip`/`.tgl` event
  binding still works across sections.
- Editor: new "Group by" select. `getCardSize`/`getGridOptions` add `_groupCount`
  for the sub-header rows.
- Smoke (4 filter cases now cover grouping) + preview demo ("Lights by area") +
  README updated; VERSION 0.4.0 → 0.5.0.
- Verified in real Chromium: grouped card showed Living Room (1) / Study (1)
  sub-headers with correct bucketing and total badge 2, no console errors.
- **Possible next:** group_by domain; collapsible groups; regenerate showcase
  images to include the grouped demo.

### 2026-07-18 — Filter card: chip/grid layout (v0.4.0)
- Added a `layout` option to `prism-filter-card`: `list` (default, unchanged) or
  `chips` — a wrapping flex grid of rounded pills. Toggleable + active entities
  fill with the accent (a "lights on" chip card reads at a glance); non-toggle
  entities show their value inline. Tap a chip toggles it (or opens more-info for
  non-toggle domains); hold opens more-info. `secondary` applies to list only.
- Editor: new "Layout" select in the Display section. `getCardSize` /
  `getGridOptions` account for chips packing ~2 per grid column.
- Smoke + preview + README updated; VERSION 0.3.0 → 0.4.0.
- Verified in real Chromium: chips render + fill correctly; tapping a filled
  chip toggled it and dropped the count 2→1; no console errors.
- **Possible next:** multi-condition (AND/OR) filtering; group matches by area
  with sub-headers; per-chip state color for non-toggle active domains.

### 2026-07-18 — Smart Filter card (v0.3.0)
- Added **`prism-filter-card`** (`src/prism-filter-card.js`): a dynamic,
  self-populating list. Pick a domain (or `domains: []`) + a condition and it
  renders every matching entity, re-populating as state changes.
  - Conditions: `on` / `off` / `any` / `numeric` (`operator` + `value`) / `exact`
    (`state_is` / `state_not`). Optional `area`, `exclude`, `sort`, `max`.
  - Reuses the entities-card row look (icon · name · secondary · value or inline
    toggle); live match count in the header; empty state (`empty_text`).
  - Full editor with condition-dependent controls (numeric op/value, exact state).
- Wired into build.sh / build.ps1 / smoke.js / preview.html; README table +
  quick-start + overview example updated. Bumped VERSION 0.2.0 → 0.3.0.
- Verified: `node test/smoke.js` green; real-Chromium render of preview.html
  showed correct count/rows/area secondary, no console errors, and a live toggle
  dropped the count 2→1.
- Branch `claude/prism-smart-dashboard-card-rjlks3` → PR against `main`.
- **Possible next:** a companion "grid/chip" display mode for the filter card;
  multi-condition (AND/OR) filtering; a `group` header option to bucket matches
  by area.
