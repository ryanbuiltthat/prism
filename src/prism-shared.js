/**
 * Prism — shared runtime for all Prism cards.
 *
 * Exposes a single global namespace, `window.PrismUI`, holding the design
 * tokens, formatting helpers, and a reusable config-editor base class that
 * every Prism card builds on. Load this before any individual card file
 * (the bundled `prism.js` already concatenates them in the right order).
 *
 * Design language: flat, minimal, data-first. No 3D, no heavy shadows.
 * All surfaces/colours resolve from CSS custom properties so a Prism card
 * automatically follows the active Home Assistant theme — and picks up the
 * richer flat look when the `Prism` theme (themes/prism.yaml) is active.
 */
(function () {
  'use strict';

  if (window.PrismUI && window.PrismUI.version) return; // already loaded

  const VERSION = '0.6.0';

  // ── Named accent presets ──────────────────────────────────────────
  // Selectable in every card editor; a card may also use a raw hex value.
  const ACCENTS = {
    blue:   '#3aa0e8',
    teal:   '#28b5a6',
    green:  '#3aa76d',
    amber:  '#e0922e',
    orange: '#e8703a',
    red:    '#c64b4b',
    pink:   '#d1568f',
    purple: '#8a6fd6',
    slate:  '#5b6b78',
  };

  // ── Formatting / value helpers ────────────────────────────────────
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Numeric state of an entity, or NaN.
  function num(hass, entityId) {
    if (!entityId || !hass) return NaN;
    const s = hass.states[entityId];
    if (!s) return NaN;
    return parseFloat(s.state);
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  // Format a number with a fixed decimal count and thousands separators.
  function fmtNumber(value, decimals) {
    if (value == null || isNaN(value)) return '—';
    const d = decimals == null ? 0 : decimals;
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  }

  // Resolve a card's accent config into a usable CSS colour.
  // Accepts a preset name ("blue"), a raw hex ("#ff8800"), any CSS colour,
  // or "theme" / undefined to defer to the --prism-accent theme token.
  function resolveAccent(accent) {
    if (!accent || accent === 'theme') return 'var(--prism-accent, #3aa0e8)';
    if (ACCENTS[accent]) return ACCENTS[accent];
    return accent; // raw hex / css colour
  }

  // Unit of an entity (config override wins).
  function unitOf(hass, entityId, override) {
    if (override != null && override !== '') return override;
    return hass?.states?.[entityId]?.attributes?.unit_of_measurement ?? '';
  }

  function friendlyName(hass, entityId) {
    return hass?.states?.[entityId]?.attributes?.friendly_name ?? entityId ?? '';
  }

  // ── Shared token stylesheet ───────────────────────────────────────
  // Injected into every card's shadow root. Each token falls back through
  // the Prism theme token → native HA token → hard default, so cards look
  // right with or without the Prism theme installed, in light and dark.
  const TOKEN_STYLE = `
    :host {
      --_accent: var(--prism-accent, var(--primary-color, #3aa0e8));
      --_surface: var(--prism-surface, var(--ha-card-background, var(--card-background-color, #fff)));
      --_surface-2: var(--prism-surface-2, color-mix(in srgb, var(--_surface) 94%, #808c96 6%));
      --_text: var(--prism-text-primary, var(--primary-text-color, #15181a));
      --_text-2: var(--prism-text-secondary, var(--secondary-text-color, #7c8084));
      --_border: var(--prism-border, var(--divider-color, rgba(120,130,140,.16)));
      --_radius: var(--prism-radius, var(--ha-card-border-radius, 18px));
      --_shadow: var(--prism-shadow, none);
      --_good: var(--prism-good, var(--success-color, #3aa76d));
      --_warn: var(--prism-warn, var(--warning-color, #e0922e));
      --_bad: var(--prism-bad, var(--error-color, #c64b4b));
      --_gap: var(--prism-gap, 16px);
      --_font: var(--prism-font, var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif));
      display: block;
    }
    .prism-card {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      background: var(--_surface);
      color: var(--_text);
      border: 1px solid var(--_border);
      border-radius: var(--_radius);
      box-shadow: var(--_shadow);
      padding: var(--_gap);
      font-family: var(--_font);
      -webkit-font-smoothing: antialiased;
    }
    .prism-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; margin-bottom: 10px;
    }
    .prism-title {
      font-size: 13px; font-weight: 600; color: var(--_text-2);
      letter-spacing: .01em; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis;
    }
    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; transition: none !important; }
    }
  `;

  // ── History / geometry helpers (shared by stat + sparkline) ───────

  // Fetch numeric history for an entity over the last `hours`.
  // Returns [{ t: epoch_ms, v: number }] sorted ascending. Never throws.
  async function fetchHistory(hass, entityId, hours) {
    if (!hass || !entityId) return [];
    const end = new Date();
    const start = new Date(end.getTime() - hours * 3600 * 1000);
    try {
      const res = await hass.callWS({
        type: 'history/history_during_period',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: [entityId],
        minimal_response: true,
        no_attributes: true,
      });
      const arr = (res && res[entityId]) || [];
      const out = [];
      for (const p of arr) {
        const t = p.lu != null ? p.lu * 1000
          : p.last_updated ? Date.parse(p.last_updated)
          : p.last_changed ? Date.parse(p.last_changed) : NaN;
        const v = parseFloat(p.s ?? p.state);
        if (!isNaN(t) && !isNaN(v)) out.push({ t, v });
      }
      return out.sort((a, b) => a.t - b.t);
    } catch (e) {
      return [];
    }
  }

  // Largest-Triangle-Three-Buckets-ish downsample (cheap): even stride.
  function downsample(points, maxPoints) {
    if (points.length <= maxPoints) return points;
    const stride = points.length / maxPoints;
    const out = [];
    for (let i = 0; i < maxPoints; i++) out.push(points[Math.floor(i * stride)]);
    out.push(points[points.length - 1]);
    return out;
  }

  // Build SVG line + area paths for a series inside a w×h box (with padding).
  // Returns { line, area, min, max, first, last } — all coordinates in the box.
  function sparklinePath(points, w, h, pad = 2) {
    if (!points.length) return { line: '', area: '', min: NaN, max: NaN, first: NaN, last: NaN };
    let min = Infinity, max = -Infinity;
    for (const p of points) { if (p.v < min) min = p.v; if (p.v > max) max = p.v; }
    if (min === max) { min -= 1; max += 1; } // flat line → centre it
    const t0 = points[0].t, t1 = points[points.length - 1].t;
    const span = t1 - t0 || 1;
    const range = max - min || 1;
    const x = (t) => pad + ((t - t0) / span) * (w - pad * 2);
    const y = (v) => pad + (1 - (v - min) / range) * (h - pad * 2);
    let line = '';
    points.forEach((p, i) => {
      line += `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
    });
    const area = `${line}L${x(t1).toFixed(1)} ${(h - pad).toFixed(1)}L${x(t0).toFixed(1)} ${(h - pad).toFixed(1)}Z`;
    return { line, area, min, max, first: points[0].v, last: points[points.length - 1].v };
  }

  // ── Card registry helper ──────────────────────────────────────────
  // Base for the per-card documentation links surfaced in HA's card picker.
  const DOCS_BASE = 'https://github.com/ryanbuiltthat/prism/blob/main/docs/cards.md';

  // Deep-link to a card's section in the card reference. The docs headings are
  // "## `custom:<type>`", which GitHub slugifies to "custom<type>" (the colon
  // is stripped), so the anchor is simply "custom" + the card type.
  function docsUrl(type) {
    return `${DOCS_BASE}#custom${type}`;
  }

  function registerCard(entry) {
    window.customCards = window.customCards || [];
    if (!window.customCards.some((c) => c.type === entry.type)) {
      // `documentationURL` shows a "Documentation" link on each card's tile in
      // the picker. Default it from the type; an entry may override it.
      window.customCards.push(Object.assign(
        { preview: true, documentationURL: docsUrl(entry.type) },
        entry
      ));
    }
  }

  // ── Shared card-runtime helpers ───────────────────────────────────

  // Tap vs. hold: a short press fires onTap; holding `ms` (default 500)
  // fires onHold instead. Enter/Space also fire onTap (keyboard).
  function bindTap(el, onTap, onHold, ms = 500) {
    let timer = null, held = false;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    el.addEventListener('pointerdown', () => {
      held = false; clear();
      if (onHold) timer = setTimeout(() => { held = true; onHold(); }, ms);
    });
    el.addEventListener('pointerup', () => { clear(); if (!held) onTap(); });
    el.addEventListener('pointerleave', clear);
    el.addEventListener('pointercancel', clear);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } });
  }

  // Drag/keyboard slider — the horizontal 0–100 track shared by the light,
  // cover, media, and fan tiles. `el` is the `.slider` element (with a `.fill`
  // child); it must already carry role="slider" and aria-valuenow markup.
  //   onCommit(pct)  – required; send the settled 0–100 value to Home Assistant.
  //   onDrag(bool)   – optional; toggled true while dragging so `set hass` can
  //                    skip re-rendering under the finger (guards the paint).
  //   fillColor(pct) – optional; returns the fill background for that value
  //                    (the light tile uses it to show the bulb colour).
  //   step           – optional keyboard increment (default 5).
  function dragSlider(el, { onCommit, onDrag, fillColor, step = 5 } = {}) {
    const fill = el.querySelector('.fill');
    const pctAt = (clientX) => {
      const r = el.getBoundingClientRect();
      return Math.round(clamp((clientX - r.left) / (r.width || 1), 0, 1) * 100);
    };
    const paint = (pct) => {
      fill.style.width = `${pct}%`;
      if (fillColor) fill.style.background = fillColor(pct);
      el.setAttribute('aria-valuenow', String(pct));
    };
    let pending = 0, dragging = false;
    const setDrag = (v) => { dragging = v; if (onDrag) onDrag(v); };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      setDrag(true); el.classList.add('dragging');
      el.setPointerCapture(e.pointerId);
      pending = pctAt(e.clientX); paint(pending);
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      pending = pctAt(e.clientX); paint(pending);
    });
    const end = () => {
      if (!dragging) return;
      setDrag(false); el.classList.remove('dragging');
      onCommit(pending);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      const cur = Number(el.getAttribute('aria-valuenow')) || 0;
      let next = cur;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = clamp(cur + step, 0, 100);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = clamp(cur - step, 0, 100);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = 100;
      else return;
      e.preventDefault();
      pending = next; paint(next); onCommit(next);
    });
  }

  // Optional card header markup — every card renders this from `config.title`.
  // Uses the shared .prism-head / .prism-title styles in TOKEN_STYLE.
  function titleHead(title) {
    return title ? `<div class="prism-head"><div class="prism-title">${esc(title)}</div></div>` : '';
  }

  // ══════════════════════════════════════════════════════════════════
  //  Base config editor
  //  Provides the common plumbing + form controls every Prism editor
  //  needs: entity pickers, text/number fields, dropdowns, an accent
  //  picker (preset + custom hex), switches, and section headers.
  // ══════════════════════════════════════════════════════════════════
  class PrismEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._lastFired = null;
    }

    connectedCallback() {
      if (this._config) this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((p) => {
        p.hass = hass;
      });
    }

    setConfig(config) {
      const s = JSON.stringify(config);
      if (s === this._lastFired) return;
      this._config = JSON.parse(s);
      this._render();
    }

    _fire(config) {
      this._lastFired = JSON.stringify(config);
      this._config = config;
      this.dispatchEvent(
        new CustomEvent('config-changed', {
          detail: { config },
          bubbles: true,
          composed: true,
        })
      );
    }

    // Set/remove a single key and fire.
    _patch(key, value) {
      const cfg = { ...this._config };
      if (value === '' || value == null) delete cfg[key];
      else cfg[key] = value;
      this._fire(cfg);
    }

    // ── Controls ────────────────────────────────────────────────────
    _tf(label, value, onChange, opts = {}) {
      const el = document.createElement('ha-textfield');
      el.label = label;
      el.value = value ?? '';
      el.style.width = '100%';
      if (opts.type) el.type = opts.type;
      if (opts.suffix) el.suffix = opts.suffix;
      el.addEventListener('change', (e) => {
        const v = e.target.value;
        onChange(opts.type === 'number' ? (v === '' ? '' : Number(v)) : v.trim());
      });
      return el;
    }

    _picker(label, value, onChange, opts = {}) {
      const el = document.createElement('ha-entity-picker');
      if (this._hass) el.hass = this._hass;
      el.value = value ?? '';
      el.label = label;
      el.style.width = '100%';
      el.allowCustomEntity = true;
      if (opts.domains) el.includeDomains = opts.domains;
      el.addEventListener('value-changed', (e) => onChange(e.detail.value));
      return el;
    }

    _select(label, options, value, onChange) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const lbl = document.createElement('label');
      lbl.className = 'lbl';
      lbl.textContent = label;
      const sel = document.createElement('select');
      sel.className = 'sel';
      options.forEach((opt) => {
        const o = document.createElement('option');
        const val = typeof opt === 'object' ? opt.value : opt;
        const txt = typeof opt === 'object' ? opt.label : opt;
        o.value = val;
        o.textContent = txt;
        if (val === value) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', (e) => onChange(e.target.value));
      wrap.append(lbl, sel);
      return wrap;
    }

    _switch(label, value, onChange) {
      const wrap = document.createElement('div');
      wrap.className = 'field row';
      const lbl = document.createElement('label');
      lbl.className = 'lbl';
      lbl.textContent = label;
      const sw = document.createElement('ha-switch');
      sw.checked = !!value;
      sw.addEventListener('change', (e) => onChange(e.target.checked));
      wrap.append(lbl, sw);
      return wrap;
    }

    // Accent picker: preset dropdown + custom colour input that stay in sync.
    _accentField(value, onChange) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const lbl = document.createElement('label');
      lbl.className = 'lbl';
      lbl.textContent = 'Accent colour';

      const row = document.createElement('div');
      row.className = 'accent-row';

      const sel = document.createElement('select');
      sel.className = 'sel';
      const opts = ['theme', ...Object.keys(ACCENTS), 'custom'];
      const isPreset = value == null || value === 'theme' || ACCENTS[value];
      opts.forEach((name) => {
        const o = document.createElement('option');
        o.value = name;
        o.textContent = name;
        if ((name === (value ?? 'theme')) || (name === 'custom' && !isPreset)) {
          o.selected = true;
        }
        sel.appendChild(o);
      });

      const color = document.createElement('input');
      color.type = 'color';
      color.className = 'color';
      color.value = ACCENTS[value] || (!isPreset ? value : '#3aa0e8');
      color.style.display = isPreset ? 'none' : 'inline-block';

      sel.addEventListener('change', (e) => {
        const v = e.target.value;
        if (v === 'custom') {
          color.style.display = 'inline-block';
          onChange(color.value);
        } else {
          color.style.display = 'none';
          onChange(v === 'theme' ? '' : v);
        }
      });
      color.addEventListener('input', (e) => onChange(e.target.value));

      row.append(sel, color);
      wrap.append(lbl, row);
      return wrap;
    }

    _section(text) {
      const h = document.createElement('div');
      h.className = 'section';
      h.textContent = text;
      return h;
    }

    _hint(text) {
      const h = document.createElement('div');
      h.className = 'hint';
      h.textContent = text;
      return h;
    }

    _baseStyle() {
      const style = document.createElement('style');
      style.textContent = `
        :host { display:block; padding:4px 0 12px; }
        .stack { display:flex; flex-direction:column; gap:12px; }
        .field { display:flex; flex-direction:column; gap:5px; }
        .field.row { flex-direction:row; align-items:center; justify-content:space-between; }
        .lbl { font:500 12px/1.2 var(--paper-font-body1_-_font-family, sans-serif); color:var(--secondary-text-color,#757575); }
        .sel {
          width:100%; box-sizing:border-box; padding:12px 10px; border-radius:6px;
          border:1px solid var(--divider-color,#ccc);
          background:var(--card-background-color,#fff); color:var(--primary-text-color,#212121);
          font:400 14px/1.2 inherit; cursor:pointer;
        }
        .accent-row { display:flex; gap:8px; align-items:center; }
        .accent-row .sel { flex:1; }
        .color { width:44px; height:44px; padding:0; border:1px solid var(--divider-color,#ccc); border-radius:6px; background:none; cursor:pointer; }
        .section { font:600 12px/1 var(--paper-font-body1_-_font-family, sans-serif); text-transform:uppercase; letter-spacing:.06em; color:var(--secondary-text-color,#757575); margin-top:8px; padding-top:12px; border-top:1px solid var(--divider-color,rgba(0,0,0,.08)); }
        .hint { font:400 11px/1.4 var(--paper-font-body1_-_font-family, sans-serif); color:var(--secondary-text-color,#757575); }
        ha-textfield, ha-entity-picker { width:100%; }
        .plist { display:flex; flex-direction:column; gap:14px; }
        .plist-row { display:flex; flex-direction:column; gap:8px; padding:12px; border:1px solid var(--divider-color,rgba(0,0,0,.08)); border-radius:8px; }
        .plist-body { display:flex; flex-direction:column; gap:8px; }
        .plist-sub { display:flex; gap:8px; }
        .plist-sub > .field { flex:1; min-width:0; }
        .plist-actions { display:flex; align-items:center; gap:8px; margin-top:2px; }
        .plist-mv { width:30px; height:30px; font:600 15px/1 inherit; cursor:pointer; color:var(--primary-text-color,#212121);
              background:none; border:1px solid var(--divider-color,#ccc); border-radius:6px; }
        .plist-mv:disabled { opacity:.35; cursor:default; }
        .plist-rm { margin-left:auto; font:500 12px/1 inherit; cursor:pointer; color:var(--error-color,#c62828); background:none; border:none; padding:2px 0; }
        .plist-add { align-self:flex-start; font:600 13px/1 inherit; cursor:pointer; color:var(--primary-color,#3aa0e8); background:none; border:1px dashed var(--divider-color,#ccc); border-radius:8px; padding:10px 14px; }
      `;
      return style;
    }

    // A "Title (optional)" field bound to config.title — every card's header.
    _titleField() {
      return this._tf('Title (optional)', this._config.title, (v) => this._patch('title', v));
    }

    // Re-render the editor and re-bind hass to freshly created entity pickers.
    _rerender() {
      this._render();
      if (this._hass) this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((p) => { p.hass = this._hass; });
    }

    // Generic dynamic list editor (add / remove / reorder rows).
    //   get()        -> current array of normalized item objects
    //   onChange(a)  -> called with the updated array
    //   newItem()    -> a blank item to append (default { entity: '' })
    //   row(item, i, set, body) -> append controls to `body`; call
    //                  set(patch) to merge patch into item i and fire onChange
    //   addLabel, reorder(bool)
    _listField(opts) {
      const items = opts.get();
      const reorder = opts.reorder !== false;
      const wrap = document.createElement('div');
      wrap.className = 'plist';

      items.forEach((item, i) => {
        const box = document.createElement('div'); box.className = 'plist-row';
        const body = document.createElement('div'); body.className = 'plist-body';
        const set = (patch) => {
          const cur = opts.get();
          opts.onChange(cur.map((it, j) => (j === i ? { ...it, ...patch } : it)));
        };
        opts.row(item, i, set, body);

        const actions = document.createElement('div'); actions.className = 'plist-actions';
        if (reorder) {
          const mv = (label, disabled, dir) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'plist-mv'; b.textContent = label; b.disabled = disabled;
            b.setAttribute('aria-label', dir < 0 ? 'Move up' : 'Move down');
            if (!disabled) b.addEventListener('click', () => {
              const cur = opts.get(); const j = i + dir;
              if (j < 0 || j >= cur.length) return;
              const [m] = cur.splice(i, 1); cur.splice(j, 0, m);
              opts.onChange(cur); this._rerender();
            });
            return b;
          };
          actions.append(mv('↑', i === 0, -1), mv('↓', i === items.length - 1, +1));
        }
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'plist-rm'; rm.textContent = 'Remove';
        rm.addEventListener('click', () => { const cur = opts.get(); cur.splice(i, 1); opts.onChange(cur); this._rerender(); });
        actions.appendChild(rm);

        box.append(body, actions);
        wrap.appendChild(box);
      });

      const add = document.createElement('button');
      add.type = 'button'; add.className = 'plist-add'; add.textContent = opts.addLabel || '+ Add entity';
      add.addEventListener('click', () => {
        const cur = opts.get(); cur.push(opts.newItem ? opts.newItem() : { entity: '' });
        opts.onChange(cur); this._rerender();
      });
      wrap.appendChild(add);
      return wrap;
    }

    // Subclasses implement _fields(stack) to append their controls.
    _render() {
      if (!this._config) return;
      this.shadowRoot.innerHTML = '';
      this.shadowRoot.appendChild(this._baseStyle());
      const stack = document.createElement('div');
      stack.className = 'stack';
      this._fields(stack);
      this.shadowRoot.appendChild(stack);
    }

    _fields() {
      /* implemented by subclass */
    }
  }

  // ── Export namespace ──────────────────────────────────────────────
  window.PrismUI = {
    version: VERSION,
    ACCENTS,
    TOKEN_STYLE,
    esc,
    num,
    clamp,
    fmtNumber,
    resolveAccent,
    unitOf,
    friendlyName,
    fetchHistory,
    downsample,
    sparklinePath,
    registerCard,
    docsUrl,
    bindTap,
    dragSlider,
    titleHead,
    PrismEditor,
  };

  // Friendly console banner (once).
  if (!window.__prismBanner) {
    window.__prismBanner = true;
    // eslint-disable-next-line no-console
    console.info(
      `%c PRISM %c ${VERSION} `,
      'background:#3aa0e8;color:#fff;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px;',
      'background:#15181a;color:#fff;border-radius:0 4px 4px 0;padding:2px 6px;'
    );
  }
})();
