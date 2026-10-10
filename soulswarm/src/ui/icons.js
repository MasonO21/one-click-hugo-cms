// Hand-built SVG icon set (24×24). Stroke icons inherit currentColor so they can glow in rarity colours.

function gearPath() {
  const teeth = 8, r1 = 10, r2 = 7.6;
  let d = '';
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2 - 0.12, a1 = a0 + Math.PI / teeth * 0.9;
    const r = i % 2 === 0 ? r1 : r2;
    const p = (a) => `${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`;
    d += (i === 0 ? 'M' : 'L') + p(a0) + ' L' + p(a1) + ' ';
  }
  return d + 'Z';
}

// stroke icons
const S = {
  bolt: '<circle cx="15" cy="9" r="4"/><path d="M12 12 4 20M13.6 13.6 9.5 20.5M10.4 10.4 3.5 14.5"/>',
  scythe: '<path d="M5 21 14 4"/><path d="M14 4C10 1 5 2 2 6c4-2 8-2 10.8.5"/><path d="M8.5 15.5l2.5 1.2"/>',
  chain: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  spear: '<path d="M3.5 20.5 15 9"/><path d="M21 3l-7.5 2.2 5.3 5.3z"/><path d="M11 10.5l2.5 2.5"/>',
  skull: '<path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4 3 5v3h8v-3c1.8-1 3-2.5 3-5a7 7 0 0 0-7-7z"/><circle cx="9.5" cy="10.5" r="1.4"/><circle cx="14.5" cy="10.5" r="1.4"/><path d="M10.5 18v3M13.5 18v3"/>',
  pulse: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="6" opacity=".75"/><circle cx="12" cy="12" r="10" opacity=".4"/>',
  raise: '<path d="M12 3c-3.5 0-6 2.7-6 6v11l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5V9c0-3.3-2.5-6-6-6z"/><path d="M9.6 9.8h.01M14.4 9.8h.01" stroke-width="3"/>',
  banner: '<path d="M6 21V3"/><path d="M6 4h12l-3 4 3 4H6"/>',
  fang: '<path d="M6 4c2 6 2 11 0 16M12 3c2 7 2 12 0 18M18 4c2 6 2 11 0 16"/>',
  wing: '<path d="M3 18c7 0 12-5 18-13-1 8-6 13-13 14"/><path d="M7 14c3.5 0 7-2.5 10-6"/><path d="M2 12h3M2 8h5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  magnet: '<path d="M5 3v8a7 7 0 0 0 14 0V3h-4v8a3 3 0 0 1-6 0V3z"/><path d="M5 7h4M15 7h4"/>',
  tomb: '<path d="M7 21V9a5 5 0 0 1 10 0v12z"/><path d="M12 10v6M9.5 12.5h5"/><path d="M4 21h16"/>',
  leech: '<path d="M12 20s-6-3.7-6-8.2A3.4 3.4 0 0 1 12 9.8a3.4 3.4 0 0 1 6 2C18 16.3 12 20 12 20z"/><path d="M12 9.8C12 6 15 3 20 3"/>',
  ward: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  reach: '<circle cx="12" cy="12" r="2.5"/><path d="M6 7a8 8 0 0 0 0 10M18 7a8 8 0 0 1 0 10M3 4a12 12 0 0 0 0 16M21 4a12 12 0 0 1 0 16"/>',
  sword: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6M16 16l4 4M19 21l2-2"/>',
  hourglass: '<path d="M6 2h12M6 22h12"/><path d="M7 2v3a5 5 0 0 0 10 0V2M7 22v-3a5 5 0 0 1 10 0v3"/>',
  lantern: '<path d="M9 3h6M12 3v2"/><path d="M8 7h8l-1 11H9z"/><path d="M7 21h10M12 11v3"/>',
  crown: '<path d="M3 18 2 7l5 4 5-7 5 7 5-4-1 11z"/><path d="M3 21h18"/>',
  idol: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 8h.01M14 8h.01" stroke-width="3"/><path d="M10 13h4M9 17h6"/>',
  boots: '<path d="M7 3h5v9l7 3v5H5v-5l2-2z"/><path d="M5 17h14"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M15 9h-4.5a1.5 1.5 0 0 0 0 3h3a1.5 1.5 0 0 1 0 3H9"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  helm: '<path d="M12 2C7 2 4 6 4 11v9l4-2 4 3 4-3 4 2v-9c0-5-3-9-8-9z"/><path d="M8.5 12l2.5 1.2M15.5 12 13 13.2"/>',
  altar: '<circle cx="12" cy="12" r="10"/><path d="M12 3 17.3 19.3 3.4 9.2h17.2L6.7 19.3z"/>',
  scroll: '<path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7"/><path d="M6 3a2 2 0 0 0-2 2v2h4"/><path d="M9 8h7M9 12h7M9 16h4"/><path d="M7 21a2 2 0 0 1-2-2v-1h4v1a2 2 0 0 1-2 2"/>',
  quest: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chest: '<path d="M3 11h18v9H3z"/><path d="M3 11a9 6 0 0 1 18 0"/><path d="M10.5 13h3v3.5h-3z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  share: '<path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M12 3v12M7 8l5-5 5 5"/>',
  down: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  ad: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10 9v6l5-3z" fill="currentColor"/>',
  nova: '<path d="M12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6M4.6 4.6l4.2 4.2M15.2 15.2l4.2 4.2M4.6 19.4l4.2-4.2M15.2 8.8l4.2-4.2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5h.01"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
  swords: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4"/><path d="M9.5 17.5 21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4"/>',
};
// filled icons (currentColor)
const F = {
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z"/>',
  star: '<path d="M12 2.2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.4l-6.1 3.4 1.4-6.8-5.1-4.7 6.9-.8z"/>',
  gear: `<path fill-rule="evenodd" d="${gearPath()} M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"/>`,
  shard: '<path d="M12 1.5l5.5 7.5L12 22.5 6.5 9z" opacity=".85"/><path d="M12 1.5l5.5 7.5h-11z" fill="#fff" opacity=".55"/>',
};
// multi-colour currency icons
const C = {
  gold: '<circle cx="12" cy="12.6" r="10" fill="#9c5d10"/><circle cx="12" cy="11.4" r="9.4" fill="#ffcf4a"/><circle cx="12" cy="11.4" r="6.6" fill="#ffbf2e" stroke="#d9861a" stroke-width="1.4"/><path d="M12 6.7l1.4 3 3.2.3-2.4 2.2.7 3.2L12 13.7l-2.9 1.7.7-3.2-2.4-2.2 3.2-.3z" fill="#fff6cf"/>',
  gems: '<path d="M6 3h12l4.2 6L12 22 1.8 9z" fill="#5b1aa8"/><path d="M6 3h12l4.2 6H1.8z" fill="#ef9cff"/><path d="M7.6 9 12 22l4.4-13z" fill="#c35cff"/><path d="M6 3l1.6 6L12 3l4.4 6L18 3" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".9"/>',
  energy: '<path d="M13.5 1.5 4 14h7l-1.5 8.5L20 10h-7z" fill="#6dffb0" stroke="#0d7a47" stroke-width="1.2" stroke-linejoin="round"/>',
  sigils: '<circle cx="12" cy="12" r="10.5" fill="#173a8c"/><circle cx="12" cy="12" r="8.3" fill="none" stroke="#7fd0ff" stroke-width="1.4"/><path d="M12 5.2l6 10.6H6z" fill="none" stroke="#d6f6ff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.4" r="1.9" fill="#d6f6ff"/>',
  passXp: '<path d="M12 2.2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.4l-6.1 3.4 1.4-6.8-5.1-4.7 6.9-.8z" fill="#ffcf4a" stroke="#a5620f" stroke-width="1"/>',
};

export function icon(name, cls = '') {
  if (C[name]) return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${C[name]}</svg>`;
  if (F[name]) return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${F[name]}</svg>`;
  const body = S[name] || S.info;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// relic type -> icon name
export const RELIC_ICON = { lantern: 'lantern', crown: 'crown', idol: 'idol', heart: 'heart', boots: 'boots', coin: 'coin', hourglass: 'hourglass', eye: 'eye' };
export const CURRENCY_ICON = { gold: 'gold', gems: 'gems', sigils: 'sigils', energy: 'energy', passXp: 'passXp' };
