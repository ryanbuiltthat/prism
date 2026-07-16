/**
 * prism-media-card
 * Flat media-player tile: album art (or an icon), what's playing, transport
 * controls (previous / play-pause / next), and an optional volume slider.
 * Tap the art for more-info.
 *
 * type: custom:prism-media-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  // media_player supported_features: PAUSE 1, VOLUME_SET 4, PREVIOUS 16,
  // NEXT 32, PLAY 16384.
  const F = { PAUSE: 1, VOLUME_SET: 4, PREVIOUS: 16, NEXT: 32, PLAY: 16384 };

  // ── Editor ────────────────────────────────────────────────────────
  class PrismMediaCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Media player (required)', c.entity, (v) => this._patch('entity', v), { domains: ['media_player'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._switch('Show album art', c.show_art !== false, (v) => this._patch('show_art', v)),
        this._switch('Show volume slider', c.show_volume !== false, (v) => this._patch('show_volume', v)),
        this._hint('Transport calls media_player.media_*; the slider calls media_player.volume_set.')
      );
    }
  }
  customElements.define('prism-media-card-editor', PrismMediaCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismMediaCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._dragging = false;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-media-card: `entity` is required.');
      if (config.entity.split('.')[0] !== 'media_player') throw new Error('prism-media-card: entity must be a media_player.');
      this._config = { show_art: true, show_volume: true, ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; if (!this._dragging) this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 6, min_rows: 3, min_columns: 4 }; }

    static getConfigElement() { return document.createElement('prism-media-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('media_player.')) : 'media_player.example';
      return { entity: ent || 'media_player.example' };
    }

    _feat(st, bit) {
      const sf = st && st.attributes.supported_features;
      return sf == null ? true : (sf & bit) !== 0;
    }
    _svc(service, data) {
      if (this._hass?.callService) this._hass.callService('media_player', service, { entity_id: this._config.entity, ...data });
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
      const playing = state === 'playing';
      const a = st ? st.attributes : {};
      const title = a.media_title || (st && !['idle', 'off', 'unavailable', 'standby'].includes(state) ? name : titleCase(state));
      const sub = a.media_artist || a.media_series_title || a.app_name || a.source || (a.media_title ? name : '');
      const art = c.show_art !== false && a.entity_picture ? a.entity_picture : null;
      const vol = a.volume_level;
      const hasVol = c.show_volume !== false && vol != null && this._feat(st, F.VOLUME_SET);
      const volPct = Math.round((Number(vol) || 0) * 100);

      const artHtml = art
        ? `<div class="art" role="button" tabindex="0" aria-label="${P.esc(name)}" style="background-image:url('${P.esc(art)}')"></div>`
        : `<div class="art icon" role="button" tabindex="0" aria-label="${P.esc(name)}"><ha-icon icon="mdi:speaker"></ha-icon></div>`;

      const volHtml = hasVol ? `
        <div class="vol">
          <ha-icon class="vic" icon="mdi:volume-medium"></ha-icon>
          <div class="slider" role="slider" tabindex="0" aria-label="Volume"
               aria-valuemin="0" aria-valuemax="100" aria-valuenow="${volPct}">
            <div class="fill" style="width:${volPct}%;background:${accent};"></div>
          </div>
        </div>` : '';

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; gap:12px; }
          .row { display:flex; align-items:center; gap:14px; }
          .art { width:52px; height:52px; border-radius:10px; flex:none; cursor:pointer; background-size:cover;
                 background-position:center; background-color:var(--_surface-2); }
          .art.icon { --mdc-icon-size:26px; color:var(--_text-2); display:flex; align-items:center; justify-content:center; }
          .info { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
          .nm { font-size:14px; font-weight:650; color:var(--_text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .sub { font-size:12px; font-weight:500; color:var(--_text-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .transport { display:flex; align-items:center; gap:6px; }
          .tb { width:34px; height:34px; border-radius:50%; border:none; background:none; color:var(--_text);
                --mdc-icon-size:22px; cursor:pointer; flex:none; display:flex; align-items:center; justify-content:center; }
          .tb:hover { color:${accent}; }
          .tb.play { width:44px; height:44px; --mdc-icon-size:26px; background:${accent}; color:#fff; }
          .vol { display:flex; align-items:center; gap:10px; }
          .vic { --mdc-icon-size:18px; color:var(--_text-2); flex:none; }
          .slider { position:relative; flex:1; height:12px; border-radius:6px; background:var(--_surface-2);
                    overflow:hidden; cursor:pointer; touch-action:none; }
          .slider:focus-visible { outline:2px solid ${accent}; outline-offset:2px; }
          .fill { position:absolute; top:0; bottom:0; left:0; border-radius:6px; transition:width .12s ease-out; }
          .slider.dragging .fill { transition:none; }
        </style>
        <div class="prism-card">
          ${P.titleHead(c.title)}
          <div class="row">
            ${artHtml}
            <div class="info">
              <span class="nm">${P.esc(title)}</span>
              ${sub ? `<span class="sub">${P.esc(sub)}</span>` : ''}
            </div>
            <div class="transport">
              ${this._feat(st, F.PREVIOUS) ? `<button class="tb prev" aria-label="Previous"><ha-icon icon="mdi:skip-previous"></ha-icon></button>` : ''}
              <button class="tb play" aria-label="Play/pause"><ha-icon icon="${playing ? 'mdi:pause' : 'mdi:play'}"></ha-icon></button>
              ${this._feat(st, F.NEXT) ? `<button class="tb next" aria-label="Next"><ha-icon icon="mdi:skip-next"></ha-icon></button>` : ''}
            </div>
          </div>
          ${volHtml}
        </div>`;

      const q = (s) => this.shadowRoot.querySelector(s);
      const prev = q('.prev'), play = q('.play'), next = q('.next');
      if (prev) prev.addEventListener('click', () => this._svc('media_previous_track'));
      if (play) play.addEventListener('click', () => this._svc('media_play_pause'));
      if (next) next.addEventListener('click', () => this._svc('media_next_track'));
      P.bindTap(q('.art'), () => this._moreInfo(), () => this._moreInfo());
      if (hasVol) this._bindSlider(q('.slider'), accent);
    }

    _bindSlider(el, accent) {
      const fill = el.querySelector('.fill');
      const pctAt = (clientX) => {
        const r = el.getBoundingClientRect();
        return Math.round(P.clamp((clientX - r.left) / (r.width || 1), 0, 1) * 100);
      };
      const paint = (pct) => { fill.style.width = `${pct}%`; el.setAttribute('aria-valuenow', String(pct)); };
      let pending = 0;
      const commit = () => this._svc('volume_set', { volume_level: P.clamp(pending / 100, 0, 1) });
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); this._dragging = true; el.classList.add('dragging');
        el.setPointerCapture(e.pointerId); pending = pctAt(e.clientX); paint(pending);
      });
      el.addEventListener('pointermove', (e) => { if (this._dragging) { pending = pctAt(e.clientX); paint(pending); } });
      const end = () => { if (!this._dragging) return; this._dragging = false; el.classList.remove('dragging'); commit(); };
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
        e.preventDefault(); pending = next; paint(next); commit();
      });
    }
  }

  customElements.define('prism-media-card', PrismMediaCard);
  P.registerCard({
    type: 'prism-media-card',
    name: 'Prism Media Card',
    description: 'Flat media-player tile with album art, transport, and volume.',
  });
})();
