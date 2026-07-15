/**
 * prism-bar-card
 * Flat horizontal bar chart comparing several entities against a shared
 * scale. Each row is a labelled bar with its value; the largest sets the
 * scale (or pin an explicit max). Built for breakdowns — power per circuit,
 * energy per room, humidity per sensor — never a bare list of numbers.
 *
 * Bar colour resolves per row: explicit `color` → severity `segments`
 * (by value) → the card accent.
 *
 * type: custom:prism-bar-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  // Normalise a bar entry to { entity, name?, color?, icon? }.
  function normBar(b) {
    if (typeof b === 'string') return { entity: b };
    return { ...b };
  }

  // ── Editor ────────────────────────────────────────────────────────
  class PrismBarCardEditor extends P.PrismEditor {
    _bars() {
      const list = Array.isArray(this._config.entities) ? this._config.entities : [];
      return list.map(normBar);
    }

    _setBars(bars) {
      const cfg = { ...this._config };
      cfg.entities = bars.map((b) => {
        const o = { entity: b.entity || '' };
        if (b.name) o.name = b.name;
        if (b.color) o.color = b.color;
        if (b.icon) o.icon = b.icon;
        // collapse to a plain string when only an entity is set
        return b.name || b.color || b.icon ? o : (o.entity || o);
      });
      this._fire(cfg);
    }

    // Re-render fields and re-bind hass to any freshly created pickers.
    _rerender() {
      this._render();
      if (this._hass) {
        this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((p) => { p.hass = this._hass; });
      }
    }

    _fields(stack) {
      const c = this._config;
      stack.append(
        this._tf('Title (optional)', c.title, (v) => this._patch('title', v)),
        this._tf('Unit override', c.unit, (v) => this._patch('unit', v)),
        this._tf('Decimals', c.decimals, (v) => this._patch('decimals', v), { type: 'number' }),
        this._tf('Minimum (baseline)', c.min, (v) => this._patch('min', v), { type: 'number' }),
        this._tf('Maximum (blank = auto from largest)', c.max, (v) => this._patch('max', v), { type: 'number' }),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._switch('Sort by value (descending)', !!c.sort, (v) => this._patch('sort', v)),
        this._switch('Show values', c.show_value !== false, (v) => this._patch('show_value', v)),
        this._section('Entities'),
        this._barsField(),
        this._section('Severity bands (optional)'),
        this._hint('JSON array, e.g. [{"from":0,"color":"green"},{"from":1000,"color":"amber"},{"from":2000,"color":"red"}]. Colours a bar by its value unless the bar has its own colour.'),
        this._segmentsField(c.segments)
      );
    }

    _barsField() {
      const bars = this._bars();
      const wrap = document.createElement('div');
      wrap.className = 'bars';

      bars.forEach((bar, i) => {
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.appendChild(this._picker(`Entity ${i + 1}`, bar.entity, (v) => {
          const b = this._bars(); b[i].entity = v; this._setBars(b);
        }));
        const sub = document.createElement('div');
        sub.className = 'bar-sub';
        sub.append(
          this._tf('Name', bar.name, (v) => { const b = this._bars(); b[i].name = v; this._setBars(b); }),
          this._colorField(bar.color, (v) => { const b = this._bars(); b[i].color = v; this._setBars(b); })
        );
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'rm';
        rm.textContent = 'Remove';
        rm.addEventListener('click', () => { const b = this._bars(); b.splice(i, 1); this._setBars(b); this._rerender(); });
        row.append(sub, rm);
        wrap.appendChild(row);
      });

      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'add';
      add.textContent = '+ Add entity';
      add.addEventListener('click', () => { const b = this._bars(); b.push({ entity: '' }); this._setBars(b); this._rerender(); });
      wrap.appendChild(add);
      return wrap;
    }

    // Compact colour picker: "accent" (blank) or a custom colour.
    _colorField(value, onChange) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const lbl = document.createElement('label');
      lbl.className = 'lbl';
      lbl.textContent = 'Colour';
      const row = document.createElement('div');
      row.className = 'accent-row';
      const sel = document.createElement('select');
      sel.className = 'sel';
      const custom = value != null && value !== '' && !P.ACCENTS[value];
      ['accent', ...Object.keys(P.ACCENTS), 'custom'].forEach((name) => {
        const o = document.createElement('option');
        o.value = name; o.textContent = name;
        if ((name === value) || (name === 'accent' && (value == null || value === '')) || (name === 'custom' && custom)) o.selected = true;
        sel.appendChild(o);
      });
      const color = document.createElement('input');
      color.type = 'color'; color.className = 'color';
      color.value = P.ACCENTS[value] || (custom ? value : '#3aa0e8');
      color.style.display = custom ? 'inline-block' : 'none';
      sel.addEventListener('change', (e) => {
        const v = e.target.value;
        if (v === 'custom') { color.style.display = 'inline-block'; onChange(color.value); }
        else { color.style.display = 'none'; onChange(v === 'accent' ? '' : v); }
      });
      color.addEventListener('input', (e) => onChange(e.target.value));
      row.append(sel, color);
      wrap.append(lbl, row);
      return wrap;
    }

    _segmentsField(value) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const ta = document.createElement('textarea');
      ta.rows = 4; ta.className = 'sel'; ta.style.fontFamily = 'monospace';
      ta.value = value ? JSON.stringify(value, null, 2) : '';
      ta.placeholder = '[]';
      ta.addEventListener('change', (e) => {
        const t = e.target.value.trim();
        if (!t) { this._patch('segments', ''); return; }
        try { this._patch('segments', JSON.parse(t)); } catch (_) { /* wait for valid JSON */ }
      });
      wrap.appendChild(ta);
      return wrap;
    }

    _baseStyle() {
      const style = super._baseStyle();
      style.textContent += `
        .bars { display:flex; flex-direction:column; gap:14px; }
        .bar-row { display:flex; flex-direction:column; gap:8px; padding:12px; border:1px solid var(--divider-color,rgba(0,0,0,.08)); border-radius:8px; }
        .bar-sub { display:flex; gap:8px; }
        .bar-sub > .field:first-child { flex:1; }
        .rm { align-self:flex-start; font:500 12px/1 inherit; cursor:pointer; color:var(--error-color,#c62828); background:none; border:none; padding:2px 0; }
        .add { align-self:flex-start; font:600 13px/1 inherit; cursor:pointer; color:var(--primary-color,#3aa0e8); background:none; border:1px dashed var(--divider-color,#ccc); border-radius:8px; padding:10px 14px; }
      `;
      return style;
    }
  }
  customElements.define('prism-bar-card-editor', PrismBarCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismBarCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
    }

    setConfig(config) {
      const list = config.entities || config.bars;
      if (!Array.isArray(list) || !list.length) {
        throw new Error('prism-bar-card: `entities` must be a non-empty list.');
      }
      this._config = { min: 0, show_value: true, ...config, entities: list };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 1 + (this._config?.entities?.length || 1); }
    getGridOptions() {
      const n = this._config?.entities?.length || 1;
      return { rows: Math.max(2, n + (this._config?.title ? 2 : 1)), columns: 6, min_rows: 2, min_columns: 4 };
    }

    static getConfigElement() { return document.createElement('prism-bar-card-editor'); }
    static getStubConfig(hass) {
      const sensors = hass ? Object.keys(hass.states).filter((e) => e.startsWith('sensor.') && !isNaN(parseFloat(hass.states[e].state))).slice(0, 3) : [];
      return { title: 'Comparison', entities: sensors.length ? sensors : ['sensor.example'], sort: true, accent: 'blue' };
    }

    _segColor(value) {
      const segs = Array.isArray(this._config.segments) ? this._config.segments : [];
      if (!segs.length) return null;
      const sorted = [...segs].sort((a, b) => a.from - b.from);
      let col = P.resolveAccent(sorted[0].color);
      for (const s of sorted) if (value >= s.from) col = P.resolveAccent(s.color);
      return col;
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const hass = this._hass;
      const accent = P.resolveAccent(c.accent);
      const min = Number(c.min) || 0;

      // Build row models.
      let rows = c.entities.map(normBar).map((b) => {
        const st = hass.states[b.entity];
        const raw = P.num(hass, b.entity);
        const has = !isNaN(raw);
        return {
          entity: b.entity,
          name: b.name || (st ? st.attributes.friendly_name : b.entity),
          icon: b.icon,
          color: b.color ? P.resolveAccent(b.color) : null,
          raw, has,
          unit: P.unitOf(hass, b.entity, c.unit),
        };
      });
      if (c.sort) rows = rows.slice().sort((a, b) => (b.has ? b.raw : -Infinity) - (a.has ? a.raw : -Infinity));

      // Shared scale.
      let max = Number(c.max);
      if (!(max > min)) {
        max = -Infinity;
        for (const r of rows) if (r.has && r.raw > max) max = r.raw;
        if (!(max > min)) max = min + 1;
      }

      const dec = (v) => c.decimals != null ? Number(c.decimals) : (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);

      const rowsHtml = rows.map((r) => {
        const frac = r.has ? P.clamp((r.raw - min) / (max - min || 1), 0, 1) : 0;
        const col = r.color || this._segColor(r.raw) || accent;
        const valTxt = r.has ? `${P.esc(P.fmtNumber(r.raw, dec(r.raw)))}${r.unit ? `<span class="u"> ${P.esc(r.unit)}</span>` : ''}` : '—';
        const iconHtml = r.icon ? `<ha-icon class="ic" icon="${P.esc(r.icon)}" style="color:${col}"></ha-icon>` : '';
        return `
          <button class="row" data-entity="${P.esc(r.entity)}" aria-label="${P.esc(r.name)}">
            <div class="line">
              <span class="nm">${iconHtml}${P.esc(r.name)}</span>
              ${c.show_value !== false ? `<span class="val">${valTxt}</span>` : ''}
            </div>
            <div class="track"><div class="fill" style="width:${(frac * 100).toFixed(1)}%;background:${col};"></div></div>
          </button>`;
      }).join('');

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; }
          .rows { display:flex; flex-direction:column; gap:14px; }
          .row { display:flex; flex-direction:column; gap:6px; background:none; border:none; padding:0;
                 font:inherit; color:inherit; text-align:left; cursor:pointer; width:100%; }
          .line { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
          .nm { font-size:13px; font-weight:600; color:var(--_text); display:flex; align-items:center; gap:6px;
                white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
          .ic { --mdc-icon-size:16px; width:16px; height:16px; flex:none; }
          .val { font-size:14px; font-weight:700; color:var(--_text); white-space:nowrap; flex:none; }
          .val .u { font-size:11px; font-weight:500; color:var(--_text-2); }
          .track { position:relative; height:9px; border-radius:5px; background:var(--_surface-2); overflow:hidden; }
          .fill { position:absolute; top:0; bottom:0; left:0; border-radius:5px; transition:width .5s; min-width:2px; }
        </style>
        <div class="prism-card">
          ${c.title ? `<div class="prism-head"><div class="prism-title">${P.esc(c.title)}</div></div>` : ''}
          <div class="rows">${rowsHtml}</div>
        </div>`;

      this.shadowRoot.querySelectorAll('.row').forEach((el) => {
        el.addEventListener('click', () => this.dispatchEvent(new CustomEvent('hass-more-info', {
          detail: { entityId: el.dataset.entity }, bubbles: true, composed: true,
        })));
      });
    }
  }

  customElements.define('prism-bar-card', PrismBarCard);
  P.registerCard({
    type: 'prism-bar-card',
    name: 'Prism Bar Card',
    description: 'Horizontal bar chart comparing entities on a shared scale, with per-bar colour and severity bands.',
  });
})();
