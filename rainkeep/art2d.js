/*
 * Rainkeep 2D art: hero portraits and foe art. Heroes, the story cast, the ten foe families, the act
 * backdrops and the title have paintings (artmap.js); everything else, and any hero or foe added later,
 * gets art drawn as inline SVG from DATA (hero `look`, foe names and classes). Gradient ids are
 * deterministic per hero / foe so re-rendered HTML stays identical (ui.js diffs HTML strings).
 */
'use strict';
(function () {
  const KH = window.KH;
  const { shade } = KH.u;

  const SKIN = ['#f3d2b3', '#e2b48f', '#c58c63', '#a06a45', '#7a4b2f', '#5a3622'];
  const EYES = ['#4a2c1a', '#3a2412', '#6b4a22', '#2f5a3a', '#7a5a1a'];
  const SCENE = {
    rare: { sky: ['#1f3b5e', '#d99a62'], sun: '#ffe2a8', dunes: ['#6b3f27', '#8a5533'], frame: '#7fb6e6' },
    epic: { sky: ['#2a1c4a', '#d47a6a'], sun: '#ffd0b0', dunes: ['#46263f', '#683650'], frame: '#c39bff' },
    legendary: { sky: ['#5c2a0a', '#ffcf6e'], sun: '#fff4c8', dunes: ['#7a3c14', '#a85a22'], frame: '#ffcf6e' },
  };
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  // shade() returns rgb(); gradients and fills accept it fine.
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };

  // ======================================================================
  // Painted art (artmap.js): one stylesheet of background images, so the HTML that ui.js diffs stays
  // small. Anything without a painting keeps the drawn SVG below.
  // ======================================================================
  const ART = window.RK_ART || {};
  const painted = (kind, id) => !!(ART[kind] && (id == null ? Object.keys(ART[kind]).length : ART[kind][id]));
  (function artSheet() {
    const css = [], url = (v) => `url("${v}")`;
    for (const [k, v] of Object.entries(ART.portrait || {})) css.push(`.art-p-${k}{background-image:${url(v)}}`);
    for (const [k, v] of Object.entries(ART.foe || {})) css.push(`.art-f-${k}{background-image:${url(v)}}`);
    for (const [k, v] of Object.entries(ART.scene || {})) css.push(`#scene.${k} .sc-art{background-image:${url(v)}}`);
    for (const [k, v] of Object.entries(ART.building || {})) css.push(`.art-b-${k}{background-image:${url(v)}}`);
    for (const [k, v] of Object.entries(ART.event || {})) css.push(`.art-e-${k}{background-image:${url(v)}}`);
    for (const [k, v] of Object.entries(ART.offer || {})) css.push(`.art-o-${k}{background-image:${url(v)}}`);
    for (const [k, v] of Object.entries(ART.ruin || {})) css.push(`.art-r-${k}{background-image:${url(v)}}`);
    for (const [k, v] of Object.entries(ART.ending || {})) css.push(`.art-n-${k}{background-image:${url(v)}}`);
    if (ART.title) css.push(`.intro-art.painted{background-image:linear-gradient(#120c1e00 40%,#120c1ee0),${url(ART.title)}}`);
    if (ART.wyrm && ART.wyrm.emblem) css.push(`.medal.painted{background-image:${url(ART.wyrm.emblem)}}`);
    const st = document.createElement('style');
    st.id = 'rk-art'; st.textContent = css.join('\n');
    document.head.appendChild(st);
    // the header medallion wears the wyrm's painted head
    const medal = document.getElementById('hud-medal');
    if (medal && ART.wyrm && ART.wyrm.emblem) medal.classList.add('painted');
  })();

  // ======================================================================
  // Hero portraits
  // ======================================================================
  function hairBack(L, c) {
    if (L.wrap === 'circlet') return `<path d="M30 78 C25 56 29 24 50 20.5 C71 24 75 56 70 78 C66 68 65 58 64 48 L36 48 C35 58 34 68 30 78 Z" fill="${c.hair}"/><path d="M33 70 C31 56 33 40 38 32" stroke="${c.hairL}" stroke-width="1.2" fill="none" opacity=".5"/>`;
    if (L.wrap === 'braid') return `<path d="M36 50 C33 34 40 24 50 23 C60 24 67 34 64 50 Z" fill="${c.hair}"/>`;
    if (L.wrap === 'hood') return `<path d="M27 92 C23 62 26 28 50 18.5 C74 28 77 62 73 92 Z" fill="${c.clothD}"/>`;
    if (L.wrap === 'scarf' || L.wrap === 'veil') return `<path d="M30 84 C27 60 30 26 50 20 C70 26 73 60 70 84 Z" fill="${L.wrap === 'veil' ? c.veilD : c.clothD}"/>`;
    return '';
  }
  function hairFront(L, c, id) {
    const shortHair = `<path d="M36.5 47 C35 31 42 23 50 23 C58 23 65 31 63.5 47 C62 40 60 36 56 33.5 C52 36.5 45 36.5 41 34 C38.5 37 37.5 41 36.5 47 Z" fill="${c.hair}"/><path d="M42 27.5 C46 25.8 53 25.6 58 28" stroke="${c.hairL}" stroke-width="1.1" fill="none" opacity=".55"/>`;
    switch (L.wrap) {
      case 'turban':
        return `<path d="M33 42 C30.5 27 39.5 17 50 17 C60.5 17 69.5 27 67 42 C61 36.5 39 36.5 33 42 Z" fill="url(#${id}-cl)"/>
          <path d="M35.5 34 Q50 25.5 64.5 34 M34 38.5 Q50 31 66 38.5 M38 27 Q50 21.5 62 27" stroke="${c.clothD}" stroke-width="1.1" fill="none" opacity=".75"/>
          <path d="M36 30 Q50 22.5 64 30" stroke="${c.trim}" stroke-width="1.6" fill="none"/>
          <circle cx="50" cy="28.5" r="2.6" fill="${c.trim}"/><circle cx="50" cy="28.5" r="1.3" fill="${c.gem}"/>
          <path d="M66 38 C70 46 70 56 66 64 C65 56 64 48 63 42 Z" fill="${c.clothD}"/>`;
      case 'hood':
        return `<path d="M30 92 C27 62 28 30 50 21 C72 30 73 62 70 92 C66 74 64 60 63 47 C62 33 57 27.5 50 27.5 C43 27.5 38 33 37 47 C36 60 34 74 30 92 Z" fill="url(#${id}-cl)"/>
          <path d="M37 47 C38 33 43 27.5 50 27.5 C57 27.5 62 33 63 47" stroke="${c.clothD}" stroke-width="2.2" fill="none" opacity=".8"/>
          <path d="M33 70 C31 56 32 40 37 30" stroke="${c.trim}" stroke-width="1.2" fill="none" opacity=".7"/>`;
      case 'scarf':
      case 'veil': {
        const f = L.wrap === 'veil' ? c.veil : `url(#${id}-cl)`;
        const coins = L.wrap === 'veil' ? Array.from({ length: 7 }, (_, i) => {
          const a = Math.PI * (0.18 + (i / 6) * 0.64), x = 50 - Math.cos(a) * 13, y = 36.5 - Math.sin(a) * 3.2;
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.05" fill="${c.trim}"/>`;
        }).join('') : '';
        return `<path d="M33.5 52 C31.5 32 40 21.5 50 21.5 C60 21.5 68.5 32 66.5 52 C66.5 62 68.5 72 73 82 L62.5 82 C61 72 62 60 63 47 C62 35 57 29.5 50 29.5 C43 29.5 38 35 37 47 C38 60 39 72 37.5 82 L27 82 C31.5 72 33.5 62 33.5 52 Z" fill="${f}"/>
          <path d="M37 47 C38 35 43 29.5 50 29.5 C57 29.5 62 35 63 47" stroke="${c.trim}" stroke-width="1.5" fill="none"/>
          <path d="M36 66 C35 58 35 50 36.5 44 M64 66 C65 58 65 50 63.5 44" stroke="${L.wrap === 'veil' ? c.veilD : c.clothD}" stroke-width="1" fill="none" opacity=".6"/>${coins}`;
      }
      case 'cap':
        return `${shortHair}<path d="M38 34.5 C38.5 24.5 61.5 24.5 62 34.5 C56 32 44 32 38 34.5 Z" fill="url(#${id}-cl)"/>
          <path d="M38.6 33 C44 31 56 31 61.4 33" stroke="${c.trim}" stroke-width="1.4" fill="none"/><path d="M44 29 l2 -2 2 2 2 -2 2 2 2 -2 2 2" stroke="${c.trim}" stroke-width=".8" fill="none" opacity=".8"/>`;
      case 'helm':
        return `<path d="M34.5 45 C33.5 28 41 19.5 50 19.5 C59 19.5 66.5 28 65.5 45 L62 45 C61 35.5 57 31.5 50 31.5 C43 31.5 39 35.5 38 45 Z" fill="url(#${id}-mt)"/>
          <path d="M35.8 35 C42 30.5 58 30.5 64.2 35" stroke="${c.metalD}" stroke-width="2.4" fill="none"/><path d="M36.2 34 C42 29.6 58 29.6 63.8 34" stroke="${c.metalL}" stroke-width=".8" fill="none"/>
          <path d="M48.7 31 h2.6 v13 l-1.3 2.2 l-1.3 -2.2 Z" fill="${c.metalD}"/>
          <path d="M50 19.5 C53 13 60 11 64 12.5 C59 14 55 17 52 21 Z" fill="${c.trim}"/>
          <circle cx="40" cy="38.5" r=".9" fill="${c.metalL}"/><circle cx="60" cy="38.5" r=".9" fill="${c.metalL}"/>`;
      case 'circlet':
        return `<path d="M37 45 C37 30 43.5 24 50 24 C56.5 24 63 30 63 45 C60 36.5 55.5 32 50 31.5 C44.5 32 40 36.5 37 45 Z" fill="${c.hair}"/>
          <path d="M37.3 38.5 Q50 32.4 62.7 38.5" stroke="${c.trim}" stroke-width="1.7" fill="none"/><path d="M50 32.5 l2.2 2.4 -2.2 2.4 -2.2 -2.4 Z" fill="${c.gem}" stroke="${c.trim}" stroke-width=".6"/>`;
      case 'braid': {
        const knots = Array.from({ length: 6 }, (_, i) => `<ellipse cx="${(61 + i * 1.2).toFixed(1)}" cy="${(60 + i * 5.2).toFixed(1)}" rx="3.2" ry="3" fill="${i % 2 ? c.hair : c.hairL}"/>`).join('');
        return `${knots}<path d="M36.5 46 C36 31 42.5 24 50 24 C57.5 24 64 31 63.5 46 C61 38 57 34 50 33.5 C43 34 39 38 36.5 46 Z" fill="${c.hair}"/>
          <path d="M37 37.5 Q50 31.5 63 37.5" stroke="${c.cloth}" stroke-width="2" fill="none"/><path d="M42 27 C46 25.5 53 25.4 58 27.6" stroke="${c.hairL}" stroke-width="1" fill="none" opacity=".6"/>`;
      }
      case 'goggles':
        return `${shortHair}<path d="M36.6 37.5 Q50 33.5 63.4 37.5" stroke="#3a2a1d" stroke-width="2.2" fill="none"/>
          <circle cx="44" cy="35.8" r="4.1" fill="#8a6a3a" stroke="#d9b06a" stroke-width="1.2"/><circle cx="56" cy="35.8" r="4.1" fill="#8a6a3a" stroke="#d9b06a" stroke-width="1.2"/>
          <circle cx="44" cy="35.8" r="2.7" fill="${c.trim}" opacity=".85"/><circle cx="56" cy="35.8" r="2.7" fill="${c.trim}" opacity=".85"/>
          <circle cx="43" cy="34.8" r=".9" fill="#fff" opacity=".8"/><circle cx="55" cy="34.8" r=".9" fill="#fff" opacity=".8"/>`;
      default:
        return `<path d="M36.5 47 C34.5 30 42 22 50 22 C58.5 22 66 30 63.5 47 C62.5 41 61 37 57.5 34 C54 37.5 47 37 42 33.5 C39.5 37.5 38 41.5 36.5 47 Z" fill="${c.hair}"/>
          <path d="M44 23.5 C42 26 41.5 29 42.5 31 M50 22.5 C49 25 49.5 28 51 30 M56 23.5 C58 26 58 29 57 31" stroke="${c.hairL}" stroke-width="1" fill="none" opacity=".6"/>`;
    }
  }
  function gearBack(cls, c) {
    if (cls === 'none') return '';
    if (cls === 'bow') {
      return `<path d="M19 56 C8 74 9 96 21 110" stroke="#6b4426" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M19 56 C8 74 9 96 21 110" stroke="#a87444" stroke-width="1.2" fill="none" stroke-linecap="round"/>
        <path d="M19 56 L21 110" stroke="#efe2c9" stroke-width=".7"/>
        <path d="M71 64 L80 60 L88 108 L78 110 Z" fill="#5a3a22"/><path d="M71 64 L80 60 L81 66 L72 70 Z" fill="#7a5232"/>
        <path d="M73 63 l-2 -9 M76.5 61.5 l-1 -10 M79.5 60.5 l1 -9" stroke="#d9c7a8" stroke-width="1"/>
        <path d="M70 54 l2 3 -2 1 Z M74.5 51 l2 3 -2 1 Z M80.5 51 l2 3 -2 1 Z" fill="${c.trim}"/>`;
    }
    if (cls === 'lancer') {
      return `<path d="M79 22 L82.5 110" stroke="#6b4426" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M78.6 22 C76 15 77.5 9 80 3.5 C82.8 9 83.6 15 80.8 22 Z" fill="url(#lc-blade)"/><path d="M80 5.5 L80.4 21" stroke="#fff" stroke-width=".6" opacity=".7"/>
        <path d="M77 24.5 h6.5" stroke="${c.trim}" stroke-width="2"/><path d="M78 26 c-1 6 -1 9 0.5 12 M81.5 26 c1 6 1 9 -0.5 12" stroke="${c.cloth}" stroke-width="1.6" fill="none"/>`;
    }
    return `<circle cx="16" cy="92" r="21" fill="url(#${c.id}-mt)"/><circle cx="16" cy="92" r="21" fill="none" stroke="${c.metalD}" stroke-width="2.2"/>
      <circle cx="16" cy="92" r="16" fill="none" stroke="${c.metalL}" stroke-width=".8" opacity=".7"/><circle cx="16" cy="92" r="4.5" fill="${c.metalL}"/>`;
  }
  function gearFront(cls, c) {
    if (cls === 'none') return '';
    if (cls === 'guard') {
      const pad = (dir) => {
        const m = (x) => (dir < 0 ? x : 100 - x);
        return `<path d="M${m(12)} 96 C${m(13)} 84 ${m(23)} 78 ${m(35)} 79.5 L${m(37.5)} 90 C${m(29)} 88 ${m(19)} 91 ${m(12)} 96 Z" fill="url(#${c.id}-mt)"/>
          <path d="M${m(14)} 92 C${m(20)} 87.5 ${m(28)} 85.5 ${m(36)} 86.5" stroke="${c.metalD}" stroke-width="1.2" fill="none"/>
          <circle cx="${m(30)}" cy="83.5" r=".9" fill="${c.metalL}"/><circle cx="${m(22)}" cy="85.5" r=".9" fill="${c.metalL}"/>`;
      };
      return pad(-1) + pad(1);
    }
    if (cls === 'bow') return `<path d="M66 79 L37 110 L43 110 L70 81.5 Z" fill="#5a3a22"/><path d="M66 79 L37 110" stroke="#8a5a32" stroke-width=".8"/><circle cx="58.5" cy="87.5" r="1.6" fill="${c.trim}"/>`;
    return `<path d="M36 78.5 C44 84 58 92 70 110 L60 110 C52 96 42 87 33 82 Z" fill="${c.trim}" opacity=".95"/><path d="M36.5 80.5 C45 86 56 94 65 110" stroke="${c.clothD}" stroke-width=".8" fill="none" opacity=".6"/>`;
  }

  // id: a hero id, or a story character ({ id, rarity, cls, look } from DATA.cast; cls 'none' carries no gear)
  function portrait(id) {
    const d = typeof id === 'object' ? id : KH.HERO[id];
    if (!d) return '';
    const L = d.look || {};
    const sc = SCENE[d.rarity] || SCENE.rare;
    if (painted('portrait', d.id)) {
      return `<svg class="portrait painted art-p-${d.id}" viewBox="0 0 100 110" aria-hidden="true"><rect x="1.2" y="1.2" width="97.6" height="107.6" rx="3" fill="none" stroke="${sc.frame}" stroke-width="1.2" opacity="${d.rarity === 'legendary' ? 0.85 : 0.45}"/></svg>`;
    }
    const skin = SKIN[L.skin || 0];
    const pid = `pt-${d.id || id}`;
    const c = {
      id: pid,
      skin, skinD: shade(skin, -0.22), skinDD: shade(skin, -0.4), skinL: shade(skin, 0.16),
      hair: L.hair || '#2a1a12', hairL: shade(L.hair || '#2a1a12', 0.3),
      cloth: L.cloth || '#8a5a2b', clothD: shade(L.cloth || '#8a5a2b', -0.35), clothL: shade(L.cloth || '#8a5a2b', 0.18),
      trim: L.trim || '#f0c27a', gem: d.rarity === 'legendary' ? '#5fd0ff' : d.rarity === 'epic' ? '#c39bff' : '#7fd6c0',
      veil: mix(L.cloth || '#8a5a2b', '#ffffff', 0.45), veilD: mix(L.cloth || '#8a5a2b', '#000000', 0.15),
      metal: '#c7743a', metalD: '#7a3f1c', metalL: '#ffd0a0',
    };
    const eye = L.eyes || EYES[(Math.max(0, DATA.heroes.indexOf(d)) * 3) % EYES.length];
    const lip = shade(mix(skin, '#b0504a', 0.45).replace(/rgb\((\d+),(\d+),(\d+)\)/, (_, r, g, b) => `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`), -0.1);

    const eyeAt = (x, flip) => {
      if (L.mark === 'patch' && !flip) return '';
      const s = flip ? -1 : 1;
      return `<path d="M${x - 3.2 * s} 48 Q${x} 45.4 ${x + 3.2 * s} 48 Q${x} 50.2 ${x - 3.2 * s} 48 Z" fill="#f6efe4"/>
        <circle cx="${x + 0.1 * s}" cy="48" r="1.75" fill="${eye}"/><circle cx="${x + 0.1 * s}" cy="48" r=".8" fill="#120a06"/><circle cx="${x + 0.7}" cy="47.3" r=".5" fill="#fff"/>
        <path d="M${x - 3.4 * s} 47.9 Q${x} 45 ${x + 3.4 * s} 47.6" stroke="#2a160c" stroke-width="1" fill="none" stroke-linecap="round"/>`;
    };
    const brows = `<path d="M40.8 44.4 Q44.4 42.4 48 43.9" stroke="${c.hair}" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M52 43.9 Q55.6 42.4 59.2 44.4" stroke="${c.hair}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    const beard = L.beard ? `<path d="M37.6 50 C37.6 62 42.5 73.5 50 74.5 C57.5 73.5 62.4 62 62.4 50 C60.6 57.5 57.4 60.8 53.6 61.6 Q50 62.8 46.4 61.6 C42.6 60.8 39.4 57.5 37.6 50 Z" fill="${L.beard}"/>
      <path d="M45.2 59.6 Q50 57.2 54.8 59.6 Q52.3 61 50 60.3 Q47.7 61 45.2 59.6 Z" fill="${L.beard}"/><path d="M43 66 C46 70 54 70 57 66" stroke="${shade(L.beard, 0.25)}" stroke-width=".8" fill="none" opacity=".6"/>` : '';
    const mark = L.mark === 'scar' ? '<path d="M53.5 50.5 L59.5 57.5 M55 55.5 l2 -1.6" stroke="#8a4636" stroke-width="1" stroke-linecap="round"/>'
      : L.mark === 'patch' ? `<path d="M37.5 43.5 L62 39.6" stroke="#1a0f08" stroke-width="1.1"/><ellipse cx="44.5" cy="48" rx="4.3" ry="3.4" fill="#1d120b"/><ellipse cx="43.6" cy="47" rx="1.6" ry=".9" fill="#5a3a26" opacity=".7"/>` : '';
    const legend = d.rarity === 'legendary';

    return `<svg class="portrait" viewBox="0 0 100 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="${pid}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sc.sky[0]}"/><stop offset="1" stop-color="${sc.sky[1]}"/></linearGradient>
        <radialGradient id="${pid}-sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${sc.sun}" stop-opacity=".95"/><stop offset=".45" stop-color="${sc.sun}" stop-opacity=".35"/><stop offset="1" stop-color="${sc.sun}" stop-opacity="0"/></radialGradient>
        <linearGradient id="${pid}-face" x1="0" y1="0" x2="1" y2=".35"><stop offset="0" stop-color="${c.skinL}"/><stop offset=".55" stop-color="${c.skin}"/><stop offset="1" stop-color="${c.skinD}"/></linearGradient>
        <linearGradient id="${pid}-cl" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="${c.clothL}"/><stop offset=".6" stop-color="${c.cloth}"/><stop offset="1" stop-color="${c.clothD}"/></linearGradient>
        <linearGradient id="${pid}-mt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.metalL}"/><stop offset=".45" stop-color="${c.metal}"/><stop offset="1" stop-color="${c.metalD}"/></linearGradient>
        <linearGradient id="lc-blade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9fb0bd"/><stop offset=".5" stop-color="#f4fbff"/><stop offset="1" stop-color="#7d8c99"/></linearGradient>
        <linearGradient id="${pid}-rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${sc.sun}" stop-opacity=".0"/><stop offset=".8" stop-color="${sc.sun}" stop-opacity="0"/><stop offset="1" stop-color="${sc.sun}" stop-opacity=".45"/></linearGradient>
      </defs>
      <rect width="100" height="110" fill="url(#${pid}-sky)"/>
      <circle cx="${legend ? 50 : 70}" cy="${legend ? 50 : 66}" r="${legend ? 44 : 26}" fill="url(#${pid}-sun)"/>
      ${legend ? '' : '<circle cx="16" cy="14" r=".9" fill="#fff" opacity=".55"/><circle cx="30" cy="8" r=".6" fill="#fff" opacity=".45"/><circle cx="86" cy="20" r=".8" fill="#fff" opacity=".5"/>'}
      <path d="M0 74 C14 66 28 66 42 72 C58 64 78 62 100 70 L100 110 L0 110 Z" fill="${sc.dunes[1]}" opacity=".85"/>
      <path d="M0 84 C20 76 36 80 50 84 C66 78 84 76 100 82 L100 110 L0 110 Z" fill="${sc.dunes[0]}"/>
      ${hairBack(L, c)}
      ${gearBack(d.cls, c)}
      <path d="M7 110 C9 89 26 78.5 50 77.5 C74 78.5 91 89 93 110 Z" fill="url(#${pid}-cl)"/>
      <path d="M22 98 C26 92 30 90 33 89 M78 98 C74 92 70 90 67 89 M50 92 L50 110" stroke="${c.clothD}" stroke-width="1.1" fill="none" opacity=".55"/>
      <path d="M43.5 61 L56.5 61 L57.5 78 L42.5 78 Z" fill="${c.skinD}"/>
      <path d="M43.5 66 Q50 71 56.5 66 L56.8 70 Q50 74 43.2 70 Z" fill="${c.skinDD}" opacity=".5"/>
      <path d="M36.5 77.5 Q50 89 63.5 77.5 L61.5 82.5 Q50 92.5 38.5 82.5 Z" fill="${c.trim}"/><path d="M38.5 80 Q50 89.5 61.5 80" stroke="${shade(c.trim, -0.3)}" stroke-width=".7" fill="none"/>
      ${gearFront(d.cls, c)}
      <ellipse cx="36.4" cy="49.5" rx="2.7" ry="4.3" fill="${c.skinD}"/><ellipse cx="63.6" cy="49.5" rx="2.7" ry="4.3" fill="${c.skinD}"/>
      <path d="M37 46 C37 33 43 25.5 50 25.5 C57 25.5 63 33 63 46 C63 56.5 59 64.5 54 68.3 C52 69.8 48 69.8 46 68.3 C41 64.5 37 56.5 37 46 Z" fill="url(#${pid}-face)"/>
      <path d="M61.5 44 C62.5 54 59.5 62 54.5 67" stroke="${c.skinDD}" stroke-width="1.2" fill="none" opacity=".35"/>
      <ellipse cx="42.5" cy="55" rx="3.2" ry="1.8" fill="#e0786a" opacity=".16"/><ellipse cx="57.5" cy="55" rx="3.2" ry="1.8" fill="#e0786a" opacity=".16"/>
      ${eyeAt(44.5, false)}${eyeAt(55.5, true)}${brows}
      <path d="M50.4 48.5 Q49.2 53.8 47.6 56 Q49.8 57.4 52.2 56.4" stroke="${c.skinDD}" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".8"/>
      <path d="M48.2 56.6 Q50 57.3 51.8 56.6" stroke="${c.skinDD}" stroke-width=".7" fill="none" opacity=".5"/>
      ${beard}
      <path d="M46.3 61.2 Q50 63.2 53.7 61.2" stroke="${lip}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <path d="M47.4 62.4 Q50 63.8 52.6 62.4" stroke="${c.skinL}" stroke-width=".7" fill="none" opacity=".5"/>
      ${mark}
      ${hairFront(L, c, pid)}
      <rect width="100" height="110" fill="url(#${pid}-rim)"/>
      <rect x="1.2" y="1.2" width="97.6" height="107.6" rx="3" fill="none" stroke="${sc.frame}" stroke-width="1.2" opacity="${legend ? 0.85 : 0.45}"/>
    </svg>`;
  }

  // ======================================================================
  // Foe art: one illustration per archetype, tinted by class
  // ======================================================================
  const ARCH = [
    [/thirst/i, 'void'],
    [/sunheart|ember throne/i, 'sun'],
    [/saltborn|crystal|husk|salt prison/i, 'crystal'],
    [/drake|wyvern|raven/i, 'drake'],
    [/scorpion|crawler|crab|glassback/i, 'scorpion'],
    [/viper|serpent|sandshark|shark|leviathan/i, 'serpent'],
    [/wraith|mirage|seraph|choir|shade|herald|matron|matriarch|queen|vulture|harp|witch|prophet|storm|shepherd/i, 'spirit'],
    [/golem|colossus|sentinel|titan|tortoise|basalt|behemoth|tomb|cocoon|giant/i, 'construct'],
    [/jackal|hound|lion|oryx|alpha|fox|bear|pack|crocodile|rams\b/i, 'beast'],
  ];
  const CLS_COL = { guard: ['#c27a3a', '#6e3a18'], bow: ['#8a6ad0', '#3d2a6e'], lancer: ['#2fa89a', '#155a52'] };
  function archetype(name) {
    for (const [re, a] of ARCH) if (re.test(name)) return a;
    return 'raider';
  }
  function foe(f, cls = 'b-enemy') {
    const a = archetype(f.name || '');
    const [col, colD] = CLS_COL[f.cls] || CLS_COL.guard;
    const eye = f.boss ? '#ff5a2a' : '#ffe08a';
    if (painted('foe', a)) {
      const crown = f.boss && a !== 'sun' && a !== 'void' ? '<path d="M44 4 L49 13 L54 1 L60 11 L66 1 L71 13 L76 4 L74 17 L46 17 Z" fill="#ffcf6e" stroke="#a8641c" stroke-width="1"/><circle cx="60" cy="11.5" r="1.8" fill="#ff5a2a"/>' : '';
      return `<svg class="${cls} painted art-f-${a}${f.boss ? ' boss' : ''}" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${f.boss ? 57.5 : 58}" fill="none" stroke="${f.boss ? '#ffcf6e' : col}" stroke-width="${f.boss ? 3.5 : 2.5}"/>${crown}</svg>`;
    }
    const fid = `fo-${a}-${f.cls}-${f.boss ? 'b' : 'n'}`;
    const defs = `<defs><radialGradient id="${fid}-g" cx=".5" cy=".55" r=".55"><stop offset="0" stop-color="${f.boss ? '#ff7a3c' : col}" stop-opacity=".45"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>
      <linearGradient id="${fid}-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(col, 0.25)}"/><stop offset=".55" stop-color="${col}"/><stop offset="1" stop-color="${colD}"/></linearGradient></defs>`;
    let body;
    switch (a) {
      case 'sun':
        body = `<circle cx="60" cy="62" r="38" fill="#ff8a2a" opacity=".25"/><circle cx="60" cy="62" r="30" fill="#ffb347"/><circle cx="60" cy="62" r="22" fill="#fff0b0"/>
          <path d="M44 48 L56 60 L50 72 M70 44 L64 58 L76 66 M58 80 L62 70" stroke="#c2410c" stroke-width="2.4" fill="none" stroke-linecap="round"/>
          ${Array.from({ length: 12 }, (_, i) => { const t = (i / 12) * Math.PI * 2; return `<path d="M${60 + Math.cos(t) * 33} ${62 + Math.sin(t) * 33} L${60 + Math.cos(t + 0.13) * 46} ${62 + Math.sin(t + 0.13) * 46} L${60 + Math.cos(t + 0.26) * 33} ${62 + Math.sin(t + 0.26) * 33}" fill="#ff9a3a"/>`; }).join('')}`;
        break;
      case 'void': // the Thirst: a hole where water should be, ringed with dry cracks
        body = `<circle cx="60" cy="62" r="44" fill="#1a0e08" opacity=".55"/><circle cx="60" cy="62" r="34" fill="#0b0605"/>
          ${Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * Math.PI * 2 + 0.3; return `<path d="M${(60 + Math.cos(a) * 34).toFixed(1)} ${(62 + Math.sin(a) * 34).toFixed(1)} L${(60 + Math.cos(a + 0.12) * 48).toFixed(1)} ${(62 + Math.sin(a + 0.12) * 48).toFixed(1)} L${(60 + Math.cos(a - 0.05) * 54).toFixed(1)} ${(62 + Math.sin(a - 0.05) * 54).toFixed(1)}" stroke="#8a5a32" stroke-width="1.6" fill="none" opacity=".8"/>`; }).join('')}
          <circle cx="60" cy="62" r="26" fill="none" stroke="#3a2418" stroke-width="3" opacity=".8"/><circle cx="60" cy="62" r="17" fill="none" stroke="#2a1810" stroke-width="2"/>
          <path d="M42 70 Q60 84 78 70 Q60 78 42 70 Z" fill="#e8d8b8" opacity=".85"/>
          <ellipse cx="50" cy="54" rx="3" ry="1.6" fill="#e8d8b8"/><ellipse cx="70" cy="54" rx="3" ry="1.6" fill="#e8d8b8"/>`;
        break;
      case 'crystal':
        body = `<path d="M34 106 L40 66 L30 40 L46 52 L52 20 L60 46 L70 14 L74 50 L90 34 L82 70 L88 106 Z" fill="url(#${fid}-b)"/>
          <path d="M52 20 L60 46 L56 60 Z M70 14 L74 50 L66 58 Z M30 40 L46 52 L42 62 Z M90 34 L82 70 L76 60 Z" fill="#f4fbff" opacity=".5"/>
          <path d="M40 66 L60 74 L82 70 M46 90 L60 82 L76 92" stroke="#ffffff" stroke-width="1.2" fill="none" opacity=".45"/>
          <path d="M44 62 C50 58 70 58 76 62 L74 72 C66 76 54 76 46 72 Z" fill="#0d1a24" opacity=".75"/>
          <ellipse cx="53" cy="67" rx="3.6" ry="2.2" fill="${eye}"/><ellipse cx="67" cy="67" rx="3.6" ry="2.2" fill="${eye}"/>
          <path d="M26 106 L22 92 L30 96 Z M94 106 L98 90 L90 96 Z" fill="${colD}"/>`;
        break;
      case 'drake':
        body = `<path d="M56 60 C40 40 20 30 4 34 C14 40 18 46 18 54 C26 50 34 52 40 58 C30 58 24 64 22 72 C34 66 46 66 56 70 Z" fill="${colD}"/>
          <path d="M64 60 C80 40 100 30 116 34 C106 40 102 46 102 54 C94 50 86 52 80 58 C90 58 96 64 98 72 C86 66 74 66 64 70 Z" fill="${colD}"/>
          <path d="M18 54 L40 58 M102 54 L80 58" stroke="${shade(col, 0.3)}" stroke-width="1.2" opacity=".6"/>
          <path d="M44 104 C40 86 46 70 60 66 C74 70 80 86 76 104 Z" fill="url(#${fid}-b)"/>
          <path d="M60 66 C58 52 56 40 60 30 C64 40 62 52 60 66 Z" fill="url(#${fid}-b)"/>
          <path d="M60 30 C50 28 46 20 50 12 C56 16 64 16 70 12 C74 20 70 28 60 30 Z" fill="url(#${fid}-b)"/>
          <path d="M50 12 L44 4 L52 9 Z M70 12 L76 4 L68 9 Z" fill="${shade(col, 0.4)}"/>
          <ellipse cx="54" cy="20" rx="2.4" ry="1.6" fill="${eye}"/><ellipse cx="66" cy="20" rx="2.4" ry="1.6" fill="${eye}"/>
          <path d="M52 86 C56 90 64 90 68 86 M50 96 C56 100 64 100 70 96" stroke="${shade(col, 0.35)}" stroke-width="1.4" fill="none" opacity=".6"/>
          ${f.boss ? '' : '<path d="M56 30 C58 26 62 26 64 30" stroke="#ffb347" stroke-width="1.6" fill="none"/>'}`;
        break;
      case 'scorpion':
        body = `<path d="M64 76 C86 74 98 58 94 40 C92 30 84 24 76 28 C84 30 88 38 86 46 C84 58 74 64 62 64 Z" fill="url(#${fid}-b)"/>
          <path d="M76 28 C72 22 74 16 80 14 C78 20 80 24 84 26 Z" fill="${colD}"/><path d="M80 14 L77 8" stroke="${eye}" stroke-width="2" stroke-linecap="round"/>
          <ellipse cx="54" cy="78" rx="26" ry="14" fill="url(#${fid}-b)"/>
          <path d="M34 72 C24 66 16 66 12 58 C20 58 26 62 30 66 M32 82 C22 82 14 88 12 96 C20 92 26 90 32 88" stroke="${colD}" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path d="M12 58 C6 52 10 44 18 46 C14 50 16 54 20 56 Z M12 96 C4 98 4 106 12 106 C10 102 12 100 16 98 Z" fill="${col}"/>
          <path d="M40 90 l-6 10 M50 92 l-3 11 M60 92 l3 11 M70 90 l6 10" stroke="${colD}" stroke-width="3" stroke-linecap="round"/>
          <circle cx="42" cy="72" r="2.6" fill="${eye}"/><circle cx="50" cy="70" r="2.6" fill="${eye}"/>
          <path d="M44 84 C52 88 62 88 70 84" stroke="${shade(col, 0.35)}" stroke-width="1.4" fill="none" opacity=".6"/>`;
        break;
      case 'serpent':
        body = `<path d="M26 98 C14 90 18 74 34 74 C52 74 70 86 84 80 C96 74 94 58 82 54" stroke="url(#${fid}-b)" stroke-width="16" fill="none" stroke-linecap="round"/>
          <path d="M26 98 C14 90 18 74 34 74 C52 74 70 86 84 80" stroke="${shade(col, 0.4)}" stroke-width="4" fill="none" stroke-dasharray="3 5" opacity=".5"/>
          <path d="M82 54 C70 46 66 30 76 20 C88 12 100 22 98 36 C96 46 90 52 82 54 Z" fill="url(#${fid}-b)"/>
          <path d="M70 26 C60 26 52 34 56 44 C60 36 66 34 72 34 Z M96 26 C104 30 106 40 100 46 C100 38 98 34 94 32 Z" fill="${colD}"/>
          <path d="M80 44 C84 48 90 48 94 44" stroke="#2a0c06" stroke-width="2" fill="none"/><path d="M86 46 L84 52 M90 46 L91 51" stroke="#fff" stroke-width="1.2"/>
          <ellipse cx="80" cy="32" rx="2.6" ry="3.4" fill="${eye}"/><ellipse cx="92" cy="32" rx="2.6" ry="3.4" fill="${eye}"/>`;
        break;
      case 'spirit':
        body = `<path d="M60 16 C82 16 92 36 90 58 C88 78 84 94 94 108 C82 102 76 108 68 100 C62 108 54 108 48 100 C40 108 34 102 26 108 C34 94 32 78 30 58 C28 36 38 16 60 16 Z" fill="url(#${fid}-b)" opacity=".92"/>
          <path d="M60 22 C76 22 82 36 80 52 C70 46 50 46 40 52 C38 36 44 22 60 22 Z" fill="#120a1a" opacity=".85"/>
          <ellipse cx="51" cy="44" rx="4" ry="2.6" fill="${eye}"/><ellipse cx="69" cy="44" rx="4" ry="2.6" fill="${eye}"/>
          <path d="M40 70 C50 76 70 76 80 70" stroke="${shade(col, 0.4)}" stroke-width="1.4" fill="none" opacity=".6"/>
          <path d="M30 64 C20 58 14 60 8 66 M90 64 C100 58 106 60 112 66" stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`;
        break;
      case 'construct':
        body = `<path d="M30 104 L34 60 L46 40 L74 40 L86 60 L90 104 Z" fill="url(#${fid}-b)"/>
          <path d="M42 40 L48 20 L72 20 L78 40 Z" fill="${shade(col, 0.15)}"/><path d="M48 20 L72 20 L66 12 L54 12 Z" fill="${shade(col, 0.3)}"/>
          <path d="M34 60 L18 70 L14 96 L28 98 Z M86 60 L102 70 L106 96 L92 98 Z" fill="${colD}"/>
          <path d="M40 58 L52 66 L46 80 M80 58 L70 70 L76 86 M56 90 L64 98" stroke="#2a1608" stroke-width="1.6" fill="none" opacity=".5"/>
          <circle cx="60" cy="70" r="7" fill="${eye}" opacity=".9"/><circle cx="60" cy="70" r="12" fill="${eye}" opacity=".2"/>
          <rect x="51" y="28" width="6" height="3.4" rx="1" fill="${eye}"/><rect x="63" y="28" width="6" height="3.4" rx="1" fill="${eye}"/>`;
        break;
      case 'beast':
        body = `<path d="M24 104 C24 80 36 66 52 62 L68 62 C84 66 96 80 96 104 Z" fill="url(#${fid}-b)"/>
          <path d="M38 40 L32 14 L50 32 Z M82 40 L88 14 L70 32 Z" fill="${colD}"/><path d="M38 34 L35 20 L46 32 Z M82 34 L85 20 L74 32 Z" fill="#f2b8a0" opacity=".6"/>
          <path d="M60 26 C80 26 88 40 86 52 C84 64 74 70 70 82 L50 82 C46 70 36 64 34 52 C32 40 40 26 60 26 Z" fill="url(#${fid}-b)"/>
          <path d="M48 66 C50 80 70 80 72 66 C68 72 52 72 48 66 Z" fill="${shade(col, 0.45)}"/><ellipse cx="60" cy="70" rx="5" ry="3.4" fill="#1a0c06"/>
          <path d="M54 78 L56 84 M66 78 L64 84" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M44 48 L54 52 L46 54 Z M76 48 L66 52 L74 54 Z" fill="${eye}"/>
          <path d="M42 40 C48 38 52 40 54 44 M78 40 C72 38 68 40 66 44" stroke="${colD}" stroke-width="2" fill="none"/>`;
        break;
      default:
        body = `<path d="M22 108 C24 82 38 72 60 70 C82 72 96 82 98 108 Z" fill="url(#${fid}-b)"/>
          <path d="M40 72 L60 96 L80 72" stroke="${colD}" stroke-width="3" fill="none"/>
          <path d="M60 18 C78 18 86 32 84 50 C82 62 74 70 60 72 C46 70 38 62 36 50 C34 32 42 18 60 18 Z" fill="url(#${fid}-b)"/>
          <path d="M40 46 C46 50 74 50 80 46 L80 62 C72 70 48 70 40 62 Z" fill="${colD}"/>
          <path d="M40 40 C48 36 72 36 80 40 L80 46 C72 50 48 50 40 46 Z" fill="#170c06"/>
          <ellipse cx="51" cy="43" rx="3.6" ry="2" fill="${eye}"/><ellipse cx="69" cy="43" rx="3.6" ry="2" fill="${eye}"/>
          ${f.cls === 'bow' ? `<path d="M98 30 C110 50 110 80 98 100" stroke="#6b4426" stroke-width="3" fill="none"/><path d="M98 30 L98 100" stroke="#efe2c9" stroke-width=".8"/>`
            : f.cls === 'lancer' ? `<path d="M100 8 L104 110" stroke="#6b4426" stroke-width="3"/><path d="M100 8 C97 0 99 -4 101 -6 C104 -2 104 2 102 8 Z" fill="#dfe8ee"/>`
              : `<path d="M8 66 C8 54 18 46 30 48 L34 92 C22 94 8 84 8 66 Z" fill="${shade(col, 0.15)}" stroke="${colD}" stroke-width="2"/>`}`;
    }
    const crown = f.boss && a !== 'sun' && a !== 'void' ? `<path d="M40 14 L46 24 L52 10 L60 22 L68 10 L74 24 L80 14 L78 28 L42 28 Z" fill="#ffcf6e" stroke="#a8641c" stroke-width="1"/><circle cx="60" cy="22" r="2" fill="#ff5a2a"/>` : '';
    return `<svg class="${cls}" viewBox="0 0 120 120" aria-hidden="true">${defs}<circle cx="60" cy="64" r="56" fill="url(#${fid}-g)"/>
      <ellipse cx="60" cy="110" rx="40" ry="6" fill="#000" opacity=".25"/>${body}${crown}</svg>`;
  }

  // a sheet's painted header with its blurb over the foot of the painting; plain text when there is no painting
  const PREFIX = { building: 'b', event: 'e', offer: 'o', ruin: 'r', ending: 'n' };
  const banner = (kind, id, text, plain = 'muted') => (painted(kind, id) ? `<div class="art-banner art-${PREFIX[kind]}-${id}">${text ? `<p>${text}</p>` : ''}</div>` : text ? `<p class="${plain}">${text}</p>` : '');

  KH.art = { portrait, foe, archetype, painted, banner };
})();
