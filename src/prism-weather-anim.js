/**
 * prism-weather-anim
 * Full-colour animated weather-condition icon set. Exposes
 * `PrismUI.weatherAnim(state)`: given a Home Assistant weather state (as
 * normalized by e.g. the Tomorrow.io integration) it returns the matching
 * inline animated SVG string. Each glyph carries its own colours (gradients +
 * hex fills/strokes) — not currentColor — so conditions read at a glance.
 * Used by the weather (current-conditions) card; the forecast strip keeps the
 * compact flat `weatherIcon` set.
 *
 * (Helper module — augments PrismUI, defines no card. Loads after prism-shared.)
 */
(function () {
  'use strict';
  const P = window.PrismUI;
  if (!P || P.weatherAnim) return;

  // Snow / hail keep a white fill but gain a faint outline so the flakes stay
  // visible on a white (light-theme) card as well as on dark.
  const ASSETS = {
    'clear-day': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <defs>
    <radialGradient id="sun-grad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFD166" />
      <stop offset="100%" stop-color="#F77F00" />
    </radialGradient>
  </defs>
  <style>
    .sun-core { transform-origin: 32px 32px; animation: pulse 4s ease-in-out infinite; }
    .sun-rays { transform-origin: 32px 32px; animation: spin 20s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
  </style>
  <g class="sun-rays" stroke="#F77F00" stroke-width="2.5" stroke-linecap="round">
    <line x1="32" y1="12" x2="32" y2="5" />
    <line x1="32" y1="52" x2="32" y2="59" />
    <line x1="12" y1="32" x2="5" y2="32" />
    <line x1="52" y1="32" x2="59" y2="32" />
    <line x1="18" y1="18" x2="13" y2="13" />
    <line x1="46" y1="46" x2="51" y2="51" />
    <line x1="18" y1="46" x2="13" y2="51" />
    <line x1="46" y1="18" x2="51" y2="13" />
  </g>
  <circle class="sun-core" cx="32" cy="32" r="11" fill="url(#sun-grad)" />
</svg>`,

    'clear-night': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .moon { transform-origin: 32px 32px; animation: float 6s ease-in-out infinite; }
    .star { animation: twinkle 3s ease-in-out infinite; }
    .star-b { animation: twinkle 3s ease-in-out infinite; animation-delay: 1.2s; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-2px); } }
    @keyframes twinkle { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
  </style>
  <path class="moon" fill="#FFE9A8" d="M42 44A16 16 0 1 1 42 20 13 13 0 1 0 42 44Z" />
  <circle class="star" fill="#FFD166" cx="50" cy="17" r="1.7" />
  <circle class="star-b" fill="#FFD166" cx="46" cy="27" r="1.1" />
</svg>`,

    'partly-cloudy': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <defs>
    <radialGradient id="sun-grad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFD166" />
      <stop offset="100%" stop-color="#F77F00" />
    </radialGradient>
  </defs>
  <style>
    .sun-core { transform-origin: 32px 24px; animation: pulse 4s ease-in-out infinite; }
    .sun-rays { transform-origin: 32px 24px; animation: spin 20s linear infinite; }
    .cloud { animation: float 6s ease-in-out infinite; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
  </style>
  <g class="sun-rays" stroke="#F77F00" stroke-width="2.5" stroke-linecap="round">
    <line x1="32" y1="10" x2="32" y2="4" />
    <line x1="32" y1="38" x2="32" y2="44" />
    <line x1="18" y1="24" x2="12" y2="24" />
    <line x1="46" y1="24" x2="52" y2="24" />
    <line x1="22" y1="14" x2="18" y2="10" />
    <line x1="42" y1="34" x2="46" y2="38" />
    <line x1="22" y1="34" x2="18" y2="38" />
    <line x1="42" y1="14" x2="46" y2="10" />
  </g>
  <circle class="sun-core" cx="32" cy="24" r="8.5" fill="url(#sun-grad)" />
  <g class="cloud">
    <path d="M44 38H22a9 9 0 0 1-.9-17.9 12 12 0 0 1 23.8 1.9A7 7 0 0 1 44 38z" fill="#E2EAF4" />
  </g>
</svg>`,

    cloudy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud { animation: float 6s ease-in-out infinite; }
    .cloud-2 { animation: float 6s ease-in-out infinite; animation-delay: -3s; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
  </style>
  <path class="cloud-2" fill="#C4D2E6" d="M40 25H20a8 8 0 0 1-.8-15.9 11 11 0 0 1 21.2 1.7A6 6 0 0 1 40 25z" />
  <path class="cloud" fill="#E2EAF4" d="M44 41H22a9 9 0 0 1-.9-17.9 12 12 0 0 1 23.8 1.9A7 7 0 0 1 44 41z" />
</svg>`,

    rainy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud { animation: float 6s ease-in-out infinite; }
    .rd { stroke: #4EA8DE; stroke-width: 2.2; stroke-linecap: round; opacity: 0; animation: fall 1.4s linear infinite; }
    .rd2 { animation-delay: 0.45s; } .rd3 { animation-delay: 0.9s; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
    @keyframes fall { 0% { transform: translateY(0px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(12px); opacity: 0; } }
  </style>
  <path class="cloud" fill="#AEB8C4" d="M44 34H22a9 9 0 0 1-.9-17.9 12 12 0 0 1 23.8 1.9A7 7 0 0 1 44 34z" />
  <g>
    <line class="rd" x1="26" y1="38" x2="24" y2="45" />
    <line class="rd rd2" x1="33" y1="38" x2="31" y2="45" />
    <line class="rd rd3" x1="40" y1="38" x2="38" y2="45" />
  </g>
</svg>`,

    pouring: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud-heavy { animation: float-sway 5s ease-in-out infinite; transform-origin: center; }
    .rain-drop { stroke: #4EA8DE; stroke-width: 2.2; stroke-linecap: round; opacity: 0; animation: fall-splash 1.4s linear infinite; }
    .drop-1 { animation-delay: 0.0s; } .drop-2 { animation-delay: 0.3s; } .drop-3 { animation-delay: 0.6s; }
    .drop-4 { animation-delay: 0.2s; } .drop-5 { animation-delay: 0.5s; } .drop-6 { animation-delay: 0.8s; }
    .splash { stroke: #90E0EF; stroke-width: 1.5; fill: none; stroke-linecap: round; opacity: 0; animation: fall-splash 1.4s linear infinite; }
    .splash-1 { animation-delay: 0.2s; } .splash-2 { animation-delay: 0.5s; } .splash-3 { animation-delay: 0.8s; }
    @keyframes float-sway { 0%, 100% { transform: translate(0px, 0px) rotate(0deg); } 25% { transform: translate(1px, -1px) rotate(1deg); } 75% { transform: translate(-1px, -1px) rotate(-1deg); } }
    @keyframes fall-splash { 0% { transform: translateY(0px) scale(1); opacity: 0; } 15% { opacity: 1; } 45% { transform: translateY(15px) scale(1); opacity: 0; } 55% { transform: translateY(15px) scale(1.5); opacity: 0.8; } 70% { transform: translateY(15px) scale(2); opacity: 0; } 100% { transform: translateY(15px) scale(2); opacity: 0; } }
  </style>
  <g class="cloud-heavy" fill="#6C757D">
    <path d="M46 38H20a9.5 9.5 0 0 1 0-19c.7 0 1.4.1 2.1.3a13 13 0 0 1 23.8 1.9 7.5 7.5 0 0 1 0 16.8z" />
  </g>
  <g>
    <line class="rain-drop drop-1" x1="22" y1="40" x2="20" y2="48" />
    <line class="rain-drop drop-2" x1="32" y1="42" x2="30" y2="50" />
    <line class="rain-drop drop-3" x1="42" y1="40" x2="40" y2="48" />
    <line class="rain-drop drop-4" x1="26" y1="46" x2="24" y2="54" />
    <line class="rain-drop drop-5" x1="37" y1="48" x2="35" y2="56" />
    <line class="rain-drop drop-6" x1="46" y1="44" x2="44" y2="52" />
    <path class="splash splash-1" d="M18 54 q 2 -4 4 0 t 4 0" />
    <path class="splash splash-2" d="M28 58 q 2 -4 4 0 t 4 0" />
    <path class="splash splash-3" d="M38 54 q 2 -4 4 0 t 4 0" />
  </g>
</svg>`,

    thunderstorm: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud-storm { transform-origin: 32px 28px; animation: shudder 0.5s ease-in-out infinite; }
    .lightning-bolt { fill: #FFE066; opacity: 0; animation: strobe 2.5s linear infinite; }
    @keyframes shudder { 0%, 100% { transform: translate(0px, 0px) rotate(0deg); } 25% { transform: translate(-1px, 1px) rotate(-0.5deg); } 50% { transform: translate(1px, -1px) rotate(0.5deg); } 75% { transform: translate(-1px, -1px) rotate(0.5deg); } }
    @keyframes strobe { 0%, 4%, 10%, 100% { opacity: 0; } 5%, 8% { opacity: 1; } 12% { opacity: 0; } 15%, 16% { opacity: 1; } }
  </style>
  <g class="cloud-storm" fill="#495057">
    <path d="M48 40H18c-6.6 0-12-5.4-12-12s5.4-12 12-12c.8 0 1.5.1 2.3.2a15.5 15.5 0 0 1 29.4 2.8 9 9 0 0 1 0 17z" />
  </g>
  <path class="lightning-bolt" d="M33 26 l -8 14 h 6 v 10 l 8 -14 h -6 z" />
</svg>`,

    snowy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud-snow { animation: drift 8s ease-in-out infinite; }
    .snow-flake { fill: #FFFFFF; stroke: #B7CBE0; stroke-width: 0.6; transform-origin: center; opacity: 0; animation: snow-fall 3s linear infinite; }
    .flake-1 { animation-delay: 0.0s; } .flake-2 { animation-delay: 0.4s; } .flake-3 { animation-delay: 0.8s; }
    .flake-4 { animation-delay: 1.2s; } .flake-5 { animation-delay: 1.6s; } .flake-6 { animation-delay: 2.0s; }
    @keyframes drift { 0%, 100% { transform: translateX(-2px); } 50% { transform: translateX(2px); } }
    @keyframes snow-fall { 0% { transform: translateY(38px) translateX(0px) rotate(0deg) scale(0.7); opacity: 0; } 15% { opacity: 0.95; } 50% { transform: translateY(48px) translateX(3px) rotate(180deg) scale(1); opacity: 0.95; } 100% { transform: translateY(58px) translateX(-3px) rotate(360deg) scale(0.8); opacity: 0; } }
  </style>
  <g class="cloud-snow" fill="#ADB5BD">
    <path d="M43 37H21c-5.5 0-10-4.5-10-10s4.5-10 10-10c.6 0 1.2 0 1.8.1a13 13 0 0 1 23.8 1.9 7.5 7.5 0 0 1 0 16.8z" />
  </g>
  <g>
    <circle class="snow-flake flake-1" cx="20" cy="0" r="1.8" />
    <circle class="snow-flake flake-2" cx="30" cy="0" r="2.2" />
    <circle class="snow-flake flake-3" cx="40" cy="0" r="1.6" />
    <circle class="snow-flake flake-4" cx="25" cy="0" r="2" />
    <circle class="snow-flake flake-5" cx="35" cy="0" r="1.8" />
    <circle class="snow-flake flake-6" cx="45" cy="0" r="2.2" />
  </g>
</svg>`,

    fog: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud { animation: float 6s ease-in-out infinite; }
    .f { stroke: #ADB5BD; stroke-width: 2.5; stroke-linecap: round; animation: drift 4s ease-in-out infinite; }
    .f2 { animation-delay: -1.3s; } .f3 { animation-delay: -2.6s; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-2px); } }
    @keyframes drift { 0%, 100% { transform: translateX(-3px); } 50% { transform: translateX(3px); } }
  </style>
  <path class="cloud" fill="#C4D2E6" opacity="0.9" d="M44 28H22a9 9 0 0 1-.9-17.9 12 12 0 0 1 23.8 1.9A7 7 0 0 1 44 28z" />
  <g>
    <line class="f" x1="16" y1="38" x2="48" y2="38" />
    <line class="f f2" x1="20" y1="45" x2="52" y2="45" />
    <line class="f f3" x1="14" y1="52" x2="44" y2="52" />
  </g>
</svg>`,

    windy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .wind-line { stroke: #ADB5BD; stroke-width: 2; stroke-linecap: round; fill: none; opacity: 0; animation: gust 1.8s linear infinite; }
    .line-1 { animation-delay: 0.0s; stroke-dasharray: 20 100; }
    .line-2 { animation-delay: 0.3s; stroke-dasharray: 30 100; }
    .line-3 { animation-delay: 0.6s; stroke-dasharray: 25 100; }
    .wind-leaf { fill: #5C946E; opacity: 0; transform-origin: center; animation: leaf-whip 1.8s linear infinite; }
    .leaf-1 { animation-delay: 0.2s; } .leaf-2 { animation-delay: 0.7s; }
    @keyframes gust { 0% { transform: translateX(-25px); opacity: 0; } 25% { opacity: 1; } 75% { opacity: 1; } 100% { transform: translateX(25px); opacity: 0; } }
    @keyframes leaf-whip { 0% { transform: translateX(-30px) translateY(0px) rotate(0deg); opacity: 0; } 20% { opacity: 1; } 50% { transform: translateX(0px) translateY(5px) rotate(180deg); } 80% { opacity: 1; } 100% { transform: translateX(30px) translateY(0px) rotate(360deg); opacity: 0; } }
  </style>
  <g>
    <path class="wind-line line-1" d="M6 18h32" />
    <path class="wind-line line-2" d="M2 32h40" />
    <path class="wind-line line-3" d="M10 46h36" />
  </g>
  <g>
    <path class="wind-leaf leaf-1" d="M28 22c3 0 6 2 6 5s-2 6-5 6-6-2-6-5 2-6 5-6z" />
    <path class="wind-leaf leaf-2" d="M48 36c2 0 4 1.3 4 3.3s-1.3 3.3-3.3 3.3-3.3-1.3-3.3-3.3 1.3-3.3 3.3-3.3z" />
  </g>
</svg>`,

    hail: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <style>
    .cloud-hail { transform-origin: 32px 28px; animation: vibrate 0.3s linear infinite; }
    .hail-stone { fill: #FFFFFF; stroke: #B7CBE0; stroke-width: 0.6; animation: hail-bounce 1.2s cubic-bezier(0.6, -0.2, 0.7, 0.8) infinite; opacity: 0; }
    .stone-1 { animation-delay: 0.0s; } .stone-2 { animation-delay: 0.3s; } .stone-3 { animation-delay: 0.6s; }
    .stone-4 { animation-delay: 0.1s; } .stone-5 { animation-delay: 0.4s; }
    @keyframes vibrate { 0%, 100% { transform: translateX(0px); } 25% { transform: translateX(-1.5px); } 75% { transform: translateX(1.5px); } }
    @keyframes hail-bounce { 0% { transform: translateY(35px); opacity: 0; } 10% { opacity: 1; } 70% { transform: translateY(55px); opacity: 1; } 85% { transform: translateY(53px); opacity: 1; } 100% { transform: translateY(58px); opacity: 0; } }
  </style>
  <g class="cloud-hail" fill="#6C757D">
    <path d="M47 39H17c-6.1 0-11-4.9-11-11s4.9-11 11-11c.7 0 1.4.1 2.1.2a14.5 14.5 0 0 1 27.8 2.5 8 8 0 0 1 0 15.3z" />
  </g>
  <g>
    <circle class="hail-stone stone-1" cx="20" cy="0" r="2.5" />
    <circle class="hail-stone stone-2" cx="30" cy="0" r="3.0" />
    <circle class="hail-stone stone-3" cx="40" cy="0" r="2.5" />
    <circle class="hail-stone stone-4" cx="25" cy="0" r="3.0" />
    <circle class="hail-stone stone-5" cx="35" cy="0" r="2.5" />
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
    hail: 'hail',
    fog: 'fog',
    windy: 'windy',
    'windy-variant': 'windy',
    exceptional: 'thunderstorm',
  };

  // Return the full-colour animated SVG string for a weather state. Unknown
  // states fall back to a cloud.
  function weatherAnim(state) {
    const key = MAP[String(state == null ? '' : state).toLowerCase()] || 'cloudy';
    return ASSETS[key] || ASSETS.cloudy;
  }

  P.WEATHER_ANIM = ASSETS;
  P.weatherAnim = weatherAnim;
})();
