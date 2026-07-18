/**
 * prism-wind-card
 * A flat, data-first wind tile. Dominant wind-speed value with context:
 * a compass rose whose accent arrow points to the direction the wind is
 * coming FROM, the cardinal in the middle, a Beaufort descriptor, gusts,
 * and playful flat "wind streak" accents that intensify with the wind
 * (Google-weather-ish, but flat and theme-driven).
 *
 * Reads a Home Assistant `weather.*` entity (wind_speed / wind_bearing /
 * wind_gust_speed) out of the box, or wire up individual sensors.
 *
 * type: custom:prism-wind-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const domainOf = (id) => (id || '').split('.')[0];

  // 16-point compass.
  const DIRS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const DIR_LONG = {
    N: 'north', NNE: 'north-northeast', NE: 'northeast', ENE: 'east-northeast',
    E: 'east', ESE: 'east-southeast', SE: 'southeast', SSE: 'south-southeast',
    S: 'south', SSW: 'south-southwest', SW: 'southwest', WSW: 'west-southwest',
    W: 'west', WNW: 'west-northwest', NW: 'northwest', NNW: 'north-northwest',
  };
  const CARD_DEG = {};
  DIRS16.forEach((d, i) => { CARD_DEG[d] = i * 22.5; });

  const norm360 = (deg) => ((deg % 360) + 360) % 360;
  const cardinalOf = (bearing) => DIRS16[Math.round(norm360(bearing) / 22.5) % 16];

  // Accept a numeric bearing (deg) or a cardinal string ("NW"); NaN if neither.
  function parseBearing(v) {
    const n = parseFloat(v);
    if (!isNaN(n)) return norm360(n);
    const s = String(v == null ? '' : v).trim().toUpperCase();
    return s in CARD_DEG ? CARD_DEG[s] : NaN;
  }

  // Normalise any speed to km/h for Beaufort + streak intensity.
  function toKmh(v, unit) {
    const u = String(unit || '').toLowerCase();
    if (u.includes('m/s') || u === 'mps') return v * 3.6;
    if (u.includes('mph') || u === 'mi/h') return v * 1.609344;
    if (u.startsWith('kn') || u === 'kt' || u === 'kts' || u.includes('knot')) return v * 1.852;
    if (u.includes('ft/s')) return v * 1.09728;
    return v; // km/h or unknown
  }

  // Beaufort scale (exclusive upper bounds, km/h).
  const BEAUFORT = [
    { max: 1, desc: 'Calm' }, { max: 6, desc: 'Light air' }, { max: 12, desc: 'Light breeze' },
    { max: 20, desc: 'Gentle breeze' }, { max: 29, desc: 'Moderate breeze' }, { max: 39, desc: 'Fresh breeze' },
    { max: 50, desc: 'Strong breeze' }, { max: 62, desc: 'Near gale' }, { max: 75, desc: 'Gale' },
    { max: 89, desc: 'Strong gale' }, { max: 103, desc: 'Storm' }, { max: 118, desc: 'Violent storm' },
  ];
  function beaufort(kmh) {
    for (let i = 0; i < BEAUFORT.length; i++) if (kmh < BEAUFORT[i].max) return { level: i, desc: BEAUFORT[i].desc };
    return { level: 12, desc: 'Hurricane' };
  }

  const fmtSpeed = (v) => (isNaN(v) ? '—' : P.fmtNumber(v, v < 10 && v > 0 ? 1 : 0));

  // Point on a compass of radius r at a bearing (0 = N at top, clockwise).
  function windPt(cx, cy, r, bearingDeg) {
    const a = (bearingDeg * Math.PI) / 180;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  }

  // Pull speed / bearing / gust / unit from a weather entity or sensors.
  function readWind(hass, c) {
    let speed = NaN, bearing = NaN, gust = NaN, unit = c.unit || '';
    const st = hass.states[c.entity];
    if (st && domainOf(c.entity) === 'weather') {
      speed = parseFloat(st.attributes.wind_speed);
      bearing = parseBearing(st.attributes.wind_bearing);
      gust = parseFloat(st.attributes.wind_gust_speed);
      unit = c.unit || st.attributes.wind_speed_unit || 'km/h';
    } else if (st) {
      speed = parseFloat(st.state);
      unit = P.unitOf(hass, c.entity, c.unit);
    }
    if (c.speed_entity && hass.states[c.speed_entity]) {
      speed = P.num(hass, c.speed_entity);
      unit = P.unitOf(hass, c.speed_entity, c.unit);
    }
    if (c.direction_entity && hass.states[c.direction_entity]) {
      bearing = parseBearing(hass.states[c.direction_entity].state);
    }
    if (c.gust_entity && hass.states[c.gust_entity]) gust = P.num(hass, c.gust_entity);
    return { speed, bearing, gust, unit };
  }

  // ── Editor ────────────────────────────────────────────────────────
  class PrismWindCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Weather or wind-speed entity', c.entity, (v) => this._patch('entity', v), { domains: ['weather', 'sensor'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._tf('Unit override', c.unit, (v) => this._patch('unit', v)),
        this._switch('Show gusts', c.show_gust !== false, (v) => this._patch('show_gust', v)),
        this._switch('Animated wind lines', c.animate !== false, (v) => this._patch('animate', v)),
        this._section('Manual sensors (optional)'),
        this._hint('Use these if your wind data lives in separate sensors rather than a weather entity. Direction accepts degrees or a cardinal like NW.'),
        this._picker('Wind speed sensor', c.speed_entity, (v) => this._patch('speed_entity', v), { domains: ['sensor'] }),
        this._picker('Wind direction sensor', c.direction_entity, (v) => this._patch('direction_entity', v), { domains: ['sensor'] }),
        this._picker('Wind gust sensor', c.gust_entity, (v) => this._patch('gust_entity', v), { domains: ['sensor'] })
      );
    }
  }
  customElements.define('prism-wind-card-editor', PrismWindCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismWindCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
    }

    setConfig(config) {
      if (!config.entity && !config.speed_entity) {
        throw new Error('prism-wind-card: set `entity` (a weather or wind-speed entity) or `speed_entity`.');
      }
      this._config = { show_gust: true, animate: true, ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 6, min_rows: 3, min_columns: 4 }; }

    static getConfigElement() { return document.createElement('prism-wind-card-editor'); }
    static getStubConfig(hass) {
      let ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('weather.')) : null;
      if (!ent && hass) ent = Object.keys(hass.states).find((e) => e.startsWith('sensor.') && /wind/i.test(e));
      return { entity: ent || 'weather.home', accent: 'teal' };
    }

    _moreInfo() {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: this._config.entity || this._config.speed_entity }, bubbles: true, composed: true,
      }));
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const accent = P.resolveAccent(c.accent || 'teal');
      const { speed, bearing, gust, unit } = readWind(this._hass, c);

      const hasSpeed = !isNaN(speed);
      const hasDir = !isNaN(bearing);
      const unitTxt = unit || (hasSpeed ? 'km/h' : '');
      const bf = beaufort(toKmh(hasSpeed ? speed : 0, unit || 'km/h'));
      const cardinal = hasDir ? cardinalOf(bearing) : '';
      const name = c.name || (this._hass.states[c.entity] ? this._hass.states[c.entity].attributes.friendly_name : (c.entity || c.speed_entity));

      // Compass geometry.
      const W = 120, cx = 60, cy = 60, R = 52;
      let ticks = '';
      for (let i = 0; i < 8; i++) {
        const b = i * 45, major = i % 2 === 0;
        const [x1, y1] = windPt(cx, cy, R, b);
        const [x2, y2] = windPt(cx, cy, R - (major ? 9 : 5), b);
        ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
                    stroke="var(--_text-2)" stroke-width="${major ? 2 : 1}" opacity="${major ? 0.55 : 0.3}"/>`;
      }
      const letters = [['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([l, b]) => {
        const [x, y] = windPt(cx, cy, R - 15, b);
        return `<text class="dir" x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle">${l}</text>`;
      }).join('');

      // Accent arrow marker on the ring, pointing outward to where the wind is FROM.
      let marker = '';
      if (hasDir) {
        const a = (bearing * Math.PI) / 180;
        const dx = Math.sin(a), dy = -Math.cos(a);      // outward (toward source)
        const tx = Math.cos(a), ty = Math.sin(a);       // tangent
        const [tipX, tipY] = windPt(cx, cy, R, bearing);
        const bx = cx + (R - 11) * dx, by = cy + (R - 11) * dy;
        const w = 6.5;
        marker = `<polygon points="${tipX.toFixed(1)},${tipY.toFixed(1)}
          ${(bx + tx * w).toFixed(1)},${(by + ty * w).toFixed(1)}
          ${(bx - tx * w).toFixed(1)},${(by - ty * w).toFixed(1)}"
          fill="${accent}" style="transition:all .5s"/>`;
      }

      // Flat wind streaks — count + speed scale with the Beaufort level.
      let streaks = '';
      if (c.animate !== false && hasSpeed && bf.level > 0) {
        const n = P.clamp(2 + Math.round(bf.level / 2), 2, 6);
        const dur = P.clamp(9 - bf.level * 0.6, 3, 9);
        streaks = '<div class="streaks">' + Array.from({ length: n }, (_, i) => {
          const top = 10 + i * (80 / Math.max(1, n - 1));
          const w = 28 + (i % 3) * 12;
          const d = (dur * (0.8 + 0.15 * (i % 3))).toFixed(2);
          const delay = (-(i * dur) / n).toFixed(2);
          return `<span class="streak" style="top:${top.toFixed(0)}%;width:${w}%;animation-duration:${d}s;animation-delay:${delay}s"></span>`;
        }).join('') + '</div>';
      }

      const gustHtml = (c.show_gust !== false && !isNaN(gust))
        ? `<span class="gust"><ha-icon icon="mdi:weather-windy"></ha-icon>Gusts ${P.esc(fmtSpeed(gust))}${unitTxt ? ` ${P.esc(unitTxt)}` : ''}</span>`
        : '';
      const fromLine = hasDir
        ? `from the ${DIR_LONG[cardinal]} · ${Math.round(bearing)}°`
        : 'direction unavailable';

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { position:relative; overflow:hidden; display:flex; flex-direction:column; cursor:pointer; }
          .prism-head { position:relative; z-index:1; }
          .streaks { position:absolute; inset:0; z-index:0; pointer-events:none; }
          .streak { position:absolute; left:-60%; height:2px; border-radius:2px; background:${accent}; opacity:.15;
                    animation-name:wind-drift; animation-timing-function:linear; animation-iteration-count:infinite; }
          @keyframes wind-drift { from { transform:translateX(0); } to { transform:translateX(330%); } }
          .content { position:relative; z-index:1; display:flex; align-items:center; gap:16px; }
          svg.compass { width:118px; height:118px; flex:none; }
          .compass .ring { fill:none; stroke:var(--_surface-2); stroke-width:3; }
          .dir { fill:var(--_text-2); font-size:9px; font-weight:700; font-family:var(--_font); }
          .cardinal { fill:${accent}; font-size:23px; font-weight:750; font-family:var(--_font); letter-spacing:-.5px; }
          .info { display:flex; flex-direction:column; gap:3px; min-width:0; }
          .spd { display:flex; align-items:baseline; gap:6px; }
          .spd .n { font-size:34px; font-weight:750; letter-spacing:-1px; line-height:1; color:var(--_text); }
          .spd .u { font-size:13px; font-weight:600; color:var(--_text-2); }
          .desc { font-size:14px; font-weight:650; color:var(--_text); }
          .from { font-size:12px; font-weight:500; color:var(--_text-2); }
          .gust { align-self:flex-start; margin-top:4px; display:inline-flex; align-items:center; gap:5px;
                  padding:3px 10px 3px 8px; border-radius:999px; background:var(--_surface-2);
                  font-size:12px; font-weight:600; color:var(--_text-2); --mdc-icon-size:14px; }
        </style>
        <div class="prism-card" role="button" tabindex="0" aria-label="${P.esc(name)} wind">
          ${streaks}
          ${P.titleHead(c.title)}
          <div class="content">
            <svg class="compass" viewBox="0 0 ${W} ${W}" aria-hidden="true">
              <circle class="ring" cx="${cx}" cy="${cy}" r="${R}"/>
              ${ticks}
              ${letters}
              ${marker}
              <text class="cardinal" x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="middle">${P.esc(cardinal || '–')}</text>
            </svg>
            <div class="info">
              <div class="spd"><span class="n">${P.esc(fmtSpeed(speed))}</span>${unitTxt ? `<span class="u">${P.esc(unitTxt)}</span>` : ''}</div>
              <div class="desc">${P.esc(hasSpeed ? bf.desc : 'Unavailable')}</div>
              <div class="from">${P.esc(fromLine)}</div>
              ${gustHtml}
            </div>
          </div>
        </div>`;

      const card = this.shadowRoot.querySelector('.prism-card');
      P.bindTap(card, () => this._moreInfo(), () => this._moreInfo());
    }
  }

  customElements.define('prism-wind-card', PrismWindCard);
  P.registerCard({
    type: 'prism-wind-card',
    name: 'Prism Wind Card',
    description: 'Wind speed, compass direction, and gusts with a flat compass rose and animated wind accents.',
  });
})();
