/**
 * prism-light-card
 * Flat light tile: an icon chip that toggles the light (tap) or opens
 * more-info (hold), plus a drag brightness slider. The slider and chip
 * pick up the bulb's current colour when it reports one.
 *
 * type: custom:prism-light-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const DIMMABLE = ['brightness', 'color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww'];

  // ── Editor ────────────────────────────────────────────────────────
  class PrismLightCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Light entity (required)', c.entity, (v) => this._patch('entity', v), { domains: ['light'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._tf('Icon (mdi:…)', c.icon, (v) => this._patch('icon', v)),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._switch('Show brightness slider', c.slider !== false, (v) => this._patch('slider', v)),
        this._switch('Use the bulb colour', c.use_color !== false, (v) => this._patch('use_color', v)),
        this._hint('Tap the icon to toggle, hold for more-info. Drag the slider (or use arrow keys) to set brightness.')
      );
    }
  }
  customElements.define('prism-light-card-editor', PrismLightCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismLightCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._dragging = false;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-light-card: `entity` is required.');
      if (config.entity.split('.')[0] !== 'light') throw new Error('prism-light-card: entity must be a light.');
      this._config = { slider: true, use_color: true, ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; if (!this._dragging) this._render(); }

    getCardSize() { return 2; }
    getGridOptions() { return { rows: 2, columns: 4, min_rows: 2, min_columns: 3 }; }

    static getConfigElement() { return document.createElement('prism-light-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('light.')) : 'light.example';
      return { entity: ent || 'light.example', slider: true, use_color: true };
    }

    _canDim(st) {
      if (!st) return false;
      if (st.attributes.brightness != null) return true;
      const modes = st.attributes.supported_color_modes;
      return Array.isArray(modes) && modes.some((m) => DIMMABLE.includes(m));
    }
    _pct(st) {
      const b = st && st.attributes.brightness;
      if (b == null) return st && st.state === 'on' ? 100 : 0;
      return Math.round((b / 255) * 100);
    }
    _color(st) {
      if (this._config.use_color !== false && st && Array.isArray(st.attributes.rgb_color)) {
        return `rgb(${st.attributes.rgb_color.join(',')})`;
      }
      return P.resolveAccent(this._config.accent);
    }

    _toggle() {
      if (this._hass?.callService) this._hass.callService('light', 'toggle', { entity_id: this._config.entity });
    }
    _moreInfo() {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: this._config.entity }, bubbles: true, composed: true,
      }));
    }
    _setPct(pct) {
      const id = this._config.entity;
      if (!this._hass?.callService) return;
      if (pct <= 0) this._hass.callService('light', 'turn_off', { entity_id: id });
      else this._hass.callService('light', 'turn_on', { entity_id: id, brightness_pct: pct });
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const st = this._hass.states[c.entity];
      const on = st && st.state === 'on';
      const color = this._color(st);
      const name = c.name || P.friendlyName(this._hass, c.entity);
      const icon = c.icon || (st && st.attributes.icon) || 'mdi:lightbulb';
      const canDim = c.slider !== false && this._canDim(st);
      const pct = on ? this._pct(st) : 0;
      const stateTxt = !st ? 'Unavailable' : on ? (canDim ? `${pct}%` : 'On') : 'Off';

      const sliderHtml = canDim ? `
        <div class="slider" role="slider" tabindex="0" aria-label="Brightness"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
          <div class="fill" style="width:${pct}%;background:${on ? color : 'var(--_text-2)'};"></div>
        </div>` : '';

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; gap:12px; }
          .head { display:flex; align-items:center; gap:14px; cursor:pointer; user-select:none; -webkit-user-select:none; }
          .chip { --mdc-icon-size:24px; width:44px; height:44px; border-radius:50%; flex:none;
                  display:flex; align-items:center; justify-content:center; transition:background .2s, color .2s;
                  background:var(--_surface-2); color:var(--_text-2); }
          .chip.on { background:${color}; color:#fff; }
          .txt { display:flex; flex-direction:column; gap:2px; min-width:0; }
          .nm { font-size:15px; font-weight:650; color:var(--_text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .sec { font-size:12px; font-weight:500; color:var(--_text-2); }
          .sec.on { color:${on ? color : 'var(--_text-2)'}; }
          .slider { position:relative; height:14px; border-radius:7px; background:var(--_surface-2);
                    overflow:hidden; cursor:pointer; touch-action:none; }
          .slider:focus-visible { outline:2px solid ${color}; outline-offset:2px; }
          .fill { position:absolute; top:0; bottom:0; left:0; border-radius:7px; transition:width .12s ease-out; }
          .slider.dragging .fill { transition:none; }
        </style>
        <div class="prism-card">
          ${P.titleHead(c.title)}
          <div class="head" role="button" tabindex="0" aria-pressed="${on ? 'true' : 'false'}" aria-label="${P.esc(name)}">
            <div class="chip${on ? ' on' : ''}"><ha-icon icon="${P.esc(icon)}"></ha-icon></div>
            <div class="txt">
              <span class="nm">${P.esc(name)}</span>
              <span class="sec${on ? ' on' : ''}">${P.esc(stateTxt)}</span>
            </div>
          </div>
          ${sliderHtml}
        </div>`;

      P.bindTap(this.shadowRoot.querySelector('.head'), () => this._toggle(), () => this._moreInfo());
      if (canDim) this._bindSlider(this.shadowRoot.querySelector('.slider'));
    }

    _bindSlider(el) {
      const fill = el.querySelector('.fill');
      const pctAt = (clientX) => {
        const r = el.getBoundingClientRect();
        return Math.round(P.clamp((clientX - r.left) / (r.width || 1), 0, 1) * 100);
      };
      const paint = (pct) => {
        fill.style.width = `${pct}%`;
        fill.style.background = pct > 0 ? this._color(this._hass.states[this._config.entity]) : 'var(--_text-2)';
        el.setAttribute('aria-valuenow', String(pct));
      };
      let pending = 0;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._dragging = true; el.classList.add('dragging');
        el.setPointerCapture(e.pointerId);
        pending = pctAt(e.clientX); paint(pending);
      });
      el.addEventListener('pointermove', (e) => {
        if (!this._dragging) return;
        pending = pctAt(e.clientX); paint(pending);
      });
      const end = () => {
        if (!this._dragging) return;
        this._dragging = false; el.classList.remove('dragging');
        this._setPct(pending);
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('keydown', (e) => {
        const cur = Number(el.getAttribute('aria-valuenow')) || 0;
        let next = cur;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = P.clamp(cur + 5, 0, 100);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = P.clamp(cur - 5, 0, 100);
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = 100;
        else return;
        e.preventDefault();
        paint(next); this._setPct(next);
      });
    }
  }

  customElements.define('prism-light-card', PrismLightCard);
  P.registerCard({
    type: 'prism-light-card',
    name: 'Prism Light Card',
    description: 'Flat light tile with a drag brightness slider and the bulb’s colour.',
  });
})();
