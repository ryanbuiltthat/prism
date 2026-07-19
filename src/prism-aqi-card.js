/**
 * prism-aqi-card
 * Flat air-quality tile: a big AQI value coloured by its US EPA category, the
 * category pill + health advice, and a flat segmented scale (Good → Hazardous)
 * with a marker at the current value.
 *
 * Reads an AQI sensor (state) or a sensor/weather attribute.
 *
 * type: custom:prism-aqi-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const domainOf = (id) => (id || '').split('.')[0];

  // US EPA AQI categories (equal-width blocks on the scale).
  const BANDS = [
    { from: 0, to: 50, color: '#3ea72d', label: 'Good', advice: 'Air quality is satisfactory.' },
    { from: 51, to: 100, color: '#e2b100', label: 'Moderate', advice: 'Acceptable; unusually sensitive people should limit exertion.' },
    { from: 101, to: 150, color: '#f08b30', label: 'Sensitive', advice: 'Sensitive groups may feel effects.' },
    { from: 151, to: 200, color: '#e0393e', label: 'Unhealthy', advice: 'Everyone may begin to feel effects.' },
    { from: 201, to: 300, color: '#9160c8', label: 'Very unhealthy', advice: 'Health alert — serious effects possible.' },
    { from: 301, to: 500, color: '#7d2444', label: 'Hazardous', advice: 'Health warning of emergency conditions.' },
  ];
  const AQI_MAX = 500;
  function bandOf(v) {
    for (const b of BANDS) if (v <= b.to) return b;
    return BANDS[BANDS.length - 1];
  }
  // Marker position over 6 equal blocks: block index + fractional progress in it.
  function markerPct(v) {
    const cv = P.clamp(v, 0, AQI_MAX);
    const i = BANDS.indexOf(bandOf(cv));
    const b = BANDS[i];
    const frac = P.clamp((cv - b.from) / ((b.to - b.from) || 1), 0, 1);
    return ((i + frac) / BANDS.length) * 100;
  }

  // ── Editor ────────────────────────────────────────────────────────
  class PrismAqiCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('AQI entity (sensor)', c.entity, (v) => this._patch('entity', v), { domains: ['sensor', 'weather'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._tf('Attribute (optional)', c.attribute, (v) => this._patch('attribute', v)),
        this._switch('Show scale', c.show_scale !== false, (v) => this._patch('show_scale', v)),
        this._switch('Show advice', c.show_advice !== false, (v) => this._patch('show_advice', v)),
        this._hint('Reads the US EPA AQI (0–500) from the sensor state, or an attribute.')
      );
    }
  }
  customElements.define('prism-aqi-card-editor', PrismAqiCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismAqiCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-aqi-card: `entity` is required.');
      this._config = { show_scale: true, show_advice: true, ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 6, min_rows: 2, min_columns: 3 }; }

    static getConfigElement() { return document.createElement('prism-aqi-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('sensor.') && /aqi|air_quality|air quality/i.test(e)) : null;
      return { entity: ent || 'sensor.air_quality_index' };
    }

    _value() {
      const c = this._config, st = this._hass.states[c.entity];
      if (!st) return NaN;
      if (c.attribute || domainOf(c.entity) === 'weather') return parseFloat(st.attributes[c.attribute || 'air_quality_index']);
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
      const band = has ? bandOf(P.clamp(raw, 0, AQI_MAX)) : BANDS[0];
      const name = c.name || (st ? st.attributes.friendly_name : c.entity);
      const value = has ? P.fmtNumber(Math.round(raw), 0) : '—';

      const segs = BANDS.map((b) => `<span class="seg" style="background:${b.color}"></span>`).join('');

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; cursor:pointer; }
          .top { display:flex; align-items:baseline; gap:9px; }
          .val { font-size:44px; font-weight:750; line-height:1; letter-spacing:-1.5px; color:${band.color}; }
          .aqi { font-size:13px; font-weight:700; color:var(--_text-2); letter-spacing:.04em; }
          .cat { margin-left:auto; align-self:center; padding:3px 11px; border-radius:999px; font-size:12px;
                 font-weight:700; color:#fff; background:${band.color}; white-space:nowrap; }
          .advice { font-size:13px; font-weight:600; color:var(--_text); margin-top:6px; }
          .scale-wrap { margin-top:12px; }
          .scale { position:relative; display:flex; gap:2px; height:8px; }
          .seg { flex:1; border-radius:3px; }
          .marker { position:absolute; top:-4px; width:4px; height:16px; border-radius:2px; background:var(--_text);
                    box-shadow:0 0 0 2px var(--_surface); transform:translateX(-50%); transition:left .4s; }
          .ticks { position:relative; height:13px; margin-top:5px; font-size:10px; font-weight:600; color:var(--_text-2); }
          .ticks span { position:absolute; transform:translateX(-50%); }
          .ticks span:first-child { transform:none; }
          .ticks span:last-child { transform:translateX(-100%); }
        </style>
        <div class="prism-card" role="button" tabindex="0" aria-label="${P.esc(name)} air quality">
          ${P.titleHead(c.title)}
          <div class="top">
            <span class="val">${P.esc(value)}</span>
            <span class="aqi">AQI</span>
            <span class="cat">${P.esc(band.label)}</span>
          </div>
          ${c.show_advice !== false ? `<div class="advice">${P.esc(has ? band.advice : 'Unavailable')}</div>` : ''}
          ${c.show_scale !== false ? `
            <div class="scale-wrap">
              <div class="scale">${segs}${has ? `<span class="marker" style="left:${markerPct(raw).toFixed(1)}%"></span>` : ''}</div>
              <div class="ticks"><span style="left:0%">0</span><span style="left:16.7%">50</span><span style="left:33.3%">100</span><span style="left:50%">150</span><span style="left:66.7%">200</span><span style="left:83.3%">300</span><span style="left:100%">500</span></div>
            </div>` : ''}
        </div>`;

      P.bindTap(this.shadowRoot.querySelector('.prism-card'), () => this._moreInfo(), () => this._moreInfo());
    }
  }

  customElements.define('prism-aqi-card', PrismAqiCard);
  P.registerCard({
    type: 'prism-aqi-card',
    name: 'Prism Air Quality Card',
    description: 'Flat AQI tile: value coloured by US EPA category, health advice, and a Good→Hazardous scale with a marker.',
  });
})();
