/**
 * prism-power-card
 * Flat live power/energy tile. One dominant power value with a load bar for
 * context, a peak-in-window figure, an optional secondary energy total, and
 * an optional recent-power sparkline. Built for real-time energy monitoring
 * (e.g. CT-clamp power sensors) — never a bare number.
 *
 * Two modes:
 *   • load (default) — bar fills 0 → max; colour = accent (or severity band).
 *   • grid           — signed sensor: bar is zero-centred, import right /
 *                      export left, and an Import/Export pill states direction.
 *
 * type: custom:prism-power-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  // ── Editor ────────────────────────────────────────────────────────
  class PrismPowerCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Power entity (required)', c.entity, (v) => this._patch('entity', v), { domains: ['sensor'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._iconField(c.icon, (v) => this._patch('icon', v)),
        this._tf('Unit override', c.unit, (v) => this._patch('unit', v)),
        this._tf('Decimals', c.decimals, (v) => this._patch('decimals', v), { type: 'number' }),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._section('Load bar'),
        this._select('Mode', [
          { value: 'load', label: 'Load (0 → max)' },
          { value: 'grid', label: 'Grid (import / export)' },
        ], c.mode || 'load', (v) => this._patch('mode', v)),
        this._tf('Bar max (blank = auto from window peak)', c.max, (v) => this._patch('max', v), { type: 'number' }),
        this._hint('Grid mode expects a signed sensor: positive = importing, negative = exporting.'),
        this._section('Context'),
        this._picker('Energy total entity (optional)', c.energy_entity, (v) => this._patch('energy_entity', v), { domains: ['sensor'] }),
        this._tf('Energy label', c.energy_label, (v) => this._patch('energy_label', v)),
        this._tf('History window (hours)', c.hours, (v) => this._patch('hours', v), { type: 'number' }),
        this._switch('Show peak in window', c.peak !== false, (v) => this._patch('peak', v)),
        this._switch('Show sparkline', !!c.sparkline, (v) => this._patch('sparkline', v)),
        this._hint('Peak and sparkline read recorder history for the power entity.')
      );
    }
  }
  customElements.define('prism-power-card-editor', PrismPowerCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismPowerCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._history = [];
      this._historyAt = 0;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-power-card: `entity` is required.');
      this._config = { mode: 'load', ...config };
      this._history = [];
      this._historyAt = 0;
      if (this._hass) this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._maybeFetchHistory();
      this._render();
    }

    getCardSize() { return this._config?.sparkline ? 4 : 3; }
    getGridOptions() {
      return this._config?.sparkline
        ? { rows: 4, columns: 6, min_rows: 3, min_columns: 4 }
        : { rows: 3, columns: 6, min_rows: 2, min_columns: 4 };
    }

    static getConfigElement() { return document.createElement('prism-power-card-editor'); }
    static getStubConfig(hass) {
      const pick = (kw) => hass && Object.keys(hass.states).find(
        (e) => e.startsWith('sensor.') && (e.includes(kw) || (hass.states[e].attributes.unit_of_measurement || '').match(/^k?W$/))
      );
      const ent = pick('power') || (hass && Object.keys(hass.states).find((e) => e.startsWith('sensor.'))) || 'sensor.example';
      return { entity: ent, mode: 'load', hours: 3, peak: true, sparkline: true, accent: 'amber' };
    }

    _needsHistory() {
      return this._config && (this._config.peak !== false || this._config.sparkline || this._config.max == null);
    }

    async _maybeFetchHistory() {
      if (!this._needsHistory() || !this._hass) return;
      const now = Date.now();
      if (now - this._historyAt < 5 * 60 * 1000 && this._history.length) return; // 5-min cache
      this._historyAt = now;
      const hours = Number(this._config.hours) > 0 ? Number(this._config.hours) : 3;
      const raw = await P.fetchHistory(this._hass, this._config.entity, hours);
      this._history = P.downsample(raw, 200);
      this._render();
    }

    _onTap(entityId) {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId }, bubbles: true, composed: true,
      }));
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const hass = this._hass;
      const st = hass.states[c.entity];
      const grid = c.mode === 'grid';
      const accent = P.resolveAccent(c.accent);
      const name = c.name || (st ? st.attributes.friendly_name : c.entity);
      const raw = P.num(hass, c.entity);
      const has = !isNaN(raw);
      const unit = P.unitOf(hass, c.entity, c.unit);
      const decimals = c.decimals != null ? Number(c.decimals) : inferDecimals(raw);
      const value = has ? P.fmtNumber(grid ? Math.abs(raw) : raw, decimals) : '—';

      // Window peak (abs, so it also bounds grid mode).
      let peak = NaN;
      for (const p of this._history) { const a = Math.abs(p.v); if (!(a <= peak)) peak = a; }
      if (has) peak = isNaN(peak) ? Math.abs(raw) : Math.max(peak, Math.abs(raw));

      // Bar scale: explicit max wins, else window peak, else current value.
      const scale = Number(c.max) > 0 ? Number(c.max) : (peak > 0 ? peak : (Math.abs(raw) || 1));

      // Direction colour (grid mode): exporting = good, importing = accent.
      const exporting = grid && has && raw < 0;
      const valColor = grid ? (exporting ? 'var(--_good)' : accent) : accent;

      // ── Load bar ──
      let barHtml;
      if (grid) {
        const f = has ? P.clamp(Math.abs(raw) / scale, 0, 1) : 0;
        const half = (f * 50).toFixed(1);
        barHtml = `
          <div class="bar grid">
            <div class="mid"></div>
            ${has ? `<div class="fill" style="${exporting
              ? `right:50%;width:${half}%;background:var(--_good);border-radius:5px 0 0 5px;`
              : `left:50%;width:${half}%;background:${accent};border-radius:0 5px 5px 0;`}"></div>` : ''}
          </div>`;
      } else {
        const f = has ? P.clamp(raw / scale, 0, 1) : 0;
        barHtml = `
          <div class="bar">
            <div class="fill" style="width:${(f * 100).toFixed(1)}%;background:${accent};"></div>
          </div>`;
      }

      // ── Footer meta: pill + peak + energy total ──
      const pill = grid && has
        ? `<span class="pill" style="color:${valColor};background:color-mix(in srgb, ${exporting ? 'var(--_good)' : accent} 15%, transparent)">${exporting ? 'Exporting' : raw > 0 ? 'Importing' : 'Idle'}</span>`
        : '';

      let peakHtml = '';
      if (c.peak !== false && isFinite(peak) && this._history.length) {
        peakHtml = `<span class="meta">Peak ${P.esc(P.fmtNumber(peak, inferDecimals(peak)))} ${P.esc(unit)}</span>`;
      }

      let energyHtml = '';
      if (c.energy_entity && hass.states[c.energy_entity]) {
        const ev = P.num(hass, c.energy_entity);
        const eu = P.unitOf(hass, c.energy_entity, '');
        const elabel = c.energy_label || 'Today';
        energyHtml = `
          <button class="energy" data-entity="${P.esc(c.energy_entity)}" aria-label="${P.esc(elabel)}">
            <span class="e-label">${P.esc(elabel)}</span>
            <span class="e-val">${P.esc(isNaN(ev) ? hass.states[c.energy_entity].state : P.fmtNumber(ev, ev >= 100 ? 0 : 1))}<span class="e-unit"> ${P.esc(eu)}</span></span>
          </button>`;
      }

      // ── Sparkline ──
      let sparkHtml = '';
      if (c.sparkline && this._history.length > 1) {
        const w = 260, h = 38;
        const sp = P.sparklinePath(this._history, w, h, 3);
        // Zero reference line for grid (signed) series when zero is in range.
        let zeroLine = '';
        if (grid && sp.min < 0 && sp.max > 0) {
          const y = (3 + (1 - (0 - sp.min) / (sp.max - sp.min)) * (h - 6)).toFixed(1);
          zeroLine = `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="var(--_border)" stroke-width="1" stroke-dasharray="3 3"/>`;
        }
        sparkHtml = `
          <svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
            <path d="${sp.area}" fill="${accent}" opacity="0.10"/>
            ${zeroLine}
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
          .prism-card { display:flex; flex-direction:column; gap:10px; }
          .top { display:flex; align-items:center; gap:10px; }
          .icon { --mdc-icon-size:20px; width:34px; height:34px; border-radius:10px;
                  display:flex; align-items:center; justify-content:center;
                  background:color-mix(in srgb, ${accent} 14%, transparent); flex:none; }
          .label { font-size:13px; font-weight:600; color:var(--_text-2);
                   white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .energy { margin-left:auto; display:flex; flex-direction:column; align-items:flex-end;
                    gap:1px; background:none; border:none; padding:0; cursor:pointer; font:inherit; }
          .e-label { font-size:10px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--_text-2); }
          .e-val { font-size:14px; font-weight:700; color:var(--_text); }
          .e-unit { font-size:11px; font-weight:500; color:var(--_text-2); }
          .valrow { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; cursor:pointer; }
          .value { font-size:36px; font-weight:750; line-height:1; letter-spacing:-.02em; color:${valColor}; }
          .unit { font-size:15px; font-weight:500; color:var(--_text-2); }
          .pill { margin-left:auto; align-self:center; font-size:11px; font-weight:700;
                  padding:3px 9px; border-radius:999px; letter-spacing:.02em; }
          .bar { position:relative; height:10px; border-radius:5px; background:var(--_surface-2); overflow:hidden; }
          .bar .fill { position:absolute; top:0; bottom:0; left:0; border-radius:5px; transition:width .5s, right .5s, left .5s; }
          .bar.grid .mid { position:absolute; top:-1px; bottom:-1px; left:50%; width:1px; background:var(--_border); z-index:1; }
          .footer { display:flex; align-items:center; gap:10px; min-height:16px; }
          .meta { font-size:12px; font-weight:500; color:var(--_text-2); }
          .spark { width:100%; height:38px; display:block; margin-top:2px; }
        </style>
        <div class="prism-card">
          ${P.titleHead(c.title)}
          <div class="top">
            ${iconHtml}
            <div class="label">${P.esc(name)}</div>
            ${energyHtml}
          </div>
          <div class="valrow" role="button" tabindex="0" aria-label="${P.esc(name)}">
            <span class="value">${P.esc(value)}</span>
            ${unit && has ? `<span class="unit">${P.esc(unit)}</span>` : ''}
            ${pill}
          </div>
          ${barHtml}
          ${(peakHtml || pill) ? `<div class="footer">${peakHtml}</div>` : ''}
          ${sparkHtml}
        </div>`;

      const valrow = this.shadowRoot.querySelector('.valrow');
      const tap = () => this._onTap(c.entity);
      valrow.addEventListener('click', tap);
      valrow.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } });
      const energyBtn = this.shadowRoot.querySelector('.energy');
      if (energyBtn) energyBtn.addEventListener('click', () => this._onTap(energyBtn.dataset.entity));
    }
  }

  // Sensible default decimals based on magnitude (W vs kW).
  function inferDecimals(v) {
    const a = Math.abs(v);
    if (isNaN(a)) return 0;
    if (a >= 100) return 0;
    if (a >= 10) return 1;
    return 2;
  }

  customElements.define('prism-power-card', PrismPowerCard);
  P.registerCard({
    type: 'prism-power-card',
    name: 'Prism Power Card',
    description: 'Live power tile with load bar, peak, energy total, and grid import/export mode.',
  });
})();
