/**
 * prism-uv-card
 * Flat UV-index tile: a big dominant value coloured by its WHO risk band, the
 * category label + sun-protection advice, and a flat segmented UV-ramp scale
 * (green → yellow → orange → red → purple) with a marker at the current value.
 *
 * Reads a UV sensor (state) or a `weather.*` entity's `uv_index` attribute.
 *
 * type: custom:prism-uv-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const domainOf = (id) => (id || '').split('.')[0];

  // WHO UV index risk bands. `from` is the inclusive lower bound; `w` is the
  // segment's width on the flat scale (which runs 0 → 12).
  const BANDS = [
    { from: 0, w: 3, color: '#3ea72d', label: 'Low', advice: 'No protection needed' },
    { from: 3, w: 3, color: '#f2c53d', label: 'Moderate', advice: 'Protection advised' },
    { from: 6, w: 2, color: '#f08b30', label: 'High', advice: 'Protection required' },
    { from: 8, w: 3, color: '#e0393e', label: 'Very high', advice: 'Extra protection' },
    { from: 11, w: 1, color: '#9160c8', label: 'Extreme', advice: 'Avoid being outside' },
  ];
  const SCALE_MAX = 12;
  const bandOf = (v) => { let b = BANDS[0]; for (const x of BANDS) if (v >= x.from) b = x; return b; };

  // ── Editor ────────────────────────────────────────────────────────
  class PrismUvCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('UV entity (sensor or weather)', c.entity, (v) => this._patch('entity', v), { domains: ['sensor', 'weather'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._tf('Attribute (weather entities)', c.attribute, (v) => this._patch('attribute', v)),
        this._switch('Show scale', c.show_scale !== false, (v) => this._patch('show_scale', v)),
        this._switch('Show advice', c.show_advice !== false, (v) => this._patch('show_advice', v)),
        this._hint('Reads the sensor state, or a weather entity attribute (default uv_index).')
      );
    }
  }
  customElements.define('prism-uv-card-editor', PrismUvCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismUvCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-uv-card: `entity` is required.');
      this._config = { show_scale: true, show_advice: true, ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 6, min_rows: 2, min_columns: 3 }; }

    static getConfigElement() { return document.createElement('prism-uv-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => /uv/i.test(e) && e.startsWith('sensor.')) : null;
      return { entity: ent || 'sensor.uv_index' };
    }

    _value() {
      const c = this._config, hass = this._hass;
      const st = hass.states[c.entity];
      if (!st) return NaN;
      if (domainOf(c.entity) === 'weather' || c.attribute) {
        return parseFloat(st.attributes[c.attribute || 'uv_index']);
      }
      return parseFloat(st.state);
    }

    _moreInfo() {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: this._config.entity }, bubbles: true, composed: true,
      }));
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const st = this._hass.states[c.entity];
      const raw = this._value();
      const has = !isNaN(raw);
      const band = has ? bandOf(raw) : BANDS[0];
      const name = c.name || (st ? st.attributes.friendly_name : c.entity);
      const value = has ? P.fmtNumber(raw, raw < 10 && !Number.isInteger(raw) ? 1 : 0) : '—';
      const markerPct = P.clamp((has ? raw : 0) / SCALE_MAX, 0, 1) * 100;

      const segs = BANDS.map((b) =>
        `<span class="seg" style="flex:${b.w};background:${b.color}"></span>`).join('');

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; cursor:pointer; }
          .top { display:flex; align-items:baseline; gap:10px; }
          .val { font-size:44px; font-weight:750; line-height:1; letter-spacing:-1.5px; color:${band.color}; }
          .uv { font-size:13px; font-weight:700; color:var(--_text-2); letter-spacing:.04em; }
          .cat { margin-left:auto; align-self:center; padding:3px 11px; border-radius:999px; font-size:12px;
                 font-weight:700; color:#fff; background:${band.color}; white-space:nowrap; }
          .advice { font-size:13px; font-weight:600; color:var(--_text); margin-top:6px; }
          .scale-wrap { margin-top:12px; }
          .scale { position:relative; display:flex; gap:2px; height:8px; }
          .seg { border-radius:3px; }
          .marker { position:absolute; top:-4px; width:4px; height:16px; border-radius:2px; background:var(--_text);
                    box-shadow:0 0 0 2px var(--_surface); transform:translateX(-50%); transition:left .4s; }
          .ticks { position:relative; height:13px; margin-top:5px; font-size:10px; font-weight:600; color:var(--_text-2); }
          .ticks span { position:absolute; transform:translateX(-50%); }
          .ticks span:first-child { transform:none; }
          .ticks span:last-child { transform:translateX(-100%); }
        </style>
        <div class="prism-card" role="button" tabindex="0" aria-label="${P.esc(name)} UV index">
          ${P.titleHead(c.title)}
          <div class="top">
            <span class="val">${P.esc(value)}</span>
            <span class="uv">UV${c.title ? '' : ` INDEX`}</span>
            <span class="cat">${P.esc(band.label)}</span>
          </div>
          ${c.show_advice !== false ? `<div class="advice">${P.esc(has ? band.advice : 'Unavailable')}</div>` : ''}
          ${c.show_scale !== false ? `
            <div class="scale-wrap">
              <div class="scale">${segs}${has ? `<span class="marker" style="left:${markerPct.toFixed(1)}%"></span>` : ''}</div>
              <div class="ticks"><span style="left:0%">0</span><span style="left:25%">3</span><span style="left:50%">6</span><span style="left:66.7%">8</span><span style="left:100%">11+</span></div>
            </div>` : ''}
        </div>`;

      P.bindTap(this.shadowRoot.querySelector('.prism-card'), () => this._moreInfo(), () => this._moreInfo());
    }
  }

  customElements.define('prism-uv-card', PrismUvCard);
  P.registerCard({
    type: 'prism-uv-card',
    name: 'Prism UV Card',
    description: 'Flat UV-index tile: value coloured by WHO risk band, category, sun-protection advice, and a UV-ramp scale.',
  });
})();
