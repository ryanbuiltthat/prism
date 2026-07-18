/**
 * prism-sun-card
 * Flat sun-path tile: an arc of the sky from sunrise to sunset with the sun
 * riding along it (a moon below the horizon at night), the traveled portion
 * filled with the accent, sunrise/sunset times at each end, and a live
 * "sets in / rises in" countdown. Reads the `sun.sun` entity.
 *
 * type: custom:prism-sun-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const DAY = 86400000;
  const fmtT = (ms) => (isNaN(ms) ? '—' : new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  function humanDur(ms) {
    if (isNaN(ms) || ms < 0) return '';
    const m = Math.round(ms / 60000), h = Math.floor(m / 60), mm = m % 60;
    return h ? `${h}h ${mm}m` : `${mm}m`;
  }

  // ── Editor ────────────────────────────────────────────────────────
  class PrismSunCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Sun entity', c.entity, (v) => this._patch('entity', v), { domains: ['sun'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._hint('Defaults to sun.sun. Uses its next_rising / next_setting / elevation attributes.')
      );
    }
  }
  customElements.define('prism-sun-card-editor', PrismSunCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismSunCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
    }

    setConfig(config) {
      this._config = { entity: 'sun.sun', accent: 'amber', ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 6, min_rows: 3, min_columns: 4 }; }

    static getConfigElement() { return document.createElement('prism-sun-card-editor'); }
    static getStubConfig() { return { entity: 'sun.sun', accent: 'amber' }; }

    _moreInfo() {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: this._config.entity }, bubbles: true, composed: true,
      }));
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const accent = P.resolveAccent(c.accent);
      const st = this._hass.states[c.entity];
      const a = (st && st.attributes) || {};
      const name = c.name || (a.friendly_name || 'Sun');

      const rise = Date.parse(a.next_rising);
      const set = Date.parse(a.next_setting);
      const now = Date.now();
      const elev = parseFloat(a.elevation);
      const isDay = st ? (st.state === 'above_horizon' || (!isNaN(elev) && elev > 0)) : false;

      // Daylight progress: today's sunset is the next setting; approximate
      // today's sunrise as the next rising minus a day (good enough for a viz).
      let f = 0, haveArc = false;
      if (isDay && !isNaN(rise) && !isNaN(set)) {
        const riseToday = rise - DAY, setToday = set;
        f = P.clamp((now - riseToday) / ((setToday - riseToday) || 1), 0, 1);
        haveArc = true;
      }

      const nextIsSet = isDay;
      const remain = humanDur((nextIsSet ? set : rise) - now);
      const midText = !st ? 'Unavailable'
        : remain ? `${nextIsSet ? 'Sets' : 'Rises'} in ${remain}`
        : (isDay ? 'Daytime' : 'Night');

      // Arc geometry (wide, short dome).
      const R = 70, CX = 100, CY = 80, N = 48;
      const px = (th) => CX + R * Math.cos(th);
      const py = (th) => CY - R * Math.sin(th);
      let track = '', trav = '';
      for (let i = 0; i <= N; i++) {
        const fr = i / N, th = Math.PI * (1 - fr);
        track += `${i ? 'L' : 'M'}${px(th).toFixed(1)} ${py(th).toFixed(1)}`;
      }
      if (haveArc) {
        const steps = Math.max(1, Math.round(f * N));
        for (let i = 0; i <= steps; i++) {
          const fr = (i / N), th = Math.PI * (1 - fr);
          trav += `${i ? 'L' : 'M'}${px(th).toFixed(1)} ${py(th).toFixed(1)}`;
        }
      }
      const sunTh = Math.PI * (1 - f);
      const sx = haveArc ? px(sunTh) : CX;
      const sy = haveArc ? py(sunTh) : CY + 6;

      // Sun (day) or moon (night) marker.
      let rays = '';
      for (let i = 0; i < 8; i++) {
        const ang = (i * 45 * Math.PI) / 180;
        rays += `<line x1="${(sx + Math.cos(ang) * 8).toFixed(1)}" y1="${(sy + Math.sin(ang) * 8).toFixed(1)}"
          x2="${(sx + Math.cos(ang) * 12).toFixed(1)}" y2="${(sy + Math.sin(ang) * 12).toFixed(1)}"
          stroke="${accent}" stroke-width="2" stroke-linecap="round"/>`;
      }
      const marker = isDay
        ? `${rays}<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6.5" fill="${accent}"/>`
        : `<circle cx="${CX}" cy="${(CY + 4).toFixed(1)}" r="6.5" fill="var(--_text-2)"/>`;

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; cursor:pointer; }
          svg { width:100%; height:auto; display:block; overflow:visible; }
          .horizon { stroke:var(--_border); stroke-width:2; }
          .track { fill:none; stroke:var(--_surface-2); stroke-width:4; stroke-linecap:round; }
          .trav { fill:none; stroke:${accent}; stroke-width:4; stroke-linecap:round; }
          .ends { display:flex; align-items:center; justify-content:space-between; margin-top:8px; gap:8px; }
          .end { display:inline-flex; align-items:center; gap:5px; font-size:13px; font-weight:650; color:var(--_text); --mdc-icon-size:17px; }
          .end ha-icon { color:${accent}; }
          .mid { font-size:12px; font-weight:600; color:var(--_text-2); white-space:nowrap; }
        </style>
        <div class="prism-card" role="button" tabindex="0" aria-label="${P.esc(name)}">
          ${P.titleHead(c.title)}
          <svg viewBox="0 0 200 96" preserveAspectRatio="xMidYMid meet">
            <path class="track" d="${track}"/>
            ${trav ? `<path class="trav" d="${trav}"/>` : ''}
            <line class="horizon" x1="18" y1="80" x2="182" y2="80"/>
            ${marker}
          </svg>
          <div class="ends">
            <span class="end"><ha-icon icon="mdi:weather-sunset-up"></ha-icon>${fmtT(isDay ? rise - DAY : rise)}</span>
            <span class="mid">${P.esc(midText)}</span>
            <span class="end"><ha-icon icon="mdi:weather-sunset-down"></ha-icon>${fmtT(set)}</span>
          </div>
        </div>`;

      P.bindTap(this.shadowRoot.querySelector('.prism-card'), () => this._moreInfo(), () => this._moreInfo());
    }
  }

  customElements.define('prism-sun-card', PrismSunCard);
  P.registerCard({
    type: 'prism-sun-card',
    name: 'Prism Sun Card',
    description: 'Flat sun-path arc: sunrise/sunset times, the sun riding its arc, and a live sets-in / rises-in countdown.',
  });
})();
