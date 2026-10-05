/*
 * Kindlehold town view: the canvas hold around the Hearthwyrm, plus wyrm portraits
 * for sheets (KH.paintWyrms). Reads state only; all changes go through KH.ACT.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { $, clamp, rand, fmtTime, shade } = KH.u;
  const { PLOT, SHORT, UI, ACT } = KH;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.on('booted', () => { S = KH.S; resize(); requestAnimationFrame(frame); });

  const cv = $('#town');
  const townCtx = cv.getContext('2d');
  let ctx = townCtx; // drawing helpers draw on whichever context is current
  let VW = 0, VH = 0, DPR = 1;
  const T = { cx: 0, cy: 0, rx: 0, ry: 0, k: 1, top: 0, pos: {}, stars: [], ridges: [[], []], flakes: [], embers: [], hearts: [] };
  const SNOW = '#e3edf6';

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
    T.cx = VW / 2;
    T.cy = T.top + groundH * 0.52 + 16;
    T.ry = groundH * 0.39;
    T.rx = Math.min(VW * 0.385, T.ry * 1.9, 250);
    DATA.plots.forEach((p, i) => {
      const a = Math.PI / 2 + (i * Math.PI * 2) / DATA.plots.length;
      const x = T.cx + T.rx * Math.cos(a), y = T.cy + T.ry * Math.sin(a);
      const depth = (y - (T.cy - T.ry)) / (2 * T.ry);
      T.pos[p.id] = { x, y, s: T.k * (0.8 + 0.22 * depth) };
    });
    T.pos.hearth = { x: T.cx, y: T.cy, s: T.k };
    T.stars = Array.from({ length: 60 }, () => ({ x: rand(0, VW), y: rand(0, T.top), r: rand(0.4, 1.3), p: rand(0, 6) }));
    const ridge = (h0, h1, step) => {
      const pts = [];
      for (let x = -20; x <= VW + 40; x += step * rand(0.6, 1.3)) pts.push([x, T.top - rand(h0, h1) * T.k]);
      return pts;
    };
    T.ridges = [ridge(14, 46, 38), ridge(4, 20, 26)];
    if (!T.flakes.length) T.flakes = Array.from({ length: 170 }, () => ({ x: Math.random(), y: Math.random(), z: rand(0.3, 1), p: rand(0, 6) }));
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
      case 'woodcutter': {
        hut(x + 4 * s, y, w, h, rh, '#7a5434', '#4d3220', lit);
        ctx.fillStyle = '#6b4526';
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) {
          ell(x - 19 * s + j * 6 * s + i * 3 * s, y - 3 * s - i * 5 * s, 3 * s, 3 * s); ctx.fill();
          ctx.fillStyle = '#d9b07c'; ell(x - 19 * s + j * 6 * s + i * 3 * s, y - 3 * s - i * 5 * s, 1.6 * s, 1.6 * s); ctx.fill(); ctx.fillStyle = '#6b4526';
        }
        ctx.fillStyle = SNOW; ell(x - 14 * s, y - 15 * s, 7 * s, 2 * s); ctx.fill();
        break;
      }
      case 'hunter': {
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
      case 'coalpit': {
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
      case 'ironmine': {
        ctx.fillStyle = 'rgba(8,16,30,.35)'; ell(x, y + 2, 28 * s, 8 * s); ctx.fill();
        ctx.fillStyle = '#5d6673'; ctx.beginPath(); ctx.moveTo(x - 27 * s, y); ctx.lineTo(x - 18 * s, y - 24 * s); ctx.lineTo(x - 4 * s, y - 32 * s); ctx.lineTo(x + 14 * s, y - 26 * s); ctx.lineTo(x + 27 * s, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7d8794'; ctx.beginPath(); ctx.moveTo(x - 18 * s, y - 24 * s); ctx.lineTo(x - 4 * s, y - 32 * s); ctx.lineTo(x - 2 * s, y - 18 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = SNOW; ctx.beginPath(); ctx.moveTo(x - 12 * s, y - 28 * s); ctx.lineTo(x - 4 * s, y - 32 * s); ctx.lineTo(x + 8 * s, y - 28 * s); ctx.quadraticCurveTo(x - 2 * s, y - 25 * s, x - 12 * s, y - 28 * s); ctx.fill();
        ctx.fillStyle = '#0d1014'; ctx.beginPath(); ctx.moveTo(x - 8 * s, y); ctx.lineTo(x - 8 * s, y - 11 * s); ctx.quadraticCurveTo(x, y - 19 * s, x + 8 * s, y - 11 * s); ctx.lineTo(x + 8 * s, y); ctx.fill();
        ctx.strokeStyle = '#7a5434'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(x - 9 * s, y); ctx.lineTo(x - 9 * s, y - 12 * s); ctx.lineTo(x + 9 * s, y - 12 * s); ctx.lineTo(x + 9 * s, y); ctx.stroke();
        if (lit) { ctx.fillStyle = '#ffc56a'; ctx.shadowColor = '#ff9a3c'; ctx.shadowBlur = 10; ell(x + 12 * s, y - 10 * s, 1.8 * s, 1.8 * s); ctx.fill(); ctx.shadowBlur = 0; }
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
    const locked = S.lv.hearth < p.unlock;
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
      ctx.fillStyle = '#ffe08a'; ctx.font = `700 ${16 * s}px 'Grenze', serif`; ctx.textAlign = 'center';
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
  // The Hearthwyrm
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
  // o: { level, skin, element, dormant, blaze, scale, petAge, glow, embers }
  function drawWyrm(x, y, t, o) {
    const L = o.level, stIdx = KH.stageIndex(L), st = DATA.hearth.stages[stIdx];
    const skin = DATA.skins[o.skin] || DATA.skins.hearth;
    const elem = o.element ? DATA.ascension.branches[o.element] : null;
    const f = st.size * o.scale;
    const dorm = o.dormant;
    const dark = dorm ? shade(skin.body[0], -0.45) : skin.body[0];
    const light = dorm ? shade(skin.body[1], -0.5) : skin.body[1];
    const belly = dorm ? shade(skin.belly, -0.5) : skin.belly;
    const horn = shade(skin.horn, dorm ? -0.5 : 0);
    const fh = dorm ? 0 : { low: 0.7, steady: 1, roaring: 1.4 }[o.blaze];
    const pet = o.petAge != null && o.petAge < 1.6 ? 1 - o.petAge / 1.6 : 0;

    ctx.save();
    ctx.translate(x, y);
    if (!dorm && o.glow !== false) {
      const g = ctx.createRadialGradient(0, -6 * f, 0, 0, -6 * f, 110 * f * (0.8 + 0.3 * fh));
      g.addColorStop(0, `rgba(255,150,70,${0.42 * fh})`); g.addColorStop(1, 'rgba(255,150,70,0)');
      ctx.fillStyle = g; ell(0, -6 * f, 150 * f, 90 * f); ctx.fill();
    }
    ctx.scale(f, f);
    // Primordial halo / ascension aura behind everything
    if (!dorm && (elem || stIdx >= 6)) {
      const col = elem ? elem.color : '#ffd27a';
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
        ctx.fillStyle = elem && o.element === 'rimeward' && !dorm ? '#dff6ff' : horn;
        ctx.beginPath(); ctx.moveTo(q.px - q.r * 0.35, q.py - q.r * 0.8); ctx.lineTo(q.px, q.py - q.r * (1.6 + stIdx * 0.08)); ctx.lineTo(q.px + q.r * 0.35, q.py - q.r * 0.8); ctx.fill();
        if (o.element === 'stormheart' && !dorm && Math.sin(t * 7 + i) > 0.6) {
          ctx.fillStyle = '#ffb38a'; ell(q.px, q.py - q.r * 1.9, 0.9, 0.9); ctx.fill();
        }
      }
    };
    tube(back, false); spikes(back);

    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ctx.fillStyle = i % 2 ? '#5d6673' : '#4b535e';
      ell(Math.cos(a) * 15, Math.sin(a) * 6.5 - 1, 4, 3); ctx.fill();
    }
    if (dorm) {
      for (let i = 0; i < 5; i++) { ctx.fillStyle = `rgba(255,90,40,${0.25 + 0.2 * Math.sin(t * 2 + i)})`; ell(-6 + i * 3, -1, 1.6, 1.2); ctx.fill(); }
      ctx.fillStyle = 'rgba(160,170,185,.25)';
      for (let i = 0; i < 3; i++) { const k = (t * 0.4 + i / 3) % 1; ell(Math.sin(k * 6 + i) * 3, -6 - k * 30, 3 + k * 6, 2 + k * 4); ctx.fill(); }
    } else {
      ctx.globalCompositeOperation = 'lighter';
      const g2 = ctx.createRadialGradient(0, -10, 0, 0, -10, 34 * fh);
      g2.addColorStop(0, 'rgba(255,170,80,.55)'); g2.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g2; ell(0, -10, 34 * fh, 30 * fh); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const tongue = (dx, w, h, col) => {
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(dx - w, -1);
        ctx.quadraticCurveTo(dx - w * 0.9, -h * 0.55, dx + Math.sin(t * 6 + dx) * 2, -h);
        ctx.quadraticCurveTo(dx + w * 0.9, -h * 0.55, dx + w, -1); ctx.closePath(); ctx.fill();
      };
      const fl = (k) => 1 + 0.13 * Math.sin(t * 9 + k) + 0.07 * Math.sin(t * 17 + k * 2);
      tongue(-5, 6, 20 * fh * fl(1), skin.fire[0]);
      tongue(5, 6, 18 * fh * fl(2), skin.fire[0]);
      tongue(0, 8, 28 * fh * fl(3), skin.fire[0]);
      tongue(0, 5, 18 * fh * fl(4), elem ? elem.crest : skin.fire[1]);
      tongue(-2, 2.5, 10 * fh * fl(5), '#fffbe8');
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
      ctx.fillStyle = skin.eye; ctx.shadowColor = skin.fire[1]; ctx.shadowBlur = 8;
      ell(-3, -2, 2.6, blink ? 0.4 : 1.9); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#1b1012'; ell(-3.4, -2, 0.7, blink ? 0.2 : 1.5); ctx.fill();
    }
    ctx.restore();
    if (pet) {
      ctx.fillStyle = `rgba(255,120,140,${pet})`;
      for (let i = 0; i < 3; i++) heart(hx - 8 + i * 9, hy - 16 - (1 - pet) * 26 - i * 5, 2.4 + i * 0.4);
    }
    ctx.restore();
    if (o.embers && !dorm && Math.random() < 0.35 * fh) T.embers.push({ x: x + rand(-6, 6) * f, y: y - 18 * f, vx: rand(-8, 8), vy: rand(-28, -14) * (0.6 + fh * 0.4), life: rand(1.2, 2.4), age: 0, col: elem ? elem.crest : skin.fire[1] });
    return { f, hx, hy };
  }
  function townWyrm(x, y, t, now) {
    const r = drawWyrm(x, y, t, {
      level: S.lv.hearth, skin: S.skins.on, element: S.wyrm.element, dormant: S.dormant, blaze: S.blaze,
      scale: T.k * 1.3, petAge: UI.petT ? (now - UI.petT) / 1000 : null, embers: true,
    });
    const R = KH.lastRates();
    if (!S.dormant && R && R.net.coal < 0 && S.res.coal / -R.net.coal < 45) pill(x + r.hx * r.f, y + (r.hy - 22) * r.f, 'Hungry!', T.k, 1);
    else if (S.dormant) pill(x, y - 46 * r.f, 'Dormant: needs coal', T.k, 0);
  }

  // Paint every <canvas data-wyrm> inside el with a still portrait of the wyrm.
  KH.paintWyrms = (el) => {
    el.querySelectorAll('canvas[data-wyrm]').forEach((c) => {
      const w = c.width, h = c.height;
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      const bg = g.createRadialGradient(w / 2, h * 0.62, 10, w / 2, h * 0.62, w * 0.6);
      bg.addColorStop(0, '#3a2a22'); bg.addColorStop(1, '#0f1826');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      const level = Number(c.dataset.wyrm) || 1;
      const size = DATA.hearth.stages[KH.stageIndex(level)].size;
      const old = ctx;
      ctx = g;
      try {
        drawWyrm(w * 0.48, h * 0.7, 2.2, {
          level, skin: c.dataset.skin || 'hearth', element: c.dataset.element || null, dormant: false, blaze: 'steady',
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
      const sx = T.cx + (P.x - T.cx) * 0.28, sy = T.cy + (P.y - T.cy) * 0.28;
      const x = sx + (P.x - sx) * (0.15 + 0.7 * u) + Math.sin(i * 7) * 5, y = sy + (P.y - sy) * (0.15 + 0.7 * u) + Math.cos(i * 5) * 3;
      list.push({ y, draw: () => {
        const s = T.k * (0.85 + 0.25 * ((y - (T.cy - T.ry)) / (2 * T.ry)));
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
  function frame(now) {
    requestAnimationFrame(frame);
    if (!S || UI.tab !== 'town' || document.hidden || !VW) return;
    const t = now / 1000;
    const dt = Math.min(0.05, (now - (lastNow || now)) / 1000);
    lastNow = now;
    const R = KH.lastRates() || KH.rates(false);
    const wxType = KH.curWx().type;
    ctx = townCtx;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const sky = ctx.createLinearGradient(0, 0, 0, T.top);
    sky.addColorStop(0, '#050a14'); sky.addColorStop(1, '#16273e');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, T.top + 2);
    for (const st of T.stars) { ctx.fillStyle = `rgba(220,235,255,${0.35 + 0.35 * Math.sin(t * 1.3 + st.p)})`; ell(st.x, st.y, st.r, st.r); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 2; b++) {
      ctx.strokeStyle = b ? 'rgba(120,90,220,.10)' : 'rgba(80,220,170,.12)'; ctx.lineWidth = 14 + b * 8;
      ctx.beginPath();
      for (let xx = -10; xx <= VW + 10; xx += 12) {
        const yy = T.top * (0.32 + b * 0.16) + Math.sin(xx * 0.012 + t * 0.25 + b * 2) * 10 + Math.sin(xx * 0.03 - t * 0.4) * 4;
        if (xx === -10) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    T.ridges.forEach((pts, li) => {
      ctx.fillStyle = li ? '#1b2c42' : '#122136';
      ctx.beginPath(); ctx.moveTo(-20, T.top + 2); pts.forEach(([px, py]) => ctx.lineTo(px, py)); ctx.lineTo(VW + 40, T.top + 2); ctx.closePath(); ctx.fill();
      if (!li) {
        ctx.fillStyle = 'rgba(210,228,245,.18)';
        pts.forEach(([px, py], i) => { if (i % 2 === 0) { ctx.beginPath(); ctx.moveTo(px - 6, py + 7); ctx.lineTo(px, py); ctx.lineTo(px + 6, py + 7); ctx.fill(); } });
      }
    });
    const gr = ctx.createLinearGradient(0, T.top, 0, VH);
    gr.addColorStop(0, '#4d6580'); gr.addColorStop(0.5, '#6f89a3'); gr.addColorStop(1, '#8aa3bb');
    ctx.fillStyle = gr; ctx.fillRect(0, T.top, VW, VH - T.top);
    ctx.fillStyle = 'rgba(230,240,250,.07)';
    for (let i = 0; i < 6; i++) { ell((i * 97 + 40) % VW, T.top + 30 + i * (VH - T.top) / 6, 90, 10); ctx.fill(); }
    ctx.strokeStyle = 'rgba(70,82,100,.28)'; ctx.lineCap = 'round';
    for (const p of DATA.plots) {
      if (!S.lv[p.id]) continue;
      const P = T.pos[p.id];
      ctx.lineWidth = 7 * P.s; ctx.beginPath(); ctx.moveTo(T.cx, T.cy); ctx.lineTo(P.x, P.y); ctx.stroke();
    }

    const items = DATA.plots.map((p) => ({ y: T.pos[p.id].y, draw: () => drawPlot(p.id, now, t) }));
    items.push({ y: T.cy, draw: () => townWyrm(T.cx, T.cy, t, now) });
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

    const coldA = { Comfortable: 0.04, Chilly: 0.14, Cold: 0.28, Freezing: 0.42 }[R.band.name] + (wxType === 'blizzard' ? 0.1 : wxType === 'deepfreeze' ? 0.16 : 0);
    const vg = ctx.createRadialGradient(T.cx, T.cy, Math.min(VW, VH) * 0.25, T.cx, T.cy, Math.max(VW, VH) * 0.75);
    vg.addColorStop(0, 'rgba(120,175,240,0)'); vg.addColorStop(1, `rgba(120,175,240,${coldA})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    if (KH.isStorm(wxType)) { ctx.fillStyle = 'rgba(205,225,250,.10)'; ctx.fillRect(0, 0, VW, VH); }
    if (KH.raidNear && KH.raidNear()) {
      const a = 0.12 + 0.08 * Math.sin(t * 4);
      const rg = ctx.createLinearGradient(0, 0, 0, VH);
      rg.addColorStop(0, `rgba(200,40,30,${a})`); rg.addColorStop(0.25, 'rgba(200,40,30,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, VW, VH);
    }

    const cfg = { clear: [45, 0.02, 1], snow: [120, 0.05, 1], blizzard: [170, 0.45, 1.8], deepfreeze: [110, 0.08, 0.6] }[wxType];
    for (let i = 0; i < cfg[0]; i++) {
      const fl = T.flakes[i];
      fl.y += (0.04 + 0.06 * fl.z) * cfg[2] * dt;
      fl.x += (cfg[1] * fl.z + Math.sin(t + fl.p) * 0.01) * dt;
      if (fl.y > 1) { fl.y -= 1; fl.x = Math.random(); }
      if (fl.x > 1) fl.x -= 1;
      const r = (0.6 + 1.6 * fl.z) * (wxType === 'blizzard' ? 1.1 : 1);
      ctx.fillStyle = `rgba(240,248,255,${0.35 + 0.5 * fl.z})`;
      if (wxType === 'blizzard') ctx.fillRect(fl.x * VW, fl.y * VH, r * 5 * fl.z + 2, r * 0.7);
      else { ell(fl.x * VW, fl.y * VH, r, r); ctx.fill(); }
    }
  }

  function hitTest(px, py) {
    const W = T.pos.hearth, f = DATA.hearth.stages[KH.stageIndex(S.lv.hearth)].size * T.k * 1.3;
    if (Math.hypot(px - W.x, (py - (W.y - 12 * f)) * 1.1) < 44 * f + 10) return 'hearth';
    let best = null, bd = 1e9;
    for (const p of DATA.plots) {
      const P = T.pos[p.id];
      const d = Math.hypot(px - P.x, py - (P.y - 14 * P.s));
      if (d < 32 * P.s && d < bd) { best = p.id; bd = d; }
    }
    return best;
  }

  let down = null;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.offsetX, y: e.offsetY }; });
  cv.addEventListener('pointerup', (e) => {
    if (!down || !S || Math.hypot(e.offsetX - down.x, e.offsetY - down.y) > 12) { down = null; return; }
    down = null;
    const pid = hitTest(e.offsetX, e.offsetY);
    if (!pid) return;
    if (pid !== 'hearth' && S.lv.hearth < PLOT[pid].unlock) {
      KH.toast(`The ${KH.plotName(pid)} unlocks at Hearthwyrm Lv ${PLOT[pid].unlock}.`, 'cold');
      return;
    }
    KH.sfx('tap');
    if (pid === 'hearth') UI.petT = performance.now();
    ACT.plot(pid);
    KH.renderAll(true);
  });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe($('#stage'));
})();
