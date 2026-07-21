/**
 * prism-lux-card
 * Flat illuminance tile with a living sun: the sun disc grows and its rays
 * lengthen + warm in colour as the light level rises (log-scaled across the
 * huge lux range), with a slow ray rotation and gentle pulse. At night it
 * shows a moon. Big lux value + a plain-language level (Dark → Bright sun).
 *
 * Reads an illuminance sensor (lux), or a sensor/weather attribute.
 *
 * type: custom:prism-lux-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const domainOf = (id) => (id || '').split('.')[0];

  // Light-level bands: label + the sun colour (cool/pale → warm/bright gold).
  const BANDS = [
    { max: 10, label: 'Dark', color: '#6b7785' },
    { max: 100, label: 'Dim', color: '#c2a86a' },
    { max: 1000, label: 'Indoor', color: '#e6b84d' },
    { max: 10000, label: 'Overcast', color: '#f2b03a' },
    { max: 25000, label: 'Daylight', color: '#f7a72e' },
    { max: Infinity, label: 'Bright sun', color: '#ffb300' },
  ];
  const bandOf = (v) => { for (const b of BANDS) if (v < b.max) return b; return BANDS[BANDS.length - 1]; };
  const LOGMAX = Math.log10(100000); // full-scale ≈ direct sunlight

  // ── Editor ────────────────────────────────────────────────────────
  class PrismLuxCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Illuminance entity (required)', c.entity, (v) => this._patch('entity', v), { domains: ['sensor', 'weather'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._tf('Attribute (optional)', c.attribute, (v) => this._patch('attribute', v)),
        this._switch('Animate', c.animate !== false, (v) => this._patch('animate', v)),
        this._hint('Reads lux from the sensor state, or an attribute.')
      );
    }
  }
  customElements.define('prism-lux-card-editor', PrismLuxCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismLuxCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._sig = null;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-lux-card: `entity` is required.');
      this._config = { animate: true, ...config };
      this._sig = null; // force a rebuild on the next render
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 6, min_rows: 3, min_columns: 4 }; }

    static getConfigElement() { return document.createElement('prism-lux-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('sensor.') && (/lux|illumina|brightness/i.test(e) || (hass.states[e].attributes || {}).device_class === 'illuminance')) : null;
      return { entity: ent || 'sensor.illuminance' };
    }

    _value() {
      const c = this._config, st = this._hass.states[c.entity];
      if (!st) return NaN;
      if (c.attribute || domainOf(c.entity) === 'weather') return parseFloat(st.attributes[c.attribute || 'illuminance']);
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
      const lux = this._value();
      const has = !isNaN(lux);
      const band = has ? bandOf(lux) : BANDS[0];
      const night = has && lux < 1;
      const frac = has ? P.clamp(Math.log10(Math.max(lux, 1)) / LOGMAX, 0, 1) : 0;
      const name = c.name || (st ? st.attributes.friendly_name : c.entity);
      const value = has ? P.fmtNumber(Math.round(lux), 0) : '—';
      const unit = (st && st.attributes.unit_of_measurement) || 'lx';

      // Home Assistant pushes `hass` on every state change. Rebuild only when
      // the reading changes, so the ray-spin / disc-pulse CSS animations aren't
      // restarted from scratch on every unrelated tick.
      const sig = JSON.stringify([value, night, band.label, name, unit]);
      if (sig === this._sig) return;
      this._sig = sig;

      // Sun geometry (viewBox 96). Disc + 12 rays scale with the light level.
      const CX = 48, CY = 48;
      const r = 12 + frac * 6;
      const inner = r + 3, outer = inner + 6 + frac * 15;
      let rays = '';
      for (let i = 0; i < 12; i++) {
        const a = (i * 30 * Math.PI) / 180;
        rays += `<line x1="${(CX + Math.cos(a) * inner).toFixed(1)}" y1="${(CY + Math.sin(a) * inner).toFixed(1)}"
          x2="${(CX + Math.cos(a) * outer).toFixed(1)}" y2="${(CY + Math.sin(a) * outer).toFixed(1)}"
          stroke="${band.color}" stroke-width="3" stroke-linecap="round"/>`;
      }
      const graphic = night
        ? `<path d="M56 30 a18 18 0 1 0 0 36 a14 14 0 1 1 0 -36 z" fill="#c9d2e0"/>`
        : `<g class="rays">${rays}</g><circle class="disc" cx="${CX}" cy="${CY}" r="${r.toFixed(1)}" fill="${band.color}"/>`;

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; cursor:pointer; }
          .content { display:flex; align-items:center; gap:14px; }
          svg.sun { width:96px; height:96px; flex:none; overflow:visible; }
          ${c.animate !== false ? `
          .sun .rays { transform-box:fill-box; transform-origin:center; animation:lux-spin 26s linear infinite; }
          .sun .disc { transform-box:fill-box; transform-origin:center; animation:lux-pulse 3.4s ease-in-out infinite; }
          @keyframes lux-spin { to { transform:rotate(360deg); } }
          @keyframes lux-pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.08); } }` : ''}
          .info { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
          .v { display:flex; align-items:baseline; gap:6px; }
          .v .n { font-size:40px; font-weight:750; line-height:1; letter-spacing:-1.5px; color:var(--_text); }
          .v .u { font-size:14px; font-weight:600; color:var(--_text-2); }
          .desc { font-size:15px; font-weight:700; margin-top:2px; color:${band.color}; }
        </style>
        <div class="prism-card" role="button" tabindex="0" aria-label="${P.esc(name)} illuminance">
          ${P.titleHead(c.title)}
          <div class="content">
            <svg class="sun" viewBox="0 0 96 96" aria-hidden="true">${graphic}</svg>
            <div class="info">
              <div class="v"><span class="n">${P.esc(value)}</span><span class="u">${P.esc(unit)}</span></div>
              <div class="desc">${P.esc(has ? band.label : 'Unavailable')}</div>
            </div>
          </div>
        </div>`;

      P.bindTap(this.shadowRoot.querySelector('.prism-card'), () => this._moreInfo(), () => this._moreInfo());
    }
  }

  customElements.define('prism-lux-card', PrismLuxCard);
  P.registerCard({
    type: 'prism-lux-card',
    name: 'Prism Lux Card',
    description: 'Flat illuminance tile with a living sun whose rays grow + warm with the light level, plus a plain-language level.',
  });
})();
