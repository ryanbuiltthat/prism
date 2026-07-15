/**
 * prism-linear-gauge-card
 * Flat horizontal gauge: a single value on a linear min→max scale with
 * configurable severity bands. Two looks (mirrors the radial gauge):
 *   • fill  (default) — track + progress bar coloured by the active band.
 *   • bands           — full band strip + a marker at the current value.
 * Dominant value + unit on the right, name on the left, min/max end labels.
 *
 * type: custom:prism-linear-gauge-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  // ── Editor ────────────────────────────────────────────────────────
  class PrismLinearGaugeCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._picker('Entity (required)', c.entity, (v) => this._patch('entity', v)),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._tf('Icon (mdi:…)', c.icon, (v) => this._patch('icon', v)),
        this._tf('Unit override', c.unit, (v) => this._patch('unit', v)),
        this._tf('Minimum', c.min, (v) => this._patch('min', v), { type: 'number' }),
        this._tf('Maximum', c.max, (v) => this._patch('max', v), { type: 'number' }),
        this._tf('Decimals', c.decimals, (v) => this._patch('decimals', v), { type: 'number' }),
        this._select('Style', ['fill', 'bands'], c.style || 'fill', (v) => this._patch('style', v)),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._switch('Show min / max labels', c.show_minmax !== false, (v) => this._patch('show_minmax', v)),
        this._section('Severity bands'),
        this._hint('JSON array, e.g. [{"from":0,"color":"green"},{"from":60,"color":"amber"},{"from":85,"color":"red"}]. Colours accept preset names or hex.'),
        this._segmentsField(c.segments)
      );
    }

    _segmentsField(value) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const ta = document.createElement('textarea');
      ta.rows = 5; ta.className = 'sel'; ta.style.fontFamily = 'monospace';
      ta.value = JSON.stringify(value ?? [], null, 2);
      ta.addEventListener('change', (e) => {
        try { this._patch('segments', JSON.parse(e.target.value)); } catch (_) { /* wait for valid JSON */ }
      });
      wrap.appendChild(ta);
      return wrap;
    }
  }
  customElements.define('prism-linear-gauge-card-editor', PrismLinearGaugeCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismLinearGaugeCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-linear-gauge-card: `entity` is required.');
      this._config = { min: 0, max: 100, style: 'fill', ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 2; }
    getGridOptions() { return { rows: 2, columns: 6, min_rows: 2, min_columns: 3 }; }

    static getConfigElement() { return document.createElement('prism-linear-gauge-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('sensor.')) : 'sensor.example';
      return {
        entity: ent || 'sensor.example', min: 0, max: 100, style: 'fill',
        segments: [{ from: 0, color: 'green' }, { from: 60, color: 'amber' }, { from: 85, color: 'red' }],
      };
    }

    _segColor(value) {
      const segs = Array.isArray(this._config.segments) ? this._config.segments : [];
      if (!segs.length) return P.resolveAccent(this._config.accent);
      const sorted = [...segs].sort((a, b) => a.from - b.from);
      let col = P.resolveAccent(sorted[0].color);
      for (const s of sorted) if (value >= s.from) col = P.resolveAccent(s.color);
      return col;
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const hass = this._hass;
      const st = hass.states[c.entity];
      const bands = c.style === 'bands';
      const min = Number(c.min), max = Number(c.max);
      const span = (max - min) || 1;
      const raw = P.num(hass, c.entity);
      const has = !isNaN(raw);
      const frac = has ? P.clamp((raw - min) / span, 0, 1) : 0;
      const unit = P.unitOf(hass, c.entity, c.unit);
      const name = c.name || (st ? st.attributes.friendly_name : c.entity);
      const valColor = this._segColor(raw);
      const value = has ? P.fmtNumber(raw, c.decimals != null ? Number(c.decimals) : (Math.abs(raw) >= 100 ? 0 : 1)) : '—';

      // Band strip (bands style): coloured segments across the scale.
      let bandStrip = '';
      const segs = Array.isArray(c.segments) ? [...c.segments].sort((a, b) => a.from - b.from) : [];
      if (bands && segs.length) {
        bandStrip = segs.map((s, i) => {
          const f0 = P.clamp((s.from - min) / span, 0, 1);
          const f1 = i < segs.length - 1 ? P.clamp((segs[i + 1].from - min) / span, 0, 1) : 1;
          const w = Math.max(0, f1 - f0) * 100;
          return w > 0 ? `<div style="width:${w.toFixed(2)}%;background:${P.resolveAccent(s.color)};"></div>` : '';
        }).join('');
      }

      // Fill style: progress bar coloured by active band.
      const fill = (!bands && has)
        ? `<div class="fill" style="width:${(frac * 100).toFixed(1)}%;background:${valColor};"></div>` : '';

      // Marker (bands style) at the current value.
      const marker = (bands && has)
        ? `<div class="marker" style="left:${(frac * 100).toFixed(1)}%;"></div>` : '';

      const iconHtml = c.icon
        ? `<span class="icon" style="color:${valColor}"><ha-icon icon="${P.esc(c.icon)}"></ha-icon></span>` : '';

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; justify-content:center; gap:10px; cursor:pointer; }
          .top { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
          .name { font-size:13px; font-weight:600; color:var(--_text-2); display:flex; align-items:center; gap:6px;
                  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
          .icon { --mdc-icon-size:18px; width:18px; height:18px; flex:none; }
          .val { font-size:26px; font-weight:750; letter-spacing:-.02em; color:${valColor}; white-space:nowrap; flex:none; line-height:1; }
          .val .u { font-size:13px; font-weight:500; color:var(--_text-2); margin-left:3px; }
          .track { position:relative; height:12px; border-radius:6px; background:var(--_surface-2); overflow:hidden; display:flex; }
          .track > div { height:100%; }
          .fill { position:absolute; top:0; bottom:0; left:0; border-radius:6px; transition:width .5s; min-width:2px; }
          .marker { position:absolute; top:-3px; bottom:-3px; width:3px; border-radius:2px; background:var(--_text);
                    transform:translateX(-50%); transition:left .5s; box-shadow:0 0 0 2px var(--_surface); }
          .ends { display:flex; justify-content:space-between; font-size:11px; font-weight:500; color:var(--_text-2); margin-top:-2px; }
        </style>
        <div class="prism-card" role="button" tabindex="0" aria-label="${P.esc(name)}">
          <div class="top">
            <span class="name">${iconHtml}${P.esc(name)}</span>
            <span class="val">${P.esc(value)}${unit && has ? `<span class="u">${P.esc(unit)}</span>` : ''}</span>
          </div>
          <div class="track">${bandStrip}${fill}${marker}</div>
          ${c.show_minmax !== false ? `<div class="ends"><span>${P.esc(P.fmtNumber(min, 0))}</span><span>${P.esc(P.fmtNumber(max, 0))}</span></div>` : ''}
        </div>`;

      const card = this.shadowRoot.querySelector('.prism-card');
      const tap = () => this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: c.entity }, bubbles: true, composed: true,
      }));
      card.addEventListener('click', tap);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } });
    }
  }

  customElements.define('prism-linear-gauge-card', PrismLinearGaugeCard);
  P.registerCard({
    type: 'prism-linear-gauge-card',
    name: 'Prism Linear Gauge Card',
    description: 'Flat horizontal gauge with severity bands (fill bar or band strip + marker).',
  });
})();
