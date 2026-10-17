/**
 * prism-gauge-card
 * Flat 270° radial gauge with configurable severity bands. Two looks:
 *   • fill  (default) — thin track + progress arc coloured by active band
 *   • bands           — full band arc + minimal needle
 * Big centred value, unit, and label underneath.
 *
 * type: custom:prism-gauge-card
 */
(function () {
  'use strict';
  const P = window.PrismUI;

  const START = 225; // math degrees (0 = east, CCW+); arc opens at the bottom
  const SWEEP = 270; // total degrees
  const END = START - SWEEP; // -45

  function pt(cx, cy, r, deg) {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
  }
  // Clockwise arc from a0 down to a1 (a0 > a1).
  function arc(cx, cy, r, a0, a1) {
    const [x0, y0] = pt(cx, cy, r, a0);
    const [x1, y1] = pt(cx, cy, r, a1);
    const large = Math.abs(a0 - a1) > 180 ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  const degAt = (f) => START - P.clamp(f, 0, 1) * SWEEP;

  // ── Editor ────────────────────────────────────────────────────────
  class PrismGaugeCardEditor extends P.PrismEditor {
    _fields(stack) {
      const c = this._config;
      stack.append(
        this._titleField(),
        this._picker('Entity (required)', c.entity, (v) => { this._patch('entity', v); this._rerender(); }),
        this._tf('Name (optional)', c.name, (v) => this._patch('name', v)),
        this._tf('Unit override', c.unit, (v) => this._patch('unit', v)),
        this._tf('Minimum', c.min, (v) => this._patch('min', v), { type: 'number' }),
        this._tf('Maximum', c.max, (v) => this._patch('max', v), { type: 'number' }),
        this._attributeField('Minimum from attribute', c.entity, c.min_attribute, (v) => this._patch('min_attribute', v)),
        this._attributeField('Maximum from attribute', c.entity, c.max_attribute, (v) => this._patch('max_attribute', v)),
        this._hint('A chosen attribute wins whenever it holds a number; Minimum / Maximum are the fallback. With both blank, the entity’s own range attributes (min / max on input_number and number, minimum / maximum on counter) are used, else 0–100.'),
        this._tf('Decimals', c.decimals, (v) => this._patch('decimals', v), { type: 'number' }),
        this._select('Style', ['fill', 'bands'], c.style || 'fill', (v) => { this._patch('style', v); this._rerender(); }),
        ...(c.style === 'bands' ? [this._switch('Show needle', c.needle !== false, (v) => this._patch('needle', v))] : []),
        this._accentField(c.accent, (v) => this._patch('accent', v)),
        this._section('Severity bands'),
        this._hint('JSON array, e.g. [{"from":0,"color":"green"},{"from":60,"color":"amber"},{"from":85,"color":"red"}]. A "from" can also be a percentage of the range, e.g. "60%", so bands follow a min/max that comes from attributes. Colours accept preset names or hex.'),
        this._segmentsField(c.segments)
      );
    }

    _segmentsField(value) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const ta = document.createElement('textarea');
      ta.rows = 5;
      ta.className = 'sel';
      ta.style.fontFamily = 'monospace';
      ta.value = JSON.stringify(value ?? [], null, 2);
      ta.addEventListener('change', (e) => {
        try { this._patch('segments', JSON.parse(e.target.value)); } catch (_) { /* wait for valid JSON */ }
      });
      wrap.appendChild(ta);
      return wrap;
    }
  }
  customElements.define('prism-gauge-card-editor', PrismGaugeCardEditor);

  // ── Card ──────────────────────────────────────────────────────────
  class PrismGaugeCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
    }

    setConfig(config) {
      if (!config.entity) throw new Error('prism-gauge-card: `entity` is required.');
      this._config = { style: 'fill', ...config };
      if (this._hass) this._render();
    }

    set hass(hass) { this._hass = hass; this._render(); }

    getCardSize() { return 4; }
    getGridOptions() { return { rows: 4, columns: 6, min_rows: 3, min_columns: 3 }; }

    static getConfigElement() { return document.createElement('prism-gauge-card-editor'); }
    static getStubConfig(hass) {
      const ent = hass ? Object.keys(hass.states).find((e) => e.startsWith('sensor.')) : 'sensor.example';
      return {
        entity: ent || 'sensor.example', style: 'fill',
        segments: [{ from: 0, color: 'green' }, { from: 60, color: 'amber' }, { from: 85, color: 'red' }],
      };
    }

    // `segs` is already resolved + sorted (P.resolveSegments).
    _segColor(value, segs) {
      if (!segs.length) return P.resolveAccent(this._config.accent);
      let col = P.resolveAccent(segs[0].color);
      for (const s of segs) if (value >= s.from) col = P.resolveAccent(s.color);
      return col;
    }

    _render() {
      if (!this._config || !this._hass) return;
      const c = this._config;
      const hass = this._hass;
      const st = hass.states[c.entity];
      const { min, max } = P.gaugeRange(hass, c);
      const segs = P.resolveSegments(c.segments, min, max);
      const raw = P.num(hass, c.entity);
      const has = !isNaN(raw);
      const frac = has ? P.clamp((raw - min) / (max - min || 1), 0, 1) : 0;
      const unit = P.unitOf(hass, c.entity, c.unit);
      const name = c.name || (st ? st.attributes.friendly_name : c.entity);
      const valColor = this._segColor(raw, segs);
      const value = has ? P.fmtNumber(raw, c.decimals != null ? Number(c.decimals) : (Math.abs(raw) >= 100 ? 0 : 1)) : '—';

      // Geometry sized so the full 270° arc (ends ~0.7·r below centre) fits.
      const W = 200, H = 176, cx = 100, cy = 100, r = 80, tw = 13;
      const track = arc(cx, cy, r, START, END);
      const [lx, ly] = pt(cx, cy, r, START); // lower-left end
      const [rx, ry] = pt(cx, cy, r, END); // lower-right end

      let bandArcs = '';
      if (c.style === 'bands' && segs.length) {
        for (let i = 0; i < segs.length; i++) {
          const f0 = P.clamp((segs[i].from - min) / (max - min || 1), 0, 1);
          const f1 = i < segs.length - 1 ? P.clamp((segs[i + 1].from - min) / (max - min || 1), 0, 1) : 1;
          if (f1 <= f0) continue;
          bandArcs += `<path d="${arc(cx, cy, r, degAt(f0), degAt(f1))}" fill="none"
            stroke="${P.resolveAccent(segs[i].color)}" stroke-width="${tw}" stroke-linecap="butt"/>`;
        }
      }

      // Fill mode: progress arc coloured by active band.
      const fillArc = (c.style !== 'bands' && has && frac > 0)
        ? `<path d="${arc(cx, cy, r, START, degAt(frac))}" fill="none" stroke="${valColor}"
             stroke-width="${tw}" stroke-linecap="round" style="transition:stroke-dashoffset .5s"/>`
        : '';

      // Bands mode: needle. Grey (not the value colour) and starting clear of
      // the hub, so it never reads as part of the centre value. It's drawn
      // before the value text (SVG paints in document order), and the text's
      // surface-coloured halo keeps the digits clean where the needle passes.
      let needle = '';
      if (c.style === 'bands' && c.needle !== false && has) {
        const deg = degAt(frac);
        const [x0, y0] = pt(cx, cy, 30, deg);
        const [x1, y1] = pt(cx, cy, r - tw - 4, deg);
        needle = `<line class="needle" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"
                    stroke-width="3" stroke-linecap="round"/>`;
      }

      this.shadowRoot.innerHTML = `
        <style>
          ${P.TOKEN_STYLE}
          .prism-card { display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; }
          .prism-head { align-self:stretch; }
          svg { width:100%; max-width:230px; height:auto; display:block; }
          .track { stroke: var(--_surface-2); }
          .value { fill: var(--_text); font-weight:750; font-size:34px; letter-spacing:-.5px; }
          .unit { fill: var(--_text-2); font-weight:500; font-size:13px; }
          .value, .unit { paint-order:stroke; stroke:var(--_surface); stroke-width:6px; stroke-linejoin:round; }
          .needle { stroke: var(--_text-2); opacity:.85; }
          .end { fill: var(--_text-2); font-weight:500; font-size:11px; }
          .name { font-size:13px; font-weight:600; color:var(--_text-2); margin-top:4px;
                  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; text-align:center; }
        </style>
        <div class="prism-card" role="button" tabindex="0" aria-label="${P.esc(name)}">
          ${P.titleHead(c.title)}
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
            <path class="track" d="${track}" fill="none" stroke-width="${tw}" stroke-linecap="round"/>
            ${bandArcs}
            ${fillArc}
            ${needle}
            <text class="value" x="${cx}" y="${cy + 2}" text-anchor="middle" dominant-baseline="middle"
                  style="font-family:var(--_font)">${P.esc(value)}</text>
            ${unit ? `<text class="unit" x="${cx}" y="${cy + 26}" text-anchor="middle" style="font-family:var(--_font)">${P.esc(unit)}</text>` : ''}
            <text class="end" x="${(lx - 2).toFixed(0)}" y="${(ly + 14).toFixed(0)}" text-anchor="middle" style="font-family:var(--_font)">${P.esc(P.fmtNumber(min, 0))}</text>
            <text class="end" x="${(rx + 2).toFixed(0)}" y="${(ry + 14).toFixed(0)}" text-anchor="middle" style="font-family:var(--_font)">${P.esc(P.fmtNumber(max, 0))}</text>
          </svg>
          <div class="name">${P.esc(name)}</div>
        </div>`;

      const card = this.shadowRoot.querySelector('.prism-card');
      const tap = () => this.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: c.entity }, bubbles: true, composed: true,
      }));
      card.addEventListener('click', tap);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } });
    }
  }

  customElements.define('prism-gauge-card', PrismGaugeCard);
  P.registerCard({
    type: 'prism-gauge-card',
    name: 'Prism Gauge Card',
    description: 'Flat 270° gauge with severity bands (fill or needle).',
  });
})();
