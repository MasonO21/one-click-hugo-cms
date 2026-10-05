// Particle effects, popups and screen shake.
import { INK, rgba, circlePath, ellipsePath } from './art/common.js';

const TAU = Math.PI * 2;
const CONFETTI = ['#ff5d5d', '#ffd23f', '#3fc1ff', '#7be07b', '#ff8fd1', '#ffffff', '#b38cff'];

export class FX {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.shakeAmt = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.flash = 0;
  }

  clear() { this.parts.length = 0; this.texts.length = 0; this.rings.length = 0; this.shakeAmt = 0; this.flash = 0; this.critters = []; }

  add(p) { if (this.parts.length < 600) this.parts.push(p); }

  dust(x, y, n = 8, power = 1, color = '#fff6e6') {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const sp = (60 + Math.random() * 160) * power;
      this.add({ k: 'dust', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, r: 6 + Math.random() * 8 * power, life: 0.45 + Math.random() * 0.3, t: 0, c: color, g: -40, drag: 4 });
    }
  }

  sparks(x, y, n = 10, color = '#ffd23f', power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (200 + Math.random() * 300) * power;
      this.add({ k: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5 + Math.random() * 5, life: 0.5 + Math.random() * 0.4, t: 0, c: color, g: 600, drag: 2.5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12 });
    }
  }

  confetti(x, y, n = 80, spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6 * spread;
      const sp = 500 + Math.random() * 700;
      this.add({ k: 'conf', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 8 + Math.random() * 8, h: 5 + Math.random() * 5, life: 2 + Math.random() * 1.2, t: 0, c: CONFETTI[i % CONFETTI.length], g: 900, drag: 2.2, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 18, flip: Math.random() * TAU });
    }
  }

  oil(x, y, n = 3) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 150 + Math.random() * 260;
      this.add({ k: 'drop', x: x + (Math.random() - 0.5) * 120, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + Math.random() * 2.5, life: 0.5 + Math.random() * 0.3, t: 0, c: '#ffd36b', g: 1500, drag: 0.5 });
    }
  }

  steam(x, y, spread = 60) {
    this.add({ k: 'steam', x: x + (Math.random() - 0.5) * spread, y, vx: (Math.random() - 0.5) * 20, vy: -50 - Math.random() * 40, r: 8 + Math.random() * 10, life: 1.4 + Math.random() * 0.8, t: 0, c: '#ffffff', g: -10, drag: 0.6 });
  }

  splash(x, y, n = 18, color = '#7fd0ff') {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const sp = 250 + Math.random() * 450;
      this.add({ k: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 3 + Math.random() * 4, life: 0.8 + Math.random() * 0.4, t: 0, c: color, g: 1600, drag: 0.4 });
    }
  }

  smoke(x, y, n = 10, color = '#555') {
    for (let i = 0; i < n; i++) {
      this.add({ k: 'dust', x: x + (Math.random() - 0.5) * 60, y: y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 120, r: 10 + Math.random() * 14, life: 0.9 + Math.random() * 0.6, t: 0, c: color, g: -60, drag: 1.5 });
    }
  }

  wind(x, y, dx, dy, w, h) {
    // streak inside a wind zone
    const px = x + (Math.random() - 0.5) * w, py = y + (Math.random() - 0.5) * h;
    const l = Math.hypot(dx, dy) || 1;
    this.add({ k: 'streak', x: px, y: py, vx: dx / l * 700, vy: dy / l * 700, len: 30 + Math.random() * 40, life: 0.35 + Math.random() * 0.2, t: 0, c: 'rgba(255,255,255,0.8)', g: 0, drag: 0 });
  }

  // A very good dog pops up from below and chomps the dropped sausage.
  dog(x, y) { this.critters = this.critters || []; this.critters.push({ k: 'dog', x, y, t: 0, life: 1.25 }); }

  trail(x, y, c) {
    this.add({ k: 'trail', x, y, vx: 0, vy: 0, r: 10, life: 0.3, t: 0, c, g: 0, drag: 0 });
  }

  ring(x, y, r0, r1, life = 0.4, color = '#fff') { this.rings.push({ x, y, r0, r1, life, t: 0, c: color }); }

  text(str, x, y, opts = {}) {
    this.texts.push({ str, x, y, t: 0, life: opts.life || 1.1, size: opts.size || 46, color: opts.color || '#ffd23f', rot: opts.rot ?? (Math.random() - 0.5) * 0.2, vy: opts.vy ?? -60 });
  }

  shake(a) { this.shakeAmt = Math.min(28, Math.max(this.shakeAmt, a)); }

  update(dt) {
    for (const p of this.parts) {
      p.t += dt;
      p.vy += p.g * dt;
      const d = 1 - Math.min(1, p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.flip !== undefined) p.flip += dt * 9;
    }
    this.parts = this.parts.filter(p => p.t < p.life);
    for (const t of this.texts) { t.t += dt; t.y += t.vy * dt; }
    this.texts = this.texts.filter(t => t.t < t.life);
    for (const r of this.rings) r.t += dt;
    if (this.critters) { for (const c of this.critters) c.t += dt; this.critters = this.critters.filter(c => c.t < c.life); }
    this.rings = this.rings.filter(r => r.t < r.life);
    this.shakeAmt *= Math.pow(0.0008, dt);
    if (this.shakeAmt < 0.3) this.shakeAmt = 0;
    this.shakeX = (Math.random() - 0.5) * 2 * this.shakeAmt;
    this.shakeY = (Math.random() - 0.5) * 2 * this.shakeAmt;
    if (this.flash > 0) this.flash -= dt * 3;
  }

  drawBack(ctx) {
    for (const p of this.parts) {
      if (p.k !== 'steam' && p.k !== 'trail' && p.k !== 'streak') continue;
      const u = p.t / p.life;
      if (p.k === 'steam') {
        ctx.globalAlpha = 0.35 * (1 - u) * Math.min(1, p.t * 4);
        circlePath(ctx, p.x, p.y, p.r * (1 + u * 1.5)); ctx.fillStyle = p.c; ctx.fill();
      } else if (p.k === 'trail') {
        ctx.globalAlpha = 0.35 * (1 - u);
        circlePath(ctx, p.x, p.y, p.r * (1 - u * 0.6)); ctx.fillStyle = p.c; ctx.fill();
      } else if (p.k === 'streak') {
        ctx.globalAlpha = 0.6 * Math.sin(u * Math.PI);
        const l = Math.hypot(p.vx, p.vy) || 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx / l * p.len, p.y - p.vy / l * p.len);
        ctx.lineWidth = 3; ctx.strokeStyle = p.c; ctx.lineCap = 'round'; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawCritters(ctx) {
    for (const c of this.critters || []) {
      if (c.k !== 'dog') continue;
      const u = c.t;
      const rise = u < 0.22 ? u / 0.22 : u < 0.8 ? 1 : Math.max(0, 1 - (u - 0.8) / 0.35);
      const e = 1 - Math.pow(1 - rise, 3);
      const open = u < 0.3 ? Math.min(1, u / 0.2) : u < 0.42 ? 1 - (u - 0.3) / 0.12 : 0;
      const chew = u > 0.42 && u < 0.8 ? Math.sin(u * 40) * 0.08 : 0;
      ctx.save();
      ctx.translate(c.x, c.y + 150 - e * 150);
      ctx.rotate(chew);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // ears
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(sx * 52, -38, 20, 40, sx * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#7a4a2a'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
      }
      // head
      ctx.beginPath(); ctx.ellipse(0, -10, 58, 54, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#c98a52'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
      // muzzle + jaw
      ctx.beginPath(); ctx.ellipse(0, 22, 36, 24 + open * 10, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f1d6b0'; ctx.fill(); ctx.stroke();
      if (open > 0.05) {
        ctx.beginPath(); ctx.ellipse(0, 32, 24, 14 * open, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#5a1414'; ctx.fill(); ctx.stroke();
      } else {
        // happy chewing: sausage end poking out
        ctx.beginPath(); ctx.moveTo(14, 30); ctx.lineTo(44, 36);
        ctx.lineWidth = 16; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 11; ctx.strokeStyle = '#d9573b'; ctx.stroke();
      }
      // nose & eyes
      ctx.beginPath(); ctx.ellipse(0, 8, 11, 8, 0, 0, Math.PI * 2); ctx.fillStyle = '#2a1a14'; ctx.fill();
      for (const sx of [-1, 1]) {
        if (open <= 0.05 && u > 0.42) { ctx.beginPath(); ctx.arc(sx * 22, -22, 8, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(sx * 22, -22, 7, 0, Math.PI * 2); ctx.fillStyle = '#2a1a14'; ctx.fill(); ctx.beginPath(); ctx.arc(sx * 22 - 2, -25, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
      }
      ctx.restore();
    }
  }

  drawFront(ctx) {
    this.drawCritters(ctx);
    for (const r of this.rings) {
      const u = r.t / r.life;
      ctx.globalAlpha = (1 - u) * 0.8;
      circlePath(ctx, r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - u, 3)));
      ctx.lineWidth = 6 * (1 - u) + 1; ctx.strokeStyle = r.c; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of this.parts) {
      const u = p.t / p.life;
      if (p.k === 'dust') {
        ctx.globalAlpha = 0.7 * (1 - u);
        circlePath(ctx, p.x, p.y, p.r * (0.6 + u)); ctx.fillStyle = p.c; ctx.fill();
      } else if (p.k === 'star') {
        ctx.globalAlpha = 1 - u * u;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        const s = p.r * (1 - u * 0.5);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; const rr = i % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fillStyle = p.c; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
        ctx.restore();
      } else if (p.k === 'conf') {
        ctx.globalAlpha = Math.min(1, (1 - u) * 3);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(Math.cos(p.flip), 1);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else if (p.k === 'drop') {
        ctx.globalAlpha = 1 - u;
        circlePath(ctx, p.x, p.y, p.r); ctx.fillStyle = p.c; ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      const u = t.t / t.life;
      const pop = u < 0.15 ? 0.4 + (u / 0.15) * 0.8 : u < 0.25 ? 1.2 - (u - 0.15) / 0.1 * 0.2 : 1;
      ctx.save();
      ctx.globalAlpha = u > 0.75 ? (1 - u) / 0.25 : 1;
      ctx.translate(t.x, t.y); ctx.rotate(t.rot); ctx.scale(pop, pop);
      ctx.font = `${t.size}px "Lilita One", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = t.size * 0.22; ctx.strokeStyle = INK; ctx.strokeText(t.str, 0, 0);
      ctx.fillStyle = t.color; ctx.fillText(t.str, 0, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.save(); ctx.beginPath(); ctx.rect(-500, -t.size, 1000, t.size * 0.55); ctx.clip(); ctx.fillText(t.str, 0, 0); ctx.restore();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
