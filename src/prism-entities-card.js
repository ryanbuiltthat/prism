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

  // Area name for an entity: registry area_id, falling back to its device's.
  // Uses the frontend registries (hass.entities/devices/areas); null if none.
  function areaName(hass, entityId) {
    const ent = hass.entities && hass.entities[entityId];
    let areaId = ent && ent.area_id;
    if (!areaId && ent && ent.device_id && hass.devices) {
      const dev = hass.devices[ent.device_id];
      areaId = dev && dev.area_id;
    }
    const area = areaId && hass.areas && hass.areas[areaId];
    return area ? area.name : null;
  }

  // Is a secondary spec an entity id (domain.object) that exists?
  const isEntityRef = (s, hass) => typeof s === 'string' && s.indexOf('.') > -1 && hass.states && hass.states[s];

  // Compact display of an entity's state (+ unit), for secondary lines.
  function stateDisplay(hass, entityId) {
    const s = hass.states[entityId];
    if (!s) return '';
    const r = parseFloat(s.state);
    const unit = s.attributes.unit_of_measurement || '';
    if (isNaN(r)) return titleCase(s.state);
    const dec = Math.abs(r) >= 100 ? 0 : Math.abs(r) >= 10 ? 1 : 2;
    return `${window.PrismUI.fmtNumber(r, dec)}${unit ? ` ${unit}` : ''}`;
  }

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
        else if (r.use_area) o.use_area = true;
        if (r.icon) o.icon = r.icon;
        if (r.secondary) o.secondary = r.secondary;
        const bare = !r.name && !r.use_area && !r.icon && !r.secondary;
        return bare ? (o.entity || o) : o;
      });
      this._fire(cfg);
    }

    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._switch('Show icons', c.show_icons !== false, (v) => this._patch('show_icons', v)),
        this._switch('Colour icon by state', c.state_color !== false, (v) => this._patch('state_color', v)),
        this._select('Secondary line', [
          { value: '', label: 'None' },
          { value: 'last-changed', label: 'Last changed' },
          { value: 'last-updated', label: 'Last updated' },
        ], c.secondary || '', (v) => this._patch('secondary', v)),
        this._section('Entities'),
        this._listField({
          get: () => this._rows(),
          onChange: (rows) => this._setRows(rows),
          addLabel: '+ Add entity',
          row: (row, i, set, body) => {
            body.appendChild(this._picker(`Entity ${i + 1}`, row.entity, (v) => set({ entity: v })));

            // Name source: friendly / area / custom (+ inline custom-name field).
            const nameSrc = row.name ? 'custom' : row.use_area ? 'area' : 'friendly';
            const nameTf = this._tf('Custom name', row.name, (v) => set({ name: v, use_area: undefined }));
            nameTf.style.display = nameSrc === 'custom' ? '' : 'none';
            const nameSel = this._select('Name', [
              { value: 'friendly', label: 'Friendly name' },
              { value: 'area', label: 'Area name' },
              { value: 'custom', label: 'Custom' },
            ], nameSrc, (v) => {
              if (v === 'area') { nameTf.style.display = 'none'; set({ name: undefined, use_area: true }); }
              else if (v === 'custom') {
                const nm = row.name || P.friendlyName(this._hass, this._rows()[i].entity) || '';
                nameTf.value = nm; nameTf.style.display = '';
                set({ use_area: undefined, name: nm });
              } else { nameTf.style.display = 'none'; set({ name: undefined, use_area: undefined }); }
            });
            const nameRow = document.createElement('div'); nameRow.className = 'plist-sub';
            nameRow.append(nameSel, nameTf);

            // Icon + secondary source.
            const iconTf = this._tf('Icon (mdi:…)', row.icon, (v) => set({ icon: v }));
            const sec = row.secondary || '';
            const secIsEntity = sec.indexOf('.') > -1;
            const secPicker = this._picker('Secondary entity', secIsEntity ? sec : '', (v) => set({ secondary: v || undefined }));
            secPicker.style.display = secIsEntity ? '' : 'none';
            const secSel = this._select('Secondary', [
              { value: '', label: 'None' },
              { value: 'last-changed', label: 'Last changed' },
              { value: 'last-updated', label: 'Last updated' },
              { value: '__entity__', label: 'Entity state' },
            ], secIsEntity ? '__entity__' : sec, (v) => {
              if (v === '__entity__') {
                secPicker.style.display = '';
                if (secPicker.value) set({ secondary: secPicker.value });
              } else {
                secPicker.style.display = 'none';
                set({ secondary: v || undefined });
              }
            });
            const iconRow = document.createElement('div'); iconRow.className = 'plist-sub';
            iconRow.append(iconTf, secSel);

            body.append(nameRow, iconRow, secPicker);
          },
        })
      );
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
        const name = row.name
          ? row.name
          : row.use_area
            ? (areaName(hass, row.entity) || (st ? st.attributes.friendly_name : row.entity))
            : (st ? st.attributes.friendly_name : row.entity);
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

        // Secondary line: relative time, another entity's state, or an attribute.
        let secondary = '';
        const sk = row.secondary || c.secondary;
        if (sk === 'last-changed' && st) secondary = relTime(st.last_changed);
        else if (sk === 'last-updated' && st) secondary = relTime(st.last_updated);
        else if (isEntityRef(sk, hass)) secondary = stateDisplay(hass, sk);
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
