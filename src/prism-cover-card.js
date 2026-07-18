/**
 * prism-cover-card
 * Flat cover tile: icon chip, name + state/position, and open / stop /
 * close buttons. If the cover supports positioning, a drag slider sets it
 * (100 = open, 0 = closed). Tap the chip for more-info.
 *
 * type: custom:prism-cover-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  // supported_features bits: OPEN 1, CLOSE 2, SET_POSITION 4, STOP 8.
  const F = { OPEN: 1, CLOSE: 2, SET_POSITION: 4, STOP: 8 };

  // ── Editor ────────────────────────────────────────────────────────
  class PrismCoverCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Cover entity (required)', c.entity, (v) => this._patch('entity', v), { domains: ['cover'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._tf('Icon (mdi:…)', c.icon, (v) => this._patch('icon', v)),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._switch('Show position slider', c.slider !== false, (v) => this._patch('slider', v)),
        this._hint('Buttons call cover.open/close/stop; the slider calls cover.set_cover_position.')
      );
    }
  }
  customElements.define('prism-cover-card-editor', PrismCoverCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismCoverCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._dragging = false;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-cover-card: `entity` is required.');
      if (config.entity.split('.')[0] !== 'cover') throw new Error('prism-cover-card: entity must be a cover.');
      this._config = { slider: true, ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; if (!this._dragging) this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 4, min_rows: 2, min_columns: 3 }; }

    static getConfigElement() { return document.createElement('prism-cover-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('cover.')) : 'cover.example';
      return { entity: ent || 'cover.example' };
    }

    _feat(st, bit) {
      const sf = st && st.attributes.supported_features;
      return sf == null ? true : (sf & bit) !== 0;
    }
    _svc(service) {
      if (this._hass?.callService) this._hass.callService('cover', service, { entity_id: this._config.entity });
    }
    _setPos(pos) {
      if (this._hass?.callService) this._hass.callService('cover', 'set_cover_position', { entity_id: this._config.entity, position: pos });
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
      const name = c.name || P.friendlyName(this._hass, c.entity);
      const state = st ? st.state : 'unavailable';
      const pos = st && st.attributes.current_position;
      const hasPos = pos != null && !isNaN(Number(pos));
      const closed = state === 'closed' || (hasPos && Number(pos) === 0);
      const open = state === 'open' || (hasPos && Number(pos) === 100);
      const icon = c.icon || (st && st.attributes.icon) ||
        (state.includes('garage') ? 'mdi:garage' : closed ? 'mdi:window-shutter' : 'mdi:window-shutter-open');
      const sub = hasPos ? `${titleCase(state)} · ${Math.round(Number(pos))}%` : titleCase(state);
      const canSlide = c.slider !== false && hasPos && this._feat(st, F.SET_POSITION);

      const sliderHtml = canSlide ? `
        <div class="slider" role="slider" tabindex="0" aria-label="Position"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Number(pos))}">
          <div class="fill" style="width:${Math.round(Number(pos))}%;background:${accent};"></div>
        </div>` : '';

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; gap:12px; }
          .row { display:flex; align-items:center; gap:14px; }
          .chip { --mdc-icon-size:22px; width:40px; height:40px; border-radius:12px; flex:none; cursor:pointer;
                  display:flex; align-items:center; justify-content:center; color:${accent};
                  background:color-mix(in srgb, ${accent} 15%, transparent); }
          .info { display:flex; flex-direction:column; gap:1px; min-width:0; }
          .nm { font-size:14px; font-weight:650; color:var(--_text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .sub { font-size:12px; font-weight:500; color:var(--_text-2); }
          .btns { display:flex; gap:6px; margin-left:auto; }
          .btn { width:36px; height:36px; border-radius:9px; border:1px solid var(--_border); background:var(--_surface);
                 color:var(--_text); --mdc-icon-size:20px; cursor:pointer; flex:none;
                 display:flex; align-items:center; justify-content:center; transition:background .15s, border-color .15s, color .15s; }
          .btn:hover:not(:disabled) { border-color:${accent}; color:${accent}; }
          .btn:disabled { opacity:.35; cursor:default; }
          .slider { position:relative; height:14px; border-radius:7px; background:var(--_surface-2);
                    overflow:hidden; cursor:pointer; touch-action:none; }
          .slider:focus-visible { outline:2px solid ${accent}; outline-offset:2px; }
          .fill { position:absolute; top:0; bottom:0; left:0; border-radius:7px; transition:width .12s ease-out; }
          .slider.dragging .fill { transition:none; }
        </style>
        <div class="prism-card">
          ${P.titleHead(c.title)}
          <div class="row">
            <div class="chip" role="button" tabindex="0" aria-label="${P.esc(name)}"><ha-icon icon="${P.esc(icon)}"></ha-icon></div>
            <div class="info">
              <span class="nm">${P.esc(name)}</span>
              <span class="sub">${P.esc(sub)}</span>
            </div>
            <div class="btns">
              ${this._feat(st, F.OPEN) ? `<button class="btn op" aria-label="Open" ${open ? 'disabled' : ''}><ha-icon icon="mdi:arrow-up"></ha-icon></button>` : ''}
              ${this._feat(st, F.STOP) ? `<button class="btn sp" aria-label="Stop"><ha-icon icon="mdi:stop"></ha-icon></button>` : ''}
              ${this._feat(st, F.CLOSE) ? `<button class="btn cl" aria-label="Close" ${closed ? 'disabled' : ''}><ha-icon icon="mdi:arrow-down"></ha-icon></button>` : ''}
            </div>
          </div>
          ${sliderHtml}
        </div>`;

      const q = (s) => this.shadowRoot.querySelector(s);
      const op = q('.op'), sp = q('.sp'), cl = q('.cl');
      if (op) op.addEventListener('click', () => this._svc('open_cover'));
      if (sp) sp.addEventListener('click', () => this._svc('stop_cover'));
      if (cl) cl.addEventListener('click', () => this._svc('close_cover'));
      P.bindTap(q('.chip'), () => this._moreInfo(), () => this._moreInfo());
      if (canSlide) {
        P.dragSlider(q('.slider'), {
          onDrag: (v) => { this._dragging = v; },
          onCommit: (pct) => this._setPos(pct),
        });
      }
    }
  }

  customElements.define('prism-cover-card', PrismCoverCard);
  P.registerCard({
    type: 'prism-cover-card',
    name: 'Prism Cover Card',
    description: 'Flat cover tile with open / stop / close and an optional position slider.',
  });
})();
