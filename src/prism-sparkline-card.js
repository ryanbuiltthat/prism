/**
 * prism-sparkline-card
 * Flat history mini-graph. Header shows the entity name + current value;
 * body is a clean line/area sparkline over a configurable time window with
 * optional min/max markers. Downsamples history for smooth, fast rendering.
 *
 * type: custom:prism-sparkline-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  // ── Editor ────────────────────────────────────────────────────────
  class PrismSparklineCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._picker('Entity (required)', c.entity, (v) => this._patch('entity', v)),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._tf('Unit override', c.unit, (v) => this._patch('unit', v)),
        this._tf('Decimals', c.decimals, (v) => this._patch('decimals', v), { type: 'number' }),
        this._tf('Window (hours)', c.hours, (v) => this._patch('hours', v), { type: 'number' }),
        this._select('Style', ['area', 'line'], c.style || 'area', (v) => this._patch('style', v)),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._switch('Show current value', c.show_value !== false, (v) => this._patch('show_value', v)),
        this._switch('Show min/max markers', !!c.show_minmax, (v) => this._patch('show_minmax', v)),
        this._hint('Reads recorder history; refreshed every 5 minutes.')
      );
    }
  }
  customElements.define('prism-sparkline-card-editor', PrismSparklineCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismSparklineCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._history = [];
      this._historyAt = 0;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-sparkline-card: `entity` is required.');
      this._config = { hours: 24, style: 'area', ...config };
      this._history = [];
      this._historyAt = 0;
      if (this._hass) { this._maybeFetch(); this._render(); }
    }

    set hass(hass) {
      const first = !this._hass;
      this._hass = hass;
      this._maybeFetch();
      if (first) this._render(); else this._renderHeader();
    }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 12, min_rows: 2, min_columns: 4 }; }

    static getConfigElement() { return document.createElement('prism-sparkline-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('sensor.')) : 'sensor.example';
      return { entity: ent || 'sensor.example', hours: 24, style: 'area', show_value: true };
    }

    async _maybeFetch() {
      if (!this._hass || !this._config) return;
      const now = Date.now();
      if (now - this._historyAt < 5 * 60 * 1000 && this._history.length) return;
      this._historyAt = now;
      const hours = Number(this._config.hours) > 0 ? Number(this._config.hours) : 24;
      const raw = await P.fetchHistory(this._hass, this._config.entity, hours);
      this._history = P.downsample(raw, 300);
      this._render();
    }

    // Cheap header-only refresh on frequent hass updates.
    _renderHeader() {
      const el = this.shadowRoot.querySelector('.cur');
      if (!el || !this._hass) return;
      const c = this._config;
      const raw = P.num(this._hass, c.entity);
      const unit = P.unitOf(this._hass, c.entity, c.unit);
      el.innerHTML = !isNaN(raw)
        ? `${P.esc(P.fmtNumber(raw, c.decimals != null ? Number(c.decimals) : (Math.abs(raw) >= 100 ? 0 : 1)))}<span class="cunit">${unit ? ' ' + P.esc(unit) : ''}</span>`
        : '—';
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const hass = this._hass;
      const st = hass.states[c.entity];
      const accent = P.resolveAccent(c.accent);
      const name = c.name || (st ? st.attributes.friendly_name : c.entity);
      const raw = P.num(hass, c.entity);
      const unit = P.unitOf(hass, c.entity, c.unit);
      const cur = !isNaN(raw)
        ? P.fmtNumber(raw, c.decimals != null ? Number(c.decimals) : (Math.abs(raw) >= 100 ? 0 : 1))
        : '—';

      const W = 400, H = 96;
      const sp = P.sparklinePath(this._history, W, H, 4);
      const hasData = this._history.length > 1;

      let minmax = '';
      let markers = '';
      if (hasData && c.show_minmax) {
        // Locate min/max points for dots + labels.
        let lo = this._history[0], hi = this._history[0];
        for (const p of this._history) { if (p.v < lo.v) lo = p; if (p.v > hi.v) hi = p; }
        const t0 = this._history[0].t, t1 = this._history[this._history.length - 1].t;
        const span = t1 - t0 || 1, range = (sp.max - sp.min) || 1;
        const X = (t) => 4 + ((t - t0) / span) * (W - 8);
        const Y = (v) => 4 + (1 - (v - sp.min) / range) * (H - 8);
        markers = `
          <circle cx="${X(hi.t).toFixed(1)}" cy="${Y(hi.v).toFixed(1)}" r="3" fill="${accent}"/>
          <circle cx="${X(lo.t).toFixed(1)}" cy="${Y(lo.v).toFixed(1)}" r="3" fill="${accent}" opacity="0.5"/>`;
        minmax = `<div class="mm"><span>▲ ${P.esc(P.fmtNumber(hi.v, 1))}</span><span>▼ ${P.esc(P.fmtNumber(lo.v, 1))}</span></div>`;
      }

      const dot = hasData
        ? (() => {
            const last = this._history[this._history.length - 1];
            const t0 = this._history[0].t, t1 = last.t;
            const span = t1 - t0 || 1, range = (sp.max - sp.min) || 1;
            const x = 4 + ((last.t - t0) / span) * (W - 8);
            const y = 4 + (1 - (last.v - sp.min) / range) * (H - 8);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${accent}"/>`;
          })()
        : '';

      const body = hasData
        ? `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="graph" aria-hidden="true">
             ${c.style !== 'line' ? `<path d="${sp.area}" fill="${accent}" opacity="0.12"/>` : ''}
             <path d="${sp.line}" fill="none" stroke="${accent}" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round"/>
             ${markers}${dot}
           </svg>`
        : `<div class="empty">No history yet</div>`;

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; cursor:pointer; }
          .head { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:8px; }
          .name { font-size:13px; font-weight:600; color:var(--_text-2);
                  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .cur { font-size:22px; font-weight:750; letter-spacing:-.02em; color:var(--_text); line-height:1; white-space:nowrap; }
          .cunit { font-size:12px; font-weight:500; color:var(--_text-2); }
          .graph { width:100%; height:96px; flex:1; display:block; min-height:56px; }
          .empty { flex:1; display:flex; align-items:center; justify-content:center; color:var(--_text-2); font-size:12px; }
          .mm { display:flex; justify-content:space-between; font-size:11px; color:var(--_text-2); margin-top:4px; }
        </style>
        <div class="prism-card" role="button" tabindex="0" aria-label="${P.esc(name)}">
          <div class="head">
            <div class="name">${P.esc(name)}</div>
            ${c.show_value !== false ? `<div class="cur">${P.esc(cur)}<span class="cunit">${unit ? ' ' + P.esc(unit) : ''}</span></div>` : ''}
          </div>
          ${body}
          ${minmax}
        </div>`;

      const card = this.shadowRoot.querySelector('.prism-card');
      const tap = () => this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: c.entity }, bubbles: true, composed: true,
      }));
      card.addEventListener('click', tap);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } });
    }
  }

  customElements.define('prism-sparkline-card', PrismSparklineCard);
  P.registerCard({
    type: 'prism-sparkline-card',
    name: 'Prism Sparkline Card',
    description: 'Flat history mini-graph with current value and min/max markers.',
  });
})();
