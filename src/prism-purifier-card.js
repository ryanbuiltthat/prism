/**
 * prism-purifier-card
 * Flat air-purifier tile, built around the VeSync / Levoit Core-series model
 * (Core 600S / LAP-C601S, also 200S/300S/400S): a top-down "purifier" disc
 * whose ring glows in Levoit's air-quality colour (blue → green → orange →
 * red) with the PM2.5 reading as the dominant value; an outlet grille that
 * spins faster at higher fan speeds; filter life + an air-quality scale; a
 * power chip; stepped fan-speed buttons; and preset (Auto / Sleep) pills.
 *
 * Sibling sensors (air quality, PM2.5, filter lifetime) are auto-detected
 * from the fan's device, and can be set explicitly.
 *
 * type: custom:prism-purifier-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  // Levoit's ring-light colours, Excellent → Poor (device levels 1–4).
  const LEVELS = [
    { key: 'excellent', label: 'Excellent', color: '#3aa0e8' },
    { key: 'good', label: 'Good', color: '#3aa76d' },
    { key: 'moderate', label: 'Moderate', color: '#e0922e' },
    { key: 'poor', label: 'Poor', color: '#c64b4b' },
  ];
  const UNAVAILABLE = ['unavailable', 'unknown', 'none', ''];

  // Air-quality level index (0–3) from the device's air-quality sensor — a
  // 1–4 number or a word, depending on the integration version — falling back
  // to Levoit's PM2.5 bands. -1 when neither is known.
  function aqLevel(raw, pm) {
    const s = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!UNAVAILABLE.includes(s)) {
      const n = parseFloat(s);
      if (!isNaN(n) && n >= 1 && n <= 4) return Math.round(n) - 1;
      if (/^(excellent|very_good)$/.test(s)) return 0;
      if (s === 'good') return 1;
      if (/^(moderate|fair|medium)$/.test(s)) return 2;
      if (/^(poor|bad|very_poor|unhealthy)$/.test(s)) return 3;
    }
    if (isNaN(pm)) return -1;
    if (pm <= 12) return 0;
    if (pm <= 35) return 1;
    if (pm <= 55) return 2;
    return 3;
  }

  // Number of discrete fan speeds: config override → percentage_step → 4.
  function speedCount(st, override) {
    if (Number(override) > 0) return Math.round(Number(override));
    const step = st && Number(st.attributes.percentage_step);
    return step > 0 && step < 100 ? Math.round(100 / step) : 4;
  }

  // Current speed step (1..count), or 0 when off / no percentage (e.g. auto).
  function speedLevel(st, count) {
    if (!st || st.state !== 'on') return 0;
    const pct = Number(st.attributes.percentage);
    if (!(pct > 0)) return 0;
    return P.clamp(Math.ceil((pct * count) / 100 - 1e-6), 1, count);
  }

  const PRESET_LABELS = {
    auto: 'Auto', sleep: 'Sleep', advanced_sleep: 'Adv. sleep', turbo: 'Turbo',
    pet: 'Pet', normal: 'Normal', manual: 'Manual',
  };
  const presetLabel = (m) => PRESET_LABELS[m] || String(m).replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase());

  // Sibling sensors of the fan: same device in the entity registry, else
  // `sensor.<fan object id>_*` (VeSync names them …_air_quality, …_pm2_5,
  // …_filter_lifetime).
  function discover(hass, fanId) {
    const out = { aq: null, pm25: null, filter: null };
    if (!hass || !fanId) return out;
    const reg = hass.entities || {};
    const dev = reg[fanId] && reg[fanId].device_id;
    let ids = dev ? Object.keys(reg).filter((id) => id.startsWith('sensor.') && reg[id].device_id === dev) : [];
    if (!ids.length) {
      const base = `sensor.${fanId.split('.')[1]}_`;
      ids = Object.keys(hass.states).filter((id) => id.startsWith(base));
    }
    for (const id of ids) {
      const a = (hass.states[id] && hass.states[id].attributes) || {};
      if (!out.pm25 && (a.device_class === 'pm25' || /pm_?2_?5/.test(id))) out.pm25 = id;
      else if (!out.filter && /filter/.test(id)) out.filter = id;
      else if (!out.aq && /air_quality/.test(id)) out.aq = id;
    }
    return out;
  }

  // Outlet-grille spin period (s) by fan state — faster as the fan speeds up.
  function spinPeriod(on, level, count, preset) {
    if (!on) return 0;
    if (level > 0) return Math.round((10 - (8 * level) / count) * 10) / 10; // 1/4 → 8s … 4/4 → 2s
    return preset === 'sleep' || preset === 'advanced_sleep' ? 16 : 7;
  }

  // ── Editor ────────────────────────────────────────────────────────
  class PrismPurifierCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Air purifier (fan entity, required)', c.entity, (v) => this._patch('entity', v), { domains: ['fan'] }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._iconField(c.icon, (v) => this._patch('icon', v)),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._section('Sensors'),
        this._picker('Air quality', c.air_quality_entity, (v) => this._patch('air_quality_entity', v), { domains: ['sensor'] }),
        this._picker('PM2.5', c.pm25_entity, (v) => this._patch('pm25_entity', v), { domains: ['sensor'] }),
        this._picker('Filter lifetime', c.filter_entity, (v) => this._patch('filter_entity', v), { domains: ['sensor'] }),
        this._hint('Leave blank to auto-detect them from the purifier’s device (VeSync: …_air_quality, …_pm2_5, …_filter_lifetime).'),
        this._section('Controls'),
        this._switch('Show fan speed', c.show_speed !== false, (v) => this._patch('show_speed', v)),
        this._switch('Show presets (Auto / Sleep)', c.show_presets !== false, (v) => this._patch('show_presets', v)),
        this._tf('Speed steps (optional)', c.speed_count, (v) => this._patch('speed_count', v), { type: 'number' }),
        this._tf('Filter warning below', c.filter_warn, (v) => this._patch('filter_warn', v), { type: 'number', suffix: '%' }),
        this._switch('Animate', c.animate !== false, (v) => this._patch('animate', v)),
        this._hint('Tap the power chip to toggle, hold for more-info. Speed steps default to the fan’s own (4 on a Core 600S).')
      );
    }
  }
  customElements.define('prism-purifier-card-editor', PrismPurifierCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismPurifierCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._sig = null;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-purifier-card: `entity` is required.');
      if (config.entity.split('.')[0] !== 'fan') throw new Error('prism-purifier-card: entity must be a fan.');
      this._config = { animate: true, show_speed: true, show_presets: true, filter_warn: 20, ...config };
      this._sig = null; // force a rebuild on the next render
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 6; }
    getGridOptions() { return { columns: 12, min_columns: 6, rows: 'auto' }; }

    static getConfigElement() { return document.createElement('prism-purifier-card-editor'); }
    static getStubConfig(hass) {
      const fans = hass ? Object.keys(hass.states).filter((e) => e.startsWith('fan.')) : [];
      const ent = fans.find((e) => /purif|air|levoit|core/i.test(e)) || fans[0];
      return { entity: ent || 'fan.air_purifier' };
    }

    // Configured sensor ids, else auto-detected siblings. Discovery is cached
    // per entity-registry object (HA replaces it only when the registry
    // changes), so it doesn't rescan on every state push.
    _sensors() {
      const c = this._config, reg = this._hass.entities;
      const k = this._disc;
      const d = reg && k && k.reg === reg && k.id === c.entity ? k.d : discover(this._hass, c.entity);
      if (reg) this._disc = { reg, id: c.entity, d };
      return { aq: c.air_quality_entity || d.aq, pm25: c.pm25_entity || d.pm25, filter: c.filter_entity || d.filter };
    }

    _call(service, data = {}) {
      if (this._hass?.callService) this._hass.callService('fan', service, { entity_id: this._config.entity, ...data });
    }
    _moreInfo(id) {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: id || this._config.entity }, bubbles: true, composed: true,
      }));
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config, hass = this._hass;
      const st = hass.states[c.entity];
      const avail = !!st && !UNAVAILABLE.includes(st.state);
      const on = avail && st.state === 'on';
      const accent = P.resolveAccent(c.accent);
      const ids = this._sensors();

      const pm = ids.pm25 ? P.num(hass, ids.pm25) : NaN;
      const aqRaw = ids.aq && hass.states[ids.aq] ? hass.states[ids.aq].state : null;
      const lvl = aqLevel(aqRaw, pm);
      const level = lvl >= 0 ? LEVELS[lvl] : null;
      const ringColor = level ? level.color : 'var(--_text-2)';

      const filter = ids.filter ? P.num(hass, ids.filter) : NaN;
      const warn = Number(c.filter_warn) >= 0 ? Number(c.filter_warn) : 20;
      const fState = isNaN(filter) ? null
        : filter <= 5 ? { txt: 'Replace now', color: 'var(--_bad)' }
        : filter <= warn ? { txt: 'Replace soon', color: 'var(--_warn)' }
        : { txt: 'Good', color: 'var(--_good)' };

      const count = speedCount(st, c.speed_count);
      const speed = speedLevel(st, count);
      const preset = on ? (st.attributes.preset_mode || null) : null;
      const presets = (avail && Array.isArray(st.attributes.preset_modes) ? st.attributes.preset_modes : [])
        .filter((m) => m && m !== 'manual');

      const name = c.name || P.friendlyName(hass, c.entity);
      const icon = c.icon || (st && st.attributes.icon) || 'mdi:air-purifier';
      const status = !avail ? 'Unavailable'
        : !on ? 'Off'
        : preset ? `${presetLabel(preset)} mode`
        : speed ? `Speed ${speed} of ${count}` : 'On';

      const animate = c.animate !== false;
      const period = animate ? spinPeriod(on, speed, count, preset) : 0;
      const pmTxt = isNaN(pm) ? (level ? level.label : '—') : P.fmtNumber(pm, pm < 10 && pm % 1 ? 1 : 0);
      const pmUnit = isNaN(pm) ? 'Air quality' : (P.unitOf(hass, ids.pm25, '') || 'µg/m³');

      // Home Assistant pushes `hass` on every state change anywhere. Rebuild
      // only when something shown here changes, so the spinning grille isn't
      // restarted from frame 0 on every unrelated tick.
      const sig = JSON.stringify([avail, on, lvl, pmTxt, pmUnit, filter, fState && fState.txt, count, speed, preset,
        presets, name, icon, status, period, ids]);
      if (sig === this._sig) return;
      this._sig = sig;

      // ── Purifier disc (viewBox 140) ─────────────────────────────────
      const CX = 70, R = 50;
      let grille = '';
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const x1 = CX + Math.cos(a) * 58, y1 = CX + Math.sin(a) * 58;
        const x2 = CX + Math.cos(a + 0.09) * 66, y2 = CX + Math.sin(a + 0.09) * 66;
        grille += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
      }

      const scale = LEVELS.map((L, i) =>
        `<span class="seg${i === lvl ? ' cur' : ''}" style="background:${L.color}" title="${L.label}"></span>`).join('');

      const speedHtml = c.show_speed !== false && avail ? `
        <div class="speeds" role="group" aria-label="Fan speed">
          ${Array.from({ length: count }, (_, i) => {
            const n = i + 1, h = 8 + Math.round((n / count) * 14);
            return `<button class="sp${on && n <= speed ? ' on' : ''}" data-speed="${n}" aria-label="Speed ${n}" aria-pressed="${on && n === speed}">
              <span class="bar" style="height:${h}px"></span></button>`;
          }).join('')}
        </div>` : '';
      const presetHtml = c.show_presets !== false && presets.length ? `
        <div class="presets">${presets.map((m) =>
          `<button class="pr${m === preset ? ' on' : ''}" data-preset="${P.esc(m)}" aria-pressed="${m === preset}">${P.esc(presetLabel(m))}</button>`).join('')}
        </div>` : '';

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; gap:14px; container-type:inline-size; --_ring:${ringColor}; --_disc:150px; }
          button { font:inherit; color:inherit; border:none; background:none; padding:0; cursor:pointer; }
          button:focus-visible, [tabindex]:focus-visible { outline:2px solid ${accent}; outline-offset:2px; }
          button:disabled { cursor:default; opacity:.5; }

          .head { display:flex; align-items:center; gap:12px; }
          .pw { --mdc-icon-size:22px; width:42px; height:42px; border-radius:50%; flex:none; display:flex;
                align-items:center; justify-content:center; background:var(--_surface-2); color:var(--_text-2);
                transition:background .2s, color .2s; user-select:none; -webkit-user-select:none; }
          .pw.on { background:${accent}; color:#fff; }
          .txt { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
          .nm { font-size:15px; font-weight:650; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .st { font-size:12px; font-weight:550; color:var(--_text-2); }
          .st.on { color:${accent}; }

          .hero { display:flex; align-items:center; gap:22px; }
          .disc { position:relative; width:var(--_disc); height:var(--_disc); flex:none; cursor:pointer; }
          .disc svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
          .grille line { stroke:var(--_ring); stroke-width:2.6; stroke-linecap:round; opacity:${on ? '.5' : '.18'}; }
          .grille { transform-box:view-box; transform-origin:${CX}px ${CX}px;
                    ${period ? `animation:pf-spin ${period}s linear infinite;` : ''} }
          @keyframes pf-spin { to { transform:rotate(360deg); } }
          .halo { fill:none; stroke:var(--_ring); stroke-width:14; opacity:${on ? '.13' : '.05'}; }
          .ring { fill:var(--_surface-2); stroke:var(--_ring); stroke-width:5; opacity:${on ? '1' : '.45'}; transition:stroke .4s; }
          .core { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; }
          .pm { font-size:${isNaN(pm) ? 20 : 38}px; font-weight:750; line-height:1; letter-spacing:-1px; color:var(--_text); }
          .pmu { font-size:11px; font-weight:600; color:var(--_text-2); margin-top:4px; }
          .pml { font-size:10px; font-weight:750; letter-spacing:.08em; text-transform:uppercase; color:var(--_ring); margin-top:2px; }

          .side { display:flex; flex-direction:column; gap:14px; min-width:0; flex:1; }
          .blk { display:flex; flex-direction:column; gap:4px; cursor:pointer; min-width:0; }
          .lbl { font-size:10.5px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:var(--_text-2); white-space:nowrap; }
          .val { display:flex; align-items:baseline; gap:7px; margin-bottom:3px; white-space:nowrap; }
          .big { font-size:22px; font-weight:750; line-height:1.05; letter-spacing:-.5px; color:var(--_text); }
          .big small { font-size:12px; font-weight:650; color:var(--_text-2); margin-left:1px; }
          .big.aqv { font-size:18px; color:var(--_ring); }
          .track { position:relative; height:8px; border-radius:4px; background:var(--_surface-2); overflow:hidden; }
          .track .fill { position:absolute; inset:0 auto 0 0; border-radius:4px; transition:width .4s; }
          .note { font-size:11.5px; font-weight:700; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .scale { display:flex; gap:3px; height:8px; }
          .seg { flex:1; border-radius:3px; opacity:.22; transition:opacity .3s; }
          .seg.cur { opacity:1; }

          .ctl { display:flex; align-items:stretch; gap:8px; flex-wrap:wrap; }
          .speeds { flex:3 1 150px; display:flex; align-items:flex-end; gap:4px; padding:4px; border-radius:12px; background:var(--_surface-2); }
          .sp { flex:1; height:34px; border-radius:8px; display:flex; align-items:flex-end; justify-content:center; padding-bottom:5px; box-sizing:border-box; }
          .sp:hover { background:color-mix(in srgb, var(--_text) 6%, transparent); }
          .sp .bar { width:9px; border-radius:3px; background:var(--_text-2); opacity:.35; transition:background .2s, opacity .2s; }
          .sp.on .bar { background:${accent}; opacity:1; }
          .presets { flex:2 1 100px; display:flex; gap:6px; }
          .pr { flex:1; padding:8px 12px; white-space:nowrap; border-radius:999px; font-size:12px; font-weight:700; background:var(--_surface-2); color:var(--_text-2);
                transition:background .2s, color .2s; }
          .pr.on { background:${accent}; color:#fff; }
          @container (max-width: 300px) {
            .prism-card { --_disc:116px; gap:12px; }
            .hero { gap:14px; }
            .pm { font-size:${isNaN(pm) ? 17 : 32}px; }
          }
        </style>
        <div class="prism-card">
          ${P.titleHead(c.title)}
          <div class="head">
            <div class="pw${on ? ' on' : ''}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${P.esc(name)} power">
              <ha-icon icon="${P.esc(icon)}"></ha-icon>
            </div>
            <div class="txt">
              <span class="nm">${P.esc(name)}</span>
              <span class="st${on ? ' on' : ''}">${P.esc(status)}</span>
            </div>
          </div>

          <div class="hero">
            <div class="disc" role="button" tabindex="0" data-entity="${P.esc(ids.pm25 || ids.aq || c.entity)}"
                 aria-label="PM2.5 ${P.esc(pmTxt)} ${P.esc(pmUnit)}${level ? `, ${P.esc(level.label)}` : ''}">
              <svg viewBox="0 0 140 140" aria-hidden="true">
                <g class="grille">${grille}</g>
                <circle class="halo" cx="${CX}" cy="${CX}" r="${R}"/>
                <circle class="ring" cx="${CX}" cy="${CX}" r="${R}"/>
              </svg>
              <div class="core">
                <span class="pm">${P.esc(pmTxt)}</span>
                ${isNaN(pm) ? '' : `<span class="pmu">${P.esc(pmUnit)}</span><span class="pml">PM2.5</span>`}
              </div>
            </div>
            <div class="side">
              ${fState ? `
                <div class="blk" data-entity="${P.esc(ids.filter)}" role="button" tabindex="0" aria-label="Filter life ${Math.round(filter)}%">
                  <span class="lbl">Filter life</span>
                  <div class="val"><span class="big">${P.fmtNumber(P.clamp(filter, 0, 100), 0)}<small>%</small></span></div>
                  <div class="track"><div class="fill" style="width:${P.clamp(filter, 0, 100)}%;background:${fState.color}"></div></div>
                  <span class="note" style="color:${fState.color}">${fState.txt}</span>
                </div>` : ''}
              <div class="blk" ${ids.aq ? `data-entity="${P.esc(ids.aq)}" role="button" tabindex="0"` : ''} aria-label="Air quality ${level ? level.label : 'unknown'}">
                <span class="lbl">Air quality</span>
                <div class="val"><span class="big aqv">${P.esc(level ? level.label : '—')}</span></div>
                <div class="scale">${scale}</div>
              </div>
            </div>
          </div>

          ${speedHtml || presetHtml ? `<div class="ctl">${speedHtml}${presetHtml}</div>` : ''}
        </div>`;

      const root = this.shadowRoot;
      const pw = root.querySelector('.pw');
      if (avail) P.bindTap(pw, () => this._call('toggle'), () => this._moreInfo());
      else pw.addEventListener('click', () => this._moreInfo());

      root.querySelectorAll('[data-entity]').forEach((el) => {
        const open = () => this._moreInfo(el.dataset.entity);
        el.addEventListener('click', open);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      });

      root.querySelectorAll('.sp').forEach((el) => el.addEventListener('click', () => {
        const n = Number(el.dataset.speed);
        // Optimistic: light the steps now; the next state push confirms it.
        root.querySelectorAll('.sp').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) <= n));
        root.querySelectorAll('.pr').forEach((b) => b.classList.remove('on'));
        this._call('set_percentage', { percentage: Math.round((n * 100) / count) });
      }));
      root.querySelectorAll('.pr').forEach((el) => el.addEventListener('click', () => {
        root.querySelectorAll('.pr').forEach((b) => b.classList.toggle('on', b === el));
        root.querySelectorAll('.sp').forEach((b) => b.classList.remove('on'));
        this._call('set_preset_mode', { preset_mode: el.dataset.preset });
      }));
    }
  }

  customElements.define('prism-purifier-card', PrismPurifierCard);
  P.registerCard({
    type: 'prism-purifier-card',
    name: 'Prism Air Purifier Card',
    description: 'Air-purifier tile (VeSync / Levoit Core): PM2.5 on an air-quality ring, spinning outlet grille, filter life, power, fan speed and presets.',
  });

  // Exposed for the smoke test.
  P.purifier = { aqLevel, speedCount, speedLevel, discover, spinPeriod };
})();
