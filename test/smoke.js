/**
 * Prism smoke test — runs each card's setConfig + render path under a tiny
 * DOM shim (no browser). Catches runtime errors, bad template interpolation,
 * and history-parsing regressions. Run:  node test/smoke.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ── Minimal DOM shim ───────────────────────────────────────────────
function makeEl() {
  const el = {
    style: { setProperty() {}, display: '' },
    classList: { add() {}, contains() { return false; } },
    dataset: {},
    attributes: {},
    children: [],
    textContent: '', value: '', _html: '',
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    setAttribute() {}, addEventListener() {},
    append() {}, appendChild(c) { this.children.push(c); return c; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    attachShadow() { this.shadowRoot = makeEl(); return this.shadowRoot; },
    dispatchEvent() { return true; },
  };
  return el;
}

global.window = global;
global.HTMLElement = class { attachShadow() { this.shadowRoot = makeEl(); return this.shadowRoot; }
  dispatchEvent() { return true; } addEventListener() {} };
global.customElements = { _d: {}, define(n, c) { this._d[n] = c; }, get(n) { return this._d[n]; } };
global.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };
global.document = {
  createElement() { return makeEl(); },
  createDocumentFragment() { return makeEl(); },
  getElementById() { return null; },
  head: makeEl(), body: makeEl(),
};
global.console.info = () => {};

// ── Load sources in bundle order ───────────────────────────────────
const root = path.join(__dirname, '..');
for (const f of ['src/prism-shared.js', 'src/prism-stat-card.js', 'src/prism-gauge-card.js', 'src/prism-sparkline-card.js', 'src/prism-power-card.js', 'src/prism-bar-card.js', 'src/prism-linear-gauge-card.js', 'src/prism-entities-card.js', 'src/prism-filter-card.js', 'src/prism-switch-card.js', 'src/prism-light-card.js', 'src/prism-climate-card.js', 'src/prism-cover-card.js', 'src/prism-media-card.js', 'src/prism-wind-card.js', 'src/prism-weather-card.js', 'src/prism-forecast-card.js', 'src/prism-sun-card.js', 'src/prism-uv-card.js']) {
  eval(fs.readFileSync(path.join(root, f), 'utf8'));
}

// ── Fixtures ───────────────────────────────────────────────────────
const now = Date.now();
const hist = Array.from({ length: 30 }, (_, i) => ({ s: (60 + Math.sin(i / 3) * 8).toFixed(1), lu: now / 1000 - (30 - i) * 300 }));
const hass = {
  themes: { darkMode: false },
  config: { unit_system: { temperature: '°C' } },
  states: {
    'sensor.x': { state: '61.5', attributes: { friendly_name: 'Test', unit_of_measurement: '%' }, last_changed: new Date(now - 3600000).toISOString(), last_updated: new Date(now - 60000).toISOString() },
    'light.x': { state: 'on', attributes: { friendly_name: 'Lamp' }, last_changed: new Date(now - 120000).toISOString() },
    'light.dim': { state: 'on', attributes: { friendly_name: 'Desk', brightness: 128, supported_color_modes: ['rgb'], rgb_color: [255, 170, 80] } },
    'climate.x': { state: 'heat', attributes: { friendly_name: 'Thermostat', temperature: 21, current_temperature: 19.5, hvac_action: 'heating', min_temp: 7, max_temp: 35, target_temp_step: 0.5 } },
    'cover.x': { state: 'open', attributes: { friendly_name: 'Blinds', current_position: 70, supported_features: 15 } },
    'media_player.x': { state: 'playing', attributes: { friendly_name: 'Speaker', media_title: 'Song', media_artist: 'Artist', volume_level: 0.4, supported_features: 16437 } },
    'weather.x': { state: 'partlycloudy', attributes: { friendly_name: 'Home', temperature: 18, apparent_temperature: 16, temperature_unit: '°C', humidity: 62, pressure: 1013, pressure_unit: 'hPa', wind_speed: 24, wind_bearing: 315, wind_gust_speed: 41, wind_speed_unit: 'km/h', uv_index: 3 } },
    'sensor.wind_dir': { state: 'NW', attributes: { friendly_name: 'Wind Dir' } },
    'sun.sun': { state: 'above_horizon', attributes: { friendly_name: 'Sun', next_rising: new Date(now + 20 * 3600000).toISOString(), next_setting: new Date(now + 6 * 3600000).toISOString(), elevation: 34, azimuth: 210 } },
    'sensor.uv_index': { state: '6.2', attributes: { friendly_name: 'UV Index' } },
    'sensor.eco_temp': { state: '19.4', attributes: { friendly_name: 'Outdoor Temp', unit_of_measurement: '°C' } },
    'sensor.eco_hum': { state: '58', attributes: { friendly_name: 'Outdoor Humidity', unit_of_measurement: '%' } },
    'sensor.eco_wind': { state: '11.7', attributes: { friendly_name: 'Wind', unit_of_measurement: 'mph' } },
    'sensor.eco_dir': { state: '270', attributes: { friendly_name: 'Wind Dir', unit_of_measurement: '°' } },
  },
  callService: () => {},
  callWS: (msg) => {
    if (msg && msg.service === 'get_forecasts') {
      const id = (msg.target && msg.target.entity_id) || 'weather.x';
      return Promise.resolve({ response: { [id]: { forecast: [
        { datetime: new Date(now).toISOString(), condition: 'sunny', temperature: 21, templow: 9, precipitation_probability: 10 },
        { datetime: new Date(now + 86400000).toISOString(), condition: 'rainy', temperature: 16, templow: 11, precipitation_probability: 80 },
        { datetime: new Date(now + 2 * 86400000).toISOString(), condition: 'partlycloudy', temperature: 19, templow: 8 },
      ] } } });
    }
    return Promise.resolve({ 'sensor.x': hist });
  },
};

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}: ${e.message}`); }
}

console.log('PrismUI helpers');
const P = window.PrismUI;
check('version present', () => { if (!P.version) throw new Error('no version'); });
check('resolveAccent preset', () => { if (P.resolveAccent('blue') !== '#3aa0e8') throw new Error('bad'); });
check('resolveAccent theme', () => { if (!P.resolveAccent().includes('var(')) throw new Error('bad'); });
check('resolveAccent hex', () => { if (P.resolveAccent('#abc') !== '#abc') throw new Error('bad'); });
check('fmtNumber', () => { if (P.fmtNumber(1234.5, 1) !== (1234.5).toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1})) throw new Error('bad'); });
check('downsample caps length', () => { const d = P.downsample(Array.from({length:1000},(_,i)=>({t:i,v:i})), 100); if (d.length > 101) throw new Error('len '+d.length); });
check('sparklinePath produces line', () => { const s = P.sparklinePath([{t:0,v:1},{t:1,v:2},{t:2,v:1}], 100, 40); if (!s.line.startsWith('M')) throw new Error('no path'); });
check('sparklinePath flat line safe', () => { const s = P.sparklinePath([{t:0,v:5},{t:1,v:5}], 100, 40); if (!isFinite(s.min)) throw new Error('nan'); });

console.log('fetchHistory');
check('parses compact history', async () => {});
(async () => {
  const pts = await P.fetchHistory(hass, 'sensor.x', 24);
  if (pts.length !== hist.length) throw new Error('len ' + pts.length);
  if (!pts.every(p => typeof p.t === 'number' && typeof p.v === 'number')) throw new Error('shape');
  if (pts[0].t > pts[pts.length - 1].t) throw new Error('not sorted');
  console.log('  ok   fetchHistory shape + sort');

  console.log('Card render paths');
  const cards = [
    ['prism-stat-card', { entity: 'sensor.x', sparkline: true, trend: true, icon: 'mdi:flash' }],
    ['prism-gauge-card', { entity: 'sensor.x', min: 0, max: 100, style: 'fill', segments: [{from:0,color:'red'},{from:50,color:'green'}] }],
    ['prism-gauge-card', { entity: 'sensor.x', min: 0, max: 100, style: 'bands', segments: [{from:0,color:'green'},{from:80,color:'red'}] }],
    ['prism-sparkline-card', { entity: 'sensor.x', hours: 24, style: 'area', show_minmax: true }],
    ['prism-sparkline-card', { entity: 'sensor.x', hours: 24, style: 'line' }],
    ['prism-power-card', { entity: 'sensor.x', mode: 'load', max: 100, peak: true, sparkline: true, energy_entity: 'sensor.x', icon: 'mdi:flash' }],
    ['prism-power-card', { entity: 'sensor.x', mode: 'grid', peak: true, sparkline: true }],
    ['prism-bar-card', { title: 'By circuit', entities: ['sensor.x', { entity: 'sensor.x', name: 'Two', color: 'teal', icon: 'mdi:flash' }], sort: true }],
    ['prism-bar-card', { entities: ['sensor.x'], max: 100, segments: [{ from: 0, color: 'green' }, { from: 80, color: 'red' }] }],
    ['prism-linear-gauge-card', { entity: 'sensor.x', min: 0, max: 100, style: 'fill', segments: [{ from: 0, color: 'green' }, { from: 80, color: 'red' }] }],
    ['prism-linear-gauge-card', { entity: 'sensor.x', min: 0, max: 100, style: 'bands', icon: 'mdi:water', segments: [{ from: 0, color: 'green' }, { from: 60, color: 'amber' }, { from: 85, color: 'red' }] }],
    ['prism-entities-card', { title: 'Room', secondary: 'last-changed', entities: ['sensor.x', { entity: 'light.x', use_area: true }, { entity: 'light.x', name: 'Temp', secondary: 'sensor.x' }] }],
    ['prism-entities-card', { entities: ['sensor.x'], show_icons: false, state_color: false }],
    ['prism-filter-card', { title: 'Lights on', domain: 'light', condition: 'on', secondary: 'area' }],
    ['prism-filter-card', { domain: 'switch', condition: 'off', empty_text: 'All off' }],
    ['prism-filter-card', { domains: ['light', 'sensor'], condition: 'numeric', operator: '>', value: 50, sort: 'state' }],
    ['prism-filter-card', { condition: 'exact', state_is: 'playing', show_count: false }],
    ['prism-filter-card', { title: 'Lights on', domain: 'light', condition: 'on', layout: 'chips' }],
    ['prism-filter-card', { domain: 'sensor', condition: 'numeric', operator: '>', value: 0, layout: 'chips' }],
    ['prism-filter-card', { title: 'By area', domain: 'light', condition: 'on', group_by: 'area' }],
    ['prism-filter-card', { domain: 'light', condition: 'on', group_by: 'area', layout: 'chips', ungrouped_label: 'Other' }],
    ['prism-switch-card', { entity: 'light.x', secondary: 'last-changed' }],
    ['prism-light-card', { entity: 'light.x' }],
    ['prism-light-card', { entity: 'light.dim', use_color: true }],
    ['prism-climate-card', { entity: 'climate.x', title: 'Living Room' }],
    ['prism-cover-card', { entity: 'cover.x' }],
    ['prism-media-card', { entity: 'media_player.x' }],
    ['prism-wind-card', { entity: 'weather.x', title: 'Wind' }],
    ['prism-wind-card', { entity: 'sensor.x', unit: 'm/s', direction_entity: 'sensor.wind_dir', gust_entity: 'sensor.x', animate: false }],
    ['prism-weather-card', { entity: 'weather.x', title: 'Weather' }],
    ['prism-weather-card', { entity: 'weather.x', show_pressure: false, animate: false }],
    ['prism-weather-card', { entity: 'weather.x', temperature_entity: 'sensor.eco_temp', humidity_entity: 'sensor.eco_hum', wind_speed_entity: 'sensor.eco_wind', wind_bearing_entity: 'sensor.eco_dir' }],
    ['prism-forecast-card', { entity: 'weather.x', forecast_type: 'daily', count: 5 }],
    ['prism-forecast-card', { entity: 'weather.x', forecast_type: 'hourly', count: 8, show_precip: false }],
    ['prism-sun-card', { entity: 'sun.sun', title: 'Sun' }],
    ['prism-sun-card', { entity: 'sun.sun', accent: 'orange' }],
    ['prism-uv-card', { entity: 'sensor.uv_index', title: 'UV' }],
    ['prism-uv-card', { entity: 'weather.x', attribute: 'uv_index', show_advice: false }],
  ];
  for (const [tag, cfg] of cards) {
    check(`${tag} (${cfg.style || cfg.mode || (cfg.entities ? cfg.entities.length + ' entities' : (cfg.entity || 'default'))})`, () => {
      const Ctor = customElements.get(tag);
      const el = new Ctor();
      el.setConfig(cfg);
      el._history = P.downsample(P.fetchHistory ? [] : [], 10); // ensure array
      el._history = [{ t: now - 3600000, v: 55 }, { t: now, v: 62 }];
      el.hass = hass;                       // triggers render
      const html = el.shadowRoot._html || (el.shadowRoot.shadowRoot && el.shadowRoot.shadowRoot._html) || '';
      if (!html.includes('prism-card')) throw new Error('render produced no card markup');
    });
  }

  check('missing entity throws', () => {
    const Ctor = customElements.get('prism-stat-card');
    let threw = false;
    try { new Ctor().setConfig({}); } catch (_) { threw = true; }
    if (!threw) throw new Error('should throw on missing entity');
  });

  check('registry populated', () => {
    if (!window.customCards.some(c => c.type === 'prism-gauge-card')) throw new Error('not registered');
  });

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();
