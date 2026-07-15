/**
 * prism-entities-card
 * Flat entity list: one row per entity — icon, name, optional secondary
 * line, and a right-aligned value (or a flat toggle for actionable
 * domains). Data-first: numeric states are formatted with their unit and
 * kept prominent. Tap a row for more-info; toggles act in place.
 *
 * type: custom:prism-entities-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const TOGGLE_DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'humidifier', 'siren'];
  const OFF_STATES = ['off', 'unavailable', 'unknown', 'idle', 'closed', 'none', ''];

  const domainOf = (id) => (id || '').split('.')[0];
  const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

  function normRow(r) {
    if (typeof r === 'string') return { entity: r };
    return { ...r };
  }

  // Short relative time: "now", "3m", "2h", "4d".
  function relTime(iso) {
    const t = Date.parse(iso);
    if (isNaN(t)) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return 'now';
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }

  // ── Editor ────────────────────────────────────────────────────────
  class PrismEntitiesCardEditor extends P.PrismEditor {
    _rows() {
      const list = Array.isArray(this._config.entities) ? this._config.entities : [];
      return list.map(normRow);
    }

    _setRows(rows) {
      const cfg = { ...this._config };
      cfg.entities = rows.map((r) => {
        const o = { entity: r.entity || '' };
        if (r.name) o.name = r.name;
        if (r.icon) o.icon = r.icon;
        if (r.secondary) o.secondary = r.secondary;
        return r.name || r.icon || r.secondary ? o : (o.entity || o);
      });
      this._fire(cfg);
    }

    _rerender() {
      this._render();
      if (this._hass) this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((p) => { p.hass = this._hass; });
    }

    _fields(stack) {
      const c = this._config;
      stack.append(
        this._tf('Title (optional)', c.title, (v) => this._patch('title', v)),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._switch('Show icons', c.show_icons !== false, (v) => this._patch('show_icons', v)),
        this._switch('Colour icon by state', c.state_color !== false, (v) => this._patch('state_color', v)),
        this._select('Secondary line', [
          { value: '', label: 'None' },
          { value: 'last-changed', label: 'Last changed' },
          { value: 'last-updated', label: 'Last updated' },
        ], c.secondary || '', (v) => this._patch('secondary', v)),
        this._section('Entities'),
        this._rowsField()
      );
    }

    _rowsField() {
      const rows = this._rows();
      const wrap = document.createElement('div');
      wrap.className = 'bars';
      rows.forEach((row, i) => {
        const box = document.createElement('div');
        box.className = 'bar-row';
        box.appendChild(this._picker(`Entity ${i + 1}`, row.entity, (v) => {
          const r = this._rows(); r[i].entity = v; this._setRows(r);
        }));
        const sub = document.createElement('div');
        sub.className = 'bar-sub';
        sub.append(
          this._tf('Name', row.name, (v) => { const r = this._rows(); r[i].name = v; this._setRows(r); }),
          this._tf('Icon (mdi:…)', row.icon, (v) => { const r = this._rows(); r[i].icon = v; this._setRows(r); })
        );
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'rm'; rm.textContent = 'Remove';
        rm.addEventListener('click', () => { const r = this._rows(); r.splice(i, 1); this._setRows(r); this._rerender(); });
        box.append(sub, rm);
        wrap.appendChild(box);
      });
      const add = document.createElement('button');
      add.type = 'button'; add.className = 'add'; add.textContent = '+ Add entity';
      add.addEventListener('click', () => { const r = this._rows(); r.push({ entity: '' }); this._setRows(r); this._rerender(); });
      wrap.appendChild(add);
      return wrap;
    }

    _baseStyle() {
      const style = super._baseStyle();
      style.textContent += `
        .bars { display:flex; flex-direction:column; gap:14px; }
        .bar-row { display:flex; flex-direction:column; gap:8px; padding:12px; border:1px solid var(--divider-color,rgba(0,0,0,.08)); border-radius:8px; }
        .bar-sub { display:flex; gap:8px; }
        .bar-sub > .field { flex:1; }
        .rm { align-self:flex-start; font:500 12px/1 inherit; cursor:pointer; color:var(--error-color,#c62828); background:none; border:none; padding:2px 0; }
        .add { align-self:flex-start; font:600 13px/1 inherit; cursor:pointer; color:var(--primary-color,#3aa0e8); background:none; border:1px dashed var(--divider-color,#ccc); border-radius:8px; padding:10px 14px; }
      `;
      return style;
    }
  }
  customElements.define('prism-entities-card-editor', PrismEntitiesCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismEntitiesCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
    }

    setConfig(config) {
      const list = config.entities;
      if (!Array.isArray(list) || !list.length) {
        throw new Error('prism-entities-card: `entities` must be a non-empty list.');
      }
      this._config = { show_icons: true, state_color: true, ...config, entities: list };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 1 + (this._config?.entities?.length || 1); }
    getGridOptions() {
      const n = this._config?.entities?.length || 1;
      return { rows: Math.max(2, n + (this._config?.title ? 2 : 1)), columns: 6, min_rows: 2, min_columns: 4 };
    }

    static getConfigElement() { return document.createElement('prism-entities-card-editor'); }
    static getStubConfig(hass) {
      const ids = hass ? Object.keys(hass.states).filter((e) => /^(light|switch|sensor)\./.test(e)).slice(0, 4) : [];
      return { title: 'Entities', entities: ids.length ? ids : ['sensor.example'], accent: 'blue' };
    }

    _isToggle(row, domain) {
      if (row.toggle === false) return false;
      if (row.toggle === true) return true;
      return TOGGLE_DOMAINS.includes(domain);
    }

    _isActive(state) {
      return !OFF_STATES.includes(String(state).toLowerCase());
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

      const rowsHtml = c.entities.map(normRow).map((row, i) => {
        const st = hass.states[row.entity];
        const domain = domainOf(row.entity);
        const name = row.name || (st ? st.attributes.friendly_name : row.entity);
        const missing = !st;
        const raw = P.num(hass, row.entity);
        const isNum = !isNaN(raw);
        const active = st && this._isActive(st.state);
        const isToggle = st && this._isToggle(row, domain);

        // Icon: explicit → entity's → domain default handled by ha-icon fallback.
        const icon = row.icon || (st && st.attributes.icon) || null;
        const iconColor = c.state_color !== false ? (active ? accent : 'var(--_text-2)') : 'var(--_text-2)';
        const iconHtml = showIcons
          ? `<span class="ic" style="color:${iconColor}">${icon ? `<ha-icon icon="${P.esc(icon)}"></ha-icon>` : ''}</span>`
          : '';

        // Secondary line.
        let secondary = '';
        const sk = row.secondary || c.secondary;
        if (sk === 'last-changed' && st) secondary = relTime(st.last_changed);
        else if (sk === 'last-updated' && st) secondary = relTime(st.last_updated);
        else if (sk && st && st.attributes[sk] != null) secondary = String(st.attributes[sk]);

        // Right side: toggle control or state value.
        let right;
        if (isToggle) {
          right = `<button class="tgl${active ? ' on' : ''}" data-toggle="${P.esc(row.entity)}" role="switch"
                     aria-checked="${active ? 'true' : 'false'}" aria-label="${P.esc(name)}"><span class="knob"></span></button>`;
        } else {
          const unit = P.unitOf(hass, row.entity, null);
          const val = missing ? '—'
            : isNum ? `${P.esc(P.fmtNumber(raw, Math.abs(raw) >= 100 ? 0 : Math.abs(raw) >= 10 ? 1 : 2))}${unit ? `<span class="u"> ${P.esc(unit)}</span>` : ''}`
            : `${P.esc(titleCase(st.state))}`;
          right = `<span class="val${active ? ' active' : ''}">${val}</span>`;
        }

        return `
          <div class="row${missing ? ' missing' : ''}" data-entity="${P.esc(row.entity)}" data-i="${i}">
            ${iconHtml}
            <span class="txt">
              <span class="nm">${P.esc(name)}</span>
              ${secondary ? `<span class="sec">${P.esc(secondary)}</span>` : ''}
            </span>
            ${right}
          </div>`;
      }).join('');

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; }
          .rows { display:flex; flex-direction:column; }
          .row { display:flex; align-items:center; gap:12px; padding:10px 0; cursor:pointer;
                 border-top:1px solid var(--_border); }
          .row:first-child { border-top:none; }
          .row.missing { opacity:.5; }
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
        </style>
        <div class="prism-card">
          ${c.title ? `<div class="prism-head"><div class="prism-title">${P.esc(c.title)}</div></div>` : ''}
          <div class="rows">${rowsHtml}</div>
        </div>`;

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

  customElements.define('prism-entities-card', PrismEntitiesCard);
  P.registerCard({
    type: 'prism-entities-card',
    name: 'Prism Entities Card',
    description: 'Flat entity list with icons, values, flat toggles, and optional secondary info.',
  });
})();
