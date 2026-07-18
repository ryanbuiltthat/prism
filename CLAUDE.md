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

## Session log

Newest first. One short entry per working session: what shipped + open threads.

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
