# Prism — Theming Guide

Prism separates **look** (the theme) from **behaviour** (the cards). The theme
sets CSS custom properties; the cards consume them. Change the theme → every
card follows.

## Design tokens

Defined in `themes/prism.yaml`, consumed by cards with sensible fallbacks:

| Token | Purpose | Fallback chain |
|-------|---------|----------------|
| `--prism-accent` | Primary accent (lines, fills, chips) | `--primary-color` → `#3aa0e8` |
| `--prism-surface` | Card background | `--ha-card-background` → `--card-background-color` |
| `--prism-surface-2` | Inset/secondary surface | derived from surface via `color-mix` |
| `--prism-text-primary` | Values, headings | `--primary-text-color` |
| `--prism-text-secondary` | Labels, units, captions | `--secondary-text-color` |
| `--prism-border` | 1px card border (flat separation) | `--divider-color` |
| `--prism-radius` | Corner radius | `--ha-card-border-radius` → `18px` |
| `--prism-shadow` | Card shadow (flat = `none`) | `none` |
| `--prism-gap` | Card padding | `16px` |
| `--prism-good` / `--prism-warn` / `--prism-bad` | Semantic state colours | `--success/warning/error-color` |

Because of the fallbacks, the cards look correct **without** the Prism theme —
they simply inherit native HA tokens. With the Prism theme, they pick up the
full flat treatment.

## Light & dark

`themes/prism.yaml` uses HA `modes: { light:, dark: }`, so tokens swap
automatically with the user's light/dark preference. No per-card work needed.

## Accent variants

Shipped: **Prism**, **Prism Emerald**, **Prism Amber**, **Prism Violet**,
**Prism Slate**. Each reuses the same flat base (via YAML anchors) and changes
only the accent.

## Make your own colour theme

1. Open `themes/prism.yaml`.
2. Copy a full block, e.g. `Prism Emerald:` … through its `dark:` section.
3. Rename it (this name appears in the theme picker).
4. Change the accent lines in **both** `light:` and `dark:`:
   ```yaml
   prism-accent: "#c2185b"
   primary-color: "#c2185b"
   accent-color: "#c2185b"
   paper-item-icon-active-color: "#c2185b"
   state-icon-active-color: "#c2185b"
   switch-checked-color: "#c2185b"
   ```
5. Restart HA (or reload themes) and pick it in your profile.

Want a different *surface* feel too (e.g. warmer greys)? Override
`prism-surface`, `prism-surface-2`, and `prism-border` in your block — the
cards will follow.

## Per-card override

Any card can override the accent locally via `accent:` (preset name or hex)
without touching the theme — handy for colour-coding one tile.
