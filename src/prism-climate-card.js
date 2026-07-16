/**
 * prism-climate-card
 * Flat thermostat tile: big target temperature with − / + steppers, the
 * current temperature and HVAC action as context, and an accent that
 * follows the mode (heating warm, cooling blue, else muted). Tap the value
 * for more-info.
 *
 * type: custom:prism-climate-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

  // HVAC action → accent colour.
  const ACTION_COLOR = {
    heating: '#e8703a', cooling: '#3aa0e8', drying: '#e0922e',
    fan: '#28b5a6', idle: null, off: null,
  };
  const MODE_ICON = {
    heat: 'mdi:fire', cool: 'mdi:snowflake', heat_cool: 'mdi:sun-snowflake-variant',
    auto: 'mdi:thermostat-auto', dry: 'mdi:water-percent', fan_only: 'mdi:fan', off: 'mdi:power',
  };

  // ── Editor ────────────────────────────────────────────────────────
  class PrismClimateCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Climate entity (required)', c.entity, (v) => this._patch('entity', v), { domains: ['climate'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._tf('Step (°) override', c.step, (v) => this._patch('step', v), { type: 'number' }),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._switch('Colour by HVAC action', c.action_color !== false, (v) => this._patch('action_color', v)),
        this._hint('Steppers call climate.set_temperature; tap the reading for more-info.')
      );
    }
  }
  customElements.define('prism-climate-card-editor', PrismClimateCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismClimateCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-climate-card: `entity` is required.');
      if (config.entity.split('.')[0] !== 'climate') throw new Error('prism-climate-card: entity must be a climate.');
      this._config = { ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 6, min_rows: 2, min_columns: 3 }; }

    static getConfigElement() { return document.createElement('prism-climate-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('climate.')) : 'climate.example';
      return { entity: ent || 'climate.example' };
    }

    _accent(st) {
      if (this._config.action_color !== false && st) {
        const a = ACTION_COLOR[st.attributes.hvac_action];
        if (a) return a;
      }
      return P.resolveAccent(this._config.accent);
    }
    _step(st) {
      const s = Number(this._config.step) || (st && Number(st.attributes.target_temp_step));
      return s > 0 ? s : 0.5;
    }
    _adjust(delta) {
      const st = this._hass.states[this._config.entity];
      if (!st || st.attributes.temperature == null || !this._hass.callService) return;
      const min = Number(st.attributes.min_temp);
      const max = Number(st.attributes.max_temp);
      let t = Number(st.attributes.temperature) + delta;
      if (isFinite(min)) t = Math.max(min, t);
      if (isFinite(max)) t = Math.min(max, t);
      t = Math.round(t * 10) / 10;
      this._hass.callService('climate', 'set_temperature', { entity_id: this._config.entity, temperature: t });
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
      const accent = this._accent(st);
      const name = c.name || P.friendlyName(this._hass, c.entity);
      const unit = (this._hass.config && this._hass.config.unit_system && this._hass.config.unit_system.temperature) || '°';
      const target = st && st.attributes.temperature;
      const current = st && st.attributes.current_temperature;
      const hasTarget = target != null && !isNaN(Number(target));
      const mode = st ? st.state : 'unavailable';
      const action = st && st.attributes.hvac_action;
      const modeIcon = MODE_ICON[mode] || 'mdi:thermostat';

      const sub = [];
      if (current != null) sub.push(`Current ${P.esc(P.fmtNumber(Number(current), 1))}${P.esc(unit)}`);
      sub.push(titleCase(action || mode));

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; gap:12px; }
          .top { display:flex; align-items:center; gap:14px; }
          .mode { --mdc-icon-size:22px; width:40px; height:40px; border-radius:12px; flex:none;
                  display:flex; align-items:center; justify-content:center; color:${accent};
                  background:color-mix(in srgb, ${accent} 15%, transparent); }
          .info { display:flex; flex-direction:column; gap:1px; min-width:0; }
          .nm { font-size:14px; font-weight:650; color:var(--_text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .sub { font-size:12px; font-weight:500; color:var(--_text-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .stepper { display:flex; align-items:center; justify-content:center; gap:18px; }
          .btn { width:40px; height:40px; border-radius:50%; border:1px solid var(--_border); background:var(--_surface);
                 color:var(--_text); font:400 24px/1 var(--_font); cursor:pointer; flex:none;
                 display:flex; align-items:center; justify-content:center; transition:background .15s, border-color .15s, color .15s; }
          .btn:hover:not(:disabled) { border-color:${accent}; color:${accent}; }
          .btn:disabled { opacity:.35; cursor:default; }
          .target { min-width:80px; text-align:center; cursor:pointer; }
          .target .t { font-size:32px; font-weight:750; letter-spacing:-.02em; color:var(--_text); line-height:1; }
          .target .u { font-size:15px; font-weight:500; color:var(--_text-2); }
          .target .lbl { font-size:10px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--_text-2); margin-top:4px; }
        </style>
        <div class="prism-card">
          ${P.titleHead(c.title)}
          <div class="top">
            <div class="mode"><ha-icon icon="${modeIcon}"></ha-icon></div>
            <div class="info">
              <span class="nm">${P.esc(name)}</span>
              <span class="sub">${sub.join(' · ')}</span>
            </div>
          </div>
          <div class="stepper">
            <button class="btn minus" aria-label="Lower target" ${hasTarget ? '' : 'disabled'}>−</button>
            <div class="target" role="button" tabindex="0" aria-label="${P.esc(name)} target temperature">
              <div><span class="t">${hasTarget ? P.esc(P.fmtNumber(Number(target), Number(target) % 1 ? 1 : 0)) : '—'}</span><span class="u">${P.esc(unit)}</span></div>
              <div class="lbl">Target</div>
            </div>
            <button class="btn plus" aria-label="Raise target" ${hasTarget ? '' : 'disabled'}>+</button>
          </div>
        </div>`;

      const step = this._step(st);
      const minus = this.shadowRoot.querySelector('.minus');
      const plus = this.shadowRoot.querySelector('.plus');
      if (minus) minus.addEventListener('click', () => this._adjust(-step));
      if (plus) plus.addEventListener('click', () => this._adjust(step));
      P.bindTap(this.shadowRoot.querySelector('.target'), () => this._moreInfo(), () => this._moreInfo());
    }
  }

  customElements.define('prism-climate-card', PrismClimateCard);
  P.registerCard({
    type: 'prism-climate-card',
    name: 'Prism Climate Card',
    description: 'Flat thermostat tile with − / + target steppers and mode-aware accent.',
  });
})();
