/**
 * prism-switch-card
 * Flat toggle tile for a switch (or any toggleable entity): icon chip that
 * fills with the accent when on, name, and a state line. Tap toggles;
 * hold opens more-info.
 *
 * type: custom:prism-switch-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const OFF_STATES = ['off', 'unavailable', 'unknown', 'idle', 'closed', 'none', ''];
  const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  const domainOf = (id) => (id || '').split('.')[0];

  function relTime(iso) {
    const t = Date.parse(iso);
    if (isNaN(t)) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }

  const DEFAULT_ICON = {
    switch: 'mdi:toggle-switch-variant', light: 'mdi:lightbulb', fan: 'mdi:fan',
    input_boolean: 'mdi:toggle-switch', automation: 'mdi:robot', script: 'mdi:script-text',
    humidifier: 'mdi:air-humidifier', siren: 'mdi:bullhorn',
  };

  // ── Editor ────────────────────────────────────────────────────────
  class PrismSwitchCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Entity (required)', c.entity, (v) => this._patch('entity', v), { domains: ['switch', 'input_boolean', 'fan', 'light', 'automation', 'script', 'humidifier', 'siren'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._iconField(c.icon, (v) => this._patch('icon', v)),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._select('Secondary line', [
          { value: '', label: 'None' },
          { value: 'state', label: 'State' },
          { value: 'last-changed', label: 'Last changed' },
          { value: 'last-updated', label: 'Last updated' },
        ], c.secondary || 'state', (v) => this._patch('secondary', v)),
        this._hint('Tap toggles the entity; hold (or the more-info gesture) opens details.')
      );
    }
  }
  customElements.define('prism-switch-card-editor', PrismSwitchCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismSwitchCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-switch-card: `entity` is required.');
      this._config = { ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 2; }
    getGridOptions() { return { rows: 2, columns: 3, min_rows: 2, min_columns: 2 }; }

    static getConfigElement() { return document.createElement('prism-switch-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('switch.')) : 'switch.example';
      return { entity: ent || 'switch.example', secondary: 'state' };
    }

    _active(st) { return st && !OFF_STATES.includes(String(st.state).toLowerCase()); }

    _toggle() {
      const id = this._config.entity;
      if (this._hass?.callService) this._hass.callService('homeassistant', 'toggle', { entity_id: id });
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
      const on = this._active(st);
      const name = c.name || P.friendlyName(this._hass, c.entity);
      const icon = c.icon || (st && st.attributes.icon) || DEFAULT_ICON[domainOf(c.entity)] || 'mdi:toggle-switch-variant';

      const sk = c.secondary === undefined ? 'state' : c.secondary;
      let secondary = '';
      if (!st) secondary = 'Unavailable';
      else if (sk === 'state') secondary = titleCase(st.state);
      else if (sk === 'last-changed') secondary = relTime(st.last_changed);
      else if (sk === 'last-updated') secondary = relTime(st.last_updated);

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; gap:10px; }
          .tile { display:flex; align-items:center; gap:14px; cursor:pointer; user-select:none; -webkit-user-select:none; }
          .chip { --mdc-icon-size:24px; width:44px; height:44px; border-radius:50%; flex:none;
                  display:flex; align-items:center; justify-content:center; transition:background .2s, color .2s;
                  background:var(--_surface-2); color:var(--_text-2); }
          .chip.on { background:${accent}; color:#fff; }
          .txt { display:flex; flex-direction:column; gap:2px; min-width:0; }
          .nm { font-size:15px; font-weight:650; color:var(--_text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .sec { font-size:12px; font-weight:500; color:var(--_text-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .sec.on { color:${accent}; }
        </style>
        <div class="prism-card">
          ${P.titleHead(c.title)}
          <div class="tile" role="button" tabindex="0" aria-pressed="${on ? 'true' : 'false'}" aria-label="${P.esc(name)}">
            <div class="chip${on ? ' on' : ''}"><ha-icon icon="${P.esc(icon)}"></ha-icon></div>
            <div class="txt">
              <span class="nm">${P.esc(name)}</span>
              ${secondary ? `<span class="sec${on && sk === 'state' ? ' on' : ''}">${P.esc(secondary)}</span>` : ''}
            </div>
          </div>
        </div>`;

      P.bindTap(this.shadowRoot.querySelector('.tile'), () => this._toggle(), () => this._moreInfo());
    }
  }

  customElements.define('prism-switch-card', PrismSwitchCard);
  P.registerCard({
    type: 'prism-switch-card',
    name: 'Prism Switch Card',
    description: 'Flat toggle tile — tap to switch, hold for more-info.',
  });
})();
