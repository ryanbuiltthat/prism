/**
 * prism-lightning-card
 * Flat lightning tile: the strike count is the dominant value, with the last
 * strike time and distance for context, and an animated flat storm cloud whose
 * bolt flickers (shared Prism weather icon). Reads a strike-count sensor plus
 * optional distance / last-strike-time sensors (e.g. Ecowitt / AS3935).
 *
 * type: custom:prism-lightning-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  // Relative time from an ISO timestamp, or a "minutes ago" number.
  function relTime(v) {
    if (v == null || v === '') return '';
    const t = Date.parse(v);
    if (isNaN(t)) {
      const n = parseFloat(v);
      if (isNaN(n)) return '';
      return n < 1 ? 'just now' : `${Math.round(n)}m ago`;
    }
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }

  // ── Editor ────────────────────────────────────────────────────────
  class PrismLightningCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Strike count (required)', c.count_entity, (v) => this._patch('count_entity', v), { domains: ['sensor'] }),
        this._picker('Distance', c.distance_entity, (v) => this._patch('distance_entity', v), { domains: ['sensor'] }),
        this._picker('Last strike time', c.time_entity, (v) => this._patch('time_entity', v), { domains: ['sensor'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._switch('Animate', c.animate !== false, (v) => this._patch('animate', v)),
        this._hint('Distance accepts km or miles (its sensor unit). Last-strike accepts a timestamp or a minutes-ago number.')
      );
    }
  }
  customElements.define('prism-lightning-card-editor', PrismLightningCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismLightningCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
    }

    setConfig(config) {
      if (!config.count_entity && !config.distance_entity && !config.time_entity) {
        throw new Error('prism-lightning-card: set at least `count_entity` (or distance / time).');
      }
      this._config = { animate: true, accent: 'amber', ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 6, min_rows: 3, min_columns: 4 }; }

    static getConfigElement() { return document.createElement('prism-lightning-card-editor'); }
    static getStubConfig(hass) {
      const find = (re) => (hass ? Object.keys(hass.states).find((e) => e.startsWith('sensor.') && re.test(e)) : null);
      return {
        count_entity: find(/lightning.*count|strike.*count|lightning_num/i) || 'sensor.lightning_strike_count',
        distance_entity: find(/lightning.*dist|strike.*dist/i) || undefined,
        time_entity: find(/lightning.*(last|time)|last.*strike/i) || undefined,
      };
    }

    _moreInfo(id) {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: id || this._config.count_entity || this._config.distance_entity || this._config.time_entity },
        bubbles: true, composed: true,
      }));
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config, hass = this._hass;
      const accent = P.resolveAccent(c.accent);
      const num = (id) => (id && hass.states[id] ? P.num(hass, id) : NaN);
      const unit = (id, fb) => (id && hass.states[id] ? (P.unitOf(hass, id, '') || fb) : fb);

      const count = num(c.count_entity);
      const dist = num(c.distance_entity);
      const distUnit = unit(c.distance_entity, 'km');
      const last = relTime(c.time_entity && hass.states[c.time_entity] ? hass.states[c.time_entity].state : '');
      const name = c.name || (hass.states[c.count_entity] && hass.states[c.count_entity].attributes.friendly_name) || 'Lightning';

      const hasCount = !isNaN(count);
      const bigVal = hasCount ? P.fmtNumber(count, 0) : (!isNaN(dist) ? P.fmtNumber(dist, 0) : '—');
      const bigUnit = hasCount ? 'strikes' : (!isNaN(dist) ? distUnit : '');

      const subs = [];
      if (last) subs.push(`Last ${last}`);
      if (!isNaN(dist) && hasCount) subs.push(`${P.fmtNumber(dist, 0)} ${distUnit} away`);

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; cursor:pointer; }
          .content { display:flex; align-items:center; gap:14px; }
          .icon { flex:none; width:84px; height:84px; }
          .icon svg { display:block; width:100%; height:100%; }
          .icon.no-anim svg * { animation:none !important; }
          .info { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
          .big { display:flex; align-items:baseline; gap:6px; }
          .big .n { font-size:44px; font-weight:750; line-height:1; letter-spacing:-1.5px; color:${accent}; }
          .big .u { font-size:14px; font-weight:600; color:var(--_text-2); }
          .sub { font-size:13px; font-weight:600; color:var(--_text-2); }
          .sub:first-of-type { color:var(--_text); }
        </style>
        <div class="prism-card" role="button" tabindex="0" aria-label="${P.esc(name)}">
          ${P.titleHead(c.title)}
          <div class="content">
            <div class="icon${c.animate === false ? ' no-anim' : ''}">${P.weatherAnim('lightning')}</div>
            <div class="info">
              <div class="big"><span class="n">${P.esc(bigVal)}</span>${bigUnit ? `<span class="u">${P.esc(bigUnit)}</span>` : ''}</div>
              ${subs.map((s) => `<div class="sub">${P.esc(s)}</div>`).join('')}
            </div>
          </div>
        </div>`;

      P.bindTap(this.shadowRoot.querySelector('.prism-card'), () => this._moreInfo(), () => this._moreInfo());
    }
  }

  customElements.define('prism-lightning-card', PrismLightningCard);
  P.registerCard({
    type: 'prism-lightning-card',
    name: 'Prism Lightning Card',
    description: 'Flat lightning tile: strike count, last strike, and distance with an animated storm bolt.',
  });
})();
