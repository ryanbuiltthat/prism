/**
 * prism-weather-card
 * Flat current-conditions tile: a big temperature, a flat animated condition
 * icon (shared Prism weather set), the condition label, feels-like + today's
 * high/low, and humidity / wind / pressure chips. Reads a `weather.*` entity;
 * today's H/L comes from its daily forecast (get_forecasts service).
 *
 * type: custom:prism-weather-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const DIRS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const cardinal8 = (b) => (isNaN(b) ? '' : DIRS8[Math.round((((b % 360) + 360) % 360) / 45) % 8]);
  const roundTemp = (v) => (isNaN(v) ? null : Math.round(v));

  // ── Editor ────────────────────────────────────────────────────────
  class PrismWeatherCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Weather entity (required)', c.entity, (v) => this._patch('entity', v), { domains: ['weather'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._switch('Animated icon', c.animate !== false, (v) => this._patch('animate', v)),
        this._switch('Feels-like + high/low', c.show_feels !== false, (v) => this._patch('show_feels', v)),
        this._section('Detail chips'),
        this._switch('Humidity', c.show_humidity !== false, (v) => this._patch('show_humidity', v)),
        this._switch('Wind', c.show_wind !== false, (v) => this._patch('show_wind', v)),
        this._switch('Pressure', c.show_pressure !== false, (v) => this._patch('show_pressure', v)),
        this._section('Local sensor sources (optional)'),
        this._hint('Override any field with a local sensor (e.g. Ecowitt). The weather entity still provides the condition icon and high/low.'),
        this._picker('Temperature sensor', c.temperature_entity, (v) => this._patch('temperature_entity', v), { domains: ['sensor'] }),
        this._picker('Feels-like sensor', c.feels_like_entity, (v) => this._patch('feels_like_entity', v), { domains: ['sensor'] }),
        this._picker('Humidity sensor', c.humidity_entity, (v) => this._patch('humidity_entity', v), { domains: ['sensor'] }),
        this._picker('Wind speed sensor', c.wind_speed_entity, (v) => this._patch('wind_speed_entity', v), { domains: ['sensor'] }),
        this._picker('Wind direction sensor', c.wind_bearing_entity, (v) => this._patch('wind_bearing_entity', v), { domains: ['sensor'] }),
        this._picker('Pressure sensor', c.pressure_entity, (v) => this._patch('pressure_entity', v), { domains: ['sensor'] })
      );
    }
  }
  customElements.define('prism-weather-card-editor', PrismWeatherCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismWeatherCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._forecast = [];
      this._fcEntity = null;
      this._fcAt = 0;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-weather-card: `entity` (a weather.* entity) is required.');
      this._config = { animate: true, show_feels: true, show_humidity: true, show_wind: true, show_pressure: true, ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._maybeForecast(); this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 6, min_rows: 3, min_columns: 4 }; }

    static getConfigElement() { return document.createElement('prism-weather-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('weather.')) : null;
      return { entity: ent || 'weather.home', accent: 'blue' };
    }

    // Refresh today's high/low from the daily forecast (throttled to 15 min).
    _maybeForecast() {
      const id = this._config && this._config.entity;
      if (!id || !this._hass) return;
      const now = Date.now();
      if (this._fcEntity === id && this._fcAt && now - this._fcAt < 15 * 60 * 1000) return;
      this._fcEntity = id; this._fcAt = now;
      P.fetchForecast(this._hass, id, 'daily').then((f) => {
        this._forecast = Array.isArray(f) ? f : [];
        this._render();
      });
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
      const accent = P.resolveAccent(c.accent);
      const a = (st && st.attributes) || {};
      const condition = st ? st.state : '';
      const name = c.name || (a.friendly_name || c.entity);

      // Each numeric field prefers a configured local sensor (e.g. Ecowitt),
      // falling back to the weather entity's attribute. Condition + H/L always
      // come from the weather entity.
      const hass = this._hass;
      const has = (id) => id && hass.states[id];
      const fieldNum = (overrideId, attrName) =>
        (has(overrideId) ? P.num(hass, overrideId) : (a[attrName] != null ? parseFloat(a[attrName]) : NaN));
      const fieldUnit = (overrideId, attrUnit, fallback) =>
        (has(overrideId) ? P.unitOf(hass, overrideId, '') : (attrUnit || fallback || ''));

      const temp = roundTemp(fieldNum(c.temperature_entity, 'temperature'));
      const feels = roundTemp(fieldNum(c.feels_like_entity, 'apparent_temperature'));
      const humRaw = fieldNum(c.humidity_entity, 'humidity');
      const windRaw = fieldNum(c.wind_speed_entity, 'wind_speed');
      const windUnit = fieldUnit(c.wind_speed_entity, a.wind_speed_unit, '');
      const presRaw = fieldNum(c.pressure_entity, 'pressure');
      const presUnit = fieldUnit(c.pressure_entity, a.pressure_unit, 'hPa');

      // Wind direction: an override sensor (degrees or a cardinal string) or the
      // weather entity's wind_bearing.
      let dir = '';
      if (has(c.wind_bearing_entity)) {
        const bs = hass.states[c.wind_bearing_entity].state;
        const bn = parseFloat(bs);
        dir = isNaN(bn) ? String(bs).toUpperCase() : cardinal8(bn);
      } else {
        dir = cardinal8(parseFloat(a.wind_bearing));
      }

      const today = this._forecast[0] || {};
      const hi = roundTemp(parseFloat(today.temperature));
      const lo = roundTemp(parseFloat(today.templow));

      const label = P.WEATHER_LABELS[condition] || (condition ? condition.replace(/[-_]/g, ' ') : 'Unavailable');

      // Feels-like / high-low line.
      const bits = [];
      if (c.show_feels !== false && feels != null) bits.push(`Feels ${feels}°`);
      if (c.show_feels !== false && hi != null) bits.push(`H:${hi}°${lo != null ? ` L:${lo}°` : ''}`);
      const subLine = bits.join(' · ');

      // Detail chips.
      const chips = [];
      if (c.show_humidity !== false && !isNaN(humRaw)) {
        chips.push(`<span class="chip"><ha-icon icon="mdi:water-percent"></ha-icon>${P.esc(Math.round(humRaw))}%</span>`);
      }
      if (c.show_wind !== false && !isNaN(windRaw)) {
        chips.push(`<span class="chip"><ha-icon icon="mdi:weather-windy"></ha-icon>${P.esc(P.fmtNumber(windRaw, 0))}${windUnit ? ` ${P.esc(windUnit)}` : ''}${dir ? ` ${dir}` : ''}</span>`);
      }
      if (c.show_pressure !== false && !isNaN(presRaw)) {
        chips.push(`<span class="chip"><ha-icon icon="mdi:gauge"></ha-icon>${P.esc(P.fmtNumber(presRaw, 0))} ${P.esc(presUnit)}</span>`);
      }

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          ${P.WEATHER_CSS}
          .prism-card { display:flex; flex-direction:column; cursor:pointer; }
          .content { display:flex; align-items:center; gap:12px; }
          .main { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
          .temp { font-size:46px; font-weight:750; line-height:1; letter-spacing:-2px; color:var(--_text); }
          .cond { font-size:15px; font-weight:650; color:var(--_text); margin-top:2px; }
          .sub { font-size:12px; font-weight:500; color:var(--_text-2); }
          .icon { flex:none; }
          .chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
          .chip { display:inline-flex; align-items:center; gap:5px; padding:4px 10px 4px 7px; border-radius:999px;
                  background:var(--_surface-2); font-size:12px; font-weight:600; color:var(--_text-2);
                  --mdc-icon-size:15px; white-space:nowrap; }
          .chip ha-icon { color:${accent}; }
        </style>
        <div class="prism-card" role="button" tabindex="0" aria-label="${P.esc(name)} weather">
          ${P.titleHead(c.title)}
          <div class="content">
            <div class="main">
              <div class="temp">${temp != null ? `${temp}°` : '—'}</div>
              <div class="cond">${P.esc(label)}</div>
              ${subLine ? `<div class="sub">${P.esc(subLine)}</div>` : ''}
            </div>
            <div class="icon">${P.weatherIcon(condition, { animated: c.animate !== false, size: 88 })}</div>
          </div>
          ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
        </div>`;

      P.bindTap(this.shadowRoot.querySelector('.prism-card'), () => this._moreInfo(), () => this._moreInfo());
    }
  }

  customElements.define('prism-weather-card', PrismWeatherCard);
  P.registerCard({
    type: 'prism-weather-card',
    name: 'Prism Weather Card',
    description: 'Flat current-conditions tile: temperature, animated condition icon, feels-like / high-low, and detail chips.',
  });
})();
