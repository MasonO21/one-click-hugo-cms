/* Paints the battlefield art (web/assets/art/map.webp) from the game's real layout: the lane, river,
   bases, tower pads, the Shard altar, the Wyrm's rift and the jungle camps all come from data.js and
   match.js, so the picture always lines up with where things actually are.

   Runs in a browser page that has loaded data.js and match.js (tools/paint-map.mjs drives it).
   Seeded, so re-running paints the same map. Tall props (trees, big rocks) stay in the border strips
   heroes can't walk on; the walkable ground only gets flat detail, so nothing looks like a wall that
   isn't one. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;

  // ---- seeded noise ----------------------------------------------------------------------------
  function hash2(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * f, y * f, s + i * 17); norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  }
  // Cellular noise: W1/W2 = distances to the nearest two feature points, WID = the nearest cell's id,
  // WX/WY = that feature point (cell units).
  let W1 = 0, W2 = 0, WID = 0, WX = 0, WY = 0;
  function worley(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const px = cx + 0.12 + 0.76 * hash2(cx, cy, s), py = cy + 0.12 + 0.76 * hash2(cx, cy, s + 9);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < f1) { f2 = f1; f1 = d; WID = hash2(cx, cy, s + 31); WX = px; WY = py; } else if (d < f2) f2 = d;
    }
    W1 = Math.sqrt(f1); W2 = Math.sqrt(f2);
  }
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function rng(seed) { let s = seed >>> 0 || 1; return () => (s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296; }

  // ---- palette ---------------------------------------------------------------------------------
  const C = {
    grassDark: hex('#244a36'), grass: hex('#3b7247'), grassLight: hex('#5f9a52'), grassSun: hex('#8fb764'), moss: hex('#1b3a2e'),
    jungle: hex('#173a30'),
    stone: hex('#8f8572'), stoneLight: hex('#b0a58b'), stoneDark: hex('#6f6656'), mortar: hex('#3e382f'), dirt: hex('#6b5a43'),
    sand: hex('#c9b68a'), sandWet: hex('#8f8460'), shallow: hex('#46b9c6'), deep: hex('#12486a'), foam: hex('#e8fbff'),
    plaza: hex('#9b9a95'), plazaDark: hex('#6d6d70'), rift: hex('#120c26'), riftRim: hex('#3a2a6a')
  };

  window.paintMap = function (S) {
    const W = SF.WORLD, L = W.laneY, RX = W.riverX;
    // The real layout, from a throwaway match.
    const m = new SF.Match({ hero: 'kaida', difficulty: 'easy', allies: [{ id: 'orin' }, { id: 'sylva' }], enemies: [{ id: 'nyx' }, { id: 'vexa' }, { id: 'drace' }] });
    const camps = m.camps.map(c => ({ x: c.x, y: c.y, type: c.type }));
    const fountains = m.fountains.map(f => ({ x: f.x, y: f.y }));
    const pads = m.units.filter(u => u.kind === 'tower' || u.kind === 'core').map(u => ({ x: u.x, y: u.y, r: u.r * 1.45, team: u.team, core: u.kind === 'core' }));
    const bushes = m.bushes, runes = SF.RUNE_SPOTS;
    const ALTAR = { x: RX, y: 230, rx: 138, ry: 96 }, RIFT = { x: RX, y: 1050, rx: 150, ry: 96 };
    const BRIDGE = { x0: RX - 100, x1: RX + 100, y0: L - 118, y1: L + 118 };
    const PLAZA = 262;

    const laneC = SF.laneCurve;
    const laneHalf = x => 134 + 9 * (vnoise(x / 140, 0.5, 3) - 0.5) * 2;
    const riverC = SF.riverCurve;
    const riverHalf = y => 80 + 6 * Math.sin(y / 150 + 0.7);

    const cw = Math.round(W.w * S), ch = Math.round(W.h * S);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    const img = g.createImageData(cw, ch), D = img.data;
    const out = [0, 0, 0];
    const mix = (a, b, t) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; };
    const set = a => { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; };
    const blend = (b, t) => { out[0] += (b[0] - out[0]) * t; out[1] += (b[1] - out[1]) * t; out[2] += (b[2] - out[2]) * t; };
    const mul = k => { out[0] *= k; out[1] *= k; out[2] *= k; };

    // ---- 1. ground, pixel by pixel ----------------------------------------------------------
    for (let py = 0; py < ch; py++) {
      const wy = (py + 0.5) / S;
      const rc = riverC(wy), rh = riverHalf(wy);
      for (let px = 0; px < cw; px++) {
        const wx = (px + 0.5) / S;
        // Grass: big light/dark patches, medium clumps, fine grain; darker and cooler deep in the jungle.
        const n1 = fbm(wx / 300, wy / 300, 11, 3), n2 = fbm(wx / 70, wy / 70, 13, 3), grain = vnoise(wx / 2.6, wy / 2.6, 17);
        mix(C.grassDark, C.grass, smooth(0.25, 0.75, n1 * 0.65 + n2 * 0.35));
        blend(C.grassLight, smooth(0.55, 0.8, n2) * 0.55);
        blend(C.grassSun, smooth(0.66, 0.9, n2 * 0.6 + n1 * 0.4) * 0.35);
        blend(C.moss, smooth(0.42, 0.2, n1) * 0.5);
        const jungle = smooth(170, 520, Math.abs(wy - L));
        blend(C.jungle, jungle * 0.38);
        // Dappled canopy light in the jungle.
        const dapple = fbm(wx / 85, wy / 85, 23, 3);
        mul(1 + jungle * (smooth(0.62, 0.78, dapple) * 0.16 - smooth(0.45, 0.3, dapple) * 0.2));
        mul(0.93 + grain * 0.12);

        // Trodden earth around the lane edges.
        const lc = laneC(wx), dl = Math.abs(wy - lc) - laneHalf(wx) + (fbm(wx / 38, wy / 38, 5, 3) - 0.5) * 24;
        // Bases: a round stone plaza around each fountain.
        let dp = 1e9, fx = 0;
        for (const f of fountains) { const d = Math.hypot(wx - f.x, (wy - f.y) * 1.05); if (d < dp) { dp = d; fx = f.x; } }
        const plaza = dp < PLAZA + 14;
        if (dl < 26 && !plaza) blend(C.dirt, smooth(26, 0, dl) * 0.55);

        if (dl < 0 && !plaza) {
          // The lane: small fitted cobbles, a band of long curb stones along each edge, dark mortar, a
          // dusty worn strip down the middle and moss creeping in from the edges. Each stone is shaded as
          // a rounded bump lit from the top-left.
          const curb = dl > -16, sx = curb ? 21 : 14, sy = curb ? 9 : 11.5;
          worley(wx / sx, wy / sy, curb ? 43 : 41);
          const id = WID, edge = W2 - W1;
          mix(C.stoneDark, C.stoneLight, 0.2 + id * 0.6);
          if (id > 0.86) blend([156, 128, 104], 0.35); else if (id < 0.1) blend([112, 122, 134], 0.35);
          const lx = wx / sx - WX, ly = wy / sy - WY;
          mul(1.05 - W1 * 0.36 + (-lx - ly) * 0.15);
          blend(C.dirt, smooth(0.55, 0.85, fbm(wx / 55, wy / 55, 7, 3)) * 0.3 + smooth(70, 0, Math.abs(wy - lc)) * 0.12);
          blend(C.grass, smooth(-28, 0, dl) * 0.5 * smooth(0.4, 0.7, n2));
          blend(C.mortar, smooth(0.12, 0.03, edge) * 0.9);
          if (curb) mul(1.05);
          mul(0.95 + grain * 0.08);
          mul(1 - smooth(-6, 0, dl) * 0.25);                          // a soft edge shadow
        }
        if (plaza) {
          // Concentric rings of fitted stone, with a lip at the edge.
          const f = fountains.find(q => q.x === fx), ang = Math.atan2(wy - f.y, wx - f.x), r = dp;
          const ring = Math.floor(r / 34), seg = Math.floor((ang + Math.PI) / TAU * Math.max(6, Math.round(ring * 34 * TAU / 58)));
          const id = hash2(ring, seg, 77), rf = (r % 34) / 34, sf = (((ang + Math.PI) / TAU * Math.max(6, Math.round(ring * 34 * TAU / 58))) % 1);
          mix(C.plazaDark, C.plaza, 0.35 + id * 0.5);
          mul(1.05 - Math.abs(rf - 0.5) * 0.25);
          if (rf < 0.07 || sf < 0.04) set(C.mortar);
          blend(C.grass, smooth(PLAZA - 20, PLAZA + 14, r) * 0.9);
          mul(0.95 + grain * 0.08);
        }
        // Tower pads: fitted stone circles under every tower and Heartstone.
        for (const p of pads) {
          const d = Math.hypot(wx - p.x, (wy - p.y) * 1.08);
          if (d > p.r + 10) continue;
          const ring = Math.floor(d / 20), seg = Math.floor((Math.atan2(wy - p.y, wx - p.x) + Math.PI) / TAU * (6 + ring * 5));
          mix(C.plazaDark, C.plaza, 0.3 + hash2(ring, seg, 91) * 0.45);
          if (d % 20 < 1.6) set(C.mortar);
          mul(1 - smooth(p.r - 8, p.r + 10, d) * 0.45);
        }

        // River: deep in the middle, shallow and turquoise at the edges, sandy banks with a foam line.
        const dr = Math.abs(wx - rc) - rh + (vnoise(wx / 14, wy / 14, 29) - 0.5) * 7;
        if (dr < 20) {
          if (dr >= 0) { mix(C.sandWet, C.sand, smooth(0, 16, dr)); mul(0.92 + grain * 0.14); blend(C.grassDark, smooth(12, 20, dr) * 0.6); }
          else {
            const depth = smooth(0, rh * 0.9, -dr);
            mix(C.shallow, C.deep, depth);
            const flow = fbm(wx / 26, wy / 120 - 0, 61, 3);
            mul(0.94 + flow * 0.14);
            worley(wx / 34, wy / 46, 53);
            blend([210, 250, 255], smooth(0.09, 0.0, W2 - W1) * 0.22 * (1 - depth * 0.7));   // caustics
            blend(C.foam, smooth(-7, -1, dr) * 0.75 * (0.6 + 0.4 * vnoise(wx / 6, wy / 6, 71)));
          }
        }
        // The Shard altar: a hexagonal stone island in the river.
        const ax = (wx - ALTAR.x) / ALTAR.rx, ay = (wy - ALTAR.y) / ALTAR.ry;
        const hexd = Math.max(Math.abs(ay) * 1.0 + Math.abs(ax) * 0.5, Math.abs(ax));
        if (hexd < 1.08) {
          if (hexd < 1) {
            const ring = Math.floor(hexd * 4), id = hash2(ring, Math.floor((Math.atan2(ay, ax) + Math.PI) * 3), 101);
            mix(C.plazaDark, C.plaza, 0.25 + id * 0.45); blend([90, 120, 140], 0.25);
            if ((hexd * 4) % 1 < 0.06) set(C.mortar);
            mul(1.06 - hexd * 0.2);
          } else { mix(C.sandWet, C.sand, 0.4); }
        }
        // The Wyrm's rift: the river pours into a dark violet chasm.
        const qx = (wx - RIFT.x) / RIFT.rx, qy = (wy - RIFT.y) / RIFT.ry, qd = Math.sqrt(qx * qx + qy * qy) + (vnoise(wx / 18, wy / 18, 83) - 0.5) * 0.12;
        if (qd < 1.12) {
          if (qd < 1) { mix(C.rift, C.riftRim, smooth(0.2, 1, qd)); worley(wx / 30, wy / 30, 97); blend([150, 110, 255], smooth(0.08, 0, W2 - W1) * 0.25 * qd); }
          else { mix(C.stoneDark, hex('#4a3f63'), 0.6); mul(0.8 + grain * 0.2); }
        }
        // Rune pads in the river.
        for (const r of runes) {
          const d = Math.hypot(wx - r.x, (wy - r.y) * 1.1);
          if (d < 34) { mix(C.plazaDark, C.plaza, 0.4 + 0.25 * hash2(Math.floor(d / 11), Math.floor(Math.atan2(wy - r.y, wx - r.x) * 2), 7)); blend([70, 110, 90], smooth(20, 34, d) * 0.4); mul(1.05 - d / 34 * 0.25); if (d % 11 < 1) set(C.mortar); }
          else if (d < 40) mix(C.sandWet, C.sand, 0.5);
        }
        // Jungle camps: trampled clearings.
        for (const k of camps) {
          const d = Math.hypot((wx - k.x) / 118, (wy - k.y) / 84);
          if (d < 1.15) blend(C.dirt, smooth(1.15, 0.6, d) * (0.55 + 0.3 * fbm(wx / 20, wy / 20, 111, 2)));
        }
        // Gentle vignette toward the map edges.
        const ex = Math.min(wx, W.w - wx) / 260, ey = Math.min(wy, W.h - wy) / 180;
        mul(0.72 + 0.28 * smooth(0, 1, Math.min(ex, ey)));

        const i4 = (py * cw + px) * 4;
        D[i4] = out[0]; D[i4 + 1] = out[1]; D[i4 + 2] = out[2]; D[i4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    // ---- 2. painted detail, in world units ---------------------------------------------------
    g.setTransform(S, 0, 0, S, 0, 0);
    const R = rng(1234);
    const walkable = (x, y, pad = 0) => !(Math.abs(y - laneC(x)) < laneHalf(x) + pad || Math.abs(x - riverC(y)) < riverHalf(y) + 22 + pad ||
      fountains.some(f => Math.hypot(x - f.x, y - f.y) < PLAZA + pad) || pads.some(p => Math.hypot(x - p.x, y - p.y) < p.r + 20 + pad) ||
      Math.hypot((x - ALTAR.x) / ALTAR.rx, (y - ALTAR.y) / ALTAR.ry) < 1.2 || Math.hypot((x - RIFT.x) / RIFT.rx, (y - RIFT.y) / RIFT.ry) < 1.25 ||
      camps.some(k => Math.hypot((x - k.x) / 130, (y - k.y) / 95) < 1));

    // Shadow under bushes so the tall grass sits in the ground.
    for (const b of bushes) {
      g.save(); g.translate(b.x, b.y + 6); g.scale(1, b.ry / b.rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, b.rx * 1.2); gr.addColorStop(0, 'rgba(8,26,16,.5)'); gr.addColorStop(1, 'rgba(8,26,16,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, b.rx * 1.2, 0, TAU); g.fill(); g.restore();
    }

    // Worn dirt paths: lane edge -> camp -> river bank.
    const path = pts => {
      for (const [w, a] of [[54, 0.16], [40, 0.18], [26, 0.2]]) {
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
        const e = pts[pts.length - 1]; g.lineTo(e[0], e[1]);
        g.strokeStyle = `rgba(104,86,60,${a})`; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
      }
    };
    for (const k of camps) {
      const up = k.y < L, side = k.x < RX ? -1 : 1;
      path([[k.x - side * 220, L + (up ? -130 : 130)], [k.x - side * 150, (k.y + L) / 2], [k.x, k.y + (up ? 60 : -60)]]);
      const ey = k.y + (up ? 90 : -90);
      path([[k.x, k.y], [k.x + (RX - k.x) * 0.45, k.y + (up ? 40 : -40)], [riverC(ey) + (k.x < RX ? -100 : 100), ey]]);
    }

    // Camp dressing: a ring of stones; ember braziers at Wisp camps, roots at Thornback camps.
    for (const k of camps) {
      for (let i = 0; i < 11; i++) {
        const a = i / 11 * TAU + R() * 0.2, x = k.x + Math.cos(a) * 112, y = k.y + Math.sin(a) * 74;
        rock(x, y, 9 + R() * 7, R);
      }
      if (k.type === 'wisp') for (const s of [-1, 1]) brazier(k.x + s * 86, k.y - 40);
      else for (let i = 0; i < 7; i++) root(k.x + (R() - 0.5) * 150, k.y + (R() - 0.5) * 90, R);
    }

    // Bases: the team's glowing inlay ring and runes around each fountain.
    fountains.forEach((f, team) => {
      const col = SF.TEAM_COLORS[team];
      g.save(); g.translate(f.x, f.y); g.scale(1, 0.95);
      g.shadowColor = col; g.shadowBlur = 18;
      g.strokeStyle = col + 'cc'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 205, 0, TAU); g.stroke();
      g.lineWidth = 2; g.strokeStyle = col + '88'; g.setLineDash([22, 14]); g.beginPath(); g.arc(0, 0, 176, 0, TAU); g.stroke(); g.setLineDash([]);
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.save(); g.rotate(a); g.translate(222, 0); g.rotate(Math.PI / 2); glyph(col); g.restore(); }
      g.shadowBlur = 0;
      // the fountain basin
      const bg = g.createRadialGradient(0, 0, 10, 0, 0, 70); bg.addColorStop(0, '#dff6ff'); bg.addColorStop(0.5, col + 'aa'); bg.addColorStop(1, col + '22');
      g.fillStyle = '#4b4d57'; g.beginPath(); g.arc(0, 0, 78, 0, TAU); g.fill();
      g.fillStyle = '#7b7d86'; g.beginPath(); g.arc(0, 0, 70, 0, TAU); g.fill();
      g.fillStyle = bg; g.beginPath(); g.arc(0, 0, 62, 0, TAU); g.fill();
      g.restore();
    });
    // Tower pads: team inlay.
    for (const p of pads) {
      const col = SF.TEAM_COLORS[p.team];
      g.save(); g.translate(p.x, p.y); g.scale(1, 0.93);
      g.shadowColor = col; g.shadowBlur = 12; g.strokeStyle = col + 'aa'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, p.r - 6, 0, TAU); g.stroke(); g.shadowBlur = 0;
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.fillStyle = col + '99'; g.beginPath(); g.arc(Math.cos(a) * (p.r - 6), Math.sin(a) * (p.r - 6), 3.2, 0, TAU); g.fill(); }
      g.restore();
    }
    // The Shard altar: glowing runes and a teal crystal seal.
    g.save(); g.translate(ALTAR.x, ALTAR.y);
    g.shadowColor = '#4fe3d3'; g.shadowBlur = 16; g.strokeStyle = 'rgba(79,227,211,.75)'; g.lineWidth = 3;
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.lineTo(Math.cos(a) * ALTAR.rx * 0.98, Math.sin(a) * ALTAR.ry * 0.98); } g.closePath(); g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(79,227,211,.45)';
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; g.lineTo(Math.cos(a) * ALTAR.rx * 0.62, Math.sin(a) * ALTAR.ry * 0.62); } g.closePath(); g.stroke();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.save(); g.translate(Math.cos(a) * ALTAR.rx * 0.8, Math.sin(a) * ALTAR.ry * 0.8); glyph('#4fe3d3'); g.restore(); }
    g.shadowBlur = 0; g.restore();
    // The Wyrm's rift: violet glow at the lip and crystal spikes.
    g.save(); g.translate(RIFT.x, RIFT.y);
    g.shadowColor = '#9b6bff'; g.shadowBlur = 22; g.strokeStyle = 'rgba(180,140,255,.7)'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(0, 0, RIFT.rx * 0.98, RIFT.ry * 0.98, 0, 0, TAU); g.stroke(); g.shadowBlur = 0;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU + R() * 0.2; if (Math.sin(a) < -0.55 && Math.abs(Math.cos(a)) < 0.5) continue;   // the river's mouth
      crystal(Math.cos(a) * RIFT.rx * 1.06, Math.sin(a) * RIFT.ry * 1.06, 10 + R() * 12, ['#c9a6ff', '#8a5bff', '#3a2470'], R);
    }
    // the river spilling over the lip
    g.fillStyle = 'rgba(200,240,255,.35)';
    for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse((R() - 0.5) * 120, -RIFT.ry * 0.86 + R() * 10, 10 + R() * 14, 3, 0, 0, TAU); g.fill(); }
    g.restore();

    // The bridge: stone abutments on both banks, weathered planks with grain, rails and posts.
    {
      const { x0, x1, y0, y1 } = BRIDGE, pw = 15;
      g.save();
      for (const ax of [x0 - 34, x1 + 2]) {
        for (let y = y0 - 6; y < y1 + 6; y += 22) {
          const sh = 0.8 + R() * 0.25;
          g.fillStyle = `rgb(${120 * sh},${116 * sh},${106 * sh})`; g.fillRect(ax, y, 32, 21);
          g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(ax, y, 32, 3);
          g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(ax, y + 18, 32, 3);
        }
      }
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x0 - 2, y0 + 8, x1 - x0 + 4, y1 - y0 + 2);
      for (let x = x0; x < x1; x += pw) {
        const k = R(), yo = R() * 4;
        const pg = g.createLinearGradient(x, 0, x + pw, 0);
        pg.addColorStop(0, `rgb(${132 + k * 26},${94 + k * 18},${58 + k * 12})`); pg.addColorStop(0.7, `rgb(${112 + k * 22},${78 + k * 15},${46 + k * 9})`); pg.addColorStop(1, `rgb(${78 + k * 14},${52 + k * 10},${30 + k * 6})`);
        g.fillStyle = pg; g.fillRect(x + 1, y0 + yo, pw - 2, y1 - y0 - yo - R() * 5);
        g.strokeStyle = 'rgba(60,36,18,.35)'; g.lineWidth = 0.8;
        for (let j = 0; j < 3; j++) { const gx = x + 3 + R() * (pw - 6); g.beginPath(); g.moveTo(gx, y0 + 6); g.bezierCurveTo(gx + 1.5, y0 + 60, gx - 1.5, y1 - 60, gx, y1 - 8); g.stroke(); }
        g.fillStyle = 'rgba(40,24,12,.7)';
        for (const yy of [y0 + 20, (y0 + y1) / 2, y1 - 24]) { g.fillRect(x + 3, yy, 2, 2); g.fillRect(x + pw - 6, yy, 2, 2); }
      }
      for (const yy of [y0 - 4, y1 - 4]) {
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0 - 10, yy + 6, x1 - x0 + 20, 6);
        g.fillStyle = '#4e3520'; g.fillRect(x0 - 10, yy, x1 - x0 + 20, 9);
        g.fillStyle = '#8a6440'; g.fillRect(x0 - 10, yy, x1 - x0 + 20, 3);
        for (const xx of [x0 - 14, x0 + 44, x1 - 58, x1 - 2]) {
          g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(xx + 3, yy - 2, 16, 20);
          g.fillStyle = '#3d2a18'; g.fillRect(xx, yy - 8, 15, 20); g.fillStyle = '#9a7048'; g.fillRect(xx, yy - 8, 15, 5);
        }
      }
      g.restore();
    }
    // Rune pads: a teal glyph ring where the power shards appear.
    for (const r of runes) {
      g.save(); g.translate(r.x, r.y); g.scale(1, 0.92);
      g.shadowColor = '#4fe3d3'; g.shadowBlur = 10; g.strokeStyle = 'rgba(79,227,211,.6)'; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, 24, 0, TAU); g.stroke();
      for (let i = 0; i < 4; i++) { g.save(); g.rotate(i / 4 * TAU + Math.PI / 4); g.translate(24, 0); g.scale(0.55, 0.55); glyph('rgba(79,227,211,.8)'); g.restore(); }
      g.restore();
    }

    // Flat ground detail on walkable grass: tufts and pebbles everywhere, flowers in small patches of one
    // colour, mushrooms deeper in the jungle, and a few glowing crystal sprouts.
    for (let i = 0; i < 1300; i++) { const x = R() * W.w, y = 40 + R() * (W.h - 80); if (walkable(x, y, 6)) tuft(x, y, R); }
    for (let i = 0; i < 260; i++) { const x = R() * W.w, y = 40 + R() * (W.h - 80); if (walkable(x, y, 6)) pebble(x, y, 2.5 + R() * 3.5, R); }
    for (let n = 0; n < 75; n++) {
      const cx = R() * W.w, cy = 60 + R() * (W.h - 120), k = R(), col = ['#ffd84d', '#ff8fb1', '#ffffff', '#a4c8ff', '#ffb35c'][Math.floor(R() * 5)];
      const deep = Math.abs(cy - L) > 260;
      for (let i = 0, cnt = 5 + Math.floor(R() * 9); i < cnt; i++) {
        const x = cx + (R() - 0.5) * 100, y = cy + (R() - 0.5) * 64;
        if (!walkable(x, y, 6)) continue;
        if (k < 0.62) flowers(x, y, R, col);
        else if (k < 0.85 && deep) mushroom(x, y, R);
        else if (k > 0.9) crystalFlat(x, y, R);
        else tuft(x, y, R);
      }
    }
    // Moss and grass creeping over the lane's edge stones.
    for (let x = 0; x < W.w; x += 9) {
      if (Math.abs(x - RX) < 130) continue;
      for (const s of [-1, 1]) {
        if (R() < 0.45) continue;
        const y = laneC(x) + s * (laneHalf(x) - 4 + R() * 10);
        if (fountains.some(f => Math.hypot(x - f.x, y - f.y) < PLAZA + 20)) continue;
        tuft(x, y, R, 0.9);
      }
    }

    // Border forest: big canopies in the strips nobody can walk on.
    const trees = [];
    for (let x = -40; x < W.w + 60; x += 38) {
      trees.push([x + R() * 26, 6 + R() * 40, 42 + R() * 22]);
      trees.push([x + R() * 26, W.h - 6 - R() * 40, 42 + R() * 22]);
      if (R() < 0.5) trees.push([x + R() * 26, -20 + R() * 20, 50 + R() * 20]);
      if (R() < 0.5) trees.push([x + R() * 26, W.h + 20 - R() * 20, 50 + R() * 20]);
    }
    for (let y = 40; y < W.h - 40; y += 40) { trees.push([-10 + R() * 30, y + R() * 20, 40 + R() * 20]); trees.push([W.w + 10 - R() * 30, y + R() * 20, 40 + R() * 20]); }
    trees.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of trees) treeShadow(x, y, r);
    for (const [x, y, r] of trees) tree(x, y, r, R);
    // Rocks and crystal outcrops tucked into the forest edge.
    for (let i = 0; i < 70; i++) {
      const top = R() < 0.5, x = 60 + R() * (W.w - 120), y = top ? 30 + R() * 34 : W.h - 30 - R() * 34;
      if (R() < 0.6) rock(x, y, 14 + R() * 16, R); else crystal(x, y, 14 + R() * 14, R() < 0.5 ? ['#c9fff6', '#4fe3d3', '#14505a'] : ['#f0d9ff', '#b48cff', '#3a2470'], R);
    }

    // Warm light from the top-left over everything, cooler shadow toward the bottom-right.
    g.setTransform(1, 0, 0, 1, 0, 0);
    const lg = g.createLinearGradient(0, 0, cw, ch);
    lg.addColorStop(0, 'rgba(255,226,170,.10)'); lg.addColorStop(0.5, 'rgba(255,226,170,0)'); lg.addColorStop(1, 'rgba(20,30,70,.12)');
    g.fillStyle = lg; g.fillRect(0, 0, cw, ch);
    return c;

    // ---- props ---------------------------------------------------------------------------
    function glyph(col) {
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
      g.moveTo(0, -8); g.lineTo(5, 0); g.lineTo(0, 8); g.lineTo(-5, 0); g.closePath(); g.moveTo(0, -12); g.lineTo(0, 12); g.stroke();
    }
    function rock(x, y, r, R) {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + r * 0.2, y + r * 0.35, r * 1.05, r * 0.5, 0, 0, TAU); g.fill();
      const pts = Array.from({ length: 7 }, (_, i) => { const a = i / 7 * TAU; const k = 0.75 + R() * 0.35; return [x + Math.cos(a) * r * k, y - r * 0.25 + Math.sin(a) * r * 0.62 * k]; });
      g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath();
      const rg = g.createLinearGradient(x - r, y - r, x + r, y + r); rg.addColorStop(0, '#b9b4a6'); rg.addColorStop(0.5, '#827c6e'); rg.addColorStop(1, '#4b4740');
      g.fillStyle = rg; g.fill(); g.strokeStyle = 'rgba(30,28,24,.6)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = 'rgba(80,130,70,.5)'; g.beginPath(); g.ellipse(x - r * 0.2, y - r * 0.55, r * 0.45, r * 0.18, -0.3, 0, TAU); g.fill();
    }
    function pebble(x, y, r, R) {
      g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(x + 1, y + 1.5, r, r * 0.55, 0, 0, TAU); g.fill();
      const v = 120 + R() * 50; g.fillStyle = `rgb(${v},${v - 4},${v - 14})`; g.beginPath(); g.ellipse(x, y, r, r * 0.6, R() * 3, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.2, r * 0.4, r * 0.2, 0, 0, TAU); g.fill();
    }
    function tuft(x, y, R, alpha = 0.8) {
      const n = 4 + Math.floor(R() * 4), h = 6 + R() * 7;
      g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const dx = (R() - 0.5) * 8, lean = (R() - 0.5) * 6, hh = h * (0.6 + R() * 0.5);
        g.strokeStyle = R() < 0.5 ? `rgba(120,170,90,${alpha})` : `rgba(70,120,70,${alpha})`; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(x + dx, y); g.quadraticCurveTo(x + dx + lean * 0.3, y - hh * 0.6, x + dx + lean, y - hh); g.stroke();
      }
    }
    function flowers(x, y, R, col) {
      for (let i = 0; i < 2 + Math.floor(R() * 4); i++) {
        const fx = x + (R() - 0.5) * 18, fy = y + (R() - 0.5) * 10;
        g.fillStyle = 'rgba(40,90,50,.8)'; g.beginPath(); g.arc(fx, fy + 1.5, 2.2, 0, TAU); g.fill();
        g.fillStyle = col; g.beginPath(); g.arc(fx, fy, 1.8, 0, TAU); g.fill();
      }
    }
    function mushroom(x, y, R) {
      const col = R() < 0.5 ? '#e0584f' : '#d9a066';
      g.fillStyle = '#efe6d2'; g.fillRect(x - 1, y - 4, 2, 4);
      g.fillStyle = col; g.beginPath(); g.ellipse(x, y - 4, 4, 2.6, 0, Math.PI, 0); g.fill();
      g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(x - 1.5, y - 5.5, 1, 1);
    }
    function crystalFlat(x, y, R) {
      const col = R() < 0.6 ? ['#c9fff6', '#4fe3d3'] : ['#f0d9ff', '#b48cff'];
      g.save(); g.shadowColor = col[1]; g.shadowBlur = 8;
      for (let i = 0; i < 3; i++) {
        const cx = x + (R() - 0.5) * 10, s = 3 + R() * 4;
        g.fillStyle = i ? col[1] : col[0]; g.beginPath(); g.moveTo(cx, y - s * 2); g.lineTo(cx + s * 0.6, y); g.lineTo(cx - s * 0.6, y); g.closePath(); g.fill();
      }
      g.restore();
    }
    function crystal(x, y, s, cols, R) {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + s * 0.2, y + 2, s * 0.9, s * 0.35, 0, 0, TAU); g.fill();
      g.save(); g.shadowColor = cols[1]; g.shadowBlur = 14;
      for (let i = 0; i < 4; i++) {
        const cx = x + (i - 1.5) * s * 0.35 + (R() - 0.5) * 4, h = s * (1.1 + R() * 1.2), w = s * (0.25 + R() * 0.15), lean = (R() - 0.5) * s * 0.5;
        const cg = g.createLinearGradient(cx - w, y - h, cx + w, y); cg.addColorStop(0, cols[0]); cg.addColorStop(0.5, cols[1]); cg.addColorStop(1, cols[2]);
        g.fillStyle = cg; g.beginPath(); g.moveTo(cx - w, y); g.lineTo(cx - w * 0.7 + lean * 0.7, y - h * 0.8); g.lineTo(cx + lean, y - h); g.lineTo(cx + w * 0.8 + lean * 0.6, y - h * 0.75); g.lineTo(cx + w, y); g.closePath(); g.fill();
      }
      g.restore();
    }
    function brazier(x, y) {
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x + 3, y + 3, 14, 6, 0, 0, TAU); g.fill();
      g.fillStyle = '#4a4038'; g.beginPath(); g.ellipse(x, y, 12, 6, 0, 0, TAU); g.fill();
      g.save(); g.shadowColor = '#ff9d3d'; g.shadowBlur = 20;
      const fg = g.createRadialGradient(x, y - 4, 0, x, y - 4, 12); fg.addColorStop(0, '#fff3c4'); fg.addColorStop(0.4, '#ff9d3d'); fg.addColorStop(1, 'rgba(255,90,40,0)');
      g.fillStyle = fg; g.beginPath(); g.arc(x, y - 4, 12, 0, TAU); g.fill(); g.restore();
    }
    function root(x, y, R) {
      g.strokeStyle = 'rgba(70,52,34,.75)'; g.lineWidth = 3 + R() * 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + (R() - 0.5) * 40, y + (R() - 0.5) * 20, x + (R() - 0.5) * 50, y + (R() - 0.5) * 30, x + (R() - 0.5) * 70, y + (R() - 0.5) * 30); g.stroke();
    }
    function treeShadow(x, y, r) {
      const sg = g.createRadialGradient(x + r * 0.25, y + r * 0.35, 0, x + r * 0.25, y + r * 0.35, r * 1.5);
      sg.addColorStop(0, 'rgba(0,10,8,.55)'); sg.addColorStop(1, 'rgba(0,10,8,0)');
      g.fillStyle = sg; g.beginPath(); g.arc(x + r * 0.25, y + r * 0.35, r * 1.5, 0, TAU); g.fill();
    }
    function tree(x, y, r, R) {
      // A round canopy built from overlapping leaf clumps, lit from the top-left.
      const k = R();
      const pal = k < 0.05 ? ['#3e2a16', '#7a5224', '#a87a34', '#d6ac5c'] : k < 0.1 ? ['#3e1f33', '#7a3a5e', '#b0668c', '#e4a6c4']
        : k < 0.55 ? ['#0f2a22', '#1d4a38', '#2f6e4a', '#5f9a5c'] : ['#12301f', '#245a34', '#3a7f44', '#79b360'];
      const clumps = 7 + Math.floor(R() * 4);
      g.fillStyle = pal[0]; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      for (let layer = 1; layer <= 3; layer++) {
        const off = (layer - 1) * r * 0.12;
        for (let i = 0; i < clumps; i++) {
          const a = i / clumps * TAU + R() * 0.5, d = r * (0.55 - layer * 0.12) * (0.7 + R() * 0.4);
          const cx = x + Math.cos(a) * d - off, cy = y + Math.sin(a) * d - off, cr = r * (0.5 - layer * 0.08) * (0.8 + R() * 0.3);
          g.fillStyle = pal[layer]; g.beginPath(); g.arc(cx, cy, cr, 0, TAU); g.fill();
        }
      }
      for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,255,220,.08)'; g.beginPath(); g.arc(x - r * 0.35 + R() * r * 0.2, y - r * 0.35 + R() * r * 0.2, r * 0.18, 0, TAU); g.fill(); }
    }
  };
})();
