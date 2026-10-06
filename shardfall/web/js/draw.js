/* Rendering: procedural crystal art for heroes, map, effects, HUD bars and minimap. */
(function (SF) {
  const W = SF.WORLD, TAU = Math.PI * 2;

  // Hero silhouettes in local units (pointing up). Heroes are living crystal "Shardborn".
  const SHAPES = {
    blade: [[0, -1.3], [0.42, -0.4], [0.32, 0.5], [0, 0.82], [-0.32, 0.5], [-0.42, -0.4]],
    drop:  [[0, -1.25], [0.36, -0.62], [0.56, -0.02], [0.44, 0.5], [0, 0.78], [-0.44, 0.5], [-0.56, -0.02], [-0.36, -0.62]],
    leaf:  [[0, -1.35], [0.3, -0.62], [0.38, 0.06], [0.22, 0.6], [0, 0.82], [-0.22, 0.6], [-0.38, 0.06], [-0.3, -0.62]],
    block: [[-0.52, -0.95], [0.52, -0.95], [0.74, -0.2], [0.62, 0.72], [-0.62, 0.72], [-0.74, -0.2]],
    star:  [[0, -1.32], [0.24, -0.46], [0.78, -0.32], [0.3, 0.08], [0.42, 0.78], [0, 0.46], [-0.42, 0.78], [-0.3, 0.08], [-0.78, -0.32], [-0.24, -0.46]],
    halo:  Array.from({ length: 8 }, (_, i) => [Math.cos(i / 8 * TAU + TAU / 16) * 0.68, Math.sin(i / 8 * TAU + TAU / 16) * 0.78 - 0.2]),
    spire: [[0, -1.45], [0.22, -0.7], [0.4, -0.1], [0.26, 0.55], [0, 0.8], [-0.26, 0.55], [-0.4, -0.1], [-0.22, -0.7]],
    axe:   [[0, -1.05], [0.6, -0.7], [0.66, 0.1], [0.36, 0.75], [-0.36, 0.75], [-0.66, 0.1], [-0.6, -0.7]],
    prism: [[0, -1.35], [0.34, -0.35], [0.62, 0.7], [-0.62, 0.7], [-0.34, -0.35]],
    gear:  [[0, -1.3], [0.38, -0.9], [0.7, -0.5], [0.62, 0.1], [0.72, 0.55], [0.3, 0.8], [-0.3, 0.8], [-0.72, 0.55], [-0.62, 0.1], [-0.7, -0.5], [-0.38, -0.9]],
    shell: [[0, -0.95], [0.45, -0.82], [0.75, -0.35], [0.8, 0.2], [0.55, 0.72], [-0.55, 0.72], [-0.8, 0.2], [-0.75, -0.35], [-0.45, -0.82]]
  };
  // Graphics settings (set from the lobby): low = no glow blur and fewer cosmetic particles.
  SF.gfx = SF.gfx || { low: false, numbers: true };
  const blur = v => (SF.gfx.low ? 0 : v);
  // Passives that build stacks, and how many pips they show (Galewind: the 4th attack fires).
  const PASSIVE_PIPS = { kindling: 2, galewind: 3, overcharge: 3, focus: 4 };
  const AURA = { frost: '#cfefff', gold: '#ffe27a', bubbles: '#8ff7ff', leaf: '#ffb35c', storm: '#c8d4ff', embers: '#ff8a3d', void: '#8a5bff' };

  function poly(g, pts, x, y, s) {
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(x + px * s, y + py * s) : g.moveTo(x + px * s, y + py * s)));
    g.closePath();
  }
  function ellipse(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); }
  // Jagged path between two points (lightning, chains, cracks). Re-randomised every frame so it flickers.
  function zig(g, x1, y1, x2, y2, n, amp) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    g.beginPath(); g.moveTo(x1, y1);
    for (let i = 1; i < n; i++) { const k = i / n, o = (Math.random() - 0.5) * amp; g.lineTo(x1 + dx * k + nx * o, y1 + dy * k + ny * o); }
    g.lineTo(x2, y2);
  }

  // Hero sprites (assets/art/sprites, made from the splash art). Each loads the first time it's
  // asked for; until then, or if the file is missing, the hero is drawn as the procedural crystal.
  const sprites = new Map();
  SF.sprites = {
    // Returns the loaded sprite, or null (and starts loading it). onReady runs once it loads.
    get(heroId, skinId, onReady) {
      const src = SF.spriteFor(heroId, skinId);
      if (!src || typeof Image === 'undefined') return null;
      let e = sprites.get(src);
      if (!e) {
        e = { img: new Image(), ok: false, waiting: [] };
        e.img.decoding = 'async';
        e.img.onload = () => { e.ok = true; const w = e.waiting; e.waiting = null; w.forEach(f => f()); };
        e.img.onerror = () => { e.waiting = null; };
        e.img.src = src;
        sprites.set(src, e);
      }
      if (e.ok) return e;
      if (onReady && e.waiting) e.waiting.push(onReady);
      return null;
    },
    preload(list) { list.forEach(([heroId, skinId]) => this.get(heroId, skinId)); }
  };
  const SPRITE = { frame: 400, foot: 8, figure: 368 };   // must match tools/fetch-art.mjs
  const SPRITE_H = 86;                                   // figure height in world units at scale 1
  const facing = new WeakMap();
  // White silhouette of a sprite for the hit flash, made once per sprite at half size.
  function flashOf(sp) {
    if (!sp.flash) {
      const c = document.createElement('canvas'); c.width = c.height = SPRITE.frame / 2;
      const x = c.getContext('2d'); x.drawImage(sp.img, 0, 0, c.width, c.height);
      x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      sp.flash = c;
    }
    return sp.flash;
  }

  // Draws a hero at ground point (x, y). Used both in matches and the lobby showcase.
  // Returns the y of the top of the figure, for things drawn above the head.
  // o.state: any object that lives as long as the hero (the match unit); it keeps the facing steady.
  // o.sprite === false forces the procedural crystal.
  function drawHero(g, o) {
    const def = SF.HERO[o.heroId];
    const sk = SF.SKIN[o.skinId] || SF.SKIN[SF.defaultSkin(o.heroId)];
    const s = 24 * (o.scale || 1), t = o.t || 0, x = o.x, y = o.y;
    const face = o.face || { x: 1, y: 0.2 };
    let fx = face.x >= 0 ? 1 : -1;
    // Only turn round on a clear sideways move, so walking straight up or down doesn't flicker.
    if (o.state) { const prev = facing.get(o.state); if (prev && Math.abs(face.x) < 0.3) fx = prev; else facing.set(o.state, fx); }
    const bob = Math.sin(t * 3 + (o.seed || 0)) * 2 * (o.scale || 1) + (o.moving ? Math.abs(Math.sin(t * 9)) * -3 * (o.scale || 1) : 0);
    const sp = o.sprite !== false && SF.sprites.get(o.heroId, sk.id);
    if (sp) return drawSprite(g, o, def, sk, sp, fx, bob);
    const cy = y - s * 1.3 + bob;
    g.save();
    g.globalAlpha = o.alpha == null ? 1 : o.alpha;
    if (o.ring) {
      ellipse(g, x, y, s * 1.2, s * 0.5);
      g.fillStyle = o.ring + '2e'; g.fill();
      g.lineWidth = 2.5 * (o.scale || 1); g.strokeStyle = o.ring; g.stroke();
    }
    ellipse(g, x, y + 2, s * 0.85, s * 0.3); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
    const glow = g.createRadialGradient(x, cy, 0, x, cy, s * 1.7);
    glow.addColorStop(0, sk.c3 + '55'); glow.addColorStop(1, sk.c3 + '00');
    g.fillStyle = glow; g.beginPath(); g.arc(x, cy, s * 1.7, 0, TAU); g.fill();

    const pts = SHAPES[def.shape];
    if (def.shape === 'halo') drawWeapon(g, def.shape, sk, x, cy, s, face, fx, t);
    const grad = g.createLinearGradient(x - s, cy - s, x + s, cy + s);
    grad.addColorStop(0, sk.c3); grad.addColorStop(0.4, sk.c1); grad.addColorStop(1, sk.c2);
    poly(g, pts, x, cy, s); g.fillStyle = grad; g.fill();
    g.lineWidth = 1.5 * (o.scale || 1); g.strokeStyle = sk.c2; g.stroke();
    // facets
    g.save(); poly(g, pts, x, cy, s); g.clip();
    for (let i = 0; i < pts.length; i += 2) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      g.beginPath(); g.moveTo(x, cy - s * 0.1); g.lineTo(x + a[0] * s, cy + a[1] * s); g.lineTo(x + b[0] * s, cy + b[1] * s); g.closePath();
      g.fillStyle = 'rgba(255,255,255,.13)'; g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;
    pts.forEach(([px, py]) => { g.beginPath(); g.moveTo(x, cy - s * 0.1); g.lineTo(x + px * s, cy + py * s); g.stroke(); });
    g.restore();
    // heart gem
    g.beginPath(); g.arc(x, cy - s * 0.12, s * 0.15, 0, TAU);
    g.fillStyle = sk.c3; g.shadowColor = sk.c3; g.shadowBlur = blur(10 * (o.scale || 1)); g.fill(); g.shadowBlur = 0;
    if (def.shape !== 'halo') drawWeapon(g, def.shape, sk, x, cy, s, face, fx, t);
    if (sk.crown) {
      for (let i = 0; i < 3; i++) {
        const a = t * 1.6 + i * TAU / 3, cx = x + Math.cos(a) * s * 0.75, cyy = cy - s * 1.35 + Math.sin(a) * s * 0.18;
        poly(g, [[0, -1], [0.6, 0], [0, 1], [-0.6, 0]], cx, cyy, s * 0.16);
        g.fillStyle = sk.c3; g.shadowColor = sk.c1; g.shadowBlur = blur(8); g.fill(); g.shadowBlur = 0;
      }
    }
    if (o.flash > 0) { poly(g, pts, x, cy, s); g.fillStyle = `rgba(255,255,255,${Math.min(0.7, o.flash * 7)})`; g.fill(); }
    g.restore();
    return cy - s * 1.45;
  }

  function drawSprite(g, o, def, sk, sp, fx, bob) {
    const sc = o.scale || 1, x = o.x, y = o.y, t = o.t || 0, s = 24 * sc;
    const H = SPRITE_H * sc * (def.role === 'Tank' ? 1.06 : 1);   // figure height
    const D = H * SPRITE.frame / SPRITE.figure;                   // whole frame, drawn square
    const feet = y + 3 * sc;                                       // feet sit just inside the ring
    const base = o.alpha == null ? 1 : o.alpha;
    g.save();
    g.globalAlpha *= base;
    const a0 = g.globalAlpha;
    if (o.ring) {
      ellipse(g, x, y, s * 1.2, s * 0.5);
      g.fillStyle = o.ring + '2e'; g.fill();
      g.lineWidth = 2.5 * sc; g.strokeStyle = o.ring; g.stroke();
    }
    ellipse(g, x, y + 2, s * 0.85, s * 0.3); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
    const gy = feet - H * 0.45;
    const glow = g.createRadialGradient(x, gy, 0, x, gy, H * 0.6);
    glow.addColorStop(0, sk.c3 + '33'); glow.addColorStop(1, sk.c3 + '00');
    g.fillStyle = glow; g.beginPath(); g.arc(x, gy, H * 0.6, 0, TAU); g.fill();
    // Breathe while idle; lean into the step and bounce while moving. Pivot at the feet.
    const breathe = 1 + Math.sin(t * 3 + (o.seed || 0)) * 0.012;
    const lean = o.moving ? fx * (0.07 + Math.sin(t * 9) * 0.03) : 0;
    g.translate(x, feet + Math.min(0, bob));
    g.rotate(lean);
    g.scale(fx / breathe, breathe);
    const dx = -D / 2, dy = -D * (SPRITE.frame - SPRITE.foot) / SPRITE.frame;
    g.drawImage(sp.img, dx, dy, D, D);
    if (o.flash > 0) {
      g.globalAlpha = a0 * Math.min(0.75, o.flash * 7);
      g.drawImage(flashOf(sp), dx, dy, D, D);
    }
    g.restore();
    return feet + Math.min(0, bob) - H;
  }

  function drawWeapon(g, shape, sk, x, cy, s, face, fx, t) {
    g.save();
    g.lineCap = 'round';
    switch (shape) {
      case 'blade': {
        const bx = x + fx * s * 0.62, by = cy + s * 0.15;
        g.strokeStyle = sk.c3; g.lineWidth = s * 0.16; g.shadowColor = sk.c1; g.shadowBlur = blur(12);
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + fx * s * 0.5, by - s * 1.05); g.stroke();
        g.shadowBlur = 0; g.strokeStyle = sk.c2; g.lineWidth = s * 0.12;
        g.beginPath(); g.moveTo(bx - s * 0.18, by + s * 0.02); g.lineTo(bx + s * 0.18, by - s * 0.02); g.stroke();
        break;
      }
      case 'drop': {
        const a = t * 2.2;
        g.beginPath(); g.arc(x + Math.cos(a) * s * 0.95, cy + Math.sin(a) * s * 0.4, s * 0.2, 0, TAU);
        g.fillStyle = sk.c3; g.shadowColor = sk.c1; g.shadowBlur = blur(14); g.fill();
        g.beginPath(); g.ellipse(x, cy + s * 0.2, s * 0.95, s * 0.4, 0, 0, TAU); g.strokeStyle = sk.c1 + '88'; g.lineWidth = 1.5; g.shadowBlur = 0; g.stroke();
        break;
      }
      case 'leaf': {
        const bx = x + fx * s * 0.55;
        g.strokeStyle = sk.c3; g.lineWidth = s * 0.1; g.shadowColor = sk.c1; g.shadowBlur = blur(8);
        g.beginPath(); g.arc(bx - fx * s * 0.25, cy, s * 0.8, fx > 0 ? -1.1 : Math.PI - 1.1 + 0.0, fx > 0 ? 1.1 : Math.PI + 1.1); g.stroke();
        g.shadowBlur = 0; g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.7)';
        const ex = bx - fx * s * 0.25 + Math.cos(1.1) * s * 0.8 * fx;
        g.beginPath(); g.moveTo(ex, cy - Math.sin(1.1) * s * 0.8); g.lineTo(ex, cy + Math.sin(1.1) * s * 0.8); g.stroke();
        break;
      }
      case 'block': {
        const bx = x + fx * s * 0.72, by = cy + s * 0.05;
        g.beginPath(); g.roundRect(bx - s * 0.2, by - s * 0.62, s * 0.4, s * 1.2, s * 0.12);
        g.fillStyle = sk.c2; g.fill(); g.lineWidth = 2; g.strokeStyle = sk.c3; g.stroke();
        g.beginPath(); g.arc(bx, by, s * 0.1, 0, TAU); g.fillStyle = sk.c3; g.fill();
        break;
      }
      case 'star': {
        g.strokeStyle = sk.c3; g.lineWidth = s * 0.09; g.shadowColor = sk.c1; g.shadowBlur = blur(10);
        for (const side of [-1, 1]) {
          const bx = x + side * s * 0.7, by = cy + s * 0.25;
          g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + side * s * 0.3, by - s * 0.55); g.stroke();
        }
        break;
      }
      case 'spire': {
        for (let i = 0; i < 3; i++) {
          const a = t * 3.2 + i * TAU / 3, px = x + Math.cos(a) * s * 0.85, py = cy + Math.sin(a) * s * 0.35 - s * 0.1;
          poly(g, [[0, -1], [0.55, 0], [0, 1], [-0.55, 0]], px, py, s * 0.16);
          g.fillStyle = i ? sk.c1 : sk.c3; g.shadowColor = sk.c3; g.shadowBlur = blur(10); g.fill();
        }
        break;
      }
      case 'axe': {
        const hx = x + fx * s * 0.5, hy = cy + s * 0.45, ex = x + fx * s * 0.82, ey = cy - s * 0.95;
        g.strokeStyle = sk.c2; g.lineWidth = s * 0.11;
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(ex, ey); g.stroke();
        g.beginPath(); g.moveTo(ex - fx * s * 0.05, ey - s * 0.05); g.quadraticCurveTo(ex + fx * s * 0.55, ey + s * 0.05, ex + fx * s * 0.05, ey + s * 0.55); g.closePath();
        g.fillStyle = sk.c3; g.shadowColor = sk.c1; g.shadowBlur = blur(10); g.fill();
        break;
      }
      case 'prism': {
        const px = x + fx * s * 0.75, py = cy - s * 0.1 + Math.sin(t * 4) * s * 0.06;
        poly(g, [[0, -1], [0.85, 0.6], [-0.85, 0.6]], px, py, s * 0.24);
        g.fillStyle = sk.c3; g.shadowColor = sk.c1; g.shadowBlur = blur(14); g.fill();
        g.strokeStyle = sk.c1 + '99'; g.lineWidth = 1.5;
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(px + fx * s * 0.2, py); g.lineTo(px + fx * s * 0.7, py + i * s * 0.3); g.stroke(); }
        break;
      }
      case 'shell': {
        const ax = x + fx * s * 0.85, ay = cy - s * 0.15;
        g.strokeStyle = sk.c3; g.lineWidth = s * 0.09;
        g.beginPath(); g.moveTo(ax, ay - s * 0.45); g.lineTo(ax, ay + s * 0.45); g.stroke();
        g.beginPath(); g.arc(ax, ay + s * 0.15, s * 0.32, 0.2, Math.PI - 0.2); g.stroke();
        g.beginPath(); g.moveTo(ax - s * 0.2, ay - s * 0.25); g.lineTo(ax + s * 0.2, ay - s * 0.25); g.stroke();
        g.beginPath(); g.arc(ax, ay - s * 0.52, s * 0.09, 0, TAU); g.stroke();
        break;
      }
      case 'halo': {
        g.beginPath(); g.ellipse(x, cy - s * 1.15, s * 0.55, s * 0.16, 0, 0, TAU);
        g.strokeStyle = sk.c3; g.lineWidth = s * 0.1; g.shadowColor = sk.c1; g.shadowBlur = blur(16); g.stroke();
        const a = t * 1.5;
        g.beginPath(); g.arc(x + Math.cos(a) * s * 0.9, cy + Math.sin(a) * s * 0.35 + s * 0.1, s * 0.13, 0, TAU); g.fillStyle = sk.c1; g.fill();
        break;
      }
    }
    g.restore();
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    const m = v => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
    return '#' + ((1 << 24) + (m(r) << 16) + (m(gg) << 8) + m(b)).toString(16).slice(1);
  }
  SF.shade = shade;

  function drawMinion(g, u, t) {
    const c = SF.TEAM_COLORS[u.team], lo = shade(c, -0.45), hi = shade(c, 0.45);
    const r = u.r, bob = Math.sin(u.anim * 2 + u.id) * 1.5, cy = u.y - r * 0.9 + bob;
    ellipse(g, u.x, u.y + 1, r * 0.9, r * 0.35); g.fillStyle = 'rgba(0,0,0,.3)'; g.fill();
    const grad = g.createLinearGradient(u.x - r, cy - r, u.x + r, cy + r);
    grad.addColorStop(0, hi); grad.addColorStop(1, lo);
    g.fillStyle = grad; g.strokeStyle = lo; g.lineWidth = 1.5;
    if (u.mtype === 'melee') poly(g, [[0, -1], [0.75, -0.1], [0.5, 0.75], [-0.5, 0.75], [-0.75, -0.1]], u.x, cy, r);
    else if (u.mtype === 'ranged') poly(g, [[0, -1.1], [0.8, 0.7], [-0.8, 0.7]], u.x, cy, r);
    else if (u.mtype === 'siege') poly(g, Array.from({ length: 6 }, (_, i) => [Math.cos(i / 6 * TAU) * 0.95, Math.sin(i / 6 * TAU) * 0.8]), u.x, cy, r);
    else {
      poly(g, [[0, -1.3], [0.7, -0.5], [0.85, 0.4], [0.4, 0.8], [-0.4, 0.8], [-0.85, 0.4], [-0.7, -0.5]], u.x, cy, r);
      grad.addColorStop(0, '#d8fffb');
    }
    g.fill(); g.stroke();
    if (u.mtype === 'ranged') { g.beginPath(); g.arc(u.x, cy - r * 0.15, r * 0.25, 0, TAU); g.fillStyle = '#fff'; g.fill(); }
    if (u.mtype === 'golem') { g.beginPath(); g.arc(u.x, cy - r * 0.2, r * 0.22, 0, TAU); g.fillStyle = '#8ff7ff'; g.shadowColor = '#8ff7ff'; g.shadowBlur = blur(12); g.fill(); g.shadowBlur = 0; }
    if (u.flash > 0) { g.globalAlpha = 0.6; g.fillStyle = '#fff'; g.fill(); g.globalAlpha = 1; }
  }

  function drawStructure(g, u, t) {
    const c = SF.TEAM_COLORS[u.team];
    const core = u.kind === 'core';
    const r = u.r;
    ellipse(g, u.x, u.y, r * 1.15, r * 0.5); g.fillStyle = '#2b3048'; g.fill();
    ellipse(g, u.x, u.y - 4, r * 1.0, r * 0.42); g.fillStyle = '#3a4060'; g.fill();
    if (!u.alive) {
      for (let i = 0; i < 7; i++) { const a = i * 0.9; ellipse(g, u.x + Math.cos(a) * r * 0.6, u.y - 6 + Math.sin(a) * r * 0.2, 8, 5); g.fillStyle = i % 2 ? '#4b5170' : '#30354f'; g.fill(); }
      return;
    }
    const H = core ? 70 : 92, pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + u.id);
    if (!core) {
      g.beginPath(); g.moveTo(u.x - r * 0.5, u.y - 4); g.lineTo(u.x - r * 0.28, u.y - H); g.lineTo(u.x + r * 0.28, u.y - H); g.lineTo(u.x + r * 0.5, u.y - 4); g.closePath();
      const pg = g.createLinearGradient(u.x - r * 0.5, 0, u.x + r * 0.5, 0); pg.addColorStop(0, '#565d82'); pg.addColorStop(1, '#2d3250');
      g.fillStyle = pg; g.fill();
      const cy = u.y - H - 22 + Math.sin(t * 2 + u.id) * 3;
      const glow = g.createRadialGradient(u.x, cy, 0, u.x, cy, 50);
      glow.addColorStop(0, c + 'aa'); glow.addColorStop(1, c + '00');
      g.fillStyle = glow; g.beginPath(); g.arc(u.x, cy, 50, 0, TAU); g.fill();
      poly(g, [[0, -1.4], [0.6, 0], [0, 1], [-0.6, 0]], u.x, cy, 20);
      const cg = g.createLinearGradient(u.x - 12, cy - 28, u.x + 12, cy + 20); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.45, c); cg.addColorStop(1, shade(c, -0.5));
      g.fillStyle = cg; g.fill();
    } else {
      const cy = u.y - 46;
      const glow = g.createRadialGradient(u.x, cy, 0, u.x, cy, 110);
      glow.addColorStop(0, c + (pulse > 0.5 ? 'aa' : '88')); glow.addColorStop(1, c + '00');
      g.fillStyle = glow; g.beginPath(); g.arc(u.x, cy, 110, 0, TAU); g.fill();
      [[-30, 12, 22], [30, 12, 22], [0, -8, 34]].forEach(([dx, dy, s]) => {
        poly(g, [[0, -1.5], [0.55, -0.2], [0.4, 0.8], [-0.4, 0.8], [-0.55, -0.2]], u.x + dx, cy + dy, s);
        const cg = g.createLinearGradient(u.x + dx - s, cy - s, u.x + dx + s, cy + s); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.4, c); cg.addColorStop(1, shade(c, -0.55));
        g.fillStyle = cg; g.fill(); g.strokeStyle = shade(c, -0.6); g.lineWidth = 1.5; g.stroke();
      });
      g.beginPath(); g.ellipse(u.x, cy + 6, 70, 22, 0, t % TAU, t % TAU + 4.2); g.strokeStyle = c + 'aa'; g.lineWidth = 3; g.stroke();
    }
    if (u.flash > 0) { g.globalAlpha = 0.35; ellipse(g, u.x, u.y - H / 2, r * 0.8, H * 0.7); g.fillStyle = '#fff'; g.fill(); g.globalAlpha = 1; }
    if (u.guard && u.guard.alive) {
      g.setLineDash([6, 8]); g.beginPath(); g.ellipse(u.x, u.y, r * 1.3, r * 0.58, 0, 0, TAU); g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
    }
  }

  function drawMonster(g, u, t) {
    const r = u.r;
    ellipse(g, u.x, u.y + 2, r * 0.95, r * 0.35); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
    if (u.mtype === 'wisp') {
      const cy = u.y - r * 1.4 + Math.sin(t * 3 + u.id) * 4;
      const gr = g.createRadialGradient(u.x, cy, 2, u.x, cy, r * 1.3);
      gr.addColorStop(0, '#fff3c4'); gr.addColorStop(0.35, '#ff9d3d'); gr.addColorStop(1, 'rgba(255,90,40,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(u.x, cy, r * 1.3, 0, TAU); g.fill();
      if (Math.random() < 0.4) u.m.parts.push({ x: u.x + (Math.random() - 0.5) * r, y: cy, vx: 0, vy: -50, life: 0.6, max: 0.6, color: '#ffb347', size: 3 });
    } else if (u.mtype === 'wyrm') {
      // A coiled crystal serpent: body segments trail behind a raised head.
      const cy = u.y - r * 0.7, sway = Math.sin(t * 1.6) * 6;
      const glow = g.createRadialGradient(u.x, cy, 0, u.x, cy, r * 2.4);
      glow.addColorStop(0, 'rgba(180,140,255,.42)'); glow.addColorStop(1, 'rgba(180,140,255,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(u.x, cy, r * 2.4, 0, TAU); g.fill();
      const segs = 11;
      for (let i = segs; i >= 1; i--) {
        const k = i / segs;
        const sx = u.x - r * 0.2 + k * r * 2.1, sy = cy + r * 0.25 + Math.sin(k * 5 - t * 2) * r * 0.3 - (1 - k) * r * 0.2;
        const sr = r * (0.5 - 0.3 * k);
        poly(g, [[0, -1], [0.85, -0.2], [0.6, 0.8], [-0.6, 0.8], [-0.85, -0.2]], sx, sy, sr);
        const gr = g.createLinearGradient(sx, sy - sr, sx, sy + sr); gr.addColorStop(0, '#e6d6ff'); gr.addColorStop(0.5, '#8a5bff'); gr.addColorStop(1, '#2a1660');
        g.fillStyle = gr; g.fill(); g.strokeStyle = '#1c0f44'; g.lineWidth = 1.5; g.stroke();
        if (i % 3 === 0) { poly(g, [[0, -1], [0.35, 0], [0, 0.4], [-0.35, 0]], sx, sy - sr * 0.9, sr * 0.7); g.fillStyle = '#4fe3d3'; g.fill(); }
      }
      const hx = u.x - r * 0.45 + sway * 0.3, hy = cy - r * 0.45 + sway * 0.2;
      for (const s of [-1, 1]) { poly(g, [[0, -1], [0.3, 0], [0, 0.3], [-0.3, 0]], hx + s * r * 0.32, hy - r * 0.42, r * 0.38); g.fillStyle = '#4fe3d3'; g.fill(); }
      poly(g, [[0, -0.9], [0.8, -0.35], [0.95, 0.35], [0.4, 0.95], [-0.4, 0.95], [-0.95, 0.35], [-0.8, -0.35]], hx, hy, r * 0.62);
      const hg = g.createLinearGradient(hx - r, hy - r, hx + r, hy + r); hg.addColorStop(0, '#f2e8ff'); hg.addColorStop(0.45, '#9b6bff'); hg.addColorStop(1, '#331a7a');
      g.fillStyle = hg; g.fill(); g.strokeStyle = '#1c0f44'; g.lineWidth = 2; g.stroke();
      for (const s of [-1, 1]) { g.beginPath(); g.arc(hx + s * r * 0.22, hy - r * 0.02, r * 0.09, 0, TAU); g.fillStyle = '#7dfcf0'; g.shadowColor = '#4fe3d3'; g.shadowBlur = blur(12); g.fill(); g.shadowBlur = 0; }
      if (!SF.gfx.low && Math.random() < 0.35) u.m.parts.push({ x: u.x + (Math.random() - 0.5) * r * 2, y: cy + (Math.random() - 0.5) * r, vx: 0, vy: -40, life: 0.8, max: 0.8, color: '#c9a6ff', size: 3, shape: 'diamond' });
    } else if (u.mtype === 'thorn') {
      const cy = u.y - r * 0.8;
      const pts = Array.from({ length: 14 }, (_, i) => { const a = i / 14 * TAU, k = i % 2 ? 0.75 : 1.08; return [Math.cos(a) * k, Math.sin(a) * k * 0.8]; });
      poly(g, pts, u.x, cy, r);
      const gr = g.createLinearGradient(u.x, cy - r, u.x, cy + r); gr.addColorStop(0, '#9aa86a'); gr.addColorStop(1, '#3d4a26');
      g.fillStyle = gr; g.fill(); g.strokeStyle = '#2a331a'; g.lineWidth = 2; g.stroke();
      for (const s of [-1, 1]) { g.beginPath(); g.arc(u.x + s * r * 0.3, cy - r * 0.15, 3, 0, TAU); g.fillStyle = '#ffdd66'; g.fill(); }
    } else {
      const cy = u.y - r * 1.1 + Math.sin(t * 1.5) * 3;
      const glow = g.createRadialGradient(u.x, cy, 0, u.x, cy, r * 2.2);
      glow.addColorStop(0, 'rgba(143,247,255,.45)'); glow.addColorStop(1, 'rgba(143,247,255,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(u.x, cy, r * 2.2, 0, TAU); g.fill();
      poly(g, [[0, -1.2], [0.75, -0.6], [0.85, 0.35], [0.35, 0.85], [-0.35, 0.85], [-0.85, 0.35], [-0.75, -0.6]], u.x, cy, r);
      const gr = g.createLinearGradient(u.x - r, cy - r, u.x + r, cy + r); gr.addColorStop(0, '#e6ffff'); gr.addColorStop(0.45, '#4fe3d3'); gr.addColorStop(1, '#14505a');
      g.fillStyle = gr; g.fill(); g.strokeStyle = '#0e3b44'; g.lineWidth = 2; g.stroke();
      for (let i = 0; i < 4; i++) {
        const a = t * 1.2 + i * TAU / 4, sx = u.x + Math.cos(a) * r * 1.5, sy = cy + Math.sin(a) * r * 0.5;
        poly(g, [[0, -1], [0.55, 0], [0, 1], [-0.55, 0]], sx, sy, 12); g.fillStyle = '#9ffcff'; g.fill();
      }
      g.beginPath(); g.arc(u.x, cy - r * 0.2, r * 0.2, 0, TAU); g.fillStyle = '#fff'; g.shadowColor = '#8ff7ff'; g.shadowBlur = blur(16); g.fill(); g.shadowBlur = 0;
    }
    if (u.flash > 0) { g.globalAlpha = 0.4; g.beginPath(); g.arc(u.x, u.y - r, r, 0, TAU); g.fillStyle = '#fff'; g.fill(); g.globalAlpha = 1; }
  }

  // Quarra's constructions: a crystal turret (or the bigger bastion) on a team-coloured base.
  function drawSummon(g, u, t) {
    const big = u.mtype === 'bastion', r = u.r, col = u.color || '#7dffd8', team = SF.TEAM_COLORS[u.team];
    ellipse(g, u.x, u.y + 2, r * 1.1, r * 0.42); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
    ellipse(g, u.x, u.y, r * 1.05, r * 0.42); g.fillStyle = team + '44'; g.fill(); g.strokeStyle = team; g.lineWidth = 2; g.stroke();
    const h = big ? r * 2.6 : r * 1.9, top = u.y - h;
    // pillar
    poly(g, [[-0.55, 0], [-0.35, -1], [0.35, -1], [0.55, 0]], u.x, u.y - 4, h * 0.62);
    const gr = g.createLinearGradient(u.x - r, top, u.x + r, u.y); gr.addColorStop(0, '#f4fbff'); gr.addColorStop(0.5, '#b7c4d6'); gr.addColorStop(1, '#5d6b80');
    g.fillStyle = gr; g.fill(); g.strokeStyle = '#2a3346'; g.lineWidth = 1.5; g.stroke();
    // floating core that turns toward its target
    const a = u.target ? Math.atan2(u.target.y - u.y, u.target.x - u.x) : t;
    const cy = top + Math.sin(t * 3 + u.id) * 3;
    const glow = g.createRadialGradient(u.x, cy, 0, u.x, cy, r * 1.3); glow.addColorStop(0, col + 'aa'); glow.addColorStop(1, col + '00');
    g.fillStyle = glow; g.beginPath(); g.arc(u.x, cy, r * 1.3, 0, TAU); g.fill();
    poly(g, [[0, -1.2], [0.8, -0.2], [0.55, 0.8], [-0.55, 0.8], [-0.8, -0.2]], u.x, cy, r * (big ? 0.62 : 0.55));
    g.fillStyle = col; g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.stroke();
    g.beginPath(); g.arc(u.x + Math.cos(a) * r * 0.22, cy + Math.sin(a) * r * 0.12, r * 0.14, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
    if (big) for (let i = 0; i < 3; i++) { const b = t * 1.4 + i * TAU / 3; poly(g, [[0, -1], [0.5, 0], [0, 1], [-0.5, 0]], u.x + Math.cos(b) * r * 1.1, cy + Math.sin(b) * r * 0.4, 8); g.fillStyle = col; g.fill(); }
    // remaining life, as a thin arc under the base
    if (u.life != null) { g.beginPath(); g.ellipse(u.x, u.y, r * 1.05, r * 0.42, 0, Math.PI * 0.15, Math.PI * (0.15 + 1.7 * Math.max(0, u.life) / (big ? 8 : 12))); g.strokeStyle = '#ffffffcc'; g.lineWidth = 2.5; g.stroke(); }
    if (u.flash > 0) { g.globalAlpha = 0.45; g.beginPath(); g.arc(u.x, cy, r * 0.7, 0, TAU); g.fillStyle = '#fff'; g.fill(); g.globalAlpha = 1; }
  }
  // Prism Wall: a row of crystal spires along the line, rising in and fading out.
  function drawWall(g, w, t) {
    const k = Math.min(1, w.t / 0.15) * Math.min(1, (w.dur - w.t) / 0.3), n = 9;
    if (k <= 0) return;
    g.save(); g.globalAlpha = Math.max(0, k);
    g.beginPath(); g.moveTo(w.x - w.n.x * w.half, w.y - w.n.y * w.half); g.lineTo(w.x + w.n.x * w.half, w.y + w.n.y * w.half);
    g.strokeStyle = w.color + '66'; g.lineWidth = w.thick * 2; g.lineCap = 'round'; g.stroke();
    for (let i = 0; i < n; i++) {
      const f = (i / (n - 1)) * 2 - 1, x = w.x + w.n.x * w.half * f, y = w.y + w.n.y * w.half * f, h = (34 + (i % 2) * 14) * k;
      poly(g, [[0, -1], [0.32, -0.2], [0.24, 0.12], [-0.24, 0.12], [-0.32, -0.2]], x, y - 2, h);
      const gr = g.createLinearGradient(x, y - h, x, y); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, w.color); gr.addColorStop(1, '#25415a');
      g.fillStyle = gr; g.fill(); g.strokeStyle = '#ffffffaa'; g.lineWidth = 1; g.stroke();
    }
    g.restore();
  }

  // River power-up: a floating, spinning crystal in the shard's colour with its symbol inside.
  function drawRune(g, r, t) {
    const col = SF.RUNES[r.type].color, y = r.y - 34 + Math.sin(t * 3 + r.id) * 5, k = 0.5 + 0.5 * Math.sin(t * 4);
    ellipse(g, r.x, r.y + 2, 22, 8); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
    ellipse(g, r.x, r.y, 30 + k * 6, 12 + k * 2); g.strokeStyle = col; g.globalAlpha = 0.5; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1;
    const glow = g.createRadialGradient(r.x, y, 0, r.x, y, 40); glow.addColorStop(0, col + '88'); glow.addColorStop(1, col + '00');
    g.fillStyle = glow; g.beginPath(); g.arc(r.x, y, 40, 0, TAU); g.fill();
    const w = 15 * Math.abs(Math.cos(t * 1.8 + r.id));   // spin: the crystal narrows and widens
    poly(g, [[0, -1.45], [Math.max(0.25, w / 15) * 0.95, 0], [0, 1.25], [-Math.max(0.25, w / 15) * 0.95, 0]], r.x, y, 15);
    g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
    g.save(); g.strokeStyle = '#0b1029'; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
    if (r.type === 'haste') { g.moveTo(r.x - 5, y - 5); g.lineTo(r.x, y); g.lineTo(r.x - 5, y + 5); g.moveTo(r.x + 1, y - 5); g.lineTo(r.x + 6, y); g.lineTo(r.x + 1, y + 5); }
    else if (r.type === 'renewal') { g.moveTo(r.x, y - 6); g.lineTo(r.x, y + 6); g.moveTo(r.x - 6, y); g.lineTo(r.x + 6, y); }
    else if (r.type === 'bulwark') { g.moveTo(r.x - 5, y - 5); g.lineTo(r.x + 5, y - 5); g.lineTo(r.x + 5, y); g.lineTo(r.x, y + 6); g.lineTo(r.x - 5, y); g.closePath(); }
    else for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + Math.PI / 2; g.moveTo(r.x + Math.cos(a) * 6.5, y + Math.sin(a) * 6.5); g.lineTo(r.x - Math.cos(a) * 6.5, y - Math.sin(a) * 6.5); }
    g.stroke(); g.restore();
  }

  // ---- Map prerender ---------------------------------------------------------
  function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function buildMap() {
    const c = document.createElement('canvas'); c.width = W.w; c.height = W.h;
    const g = c.getContext('2d'), R = rng(7);
    g.fillStyle = '#163029'; g.fillRect(0, 0, W.w, W.h);
    for (let i = 0; i < 70; i++) {
      const x = R() * W.w, y = R() * W.h, r = 80 + R() * 200;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, R() < 0.5 ? 'rgba(8,24,20,.55)' : 'rgba(46,82,62,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const greens = ['#1d3c34', '#24493e', '#122b25', '#2a5446'];
    for (let i = 0; i < 9000; i++) { g.fillStyle = greens[i % 4]; g.fillRect(R() * W.w, R() * W.h, 2 + R() * 2, 2 + R() * 3); }
    // river
    g.beginPath();
    for (let y = 0; y <= W.h; y += 20) g.lineTo(W.riverX - 80 + Math.sin(y / 90) * 14, y);
    for (let y = W.h; y >= 0; y -= 20) g.lineTo(W.riverX + 80 + Math.sin(y / 80 + 1) * 14, y);
    g.closePath(); g.fillStyle = '#123e52'; g.fill();
    g.save(); g.clip();
    for (let i = 0; i < 260; i++) { g.fillStyle = R() < 0.5 ? 'rgba(120,200,230,.10)' : 'rgba(10,30,50,.3)'; g.fillRect(W.riverX - 90 + R() * 180, R() * W.h, 10 + R() * 30, 2); }
    g.restore();
    // lane path
    const L = W.laneY;
    g.beginPath();
    for (let x = 0; x <= W.w; x += 40) g.lineTo(x, L - 120 + Math.sin(x / 140) * 10);
    for (let x = W.w; x >= 0; x -= 40) g.lineTo(x, L + 120 + Math.sin(x / 120 + 2) * 10);
    g.closePath();
    g.fillStyle = '#4a463d'; g.fill();
    g.save(); g.clip();
    for (let i = 0; i < 1800; i++) {
      const x = R() * W.w, y = L - 130 + R() * 260, s = 10 + R() * 22;
      g.fillStyle = ['#544f45', '#433f37', '#5c574b', '#3b3831'][i % 4];
      g.beginPath(); g.ellipse(x, y, s, s * 0.55, R() * 3, 0, TAU); g.fill();
    }
    // bridge over the river
    g.fillStyle = 'rgba(80,58,38,.85)'; g.fillRect(W.riverX - 95, L - 112, 190, 224);
    for (let x = W.riverX - 95; x < W.riverX + 95; x += 14) { g.fillStyle = x % 28 ? '#6b4e33' : '#5a412b'; g.fillRect(x, L - 112, 12, 224); }
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 6; g.stroke();
    // bases
    [[110, '#4fb3ff'], [W.w - 110, '#ff5d6c']].forEach(([x, col]) => {
      g.beginPath(); g.arc(x, L, 250, 0, TAU); g.fillStyle = '#262b44'; g.fill();
      g.beginPath(); g.arc(x, L, 230, 0, TAU); g.fillStyle = '#2f3555'; g.fill();
      g.strokeStyle = col + '88'; g.lineWidth = 4; g.beginPath(); g.arc(x, L, 200, 0, TAU); g.stroke();
      g.lineWidth = 2; g.setLineDash([18, 12]); g.beginPath(); g.arc(x, L, 170, 0, TAU); g.stroke(); g.setLineDash([]);
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.save(); g.translate(x + Math.cos(a) * 215, L + Math.sin(a) * 215); g.rotate(a); g.fillStyle = col + 'aa'; g.fillRect(-6, -2, 12, 4); g.restore(); }
    });
    // shard altar
    g.save(); g.translate(W.riverX, 230);
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.lineTo(Math.cos(a) * 130, Math.sin(a) * 90); } g.closePath();
    g.fillStyle = '#26364a'; g.fill(); g.strokeStyle = '#4fe3d388'; g.lineWidth = 4; g.stroke();
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.5; g.lineTo(Math.cos(a) * 95, Math.sin(a) * 64); } g.closePath();
    g.strokeStyle = '#4fe3d355'; g.lineWidth = 2; g.stroke();
    g.restore();
    // wyrm abyss (bottom river): a dark rift ringed in violet
    g.save(); g.translate(W.riverX, 1050);
    g.beginPath(); g.ellipse(0, 0, 140, 92, 0, 0, TAU); g.fillStyle = '#1d1838'; g.fill(); g.strokeStyle = '#9b6bff88'; g.lineWidth = 4; g.stroke();
    g.beginPath(); g.ellipse(0, 0, 96, 60, 0, 0, TAU); g.strokeStyle = '#9b6bff44'; g.lineWidth = 2; g.stroke();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 100, Math.sin(a) * 64); g.lineTo(Math.cos(a) * 132, Math.sin(a) * 86); g.strokeStyle = '#b48cff55'; g.lineWidth = 3; g.stroke(); }
    g.restore();
    // camps
    [[1000, 270], [1000, 930], [2200, 930], [2200, 270]].forEach(([x, y]) => {
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; g.beginPath(); g.ellipse(x + Math.cos(a) * 70, y + Math.sin(a) * 34, 10, 7, 0, 0, TAU); g.fillStyle = i % 2 ? '#56604f' : '#424a3d'; g.fill(); }
    });
    // border forest
    const tree = (x, y, r) => {
      g.beginPath(); g.arc(x + r * 0.15, y + r * 0.2, r, 0, TAU); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = '#0f2a22'; g.fill();
      g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.6, 0, TAU); g.fillStyle = '#1c4636'; g.fill();
    };
    for (let x = -20; x < W.w + 40; x += 36) { tree(x + R() * 20, 20 + R() * 30, 34 + R() * 16); tree(x + R() * 20, W.h - 20 - R() * 30, 34 + R() * 16); }
    for (let i = 0; i < 26; i++) { tree(R() * 40, 80 + R() * (W.h - 160), 30 + R() * 20); tree(W.w - R() * 40, 80 + R() * (W.h - 160), 30 + R() * 20); }
    // decorative stones in the jungle
    for (let i = 0; i < 90; i++) {
      const x = 200 + R() * (W.w - 400), y = 90 + R() * (W.h - 180);
      if (Math.abs(y - L) < 150 || Math.abs(x - W.riverX) < 110) continue;
      g.beginPath(); g.ellipse(x, y, 6 + R() * 10, 4 + R() * 6, 0, 0, TAU); g.fillStyle = R() < 0.5 ? '#3c463d' : '#2c362f'; g.fill();
    }
    return c;
  }
  function buildBush(b) {
    const pad = 20, c = document.createElement('canvas');
    c.width = (b.rx + pad) * 2; c.height = (b.ry + pad) * 2 + 20;
    const g = c.getContext('2d'), R = rng(Math.round(b.x + b.y));
    const cx = c.width / 2, cy = c.height / 2 + 6;
    for (let i = 0; i < 70; i++) {
      const a = R() * TAU, rr = Math.sqrt(R());
      const x = cx + Math.cos(a) * b.rx * rr * 0.95, y = cy + Math.sin(a) * b.ry * rr * 0.95;
      const s = 9 + R() * 9;
      g.beginPath(); g.moveTo(x - s * 0.6, y + 4); g.quadraticCurveTo(x - s * 0.2, y - s * 1.6, x, y - s * 1.9); g.quadraticCurveTo(x + s * 0.2, y - s * 1.6, x + s * 0.6, y + 4); g.closePath();
      g.fillStyle = ['#2f7a4a', '#256a3e', '#3b8f57', '#1f5a35'][i % 4]; g.fill();
    }
    return { img: c, ox: cx, oy: cy };
  }

  // ---- Renderer --------------------------------------------------------------
  class Renderer {
    constructor(canvas, minimap) {
      this.c = canvas; this.g = canvas.getContext('2d');
      this.mm = minimap; this.mg = minimap.getContext('2d');
      this.map = buildMap();
      this.cam = { x: 600, y: W.laneY };
      this.bushImgs = null;
      this.resize();
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.c.clientWidth || window.innerWidth, h = this.c.clientHeight || window.innerHeight;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this.dpr = dpr; this.cw = w; this.ch = h;
      this.zoom = Math.min(h / 500, w / 860);
      const mw = this.mm.clientWidth || 192;
      this.mm.width = Math.round(mw * dpr); this.mm.height = Math.round(mw * dpr * W.h / W.w);
    }
    toScreen(x, y) { const z = this.zr || this.zoom; return { x: (x - this.x0) * z, y: (y - this.y0) * z }; }
    toWorld(sx, sy) { const z = this.zr || this.zoom; return { x: this.x0 + sx / z, y: this.y0 + sy / z }; }
    // Kill impact: a quick zoom punch and a gold flash at the screen edges.
    kick(power = 1) { this.kickT = 0.4; this.kickP = power; }

    draw(m, aim) {
      const g = this.g, dpr = this.dpr, t = m.t, p = m.player;
      const now = performance.now(), fdt = Math.min(0.05, (now - (this.lastNow || now)) / 1000); this.lastNow = now;
      if (this.kickT > 0) this.kickT = Math.max(0, this.kickT - fdt);
      const kick = this.kickT > 0 ? Math.pow(this.kickT / 0.4, 2) * (this.kickP || 1) : 0;
      const z = this.zr = this.zoom * (1 + 0.06 * kick);
      if (!this.bushImgs) this.bushImgs = m.bushes.map(buildBush);
      const vw = this.cw / z, vh = this.ch / z;
      const focus = p.alive ? p : p.spawn;
      this.cam.x += (focus.x - this.cam.x) * 0.18; this.cam.y += (focus.y - this.cam.y) * 0.18;
      const cx = Math.max(vw / 2, Math.min(W.w - vw / 2, this.cam.x)), cy = Math.max(vh / 2, Math.min(W.h - vh / 2, this.cam.y));
      let sx = 0, sy = 0;
      if (m.shakeT > 0) { sx = (Math.random() - 0.5) * m.shakeMag; sy = (Math.random() - 0.5) * m.shakeMag; }
      this.x0 = cx - vw / 2 + sx; this.y0 = cy - vh / 2 + sy;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#0b1029'; g.fillRect(0, 0, this.c.width, this.c.height);
      g.setTransform(z * dpr, 0, 0, z * dpr, -this.x0 * z * dpr, -this.y0 * z * dpr);
      const mx = Math.max(0, Math.floor(this.x0)), my = Math.max(0, Math.floor(this.y0));
      const mw = Math.min(W.w - mx, Math.ceil(vw) + 2), mh = Math.min(W.h - my, Math.ceil(vh) + 2);
      if (mw > 0 && mh > 0) g.drawImage(this.map, mx, my, mw, mh, mx, my, mw, mh);
      const inView = (x, y, pad = 160) => x > this.x0 - pad && x < this.x0 + vw + pad && y > this.y0 - pad && y < this.y0 + vh + pad;

      // river shimmer
      if (inView(W.riverX, cy, 400)) {
        g.strokeStyle = 'rgba(160,230,255,.18)'; g.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
          const yy = ((t * 30 + i * 130) % W.h);
          g.beginPath(); g.moveTo(W.riverX - 50 + Math.sin(i) * 20, yy); g.lineTo(W.riverX - 20 + Math.sin(i) * 20, yy + 6); g.stroke();
        }
      }
      // fountains
      m.fountains.forEach((f, team) => {
        if (!inView(f.x, f.y, 300)) return;
        const c = SF.TEAM_COLORS[team], pulse = 0.5 + 0.5 * Math.sin(t * 2);
        const gr = g.createRadialGradient(f.x, f.y, 10, f.x, f.y, f.r);
        gr.addColorStop(0, c + '55'); gr.addColorStop(1, c + '00');
        g.fillStyle = gr; g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.fill();
        g.beginPath(); g.arc(f.x, f.y, 40 + pulse * 6, 0, TAU); g.strokeStyle = c; g.lineWidth = 3; g.stroke();
      });
      // zones
      for (const zn of m.zones) this.drawZone(g, zn, t);
      this.drawSignals(g, m);
      for (const w of m.walls || []) drawWall(g, w, t);
      for (const r of m.runes || []) if (inView(r.x, r.y)) drawRune(g, r, t);
      // player indicators
      if (p.alive) {
        if (p.attackHeld || p.target) { g.beginPath(); g.ellipse(p.x, p.y, p.range + p.r, (p.range + p.r) * 0.92, 0, 0, TAU); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; g.stroke(); }
        if (aim) this.drawAim(g, m, p, aim);
        if (p.recallT > 0) {
          const k = 1 - p.recallT / 3;
          g.beginPath(); g.arc(p.x, p.y, 46, -Math.PI / 2, -Math.PI / 2 + k * TAU); g.strokeStyle = '#8fd3ff'; g.lineWidth = 4; g.stroke();
          for (let i = 0; i < 3; i++) { const yy = p.y - ((t * 60 + i * 30) % 90); g.globalAlpha = 0.5; g.beginPath(); g.ellipse(p.x, yy, 30, 10, 0, 0, TAU); g.strokeStyle = '#8fd3ff'; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1; }
        }
        const tg = p.target;
        if (tg && tg.alive) { g.beginPath(); g.ellipse(tg.x, tg.y, tg.r * 1.3, tg.r * 0.55, 0, 0, TAU); g.strokeStyle = '#ff5d6c'; g.lineWidth = 2.5; g.stroke(); }
      }
      // tower range warning
      for (const s of m.units) {
        if (!s.alive || (s.kind !== 'tower' && s.kind !== 'core') || s.team === 0 || !p.alive) continue;
        const dd = Math.hypot(p.x - s.x, p.y - s.y);
        if (dd < s.range + 180) {
          g.beginPath(); g.ellipse(s.x, s.y, s.range, s.range * 0.92, 0, 0, TAU);
          g.strokeStyle = s.target === p ? 'rgba(255,93,108,.8)' : 'rgba(255,93,108,.3)'; g.lineWidth = s.target === p ? 4 : 2; g.stroke();
        }
      }
      // units (y-sorted)
      const list = m.units.filter(u => (u.alive || u.kind === 'tower' || u.kind === 'core' || u.deadT < 0.6) && inView(u.x, u.y) && (u.kind !== 'hero' || u.alive) && m.visible(u, 0));
      list.sort((a, b) => a.y - b.y);
      for (const u of list) {
        g.save();
        if (!u.alive) g.globalAlpha = Math.max(0, 1 - u.deadT / 0.6);
        if (u.kind === 'hero') {
          const sk = SF.SKIN[u.skin];
          if (sk && sk.aura && Math.random() < (SF.gfx.low ? 0.08 : 0.35) && m.parts.length < 650) {
            m.parts.push({ x: u.x + (Math.random() - 0.5) * 36, y: u.y - Math.random() * 50, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30, life: 0.9, max: 0.9, color: AURA[sk.aura], size: 2.5 + Math.random() * 2.5, shape: sk.aura === 'frost' || sk.aura === 'gold' || sk.aura === 'storm' ? 'diamond' : 'dot' });
          }
          const ring = u === p ? '#5be38a' : SF.TEAM_COLORS[u.team];
          let alpha = 1;
          if (u.team === 0 && (u.invisT > 0 || (u.bush >= 0 && !u.vis[1]))) alpha = 0.55;
          const top = drawHero(g, { heroId: u.def0.id, skinId: u.skin, x: u.x, y: u.y, face: u.face, t: t + u.id, scale: 1, ring, moving: u.moving, alpha, flash: u.flash, seed: u.id, state: u });
          if (u.aegis || (u.hasBuff && u.hasBuff('aegis'))) {
            // Wyrm Aegis: a violet ring with four turning shards around the feet.
            g.save(); g.translate(u.x, u.y);
            g.beginPath(); g.ellipse(0, 0, 40, 17, 0, 0, TAU); g.strokeStyle = 'rgba(197,139,255,.85)'; g.lineWidth = 3; g.shadowColor = '#c58bff'; g.shadowBlur = blur(12); g.stroke(); g.shadowBlur = 0;
            for (let i = 0; i < 4; i++) { const a = t * 1.6 + i * TAU / 4; poly(g, [[0, -1], [0.55, 0], [0, 1], [-0.55, 0]], Math.cos(a) * 40, Math.sin(a) * 17 - 6, 7); g.fillStyle = '#efe0ff'; g.fill(); }
            g.restore();
          }
          if (u.reborn || u.rebornT > m.t) { g.globalAlpha = 0.5; ellipse(g, u.x, u.y - 40, 40, 56); g.fillStyle = 'rgba(230,208,255,.35)'; g.fill(); g.globalAlpha = 1; }
          const pv = u.def0 && u.def0.passive, pipN = pv && PASSIVE_PIPS[pv.id];
          if (pipN && u.pstack > 0) {
            // Passive stacks: small diamonds over the head, all lit (and glowing) when the next one fires.
            const full = u.pstack >= pipN, col = (SF.SKIN[u.skin] || {}).c1 || '#fff';
            for (let i = 0; i < pipN; i++) {
              poly(g, [[0, -1], [0.62, 0], [0, 1], [-0.62, 0]], u.x + (i - (pipN - 1) / 2) * 13, top - 2, 6);
              g.fillStyle = i < u.pstack ? (full ? '#ffe27a' : col) : 'rgba(10,14,30,.55)';
              if (full) { g.shadowColor = '#ffe27a'; g.shadowBlur = blur(10); }
              g.fill(); g.shadowBlur = 0; g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,.6)'; g.stroke();
            }
          }
          if (u.stunT > 0) { for (let i = 0; i < 3; i++) { const a = t * 6 + i * TAU / 3; g.beginPath(); g.arc(u.x + Math.cos(a) * 16, top - 18 + Math.sin(a) * 5, 3.5, 0, TAU); g.fillStyle = '#ffe27a'; g.fill(); } }
          if (u.shield > 0) { const ry = (u.y - top) / 2 + 10; g.beginPath(); g.ellipse(u.x, u.y - ry + 12, 36, ry, 0, 0, TAU); g.strokeStyle = 'rgba(230,240,255,.5)'; g.lineWidth = 2; g.stroke(); }
        } else if (u.kind === 'minion') drawMinion(g, u, t);
        else if (u.kind === 'monster') drawMonster(g, u, t);
        else if (u.kind === 'summon') drawSummon(g, u, t);
        else drawStructure(g, u, t);
        g.restore();
      }
      // projectiles
      for (const pr of m.projs) {
        if (!inView(pr.x, pr.y)) continue;
        const yo = pr.homing ? 0 : -24;
        g.save(); g.translate(pr.x, pr.y + yo); g.rotate(pr.ang || 0);
        g.shadowColor = pr.color; g.shadowBlur = blur(12);
        if (pr.kind === 'hook') {
          g.restore(); g.save();
          g.setLineDash([6, 5]); g.beginPath(); g.moveTo(pr.src.x, pr.src.y - 24); g.lineTo(pr.x, pr.y - 24); g.strokeStyle = '#c9d6e8'; g.lineWidth = 3; g.stroke(); g.setLineDash([]);
          g.translate(pr.x, pr.y - 24); g.rotate(pr.ang || 0);
          g.strokeStyle = pr.color; g.lineWidth = 4; g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.stroke();
          g.beginPath(); g.arc(4, 0, 12, -1.3, 1.3); g.stroke();
        } else if (pr.kind === 'arrow') { g.strokeStyle = pr.color; g.lineWidth = 4; g.beginPath(); g.moveTo(-26, 0); g.lineTo(10, 0); g.stroke(); g.fillStyle = '#fff'; poly(g, [[1, 0], [-0.4, 0.5], [-0.4, -0.5]], 12, 0, 8); g.fill(); }
        else if (pr.kind === 'wave') { g.fillStyle = pr.color + 'cc'; g.beginPath(); g.ellipse(0, 0, 34, pr.r, 0, -1.4, 1.4); g.lineTo(-10, 0); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, 34, pr.r, 0, -1.2, 1.2); g.stroke(); }
        else { g.fillStyle = pr.color; g.beginPath(); g.arc(0, 0, pr.r, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, pr.r * 0.45, 0, TAU); g.fill(); }
        g.restore();
      }
      // particles
      for (const pa of m.parts) {
        if (!inView(pa.x, pa.y, 40)) continue;
        g.globalAlpha = Math.max(0, pa.life / pa.max);
        g.fillStyle = pa.color;
        if (pa.shape === 'diamond') { poly(g, [[0, -1], [0.6, 0], [0, 1], [-0.6, 0]], pa.x, pa.y, pa.size); g.fill(); }
        else { g.beginPath(); g.arc(pa.x, pa.y, pa.size, 0, TAU); g.fill(); }
      }
      g.globalAlpha = 1;
      // fx
      for (const f of m.fx) {
        const k = f.t / f.dur;
        g.globalAlpha = 1 - k;
        if (f.type === 'ring') { g.beginPath(); g.ellipse(f.x, f.y, f.r * (0.4 + 0.6 * k), f.r * (0.4 + 0.6 * k) * 0.9, 0, 0, TAU); g.strokeStyle = f.color; g.lineWidth = f.w; g.stroke(); }
        else if (f.type === 'slash') { g.beginPath(); g.arc(f.x, f.y - 20, 26, f.ang - 1 + k, f.ang + 0.6 + k); g.strokeStyle = f.color; g.lineWidth = 5 * (1 - k) + 1; g.stroke(); }
        else if (f.type === 'beam') { zig(g, f.x, f.y - 22, f.x2, f.y2 - 22, 7, 14); g.strokeStyle = f.color; g.lineWidth = 5; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
        else if (f.type === 'lightning') { zig(g, f.x, f.y - 420, f.x, f.y, 9, 30); g.strokeStyle = f.color; g.lineWidth = 7; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke(); }
        else if (f.type === 'arc') { g.beginPath(); g.moveTo(f.x, f.y); g.arc(f.x, f.y, f.r * (0.6 + 0.4 * k), f.ang - 0.75, f.ang + 0.75); g.closePath(); g.fillStyle = f.color + '66'; g.fill(); g.strokeStyle = f.color; g.lineWidth = 3; g.stroke(); }
        else if (f.type === 'fissure') {
          const ex = f.x + f.dir.x * f.len, ey = f.y + f.dir.y * f.len;
          zig(g, f.x, f.y, ex, ey, 12, 16); g.strokeStyle = '#1a0d06'; g.lineWidth = 16; g.stroke(); g.strokeStyle = f.color; g.lineWidth = 6; g.stroke();
        }
        else if (f.type === 'lance') {
          const ex = f.x + f.dir.x * f.len, ey = f.y + f.dir.y * f.len;
          g.beginPath(); g.moveTo(f.x, f.y - 24); g.lineTo(ex, ey - 24); g.strokeStyle = f.color; g.lineWidth = 34 * (1 - k) + 2; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 10 * (1 - k) + 1; g.stroke();
        }
      }
      g.globalAlpha = 1;
      // bushes (drawn over units so heroes inside are tucked in)
      m.bushes.forEach((b, i) => {
        if (!inView(b.x, b.y, 200)) return;
        const im = this.bushImgs[i];
        g.globalAlpha = p.alive && p.bush === i ? 0.45 : 0.93;
        g.drawImage(im.img, b.x - im.ox, b.y - im.oy);
      });
      g.globalAlpha = 1;

      // ---- screen-space overlays (bars, names, numbers) ----
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (kick > 0.01) {
        const vg = g.createRadialGradient(this.cw / 2, this.ch / 2, Math.min(this.cw, this.ch) * 0.35, this.cw / 2, this.ch / 2, Math.max(this.cw, this.ch) * 0.75);
        vg.addColorStop(0, 'rgba(255,214,90,0)'); vg.addColorStop(1, `rgba(255,214,90,${0.35 * Math.min(1, kick)})`);
        g.fillStyle = vg; g.fillRect(0, 0, this.cw, this.ch);
      }
      for (const u of list) {
        if (!u.alive) continue;
        const s = this.toScreen(u.x, u.y);
        if (u.kind === 'hero') this.heroBar(g, u, s, u === p);
        else if (u.kind === 'tower' || u.kind === 'core') this.bar(g, s.x, s.y - (u.kind === 'core' ? 150 : 140) * z, 70, 7, u.hpPct, SF.TEAM_COLORS[u.team], 0);
        else if (u.hp < u.maxHp) this.bar(g, s.x, s.y - (u.r * 2 + 10) * z, u.kind === 'monster' ? 64 : 30, 4, u.hpPct, u.kind === 'monster' ? '#f0d38a' : SF.TEAM_COLORS[u.team], 0);
      }
      g.textAlign = 'center';
      for (const f of m.floats) {
        const s = this.toScreen(f.x, f.y), k = f.t / f.dur;
        g.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4;
        g.font = `800 ${Math.round(15 * f.scale * (k < 0.15 ? 1 + (0.15 - k) * 3 : 1))}px 'Saira Condensed', 'Arial Narrow', sans-serif`;
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(f.text, s.x, s.y); g.fillStyle = f.color; g.fillText(f.text, s.x, s.y);
      }
      g.globalAlpha = 1;
      this.drawMinimap(m);
    }

    heroBar(g, u, s, isMe) {
      const z = this.zr || this.zoom, y = s.y - 92 * z - 14, w = 64, h = 7;
      const col = isMe ? '#5be38a' : SF.TEAM_COLORS[u.team];
      this.bar(g, s.x + 6, y, w, h, u.hpPct, col, u.shield / u.maxHp, u.maxHp);
      g.beginPath(); g.arc(s.x - w / 2 - 4, y + h / 2, 9, 0, TAU); g.fillStyle = '#0d1230'; g.fill(); g.strokeStyle = col; g.lineWidth = 1.5; g.stroke();
      g.font = "800 11px 'Saira Condensed', 'Arial Narrow', sans-serif"; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(u.level, s.x - w / 2 - 4, y + h / 2 + 4);
      g.font = "600 11px 'Barlow', system-ui, sans-serif"; g.fillStyle = isMe ? '#d9ffe4' : u.team === 0 ? '#cfe8ff' : '#ffd0d5';
      g.fillText(u.name, s.x + 6, y - 4);
    }
    bar(g, x, y, w, h, pct, col, shieldPct, maxHp) {
      g.fillStyle = 'rgba(5,8,25,.75)'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
      g.fillStyle = col; g.fillRect(x - w / 2, y, w * Math.max(0, pct), h);
      if (shieldPct > 0) { g.fillStyle = 'rgba(240,245,255,.85)'; g.fillRect(x - w / 2 + w * pct, y, Math.min(w * shieldPct, w * (1 - pct) + 6), h); }
      if (maxHp) { g.fillStyle = 'rgba(0,0,0,.45)'; for (let k = 1000; k < maxHp; k += 1000) g.fillRect(x - w / 2 + w * k / maxHp, y, 1, h); }
    }
    drawZone(g, zn, t) {
      if (zn.kind === 'whirl') {
        if (!zn.started) {
          const k = zn.t / zn.delay;
          g.beginPath(); g.ellipse(zn.x, zn.y, zn.r, zn.r * 0.9, 0, 0, TAU); g.fillStyle = zn.color + '22'; g.fill();
          g.beginPath(); g.ellipse(zn.x, zn.y, zn.r * k, zn.r * 0.9 * k, 0, 0, TAU); g.fillStyle = zn.color + '44'; g.fill();
          g.strokeStyle = zn.color; g.lineWidth = 2; g.setLineDash([8, 6]); g.beginPath(); g.ellipse(zn.x, zn.y, zn.r, zn.r * 0.9, 0, 0, TAU); g.stroke(); g.setLineDash([]);
        } else {
          for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(zn.x, zn.y, zn.r * (0.4 + i * 0.25), zn.r * 0.9 * (0.4 + i * 0.25), 0, t * 8 + i, t * 8 + i + 4); g.strokeStyle = zn.color; g.lineWidth = 4; g.stroke(); }
        }
      } else if (zn.kind === 'static') {
        g.beginPath(); g.ellipse(zn.x, zn.y, zn.r, zn.r * 0.9, 0, 0, TAU); g.fillStyle = zn.color + '26'; g.fill();
        g.strokeStyle = zn.color; g.lineWidth = 2; g.stroke();
        for (let i = 0; i < 3; i++) { const a = Math.random() * TAU, b = Math.random() * TAU; zig(g, zn.x + Math.cos(a) * zn.r * 0.8, zn.y + Math.sin(a) * zn.r * 0.7, zn.x + Math.cos(b) * zn.r * 0.8, zn.y + Math.sin(b) * zn.r * 0.7, 5, 18); g.strokeStyle = '#ffffffcc'; g.lineWidth = 1.5; g.stroke(); }
      } else if (zn.kind === 'tempest') {
        g.beginPath(); g.ellipse(zn.x, zn.y, zn.r, zn.r * 0.9, 0, 0, TAU); g.fillStyle = 'rgba(20,10,40,.35)'; g.fill();
        g.setLineDash([10, 8]); g.strokeStyle = zn.color; g.lineWidth = 2.5; g.stroke(); g.setLineDash([]);
        g.beginPath(); g.ellipse(zn.x, zn.y, zn.r * 0.7, zn.r * 0.63, 0, t * 4, t * 4 + 4); g.strokeStyle = zn.color + '88'; g.lineWidth = 4; g.stroke();
      } else if (zn.kind === 'fissure' || zn.kind === 'charge') {
        const o = zn.follow || zn, k = Math.min(1, zn.t / (zn.dur || 1));
        const ex = o.x + zn.dir.x * zn.len, ey = o.y + zn.dir.y * zn.len, w = zn.kind === 'fissure' ? 90 : 64;
        g.save(); g.translate(o.x, o.y); g.rotate(Math.atan2(zn.dir.y, zn.dir.x));
        g.fillStyle = zn.color + '22'; g.fillRect(0, -w / 2, zn.len, w);
        g.fillStyle = zn.color + '55'; g.fillRect(0, -w / 2, zn.len * k, w);
        g.strokeStyle = zn.color; g.lineWidth = 2; g.setLineDash([8, 6]); g.strokeRect(0, -w / 2, zn.len, w); g.setLineDash([]);
        g.restore();
        if (zn.kind === 'charge') { g.beginPath(); g.moveTo(o.x, o.y - 24); g.lineTo(ex, ey - 24); g.strokeStyle = '#ffffff'; g.lineWidth = 1 + k * 3; g.stroke(); }
      } else if (zn.kind === 'dome') {
        const gr = g.createRadialGradient(zn.x, zn.y - 30, zn.r * 0.2, zn.x, zn.y, zn.r);
        gr.addColorStop(0, zn.color + '10'); gr.addColorStop(1, zn.color + '55');
        g.fillStyle = gr; g.beginPath(); g.ellipse(zn.x, zn.y, zn.r, zn.r * 0.9, 0, 0, TAU); g.fill();
        g.strokeStyle = zn.color; g.lineWidth = 4; g.stroke();
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t, yy = zn.y - ((t * 60 + i * 25) % 110); g.beginPath(); g.arc(zn.x + Math.cos(a) * zn.r * 0.7, yy + Math.sin(a) * zn.r * 0.4, 5, 0, TAU); g.strokeStyle = '#ffffffaa'; g.lineWidth = 1.5; g.stroke(); }
      } else if (zn.kind === 'sanct') {
        const gr = g.createRadialGradient(zn.x, zn.y, 0, zn.x, zn.y, zn.r);
        gr.addColorStop(0, zn.color + '44'); gr.addColorStop(1, zn.color + '11');
        g.fillStyle = gr; g.beginPath(); g.ellipse(zn.x, zn.y, zn.r, zn.r * 0.9, 0, 0, TAU); g.fill();
        g.strokeStyle = zn.color; g.lineWidth = 3; g.stroke();
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * TAU + t, yy = zn.y - ((t * 50 + i * 20) % 80);
          g.beginPath(); g.arc(zn.x + Math.cos(a) * zn.r * 0.6, yy + Math.sin(a) * zn.r * 0.3, 4, 0, TAU); g.fillStyle = '#ffffffaa'; g.fill();
        }
      }
    }
    drawAim(g, m, p, aim) {
      const s = p.def0.skills[aim.i];
      const a = m.resolveAim(p, aim.i, aim.manual);
      g.save();
      g.strokeStyle = 'rgba(143,211,255,.75)'; g.fillStyle = 'rgba(143,211,255,.16)'; g.lineWidth = 2;
      if (s.range) { g.beginPath(); g.ellipse(p.x, p.y, s.range, s.range * 0.92, 0, 0, TAU); g.setLineDash([10, 8]); g.stroke(); g.setLineDash([]); }
      if (s.ground && a.point) { g.beginPath(); g.ellipse(a.point.x, a.point.y, s.ai === 'fight' ? 220 : 130, (s.ai === 'fight' ? 220 : 130) * 0.9, 0, 0, TAU); g.fill(); g.stroke(); }
      else if (s.needsTarget) { if (a.target) { g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(a.target.x, a.target.y); g.stroke(); g.beginPath(); g.ellipse(a.target.x, a.target.y, 34, 16, 0, 0, TAU); g.strokeStyle = '#ff5d6c'; g.lineWidth = 3; g.stroke(); } }
      else if (s.id === 'cleave') { g.beginPath(); g.moveTo(p.x, p.y); g.arc(p.x, p.y, s.range, Math.atan2(a.dir.y, a.dir.x) - 0.75, Math.atan2(a.dir.y, a.dir.x) + 0.75); g.closePath(); g.fill(); g.stroke(); }
      else if (s.kind === 'nova' || (s.range && s.range < 270 && s.kind !== 'dash')) { g.beginPath(); g.ellipse(p.x, p.y, s.range, s.range * 0.92, 0, 0, TAU); g.fill(); }
      else if (s.range) {
        const wdt = s.id === 'leviathan_surge' ? 120 : s.id === 'earthsplitter' ? 90 : s.id === 'solar_lance' ? 64 : s.id === 'storm_volley' || s.id === 'refraction' ? 0 : 36;
        g.translate(p.x, p.y); g.rotate(Math.atan2(a.dir.y, a.dir.x));
        if (wdt) { g.fillRect(0, -wdt / 2, s.range, wdt); g.strokeRect(0, -wdt / 2, s.range, wdt); }
        else { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s.range, -0.42, 0.42); g.closePath(); g.fill(); g.stroke(); }
      }
      g.restore();
    }
    // Your team's quick signals: pulsing rings and an icon on the spot (following a hero target).
    drawSignals(g, m) {
      for (const s of m.signals || []) {
        const age = m.t - s.t;
        if (s.team !== 0 || age > 4 || age < 0) continue;
        const T = s.target, follow = s.kind !== 'retreat' && T && T.alive !== false && T.kind === 'hero';
        const x = follow ? T.x : s.x, y = follow ? T.y : s.y, col = SF.SIGNALS[s.kind].color;
        const fade = Math.min(1, (4 - age) / 0.6);
        g.save();
        for (let i = 0; i < 2; i++) {
          const k = (age * 1.4 + i * 0.5) % 1;
          g.globalAlpha = fade * (1 - k) * 0.9;
          g.beginPath(); g.ellipse(x, y, 30 + 70 * k, (30 + 70 * k) * 0.45, 0, 0, TAU);
          g.strokeStyle = col; g.lineWidth = 4; g.stroke();
        }
        // icon on a stalk above the spot
        const iy = y - 118 - Math.sin(age * 6) * 4;
        g.globalAlpha = fade;
        g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x, iy + 22); g.stroke();
        g.beginPath(); g.arc(x, iy, 22, 0, TAU); g.fillStyle = 'rgba(5,8,25,.85)'; g.fill(); g.lineWidth = 3; g.stroke();
        g.lineWidth = 3.5; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath();
        if (s.kind === 'attack') { g.moveTo(x - 10, iy - 10); g.lineTo(x + 10, iy + 10); g.moveTo(x + 10, iy - 10); g.lineTo(x - 10, iy + 10); }
        else if (s.kind === 'retreat') { g.moveTo(x - 9, iy - 6); g.lineTo(x, iy + 6); g.lineTo(x + 9, iy - 6); }
        else { g.moveTo(x - 7, iy + 11); g.lineTo(x - 7, iy - 11); g.lineTo(x + 9, iy - 6); g.lineTo(x - 7, iy - 1); }
        g.stroke();
        g.restore();
      }
    }
    drawMinimap(m) {
      const g = this.mg, w = this.mm.width, h = this.mm.height, k = w / W.w;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(12,22,34,.88)'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#4a463d'; g.fillRect(0, (W.laneY - 110) * k, w, 220 * k);
      g.fillStyle = '#1b5a74'; g.fillRect((W.riverX - 70) * k, 0, 140 * k, h);
      const dot = (x, y, r, c, stroke) => { g.beginPath(); g.arc(x * k, y * k, r, 0, TAU); g.fillStyle = c; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = Math.max(1, r * 0.5); g.stroke(); } };
      const px = Math.max(1.5, w / 130);
      for (const c of m.camps) if (c.unit && c.unit.alive) dot(c.x, c.y, px * 1.1, '#c9b27a');
      if (m.shard && m.shard.alive) dot(m.shard.x, m.shard.y, px * 2, '#4fe3d3', '#fff');
      if (m.wyrm && m.wyrm.alive) dot(m.wyrm.x, m.wyrm.y, px * 2.2, '#9b6bff', '#fff');
      for (const r of m.runes || []) dot(r.x, r.y, px * 1.4, SF.RUNES[r.type].color, '#0b1029');
      for (const u of m.units) if (u.alive && u.kind === 'summon') dot(u.x, u.y, px * (u.mtype === 'bastion' ? 1.4 : 1), SF.TEAM_COLORS[u.team], '#fff');
      for (const u of m.units) {
        if (!u.alive) continue;
        if (u.kind === 'tower' || u.kind === 'core') { const s = u.kind === 'core' ? px * 3.2 : px * 2.4; g.fillStyle = SF.TEAM_COLORS[u.team]; g.fillRect(u.x * k - s / 2, u.y * k - s / 2, s, s); }
        else if (u.kind === 'minion') dot(u.x, u.y, px * 0.6, SF.TEAM_COLORS[u.team]);
      }
      for (const hh of m.heroes) {
        if (!hh.alive || !m.visible(hh, 0)) continue;
        dot(hh.x, hh.y, px * 2, hh === m.player ? '#5be38a' : SF.TEAM_COLORS[hh.team], hh === m.player ? '#fff' : '#0b1029');
      }
      for (const s of m.signals || []) {
        const age = m.t - s.t;
        if (s.team !== 0 || age > 4 || age < 0) continue;
        const r = px * (2 + 4 * ((age * 1.5) % 1));
        g.globalAlpha = Math.max(0, 1 - age / 4);
        g.beginPath(); g.arc(s.x * k, s.y * k, r, 0, TAU); g.strokeStyle = SF.SIGNALS[s.kind].color; g.lineWidth = Math.max(1.5, px * 0.7); g.stroke();
        g.globalAlpha = 1;
      }
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(1, px * 0.5);
      g.strokeRect(this.x0 * k, this.y0 * k, (this.cw / this.zoom) * k, (this.ch / this.zoom) * k);
    }
  }

  SF.drawHero = drawHero;
  SF.Renderer = Renderer;
})(window.SF);
