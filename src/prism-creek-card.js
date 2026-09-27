/**
 * prism-creek-card + prism-creek-stage-feature
 * Creek-stage tile: a cross-section of the creek bank where the water rises
 * and falls with the stage sensor. Dashed Action / Flood / Major lines mark
 * the thresholds, a status pill names the current stage band, and the trend
 * (change per hour) and 24h peak come from recorder history. The companion
 * card feature is a compact 42px strip that sits under a tile card.
 *
 * Geometry is piecewise on the bank crest, so the drawn bank top always sits
 * at the configured crest height: bed→bank fills the channel, bank→max rises
 * over the banks (the water is drawn behind the bank path, so it floods onto
 * the land by itself).
 *
 * type: custom:prism-creek-card
 * feature: type: custom:prism-creek-stage-feature   (under a tile card)
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  // Stage bands, checked highest first.
  const BANDS = [
    { key: 'major', label: 'Major', color: 'var(--_purple)' },
    { key: 'flood', label: 'Flood', color: 'var(--_bad)' },
    { key: 'action', label: 'Action', color: 'var(--_warn)' },
  ];
  const NORMAL = { key: 'normal', label: 'Normal', color: 'var(--_good)' };
  const UNAVAILABLE = { key: 'unavailable', label: 'Unavailable', color: 'var(--_text-2)' };

  // SVG y-coordinates for the bed, the bank crest and the top of the scene.
  const G_CARD = { bed: 204, bank: 121, top: 92 };
  const G_FEAT = { bed: 36, bank: 13, top: 4 };

  const STEADY = 0.005;              // |trend| below this (unit/h) reads as steady
  const HIST_TTL = 5 * 60 * 1000;    // refetch history at most every 5 min
  const STAGE_UNITS = ['ft', 'm', 'in', 'cm'];

  let uid = 0; // per-instance suffix for clipPath ids

  const numOr = (v, d = null) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v));

  // Resolve the scene profile from config (all values in the sensor's unit).
  // bank defaults to flood; max defaults to 40% of the channel depth above the
  // bank (bank × 1.4 for a zero bed), raised to fit a major stage above that.
  function profile(c) {
    const bed = numOr(c.bed, 0);
    const action = numOr(c.action), flood = numOr(c.flood), major = numOr(c.major);
    let bank = numOr(c.bank, flood);
    let max = numOr(c.max);
    if (bank == null) bank = max != null && max > bed ? bed + (max - bed) / 1.4 : bed + 1;
    if (bank <= bed) bank = bed + 0.01;
    if (max == null || max <= bank) {
      max = bank + (bank - bed) * 0.4;
      if (major != null && major >= max) max = major + (bank - bed) * 0.1;
    }
    return { bed, bank, max, action, flood, major };
  }

  function stageToY(stage, p, g) {
    const s = P.clamp(stage, p.bed, p.max);
    if (s <= p.bank) return g.bed - ((s - p.bed) / (p.bank - p.bed || 1)) * (g.bed - g.bank);
    return g.bank - ((s - p.bank) / (p.max - p.bank || 1)) * (g.bank - g.top);
  }

  // Flood status falls back to the bank crest: over the banks is flooding.
  function band(stage, p) {
    if (isNaN(stage)) return UNAVAILABLE;
    const level = { major: p.major, flood: p.flood != null ? p.flood : p.bank, action: p.action };
    for (const b of BANDS) if (level[b.key] != null && stage >= level[b.key]) return b;
    return NORMAL;
  }

  // Change per hour over the last `hours`. History is piecewise constant, so
  // the value at the window start is the last point at or before it.
  function trendRate(points, cur, hours, now = Date.now()) {
    if (isNaN(cur) || !(hours > 0) || !points.length) return null;
    const t0 = now - hours * 3600000;
    let ref = null;
    for (const pt of points) { if (pt.t <= t0) ref = pt; else break; }
    if (!ref) ref = points[0];
    const dtH = (now - Math.max(ref.t, t0)) / 3600000;
    if (dtH < hours / 4) return null; // not enough history yet
    return (cur - ref.v) / dtH;
  }

  function peakOver(points, cur, hours, now = Date.now()) {
    const t0 = now - hours * 3600000;
    let m = isNaN(cur) ? -Infinity : cur, prev = null;
    for (const pt of points) {
      if (pt.t < t0) { prev = pt; continue; }
      if (pt.v > m) m = pt.v;
    }
    if (prev && prev.v > m) m = prev.v; // the state carried into the window
    return isFinite(m) ? m : NaN;
  }

  const fmt = (v, d) => P.fmtNumber(v, d);

  function trendText(t, unit, d) {
    if (t == null || isNaN(t)) return '';
    if (Math.abs(t) < STEADY) return '→ steady';
    const dd = Math.abs(t) < Math.pow(10, -d) ? d + 1 : d; // don't print ▲ 0.0
    return `${t > 0 ? '▲' : '▼'} ${fmt(Math.abs(t), dd)} ${unit}/h`;
  }
  // Rising water is worse, so the colours are inverted: up = bad, down = good.
  function trendColor(t) {
    if (t == null || isNaN(t) || Math.abs(t) < STEADY) return 'var(--_text-2)';
    return t > 0 ? 'var(--_bad)' : 'var(--_good)';
  }

  function updatedText(so) {
    const iso = so && (so.last_reported || so.last_updated || so.last_changed);
    if (!iso) return '';
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 45) return 'Updated just now';
    if (s < 3600) return `Updated ${Math.round(s / 60)}m ago`;
    if (s < 86400) return `Updated ${Math.round(s / 3600)}h ago`;
    return `Updated ${Math.round(s / 86400)}d ago`;
  }

  // Rendered text width in SVG units. Before the card is attached and laid out
  // getComputedTextLength() returns 0, so estimate from the character count;
  // _fit() runs again once the card is visible.
  function textLen(el) {
    let w = 0;
    try { w = el.getComputedTextLength(); } catch (_) { /* not rendered */ }
    if (!w) {
      const fs = parseFloat(el.getAttribute && el.getAttribute('font-size')) || 12;
      w = String(el.textContent || '').length * fs * 0.6;
    }
    return Math.ceil(w);
  }

  // Shared terrain + extra colour tokens (TOKEN_STYLE covers the rest).
  const CREEK_TOKENS = `
    :host {
      --_purple: var(--prism-purple, #8a6fd6);
      --_earth: var(--prism-earth, #d8cfbd);
      --_earth-edge: var(--prism-earth-edge, #c2b69e);
    }
    .dark {
      --_earth: var(--prism-earth, #3a342b);
      --_earth-edge: var(--prism-earth-edge, #4c4438);
    }
    .creek-water { transition: transform .8s ease-out; }
    .creek-wave { animation: creek-wave 3.2s linear infinite; }
    .creek-wave-sm { animation: creek-wave-sm 3.2s linear infinite; }
    .still .creek-wave, .still .creek-wave-sm { animation: none; }
    .still .creek-water { transition: none; }
    @keyframes creek-wave { to { transform: translateX(-24px); } }
    @keyframes creek-wave-sm { to { transform: translateX(-12px); } }
  `;

  // ── Card SVG (viewBox 400×266; the frame comes from .prism-card) ──
  function cardSvg(u) {
    const th = (key, color) =>
      `<g class="th th-${key}" style="display:none">` +
      `<line x1="16" x2="384" y1="0" y2="0" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 4"/>` +
      `<rect x="310" y="-15" width="68" height="13" rx="6.5" fill="var(--_surface)"/>` +
      `<text x="374" y="-5.5" text-anchor="end" font-size="9.5" font-weight="700" letter-spacing=".38" fill="${color}"></text></g>`;
    return `
      <svg class="scene" viewBox="0 0 400 266" role="img" aria-label="Creek stage">
        <defs>
          <clipPath id="creek-scene-${u}"><rect x="16" y="88" width="368" height="128" rx="12"/></clipPath>
          <clipPath id="creek-water-clip-${u}"><path d="M13 80 H387 V118 L314 118 C282 120 268 200 236 204 L164 204 C132 200 124 126 92 124 L13 124 Z"/></clipPath>
        </defs>
        <text class="title" x="16" y="30" font-size="13" font-weight="600" letter-spacing=".13" fill="var(--_text-2)"></text>
        <rect class="pill-bg" x="318" y="16" width="66" height="20" rx="10" fill="var(--_good)"/>
        <text class="pill" x="351" y="30" text-anchor="middle" font-size="12" font-weight="700" fill="#fff"></text>
        <text x="16" y="74" fill="var(--_text)"><tspan class="value" font-size="34" font-weight="750" letter-spacing="-.68">—</tspan><tspan class="unit" dx="7" font-size="14" font-weight="500" fill="var(--_text-2)"></tspan></text>
        <text class="trend" x="384" y="72" text-anchor="end" font-size="13" font-weight="600"></text>
        <g clip-path="url(#creek-scene-${u})">
          <rect x="16" y="88" width="368" height="128" fill="var(--_surface-2)"/>
          <g clip-path="url(#creek-water-clip-${u})"><g class="creek-water" style="transform:translateY(${G_CARD.bed}px)">
            <g class="creek-wave">
              <path d="M0 0 q6 -4 12 0 ${'t12 0 '.repeat(34)}V8 H0 Z" fill="var(--_accent)"/>
              <path d="M4 5 h14 M76 6 h22 M156 5 h16 M232 6 h24 M300 5 h14" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".35"/>
            </g>
            <rect x="0" y="2" width="420" height="140" fill="var(--_accent)" opacity=".85"/>
          </g></g>
          <path d="M13 124 L92 124 C124 126 132 200 164 204 L236 204 C268 200 282 120 314 118 L387 118 L387 219 L13 219 Z" fill="var(--_earth)" stroke="var(--_earth-edge)" stroke-width="1.5" stroke-linejoin="round"/>
          <text class="crest" x="22" y="118" font-size="9.5" font-weight="700" letter-spacing=".38" fill="var(--_text-2)"></text>
          <path d="M10 124 H90 M316 118 H390" fill="none" stroke="var(--_good)" stroke-width="3" stroke-linecap="round"/>
        </g>
        ${th('major', 'var(--_purple)')}${th('flood', 'var(--_bad)')}${th('action', 'var(--_warn)')}
        <g class="peak" font-size="12">
          <rect class="peak-bg" x="16" y="228" width="108" height="22" rx="11" fill="var(--_surface-2)"/>
          <text class="peak-text" x="26" y="243"><tspan class="peak-label" font-weight="600" fill="var(--_text-2)"></tspan><tspan class="peak-val" font-weight="650" dx="4" fill="var(--_text)"></tspan></text>
        </g>
        <text class="updated" x="384" y="243" text-anchor="end" font-size="12" font-weight="500" fill="var(--_text-2)"></text>
      </svg>`;
  }

  // ── Feature scene SVG (viewBox 96×42, left end of the strip) ──────
  function featureSvg(u) {
    return `
      <svg class="scene" viewBox="0 0 96 42" preserveAspectRatio="none" aria-hidden="true">
        <defs><clipPath id="creek-f-water-${u}"><path d="M-3 -10 H99 V12 L78 12 C68 13 66 35 56 36 L40 36 C30 35 28 15 18 14 L-3 14 Z"/></clipPath></defs>
        <g clip-path="url(#creek-f-water-${u})"><g class="creek-water" style="transform:translateY(${G_FEAT.bed}px)">
          <g class="creek-wave-sm"><path d="M0 0 q3 -2 6 0 ${'t6 0 '.repeat(18)}V4 H0 Z" fill="var(--_accent)"/></g>
          <rect x="0" y="1" width="110" height="50" fill="var(--_accent)" opacity=".85"/>
        </g></g>
        <path d="M-3 14 L18 14 C28 15 30 35 40 36 L56 36 C66 35 68 13 78 12 L99 12 L99 45 L-3 45 Z" fill="var(--_earth)" stroke="var(--_earth-edge)" stroke-width="1"/>
        <path d="M-2 14 H17 M79 12 H98" fill="none" stroke="var(--_good)" stroke-width="2" stroke-linecap="round"/>
        <line class="flood-line" x1="0" x2="96" y1="0" y2="0" stroke="var(--_bad)" stroke-width="1" stroke-dasharray="3 3"/>
      </svg>`;
  }

  // Recorder-history cache shared by the card and the feature: one fetch per
  // entity/window, refreshed at most every HIST_TTL.
  class HistoryWindow {
    constructor(onData) { this._onData = onData; this.points = []; this._key = ''; this._at = 0; this._busy = false; }
    refresh(hass, entityId, hours) {
      if (!hass || !hass.callWS || !entityId || !(hours > 0)) { this.points = []; return; }
      const key = `${entityId}|${hours}`, now = Date.now();
      if (this._busy || (key === this._key && now - this._at < HIST_TTL)) return;
      this._busy = true; this._key = key; this._at = now;
      P.fetchHistory(hass, entityId, hours).then((pts) => {
        this._busy = false;
        if (key !== this._key) return;
        this.points = pts;
        this._onData();
      });
    }
    reset() { this._key = ''; this._at = 0; this.points = []; }
  }

  // ── Editors ───────────────────────────────────────────────────────
  // Profile + stage fields shared by the card and feature editors.
  function stageFields(ed, unit) {
    const p = profile(ed._config);
    const def = { bed: 0, bank: p.bank, max: +p.max.toFixed(2), action: '', flood: '', major: '' };
    const num = (label, key) => numField(ed, label, key, def[key], unit || undefined);
    return [
      ed._section('Creek profile'),
      num('Channel bed (empty creek)', 'bed'),
      num('Bank crest', 'bank'),
      ed._hint('Water spills over the banks exactly at the crest. Defaults to the flood stage.'),
      num('Top of scene (max)', 'max'),
      ed._hint('Highest stage the drawing shows. Defaults to 40% of the channel depth above the crest.'),
      ed._section('Flood stages'),
      num('Action (warning)', 'action'),
      num('Flood', 'flood'),
      num('Major', 'major'),
      ed._hint('Leave a stage blank to hide it. Flood status falls back to the bank crest; the flood line is hidden when it equals the crest.'),
    ];
  }

  // A number field whose placeholder shows the default used when it's blank.
  function numField(ed, label, key, def, suffix) {
    const f = ed._tf(label, ed._config[key], (v) => ed._patch(key, v), { type: 'number', suffix });
    const input = f.querySelector && f.querySelector('input');
    if (input) { input.step = 'any'; input.placeholder = String(def); }
    return f;
  }

  // The water defaults to blue rather than the theme accent, so "theme" has to
  // be stored explicitly — a blank accent would fall back to blue again.
  function accentField(ed) {
    return ed._accentField(ed._config.accent || 'blue', (v) => ed._patch('accent', v || 'theme'));
  }

  // Re-render once the first hass arrives so the unit suffixes can resolve.
  class CreekEditor extends P.PrismEditor {
    set hass(hass) {
      const first = !this._hass;
      super.hass = hass;
      if (first && this._config) this._rerender();
    }
  }

  class PrismCreekCardEditor extends CreekEditor {
    _fields(stack) {
      const c = this._config;
      const unit = P.unitOf(this._hass, c.entity, c.unit);
      stack.append(
        this._titleField(),
        accentField(this),
        this._hint('Water colour.'),
        this._section('Sensor'),
        this._picker('Stage sensor (required)', c.entity, (v) => { this._patch('entity', v); this._rerender(); }, { domains: ['sensor', 'input_number'] }),
        this._tf('Unit override', c.unit, (v) => { this._patch('unit', v); this._rerender(); }),
        this._hint("Leave blank to use the sensor's unit (ft or m)."),
        numField(this, 'Decimals', 'decimals', 1),
        ...stageFields(this, unit),
        this._section('Trend & history'),
        numField(this, 'Trend window', 'trend_hours', 1, 'h'),
        this._hint('The trend is the change per hour over this window of recorder history.'),
        numField(this, 'Peak window', 'peak_hours', 24, 'h'),
        this._section('Display'),
        this._switch('Show trend', c.show_trend !== false, (v) => this._patch('show_trend', v)),
        this._switch('Show peak chip', c.show_peak !== false, (v) => this._patch('show_peak', v)),
        this._switch('Show last updated', c.show_updated !== false, (v) => this._patch('show_updated', v)),
        this._switch('Animate', c.animate !== false, (v) => this._patch('animate', v))
      );
    }
  }
  customElements.define('prism-creek-card-editor', PrismCreekCardEditor);

  class PrismCreekStageFeatureEditor extends CreekEditor {
    set context(ctx) { this._context = ctx; if (this._config) this._rerender(); }
    _fields(stack) {
      const c = this._config;
      const entity = this._context && this._context.entity_id;
      const unit = P.unitOf(this._hass, entity, c.unit);
      stack.append(
        accentField(this),
        numField(this, 'Decimals', 'decimals', 1),
        ...stageFields(this, unit),
        this._section('Trend'),
        numField(this, 'Trend window', 'trend_hours', 1, 'h'),
        this._switch('Show trend', c.show_trend !== false, (v) => this._patch('show_trend', v)),
        this._switch('Animate', c.animate !== false, (v) => this._patch('animate', v))
      );
    }
  }
  customElements.define('prism-creek-stage-feature-editor', PrismCreekStageFeatureEditor);

  // ── Card ──────────────────────────────────────────────────────────
  // The SVG is built once per config and then patched in place, so the wave
  // animation keeps running and the water level eases between readings.
  class PrismCreekCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._built = false;
      this._uid = ++uid;
      this._hist = new HistoryWindow(() => this._update());
    }

    setConfig(config) {
      if (!config || !config.entity) throw new Error('prism-creek-card: `entity` is required.');
      this._config = {
        accent: 'blue', decimals: 1, trend_hours: 1, peak_hours: 24,
        show_trend: true, show_peak: true, show_updated: true, animate: true, ...config,
      };
      this._built = false;
      this._hist.reset();
      if (this._hass) this._render();
    }

    set hass(hass) {
      const prev = this._hass;
      this._hass = hass;
      if (!this._config) return;
      const id = this._config.entity;
      if (!this._built || !prev || prev.states[id] !== hass.states[id] ||
          (prev.themes && prev.themes.darkMode) !== (hass.themes && hass.themes.darkMode)) this._render();
      this._refreshHistory();
    }

    connectedCallback() {
      this._tick = setInterval(() => { this._refreshHistory(); this._update(); }, 30000);
      if (typeof ResizeObserver !== 'undefined') {
        this._ro = new ResizeObserver(() => this._fit());
        this._ro.observe(this);
      }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this._fit());
    }

    disconnectedCallback() {
      clearInterval(this._tick);
      if (this._ro) this._ro.disconnect();
    }

    getCardSize() { return 5; }
    getGridOptions() { return { columns: 12, min_columns: 6, rows: 'auto' }; }

    static getConfigElement() { return document.createElement('prism-creek-card-editor'); }
    static getStubConfig(hass) {
      const ids = hass ? Object.keys(hass.states).filter((id) =>
        id.startsWith('sensor.') && STAGE_UNITS.includes(hass.states[id].attributes.unit_of_measurement)) : [];
      const entity = ids.find((id) => /creek|stage|gage|gauge|river|depth|level/i.test(id)) || ids[0] || 'sensor.creek_stage';
      return { entity, title: 'Creek Stage', bed: 0, bank: 3.2, action: 2 };
    }

    _moreInfo() {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: this._config.entity }, bubbles: true, composed: true,
      }));
    }

    _refreshHistory() {
      const c = this._config;
      if (!c) return;
      const hours = Math.max(
        c.show_trend !== false ? numOr(c.trend_hours, 0) : 0,
        c.show_peak !== false ? numOr(c.peak_hours, 0) : 0
      );
      this._hist.refresh(this._hass, c.entity, hours);
    }

    _render() {
      if (!this._config || !this._hass) return;
      if (!this._built) this._build();
      this._update();
    }

    _build() {
      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          ${CREEK_TOKENS}
          :host { --_accent: ${P.resolveAccent(this._config.accent)}; }
          .prism-card { padding: 0; overflow: hidden; cursor: pointer; }
          .prism-card:focus-visible { outline: 2px solid var(--_accent); outline-offset: -2px; }
          svg.scene { display: block; width: 100%; height: auto; font-family: var(--_font); }
        </style>
        <div class="prism-card" role="button" tabindex="0">${cardSvg(this._uid)}</div>`;
      const root = this.shadowRoot.querySelector('.prism-card');
      P.bindTap(root, () => this._moreInfo(), () => this._moreInfo());
      this._built = true;
    }

    _update() {
      if (!this._built || !this._config || !this._hass) return;
      const c = this._config, hass = this._hass, r = this.shadowRoot;
      const q = (s) => r.querySelector(s);
      const set = (s, txt) => { const el = q(s); if (el) el.textContent = txt; return el; };
      const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };

      const so = hass.states[c.entity];
      const unit = P.unitOf(hass, c.entity, c.unit);
      const d = Math.max(0, Math.round(numOr(c.decimals, 1)));
      const p = profile(c);
      const stage = so ? parseFloat(so.state) : NaN;
      const st = band(stage, p);
      const pts = this._hist.points;

      const root = q('.prism-card');
      if (root && root.classList) {
        root.classList.toggle('dark', !!(hass.themes && hass.themes.darkMode));
        root.classList.toggle('still', c.animate === false);
      }

      set('.title', c.title || 'Creek Stage');
      const water = q('.creek-water');
      if (water) {
        water.style.transform = `translateY(${stageToY(isNaN(stage) ? p.bed : stage, p, G_CARD).toFixed(1)}px)`;
        water.style.opacity = isNaN(stage) ? '0' : '';
      }

      for (const key of ['action', 'flood', 'major']) {
        const g = q(`.th-${key}`);
        if (!g) continue;
        const v = p[key];
        const on = v != null && v >= p.bed && v <= p.max && !(key === 'flood' && v === p.bank);
        show(g, on);
        if (!on) continue;
        g.setAttribute('transform', `translate(0 ${stageToY(v, p, G_CARD).toFixed(1)})`);
        set(`.th-${key} text`, `${key.toUpperCase()} ${fmt(v, d)} ${unit}`.trim());
      }
      set('.crest', `BANK ${fmt(p.bank, d)} ${unit}`.trim());

      set('.value', fmt(stage, d));
      set('.unit', unit);
      const rate = trendRate(pts, stage, numOr(c.trend_hours, 1));
      const tr = set('.trend', trendText(rate, unit, d));
      if (tr) { tr.setAttribute('fill', trendColor(rate)); show(tr, c.show_trend !== false); }

      set('.pill', st.label);
      const pill = q('.pill-bg');
      if (pill) pill.setAttribute('fill', st.color);

      const peakHours = numOr(c.peak_hours, 24);
      show(q('.peak'), c.show_peak !== false && peakHours > 0);
      set('.peak-label', `${peakHours}h peak`);
      set('.peak-val', `${fmt(peakOver(pts, stage, peakHours), d)} ${unit}`.trim());

      const up = set('.updated', updatedText(so));
      show(up, c.show_updated !== false);

      const svg = q('svg.scene');
      if (svg) svg.setAttribute('aria-label', `${c.title || 'Creek stage'} ${fmt(stage, d)} ${unit}, ${st.label.toLowerCase()}`);
      this._fit();
    }

    // Size the pill, threshold labels and peak chip to their text.
    _fit() {
      if (!this._built) return;
      const r = this.shadowRoot, q = (s) => r.querySelector(s);
      const pillText = q('.pill'), pillBg = q('.pill-bg');
      if (pillText && pillBg) {
        const w = textLen(pillText) + 22;
        pillBg.setAttribute('width', w);
        pillBg.setAttribute('x', 384 - w);
        pillText.setAttribute('x', 384 - w / 2);
      }
      for (const key of ['action', 'flood', 'major']) {
        const t = q(`.th-${key} text`), bg = q(`.th-${key} rect`);
        if (!t || !bg) continue;
        const w = textLen(t) + 8;
        bg.setAttribute('width', w);
        bg.setAttribute('x', 378 - w);
      }
      const peakText = q('.peak-text'), peakBg = q('.peak-bg');
      if (peakText && peakBg) peakBg.setAttribute('width', textLen(peakText) + 4 + 20);
    }
  }

  customElements.define('prism-creek-card', PrismCreekCard);
  P.registerCard({
    type: 'prism-creek-card',
    name: 'Prism Creek Card',
    description: 'Creek-stage cross-section: water rises and falls against the bank, with Action / Flood / Major lines, a status pill, trend per hour, and 24h peak.',
  });

  // ── Card feature (under a tile card) ──────────────────────────────
  class PrismCreekStageFeature extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._context = null;
      this._built = false;
      this._uid = ++uid;
      this._hist = new HistoryWindow(() => this._update());
    }

    static getStubConfig() { return { type: 'custom:prism-creek-stage-feature', bed: 0, bank: 3.2, action: 2 }; }
    static getConfigElement() { return document.createElement('prism-creek-stage-feature-editor'); }

    setConfig(config) {
      if (!config) throw new Error('prism-creek-stage-feature: invalid configuration.');
      this._config = { accent: 'blue', decimals: 1, trend_hours: 1, show_trend: true, animate: true, ...config };
      this._built = false;
      this._hist.reset();
      this._render();
    }

    set hass(hass) {
      const prev = this._hass;
      this._hass = hass;
      const id = this._entity();
      if (!this._built || !prev || prev.states[id] !== hass.states[id] ||
          (prev.themes && prev.themes.darkMode) !== (hass.themes && hass.themes.darkMode)) this._render();
      this._refreshHistory();
    }

    // Current HA passes `context`; older releases passed `stateObj`.
    set context(ctx) { this._context = ctx; this._render(); this._refreshHistory(); }
    set stateObj(so) { this._stateObj = so; this._render(); this._refreshHistory(); }
    _entity() {
      return (this._context && this._context.entity_id) || (this._stateObj && this._stateObj.entity_id);
    }

    connectedCallback() { this._tick = setInterval(() => this._refreshHistory(), 60000); }
    disconnectedCallback() { clearInterval(this._tick); }

    _refreshHistory() {
      const c = this._config;
      if (!c || c.show_trend === false) return;
      this._hist.refresh(this._hass, this._entity(), numOr(c.trend_hours, 1));
    }

    _render() {
      if (!this._config || !this._hass || !this._entity()) return;
      if (!this._built) this._build();
      this._update();
    }

    _build() {
      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          ${CREEK_TOKENS}
          :host { --_accent: ${P.resolveAccent(this._config.accent)}; }
          .feat {
            display: flex; align-items: center; box-sizing: border-box;
            height: var(--feature-height, 42px); border-radius: var(--feature-border-radius, 12px);
            background: var(--_surface-2); overflow: hidden; font-family: var(--_font);
            -webkit-font-smoothing: antialiased;
          }
          svg.scene { width: 96px; height: 100%; flex: none; display: block; }
          .txt { flex: 1; min-width: 0; margin-left: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .v { font-size: 17px; font-weight: 750; letter-spacing: -.34px; color: var(--_text); }
          .u { font-size: 12px; font-weight: 500; color: var(--_text-2); margin-left: 3px; }
          .s { font-size: 12px; font-weight: 700; margin-left: 8px; }
          .tr { flex: none; margin: 0 14px 0 8px; font-size: 12px; font-weight: 600; white-space: nowrap; }
        </style>
        <div class="feat">
          ${featureSvg(this._uid)}
          <div class="txt"><span class="v">—</span><span class="u"></span><span class="s"></span></div>
          <div class="tr"></div>
        </div>`;
      this._built = true;
    }

    _update() {
      if (!this._built || !this._config || !this._hass) return;
      const c = this._config, hass = this._hass, r = this.shadowRoot;
      const q = (s) => r.querySelector(s);
      const id = this._entity();
      const so = hass.states[id];
      const unit = P.unitOf(hass, id, c.unit);
      const d = Math.max(0, Math.round(numOr(c.decimals, 1)));
      const p = profile(c);
      const stage = so ? parseFloat(so.state) : NaN;
      const st = band(stage, p);

      const root = q('.feat');
      if (root && root.classList) {
        root.classList.toggle('dark', !!(hass.themes && hass.themes.darkMode));
        root.classList.toggle('still', c.animate === false);
      }
      const water = q('.creek-water');
      if (water) {
        water.style.transform = `translateY(${stageToY(isNaN(stage) ? p.bed : stage, p, G_FEAT).toFixed(1)}px)`;
        water.style.opacity = isNaN(stage) ? '0' : '';
      }
      const line = q('.flood-line');
      if (line) line.setAttribute('transform', `translate(0 ${stageToY(p.flood != null ? p.flood : p.bank, p, G_FEAT).toFixed(1)})`);

      q('.v').textContent = fmt(stage, d);
      q('.u').textContent = unit;
      const s = q('.s');
      s.textContent = st.label;
      s.style.color = st.color;
      const t = trendRate(this._hist.points, stage, numOr(c.trend_hours, 1));
      const tr = q('.tr');
      tr.textContent = c.show_trend === false ? '' : trendText(t, unit, d);
      tr.style.color = trendColor(t);
    }
  }

  customElements.define('prism-creek-stage-feature', PrismCreekStageFeature);
  window.customCardFeatures = window.customCardFeatures || [];
  if (!window.customCardFeatures.some((f) => f.type === 'prism-creek-stage-feature')) {
    const stageUnit = (so) => !!so && STAGE_UNITS.includes(so.attributes && so.attributes.unit_of_measurement);
    window.customCardFeatures.push({
      type: 'prism-creek-stage-feature',
      name: 'Prism creek stage',
      configurable: true,
      isSupported: (hass, context) => stageUnit(hass && context && hass.states[context.entity_id]),
      supported: (stateObj) => stageUnit(stateObj), // pre-2024.8 frontends
    });
  }

  // Exposed for the smoke test.
  P.creek = { profile, stageToY, band, trendRate, peakOver, trendText, G_CARD, G_FEAT };
})();
