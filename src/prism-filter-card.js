/**
 * prism-filter-card
 * A "smart" dynamic list: instead of naming entities one by one, you pick a
 * domain (or several) and a condition, and the card renders every entity that
 * currently matches — e.g. "all lights that are on", "switches that are off",
 * "sensors above 50". The list re-populates itself as state changes.
 *
 * Rows reuse the flat entities-card look: icon · name · secondary · a
 * right-aligned value (or a flat toggle for actionable domains). The header
 * shows a live match count; an empty state shows when nothing matches.
 *
 * type: custom:prism-filter-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const TOGGLE_DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'humidifier', 'siren'];
  const OFF_STATES = ['off', 'unavailable', 'unknown', 'idle', 'closed', 'none', ''];
  // Common domains offered in the editor dropdown (any domain still works via YAML).
  const DOMAIN_OPTIONS = [
    'light', 'switch', 'fan', 'cover', 'lock', 'climate', 'media_player',
    'binary_sensor', 'sensor', 'input_boolean', 'humidifier', 'vacuum',
    'automation', 'script', 'person', 'device_tracker',
  ];

  const domainOf = (id) => (id || '').split('.')[0];
  const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  const isActive = (state) => !OFF_STATES.includes(String(state).toLowerCase());

  // Area for an entity: registry area_id, falling back to its device's.
  function areaOf(hass, entityId) {
    const ent = hass.entities && hass.entities[entityId];
    let areaId = ent && ent.area_id;
    if (!areaId && ent && ent.device_id && hass.devices) {
      const dev = hass.devices[ent.device_id];
      areaId = dev && dev.area_id;
    }
    return areaId || null;
  }
  function areaName(hass, entityId) {
    const areaId = areaOf(hass, entityId);
    const area = areaId && hass.areas && hass.areas[areaId];
    return area ? area.name : null;
  }

  // Compact display of an entity's state (+ unit), for secondary lines.
  function stateDisplay(hass, entityId) {
    const s = hass.states[entityId];
    if (!s) return '';
    const r = parseFloat(s.state);
    const unit = s.attributes.unit_of_measurement || '';
    if (isNaN(r)) return titleCase(s.state);
    const dec = Math.abs(r) >= 100 ? 0 : Math.abs(r) >= 10 ? 1 : 2;
    return `${P.fmtNumber(r, dec)}${unit ? ` ${unit}` : ''}`;
  }

  function relTime(iso) {
    const t = Date.parse(iso);
    if (isNaN(t)) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return 'now';
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }

  // Does an entity's state satisfy the configured condition?
  //   on / off / any                → activity test
  //   numeric ('>','>=','<','<=','=','!=' + value)
  //   exact  (state_is / state_not, case-insensitive)
  function matches(st, cfg) {
    if (!st) return false;
    const cond = cfg.condition || 'on';
    const state = String(st.state).toLowerCase();
    if (cond === 'any') return true;
    if (cond === 'off') return !isActive(st.state);
    if (cond === 'exact') {
      const want = String(cfg.state_is ?? '').toLowerCase();
      const notWant = String(cfg.state_not ?? '').toLowerCase();
      if (want) return state === want;
      if (notWant) return state !== notWant;
      return true;
    }
    if (cond === 'numeric') {
      const v = parseFloat(st.state);
      if (isNaN(v)) return false;
      const n = Number(cfg.value);
      if (isNaN(n)) return true;
      switch (cfg.operator) {
        case '>': return v > n;
        case '>=': return v >= n;
        case '<': return v < n;
        case '<=': return v <= n;
        case '=': return v === n;
        case '!=': return v !== n;
        default: return v > n;
      }
    }
    return isActive(st.state); // 'on' (default)
  }

  // Resolve the config's domain(s) into a lowercase set (empty = any).
  function domainSet(cfg) {
    let list = [];
    if (Array.isArray(cfg.domains)) list = cfg.domains;
    else if (cfg.domains) list = [cfg.domains];
    else if (cfg.domain && cfg.domain !== 'any') list = [cfg.domain];
    return new Set(list.map((d) => String(d).toLowerCase()));
  }

  // Compute the matching, sorted entity ids for the current config + state.
  function computeMatches(hass, cfg) {
    const domains = domainSet(cfg);
    const exclude = new Set((cfg.exclude || []).map(String));
    const wantArea = cfg.area ? String(cfg.area).toLowerCase() : null;
    const out = [];

    for (const id in hass.states) {
      if (exclude.has(id)) continue;
      if (domains.size && !domains.has(domainOf(id))) continue;
      if (wantArea) {
        const aid = areaOf(hass, id);
        const aname = areaName(hass, id);
        if (String(aid || '').toLowerCase() !== wantArea &&
            String(aname || '').toLowerCase() !== wantArea) continue;
      }
      if (!matches(hass.states[id], cfg)) continue;
      out.push(id);
    }

    const nameOf = (id) => P.friendlyName(hass, id);
    if (cfg.sort === 'name' || cfg.sort == null) {
      out.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    } else if (cfg.sort === 'state') {
      out.sort((a, b) => String(hass.states[a].state).localeCompare(String(hass.states[b].state)) || nameOf(a).localeCompare(nameOf(b)));
    } else if (cfg.sort === 'last-changed') {
      out.sort((a, b) => Date.parse(hass.states[b].last_changed) - Date.parse(hass.states[a].last_changed));
    }
    // sort === 'none' → registry/order as encountered

    if (cfg.max && out.length > cfg.max) return out.slice(0, cfg.max);
    return out;
  }

  // ── Editor ────────────────────────────────────────────────────────
  class PrismFilterCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      const cond = c.condition || 'on';

      // Area options from the frontend registry (falls back to none).
      const areaOpts = [{ value: '', label: 'Any area' }];
      if (this._hass && this._hass.areas) {
        Object.values(this._hass.areas)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          .forEach((a) => areaOpts.push({ value: a.area_id, label: a.name || a.area_id }));
      }

      // Condition-dependent controls (numeric operator/value, exact state).
      const opRow = this._select('Operator', [
        { value: '>', label: 'greater than (>)' },
        { value: '>=', label: 'at least (≥)' },
        { value: '<', label: 'less than (<)' },
        { value: '<=', label: 'at most (≤)' },
        { value: '=', label: 'equals (=)' },
        { value: '!=', label: 'not equal (≠)' },
      ], c.operator || '>', (v) => this._patch('operator', v));
      const valTf = this._tf('Value', c.value, (v) => this._patch('value', v), { type: 'number' });
      const numWrap = document.createElement('div'); numWrap.className = 'plist-sub';
      numWrap.append(opRow, valTf);
      numWrap.style.display = cond === 'numeric' ? '' : 'none';

      const exactTf = this._tf('State equals', c.state_is, (v) => this._patch('state_is', v));
      exactTf.style.display = cond === 'exact' ? '' : 'none';

      stack.append(
        this._titleField(),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._section('What to show'),
        this._select('Entity type (domain)', [
          { value: 'any', label: 'Any type' },
          ...DOMAIN_OPTIONS.map((d) => ({ value: d, label: titleCase(d) })),
        ], c.domain || (Array.isArray(c.domains) ? '' : 'any'), (v) => {
          const cfg = { ...this._config };
          delete cfg.domains;
          if (v === 'any') delete cfg.domain; else cfg.domain = v;
          this._fire(cfg);
        }),
        this._select('Condition', [
          { value: 'on', label: 'Is on / active' },
          { value: 'off', label: 'Is off / inactive' },
          { value: 'numeric', label: 'Numeric compare' },
          { value: 'exact', label: 'State equals…' },
          { value: 'any', label: 'Any (all entities)' },
        ], cond, (v) => {
          this._patch('condition', v);
          this._rerender();
        }),
        numWrap,
        exactTf,
        this._select('Area', areaOpts, c.area || '', (v) => this._patch('area', v)),
        this._section('Display'),
        this._select('Layout', [
          { value: 'list', label: 'List (rows)' },
          { value: 'chips', label: 'Chips (grid)' },
        ], c.layout || 'list', (v) => this._patch('layout', v)),
        this._select('Sort', [
          { value: 'name', label: 'Name' },
          { value: 'state', label: 'State' },
          { value: 'last-changed', label: 'Recently changed' },
          { value: 'none', label: 'Unsorted' },
        ], c.sort || 'name', (v) => this._patch('sort', v)),
        this._select('Secondary line', [
          { value: '', label: 'None' },
          { value: 'state', label: 'State' },
          { value: 'area', label: 'Area' },
          { value: 'last-changed', label: 'Last changed' },
          { value: 'last-updated', label: 'Last updated' },
        ], c.secondary || '', (v) => this._patch('secondary', v)),
        this._tf('Max rows (0 = all)', c.max, (v) => this._patch('max', v === '' ? '' : Number(v)), { type: 'number' }),
        this._switch('Show icons', c.show_icons !== false, (v) => this._patch('show_icons', v)),
        this._switch('Colour icon by state', c.state_color !== false, (v) => this._patch('state_color', v)),
        this._switch('Toggles for actionable rows', c.show_toggle !== false, (v) => this._patch('show_toggle', v)),
        this._switch('Show match count', c.show_count !== false, (v) => this._patch('show_count', v)),
        this._tf('Empty text', c.empty_text, (v) => this._patch('empty_text', v)),
        this._hint('Updates automatically as entities change. List: tap a row for more-info, tap the toggle to switch. Chips: tap to toggle (or open more-info), hold for details; the secondary line applies to the list layout only.')
      );
    }
  }
  customElements.define('prism-filter-card-editor', PrismFilterCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismFilterCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._count = 0;
    }

    setConfig(config) {
      this._config = {
        condition: 'on', sort: 'name', layout: 'list', show_icons: true,
        state_color: true, show_toggle: true, show_count: true, ...config,
      };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() {
      const n = Math.max(1, this._count);
      return 1 + (this._config?.layout === 'chips' ? Math.ceil(n / 2) : n);
    }
    getGridOptions() {
      // Chips wrap ~2 per grid column, so they need far fewer rows than a list.
      const n = this._config?.layout === 'chips' ? Math.ceil(Math.max(1, this._count) / 2) : Math.max(1, this._count);
      return { rows: Math.max(2, n + (this._config?.title || this._config?.show_count !== false ? 2 : 1)), columns: 6, min_rows: 2, min_columns: 4 };
    }

    static getConfigElement() { return document.createElement('prism-filter-card-editor'); }
    static getStubConfig() {
      return { title: 'Lights on', domain: 'light', condition: 'on', accent: 'amber', secondary: 'area' };
    }

    _isToggle(domain) {
      return this._config.show_toggle !== false && TOGGLE_DOMAINS.includes(domain);
    }

    _moreInfo(entityId) {
      this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId }, bubbles: true, composed: true,
      }));
    }
    _toggle(entityId) {
      if (this._hass && this._hass.callService) {
        this._hass.callService('homeassistant', 'toggle', { entity_id: entityId });
      }
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const hass = this._hass;
      const accent = P.resolveAccent(c.accent);
      const showIcons = c.show_icons !== false;

      const ids = computeMatches(hass, c);
      this._count = ids.length;

      const rowsHtml = ids.map((id, i) => {
        const st = hass.states[id];
        const domain = domainOf(id);
        const name = P.friendlyName(hass, id);
        const raw = P.num(hass, id);
        const isNum = !isNaN(raw);
        const active = isActive(st.state);
        const isToggle = this._isToggle(domain);

        const icon = (st && st.attributes.icon) || null;
        const iconColor = c.state_color !== false ? (active ? accent : 'var(--_text-2)') : 'var(--_text-2)';
        const iconHtml = showIcons
          ? `<span class="ic" style="color:${iconColor}">${icon ? `<ha-icon icon="${P.esc(icon)}"></ha-icon>` : `<ha-icon icon="${P.esc(defaultIcon(domain))}"></ha-icon>`}</span>`
          : '';

        // Secondary line.
        let secondary = '';
        const sk = c.secondary;
        if (sk === 'state') secondary = titleCase(st.state);
        else if (sk === 'area') secondary = areaName(hass, id) || '';
        else if (sk === 'last-changed') secondary = relTime(st.last_changed);
        else if (sk === 'last-updated') secondary = relTime(st.last_updated);

        // Right side: toggle control or state value.
        let right;
        if (isToggle) {
          right = `<button class="tgl${active ? ' on' : ''}" data-toggle="${P.esc(id)}" role="switch"
                     aria-checked="${active ? 'true' : 'false'}" aria-label="${P.esc(name)}"><span class="knob"></span></button>`;
        } else {
          const unit = P.unitOf(hass, id, null);
          const val = isNum
            ? `${P.esc(P.fmtNumber(raw, Math.abs(raw) >= 100 ? 0 : Math.abs(raw) >= 10 ? 1 : 2))}${unit ? `<span class="u"> ${P.esc(unit)}</span>` : ''}`
            : `${P.esc(titleCase(st.state))}`;
          right = `<span class="val${active ? ' active' : ''}">${val}</span>`;
        }

        return `
          <div class="row" data-entity="${P.esc(id)}" data-i="${i}">
            ${iconHtml}
            <span class="txt">
              <span class="nm">${P.esc(name)}</span>
              ${secondary ? `<span class="sec">${P.esc(secondary)}</span>` : ''}
            </span>
            ${right}
          </div>`;
      }).join('');

      // Chip layout: compact pills that wrap. Toggleable + active entities fill
      // with the accent (so a "lights on" card reads at a glance); sensors show
      // their value inline. Tap toggles (or opens more-info); hold = more-info.
      const chipsHtml = ids.map((id) => {
        const st = hass.states[id];
        const domain = domainOf(id);
        const name = P.friendlyName(hass, id);
        const raw = P.num(hass, id);
        const isNum = !isNaN(raw);
        const active = isActive(st.state);
        const isToggle = this._isToggle(domain);
        const filled = isToggle && active;

        const icon = (st && st.attributes.icon) || defaultIcon(domain);
        const iconColor = filled ? '#fff'
          : (c.state_color !== false ? (active ? accent : 'var(--_text-2)') : 'var(--_text-2)');
        const iconHtml = showIcons
          ? `<span class="cic" style="color:${iconColor}"><ha-icon icon="${P.esc(icon)}"></ha-icon></span>` : '';

        // Trailing value for non-toggle entities (never a bare label for a sensor).
        let cval = '';
        if (!isToggle) {
          const unit = P.unitOf(hass, id, null);
          cval = isNum
            ? `${P.esc(P.fmtNumber(raw, Math.abs(raw) >= 100 ? 0 : Math.abs(raw) >= 10 ? 1 : 2))}${unit ? ` ${P.esc(unit)}` : ''}`
            : P.esc(titleCase(st.state));
        }

        return `
          <button type="button" class="chip${filled ? ' on' : ''}" data-entity="${P.esc(id)}"
                  data-toggle="${isToggle ? '1' : ''}" ${isToggle ? `aria-pressed="${active ? 'true' : 'false'}"` : ''}
                  aria-label="${P.esc(name)}">
            ${iconHtml}
            <span class="cnm">${P.esc(name)}</span>
            ${cval ? `<span class="cval">${cval}</span>` : ''}
          </button>`;
      }).join('');

      const isChips = c.layout === 'chips';
      const count = ids.length;
      const countBadge = c.show_count !== false
        ? `<span class="count">${count}</span>` : '';
      const header = (c.title || c.show_count !== false)
        ? `<div class="prism-head"><div class="prism-title">${P.esc(c.title || '')}</div>${countBadge}</div>`
        : '';
      const empty = c.empty_text || 'Nothing matches';

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; }
          .prism-head { margin-bottom: ${count ? '4px' : '0'}; }
          .count { flex:none; min-width:22px; height:22px; padding:0 7px; border-radius:999px;
                   display:inline-flex; align-items:center; justify-content:center;
                   font-size:12px; font-weight:700; color:#fff; background:${accent}; }
          .rows { display:flex; flex-direction:column; }
          .row { display:flex; align-items:center; gap:12px; padding:10px 0; cursor:pointer;
                 border-top:1px solid var(--_border); }
          .row:first-child { border-top:none; }
          .ic { --mdc-icon-size:22px; width:26px; height:26px; flex:none; display:flex; align-items:center; justify-content:center; }
          .txt { display:flex; flex-direction:column; gap:1px; min-width:0; flex:1; }
          .nm { font-size:14px; font-weight:600; color:var(--_text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .sec { font-size:11px; font-weight:500; color:var(--_text-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .val { font-size:14px; font-weight:600; color:var(--_text-2); white-space:nowrap; flex:none; }
          .val.active { color:var(--_text); }
          .val .u { font-size:11px; font-weight:500; color:var(--_text-2); }
          .tgl { flex:none; width:40px; height:22px; border-radius:999px; border:none; padding:0; cursor:pointer;
                 background:var(--_surface-2); position:relative; transition:background .2s; }
          .tgl .knob { position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%;
                       background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.25); transition:left .2s; }
          .tgl.on { background:${accent}; }
          .tgl.on .knob { left:20px; }
          .chips { display:flex; flex-wrap:wrap; gap:8px; }
          .chip { display:inline-flex; align-items:center; gap:8px; min-width:0; max-width:100%;
                  padding:7px 12px 7px 10px; border-radius:999px; cursor:pointer;
                  border:1px solid var(--_border); background:var(--_surface-2); color:var(--_text);
                  font:inherit; -webkit-user-select:none; user-select:none;
                  transition:background .2s, border-color .2s, color .2s; }
          .chip.on { background:${accent}; border-color:${accent}; color:#fff; }
          .chip .cic { --mdc-icon-size:18px; width:18px; height:18px; flex:none; display:flex; align-items:center; justify-content:center; }
          .chip .cnm { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .chip .cval { font-size:12px; font-weight:600; opacity:.85; white-space:nowrap; flex:none; }
          .empty { padding:14px 0 4px; font-size:13px; font-weight:500; color:var(--_text-2); text-align:center; }
        </style>
        <div class="prism-card">
          ${header}
          ${count
            ? (isChips ? `<div class="chips">${chipsHtml}</div>` : `<div class="rows">${rowsHtml}</div>`)
            : `<div class="empty">${P.esc(empty)}</div>`}
        </div>`;

      if (isChips) {
        this.shadowRoot.querySelectorAll('.chip').forEach((el) => {
          const id = el.dataset.entity;
          const canToggle = el.dataset.toggle === '1';
          P.bindTap(el, () => (canToggle ? this._toggle(id) : this._moreInfo(id)), () => this._moreInfo(id));
        });
      } else {
        this.shadowRoot.querySelectorAll('.row').forEach((el) => {
          el.addEventListener('click', (e) => {
            if (e.target.closest('.tgl')) return; // toggle handles itself
            this._moreInfo(el.dataset.entity);
          });
        });
        this.shadowRoot.querySelectorAll('.tgl').forEach((el) => {
          el.addEventListener('click', (e) => { e.stopPropagation(); this._toggle(el.dataset.toggle); });
        });
      }
    }
  }

  // Sensible default icon when an entity has none set.
  function defaultIcon(domain) {
    const D = {
      light: 'mdi:lightbulb', switch: 'mdi:toggle-switch-variant', fan: 'mdi:fan',
      cover: 'mdi:window-shutter', lock: 'mdi:lock', climate: 'mdi:thermostat',
      media_player: 'mdi:cast', binary_sensor: 'mdi:radiobox-marked', sensor: 'mdi:gauge',
      input_boolean: 'mdi:toggle-switch', humidifier: 'mdi:air-humidifier',
      vacuum: 'mdi:robot-vacuum', automation: 'mdi:robot', script: 'mdi:script-text',
      person: 'mdi:account', device_tracker: 'mdi:crosshairs-gps',
    };
    return D[domain] || 'mdi:card-bulleted-outline';
  }

  customElements.define('prism-filter-card', PrismFilterCard);
  P.registerCard({
    type: 'prism-filter-card',
    name: 'Prism Filter Card',
    description: 'Smart dynamic list — pick a domain + condition (e.g. lights that are on) and it fills itself in.',
  });
})();
