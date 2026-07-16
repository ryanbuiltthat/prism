# Prism — Card Reference

Every card is configurable in the visual editor. Options below are the YAML keys.

Common to all cards:

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `entity` | string | — | **Required** (except `prism-bar-card` and `prism-entities-card`, which take `entities`). |
| `name` | string | entity friendly name | Card label. |
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

You can override with `grid_options` per card.
