/**
 * prism-stat-card
 * Flat KPI tile: one dominant value with a label, unit, optional icon,
 * a trend delta over a configurable window, and an optional inline
 * sparkline. Built for stats / energy dashboards — never a bare number.
 *
 * type: custom:prism-stat-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  // ── Editor ────────────────────────────────────────────────────────
  class PrismStatCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Entity (required)', c.entity, (v) => this._patch('entity', v)),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._tf('Icon (mdi:…)', c.icon, (v) => this._patch('icon', v)),
        this._tf('Unit override', c.unit, (v) => this._patch('unit', v)),
        this._tf('Decimals', c.decimals, (v) => this._patch('decimals', v), { type: 'number' }),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._section('Trend & graph'),
        this._switch('Show trend', c.trend !== false, (v) => this._patch('trend', v)),
        this._tf('Trend window (hours)', c.trend_hours, (v) => this._patch('trend_hours', v), { type: 'number' }),
        this._switch('Higher is worse (invert colour)', !!c.invert_trend, (v) => this._patch('invert_trend', v)),
        this._switch('Show sparkline', !!c.sparkline, (v) => this._patch('sparkline', v)),
        this._hint('Trend and sparkline read recorder history for the entity.')
      );
    }
  }
  customElements.define('prism-stat-card-editor', PrismStatCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismStatCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._history = [];
      this._historyAt = 0;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-stat-card: `entity` is required.');
      this._config = { ...config };
      this._history = [];
      this._historyAt = 0;
      if (this._hass) this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._maybeFetchHistory();
      this._render();
    }

    getCardSize() { return this._config?.sparkline ? 3 : 2; }
    getGridOptions() {
      return this._config?.sparkline
        ? { rows: 3, columns: 6, min_rows: 2, min_columns: 3 }
        : { rows: 2, columns: 6, min_rows: 2, min_columns: 3 };
    }

    static getConfigElement() { return document.createElement('prism-stat-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('sensor.')) : 'sensor.example';
      return { entity: ent || 'sensor.example', trend: true, trend_hours: 24, sparkline: true, accent: 'blue' };
    }

    _needsHistory() {
      return this._config && (this._config.trend !== false || this._config.sparkline);
    }

    async _maybeFetchHistory() {
      if (!this._needsHistory() || !this._hass) return;
      const now = Date.now();
      if (now - this._historyAt < 5 * 60 * 1000 && this._history.length) return; // 5-min cache
      this._historyAt = now;
      const hours = Number(this._config.trend_hours) > 0 ? Number(this._config.trend_hours) : 24;
      const raw = await P.fetchHistory(this._hass, this._config.entity, hours);
      this._history = P.downsample(raw, 200);
      this._render();
    }

    _onTap() {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: this._config.entity }, bubbles: true, composed: true,
      }));
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const hass = this._hass;
      const st = hass.states[c.entity];
      const accent = P.resolveAccent(c.accent);
      const name = c.name || (st ? st.attributes.friendly_name : c.entity);
      const raw = P.num(hass, c.entity);
      const isNumeric = !isNaN(raw);
      const unit = P.unitOf(hass, c.entity, c.unit);
      const value = !st ? '—'
        : isNumeric ? P.fmtNumber(raw, c.decimals != null ? Number(c.decimals) : inferDecimals(raw))
        : st.state;

      // Trend from history.
      let trendHtml = '';
      if (c.trend !== false && isNumeric && this._history.length > 1) {
        const first = this._history[0].v;
        const delta = raw - first;
        const pct = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;
        const up = delta > 0;
        const flat = Math.abs(delta) < 1e-9;
        const worse = c.invert_trend ? up : !up;
        const col = flat ? 'var(--_text-2)' : worse ? 'var(--_bad)' : 'var(--_good)';
        const arrow = flat ? '→' : up ? '▲' : '▼';
        trendHtml = `<span class="trend" style="color:${col}">${arrow} ${P.esc(P.fmtNumber(Math.abs(pct), 1))}%</span>`;
      }

      // Sparkline.
      let sparkHtml = '';
      if (c.sparkline && this._history.length > 1) {
        const w = 240, h = 40;
        const sp = P.sparklinePath(this._history, w, h, 3);
        sparkHtml = `
          <svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
            <path d="${sp.area}" fill="${accent}" opacity="0.10"/>
            <path d="${sp.line}" fill="none" stroke="${accent}" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>`;
      }

      const iconHtml = c.icon
        ? `<div class="icon" style="color:${accent}"><ha-icon icon="${P.esc(c.icon)}"></ha-icon></div>`
        : '';

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; cursor:pointer; }
          .top { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
          .icon { --mdc-icon-size:20px; width:34px; height:34px; border-radius:10px;
                  display:flex; align-items:center; justify-content:center;
                  background:color-mix(in srgb, ${accent} 14%, transparent); flex:none; }
          .label { font-size:13px; font-weight:600; color:var(--_text-2);
                   white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .valrow { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
          .value { font-size:34px; font-weight:750; line-height:1.05; letter-spacing:-.02em; color:var(--_text); }
          .unit { font-size:14px; font-weight:500; color:var(--_text-2); }
          .trend { font-size:13px; font-weight:600; margin-left:auto; }
          .spark { width:100%; height:40px; margin-top:auto; padding-top:10px; display:block; }
        </style>
        <div class="prism-card" role="button" tabindex="0" aria-label="${P.esc(name)}">
          ${P.titleHead(c.title)}
          <div class="top">
            ${iconHtml}
            <div class="label">${P.esc(name)}</div>
          </div>
          <div class="valrow">
            <span class="value">${P.esc(value)}</span>
            ${unit && isNumeric ? `<span class="unit">${P.esc(unit)}</span>` : ''}
            ${trendHtml}
          </div>
          ${sparkHtml}
        </div>`;

      const card = this.shadowRoot.querySelector('.prism-card');
      card.addEventListener('click', () => this._onTap());
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._onTap(); } });
    }
  }

  // Sensible default decimals based on magnitude.
  function inferDecimals(v) {
    const a = Math.abs(v);
    if (a >= 100) return 0;
    if (a >= 10) return 1;
    return 2;
  }

  customElements.define('prism-stat-card', PrismStatCard);
  P.registerCard({
    type: 'prism-stat-card',
    name: 'Prism Stat Card',
    description: 'Flat KPI tile with trend delta and optional sparkline.',
  });
})();
