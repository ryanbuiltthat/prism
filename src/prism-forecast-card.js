/**
 * prism-forecast-card
 * Flat multi-day (or hourly) forecast strip: one column per period — a day/
 * hour label, a flat condition icon (shared Prism weather set), high/low temps,
 * and an optional precipitation-chance chip. Reads a `weather.*` entity's
 * forecast via the get_forecasts service.
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

  // ── Editor ────────────────────────────────────────────────────────
  class PrismForecastCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Weather entity (required)', c.entity, (v) => this._patch('entity', v), { domains: ['weather'] }),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._select('Forecast', [
          { value: 'daily', label: 'Daily' },
          { value: 'hourly', label: 'Hourly' },
        ], c.type || 'daily', (v) => this._patch('type', v)),
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
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-forecast-card: `entity` (a weather.* entity) is required.');
      this._config = { type: 'daily', count: 5, animate: false, show_precip: true, ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._maybeForecast(); this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 12, min_rows: 3, min_columns: 6 }; }

    static getConfigElement() { return document.createElement('prism-forecast-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('weather.')) : null;
      return { entity: ent || 'weather.home', type: 'daily', count: 5, accent: 'blue' };
    }

    _maybeForecast() {
      const c = this._config;
      if (!c || !c.entity || !this._hass) return;
      const key = `${c.entity}|${c.type || 'daily'}`;
      const now = Date.now();
      if (this._fcKey === key && this._fcAt && now - this._fcAt < 15 * 60 * 1000) return;
      this._fcKey = key; this._fcAt = now;
      P.fetchForecast(this._hass, c.entity, c.type || 'daily').then((f) => {
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
      const accent = P.resolveAccent(c.accent);
      const type = c.type || 'daily';
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
          ${empty ? `<div class="empty">Forecast unavailable</div>` : `<div class="strip">${cols}</div>`}
        </div>`;

      P.bindTap(this.shadowRoot.querySelector('.prism-card'), () => this._moreInfo(), () => this._moreInfo());
    }
  }

  customElements.define('prism-forecast-card', PrismForecastCard);
  P.registerCard({
    type: 'prism-forecast-card',
    name: 'Prism Forecast Card',
    description: 'Flat daily/hourly forecast strip: condition icons, high/low temps, and precipitation chance.',
  });
})();
