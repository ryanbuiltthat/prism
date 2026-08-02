/**
 * prism-rain-card
 * Animated flat rain-gauge tile. A measuring cylinder fills with the current
 * rain-event total; raindrops fall into it, their density + speed scaled by
 * the intensity (rain rate). The event amount is the dominant value, with the
 * intensity + a rain-rate descriptor beside it, and chips for the hourly /
 * 24-hour / weekly / monthly totals.
 *
 * type: custom:prism-rain-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  // Rain-rate bands (mm/h) → descriptor + intensity level (drives the drops).
  function rainRate(mmh) {
    if (isNaN(mmh) || mmh <= 0) return { label: 'No rain', level: 0 };
    if (mmh < 2.5) return { label: 'Light', level: 1 };
    if (mmh < 7.6) return { label: 'Moderate', level: 2 };
    if (mmh < 50) return { label: 'Heavy', level: 3 };
    return { label: 'Violent', level: 4 };
  }
  const isIn = (u) => /in|"/.test(String(u || '').toLowerCase());
  const fmtRain = (v, unit) => (isNaN(v) ? '—' : P.fmtNumber(v, isIn(unit) ? 2 : 1));

  // ── Editor ────────────────────────────────────────────────────────
  class PrismRainCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._section('Rainfall sensors'),
        this._picker('Event total (required)', c.event_entity, (v) => this._patch('event_entity', v), { domains: ['sensor'] }),
        this._picker('Intensity / rate', c.intensity_entity, (v) => this._patch('intensity_entity', v), { domains: ['sensor'] }),
        this._picker('Hourly', c.hourly_entity, (v) => this._patch('hourly_entity', v), { domains: ['sensor'] }),
        this._picker('24 hours', c.daily_entity, (v) => this._patch('daily_entity', v), { domains: ['sensor'] }),
        this._picker('Weekly', c.weekly_entity, (v) => this._patch('weekly_entity', v), { domains: ['sensor'] }),
        this._picker('Monthly', c.monthly_entity, (v) => this._patch('monthly_entity', v), { domains: ['sensor'] }),
        this._section('Gauge'),
        this._tf('Full-scale amount (max)', c.max, (v) => this._patch('max', v === '' ? '' : Number(v)), { type: 'number' }),
        this._hint('The event total that fills the gauge. Defaults to 1 in / 25 mm.'),
        this._switch('Animate', c.animate !== false, (v) => this._patch('animate', v))
      );
    }
  }
  customElements.define('prism-rain-card-editor', PrismRainCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismRainCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._sig = null;
    }

    setConfig(config) {
      if (!config.event_entity) throw new Error('prism-rain-card: `event_entity` is required.');
      this._config = { animate: true, accent: 'blue', ...config };
      this._sig = null; // force a rebuild on the next render
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 3; }
    getGridOptions() { return { rows: 3, columns: 6, min_rows: 3, min_columns: 4 }; }

    static getConfigElement() { return document.createElement('prism-rain-card-editor'); }
    static getStubConfig(hass) {
      const find = (re) => (hass ? Object.keys(hass.states).find((e) => e.startsWith('sensor.') && re.test(e)) : null);
      return { event_entity: find(/rain.*event|event.*rain/i) || 'sensor.rain_event', intensity_entity: find(/rain.*rate|rain.*intensit|intensit/i) || undefined };
    }

    _moreInfo(id) {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: id || this._config.event_entity }, bubbles: true, composed: true,
      }));
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config, hass = this._hass;
      const accent = P.resolveAccent(c.accent);
      const val = (id) => (id && hass.states[id] ? P.num(hass, id) : NaN);
      const unit = (id, fb) => (id && hass.states[id] ? (P.unitOf(hass, id, '') || fb) : fb);

      const event = val(c.event_entity);
      const eUnit = c.unit || unit(c.event_entity, 'in');
      const intensity = val(c.intensity_entity);
      const iUnit = unit(c.intensity_entity, isIn(eUnit) ? 'in/h' : 'mm/h');
      const mmh = isNaN(intensity) ? NaN : (isIn(iUnit) ? intensity * 25.4 : intensity);
      const rate = rainRate(mmh);

      const max = Number(c.max) > 0 ? Number(c.max) : (isIn(eUnit) ? 1 : 25);
      const frac = P.clamp((isNaN(event) ? 0 : event) / max, 0, 1);

      const name = c.name || (hass.states[c.event_entity] && hass.states[c.event_entity].attributes.friendly_name) || 'Rainfall';

      // ── Gauge tube (viewBox 60×120) ───────────────────────────────
      const IX = 18, IY = 8, IW = 24, IH = 104, IB = IY + IH; // inner water area
      const topY = IB - frac * IH;
      const ticks = [0.25, 0.5, 0.75].map((t) => {
        const y = IB - t * IH;
        return `<line x1="${IX + IW}" y1="${y}" x2="${IX + IW + 4}" y2="${y}" stroke="var(--_text-2)" stroke-width="1.5" opacity=".5"/>`;
      }).join('');

      const animate = c.animate !== false;
      const nDrops = animate ? [0, 3, 5, 8, 11][rate.level] : 0;
      let drops = '';
      for (let i = 0; i < nDrops; i++) {
        const x = IX + 3 + (i * (IW - 6)) / Math.max(1, nDrops - 1);
        const dur = [0, 0.95, 0.8, 0.62, 0.46][rate.level];
        drops += `<line class="drop" x1="${x.toFixed(1)}" y1="-6" x2="${(x - 2).toFixed(1)}" y2="2" stroke="${accent}" stroke-width="2.4" stroke-linecap="round"
                    style="animation-duration:${dur}s;animation-delay:${(-(i * dur) / nDrops).toFixed(2)}s"/>`;
      }

      // Chips for the period totals that are configured + available.
      const periodChips = [
        ['mdi:clock-outline', '1h', c.hourly_entity],
        ['mdi:calendar-today', '24h', c.daily_entity],
        ['mdi:calendar-week', 'Wk', c.weekly_entity],
        ['mdi:calendar-month', 'Mo', c.monthly_entity],
      ].map(([icon, lbl, id]) => {
        const v = val(id);
        if (isNaN(v)) return '';
        const u = unit(id, eUnit);
        return `<button class="chip" data-entity="${P.esc(id)}"><ha-icon icon="${icon}"></ha-icon><span class="cl">${lbl}</span> ${P.esc(fmtRain(v, u))}</button>`;
      }).join('');

      const intLine = isNaN(intensity)
        ? `<span class="rate l${rate.level}">${rate.label}</span>`
        : `${P.esc(fmtRain(intensity, iUnit))} ${P.esc(iUnit)} · <span class="rate l${rate.level}">${rate.label}</span>`;

      // Home Assistant pushes `hass` on every state change. Rebuild only when a
      // displayed value changes, so the falling-drop / wave CSS animations
      // aren't restarted from scratch on every unrelated tick.
      const sig = JSON.stringify([frac, event, intensity, periodChips, intLine, name]);
      if (sig === this._sig) return;
      this._sig = sig;

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; }
          .content { display:flex; align-items:stretch; gap:16px; }
          svg.gauge { width:60px; height:120px; flex:none; overflow:visible; }
          .tube { fill:var(--_surface-2); stroke:var(--_border); stroke-width:2; }
          .water-body { fill:${accent}; opacity:.9; }
          .wave { fill:${accent}; }
          .drop { opacity:0; ${animate ? 'animation-name:rain-drop;animation-timing-function:linear;animation-iteration-count:infinite;' : ''} }
          .wave-anim { ${animate ? 'animation:rain-wave 2.4s linear infinite;' : ''} }
          @keyframes rain-drop { 0%{transform:translateY(0);opacity:0} 12%{opacity:1} 100%{transform:translateY(${(IH).toFixed(0)}px);opacity:0} }
          @keyframes rain-wave { to { transform:translateX(-16px); } }
          .info { display:flex; flex-direction:column; justify-content:center; min-width:0; flex:1; gap:2px; }
          .ev { display:flex; align-items:baseline; gap:6px; }
          .ev .n { font-size:40px; font-weight:750; line-height:1; letter-spacing:-1.5px; color:var(--_text); }
          .ev .u { font-size:14px; font-weight:600; color:var(--_text-2); }
          .evlbl { font-size:12px; font-weight:600; color:var(--_text-2); text-transform:uppercase; letter-spacing:.05em; }
          .int { font-size:13px; font-weight:650; color:var(--_text); margin-top:2px; }
          .rate { font-weight:750; } .rate.l0 { color:var(--_text-2); } .rate.l1 { color:#5aa6e8; }
          .rate.l2 { color:${accent}; } .rate.l3 { color:#e0922e; } .rate.l4 { color:#c64b4b; }
          .chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
          .chip { display:inline-flex; align-items:center; gap:4px; padding:4px 10px 4px 7px; border-radius:999px; cursor:pointer;
                  border:none; background:var(--_surface-2); color:var(--_text); font:inherit; font-size:12px; font-weight:650;
                  --mdc-icon-size:14px; white-space:nowrap; }
          .chip ha-icon { color:var(--_text-2); }
          .chip .cl { color:var(--_text-2); font-weight:600; }
        </style>
        <div class="prism-card">
          ${P.titleHead(c.title)}
          <div class="content">
            <svg class="gauge" viewBox="0 0 60 120" role="button" tabindex="0" aria-label="${P.esc(name)}">
              <defs><clipPath id="rainclip"><rect x="${IX + 1}" y="${IY + 1}" width="${IW - 2}" height="${IH - 2}" rx="11"/></clipPath></defs>
              <rect class="tube" x="${IX}" y="${IY}" width="${IW}" height="${IH}" rx="12"/>
              ${ticks}
              <g clip-path="url(#rainclip)">
                <g transform="translate(0 ${topY.toFixed(1)})">
                  <rect class="water-body" x="-8" y="4" width="76" height="${IH + 12}"/>
                  <g class="wave-anim">
                    <path class="wave" d="M-16 1 q4 -5 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 L64 1 L64 12 L-16 12 Z"/>
                  </g>
                </g>
              </g>
              ${drops}
            </svg>
            <div class="info">
              <div class="evlbl">Event</div>
              <div class="ev"><span class="n">${P.esc(fmtRain(event, eUnit))}</span><span class="u">${P.esc(eUnit)}</span></div>
              <div class="int">${intLine}</div>
              ${periodChips ? `<div class="chips">${periodChips}</div>` : ''}
            </div>
          </div>
        </div>`;

      const svg = this.shadowRoot.querySelector('svg.gauge');
      P.bindTap(svg, () => this._moreInfo(c.event_entity), () => this._moreInfo(c.event_entity));
      this.shadowRoot.querySelectorAll('.chip').forEach((el) =>
        el.addEventListener('click', () => this._moreInfo(el.dataset.entity)));
    }
  }

  customElements.define('prism-rain-card', PrismRainCard);
  P.registerCard({
    type: 'prism-rain-card',
    name: 'Prism Rain Card',
    description: 'Animated rain-gauge tile: a filling measuring cylinder with falling drops, event total, intensity rate, and period chips.',
  });
})();
