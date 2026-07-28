# Prism — Card Reference

Every card is configurable in the visual editor. Options below are the YAML keys.

Common to all cards:

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `title` | string | — | Optional card header shown above the content. Configurable in **every** card's visual editor (first field). |
| `entity` | string | — | **Required** (except `prism-bar-card` and `prism-entities-card`, which take `entities`). |
| `name` | string | entity friendly name | Card / tile label (distinct from `title`). |
| `unit` | string | entity unit | Override the displayed unit. |
| `accent` | string | `theme` | `theme` (use `--prism-accent`), a preset name, or a hex like `#ff8800`. |

Accent presets: `blue`, `teal`, `green`, `amber`, `orange`, `red`, `pink`, `purple`, `slate`.

---

## `custom:prism-stat-card`

Flat KPI tile — dominant value with context.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `icon` | string | — | Any `mdi:` icon, shown in an accent chip. |
| `decimals` | number | auto | Auto: 0 (≥100), 1 (≥10), else 2. |
| `trend` | bool | `true` | Show ▲/▼ delta vs start of the window. |
| `trend_hours` | number | `24` | Trend window (also the sparkline window). |
| `invert_trend` | bool | `false` | Treat "up" as bad (red) — e.g. cost, CPU. |
| `sparkline` | bool | `false` | Inline area sparkline under the value. |

```yaml
type: custom:prism-stat-card
entity: sensor.daily_energy
name: Energy Today
icon: mdi:lightning-bolt
decimals: 1
trend: true
trend_hours: 24
sparkline: true
accent: amber
```

Trend and sparkline read recorder history (cached 5 min).

---

## `custom:prism-gauge-card`

Flat 270° gauge with severity bands.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `min` | number | `0` | Scale minimum. |
| `max` | number | `100` | Scale maximum. |
| `decimals` | number | auto | Center value precision. |
| `style` | `fill` \| `bands` | `fill` | `fill`: progress arc coloured by active band. `bands`: full band arc + needle. |
| `segments` | list | — | `[{ from, color }]`; `color` is a preset or hex. The active band colours the value. |

```yaml
type: custom:prism-gauge-card
entity: sensor.cpu_temp
name: CPU Temp
min: 20
max: 90
style: bands
segments:
  - { from: 20, color: green }
  - { from: 65, color: amber }
  - { from: 80, color: red }
```

---

## `custom:prism-sparkline-card`

History mini-graph for trends over time.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `hours` | number | `24` | Time window. |
| `style` | `area` \| `line` | `area` | Filled area or plain line. |
| `decimals` | number | auto | Current-value precision. |
| `show_value` | bool | `true` | Show current value in the header. |
| `show_minmax` | bool | `false` | Mark and label the window min/max. |

```yaml
type: custom:prism-sparkline-card
entity: sensor.grid_power
name: Grid Power
hours: 48
style: area
show_minmax: true
accent: teal
```

History is downsampled (≤300 pts) for fast, smooth rendering, cached 5 min.

---

## `custom:prism-power-card`

Live power tile with a load bar for context — built for real-time energy monitoring (CT-clamp power sensors, grid/solar feeds).

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `icon` | string | — | Any `mdi:` icon, shown in an accent chip. |
| `decimals` | number | auto | Auto: 0 (≥100 W), 1 (≥10), else 2. |
| `mode` | `load` \| `grid` | `load` | `load`: bar fills 0 → max. `grid`: zero-centred bar, import right / export left, with an Import/Export pill. |
| `max` | number | window peak | Bar full-scale. Blank auto-scales to the peak in the history window. |
| `energy_entity` | string | — | Optional energy total (kWh) shown top-right; tap for more-info. |
| `energy_label` | string | `Today` | Label above the energy total. |
| `hours` | number | `3` | History window for peak + sparkline. |
| `peak` | bool | `true` | Show the window peak under the bar. |
| `sparkline` | bool | `false` | Recent-power area sparkline (zero line drawn in `grid` mode). |

Grid mode expects a **signed** sensor: positive = importing from grid, negative = exporting. The value goes green while exporting.

```yaml
type: custom:prism-power-card
entity: sensor.grid_net_power
name: Grid
icon: mdi:transmission-tower
mode: grid
hours: 3
sparkline: true
accent: teal
```

Peak and sparkline read recorder history (cached 5 min).

---

## `custom:prism-linear-gauge-card`

Horizontal gauge — a single value on a linear scale with severity bands. The flat, space-efficient sibling of the radial gauge.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `icon` | string | — | Any `mdi:` icon beside the name. |
| `min` | number | `0` | Scale minimum. |
| `max` | number | `100` | Scale maximum. |
| `decimals` | number | auto | Value precision. |
| `style` | `fill` \| `bands` | `fill` | `fill`: progress bar coloured by the active band. `bands`: full band strip + a marker at the value. |
| `segments` | list | — | `[{ from, color }]`; `color` is a preset or hex. The active band colours the value (and the fill bar). |
| `show_minmax` | bool | `true` | Show min/max labels under the bar. |

```yaml
type: custom:prism-linear-gauge-card
entity: sensor.tank_level
name: Water Tank
icon: mdi:water
min: 0
max: 100
style: bands
segments:
  - { from: 0, color: red }
  - { from: 20, color: amber }
  - { from: 50, color: green }
```

---

## `custom:prism-bar-card`

Horizontal **bar chart** comparing several entities on a shared scale — power per circuit, energy per room, humidity per sensor. (This is the one card that takes `entities`, not a single `entity`.)

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `entities` | list | — | **Required.** Each item is an entity id, or `{ entity, name?, color?, icon? }`. |
| `title` | string | — | Card header. |
| `unit` | string | per-entity | Override the unit shown on every row. |
| `decimals` | number | auto | Value precision. |
| `min` | number | `0` | Bar baseline. |
| `max` | number | largest value | Shared full-scale. Blank auto-scales so the largest bar fills the track. |
| `accent` | string | `theme` | Default bar colour (per-bar `color` and `segments` override it). |
| `sort` | bool | `false` | Sort rows by value, descending. |
| `show_value` | bool | `true` | Show each row's value. |
| `segments` | list | — | `[{ from, color }]`; colours a bar by its value unless the bar sets its own `color`. |

Per-row colour resolves: bar `color` → severity `segments` (by value) → card `accent`.

```yaml
type: custom:prism-bar-card
title: Power by circuit
sort: true
unit: W
segments:
  - { from: 0, color: green }
  - { from: 1500, color: amber }
  - { from: 3000, color: red }
entities:
  - sensor.circuit_ev
  - sensor.circuit_hvac
  - { entity: sensor.circuit_kitchen, name: Kitchen, icon: mdi:stove }
  - { entity: sensor.circuit_lights, color: purple }
```

---

## `custom:prism-entities-card`

Flat **entity list** — one row per entity with an icon, name, optional secondary line, and a right-aligned value. Actionable domains (`light`, `switch`, `fan`, `input_boolean`, `humidifier`, `siren`) get a flat toggle. (Takes `entities`, not a single `entity`.)

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `entities` | list | — | **Required.** Each item is an entity id, or an object (per-row keys below). |
| `title` | string | — | Card header. |
| `accent` | string | `theme` | Colour for active-state icons and toggles. |
| `show_icons` | bool | `true` | Show the icon column. |
| `state_color` | bool | `true` | Tint the icon with the accent when the entity is "on"/active. |
| `secondary` | string | — | Default secondary line for every row (see per-row `secondary`). |

**Per-row keys** (object form): `{ entity, name?, use_area?, icon?, secondary?, toggle? }`

| Row key | Notes |
|---------|-------|
| `name` | Custom label. Overrides the friendly name (and `use_area`). |
| `use_area` | `true` → label the row with the entity's **area** name instead of its friendly name. |
| `icon` | `mdi:…` override. |
| `secondary` | Row's secondary line: `last-changed`, `last-updated`, **another entity id** (shows that entity's state + unit), or an attribute name. |
| `toggle` | `true`/`false` forces or suppresses the toggle control regardless of domain. |

Numeric states show with their unit; other states are title-cased. Tap a row for more-info; toggles call `homeassistant.toggle` in place. In the visual editor, use the **↑ / ↓** buttons on each row to set the display order.

```yaml
type: custom:prism-entities-card
title: Living Room
secondary: last-changed
accent: amber
entities:
  - light.living_room
  - switch.coffee_maker
  - { entity: binary_sensor.door, icon: mdi:door }
  # Area-named climate row: temperature value, humidity underneath.
  - { entity: sensor.lr_temperature, use_area: true, icon: mdi:thermometer, secondary: sensor.lr_humidity }
```

---

## `custom:prism-filter-card`

A **smart, self-populating list**: instead of naming entities one by one, pick a **domain** (or several) and a **condition**, and the card renders every entity that currently matches — e.g. "all lights that are on". It re-populates automatically as state changes. (Takes a `domain`/`domains` + `condition`, not a fixed `entities` list.)

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `domain` | string | `any` | Entity type to match, e.g. `light`. Use `any` (or omit) for all domains. |
| `domains` | list | — | Match several domains, e.g. `[light, switch]`. Overrides `domain`. |
| `condition` | string | `on` | `on` (active) · `off` (inactive) · `any` · `numeric` · `exact`. |
| `operator` | string | `>` | For `condition: numeric` — one of `>`, `>=`, `<`, `<=`, `=`, `!=`. |
| `value` | number | — | For `condition: numeric` — the number to compare against. |
| `state_is` | string | — | For `condition: exact` — match this exact state. |
| `state_not` | string | — | For `condition: exact` — match any state except this one. |
| `area` | string | — | Only include entities in this area (area id or name). |
| `exclude` | list | — | Entity ids to always leave out. |
| `sort` | string | `name` | `name` · `state` · `last-changed` · `none`. |
| `max` | number | — | Cap the number of rows shown (`0`/omit = all). |
| `layout` | string | `list` | `list` (rows) or `chips` (a wrapping grid of pills). |
| `group_by` | string | — | `area` → bucket matches under per-area sub-headers (each with a count). |
| `ungrouped_label` | string | `No area` | Label for the bucket of entities that have no area. |
| `secondary` | string | — | List layout only: `state` · `area` · `last-changed` · `last-updated`. |
| `show_icons` | bool | `true` | Show the icon column / chip icon. |
| `state_color` | bool | `true` | Tint the icon with the accent when the entity is active. |
| `show_toggle` | bool | `true` | Actionable rows/chips get an inline toggle. |
| `show_count` | bool | `true` | Show the live match count in the header. |
| `empty_text` | string | `Nothing matches` | Shown when no entity matches. |
| `title` | string | — | Card header. |
| `accent` | string | `theme` | Accent for active-state icons, toggles, filled chips, and the count badge. |

Actionable domains (`light`, `switch`, `fan`, `input_boolean`, `humidifier`, `siren`) show an inline toggle; other entities show their value. **List:** tap a row for more-info, tap the toggle to switch. **Chips:** tap to toggle (or open more-info for non-toggle domains), hold for details; active toggleable entities fill with the accent.

```yaml
# Every light that's on, grouped by room.
type: custom:prism-filter-card
title: Lights on
domain: light
condition: 'on'
group_by: area       # optional — area sub-headers with per-group counts
layout: list         # or: chips
accent: amber
```

```yaml
# Any sensor reading above 50, as a chip grid.
type: custom:prism-filter-card
title: Running hot
domain: sensor
condition: numeric
operator: '>'
value: 50
layout: chips
```

---

## `custom:prism-switch-card`

Flat **toggle tile** for a switch (or any toggleable entity). The icon chip fills with the accent when on. **Tap toggles; hold opens more-info.**

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `icon` | string | entity/domain icon | `mdi:` override. |
| `secondary` | string | `state` | Secondary line: `state`, `last-changed`, `last-updated`, or `''` for none. |

Works with `switch`, `input_boolean`, `fan`, `light`, `automation`, `script`, `humidifier`, `siren` — anything `homeassistant.toggle` accepts.

```yaml
type: custom:prism-switch-card
entity: switch.coffee_maker
name: Coffee Maker
icon: mdi:coffee
accent: orange
```

---

## `custom:prism-light-card`

Flat **light tile** with a drag brightness slider. Tap the icon to toggle, hold for more-info. Drag the slider (or focus it and use arrow keys) to set brightness. The chip and slider adopt the bulb's current colour.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `icon` | string | entity icon / `mdi:lightbulb` | `mdi:` override. |
| `slider` | bool | `true` | Show the brightness slider (only for dimmable lights). |
| `use_color` | bool | `true` | Tint the chip/slider with the bulb's `rgb_color`; falls back to `accent`. |

Non-dimmable lights render as a plain toggle tile (no slider). Brightness is sent as `brightness_pct` via `light.turn_on`; dragging to 0 calls `light.turn_off`.

```yaml
type: custom:prism-light-card
entity: light.desk_lamp
name: Desk Lamp
```

---

## `custom:prism-climate-card`

Flat **thermostat tile**: big target temperature with − / + steppers, the current temperature and HVAC action as context, and an accent that follows the mode (heating warm, cooling blue, else muted).

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `step` | number | entity `target_temp_step` or `0.5` | Amount each − / + press changes the target. |
| `action_color` | bool | `true` | Colour the mode chip by `hvac_action` (heating/cooling/…); off uses `accent`. |

Steppers call `climate.set_temperature` (clamped to the entity's min/max); tap the reading for more-info.

```yaml
type: custom:prism-climate-card
entity: climate.living_room
name: Thermostat
```

---

## `custom:prism-cover-card`

Flat **cover tile**: icon chip, name + state/position, and open / stop / close buttons (shown per the cover's `supported_features`). Covers that support positioning get a drag slider (100 = open, 0 = closed).

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `icon` | string | state-based | `mdi:` override. |
| `slider` | bool | `true` | Show the position slider when the cover supports `set_cover_position`. |

Buttons call `cover.open_cover` / `stop_cover` / `close_cover`; the slider calls `cover.set_cover_position`.

```yaml
type: custom:prism-cover-card
entity: cover.living_room_blinds
name: Blinds
```

---

## `custom:prism-media-card`

Flat **media-player tile**: album art (or an icon), what's playing, transport controls (previous / play-pause / next), and an optional volume slider. Controls appear per the player's `supported_features`.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `show_art` | bool | `true` | Show album art (`entity_picture`) when available. |
| `show_volume` | bool | `true` | Show the volume slider when the player supports `volume_set`. |

Transport calls `media_player.media_previous_track` / `media_play_pause` / `media_next_track`; the slider calls `media_player.volume_set`.

```yaml
type: custom:prism-media-card
entity: media_player.living_room_speaker
title: Now Playing
```

---

## `custom:prism-wind-card`

Flat, data-first **wind tile**. The dominant value is wind speed; context comes from a **compass rose** whose accent arrow points to the direction the wind is coming *from* (with the cardinal in the middle), a **Beaufort descriptor** ("Fresh breeze"), **gusts**, and playful flat **wind-streak** accents that grow in number and speed with the wind.

Reads a Home Assistant `weather.*` entity's `wind_speed` / `wind_bearing` / `wind_gust_speed` attributes out of the box, or point it at individual sensors.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `entity` | string | — | A `weather.*` entity (uses its wind attributes) **or** a wind-speed sensor. Required unless `speed_entity` is set. |
| `speed_entity` | string | — | Wind-speed sensor (overrides `entity`'s speed). |
| `direction_entity` | string | — | Wind-direction sensor — **degrees or a cardinal** like `NW`. |
| `gust_entity` | string | — | Wind-gust sensor. |
| `unit` | string | entity's unit / `km/h` | Speed-unit override (also used to normalise for the Beaufort scale: understands `km/h`, `m/s`, `mph`, `kn`). |
| `show_gust` | bool | `true` | Show the gusts chip when a gust value is available. |
| `animate` | bool | `true` | Animated wind-streak accents (respects `prefers-reduced-motion`). |
| `name` | string | friendly name | Used in the accessible label. |
| `title` | string | — | Card header. |
| `accent` | string | `teal` | Colour for the compass arrow, cardinal, and wind streaks. |

Tap opens more-info. The arrow points *to the source* (weathervane convention); the descriptor line reads e.g. "from the northwest · 315°".

```yaml
type: custom:prism-wind-card
entity: weather.home
title: Wind
accent: teal
```

```yaml
# From individual sensors instead of a weather entity:
type: custom:prism-wind-card
speed_entity: sensor.wind_speed
direction_entity: sensor.wind_bearing
gust_entity: sensor.wind_gust
unit: mph
```

---

## `custom:prism-weather-card`

Flat **current-conditions tile**: a big temperature, an **animated condition icon**, the condition label, **feels-like + today's high/low**, and **humidity / wind / pressure** chips. Reads a `weather.*` entity; today's H/L comes from its daily forecast (the `weather.get_forecasts` service).

The current-conditions icon uses a dedicated **full-colour** animated icon set (`src/prism-weather-anim.js`) — orange gradient sun, blue rain, yellow lightning, white snow/hail, green wind leaf, etc. — so each condition reads at a glance. States are mapped from the Home Assistant weather condition (as normalized by e.g. the Tomorrow.io integration), with dedicated `windy`/`hail` glyphs and a cloud fallback for unknown states.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `entity` | string | — | **Required.** A `weather.*` entity. |
| `title` | string | — | Card header. |
| `accent` | string | `theme` | Tints the chip icons. |
| `animate` | bool | `true` | Animate the condition icon (respects `prefers-reduced-motion`). |
| `show_feels` | bool | `true` | Show the "Feels … · H:… L:…" line. |
| `show_humidity` | bool | `true` | Humidity chip (`humidity`). |
| `show_wind` | bool | `true` | Wind chip (`wind_speed` + `wind_speed_unit` + cardinal). |
| `show_pressure` | bool | `true` | Pressure chip (`pressure` + `pressure_unit`). |

By default temperature, feels-like (`apparent_temperature`), humidity, wind, and pressure come from the weather entity's attributes (units follow its `*_unit` attributes). Any of them can instead be sourced from a **local sensor** — handy when a weather service gives the condition + forecast but a local station (e.g. **Ecowitt**) gives more accurate readings:

| Key | Type | Notes |
|-----|------|-------|
| `temperature_entity` | string | Sensor for the big temperature. |
| `feels_like_entity` | string | Sensor for feels-like. |
| `humidity_entity` | string | Sensor for the humidity chip. |
| `wind_speed_entity` | string | Sensor for the wind chip (its unit is used). |
| `wind_bearing_entity` | string | Wind-direction sensor — degrees or a cardinal like `NW`. |
| `pressure_entity` | string | Sensor for the pressure chip. |

The **condition icon and today's high/low always come from the weather `entity`**; only the overridden fields switch to sensors. Tap opens more-info.

```yaml
type: custom:prism-weather-card
entity: weather.home
title: Weather
accent: blue
```

```yaml
# Condition + forecast from a weather service; readings from local (Ecowitt) sensors.
type: custom:prism-weather-card
entity: weather.home
temperature_entity: sensor.gw2000_outdoor_temperature
humidity_entity: sensor.gw2000_humidity
wind_speed_entity: sensor.gw2000_wind_speed
wind_bearing_entity: sensor.gw2000_wind_direction
pressure_entity: sensor.gw2000_relative_pressure
```

---

## `custom:prism-forecast-card`

Flat **forecast strip** — one column per period: a day/hour label ("Today"/"Now" for the first), a flat condition icon, **high/low** temps, and an optional **precipitation-chance** chip.

Two forecast **sources**:

- `entity` (default) — a `weather.*` entity's forecast via `weather.get_forecasts`.
- `nws` — the **US National Weather Service** API ([api.weather.gov](https://www.weather.gov/documentation/services-web-api)). It's **free and needs no API key**, but only covers **US locations**. The card looks up your coordinates via `/points/{lat},{lon}` and reads the gridpoint forecast; results are cached and refreshed every 15 minutes.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `source` | string | `entity` | `entity` (a `weather.*` entity) or `nws` (US National Weather Service). |
| `entity` | string | — | **Required when `source: entity`.** A `weather.*` entity. |
| `location` | string | `home` | *(nws)* `home` (use your Home Assistant location) or `custom` (enter coordinates below). |
| `latitude` | number | — | *(nws, `location: custom`)* Latitude. |
| `longitude` | number | — | *(nws, `location: custom`)* Longitude. |
| `units` | string | `us` | *(nws)* `us` (°F, mph) or `si` (°C, km/h). |
| `forecast_type` | string | `daily` | `daily` or `hourly`. (Named `forecast_type`, not `type`, because `type` is Lovelace's reserved card-type key.) |
| `count` | number | `5` | Number of columns shown. |
| `show_precip` | bool | `true` | Show the precipitation-chance chip. |
| `animate` | bool | `false` | Animate the (small) condition icons. |
| `title` | string | — | Card header. |
| `accent` | string | `theme` | Colours the precipitation chip. |

Daily periods show `temperature` (high) over `templow` (low); hourly periods show the single `temperature`. Overflow scrolls horizontally. Tapping opens more-info (weather-entity source only). For the NWS source, its plain-language `shortForecast` text is mapped onto the shared flat icon set.

```yaml
# Weather-entity source (default)
type: custom:prism-forecast-card
entity: weather.home
title: Forecast
forecast_type: daily   # or: hourly
count: 7
accent: blue
```

```yaml
# US National Weather Service source — free, no API key, US only.
# Uses your Home Assistant location by default.
type: custom:prism-forecast-card
source: nws
title: Forecast
forecast_type: daily
count: 7
units: us              # or: si
accent: blue
```

```yaml
# NWS with custom coordinates instead of the Home Assistant location.
type: custom:prism-forecast-card
source: nws
location: custom
latitude: 40.7128
longitude: -74.006
units: us
```

---

## `custom:prism-sun-card`

Flat **sun-path arc**: a dome of the sky from sunrise to sunset with the sun riding along it, the **traveled portion filled with the accent**, **sunrise/sunset times** at each end, and a live **"sets in / rises in"** countdown in the middle.

Optionally, **after sunset** it flips to a **moon view**: a moon-phase glyph drawn to the current illuminated fraction and **positioned on the sky by the moon's azimuth**, the phase name + **illumination %**, the next **sunrise**, and chips for **moonrise / moonset**, **next full moon**, and **next dark night** when their sensors are configured.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `entity` | string | `sun.sun` | The sun entity. Uses its `next_rising`, `next_setting`, `elevation`, and state. |
| `name` | string | friendly name | Used in the accessible label. |
| `title` | string | — | Card header. |
| `accent` | string | `amber` | Colours the traveled arc and the sun. |
| `show_moon` | bool | `true` | After sunset, show the moon view instead of the resting sun arc. |
| `moon_entity` | string | `sensor.moon` | Moon-phase sensor (the Moon integration's `sensor.moon`). State is a phase name like `waxing_gibbous`, or a numeric phase. |
| `moon_azimuth_entity` | string | — | Optional azimuth sensor (degrees) — positions the moon on the sky (E→S→W maps left→top→right). Also read from an `azimuth`/`moon_azimuth` attribute on the moon sensor. AstroWeather: `moon_azimuth`. |
| `moonrise_entity` | string | — | Optional moonrise timestamp sensor. |
| `moonset_entity` | string | — | Optional moonset timestamp sensor. |
| `next_full_moon_entity` | string | — | Optional timestamp sensor → a "Full in Xd" chip. AstroWeather: `moon_next_full_moon`. |
| `next_dark_night_entity` | string | — | Optional. A timestamp → "Dark in Xh", or a duration sensor (e.g. AstroWeather `deep_sky_darkness` hours) → "Dark 6.2 h". |
| `moon_illumination_entity` | string | — | Optional illumination-% sensor. If unset, illumination is computed from the phase. |

The azimuth / next-full-moon / dark-night values are designed to pair with the **[AstroWeather](https://github.com/mawinkler/astroweather)** integration, but any sensor providing those works. When any of the optional moon sensors are set, the tile is one grid row taller to fit the chip row.

Daytime progress uses the next setting as today's sunset and approximates today's sunrise from the next rising. At night, with `show_moon` on and a moon sensor available, the card shows the moon phase; otherwise the arc rests with a moon on the horizon. Tap opens more-info.

```yaml
type: custom:prism-sun-card
entity: sun.sun
title: Sun
accent: amber
```

```yaml
# With moon phase after sunset (needs the Moon integration for sensor.moon).
type: custom:prism-sun-card
entity: sun.sun
title: Sun & Moon
accent: amber
show_moon: true
moon_entity: sensor.moon
moonrise_entity: sensor.moonrise   # optional
moonset_entity: sensor.moonset     # optional
```

```yaml
# Full moon view with AstroWeather sensors.
type: custom:prism-sun-card
entity: sun.sun
title: Sun & Moon
accent: amber
moon_entity: sensor.astroweather_moon_phase
moon_azimuth_entity: sensor.astroweather_moon_azimuth
moonrise_entity: sensor.astroweather_moonrise
moonset_entity: sensor.astroweather_moonset
next_full_moon_entity: sensor.astroweather_moon_next_full_moon
next_dark_night_entity: sensor.astroweather_deep_sky_darkness
```

---

## `custom:prism-uv-card`

Flat **UV-index tile**: a big value **coloured by its WHO risk band**, the category label + **sun-protection advice**, and a flat segmented **UV-ramp scale** (green → yellow → orange → red → purple) with a marker at the current value.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `entity` | string | — | **Required.** A UV sensor (uses its state) or a `weather.*` entity (uses an attribute). |
| `attribute` | string | `uv_index` | Attribute to read when `entity` is a weather entity (or to force reading an attribute). |
| `name` | string | friendly name | Used in the accessible label. |
| `title` | string | — | Card header. |
| `show_advice` | bool | `true` | Show the protection-advice line. |
| `show_scale` | bool | `true` | Show the UV-ramp scale + ticks. |

Risk bands (WHO): **0–2** Low · **3–5** Moderate · **6–7** High · **8–10** Very high · **11+** Extreme. The value, category pill, and marker all follow the band colour. Tap opens more-info.

```yaml
type: custom:prism-uv-card
entity: sensor.uv_index
title: UV Index
```

---

## `custom:prism-rain-card`

Animated flat **rain-gauge tile**: a measuring cylinder **fills with the current rain-event total**, and raindrops **fall into it at a rate set by the intensity** (rain rate). The event amount is the dominant value, with the intensity + a **rain-rate descriptor** (Light / Moderate / Heavy / Violent) beside it, and chips for the hourly / 24-hour / weekly / monthly totals.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `event_entity` | string | — | **Required.** Rain-event total sensor — fills the gauge and is the big value. |
| `intensity_entity` | string | — | Rain rate (e.g. `in/h` or `mm/h`); sets the drop density/speed + descriptor. |
| `hourly_entity` | string | — | Hourly total (chip). |
| `daily_entity` | string | — | 24-hour total (chip). |
| `weekly_entity` | string | — | Weekly total (chip). |
| `monthly_entity` | string | — | Monthly total (chip). |
| `max` | number | `1` in / `25` mm | Event total that fills the gauge to the top. |
| `animate` | bool | `true` | Falling drops + water surface (respects `prefers-reduced-motion`). |
| `title` | string | — | Card header. |
| `accent` | string | `blue` | Water + drops colour. |

Units follow each sensor's `unit_of_measurement` (inches → 2 decimals, else 1); the intensity is normalised to mm/h for the descriptor. Tap the gauge (or a chip) for more-info.

```yaml
type: custom:prism-rain-card
title: Rainfall
event_entity: sensor.rain_event
intensity_entity: sensor.rain_rate
hourly_entity: sensor.rain_hourly
daily_entity: sensor.rain_24h
weekly_entity: sensor.rain_weekly
monthly_entity: sensor.rain_monthly
accent: blue
```

---

## `custom:prism-aqi-card`

Flat **air-quality tile**: a big AQI value **coloured by its US EPA category**, the category pill + **health advice**, and a flat segmented scale of the six EPA categories (Good → Hazardous) with a marker at the current value.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `entity` | string | — | **Required.** An AQI sensor (US EPA, 0–500) — uses its state. |
| `attribute` | string | — | Read an attribute instead of the state. |
| `name` | string | friendly name | Used in the accessible label. |
| `title` | string | — | Card header. |
| `show_advice` | bool | `true` | Show the health-advice line. |
| `show_scale` | bool | `true` | Show the Good→Hazardous scale + ticks. |

Categories (US EPA): **0–50** Good · **51–100** Moderate · **101–150** Unhealthy for sensitive groups · **151–200** Unhealthy · **201–300** Very unhealthy · **301–500** Hazardous. The value, category pill, and marker all follow the category colour. Tap opens more-info.

```yaml
type: custom:prism-aqi-card
entity: sensor.air_quality_index
title: Air Quality
```

---

## `custom:prism-lightning-card`

Flat **lightning tile**: the **strike count** is the dominant value, with the **last-strike time** and **distance** for context, and an animated flat storm cloud whose **bolt flickers**. Built for lightning sensors like Ecowitt / AS3935.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `count_entity` | string | — | Strike-count sensor — the big value. Required (unless `distance_entity`/`time_entity` is set). |
| `distance_entity` | string | — | Distance to last strike (km or miles, from the sensor's unit). |
| `time_entity` | string | — | Last-strike time — a timestamp, or a "minutes ago" number. |
| `name` | string | friendly name | Used in the accessible label. |
| `title` | string | — | Card header. |
| `accent` | string | `amber` | Colours the strike-count value. |
| `animate` | bool | `true` | Flicker the bolt (respects `prefers-reduced-motion`). |

Tap opens more-info.

```yaml
type: custom:prism-lightning-card
title: Lightning
count_entity: sensor.lightning_strike_count
distance_entity: sensor.lightning_distance
time_entity: sensor.lightning_last_strike
accent: amber
```

---

## `custom:prism-lux-card`

Flat **illuminance tile** with a **living sun**: the sun disc grows and its rays lengthen + **warm in colour** as the light level rises (log-scaled across the huge lux range), with a slow ray rotation and gentle pulse. At night (< 1 lx) it shows a moon. Big lux value + a **plain-language level**.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `entity` | string | — | **Required.** An illuminance sensor (lux) — uses its state. |
| `attribute` | string | — | Read an attribute instead of the state. |
| `name` | string | friendly name | Used in the accessible label. |
| `title` | string | — | Card header. |
| `animate` | bool | `true` | Ray rotation + pulse (respects `prefers-reduced-motion`). |

Levels: **< 10** Dark · **< 100** Dim · **< 1 000** Indoor · **< 10 000** Overcast · **< 25 000** Daylight · **≥ 25 000** Bright sun. The sun colour and the level label follow the band. Tap opens more-info.

```yaml
type: custom:prism-lux-card
entity: sensor.illuminance
title: Illuminance
```

---

## Sizing

Cards implement `getGridOptions()` for the sections layout:

| Card | rows | columns |
|------|------|---------|
| Stat | 2 (3 with sparkline) | 6 |
| Gauge | 4 | 6 |
| Sparkline | 3 | 12 |
| Power | 3 (4 with sparkline) | 6 |
| Linear gauge | 2 | 6 |
| Bar | 1 + one per entity | 6 |
| Entities | 1 + one per entity | 6 |
| Switch | 2 | 3 |
| Light | 2 | 4 |
| Climate | 3 | 6 |
| Cover | 3 | 4 |
| Media | 3 | 6 |
| Wind | 3 | 6 |
| Weather | 3 | 6 |
| Forecast | 3 | 12 |
| Sun | 3 (4 with moon chips) | 6 |
| UV | 3 | 6 |
| Rain | 3 | 6 |
| Air Quality | 3 | 6 |
| Lightning | 3 | 6 |
| Lux | 3 | 6 |

You can override with `grid_options` per card.
