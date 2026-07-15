# Prism — Card Reference

Every card is configurable in the visual editor. Options below are the YAML keys.

Common to all cards:

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `entity` | string | — | **Required.** |
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

## Sizing

Cards implement `getGridOptions()` for the sections layout:

| Card | rows | columns |
|------|------|---------|
| Stat | 2 (3 with sparkline) | 6 |
| Gauge | 4 | 6 |
| Sparkline | 3 | 12 |

You can override with `grid_options` per card.
