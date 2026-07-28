/**
 * prism-sun-card
 * Flat sun-path tile: an arc of the sky from sunrise to sunset with the sun
 * riding along it, the traveled portion filled with the accent, sunrise/sunset
 * times at each end, and a live "sets in / rises in" countdown. Reads `sun.sun`.
 *
 * Optionally, after sunset it flips to a **moon view**: a moon-phase glyph
 * drawn to the current illuminated fraction, the phase name + illumination, the
 * next sunrise, and (when sensors are configured) moonrise / moonset. Reads a
 * moon-phase sensor (`sensor.moon` from the Moon integration) plus optional
 * moonrise / moonset / illumination sensors.
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

  // Moon phase names (HA `sensor.moon`) → label + phase fraction k
  // (0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter).
  const MOON = {
    new_moon:         { label: 'New Moon',        k: 0.0 },
    waxing_crescent:  { label: 'Waxing Crescent', k: 0.125 },
    first_quarter:    { label: 'First Quarter',   k: 0.25 },
    waxing_gibbous:   { label: 'Waxing Gibbous',  k: 0.375 },
    full_moon:        { label: 'Full Moon',       k: 0.5 },
    waning_gibbous:   { label: 'Waning Gibbous',  k: 0.625 },
    last_quarter:     { label: 'Last Quarter',    k: 0.75 },
    waning_crescent:  { label: 'Waning Crescent', k: 0.875 },
  };
  const illumFromK = (k) => (1 - Math.cos(2 * Math.PI * k)) / 2;

  // Resolve a moon-phase state into { label, k }. Accepts a phase name, or a
  // numeric value (0–1 fraction or 0–100 percent → nearest named phase feel).
  function moonInfo(state) {
    const s = String(state == null ? '' : state).toLowerCase().trim();
    if (MOON[s]) return MOON[s];
    const key = s.replace(/[\s-]+/g, '_');
    if (MOON[key]) return MOON[key];
    const n = parseFloat(s);
    if (!isNaN(n)) {
      const k = n > 1 ? (n / 100) % 1 : n % 1; // percent or fraction → cycle pos
      // Nearest named phase for the label.
      let best = 'new_moon', bd = Infinity;
      for (const name in MOON) { const d = Math.abs(MOON[name].k - k); if (d < bd) { bd = d; best = name; } }
      return { label: MOON[best].label, k };
    }
    return null;
  }

  // SVG path for the illuminated portion of a moon disk at phase fraction k.
  function moonLitPath(cx, cy, r, k) {
    const b = Math.cos(2 * Math.PI * k);   // 1 (new) … -1 (full)
    const rx = Math.abs(b) * r;            // terminator ellipse x-radius
    const waxing = k < 0.5;                // northern hemisphere: lit on the right
    const outerSweep = waxing ? 1 : 0;
    const termSweep = waxing ? (b > 0 ? 0 : 1) : (b > 0 ? 1 : 0);
    return `M${cx.toFixed(1)},${(cy - r).toFixed(1)}`
      + ` A${r},${r} 0 0 ${outerSweep} ${cx.toFixed(1)},${(cy + r).toFixed(1)}`
      + ` A${rx.toFixed(1)},${r} 0 0 ${termSweep} ${cx.toFixed(1)},${(cy - r).toFixed(1)} Z`;
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
        this._hint('Defaults to sun.sun. Uses its next_rising / next_setting / elevation attributes.'),
        this._section('Moon'),
        this._switch('Show moon after sunset', c.show_moon !== false, (v) => this._patch('show_moon', v)),
        this._picker('Moon phase sensor', c.moon_entity, (v) => this._patch('moon_entity', v), { domains: ['sensor'] }),
        this._picker('Moonrise sensor (optional)', c.moonrise_entity, (v) => this._patch('moonrise_entity', v), { domains: ['sensor'] }),
        this._picker('Moonset sensor (optional)', c.moonset_entity, (v) => this._patch('moonset_entity', v), { domains: ['sensor'] }),
        this._picker('Illumination sensor (optional)', c.moon_illumination_entity, (v) => this._patch('moon_illumination_entity', v), { domains: ['sensor'] }),
        this._hint('Defaults to sensor.moon (Moon integration) for the phase. Moonrise/moonset need their own sensors; illumination is computed from the phase if no sensor is set.')
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
      this._config = { entity: 'sun.sun', accent: 'amber', show_moon: true, ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 6, min_rows: 3, min_columns: 4 }; }

    static getConfigElement() { return document.createElement('prism-sun-card-editor'); }
    static getStubConfig(hass) {
      const hasMoon = hass && hass.states && hass.states['sensor.moon'];
      return { entity: 'sun.sun', accent: 'amber', ...(hasMoon ? { moon_entity: 'sensor.moon' } : {}) };
    }

    _moreInfo(id) {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: id || this._config.entity }, bubbles: true, composed: true,
      }));
    }

    _num(id) {
      return id && this._hass.states[id] ? parseFloat(this._hass.states[id].state) : NaN;
    }
    _time(id) {
      return id && this._hass.states[id] ? Date.parse(this._hass.states[id].state) : NaN;
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

      // Should we render the moon view? Only after sunset, when enabled and a
      // moon-phase sensor is available.
      const moonId = c.moon_entity || 'sensor.moon';
      const moonSt = this._hass.states[moonId];
      const showMoon = c.show_moon !== false && !isDay && !!moonSt;

      const styles = `
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
          .mid { font-size:12px; font-weight:600; color:var(--_text-2); white-space:nowrap; text-align:center; }
          .moon-disk { fill:var(--_surface-2); stroke:var(--_text-2); stroke-width:1.2; }
          .moon-lit { fill:#cdd6e5; stroke:var(--_text-2); stroke-width:1.2; }
          .star { fill:var(--_text-2); }
          .moon .end ha-icon { color:var(--_text-2); }
          .subrow { display:flex; align-items:center; justify-content:center; gap:10px; margin-top:6px;
                    font-size:12px; font-weight:600; color:var(--_text-2); --mdc-icon-size:15px; }
          .subrow .rs { display:inline-flex; align-items:center; gap:4px; }
        </style>`;

      const inner = showMoon
        ? this._moonView(moonSt, rise, c, name)
        : this._sunView(a, st, rise, set, now, isDay, accent, name);

      this.shadowRoot.innerHTML = `
        ${styles}
        <div class="prism-card" role="button" tabindex="0" aria-label="${P.esc(name)}">
          ${P.titleHead(c.title)}
          ${inner}
        </div>`;

      P.bindTap(this.shadowRoot.querySelector('.prism-card'), () => this._moreInfo(), () => this._moreInfo());
    }

    // Daytime sun-path arc (unchanged behaviour).
    _sunView(a, st, rise, set, now, isDay, accent, name) {
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

      return `
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
        </div>`;
    }

    // Night moon view: phase glyph + phase name / illumination, next sunrise,
    // and moonrise / moonset when their sensors are configured.
    _moonView(moonSt, sunRise, c, name) {
      const mi = moonInfo(moonSt.state) || { label: (moonSt.state || 'Moon'), k: 0.5 };
      const illumSensor = this._num(c.moon_illumination_entity);
      const illum = !isNaN(illumSensor) ? illumSensor : Math.round(illumFromK(mi.k) * 100);
      const moonrise = this._time(c.moonrise_entity);
      const moonset = this._time(c.moonset_entity);

      // Moon glyph (viewBox 200×96): a disk with the lit fraction + a few stars.
      const CX = 100, CY = 40, R = 26;
      const stars = [[46, 22], [58, 52], [150, 26], [162, 58], [134, 16]]
        .map(([x, y], i) => `<circle class="star" cx="${x}" cy="${y}" r="${i % 2 ? 1.1 : 1.6}" opacity="${0.5 + (i % 2) * 0.3}"/>`).join('');
      const litPath = mi.k <= 0.001 ? '' // new moon: nothing lit
        : mi.k >= 0.499 && mi.k <= 0.501
          ? `<circle class="moon-lit" cx="${CX}" cy="${CY}" r="${R}"/>` // full
          : `<path class="moon-lit" d="${moonLitPath(CX, CY, R, mi.k)}"/>`;

      const rsBits = [];
      if (!isNaN(moonrise)) rsBits.push(`<span class="rs"><ha-icon icon="mdi:arrow-up-thin"></ha-icon>Moonrise ${fmtT(moonrise)}</span>`);
      if (!isNaN(moonset)) rsBits.push(`<span class="rs"><ha-icon icon="mdi:arrow-down-thin"></ha-icon>Moonset ${fmtT(moonset)}</span>`);

      return `
        <svg class="moon" viewBox="0 0 200 96" preserveAspectRatio="xMidYMid meet">
          ${stars}
          <circle class="moon-disk" cx="${CX}" cy="${CY}" r="${R}"/>
          ${litPath}
          <line class="horizon" x1="18" y1="80" x2="182" y2="80"/>
        </svg>
        <div class="ends moon">
          <span class="end"><ha-icon icon="mdi:brightness-6"></ha-icon>${isNaN(illum) ? '—' : `${Math.round(illum)}%`}</span>
          <span class="mid">${P.esc(mi.label)}</span>
          <span class="end"><ha-icon icon="mdi:weather-sunset-up"></ha-icon>${fmtT(sunRise)}</span>
        </div>
        ${rsBits.length ? `<div class="subrow">${rsBits.join('')}</div>` : ''}`;
    }
  }

  customElements.define('prism-sun-card', PrismSunCard);
  P.registerCard({
    type: 'prism-sun-card',
    name: 'Prism Sun Card',
    description: 'Flat sun-path arc with sunrise/sunset + countdown; optionally flips to a moon-phase view after sunset.',
  });
})();
