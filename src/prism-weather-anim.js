/**
 * prism-weather-anim
 * Animated weather-condition icon set. Exposes `PrismUI.weatherAnim(state)`:
 * given a Home Assistant weather state (as normalized by e.g. the Tomorrow.io
 * integration), it returns the matching inline animated SVG string. Every glyph
 * draws in `currentColor`, so it inherits the container's colour and adapts to
 * light/dark themes seamlessly. Used by the weather (current-conditions) card;
 * the forecast strip keeps the compact `weatherIcon` set.
 *
 * (Helper module — augments PrismUI, defines no card. Loads after prism-shared.)
 */
(function () {
  'use strict';
  const P = window.PrismUI;
  if (!P || P.weatherAnim) return;

  // ── Asset map: normalized condition -> animated SVG (currentColor) ──
  const ASSETS = {
    'clear-day': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .sun-core { transform-origin: 32px 32px; animation: pulse 4s ease-in-out infinite; }
    .sun-rays { transform-origin: 32px 32px; animation: spin 20s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
  </style>
  <g class="sun-rays" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line x1="32" y1="12" x2="32" y2="5" />
    <line x1="32" y1="52" x2="32" y2="59" />
    <line x1="12" y1="32" x2="5" y2="32" />
    <line x1="52" y1="32" x2="59" y2="32" />
    <line x1="18" y1="18" x2="13" y2="13" />
    <line x1="46" y1="46" x2="51" y2="51" />
    <line x1="18" y1="46" x2="13" y2="51" />
    <line x1="46" y1="18" x2="51" y2="13" />
  </g>
  <circle class="sun-core" cx="32" cy="32" r="11" fill="currentColor" />
</svg>`,

    'clear-night': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .moon { transform-origin: 32px 32px; animation: float 6s ease-in-out infinite; }
    .star { animation: twinkle 3s ease-in-out infinite; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-2px); } }
    @keyframes twinkle { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
  </style>
  <path class="moon" fill="currentColor" d="M42 44A16 16 0 1 1 42 20 13 13 0 1 0 42 44Z" />
  <path class="star" fill="currentColor" d="M49 15l1.3 3.4 3.4 1.3-3.4 1.3L49 24l-1.3-2.9-3.4-1.3 3.4-1.3z" />
</svg>`,

    'partly-cloudy': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .sun-core { transform-origin: 32px 24px; animation: pulse 4s ease-in-out infinite; }
    .sun-rays { transform-origin: 32px 24px; animation: spin 20s linear infinite; }
    .cloud { animation: float 6s ease-in-out infinite; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
  </style>
  <g class="sun-rays" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line x1="32" y1="10" x2="32" y2="4" />
    <line x1="32" y1="38" x2="32" y2="44" />
    <line x1="18" y1="24" x2="12" y2="24" />
    <line x1="46" y1="24" x2="52" y2="24" />
    <line x1="22" y1="14" x2="18" y2="10" />
    <line x1="42" y1="34" x2="46" y2="38" />
    <line x1="22" y1="34" x2="18" y2="38" />
    <line x1="42" y1="14" x2="46" y2="10" />
  </g>
  <circle class="sun-core" cx="32" cy="24" r="8" fill="currentColor" />
  <g class="cloud" fill="currentColor">
    <path d="M44 38H22a9 9 0 0 1-.9-17.9 12 12 0 0 1 23.8 1.9A7 7 0 0 1 44 38z" opacity="0.9"/>
  </g>
</svg>`,

    cloudy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud { animation: float 6s ease-in-out infinite; }
    .cloud-2 { animation: float 6s ease-in-out infinite; animation-delay: -3s; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
  </style>
  <path class="cloud-2" fill="currentColor" opacity="0.45" d="M40 25H20a8 8 0 0 1-.8-15.9 11 11 0 0 1 21.2 1.7A6 6 0 0 1 40 25z" />
  <path class="cloud" fill="currentColor" opacity="0.9" d="M44 41H22a9 9 0 0 1-.9-17.9 12 12 0 0 1 23.8 1.9A7 7 0 0 1 44 41z" />
</svg>`,

    rainy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud { animation: float 6s ease-in-out infinite; }
    .rain-1 { animation: fall 1.2s linear infinite; }
    .rain-2 { animation: fall 1.2s linear infinite; animation-delay: 0.4s; }
    .rain-3 { animation: fall 1.2s linear infinite; animation-delay: 0.8s; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
    @keyframes fall { 0% { transform: translateY(0px); opacity: 0; } 50% { opacity: 1; } 100% { transform: translateY(12px); opacity: 0; } }
  </style>
  <g class="cloud" fill="currentColor">
    <path d="M44 34H22a9 9 0 0 1-.9-17.9 12 12 0 0 1 23.8 1.9A7 7 0 0 1 44 34z" opacity="0.9"/>
  </g>
  <g stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line class="rain-1" x1="24" y1="38" x2="22" y2="44" />
    <line class="rain-2" x1="32" y1="38" x2="30" y2="44" />
    <line class="rain-3" x1="40" y1="38" x2="38" y2="44" />
  </g>
</svg>`,

    pouring: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud { animation: float 6s ease-in-out infinite; }
    .r { animation: fall 0.9s linear infinite; }
    .r2 { animation-delay: 0.18s; } .r3 { animation-delay: 0.36s; }
    .r4 { animation-delay: 0.54s; } .r5 { animation-delay: 0.72s; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
    @keyframes fall { 0% { transform: translateY(0px); opacity: 0; } 40% { opacity: 1; } 100% { transform: translateY(14px); opacity: 0; } }
  </style>
  <g class="cloud" fill="currentColor">
    <path d="M44 34H22a9 9 0 0 1-.9-17.9 12 12 0 0 1 23.8 1.9A7 7 0 0 1 44 34z" opacity="0.9"/>
  </g>
  <g stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line class="r" x1="22" y1="38" x2="20" y2="45" />
    <line class="r r2" x1="28" y1="38" x2="26" y2="45" />
    <line class="r r3" x1="34" y1="38" x2="32" y2="45" />
    <line class="r r4" x1="40" y1="38" x2="38" y2="45" />
    <line class="r r5" x1="46" y1="38" x2="44" y2="45" />
  </g>
</svg>`,

    thunderstorm: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud { animation: float 6s ease-in-out infinite; }
    .bolt { animation: flash 2.4s steps(1, end) infinite; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
    @keyframes flash { 0%, 45%, 55%, 100% { opacity: 0.35; } 48%, 52% { opacity: 1; } }
  </style>
  <g class="cloud" fill="currentColor">
    <path d="M44 32H22a9 9 0 0 1-.9-17.9 12 12 0 0 1 23.8 1.9A7 7 0 0 1 44 32z" opacity="0.9"/>
  </g>
  <path class="bolt" fill="currentColor" d="M34 34l-9 14h6l-3 10 11-16h-6l4-8z" />
</svg>`,

    snowy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud { animation: float 6s ease-in-out infinite; }
    .s { animation: sfall 2.6s linear infinite; }
    .s2 { animation-delay: 0.8s; } .s3 { animation-delay: 1.6s; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
    @keyframes sfall { 0% { transform: translateY(0px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(14px); opacity: 0; } }
  </style>
  <g class="cloud" fill="currentColor">
    <path d="M44 34H22a9 9 0 0 1-.9-17.9 12 12 0 0 1 23.8 1.9A7 7 0 0 1 44 34z" opacity="0.9"/>
  </g>
  <g fill="currentColor">
    <circle class="s" cx="24" cy="40" r="2" />
    <circle class="s s2" cx="32" cy="40" r="2" />
    <circle class="s s3" cx="40" cy="40" r="2" />
  </g>
</svg>`,

    fog: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud { animation: float 6s ease-in-out infinite; }
    .f { animation: drift 4s ease-in-out infinite; }
    .f2 { animation-delay: -1.3s; } .f3 { animation-delay: -2.6s; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-2px); } }
    @keyframes drift { 0%, 100% { transform: translateX(-3px); } 50% { transform: translateX(3px); } }
  </style>
  <path class="cloud" fill="currentColor" opacity="0.55" d="M44 30H22a9 9 0 0 1-.9-17.9 12 12 0 0 1 23.8 1.9A7 7 0 0 1 44 30z" />
  <g stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line class="f" x1="16" y1="40" x2="48" y2="40" />
    <line class="f f2" x1="20" y1="47" x2="52" y2="47" />
    <line class="f f3" x1="14" y1="54" x2="44" y2="54" />
  </g>
</svg>`,
  };

  // Home Assistant weather state -> asset key (Tomorrow.io normalizes to these).
  const MAP = {
    sunny: 'clear-day',
    'clear-night': 'clear-night',
    partlycloudy: 'partly-cloudy',
    cloudy: 'cloudy',
    rainy: 'rainy',
    pouring: 'pouring',
    lightning: 'thunderstorm',
    'lightning-rainy': 'thunderstorm',
    snowy: 'snowy',
    'snowy-rainy': 'snowy',
    hail: 'snowy',
    fog: 'fog',
    windy: 'cloudy',
    'windy-variant': 'cloudy',
    exceptional: 'cloudy',
  };

  // Return the animated SVG string for a weather state. `opts.animated: false`
  // strips the <style> block so the glyph renders static. Unknown states fall
  // back to a cloud.
  function weatherAnim(state, opts = {}) {
    const key = MAP[String(state == null ? '' : state).toLowerCase()] || 'cloudy';
    let svg = ASSETS[key] || ASSETS.cloudy;
    if (opts.animated === false) svg = svg.replace(/<style>[\s\S]*?<\/style>/, '');
    return svg;
  }

  P.WEATHER_ANIM = ASSETS;
  P.weatherAnim = weatherAnim;
})();
