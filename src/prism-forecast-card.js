/**
 * prism-forecast-card
 * Flat multi-day (or hourly) forecast strip: one column per period — a day/
 * hour label, a flat condition icon (shared Prism weather set), high/low temps,
 * and an optional precipitation-chance chip.
 *
 * Two forecast sources:
 *   - `entity` (default): a `weather.*` entity's forecast (get_forecasts service).
 *   - `nws`: the US National Weather Service API (api.weather.gov) — free, no API
 *     key, US only. Uses your Home Assistant lat/lon (or an override).
 *
 * type: custom:prism-forecast-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const roundTemp = (v) => (isNaN(v) ? null : Math.round(v));

  // Column label: "Today"/"Now" for the first current period, else weekday/hour.
  function periodLabel(iso, type, isFirst) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    if (type === 'hourly') {
      if (isFirst && Math.abs(d - now) < 60 * 60 * 1000) return 'Now';
      return d.toLocaleTimeString(undefined, { hour: 'numeric' });
    }
    if (isFirst && d.toDateString() === now.toDateString()) return 'Today';
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }

  // ── NWS (api.weather.gov) helpers ─────────────────────────────────
  // Map an NWS `shortForecast` text (+ day/night) onto an HA condition key
  // that the shared flat icon set understands. Keyword-matched, specific first.
  function nwsCondition(text, isDay) {
    const s = String(text || '').toLowerCase();
    const has = (re) => re.test(s);
    const clear = isDay ? 'sunny' : 'clear-night';
    if (has(/thunder|t-?storm|tstm/)) return has(/rain|shower/) ? 'lightning-rainy' : 'lightning';
    if (has(/sleet|freezing|wintry mix|ice/)) return 'snowy-rainy';
    if (has(/hail/)) return 'hail';
    if (has(/snow|flurr|blizzard/)) return has(/rain/) ? 'snowy-rainy' : 'snowy';
    if (has(/heavy rain|downpour|torrential/)) return 'pouring';
    if (has(/rain|shower|drizzle|precip/)) return 'rainy';
    if (has(/fog|haze|mist|smoke|dust/)) return 'fog';
    if (has(/wind|breez|blustery/)) return 'windy';
    if (has(/partly|mostly (sunny|clear)/)) return 'partlycloudy';
    if (has(/cloud|overcast/)) return 'cloudy';
    if (has(/sunny|clear|fair/)) return clear;
    return 'cloudy';
  }

  const precipOf = (p) => (p && p.probabilityOfPrecipitation ? p.probabilityOfPrecipitation.value : null);

  // NWS daily forecast = alternating 12-hour day/night periods. Pair each
  // daytime period (high) with the following night period (low) into one column.
  function mapNwsDaily(periods) {
    const out = [];
    for (let i = 0; i < periods.length; i++) {
      const p = periods[i];
      const next = periods[i + 1];
      if (p.isDaytime && next && !next.isDaytime) {
        out.push({
          datetime: p.startTime,
          condition: nwsCondition(p.shortForecast, true),
          temperature: p.temperature,
          templow: next.temperature,
          precipitation_probability: precipOf(p),
        });
        i++; // consume the paired night period
      } else {
        // A lone daytime or a leading night period → single temperature column.
        out.push({
          datetime: p.startTime,
          condition: nwsCondition(p.shortForecast, p.isDaytime),
          temperature: p.temperature,
          templow: undefined,
          precipitation_probability: precipOf(p),
        });
      }
    }
    return out;
  }

  // NWS hourly forecast = 1-hour periods with a single temperature each.
  function mapNwsHourly(periods) {
    return periods.map((p) => ({
      datetime: p.startTime,
      condition: nwsCondition(p.shortForecast, p.isDaytime),
      temperature: p.temperature,
      templow: undefined,
      precipitation_probability: precipOf(p),
    }));
  }

  // ── Editor ────────────────────────────────────────────────────────
  class PrismForecastCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      const source = c.source || 'entity';
      stack.append(
        this._titleField(),
        this._select('Source', [
          { value: 'entity', label: 'Weather entity' },
          { value: 'nws', label: 'US National Weather Service (weather.gov)' },
        ], source, (v) => { this._patch('source', v); this._rerender(); })
      );

      if (source === 'nws') {
        stack.append(
          this._hint('The National Weather Service API is free and needs no API key. US locations only.'),
          this._select('Location', [
            { value: 'home', label: 'Home Assistant location' },
            { value: 'custom', label: 'Custom coordinates' },
          ], c.location || 'home', (v) => { this._patch('location', v); this._rerender(); })
        );
        if ((c.location || 'home') === 'custom') {
          stack.append(
            this._tf('Latitude', c.latitude, (v) => this._patch('latitude', v), { type: 'number' }),
            this._tf('Longitude', c.longitude, (v) => this._patch('longitude', v), { type: 'number' })
          );
        }
        stack.append(
          this._select('Units', [
            { value: 'us', label: '°F, mph (US)' },
            { value: 'si', label: '°C, km/h (metric)' },
          ], c.units || 'us', (v) => this._patch('units', v))
        );
      } else {
        stack.append(
          this._picker('Weather entity (required)', c.entity, (v) => this._patch('entity', v), { domains: ['weather'] })
        );
      }

      stack.append(
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._select('Forecast', [
          { value: 'daily', label: 'Daily' },
          { value: 'hourly', label: 'Hourly' },
        ], c.forecast_type || 'daily', (v) => this._patch('forecast_type', v)),
        this._tf('Columns', c.count, (v) => this._patch('count', v === '' ? '' : Number(v)), { type: 'number' }),
        this._switch('Animated icons', !!c.animate, (v) => this._patch('animate', v)),
        this._switch('Precipitation chance', c.show_precip !== false, (v) => this._patch('show_precip', v))
      );
    }
  }
  customElements.define('prism-forecast-card-editor', PrismForecastCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismForecastCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._forecast = [];
      this._fcKey = null;
      this._fcAt = 0;
      this._pointsKey = null;   // cached api.weather.gov /points lookup
      this._pointsData = null;
    }

    setConfig(config) {
      const source = config.source || 'entity';
      if (source === 'entity' && !config.entity) {
        throw new Error('prism-forecast-card: `entity` (a weather.* entity) is required for the weather-entity source.');
      }
      // Note: `type` is Lovelace's reserved card-type key, so the daily/hourly
      // option is `forecast_type` (matching HA's core weather-forecast card).
      this._config = { source: 'entity', forecast_type: 'daily', count: 5, animate: false, show_precip: true, ...config };
      this._fcKey = null; // force a refetch on the next hass tick
      if (this._hass) { this._maybeForecast(); this._render(); }
    }

    set hass(hass) { this._hass = hass; this._maybeForecast(); this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 12, min_rows: 3, min_columns: 6 }; }

    static getConfigElement() { return document.createElement('prism-forecast-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('weather.')) : null;
      return { entity: ent || 'weather.home', forecast_type: 'daily', count: 5, accent: 'blue' };
    }

    _maybeForecast() {
      const c = this._config;
      if (!c || !this._hass) return;
      const type = c.forecast_type || 'daily';
      const now = Date.now();

      if ((c.source || 'entity') === 'nws') {
        const cfg = this._hass.config || {};
        // Default to the Home Assistant location; only use custom coordinates
        // when the location mode is explicitly `custom`.
        let lat = cfg.latitude, lon = cfg.longitude;
        if (c.location === 'custom') {
          if (c.latitude != null && c.latitude !== '') lat = Number(c.latitude);
          if (c.longitude != null && c.longitude !== '') lon = Number(c.longitude);
        }
        if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return;
        const units = c.units || 'us';
        const key = `nws|${lat}|${lon}|${type}|${units}`;
        if (this._fcKey === key && this._fcAt && now - this._fcAt < 15 * 60 * 1000) return;
        this._fcKey = key; this._fcAt = now;
        this._fetchNws(lat, lon, type, units).then((f) => {
          this._forecast = Array.isArray(f) ? f : [];
          this._render();
        });
        return;
      }

      if (!c.entity) return;
      const key = `entity|${c.entity}|${type}`;
      if (this._fcKey === key && this._fcAt && now - this._fcAt < 15 * 60 * 1000) return;
      this._fcKey = key; this._fcAt = now;
      P.fetchForecast(this._hass, c.entity, type).then((f) => {
        this._forecast = Array.isArray(f) ? f : [];
        this._render();
      });
    }

    // Fetch a forecast from api.weather.gov: /points/{lat},{lon} → the grid
    // forecast (or forecastHourly) URL. Keyless + CORS-open. Never throws.
    async _fetchNws(lat, lon, type, units) {
      if (typeof fetch === 'undefined') return [];
      const headers = { Accept: 'application/geo+json' };
      const key = `${lat},${lon}`;
      try {
        if (this._pointsKey !== key || !this._pointsData) {
          const pr = await fetch(`https://api.weather.gov/points/${key}`, { headers });
          if (!pr.ok) return [];
          const pj = await pr.json();
          this._pointsKey = key;
          this._pointsData = (pj && pj.properties) || null;
        }
        const base = type === 'hourly' ? (this._pointsData && this._pointsData.forecastHourly)
                                       : (this._pointsData && this._pointsData.forecast);
        if (!base) return [];
        const url = base + (base.indexOf('?') >= 0 ? '&' : '?') + `units=${units || 'us'}`;
        const fr = await fetch(url, { headers });
        if (!fr.ok) return [];
        const fj = await fr.json();
        const periods = (fj && fj.properties && fj.properties.periods) || [];
        return type === 'hourly' ? mapNwsHourly(periods) : mapNwsDaily(periods);
      } catch (e) {
        return [];
      }
    }

    _moreInfo() {
      if (!this._config || !this._config.entity) return;
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: this._config.entity }, bubbles: true, composed: true,
      }));
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const accent = P.resolveAccent(c.accent);
      const type = c.forecast_type || 'daily';
      const n = Math.max(1, Number(c.count) || 5);
      const items = this._forecast.slice(0, n);

      const cols = items.map((it, i) => {
        const label = periodLabel(it.datetime, type, i === 0);
        const hi = roundTemp(parseFloat(it.temperature));
        const lo = roundTemp(parseFloat(it.templow));
        const precip = it.precipitation_probability;
        const showPrecip = c.show_precip !== false && precip != null && !isNaN(parseFloat(precip));
        return `
          <div class="col">
            <div class="lbl">${P.esc(label)}</div>
            <div class="ic">${P.weatherIcon(it.condition, { animated: !!c.animate, size: 38 })}</div>
            <div class="hi">${hi != null ? `${hi}°` : '—'}</div>
            ${lo != null ? `<div class="lo">${lo}°</div>` : ''}
            ${showPrecip ? `<div class="pop"><ha-icon icon="mdi:water"></ha-icon>${Math.round(parseFloat(precip))}%</div>` : ''}
          </div>`;
      }).join('');

      const empty = !items.length;
      const emptyText = (c.source || 'entity') === 'nws'
        ? 'Forecast unavailable (US locations only)'
        : 'Forecast unavailable';

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          ${P.WEATHER_CSS}
          .prism-card { display:flex; flex-direction:column; cursor:pointer; }
          .strip { display:flex; gap:4px; overflow-x:auto; scrollbar-width:none; }
          .strip::-webkit-scrollbar { display:none; }
          .col { flex:1 0 auto; min-width:52px; display:flex; flex-direction:column; align-items:center; gap:3px;
                 padding:6px 2px; border-radius:12px; }
          .col:first-child { background:var(--_surface-2); }
          .lbl { font-size:12px; font-weight:650; color:var(--_text-2); white-space:nowrap; }
          .ic { line-height:0; }
          .hi { font-size:15px; font-weight:750; color:var(--_text); }
          .lo { font-size:13px; font-weight:600; color:var(--_text-2); }
          .pop { display:inline-flex; align-items:center; gap:2px; font-size:11px; font-weight:600; color:${accent}; --mdc-icon-size:12px; }
          .empty { padding:16px 0 6px; font-size:13px; font-weight:500; color:var(--_text-2); text-align:center; }
        </style>
        <div class="prism-card" role="button" tabindex="0" aria-label="Forecast">
          ${P.titleHead(c.title)}
          ${empty ? `<div class="empty">${P.esc(emptyText)}</div>` : `<div class="strip">${cols}</div>`}
        </div>`;

      P.bindTap(this.shadowRoot.querySelector('.prism-card'), () => this._moreInfo(), () => this._moreInfo());
    }
  }

  customElements.define('prism-forecast-card', PrismForecastCard);
  P.registerCard({
    type: 'prism-forecast-card',
    name: 'Prism Forecast Card',
    description: 'Flat daily/hourly forecast strip (weather entity or the free US National Weather Service API).',
  });
})();
