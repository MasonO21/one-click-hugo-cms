/*
 * Rainkeep town view. With WebGL (town3d.js) this canvas is the overlay: name
 * plates, level badges, timers and floaters drawn at the 3D scene's screen anchors,
 * plus all touch input (tap to open, drag to orbit, pinch or wheel to zoom).
 * Without WebGL it draws the whole keep in 2D. Also paints wyrm portraits for
 * sheets (KH.paintWyrms). Reads state only; all changes go through KH.ACT.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { $, clamp, rand, fmtTime, shade } = KH.u;
  const { PLOT, SHORT, UI, ACT } = KH;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.on('booted', () => { S = KH.S; makeIcons(); resize(); requestAnimationFrame(frame); });
  // resource icons as images, for surplus bubbles drawn on the canvas
  const icons = {};
  function makeIcons() {
    for (const r of KH.RES) {
      const sym = document.getElementById(KH.ICON[r]);
      if (!sym) continue;
      const img = new Image(), id = KH.ICON[r];
      // the painted icon where there is one, else the drawn symbol
      img.src = (KH.iconArt && KH.iconArt(id)) || `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48">${(KH.iconSVG && KH.iconSVG[id]) || sym.innerHTML}</svg>`)}`;
      icons[r] = img;
    }
  }

  const cv = $('#town');
  const townCtx = cv.getContext('2d');
  let ctx = townCtx; // drawing helpers draw on whichever context is current
  let VW = 0, VH = 0, DPR = 1;
  const T = { cx: 0, cy: 0, rx: 0, ry: 0, k: 1, top: 0, pos: {}, stars: [], ridges: [[], []], flakes: [], embers: [], hearts: [] };
  const SNOW = '#f3d9a8'; // sun-bleached roof caps in the 2D fallback

  function resize() {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    VW = r.width; VH = r.height;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
    T.top = Math.max(36, VH * 0.11);
    T.qh = $('#quest').offsetHeight || 70;
    const groundH = VH - T.top - (T.qh + 22);
    T.k = clamp(Math.min(VW / 400, VH / 560), 0.7, 1.2);
    // the same terraced layout as the 3D keep (DATA.keep), seen from above at a slant:
    // x across the screen, z down it, and height lifting things up the screen
    T.ux = (VW * 0.45) / 13.4;
    T.uz = Math.min((groundH - 80 * T.k) / 28.6, T.ux * 0.8);
    T.uy = T.uz * 0.8;
    T.cx = VW / 2;
    T.cy = T.top + 56 * T.k + 12.3 * T.uz + 4.4 * T.uy + Math.max(0, (groundH - 80 * T.k - 28.6 * T.uz) / 2);
    T.ry = 12.6 * T.uz;
    T.rx = 12.2 * T.ux;
    for (const p of DATA.plots) {
      const l = DATA.keep.plots[p.id], P = proj(l.x, l.y, l.z);
      T.pos[p.id] = { x: P.x, y: P.y, s: T.k * (0.78 + 0.24 * clamp((l.z + 13) / 26, 0, 1)) };
    }
    const sp = DATA.keep.spring;
    T.pos.wyrm = { ...proj(sp.x, 0, sp.z), s: T.k };
    T.stars = Array.from({ length: 60 }, () => ({ x: rand(0, VW), y: rand(0, T.top), r: rand(0.4, 1.3), p: rand(0, 6) }));
    const ridge = (h0, h1, step) => {
      const pts = [];
      for (let x = -20; x <= VW + 40; x += step * rand(0.6, 1.3)) pts.push([x, T.top - rand(h0, h1) * T.k]);
      return pts;
    };
    T.ridges = [ridge(14, 46, 38), ridge(4, 20, 26)];
    if (!T.flakes.length) T.flakes = Array.from({ length: 170 }, () => ({ x: Math.random(), y: Math.random(), z: rand(0.3, 1), p: rand(0, 6) }));
    const hb = $('#camhome');
    if (hb) hb.style.bottom = `${T.qh + 22}px`;
    const toasts = $('#toasts');
    toasts.style.top = 'auto';
    toasts.style.bottom = `${$('#tabs').offsetHeight + T.qh + 22}px`;
  }
  KH.resizeTown = resize;
  // the quest banner height decides how much ground is free for the ring of plots
  KH.renderHooks.push(() => { if (UI.tab === 'town' && $('#quest').offsetHeight !== T.qh) resize(); });

  // ======================================================================
  // Buildings
  // ======================================================================
  function proj(x, y, z) { return { x: T.cx + x * T.ux, y: T.cy + z * T.uz - y * T.uy }; }
  // terraces as raised slabs: the wall face first, then the lifted top
  function drawTerraces() {
    const lim = (VW / 2) / T.ux + 1.5;
    const pt = (x, y, z) => proj(clamp(x, -lim, lim), y, Math.max(z, -14.2));
    const poly = (pts, y) => { ctx.beginPath(); pts.forEach(([x, z], i) => { const P = pt(x, y, z); if (i) ctx.lineTo(P.x, P.y); else ctx.moveTo(P.x, P.y); }); ctx.closePath(); };
    for (const t of DATA.keep.terraces) {
      ctx.fillStyle = '#a8703f'; poly(t.pts, 0); ctx.fill();
      for (let k = 1; k < 4; k++) { ctx.fillStyle = k % 2 ? '#b77d48' : '#9c6638'; poly(t.pts, (t.y * k) / 4); ctx.fill(); }
      ctx.fillStyle = '#ddb075'; poly(t.pts, t.y); ctx.fill();
      ctx.strokeStyle = 'rgba(255,236,200,.55)'; ctx.lineWidth = 1.5; poly(t.pts, t.y); ctx.stroke();
    }
    const c = DATA.keep.crag, C = proj(c.x, 2.8, c.z), Ct = proj(c.x, c.y, c.z);
    ctx.fillStyle = '#9c5f38'; ell(C.x, C.y, c.r * T.ux, c.r * T.uz); ctx.fill();
    ctx.fillRect(C.x - c.r * T.ux, Ct.y, c.r * T.ux * 2, C.y - Ct.y);
    ctx.fillStyle = '#c98a52'; ell(Ct.x, Ct.y, c.r * T.ux, c.r * T.uz); ctx.fill();
    // stairs between the levels
    for (const s of DATA.keep.stairs) {
      const A0 = proj(s.a[0], s.a[2], s.a[1]), B0 = proj(s.b[0], s.b[2], s.b[1]), hw = (s.w / 2) * T.ux, n = 6;
      ctx.fillStyle = '#e6c08a';
      ctx.beginPath(); ctx.moveTo(A0.x - hw, A0.y); ctx.lineTo(A0.x + hw, A0.y); ctx.lineTo(B0.x + hw, B0.y); ctx.lineTo(B0.x - hw, B0.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(120,70,30,.5)'; ctx.lineWidth = 1;
      for (let i = 1; i < n; i++) { const y = A0.y + ((B0.y - A0.y) * i) / n; ctx.beginPath(); ctx.moveTo(A0.x - hw, y); ctx.lineTo(A0.x + hw, y); ctx.stroke(); }
    }
    // the sunken spring and its plaza
    const sp = DATA.keep.spring, P = proj(sp.x, 0, sp.z);
    ctx.fillStyle = '#e6c393'; ell(P.x, P.y, 7 * T.ux, 7 * T.uz); ctx.fill();
    ctx.strokeStyle = 'rgba(150,100,50,.4)'; ctx.lineWidth = 1.2;
    for (const r of [5.3, 4.6, 3.9]) { ell(P.x, P.y, r * T.ux, r * T.uz); ctx.stroke(); }
    ctx.fillStyle = '#b8895a'; ell(P.x, P.y + 0.4 * T.uz, 5.3 * T.ux, 5.3 * T.uz); ctx.fill();
    ctx.fillStyle = '#d4a874'; ell(P.x, P.y + 0.3 * T.uz, 4.6 * T.ux, 4.6 * T.uz); ctx.fill();
    ctx.fillStyle = '#c99a66'; ell(P.x, P.y + 0.2 * T.uz, 3.9 * T.ux, 3.9 * T.uz); ctx.fill();
    // the front wall and its gate
    const g = DATA.keep.gate, W0 = proj(-lim, 0, g.z), W1 = proj(lim, 0, g.z), hh = 1.7 * T.uy;
    ctx.fillStyle = '#b77d48'; ctx.fillRect(W0.x, W0.y - hh, W1.x - W0.x, hh);
    ctx.fillStyle = '#deaa70'; ctx.fillRect(W0.x, W0.y - hh - 3, W1.x - W0.x, 4);
    const G = proj(g.x, 0, g.z);
    ctx.fillStyle = '#5a3418'; ctx.fillRect(G.x - 1.6 * T.ux, G.y - hh * 0.85, 3.2 * T.ux, hh * 0.85);
  }
  function ell(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); }

  function hut(x, y, w, h, rh, wall, roof, lit) {
    const d = w * 0.3;
    ctx.fillStyle = 'rgba(8,16,30,.35)'; ell(x + d * 0.4, y + 2, w * 0.8, w * 0.22); ctx.fill();
    ctx.fillStyle = shade(wall, -0.3);
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2 + d, y - d * 0.5); ctx.lineTo(x + w / 2 + d, y - h - d * 0.5); ctx.lineTo(x + w / 2, y - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = wall; ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = shade(roof, -0.2);
    ctx.beginPath(); ctx.moveTo(x, y - h - rh); ctx.lineTo(x + d, y - h - rh - d * 0.5); ctx.lineTo(x + w / 2 + d + 2, y - h - d * 0.5 + 2); ctx.lineTo(x + w / 2 + 2, y - h + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = SNOW;
    ctx.beginPath(); ctx.moveTo(x, y - h - rh); ctx.lineTo(x + d, y - h - rh - d * 0.5); ctx.lineTo(x + w * 0.3 + d, y - h - rh * 0.42 - d * 0.5); ctx.lineTo(x + w * 0.3, y - h - rh * 0.42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.moveTo(x - w / 2 - 3, y - h + 2); ctx.lineTo(x, y - h - rh); ctx.lineTo(x + w / 2 + 3, y - h + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = SNOW;
    ctx.beginPath(); ctx.moveTo(x - w * 0.24, y - h - rh * 0.5); ctx.lineTo(x, y - h - rh - 1); ctx.lineTo(x + w * 0.24, y - h - rh * 0.5); ctx.quadraticCurveTo(x, y - h - rh * 0.62, x - w * 0.24, y - h - rh * 0.5); ctx.fill();
    ctx.fillStyle = '#24170f'; ctx.fillRect(x - w * 0.1, y - h * 0.62, w * 0.2, h * 0.62);
    ctx.fillStyle = lit ? '#ffc56a' : '#2b3442';
    if (lit) { ctx.shadowColor = '#ff9a3c'; ctx.shadowBlur = 8; }
    ctx.fillRect(x - w * 0.38, y - h * 0.72, w * 0.16, h * 0.26);
    ctx.fillRect(x + w * 0.22, y - h * 0.72, w * 0.16, h * 0.26);
    ctx.shadowBlur = 0;
    ctx.fillStyle = SNOW; ctx.fillRect(x - w / 2 - 1, y - 2, w + d + 2, 2.5);
  }
  function tent(x, y, w, h, col) {
    ctx.fillStyle = 'rgba(8,16,30,.3)'; ell(x, y + 1, w * 0.7, w * 0.2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x - w * 0.2, y - h * 0.5, x, y - h); ctx.quadraticCurveTo(x + w * 0.2, y - h * 0.5, x + w / 2, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(col, -0.3);
    ctx.beginPath(); ctx.moveTo(x, y - h); ctx.quadraticCurveTo(x + w * 0.2, y - h * 0.5, x + w / 2, y); ctx.lineTo(x + w * 0.12, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x - 3, y - h - 5); ctx.lineTo(x + 2, y - h + 4); ctx.moveTo(x + 3, y - h - 5); ctx.lineTo(x - 2, y - h + 4); ctx.stroke();
    ctx.fillStyle = '#2a1b12'; ctx.beginPath(); ctx.moveTo(x - w * 0.1, y); ctx.lineTo(x, y - h * 0.45); ctx.lineTo(x + w * 0.1, y); ctx.fill();
    ctx.fillStyle = SNOW; ctx.beginPath(); ctx.moveTo(x - w * 0.12, y - h * 0.72); ctx.lineTo(x, y - h); ctx.lineTo(x + w * 0.12, y - h * 0.72); ctx.fill();
  }

  function drawBuilding(pid, x, y, s, t) {
    const type = PLOT[pid].type, L = S.lv[pid];
    const lit = !!(DATA.buildings[type].prod ? S.workers[pid] : true);
    const w = 34 * s, h = 19 * s, rh = 15 * s;
    switch (type) {
      case 'shelter': {
        const n = L >= 7 ? 3 : L >= 4 ? 3 : 2;
        tent(x - 13 * s, y - 4 * s, 22 * s, 26 * s, '#8b6a4c');
        tent(x + 12 * s, y - 2 * s, 24 * s, 29 * s, '#7a5c43');
        if (n >= 3) tent(x, y + 5 * s, 20 * s, 23 * s, '#957457');
        if (L >= 7) hut(x - 2 * s, y + 6 * s, w * 0.7, h * 0.8, rh * 0.8, '#6e5039', '#3e2d21', true);
        break;
      }
      case 'quarry': {
        hut(x + 4 * s, y, w, h, rh, '#7a5434', '#4d3220', lit);
        ctx.fillStyle = '#6b4526';
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) {
          ell(x - 19 * s + j * 6 * s + i * 3 * s, y - 3 * s - i * 5 * s, 3 * s, 3 * s); ctx.fill();
          ctx.fillStyle = '#d9b07c'; ell(x - 19 * s + j * 6 * s + i * 3 * s, y - 3 * s - i * 5 * s, 1.6 * s, 1.6 * s); ctx.fill(); ctx.fillStyle = '#6b4526';
        }
        ctx.fillStyle = SNOW; ell(x - 14 * s, y - 15 * s, 7 * s, 2 * s); ctx.fill();
        break;
      }
      case 'grove': {
        hut(x, y, w, h, rh, '#6b5644', '#3f3024', lit);
        ctx.strokeStyle = '#efe2c9'; ctx.lineWidth = 1.6 * s; ctx.beginPath();
        ctx.moveTo(x, y - h - 1); ctx.lineTo(x - 7 * s, y - h - 7 * s); ctx.lineTo(x - 10 * s, y - h - 5 * s);
        ctx.moveTo(x - 7 * s, y - h - 7 * s); ctx.lineTo(x - 6 * s, y - h - 11 * s);
        ctx.moveTo(x, y - h - 1); ctx.lineTo(x + 7 * s, y - h - 7 * s); ctx.lineTo(x + 10 * s, y - h - 5 * s);
        ctx.moveTo(x + 7 * s, y - h - 7 * s); ctx.lineTo(x + 6 * s, y - h - 11 * s); ctx.stroke();
        ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 1.5 * s; ctx.beginPath();
        ctx.moveTo(x - 26 * s, y); ctx.lineTo(x - 26 * s, y - 20 * s); ctx.moveTo(x - 14 * s, y + 2 * s); ctx.lineTo(x - 14 * s, y - 18 * s);
        ctx.moveTo(x - 28 * s, y - 19 * s); ctx.lineTo(x - 12 * s, y - 17 * s); ctx.stroke();
        ctx.fillStyle = '#9a6a42'; ctx.fillRect(x - 24 * s, y - 18 * s, 4 * s, 9 * s);
        ctx.fillStyle = '#c99a62'; ctx.fillRect(x - 19 * s, y - 17.5 * s, 4 * s, 7 * s);
        break;
      }
      case 'well': {
        ctx.fillStyle = 'rgba(8,16,30,.35)'; ell(x, y + 2, 28 * s, 8 * s); ctx.fill();
        ctx.fillStyle = '#25282e'; ctx.beginPath(); ctx.moveTo(x - 26 * s, y); ctx.quadraticCurveTo(x - 10 * s, y - 22 * s, x + 2 * s, y - 16 * s); ctx.quadraticCurveTo(x + 16 * s, y - 20 * s, x + 26 * s, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#3a3f48'; ell(x - 8 * s, y - 10 * s, 6 * s, 4 * s); ctx.fill(); ell(x + 9 * s, y - 9 * s, 5 * s, 3 * s); ctx.fill();
        ctx.strokeStyle = '#7a5434'; ctx.lineWidth = 2.2 * s; ctx.beginPath();
        ctx.moveTo(x + 4 * s, y - 2 * s); ctx.lineTo(x + 12 * s, y - 34 * s); ctx.lineTo(x + 20 * s, y - 2 * s);
        ctx.moveTo(x + 7 * s, y - 16 * s); ctx.lineTo(x + 17 * s, y - 16 * s); ctx.stroke();
        ctx.strokeStyle = '#a8b2bd'; ctx.lineWidth = 1.5 * s; ell(x + 12 * s, y - 33 * s, 4 * s, 4 * s); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
          ctx.fillStyle = `rgba(255,${120 + i * 20},50,${0.35 + a * 0.6})`;
          ell(x - 14 * s + i * 7 * s, y - 5 * s - (i % 2) * 5 * s, 1.3 * s, 1.3 * s); ctx.fill();
        }
        ctx.fillStyle = '#5a4030'; ctx.fillRect(x - 24 * s, y - 6 * s, 10 * s, 5 * s);
        ctx.fillStyle = '#1d1f24'; ell(x - 19 * s, y - 7 * s, 5 * s, 2.2 * s); ctx.fill();
        break;
      }
      case 'mine': {
        ctx.fillStyle = 'rgba(8,16,30,.35)'; ell(x, y + 2, 28 * s, 8 * s); ctx.fill();
        ctx.fillStyle = '#5d6673'; ctx.beginPath(); ctx.moveTo(x - 27 * s, y); ctx.lineTo(x - 18 * s, y - 24 * s); ctx.lineTo(x - 4 * s, y - 32 * s); ctx.lineTo(x + 14 * s, y - 26 * s); ctx.lineTo(x + 27 * s, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7d8794'; ctx.beginPath(); ctx.moveTo(x - 18 * s, y - 24 * s); ctx.lineTo(x - 4 * s, y - 32 * s); ctx.lineTo(x - 2 * s, y - 18 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = SNOW; ctx.beginPath(); ctx.moveTo(x - 12 * s, y - 28 * s); ctx.lineTo(x - 4 * s, y - 32 * s); ctx.lineTo(x + 8 * s, y - 28 * s); ctx.quadraticCurveTo(x - 2 * s, y - 25 * s, x - 12 * s, y - 28 * s); ctx.fill();
        ctx.fillStyle = '#0d1014'; ctx.beginPath(); ctx.moveTo(x - 8 * s, y); ctx.lineTo(x - 8 * s, y - 11 * s); ctx.quadraticCurveTo(x, y - 19 * s, x + 8 * s, y - 11 * s); ctx.lineTo(x + 8 * s, y); ctx.fill();
        ctx.strokeStyle = '#7a5434'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(x - 9 * s, y); ctx.lineTo(x - 9 * s, y - 12 * s); ctx.lineTo(x + 9 * s, y - 12 * s); ctx.lineTo(x + 9 * s, y); ctx.stroke();
        if (lit) { ctx.fillStyle = '#ffc56a'; ctx.shadowColor = '#ff9a3c'; ctx.shadowBlur = 10; ell(x + 12 * s, y - 10 * s, 1.8 * s, 1.8 * s); ctx.fill(); ctx.shadowBlur = 0; }
        break;
      }
      case 'forge': {
        ctx.fillStyle = 'rgba(8,16,30,.35)'; ell(x, y + 2, 30 * s, 8 * s); ctx.fill();
        // chimney and smoke
        ctx.fillStyle = '#7a5a3e'; ctx.fillRect(x - 18 * s, y - 46 * s, 8 * s, 30 * s);
        ctx.fillStyle = '#9a7650'; ctx.fillRect(x - 19 * s, y - 48 * s, 10 * s, 3 * s);
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.35 + i / 3) % 1;
          ctx.fillStyle = `rgba(150,138,126,${0.45 * (1 - k)})`; ell(x - 14 * s + k * 8 * s, y - 52 * s - k * 22 * s, (3 + k * 6) * s, (3 + k * 5) * s); ctx.fill();
        }
        // furnace dome
        ctx.fillStyle = '#c8955a'; ctx.beginPath(); ctx.moveTo(x - 20 * s, y); ctx.lineTo(x - 20 * s, y - 16 * s); ctx.quadraticCurveTo(x - 20 * s, y - 34 * s, x - 2 * s, y - 34 * s); ctx.quadraticCurveTo(x + 16 * s, y - 34 * s, x + 16 * s, y - 16 * s); ctx.lineTo(x + 16 * s, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#a8764a'; ctx.beginPath(); ctx.moveTo(x + 4 * s, y - 34 * s); ctx.quadraticCurveTo(x + 16 * s, y - 33 * s, x + 16 * s, y - 16 * s); ctx.lineTo(x + 16 * s, y); ctx.lineTo(x + 6 * s, y); ctx.closePath(); ctx.fill();
        // glowing mouth
        const fl = 0.75 + 0.25 * Math.sin(t * 7.1) * Math.sin(t * 2.3 + 1);
        ctx.fillStyle = `rgba(255,${150 + 40 * fl | 0},60,1)`; ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 16 * fl;
        ctx.beginPath(); ctx.moveTo(x - 9 * s, y); ctx.lineTo(x - 9 * s, y - 9 * s); ctx.quadraticCurveTo(x - 2 * s, y - 18 * s, x + 5 * s, y - 9 * s); ctx.lineTo(x + 5 * s, y); ctx.fill(); ctx.shadowBlur = 0;
        // anvil and ingots
        ctx.fillStyle = '#6a4a2e'; ctx.fillRect(x + 20 * s, y - 7 * s, 6 * s, 7 * s);
        ctx.fillStyle = '#4a4a52'; ctx.fillRect(x + 17 * s, y - 11 * s, 13 * s, 4 * s); ctx.fillRect(x + 21 * s, y - 14 * s, 6 * s, 3 * s);
        ctx.fillStyle = '#e8b54a'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 18 * s + i * 5 * s, y + 3 * s, 4 * s, 2.4 * s);
        if (S.lv.forge >= 8) { ctx.fillStyle = '#ffe08a'; ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 8; ell(x - 26 * s, y - 2 * s, 5 * s, 2 * s); ctx.fill(); ctx.shadowBlur = 0; }
        break;
      }
      case 'infirmary': {
        hut(x, y, w, h, rh, '#cfc6b4', '#4f7a5a', true);
        ctx.fillStyle = '#eef6e6'; ell(x - 22 * s, y - 24 * s, 6 * s, 6 * s); ctx.fill();
        ctx.fillStyle = '#4f9a5a'; ctx.beginPath(); ctx.moveTo(x - 22 * s, y - 28 * s); ctx.quadraticCurveTo(x - 17 * s, y - 24 * s, x - 22 * s, y - 20 * s); ctx.quadraticCurveTo(x - 27 * s, y - 24 * s, x - 22 * s, y - 28 * s); ctx.fill();
        ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.moveTo(x - 22 * s, y - 18 * s); ctx.lineTo(x - 22 * s, y); ctx.stroke();
        break;
      }
      case 'barracks': {
        hut(x, y, w * 1.45, h * 1.05, rh * 1.05, '#6a4e3a', '#3a2a20', true);
        ctx.fillStyle = '#9aa6b2'; ell(x - 14 * s, y - 10 * s, 3.4 * s, 3.4 * s); ctx.fill(); ell(x + 14 * s, y - 10 * s, 3.4 * s, 3.4 * s); ctx.fill();
        ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(x + 30 * s, y); ctx.lineTo(x + 30 * s, y - 44 * s); ctx.stroke();
        const wave = Math.sin(t * 4) * 2 * s;
        ctx.fillStyle = '#ff7b2e'; ctx.beginPath(); ctx.moveTo(x + 30 * s, y - 44 * s); ctx.quadraticCurveTo(x + 38 * s, y - 42 * s + wave, x + 44 * s, y - 40 * s); ctx.lineTo(x + 30 * s, y - 34 * s); ctx.fill();
        break;
      }
      case 'watchtower': {
        const top = y - 50 * s;
        ctx.fillStyle = 'rgba(8,16,30,.35)'; ell(x, y + 2, 16 * s, 5 * s); ctx.fill();
        ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 2.2 * s; ctx.beginPath();
        ctx.moveTo(x - 11 * s, y); ctx.lineTo(x - 7 * s, top); ctx.moveTo(x + 11 * s, y); ctx.lineTo(x + 7 * s, top);
        ctx.moveTo(x - 10 * s, y - 12 * s); ctx.lineTo(x + 9 * s, y - 28 * s); ctx.moveTo(x + 10 * s, y - 12 * s); ctx.lineTo(x - 9 * s, y - 28 * s);
        ctx.moveTo(x - 9 * s, y - 32 * s); ctx.lineTo(x + 8 * s, y - 46 * s); ctx.stroke();
        ctx.fillStyle = '#5a3d26'; ctx.fillRect(x - 12 * s, top - 3 * s, 24 * s, 5 * s);
        ctx.fillStyle = '#7a5434'; ctx.fillRect(x - 10 * s, top - 12 * s, 3 * s, 9 * s); ctx.fillRect(x + 7 * s, top - 12 * s, 3 * s, 9 * s);
        ctx.fillStyle = '#3e2d21'; ctx.beginPath(); ctx.moveTo(x - 15 * s, top - 11 * s); ctx.lineTo(x, top - 22 * s); ctx.lineTo(x + 15 * s, top - 11 * s); ctx.fill();
        ctx.fillStyle = SNOW; ctx.beginPath(); ctx.moveTo(x - 8 * s, top - 16 * s); ctx.lineTo(x, top - 22 * s); ctx.lineTo(x + 8 * s, top - 16 * s); ctx.fill();
        const sweep = Math.sin(t * 0.6);
        const g = ctx.createRadialGradient(x, top - 6 * s, 0, x, top - 6 * s, 70 * s);
        g.addColorStop(0, 'rgba(255,214,140,.35)'); g.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, top - 6 * s);
        ctx.arc(x, top - 6 * s, 70 * s, Math.PI + sweep * 0.9 - 0.18, Math.PI + sweep * 0.9 + 0.18); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd27a'; ctx.shadowColor = '#ffb04a'; ctx.shadowBlur = 10; ell(x, top - 6 * s, 2.4 * s, 2.4 * s); ctx.fill(); ctx.shadowBlur = 0;
        break;
      }
      case 'archive': {
        hut(x, y, w * 1.15, h * 1.1, rh * 1.15, '#7f8a98', '#4a586b', true);
        ctx.fillStyle = '#ffd27a'; ctx.shadowColor = '#ffb04a'; ctx.shadowBlur = 8; ell(x, y - h * 1.1 - rh * 0.35, 3.2 * s, 3.2 * s); ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#b8c2cd'; ctx.lineWidth = 1.8 * s; ctx.beginPath(); ctx.moveTo(x + 14 * s, y - h * 1.1 - 2 * s); ctx.lineTo(x + 24 * s, y - h * 1.1 - 14 * s); ctx.stroke();
        break;
      }
      case 'hall': {
        hut(x, y, w * 1.3, h * 1.1, rh * 1.2, '#5b4636', '#2f3d55', true);
        ctx.fillStyle = '#c9a24a'; ell(x, y - h * 1.1 - rh * 0.4, 3.6 * s, 3.6 * s); ctx.fill();
        ctx.fillStyle = '#2f3d55'; ell(x, y - h * 1.1 - rh * 0.4, 2 * s, 2 * s); ctx.fill();
        const wave2 = Math.sin(t * 3.4) * 1.6 * s;
        for (const side of [-1, 1]) {
          const px = x + side * 24 * s;
          ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y - 34 * s); ctx.stroke();
          ctx.fillStyle = '#3f6fb5'; ctx.beginPath(); ctx.moveTo(px, y - 34 * s); ctx.lineTo(px + side * 9 * s, y - 32 * s + wave2); ctx.lineTo(px + side * 8 * s, y - 22 * s + wave2); ctx.lineTo(px, y - 24 * s); ctx.fill();
          ctx.fillStyle = '#ffcf6e'; ell(px + side * 4.5 * s, y - 28.5 * s + wave2 * 0.5, 1.4 * s, 1.4 * s); ctx.fill();
        }
        break;
      }
      case 'storehouse': {
        const sw = w * 1.15, sh = h * 1.15;
        ctx.fillStyle = 'rgba(8,16,30,.35)'; ell(x + 4 * s, y + 2, sw * 0.8, sw * 0.22); ctx.fill();
        ctx.fillStyle = '#6d7480'; ctx.fillRect(x - sw / 2, y - sh, sw, sh);
        ctx.fillStyle = '#585e69'; ctx.beginPath(); ctx.moveTo(x + sw / 2, y); ctx.lineTo(x + sw / 2 + 8 * s, y - 4 * s); ctx.lineTo(x + sw / 2 + 8 * s, y - sh - 4 * s); ctx.lineTo(x + sw / 2, y - sh); ctx.fill();
        ctx.strokeStyle = 'rgba(40,44,52,.55)'; ctx.lineWidth = 1;
        for (let r = 1; r < 4; r++) { ctx.beginPath(); ctx.moveTo(x - sw / 2, y - (sh * r) / 4); ctx.lineTo(x + sw / 2, y - (sh * r) / 4); ctx.stroke(); }
        ctx.fillStyle = '#3e4652'; ctx.beginPath(); ctx.moveTo(x - sw / 2 - 3, y - sh); ctx.lineTo(x - sw / 2 + 4, y - sh - 9 * s); ctx.lineTo(x + sw / 2 + 4 + 8 * s, y - sh - 13 * s); ctx.lineTo(x + sw / 2 + 3 + 8 * s, y - sh - 4 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = SNOW; ctx.beginPath(); ctx.moveTo(x - sw / 2, y - sh - 5 * s); ctx.lineTo(x - sw / 2 + 4, y - sh - 9 * s); ctx.lineTo(x + sw / 2 + 12 * s, y - sh - 13 * s); ctx.lineTo(x + sw / 2 + 6 * s, y - sh - 8 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#4a3322'; ctx.fillRect(x - 6 * s, y - sh * 0.7, 12 * s, sh * 0.7);
        ctx.strokeStyle = '#9aa6b2'; ctx.lineWidth = 1.4 * s; ctx.strokeRect(x - 6 * s, y - sh * 0.7, 12 * s, sh * 0.7);
        ctx.fillStyle = '#7a5434'; ell(x - sw / 2 - 4 * s, y - 3 * s, 4 * s, 3 * s); ctx.fill(); ell(x - sw / 2 - 9 * s, y - 2 * s, 3.5 * s, 2.6 * s); ctx.fill();
        break;
      }
      default: break;
    }
  }

  function drawPlot(pid, now, t) {
    const P = T.pos[pid], { x, y, s } = P, p = PLOT[pid], L = S.lv[pid];
    const locked = S.lv.wyrm < p.unlock;
    const job = S.builds.find((b) => b.plot === pid);
    if (UI.questTarget === pid) {
      const a = 0.45 + 0.35 * Math.sin(t * 4);
      ctx.strokeStyle = `rgba(255,207,110,${a})`; ctx.lineWidth = 2.5;
      ell(x, y - 2, 30 * s, 11 * s); ctx.stroke();
    }
    if (locked) {
      ctx.fillStyle = 'rgba(200,220,240,.18)'; ell(x, y, 22 * s, 8 * s); ctx.fill();
      ctx.fillStyle = '#c9d8e6'; ell(x, y - 3 * s, 14 * s, 6 * s); ctx.fill();
      ctx.fillStyle = 'rgba(20,32,50,.75)'; ctx.fillRect(x - 5 * s, y - 13 * s, 10 * s, 8 * s);
      ctx.strokeStyle = 'rgba(20,32,50,.75)'; ctx.lineWidth = 1.8 * s; ctx.beginPath(); ctx.arc(x, y - 13 * s, 3.4 * s, Math.PI, 0); ctx.stroke();
      label(x, y + 13 * s, `Wyrm Lv ${p.unlock}`, s, 'rgba(180,200,220,.75)');
      return;
    }
    if (!L && !job) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,230,180,.6)'; ctx.lineWidth = 1.5;
      ell(x, y - 2, 22 * s, 8 * s); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,207,110,.9)'; ctx.font = `700 ${18 * s}px 'Barlow Semi Condensed', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', x, y - 3);
      label(x, y + 13 * s, `Build ${SHORT[pid]}`, s * 0.95, '#ffd88f');
      return;
    }
    if (L) drawBuilding(pid, x, y, s, t);
    else { ctx.fillStyle = 'rgba(120,90,60,.5)'; ell(x, y, 20 * s, 7 * s); ctx.fill(); }
    if (job) {
      ctx.strokeStyle = 'rgba(214,170,110,.9)'; ctx.lineWidth = 1.5 * s; ctx.beginPath();
      for (let i = -1; i <= 1; i++) { ctx.moveTo(x + i * 12 * s, y); ctx.lineTo(x + i * 12 * s, y - 30 * s); }
      ctx.moveTo(x - 14 * s, y - 10 * s); ctx.lineTo(x + 14 * s, y - 10 * s); ctx.moveTo(x - 14 * s, y - 22 * s); ctx.lineTo(x + 14 * s, y - 22 * s);
      ctx.moveTo(x - 12 * s, y); ctx.lineTo(x + 12 * s, y - 22 * s); ctx.stroke();
      const frac = clamp((S.time - job.start) / (job.end - job.start), 0, 1);
      pill(x, y - 44 * s, fmtTime(job.end - S.time), s, frac);
    }
    if (L) {
      const bx = x + 20 * s, by = y - 3 * s;
      ctx.fillStyle = '#0b1320'; ell(bx, by, 8.5 * s, 8.5 * s); ctx.fill();
      ctx.strokeStyle = '#ffcf6e'; ctx.lineWidth = 1.4; ell(bx, by, 8.5 * s, 8.5 * s); ctx.stroke();
      ctx.fillStyle = '#ffe7b0'; ctx.font = `700 ${10 * s}px 'Barlow Semi Condensed', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(L), bx, by + 0.5);
      label(x, y + 13 * s, SHORT[pid], s);
      if (UI.upgradable.has(pid) && !job) {
        const ay = y - 40 * s - Math.abs(Math.sin(t * 3)) * 4 * s, ax = x - 18 * s;
        ctx.fillStyle = '#2e9a55'; ell(ax, ay, 7 * s, 7 * s); ctx.fill();
        ctx.fillStyle = '#eaffef'; ctx.beginPath(); ctx.moveTo(ax, ay - 4.5 * s); ctx.lineTo(ax + 4 * s, ay + 0.5 * s); ctx.lineTo(ax + 1.6 * s, ay + 0.5 * s); ctx.lineTo(ax + 1.6 * s, ay + 4 * s); ctx.lineTo(ax - 1.6 * s, ay + 4 * s); ctx.lineTo(ax - 1.6 * s, ay + 0.5 * s); ctx.lineTo(ax - 4 * s, ay + 0.5 * s); ctx.closePath(); ctx.fill();
      }
    }
    for (const f of UI.floaters) {
      if (f.plot !== pid) continue;
      const age = (now - f.t0) / 1000;
      ctx.globalAlpha = clamp(1.6 - age, 0, 1);
      ctx.fillStyle = '#ffe08a'; ctx.font = `700 ${16 * s}px 'El Messiri', serif`; ctx.textAlign = 'center';
      ctx.fillText(f.text, x, y - 50 * s - age * 18);
      ctx.globalAlpha = 1;
    }
  }
  function label(x, y, text, s, col = 'rgba(225,236,247,.92)') {
    ctx.font = `600 ${11 * s}px 'Barlow Semi Condensed', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(8,14,24,.75)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = col; ctx.fillText(text, x, y);
  }
  function pill(x, y, text, s, frac) {
    ctx.font = `700 ${11 * s}px 'Barlow Semi Condensed', sans-serif`;
    const w = ctx.measureText(text).width + 22 * s, h = 16 * s;
    ctx.fillStyle = 'rgba(8,14,24,.85)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2) : ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill();
    ctx.fillStyle = 'rgba(255,138,61,.55)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w * frac, h, h / 2) : ctx.rect(x - w / 2, y - h / 2, w * frac, h); ctx.fill();
    ctx.fillStyle = '#ffe7c4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 0.5);
  }


  // ======================================================================
  // The Rainwyrm
  // ======================================================================
  function coilPoint(u) {
    // u: 0 = tail tip (right, behind) → 1 = neck base (front right)
    const a = 40, b = 17;
    const th = -0.35 - u * (Math.PI * 1.5 + 0.35);
    return [a * Math.cos(th), b * Math.sin(th)];
  }
  function heart(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.5);
    ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
    ctx.fill();
  }
  // o: { level, skin, element, dormant, mist, scale, petAge, glow, embers }
  function drawWyrm(x, y, t, o) {
    const L = o.level, stIdx = KH.stageIndex(L), st = DATA.wyrm.stages[stIdx];
    const skin = DATA.skins[o.skin] || DATA.skins.river;
    const elem = o.element ? DATA.ascension.branches[o.element] : null;
    const f = st.size * o.scale;
    const dorm = o.dormant;
    const dark = dorm ? shade(skin.body[0], -0.45) : skin.body[0];
    const light = dorm ? shade(skin.body[1], -0.5) : skin.body[1];
    const belly = dorm ? shade(skin.belly, -0.5) : skin.belly;
    const horn = shade(skin.horn, dorm ? -0.5 : 0);
    const fh = dorm ? 0 : { low: 0.7, steady: 1, high: 1.4 }[o.mist] || 1;
    const pet = o.petAge != null && o.petAge < 1.6 ? 1 - o.petAge / 1.6 : 0;

    ctx.save();
    ctx.translate(x, y);
    if (!dorm && o.glow !== false) {
      const g = ctx.createRadialGradient(0, -6 * f, 0, 0, -6 * f, 110 * f * (0.8 + 0.3 * fh));
      g.addColorStop(0, `rgba(90,210,255,${0.38 * fh})`); g.addColorStop(1, 'rgba(90,210,255,0)');
      ctx.fillStyle = g; ell(0, -6 * f, 150 * f, 90 * f); ctx.fill();
    }
    ctx.scale(f, f);
    // Primordial halo / ascension aura behind everything
    if (!dorm && (elem || stIdx >= 6)) {
      const col = elem ? elem.color : '#bff4ff';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g3 = ctx.createRadialGradient(18, -34, 0, 18, -34, 46);
      g3.addColorStop(0, col + '55'); g3.addColorStop(1, col + '00');
      ctx.fillStyle = g3; ell(18, -34, 46, 40); ctx.fill();
      if (stIdx >= 6) {
        ctx.strokeStyle = col + 'aa'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(30, -50 + Math.sin(t * 1.6) * 1.2, 16, 5, -0.12, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(52,40,34,.6)'; ell(0, 2, 56, 24); ctx.fill();
    ctx.fillStyle = 'rgba(30,24,22,.55)'; ell(0, 0, 22, 10); ctx.fill();

    const N = 46, front = [], back = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, [px, py] = coilPoint(u);
      const r = 2 + 6.5 * Math.pow(u, 0.7);
      (py < 0 ? back : front).push({ px, py, r });
    }
    const tube = (pts, withBelly) => {
      ctx.fillStyle = dark; for (const q of pts) { ell(q.px, q.py, q.r, q.r); ctx.fill(); }
      ctx.fillStyle = light; for (const q of pts) { ell(q.px, q.py - q.r * 0.25, q.r * 0.7, q.r * 0.6); ctx.fill(); }
      if (withBelly) { ctx.fillStyle = belly; for (const q of pts) { ell(q.px, q.py + q.r * 0.5, q.r * 0.55, q.r * 0.32); ctx.fill(); } }
    };
    const spikes = (pts) => {
      for (let i = 2; i < pts.length; i += 3) {
        const q = pts[i];
        ctx.fillStyle = !dorm ? skin.fin || horn : horn;
        ctx.beginPath(); ctx.moveTo(q.px - q.r * 0.35, q.py - q.r * 0.8); ctx.lineTo(q.px, q.py - q.r * (1.6 + stIdx * 0.08)); ctx.lineTo(q.px + q.r * 0.35, q.py - q.r * 0.8); ctx.fill();
        if (o.element === 'floodheart' && !dorm && Math.sin(t * 7 + i) > 0.6) {
          ctx.fillStyle = '#bcd4ff'; ell(q.px, q.py - q.r * 1.9, 0.9, 0.9); ctx.fill();
        }
      }
    };
    tube(back, false); spikes(back);

    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ctx.fillStyle = i % 2 ? '#c99a62' : '#b0844e';
      ell(Math.cos(a) * 15, Math.sin(a) * 6.5 - 1, 4, 3); ctx.fill();
    }
    // the spring the wyrm coils in
    ctx.fillStyle = dorm ? '#1f4a55' : '#1d8fb0'; ell(0, -1, 16, 6.5); ctx.fill();
    ctx.fillStyle = dorm ? 'rgba(120,170,180,.25)' : 'rgba(190,245,255,.55)'; ell(-4, -2.5, 7, 1.6); ctx.fill();
    if (!dorm) {
      // mist rising off the water
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const k = (t * 0.35 * fh + i / 5) % 1;
        ctx.fillStyle = `rgba(200,245,255,${0.22 * (1 - k) * fh})`;
        ell(Math.sin(k * 5 + i * 2) * 6, -4 - k * 34, 4 + k * 10, 3 + k * 6); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // wing (folded) behind the front coil; it grows with each form
    const bob = Math.sin(t * 1.6) * 1.2 + pet * 4;
    const ws = 0.85 + 0.12 * stIdx;
    ctx.save();
    ctx.translate(22, 4); ctx.scale(ws, ws); ctx.translate(-22, -4);
    ctx.fillStyle = dorm ? shade(skin.body[0], -0.55) : shade(skin.body[0], -0.15);
    ctx.beginPath(); ctx.moveTo(16, 4); ctx.lineTo(6, -24 + bob * 0.5); ctx.lineTo(13, -18); ctx.lineTo(20, -27 + bob * 0.5); ctx.lineTo(24, -14); ctx.lineTo(32, -18); ctx.lineTo(28, 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = light; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(18, 2); ctx.lineTo(6, -24 + bob * 0.5); ctx.moveTo(20, 2); ctx.lineTo(20, -27 + bob * 0.5); ctx.moveTo(24, 2); ctx.lineTo(32, -18); ctx.stroke();
    ctx.restore();

    tube(front, true);

    const [nx, ny] = coilPoint(1);
    const hx = 33 - pet * 3, hy = -38 + bob;
    const neck = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14, cx1 = 46, cy1 = -6;
      const px = (1 - u) * (1 - u) * nx + 2 * (1 - u) * u * cx1 + u * u * hx;
      const py = (1 - u) * (1 - u) * ny + 2 * (1 - u) * u * cy1 + u * u * (hy + 4);
      neck.push({ px, py, r: 8.2 - 2.6 * u });
    }
    tube(neck, true);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-0.12 + pet * 0.25);
    ctx.strokeStyle = horn; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(3, -5); ctx.quadraticCurveTo(10, -10, 15, -16); ctx.moveTo(6, -3); ctx.quadraticCurveTo(13, -6, 18, -9);
    if (stIdx >= 4) { ctx.moveTo(0, -6); ctx.quadraticCurveTo(4, -14, 7, -20); }
    ctx.stroke();
    if (stIdx >= 7 && !dorm) {
      // Stormcrowned: a ring of storm horns with glowing tips
      for (let i = 0; i < 5; i++) {
        const bx = -6 + i * 3.6, by = -7 - Math.sin((i / 4) * Math.PI) * 2.5, tip = by - 7 - Math.sin((i / 4) * Math.PI) * 3;
        ctx.strokeStyle = horn; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 1.2, tip); ctx.stroke();
        ctx.fillStyle = '#bfeaff'; ctx.shadowColor = '#8fd8ff'; ctx.shadowBlur = 6 + 4 * Math.max(0, Math.sin(t * 3.1 + i));
        ell(bx + 1.2, tip, 1.2, 1.2); ctx.fill(); ctx.shadowBlur = 0;
      }
    }
    if (stIdx >= 8 && !dorm) {
      // Skyriver: a halo of living water over the head
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = skin.mist[0]; ctx.lineWidth = 2; ctx.setLineDash([5, 3]); ctx.lineDashOffset = -t * 12;
      ctx.beginPath(); ctx.ellipse(2, -24 + Math.sin(t * 1.4), 13, 3.6, -0.1, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }
    if (elem && !dorm) {
      ctx.fillStyle = elem.color;
      ctx.beginPath(); ctx.moveTo(-3, -7); ctx.lineTo(1, -15 - Math.sin(t * 5) * 1.5); ctx.lineTo(4, -7); ctx.fill();
    }
    ctx.fillStyle = dark; ell(0, 0, 10, 7.5); ctx.fill();
    ctx.fillStyle = dark; ell(-10, 2.5, 8.5, 5); ctx.fill();
    ctx.fillStyle = light; ell(-2, -2.5, 8, 4); ctx.fill(); ell(-11, 0.5, 6, 2.6); ctx.fill();
    ctx.fillStyle = belly; ell(-9, 5.6, 7, 1.8); ctx.fill();
    ctx.fillStyle = '#1b1012'; ell(-17, 1.5, 1, 0.8); ctx.fill();
    if (dorm) {
      ctx.strokeStyle = '#1b1012'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(-3, -0.5, 0, -2); ctx.stroke();
    } else if (pet) {
      ctx.strokeStyle = '#1b1012'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-6, -1.2); ctx.quadraticCurveTo(-3, -4, 0, -1.2); ctx.stroke();
    } else {
      const blink = (t % 5) < 0.12;
      ctx.fillStyle = skin.eye; ctx.shadowColor = skin.mist[1]; ctx.shadowBlur = 8;
      ell(-3, -2, 2.6, blink ? 0.4 : 1.9); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#1b1012'; ell(-3.4, -2, 0.7, blink ? 0.2 : 1.5); ctx.fill();
    }
    ctx.restore();
    if (pet) {
      ctx.fillStyle = `rgba(255,120,140,${pet})`;
      for (let i = 0; i < 3; i++) heart(hx - 8 + i * 9, hy - 16 - (1 - pet) * 26 - i * 5, 2.4 + i * 0.4);
    }
    ctx.restore();
    if (o.embers && !dorm && Math.random() < 0.35 * fh) T.embers.push({ x: x + rand(-14, 14) * f, y: y - 4 * f, vx: rand(-6, 6), vy: rand(-22, -10) * (0.6 + fh * 0.4), life: rand(1.2, 2.4), age: 0, col: elem ? elem.crest : skin.mist[1] });
    return { f, hx, hy };
  }
  function townWyrm(x, y, t, now) {
    const r = drawWyrm(x, y, t, {
      level: S.lv.wyrm, skin: S.skins.on, element: S.wyrm.element, dormant: S.dormant, mist: S.mist,
      scale: T.k * 1.3, petAge: UI.petT ? (now - UI.petT) / 1000 : null, embers: true,
    });
    const R = KH.lastRates();
    if (!S.dormant && R && R.net.water < 0 && S.res.water / -R.net.water < 45) pill(x + r.hx * r.f, y + (r.hy - 22) * r.f, 'Thirsty!', T.k, 1);
    else if (S.dormant) pill(x, y - 46 * r.f, 'Dormant: needs water', T.k, 0);
  }

  // Paint every <canvas data-wyrm> inside el with a still portrait of the wyrm
  // (rendered in 3D when available, otherwise drawn in 2D).
  KH.paintWyrms = (el) => {
    el.querySelectorAll('canvas[data-wyrm]').forEach((c) => {
      const w = c.width, h = c.height;
      const A3 = KH.A3;
      if (A3 && A3.ok && A3.enabled() && A3.paintWyrm(c, { level: Number(c.dataset.wyrm) || 1, skin: c.dataset.skin || 'river', element: c.dataset.element || null })) return;
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      const bg = g.createRadialGradient(w / 2, h * 0.62, 10, w / 2, h * 0.62, w * 0.6);
      bg.addColorStop(0, '#4a2a14'); bg.addColorStop(1, '#140a05');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      const level = Number(c.dataset.wyrm) || 1;
      const size = DATA.wyrm.stages[KH.stageIndex(level)].size;
      const old = ctx;
      ctx = g;
      try {
        drawWyrm(w * 0.48, h * 0.7, 2.2, {
          level, skin: c.dataset.skin || 'river', element: c.dataset.element || null, dormant: false, mist: 'steady',
          scale: (h / 120) / Math.max(size, 0.9), glow: true,
        });
      } finally { ctx = old; }
    });
  };

  // ======================================================================
  // Survivors walking between the nest and their work
  // ======================================================================
  function drawWalkers(t) {
    const healthy = S.pop - S.sick;
    const posts = Object.keys(S.workers).filter((p) => S.workers[p] > 0 && S.lv[p]);
    if (!posts.length) return [];
    const n = Math.min(healthy, 18);
    const list = [];
    for (let i = 0; i < n; i++) {
      const pid = posts[i % posts.length], P = T.pos[pid];
      const sp = 0.12 + (i % 5) * 0.02;
      const u = (Math.sin(t * sp * Math.PI + i * 1.9) + 1) / 2;
      const W = T.pos.wyrm, sx = W.x + (P.x - W.x) * 0.45, sy = W.y + (P.y - W.y) * 0.45;
      const x = sx + (P.x - sx) * (0.15 + 0.7 * u) + Math.sin(i * 7) * 5, y = sy + (P.y - sy) * (0.15 + 0.7 * u) + Math.cos(i * 5) * 3;
      list.push({ y, draw: () => {
        const s = T.k * (0.85 + 0.25 * clamp((y - (T.cy - T.ry)) / (2 * T.ry), 0, 1));
        ctx.fillStyle = 'rgba(8,16,30,.3)'; ell(x, y + 1, 3.2 * s, 1.2 * s); ctx.fill();
        ctx.fillStyle = i % 3 ? '#3a2d24' : '#2c3a4a'; ctx.beginPath(); ctx.ellipse(x, y - 4 * s, 2.4 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e9dcc8'; ell(x, y - 9 * s, 1.8 * s, 1.8 * s); ctx.fill();
        ctx.fillStyle = '#ffb04a'; ell(x + 2.6 * s, y - 4 * s, 0.9 * s, 0.9 * s); ctx.fill();
      } });
    }
    return list;
  }

  // ======================================================================
  // Frame
  // ======================================================================
  let lastNow = 0;
  // the compass button: shown once the view has moved away from home, its needle follows the camera
  function camHome() {
    const b = $('#camhome');
    if (!b) return;
    const T3 = KH.town3d;
    const show = !!(S && UI.tab === 'town' && T3 && T3.active && !T3.home && !UI.sheet);
    if (b.hidden === show) b.hidden = !show;
    if (show && T3.az) b.firstElementChild.style.transform = `rotate(${(-T3.az()).toFixed(3)}rad)`;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    camHome();
    if (!S || UI.tab !== 'town' || document.hidden || !VW) return;
    const t = now / 1000;
    const dt = Math.min(0.05, (now - (lastNow || now)) / 1000);
    lastNow = now;
    const R = KH.lastRates() || KH.rates(false);
    const wxType = KH.curWx().type;
    ctx = townCtx;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // unhinted glyph advances, so small plate text keeps its spaces (a resize resets this)
    if ('textRendering' in ctx) ctx.textRendering = 'geometricPrecision';
    if (KH.town3d && KH.town3d.active) {
      ctx.clearRect(0, 0, VW, VH);
      overlay3d(now, t, dt, R, wxType);
      if (!S.settings.camHint && S.seenIntro && !UI.sheet && S.quest >= 2) {
        S.settings.camHint = true;
        KH.toast('Drag to move around the keep, pinch or scroll to zoom, and twist with two fingers to turn.', '', 'camhint', 6);
      }
      return;
    }

    const sky = ctx.createLinearGradient(0, 0, 0, T.top);
    sky.addColorStop(0, '#4f9ee0'); sky.addColorStop(1, '#f4d8a6');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, T.top + 2);
    const sg = ctx.createRadialGradient(VW * 0.78, T.top * 0.45, 0, VW * 0.78, T.top * 0.45, T.top * 0.9);
    sg.addColorStop(0, 'rgba(255,248,220,.95)'); sg.addColorStop(0.15, 'rgba(255,240,200,.6)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, VW, T.top + 2);
    T.ridges.forEach((pts, li) => {
      ctx.fillStyle = li ? '#c98a52' : '#b5703f';
      ctx.beginPath(); ctx.moveTo(-20, T.top + 2); pts.forEach(([px, py]) => ctx.lineTo(px, py)); ctx.lineTo(VW + 40, T.top + 2); ctx.closePath(); ctx.fill();
    });
    const gr = ctx.createLinearGradient(0, T.top, 0, VH);
    gr.addColorStop(0, '#d9a35e'); gr.addColorStop(0.5, '#e4b273'); gr.addColorStop(1, '#eec08a');
    ctx.fillStyle = gr; ctx.fillRect(0, T.top, VW, VH - T.top);
    ctx.strokeStyle = 'rgba(160,100,50,.18)'; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const yy = T.top + 24 + i * (VH - T.top) / 7; ctx.beginPath(); ctx.moveTo(0, yy); ctx.quadraticCurveTo(VW / 2, yy - 14, VW, yy + 6); ctx.stroke(); }
    drawTerraces();
    const W = T.pos.wyrm;
    ctx.strokeStyle = 'rgba(240,215,170,.55)'; ctx.lineCap = 'round';
    for (const p of DATA.plots) {
      if (!S.lv[p.id]) continue;
      const P = T.pos[p.id];
      ctx.lineWidth = 7 * P.s; ctx.beginPath(); ctx.moveTo(W.x, W.y); ctx.lineTo(P.x, P.y); ctx.stroke();
    }

    const items = DATA.plots.map((p) => ({ y: T.pos[p.id].y, draw: () => drawPlot(p.id, now, t) }));
    items.push({ y: W.y, draw: () => townWyrm(W.x, W.y, t, now) });
    items.push(...drawWalkers(t));
    items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());

    ctx.globalCompositeOperation = 'lighter';
    for (const e of T.embers) {
      e.age += dt; e.x += e.vx * dt; e.y += e.vy * dt; e.vx += Math.sin(t * 3 + e.y) * 6 * dt;
      ctx.globalAlpha = clamp(1 - e.age / e.life, 0, 1);
      ctx.fillStyle = e.col; ell(e.x, e.y, 1.3, 1.3); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    T.embers = T.embers.filter((e) => e.age < e.life);
    UI.floaters = UI.floaters.filter((f) => now - f.t0 < 1600);

    keepMarks(t, (pid) => {
      const P = pid === 'gate' ? { ...proj(DATA.keep.gate.x, 1.7, DATA.keep.gate.z), s: T.k } : T.pos[pid];
      return P ? { x: P.x, y: P.y - 36 * P.s, s: P.s } : null;
    });
    if (KH.keep && KH.keep.merchantHere()) { const M = proj(4.2, 0, 13.6); merchantCamp(M.x, M.y, T.k, t); }
    if (KH.keep && KH.keep.raining()) rainStreaks(t, KH.keep.rainK());
    screenFx(t, dt, R, wxType, true);
  }

  // Surplus bubbles and the incident marker, over either renderer. at(pid) gives a screen point above a plot.
  T.hits = [];
  function keepMarks(t, at) {
    T.hits = [];
    if (!KH.keep) return;
    for (const b of KH.keep.bubbles()) {
      const p = at(b.pid);
      if (!p) continue;
      const x = p.x - 16 * p.s, y = p.y - 8 * p.s + Math.sin(t * 2.4 + b.pid.length) * 3, r = 15 * p.s;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, '#fffbe8'); g.addColorStop(1, '#ffd36e');
      ctx.fillStyle = 'rgba(40,20,6,.35)'; ell(x, y + r * 0.9, r * 0.7, r * 0.2); ctx.fill();
      ctx.fillStyle = g; ell(x, y, r, r); ctx.fill();
      ctx.strokeStyle = '#a8641c'; ctx.lineWidth = 1.5; ell(x, y, r, r); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 4 * p.s, y + r - 1); ctx.lineTo(x, y + r + 6 * p.s); ctx.lineTo(x + 4 * p.s, y + r - 1); ctx.fillStyle = '#ffd36e'; ctx.fill();
      const img = icons[b.res];
      if (img && img.complete) ctx.drawImage(img, x - r * 0.62, y - r * 0.62, r * 1.24, r * 1.24);
      T.hits.push({ kind: 'collect', arg: b.pid, x, y, r: r + 8 });
    }
    const where = KH.keep.incidentAt();
    if (where) {
      const p = at(where);
      if (p) {
        const pulse = 1 + 0.12 * Math.sin(t * 5), r = 15 * p.s * pulse, x = p.x, y = p.y - 30 * p.s - Math.abs(Math.sin(t * 2.2)) * 5;
        ctx.fillStyle = 'rgba(255,207,110,.25)'; ell(x, y, r * 1.6, r * 1.6); ctx.fill();
        ctx.fillStyle = '#c0391c'; ell(x, y, r, r); ctx.fill();
        ctx.strokeStyle = '#ffe0b0'; ctx.lineWidth = 2; ell(x, y, r, r); ctx.stroke();
        ctx.fillStyle = '#fff4dc'; ctx.font = `800 ${19 * p.s}px 'Barlow Semi Condensed', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', x, y + 1);
        T.hits.push({ kind: 'incident', x, y, r: r + 10 });
      }
    }
    // the Rainwyrm's wish: a thought bubble beside its head
    if (KH.bondWish && KH.bondWish()) {
      const p = at('wyrm');
      if (p) {
        const x = p.x + 34 * p.s, y = p.y - 24 * p.s + Math.sin(t * 2) * 3, r = 14 * p.s;
        ctx.fillStyle = 'rgba(255,244,248,.92)';
        ell(p.x + 12 * p.s, p.y - 6 * p.s, 3 * p.s, 3 * p.s); ctx.fill();
        ell(p.x + 21 * p.s, p.y - 13 * p.s, 4.6 * p.s, 4.6 * p.s); ctx.fill();
        ctx.fillStyle = 'rgba(40,20,6,.25)'; ell(x, y + 2, r * 1.3, r * 1.05); ctx.fill();
        ctx.fillStyle = '#fff4f8'; ell(x, y, r * 1.3, r * 1.05); ctx.fill();
        ctx.strokeStyle = '#d0587e'; ctx.lineWidth = 1.6; ell(x, y, r * 1.3, r * 1.05); ctx.stroke();
        ctx.fillStyle = '#d0587e'; heart(x, y + 1, 5.5 * p.s * (1 + 0.08 * Math.sin(t * 4)));
        T.hits.push({ kind: 'wish', x, y, r: r + 10 });
      }
    }
  }
  function rainStreaks(t, k) {
    ctx.fillStyle = `rgba(40,70,100,${0.2 * k})`; ctx.fillRect(0, 0, VW, VH);
    ctx.strokeStyle = `rgba(225,244,255,${0.6 * k})`; ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < 240; i++) {
      const x = ((i * 73.7 + t * 60) % (VW + 40)) - 20, y = ((i * 41.3 + t * 520 * (0.8 + (i % 5) * 0.08)) % (VH + 40)) - 20;
      ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 18);
    }
    ctx.stroke();
  }

  // a visiting merchant's striped tent, camel and goods just inside the gate
  function merchantCamp(x, y, s, t) {
    tent(x, y, 30 * s, 30 * s, '#7a3f8a');
    ctx.fillStyle = 'rgba(240,217,168,.85)';
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * 7 * s, y - 2); ctx.lineTo(x + i * 3 * s, y - 24 * s); ctx.lineTo(x + i * 3 * s + 2 * s, y - 24 * s); ctx.lineTo(x + i * 7 * s + 3 * s, y - 2); ctx.fill(); }
    const cx = x + 26 * s, cy = y + 2 * s, bob = Math.sin(t * 1.6) * 0.8 * s;
    ctx.fillStyle = 'rgba(8,16,30,.3)'; ell(cx, cy + 1, 14 * s, 3 * s); ctx.fill();
    ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 2.4 * s;
    ctx.beginPath(); for (const lx of [-8, -4, 5, 9]) { ctx.moveTo(cx + lx * s, cy - 10 * s); ctx.lineTo(cx + lx * s, cy); } ctx.stroke();
    ctx.fillStyle = '#c8945a'; ell(cx, cy - 13 * s + bob, 12 * s, 6 * s); ctx.fill(); ell(cx - 1 * s, cy - 18 * s + bob, 6 * s, 4.5 * s); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 10 * s, cy - 14 * s + bob); ctx.quadraticCurveTo(cx + 15 * s, cy - 20 * s, cx + 16 * s, cy - 24 * s + bob); ctx.lineWidth = 3.4 * s; ctx.strokeStyle = '#c8945a'; ctx.stroke();
    ell(cx + 18 * s, cy - 24 * s + bob, 4 * s, 2.4 * s); ctx.fill();
    ctx.fillStyle = '#2f7f9a'; ctx.fillRect(cx - 7 * s, cy - 17 * s + bob, 10 * s, 5 * s);
    for (const [j, c] of [[-14, '#b0603a'], [-9, '#c9a24a']]) { ctx.fillStyle = c; ell(x + j * s - 6 * s, y - 4 * s, 3.5 * s, 4.5 * s); ctx.fill(); }
    T.hits.push({ kind: 'merchant', x: x + 10 * s, y: y - 12 * s, r: 30 * s });
  }

  // heat vignette, raid warning and blowing sand (shared by both renderers)
  function screenFx(t, dt, R, wxType, sand) {
    const heatA = ({ Pleasant: 0, Warm: 0.05, Hot: 0.16, Scorching: 0.3 }[R.band.name] || 0) + (wxType === 'heatwave' ? 0.12 : 0) + (S.thirsty ? 0.12 : 0);
    if (heatA > 0) {
      const vg = ctx.createRadialGradient(VW / 2, VH * 0.5, Math.min(VW, VH) * 0.3, VW / 2, VH * 0.5, Math.max(VW, VH) * 0.75);
      vg.addColorStop(0, 'rgba(255,120,40,0)'); vg.addColorStop(1, `rgba(255,110,40,${heatA})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    }
    // raiders sighted, or the Scorpion host at the gate (siege.js)
    if ((KH.raidNear && KH.raidNear()) || (KH.siege && KH.siege.run())) {
      const a = 0.12 + 0.08 * Math.sin(t * 4);
      const rg = ctx.createLinearGradient(0, 0, 0, VH);
      rg.addColorStop(0, `rgba(200,40,30,${a})`); rg.addColorStop(0.25, 'rgba(200,40,30,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, VW, VH);
    }
    if (!sand) return;
    if (KH.isStorm(wxType)) { ctx.fillStyle = wxType === 'sandstorm' ? 'rgba(210,150,80,.16)' : 'rgba(255,240,210,.12)'; ctx.fillRect(0, 0, VW, VH); }
    const cfg = { clear: [30, 0.1, 0.2], haze: [90, 0.18, 0.3], sandstorm: [170, 0.9, 0.5], heatwave: [60, 0.06, -0.2] }[wxType];
    for (let i = 0; i < cfg[0]; i++) {
      const fl = T.flakes[i];
      fl.y += (0.02 + 0.03 * fl.z) * cfg[2] * dt;
      fl.x += (cfg[1] * fl.z + Math.sin(t + fl.p) * 0.01) * dt;
      if (fl.y > 1) fl.y -= 1;
      if (fl.y < 0) fl.y += 1;
      if (fl.x > 1) { fl.x -= 1; fl.y = Math.random(); }
      const r = 0.6 + 1.4 * fl.z;
      ctx.fillStyle = wxType === 'heatwave' ? `rgba(255,250,235,${0.15 + 0.2 * fl.z})` : `rgba(240,200,140,${0.3 + 0.45 * fl.z})`;
      ctx.fillRect(fl.x * VW, fl.y * VH, r * (wxType === 'sandstorm' ? 6 : 2.5) * fl.z + 1.5, r * 0.6);
    }
  }

  // ======================================================================
  // Overlay for the 3D keep: plates, badges, timers, floaters
  // ======================================================================
  function plate(x, y, text, s, col = '#f7e8d0', lvl = null) {
    ctx.font = `700 ${11.5 * s}px 'Barlow Semi Condensed', sans-serif`;
    const tw = ctx.measureText(text).width, h = 17 * s, bw = lvl != null ? h : 0;
    const w = tw + 14 * s + bw;
    const x0 = x - w / 2;
    ctx.fillStyle = 'rgba(22,15,36,.82)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y - h / 2, w, h, h / 2) : ctx.rect(x0, y - h / 2, w, h); ctx.fill();
    ctx.strokeStyle = 'rgba(201,154,75,.55)'; ctx.lineWidth = 1; ctx.stroke();
    if (lvl != null) {
      const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      g.addColorStop(0, '#ffe39a'); g.addColorStop(1, '#e8a23a');
      ctx.fillStyle = g; ell(x0 + h / 2, y, h / 2 - 1, h / 2 - 1); ctx.fill();
      ctx.fillStyle = '#2f1a04'; ctx.font = `800 ${10.5 * s}px 'Barlow Semi Condensed', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(lvl), x0 + h / 2, y + 0.5);
      ctx.font = `700 ${11.5 * s}px 'Barlow Semi Condensed', sans-serif`;
    }
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x0 + bw + (w - bw) / 2, y + 0.5);
  }
  function lockIcon(x, y, s) {
    ctx.fillStyle = 'rgba(22,15,36,.82)'; ell(x, y, 11 * s, 11 * s); ctx.fill();
    ctx.strokeStyle = 'rgba(201,154,75,.6)'; ctx.lineWidth = 1; ell(x, y, 11 * s, 11 * s); ctx.stroke();
    ctx.strokeStyle = 'rgba(232,210,176,.9)'; ctx.lineWidth = 1.6 * s;
    ctx.beginPath(); ctx.arc(x, y - 2 * s, 3.4 * s, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = 'rgba(232,210,176,.95)'; ctx.fillRect(x - 4.6 * s, y - 2 * s, 9.2 * s, 7 * s);
  }
  // a building's level on an eight-point brass star; a turquoise chevron rides on top when it can be raised
  function starBadge(x, y, lvl, s, up, t) {
    const r = 11 * s;
    const g = ctx.createLinearGradient(0, y - r, 0, y + r);
    g.addColorStop(0, '#ffe7a6'); g.addColorStop(1, '#c98a2a');
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 4 * s; ctx.shadowOffsetY = 1.5 * s;
    ctx.fillStyle = g;
    for (const a of [0, Math.PI / 4]) { ctx.save(); ctx.rotate(a); ctx.fillRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44); ctx.restore(); }
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(70,40,8,.55)'; ctx.lineWidth = 1;
    for (const a of [0, Math.PI / 4]) { ctx.save(); ctx.rotate(a); ctx.strokeRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44); ctx.restore(); }
    ctx.fillStyle = '#3a2404'; ctx.font = `800 ${11 * s}px 'Barlow Semi Condensed', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(lvl), 0, 0.5 * s);
    if (up) {
      const b = -r - 5 * s - Math.abs(Math.sin(t * 3)) * 3 * s;
      ctx.fillStyle = '#46d6d0'; ctx.strokeStyle = '#0f3a40'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, b - 5 * s); ctx.lineTo(6 * s, b + 1.5 * s); ctx.lineTo(3 * s, b + 1.5 * s); ctx.lineTo(0, b - 1.5 * s); ctx.lineTo(-3 * s, b + 1.5 * s); ctx.lineTo(-6 * s, b + 1.5 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  function upArrow(ax, ay, s) {
    ctx.fillStyle = '#2e9a55'; ell(ax, ay, 9 * s, 9 * s); ctx.fill();
    ctx.strokeStyle = '#bff5cf'; ctx.lineWidth = 1.4; ell(ax, ay, 9 * s, 9 * s); ctx.stroke();
    ctx.fillStyle = '#eaffef'; ctx.beginPath(); ctx.moveTo(ax, ay - 5.5 * s); ctx.lineTo(ax + 5 * s, ay + 0.5 * s); ctx.lineTo(ax + 2 * s, ay + 0.5 * s); ctx.lineTo(ax + 2 * s, ay + 5 * s); ctx.lineTo(ax - 2 * s, ay + 5 * s); ctx.lineTo(ax - 2 * s, ay + 0.5 * s); ctx.lineTo(ax - 5 * s, ay + 0.5 * s); ctx.closePath(); ctx.fill();
  }
  function overlay3d(now, t, dt, R, wxType) {
    const AN = KH.town3d.anchors;
    const zoomed = KH.town3d.zoomLevel && KH.town3d.zoomLevel() >= 1.45;
    const ids = DATA.plots.map((p) => p.id).filter((id) => AN[id] && AN[id].vis !== false).sort((a, b) => AN[a].y - AN[b].y);
    for (const pid of ids) {
      const a = AN[pid], s = a.s, p = PLOT[pid], L = S.lv[pid];
      const job = S.builds.find((b) => b.plot === pid);
      if (S.lv.wyrm < p.unlock) {
        lockIcon(a.mx, a.my - 6 * s, s);
        plate(a.x, a.y, zoomed ? `Wyrm Lv ${p.unlock}` : `Lv ${p.unlock}`, s * 0.9, 'rgba(232,210,176,.85)');
        continue;
      }
      if (!L && !job) {
        const pulse = 1 + 0.08 * Math.sin(t * 4);
        const g = ctx.createLinearGradient(0, a.my - 14 * s, 0, a.my + 14 * s);
        g.addColorStop(0, '#ffe39a'); g.addColorStop(1, '#e8a23a');
        ctx.fillStyle = g; ell(a.mx, a.my - 8 * s, 12 * s * pulse, 12 * s * pulse); ctx.fill();
        ctx.fillStyle = '#2f1a04'; ctx.font = `800 ${19 * s}px 'Barlow Semi Condensed', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', a.mx, a.my - 9 * s);
        plate(a.x, a.y, `Build ${SHORT[pid]}`, s, '#ffd88f');
        continue;
      }
      if (job) pill(a.tx, a.ty - 6 * s, fmtTime(job.end - S.time), s, clamp((S.time - job.start) / (job.end - job.start), 0, 1));
      if (L) {
        // close up, or when it matters, the name; otherwise just the level star
        const named = zoomed || pid === UI.questTarget || (UI.sheet && UI.sheet.pid === pid);
        if (named) plate(a.x, a.y, SHORT[pid], s, '#f7e8d0', L);
        else starBadge(a.x, a.y, L, s, UI.upgradable.has(pid) && !job, t);
        if (named && UI.upgradable.has(pid) && !job) upArrow(a.tx + 16 * s, a.ty - 2 * s - Math.abs(Math.sin(t * 3)) * 5 * s, s);
      }
      for (const f of UI.floaters) {
        if (f.plot !== pid) continue;
        const age = (now - f.t0) / 1000;
        ctx.globalAlpha = clamp(1.6 - age, 0, 1);
        ctx.font = `700 ${18 * s}px 'El Messiri', serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40,20,6,.8)'; ctx.strokeText(f.text, a.tx, a.ty - 20 * s - age * 22);
        ctx.fillStyle = '#ffe08a'; ctx.fillText(f.text, a.tx, a.ty - 20 * s - age * 22);
        ctx.globalAlpha = 1;
      }
    }
    UI.floaters = UI.floaters.filter((f) => now - f.t0 < 1600);
    const W = AN.wyrm;
    if (W && W.vis !== false) {
      if (S.dormant) pill(W.tx, W.ty - 10, 'Dormant: needs water', W.s, 0);
      else if (R && R.net.water < 0 && S.res.water / -R.net.water < 45) pill(W.tx, W.ty - 10, 'Thirsty!', W.s, 1);
      const pa = UI.petT ? (now - UI.petT) / 1000 : 9;
      if (pa < 1.6) {
        const k = 1 - pa / 1.6;
        ctx.fillStyle = `rgba(255,120,150,${k})`;
        for (let i = 0; i < 3; i++) heart(W.mx - 14 + i * 14, W.my - 20 - (1 - k) * 40 - i * 6, (4 + i * 0.6) * W.s);
      }
    }
    keepMarks(t, (pid) => {
      const a = AN[pid];
      return a && a.vis !== false ? { x: a.tx, y: a.ty, s: a.s } : null;
    });
    screenFx(t, dt, R, wxType, false);
  }

  function hitTest(px, py) {
    for (const h of T.hits) if (Math.hypot(px - h.x, py - h.y) < h.r) return `@${h.kind}:${h.arg || ''}`;
    if (KH.town3d && KH.town3d.active) return KH.town3d.pick(px, py);
    const W = T.pos.wyrm, f = DATA.wyrm.stages[KH.stageIndex(S.lv.wyrm)].size * T.k * 1.3;
    if (Math.hypot(px - W.x, (py - (W.y - 12 * f)) * 1.1) < 44 * f + 10) return 'wyrm';
    let best = null, bd = 1e9;
    for (const p of DATA.plots) {
      const P = T.pos[p.id];
      const d = Math.hypot(px - P.x, py - (P.y - 14 * P.s));
      if (d < 32 * P.s && d < bd) { best = p.id; bd = d; }
    }
    return best;
  }

  // Taps open buildings. In 3D one finger (or the left mouse button) drags the view around, two fingers
  // pinch to zoom, twist to turn and slide to pan, the wheel zooms toward the cursor, the right button
  // (or Shift-drag) turns and tilts, and a double tap or the compass button flies back home.
  const touches = new Map();
  let gest = null, lastTap = null;
  const T3on = () => (KH.town3d && KH.town3d.active ? KH.town3d : null);
  const pair = () => {
    const [a, b] = [...touches.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  cv.addEventListener('contextmenu', (e) => { if (T3on()) e.preventDefault(); });
  cv.addEventListener('pointerdown', (e) => {
    touches.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    const T3 = T3on();
    if (touches.size === 1) {
      gest = { x0: e.offsetX, y0: e.offsetY, lx: e.offsetX, ly: e.offsetY, moved: false, two: null, turn: e.button === 2 || e.shiftKey || e.altKey, vx: 0, vy: 0, lt: performance.now() };
      if (T3) T3.hold(true);
    } else if (touches.size === 2 && gest) { gest.moved = true; gest.two = pair(); }
    if (cv.setPointerCapture) try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId) || !gest) return;
    touches.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    const T3 = T3on();
    if (touches.size >= 2) {
      const p = pair(), q = gest.two;
      if (T3 && q) {
        if (q.d > 0) T3.zoomAt(p.d / q.d, p.mx, p.my);
        let da = p.ang - q.ang;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        T3.rotate(da);
        T3.pan(p.mx - q.mx, p.my - q.my);
      }
      gest.two = p;
      return;
    }
    if (Math.hypot(e.offsetX - gest.x0, e.offsetY - gest.y0) > 10) gest.moved = true;
    if (gest.moved && T3) {
      const dx = e.offsetX - gest.lx, dy = e.offsetY - gest.ly;
      if (gest.turn) T3.rotate(-dx * 0.008, dy * 0.004);
      else {
        T3.pan(dx, dy);
        const now = performance.now(), dts = Math.max(8, now - gest.lt) / 1000;
        gest.vx = gest.vx * 0.5 + (dx / dts) * 0.5; gest.vy = gest.vy * 0.5 + (dy / dts) * 0.5; gest.lt = now;
      }
    }
    gest.lx = e.offsetX; gest.ly = e.offsetY;
  });
  const endTouch = (e, cancel) => {
    touches.delete(e.pointerId);
    if (touches.size) {
      // one finger of a pinch lifted: carry on panning with the other
      if (gest) { const [r] = [...touches.values()]; gest.lx = r.x; gest.ly = r.y; gest.two = null; }
      return;
    }
    const g = gest;
    gest = null;
    const T3 = T3on();
    if (T3) {
      T3.hold(false);
      if (g && g.moved && !g.turn && !cancel && performance.now() - g.lt < 90) T3.fling(g.vx, g.vy);
    }
    if (cancel || !g || g.moved || !S) return;
    const pid = hitTest(e.offsetX, e.offsetY);
    if (!pid) {
      // double tap on open ground: back to the home view
      const now = performance.now();
      if (T3 && lastTap && now - lastTap.t < 400 && Math.hypot(e.offsetX - lastTap.x, e.offsetY - lastTap.y) < 40) { T3.reset(); lastTap = null; } else lastTap = { t: now, x: e.offsetX, y: e.offsetY };
      return;
    }
    lastTap = null;
    if (pid[0] === '@') {
      const [kind, arg] = pid.slice(1).split(':');
      if (kind === 'collect') ACT.collect(arg);
      else if (kind === 'incident') { KH.sfx('tap'); ACT.incident(); }
      else if (kind === 'merchant') { KH.sfx('tap'); ACT.merchant(); }
      else if (kind === 'wish') { KH.sfx('tap'); KH.bondTap(); }
      KH.save();
      KH.renderAll(true);
      return;
    }
    if (pid === 'merchant') { KH.sfx('tap'); ACT.merchant(); KH.renderAll(true); return; }
    if (pid === 'channels') { KH.sfx('tap'); ACT.channels(); KH.renderAll(true); return; }
    if (pid === 'gardens') { KH.sfx('tap'); ACT.gardens(); KH.renderAll(true); return; }
    if (pid === 'defenses') { KH.sfx('tap'); ACT.defenses(); KH.renderAll(true); return; }
    if (pid.startsWith('pal:')) { KH.sfx('tap'); ACT.pal(pid.slice(4)); KH.renderAll(true); return; }
    if (pid.startsWith('hero:')) { KH.sfx('tap'); ACT.hero(pid.slice(5)); KH.renderAll(true); return; }
    if (pid !== 'wyrm' && S.lv.wyrm < PLOT[pid].unlock) {
      KH.toast(`The ${KH.plotName(pid)} unlocks at Rainwyrm Lv ${PLOT[pid].unlock}.`, 'heat');
      return;
    }
    KH.sfx('tap');
    if (pid === 'wyrm') UI.petT = performance.now();
    ACT.plot(pid);
    KH.renderAll(true);
  };
  cv.addEventListener('pointerup', (e) => endTouch(e, false));
  cv.addEventListener('pointercancel', (e) => endTouch(e, true));
  cv.addEventListener('wheel', (e) => {
    const T3 = T3on();
    if (!T3) return;
    e.preventDefault();
    // trackpad pinches arrive as wheel events with ctrlKey set
    const k = (e.ctrlKey ? 0.012 : 0.0016) * (e.deltaMode === 1 ? 18 : 1);
    T3.zoomAt(Math.exp(-e.deltaY * k), e.offsetX, e.offsetY);
  }, { passive: false });
  cv.addEventListener('dblclick', () => { const T3 = T3on(); if (T3) T3.reset(); });
  // keyboard: arrows or WASD move, + and - zoom, Q and E turn, Home recenters
  window.addEventListener('keydown', (e) => {
    const T3 = T3on();
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (!T3 || UI.sheet || tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, step = 60;
    const moves = { ArrowLeft: [step, 0], a: [step, 0], ArrowRight: [-step, 0], d: [-step, 0], ArrowUp: [0, step], w: [0, step], ArrowDown: [0, -step], s: [0, -step] };
    if (moves[k]) T3.pan(...moves[k]);
    else if (k === '+' || k === '=') T3.zoom(1.2);
    else if (k === '-' || k === '_') T3.zoom(1 / 1.2);
    else if (k === 'q') T3.rotate(-0.2);
    else if (k === 'e') T3.rotate(0.2);
    else if (k === 'Home') T3.reset();
    else return;
    e.preventDefault();
  });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe($('#stage'));
})();
