// Space props: satellite, asteroid, hoverbot, laser gate, gravity lift, rocket, cargo crate, UFO, moon rock.
import {
  INK, LW, rgba, lighten, darken, mix, rrPath, rrc, fillStroke, strokeOnly, ellipsePath, circlePath,
  polyPath, smoothPath, vgrad, hgrad, rgrad, toonBox, toonCircle, toonPoly, rod, gloss, rng, text,
} from '../common.js';

const TAU = Math.PI * 2;

// Text that stays readable when the prop is mirrored (inst.flip).
function label(ctx, o, str, x, y, size, color, opts) {
  if (o && o.flip) { ctx.save(); ctx.scale(-1, 1); text(ctx, str, -x, y, size, color, opts); ctx.restore(); }
  else text(ctx, str, x, y, size, color, opts);
}

function sparkle(ctx, x, y, s, a = 1, col = '#ffffff') {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.lineTo(s * 0.22, -s * 0.22); ctx.lineTo(s, 0); ctx.lineTo(s * 0.22, s * 0.22);
  ctx.lineTo(0, s); ctx.lineTo(-s * 0.22, s * 0.22); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.22, -s * 0.22); ctx.closePath();
  ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fill();
  ctx.restore();
}

function rivet(ctx, x, y, r = 2.4, col = '#d9e1e8') {
  circlePath(ctx, x, y, r); ctx.fillStyle = darken(col, 0.45); ctx.fill();
  circlePath(ctx, x - r * 0.3, y - r * 0.3, r * 0.6); ctx.fillStyle = col; ctx.fill();
}

// Roughen a polygon: subdivide edges and jitter points along the normal (deterministic).
function roughPoly(pts, seed, amp, step = 16, flatY = null) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(len / step));
    const nx = (y2 - y1) / len, ny = -(x2 - x1) / len;
    for (let k = 0; k < n; k++) {
      const u = k / n;
      let x = x1 + (x2 - x1) * u, y = y1 + (y2 - y1) * u;
      const flat = flatY !== null && Math.abs(y1 - flatY) < 0.5 && Math.abs(y2 - flatY) < 0.5;
      if (k > 0 && !flat) { const j = (r() - 0.5) * 2 * amp; x += nx * j; y += ny * j; }
      out.push([x, y]);
    }
  }
  return out;
}

function crater(ctx, x, y, rx, ry, base) {
  ellipsePath(ctx, x, y, rx, ry); ctx.fillStyle = darken(base, 0.22); ctx.fill();
  ctx.save(); ellipsePath(ctx, x, y, rx, ry); ctx.clip();
  ellipsePath(ctx, x + rx * 0.25, y + ry * 0.3, rx, ry); ctx.fillStyle = lighten(base, 0.12); ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.lineWidth = 2; ctx.strokeStyle = rgba(darken(base, 0.6), 0.55); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, y, rx + 1, ry + 1, 0, Math.PI * 0.1, Math.PI * 0.9); ctx.lineWidth = 2; ctx.strokeStyle = rgba(lighten(base, 0.5), 0.6); ctx.stroke();
}

function crystal(ctx, x, y, h, ang, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-5, -h * 0.7); ctx.lineTo(0, -h); ctx.lineTo(5, -h * 0.7); ctx.lineTo(5, 0); ctx.closePath();
  fillStroke(ctx, col, 2.5);
  ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, 0); ctx.lineTo(5, 0); ctx.lineTo(5, -h * 0.7); ctx.closePath();
  ctx.fillStyle = rgba(darken(col, 0.4), 0.35); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-3.5, -h * 0.66, 1.6, h * 0.5);
  ctx.restore();
}

function glow(ctx, x, y, r, col, a = 0.5) {
  ctx.fillStyle = rgrad(ctx, x, y, 0, r, [[0, rgba(col, a)], [1, rgba(col, 0)]]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export const SPACE_ART = {
  // ======================= Satellite (rotor) =======================
  satellite: {
    draw(ctx, o, t) {
      // solar panel wings (collision: x ±35..±195, y -9..9)
      for (const s of [-1, 1]) {
        ctx.save(); ctx.scale(s, 1);
        rod(ctx, 33, 0, 46, 0, 6, '#c9d2da');
        const px = 44, pw = 151;
        rrPath(ctx, px, -9, pw, 18, 2);
        ctx.fillStyle = vgrad(ctx, -9, 9, [[0, '#3b6fd8'], [1, '#1e3f95']]); ctx.fill();
        ctx.save(); rrPath(ctx, px, -9, pw, 18, 2); ctx.clip();
        ctx.strokeStyle = 'rgba(160,200,255,0.55)'; ctx.lineWidth = 1.4;
        for (let x = px + 15; x < px + pw; x += 15) { ctx.beginPath(); ctx.moveTo(x, -9); ctx.lineTo(x, 9); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px + pw, 0); ctx.stroke();
        // diagonal sheen
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath(); ctx.moveTo(px + 30, -10); ctx.lineTo(px + 52, -10); ctx.lineTo(px + 40, 10); ctx.lineTo(px + 18, 10); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(px + 100, -10); ctx.lineTo(px + 108, -10); ctx.lineTo(px + 96, 10); ctx.lineTo(px + 88, 10); ctx.closePath(); ctx.fill();
        ctx.restore();
        rrPath(ctx, px, -9, pw, 18, 2); strokeOnly(ctx, 3.5);
        // silver frame caps
        rrc(ctx, px + pw - 2, 0, 6, 20, 2); fillStroke(ctx, '#c9d2da', 2.5);
        ctx.restore();
      }
      // dish antenna (decor on top)
      rod(ctx, 10, -34, 18, -48, 4, '#c9d2da');
      ctx.save(); ctx.translate(20, -52); ctx.rotate(0.55);
      ctx.beginPath(); ctx.moveTo(-16, -2); ctx.quadraticCurveTo(0, 12, 16, -2); ctx.closePath();
      fillStroke(ctx, '#eef2f5', 3);
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -10); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      circlePath(ctx, 0, -11, 2.4); ctx.fillStyle = INK; ctx.fill();
      ctx.restore();
      // whip antenna with blinking light
      ctx.beginPath(); ctx.moveTo(-20, -35); ctx.lineTo(-26, -62); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      const blink = (t * 1.5) % 1 < 0.25;
      if (blink) glow(ctx, -26, -64, 14, '#ff5a5a', 0.6);
      circlePath(ctx, -26, -64, 3.6); fillStroke(ctx, blink ? '#ff6b6b' : '#a33', 2);
      // body: gold foil box (collision 70×70 r6)
      rrPath(ctx, -35, -35, 70, 70, 6);
      ctx.fillStyle = hgrad(ctx, -35, 35, [[0, '#c98f1e'], [0.3, '#ffd866'], [0.55, '#e7ad35'], [0.8, '#ffe28a'], [1, '#b87d16']]);
      ctx.fill();
      ctx.save(); rrPath(ctx, -35, -35, 70, 70, 6); ctx.clip();
      // crinkled foil facets
      const r = rng(5);
      for (let i = 0; i < 9; i++) {
        const fx = -35 + r() * 70, fy = -35 + r() * 70;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 8 + r() * 10, fy + (r() - 0.5) * 14); ctx.lineTo(fx + r() * 8, fy + 10 + r() * 8); ctx.closePath();
        ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.28)' : 'rgba(120,70,0,0.18)'; ctx.fill();
      }
      ctx.fillStyle = 'rgba(90,50,0,0.22)'; ctx.fillRect(-35, 14, 70, 22);
      ctx.restore();
      rrPath(ctx, -35, -35, 70, 70, 6); strokeOnly(ctx);
      // instrument panel + lens
      rrc(ctx, 0, 2, 44, 44, 5); fillStroke(ctx, '#d4dbe2', 3);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-19, -17, 38, 4);
      circlePath(ctx, 0, 4, 13); fillStroke(ctx, '#2a3140', 3);
      circlePath(ctx, 0, 4, 8); ctx.fillStyle = rgrad(ctx, -2, 2, 0, 8, [[0, '#9ff3ff'], [1, '#2a7fd6']]); ctx.fill();
      circlePath(ctx, -3, 1, 2.6); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
      for (const [rx, ry] of [[-17, -15], [17, -15], [-17, 21], [17, 21]]) rivet(ctx, rx, ry, 2);
      // status LEDs
      for (let i = 0; i < 3; i++) {
        const on = Math.floor(t * 3 + i) % 3 === 0;
        circlePath(ctx, -10 + i * 10, 20, 2.4); ctx.fillStyle = on ? '#7dff9a' : '#2e6a3c'; ctx.fill();
      }
    },
  },

  // ======================= Asteroid (floating platform) =======================
  asteroid: {
    draw(ctx, o) {
      const base = ['#a08f86', '#8f8aa6', '#a3927a'][(o.v || 0) % 3];
      const P = [[-80, 20], [-50, -50], [10, -70], [70, -40], [80, 30], [30, 70], [-40, 65]];
      const pts = roughPoly(P, 31 + (o.v || 0), 2.4, 14);
      polyPath(ctx, pts); ctx.fillStyle = base; ctx.fill();
      ctx.save(); polyPath(ctx, pts); ctx.clip();
      // light from the upper left, shadow lower right
      ctx.fillStyle = rgrad(ctx, -40, -40, 10, 150, [[0, rgba(lighten(base, 0.4), 0.55)], [0.5, 'rgba(0,0,0,0)'], [1, rgba(darken(base, 0.6), 0.55)]]);
      ctx.fillRect(-100, -90, 200, 180);
      crater(ctx, -30, -10, 16, 11, base);
      crater(ctx, 30, 22, 12, 8, base);
      crater(ctx, 44, -24, 8, 5.5, base);
      crater(ctx, -14, 38, 9, 6, base);
      crater(ctx, -58, 30, 6, 4, base);
      // speckles
      const r = rng(77);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = r() < 0.5 ? rgba(darken(base, 0.5), 0.35) : rgba(lighten(base, 0.6), 0.4); ctx.fillRect(-80 + r() * 160, -70 + r() * 140, 2, 2); }
      // rim light along the top edges
      ctx.lineWidth = 6; ctx.strokeStyle = rgba(lighten(base, 0.65), 0.55);
      ctx.beginPath(); ctx.moveTo(-80, 20); ctx.lineTo(-50, -50); ctx.lineTo(10, -70); ctx.lineTo(70, -40); ctx.stroke();
      ctx.restore();
      polyPath(ctx, pts); strokeOnly(ctx);
      // glowing crystals poking out of the lower side
      crystal(ctx, 56, 52, 22, 2.4, '#7af0e6');
      crystal(ctx, 66, 42, 15, 2.0, '#b48cff');
      // small orbiting pebbles (decor)
      circlePath(ctx, -92, 46, 5); fillStroke(ctx, darken(base, 0.1), 2.5);
      circlePath(ctx, 94, -4, 3.5); fillStroke(ctx, darken(base, 0.1), 2.2);
    },
  },

  // ======================= Hoverbot (mover) =======================
  hoverbot: {
    draw(ctx, o, t) {
      const col = ['#eef3f8', '#ffe2a8', '#d6f0ff'][(o.v || 0) % 3];
      // thruster flames (anim)
      for (const tx of [-44, 44]) {
        const f = 0.8 + 0.2 * Math.sin(t * 40 + tx) + 0.1 * Math.sin(t * 23);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, tx, 32, 26 * f, '#53d6ff', 0.45);
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(tx - 10, 24); ctx.quadraticCurveTo(tx - 8, 34 + 10 * f, tx, 30 + 22 * f); ctx.quadraticCurveTo(tx + 8, 34 + 10 * f, tx + 10, 24); ctx.closePath();
        ctx.fillStyle = 'rgba(90,210,255,0.85)'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(tx - 5, 24); ctx.quadraticCurveTo(tx - 4, 30 + 6 * f, tx, 28 + 12 * f); ctx.quadraticCurveTo(tx + 4, 30 + 6 * f, tx + 5, 24); ctx.closePath();
        ctx.fillStyle = '#eaffff'; ctx.fill();
        // nozzle
        ctx.beginPath(); ctx.moveTo(tx - 12, 14); ctx.lineTo(tx + 12, 14); ctx.lineTo(tx + 9, 26); ctx.lineTo(tx - 9, 26); ctx.closePath();
        fillStroke(ctx, '#6d7985', 3);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(tx - 8, 16, 4, 8);
      }
      // antenna (decor, outside the landing strip)
      ctx.beginPath(); ctx.moveTo(-64, -14); ctx.quadraticCurveTo(-70, -26, -74, -32); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      const ab = Math.sin(t * 6) > 0;
      circlePath(ctx, -75, -34, 4); fillStroke(ctx, ab ? '#ff6b6b' : '#c44', 2.2);
      // body (collision 150×34 r14)
      toonBox(ctx, 0, 0, 150, 34, 14, col);
      ctx.save(); rrc(ctx, 0, 0, 150, 34, 14); ctx.clip();
      ctx.fillStyle = '#ff8a3d'; ctx.fillRect(-75, 8, 150, 4);
      ctx.restore();
      rrc(ctx, 0, 0, 150, 34, 14); strokeOnly(ctx);
      // visor face
      rrc(ctx, 0, -1, 58, 22, 10); fillStroke(ctx, '#1d2433', 3);
      const blink = (t * 0.7) % 1 > 0.93;
      const look = Math.sin(t * 1.3) * 3;
      for (const ex of [-12, 12]) {
        if (blink) { ctx.fillStyle = '#5cf0ff'; ctx.fillRect(ex - 5 + look, -1, 10, 2.5); }
        else {
          rrc(ctx, ex + look, -1, 9, 11, 4); ctx.fillStyle = '#5cf0ff'; ctx.fill();
          rrc(ctx, ex + look - 1.5, -3.5, 3, 3.5, 1.5); ctx.fillStyle = '#e8ffff'; ctx.fill();
        }
      }
      ctx.save(); rrc(ctx, 0, -1, 58, 22, 10); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.moveTo(-26, -12); ctx.lineTo(-10, -12); ctx.lineTo(-22, 10); ctx.lineTo(-38, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
      // side lights
      for (const s of [-1, 1]) {
        circlePath(ctx, s * 54, -2, 4.5); fillStroke(ctx, (Math.floor(t * 4) % 2 === (s > 0 ? 0 : 1)) ? '#7dff9a' : '#2e7a48', 2.2);
        rivet(ctx, s * 38, -8, 1.8);
      }
    },
  },

  // ======================= Laser gate (timed hazard, stretchable) =======================
  laser: {
    draw(ctx, o, t, st) {
      const w = o.w || 300;
      const on = st ? st.on : true;
      const warn = st ? st.warn || 0 : 0;
      const x1 = -w / 2 + 30, x2 = w / 2 - 30;
      // beam
      if (on) {
        const pulse = 0.85 + 0.15 * Math.sin(t * 35);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = vgrad(ctx, -18, 18, [[0, 'rgba(255,40,80,0)'], [0.5, `rgba(255,40,80,${0.5 * pulse})`], [1, 'rgba(255,40,80,0)']]);
        ctx.fillRect(x1, -18, x2 - x1, 36);
        ctx.restore();
        // jittery core
        ctx.beginPath(); ctx.moveTo(x1, 0);
        for (let x = x1 + 12; x < x2; x += 12) ctx.lineTo(x, Math.sin(x * 0.4 + t * 50) * 1.6);
        ctx.lineTo(x2, 0);
        ctx.lineCap = 'round';
        ctx.lineWidth = 11 * pulse; ctx.strokeStyle = 'rgba(255,50,90,0.9)'; ctx.stroke();
        ctx.lineWidth = 5; ctx.strokeStyle = '#ffd0dc'; ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        // sparks at the ends
        for (const [ex, d] of [[x1, 1], [x2, -1]]) {
          for (let i = 0; i < 4; i++) {
            const a = (t * 13 + i * 1.7) % TAU;
            const len = 6 + ((t * 7 + i) % 1) * 8;
            ctx.beginPath(); ctx.moveTo(ex + d * 4, 0); ctx.lineTo(ex + d * (4 + Math.abs(Math.cos(a)) * len), Math.sin(a) * len);
            ctx.lineWidth = 2; ctx.strokeStyle = '#fff3a0'; ctx.stroke();
          }
        }
      } else if (warn > 0) {
        const fl = Math.sin(t * 70) > -0.2 ? 1 : 0.25;
        ctx.save();
        ctx.globalAlpha = (0.25 + 0.6 * warn) * fl;
        ctx.setLineDash([10, 6]); ctx.lineDashOffset = -t * 120;
        ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x2, 0);
        ctx.lineWidth = 2 + warn * 4; ctx.strokeStyle = '#ff4d6d'; ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      } else {
        // harmless: faint dotted guide
        ctx.save();
        ctx.setLineDash([3, 9]);
        ctx.beginPath(); ctx.moveTo(x1 + 4, 0); ctx.lineTo(x2 - 4, 0);
        ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,90,120,0.4)'; ctx.lineCap = 'round'; ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      // emitters (collision 30×40 r6 at both ends)
      const hot = on ? 1 : warn;
      for (const s of [-1, 1]) {
        const cx = s * (w / 2 - 15);
        ctx.save(); ctx.translate(cx, 0); ctx.scale(-s, 1); // local +x points inward
        // mounting bracket (decor, outward)
        rrc(ctx, -17, 0, 8, 26, 2); fillStroke(ctx, '#5a6470', 2.5);
        toonBox(ctx, 0, 0, 30, 40, 6, '#4b5563');
        // hazard stripes
        ctx.save(); rrc(ctx, 0, 0, 30, 40, 6); ctx.clip();
        ctx.fillStyle = '#ffcf3a'; ctx.fillRect(-15, -20, 30, 8);
        ctx.fillStyle = '#2a2f36';
        for (let k = -20; k < 20; k += 8) { ctx.beginPath(); ctx.moveTo(k, -12); ctx.lineTo(k + 4, -12); ctx.lineTo(k + 8, -20); ctx.lineTo(k + 4, -20); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        rrc(ctx, 0, 0, 30, 40, 6); strokeOnly(ctx, 3.5);
        rivet(ctx, -7, 13, 2); rivet(ctx, 7, 13, 2);
        // lens
        if (hot > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 12, 0, 18 + hot * 8, '#ff3060', 0.35 + hot * 0.4); ctx.restore(); }
        rrc(ctx, 12, 0, 10, 18, 4); fillStroke(ctx, '#2a2f36', 3);
        ellipsePath(ctx, 14, 0, 4, 7); ctx.fillStyle = on ? '#ffe0e8' : mix('#7a2234', '#ff6b8a', warn); ctx.fill();
        ctx.restore();
      }
    },
  },

  // ======================= Gravity lift (wind) =======================
  gravlift: {
    draw(ctx, o, t) {
      const C = '#5ef0ff';
      // glowing upward column filling the wind sensor (x -50..50, y -510..-10)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = vgrad(ctx, -510, -10, [[0, 'rgba(94,240,255,0)'], [0.6, 'rgba(94,240,255,0.10)'], [1, 'rgba(94,240,255,0.28)']]);
      ctx.fillRect(-50, -510, 100, 500);
      ctx.fillStyle = hgrad(ctx, -50, 50, [[0, 'rgba(94,240,255,0.16)'], [0.18, 'rgba(94,240,255,0)'], [0.82, 'rgba(94,240,255,0)'], [1, 'rgba(94,240,255,0.16)']]);
      ctx.fillRect(-50, -510, 100, 500);
      // rising rings
      for (let i = 0; i < 6; i++) {
        const ph = ((t * 0.55 + i / 6) % 1);
        const y = -14 - ph * 490;
        const a = (1 - ph) * 0.55;
        ctx.beginPath(); ctx.ellipse(0, y, 44 - ph * 6, 7, 0, 0, TAU);
        ctx.lineWidth = 3; ctx.strokeStyle = `rgba(150,250,255,${a})`; ctx.stroke();
      }
      // rising chevrons
      for (let i = 0; i < 5; i++) {
        const ph = ((t * 0.8 + i / 5 + 0.1) % 1);
        const y = -30 - ph * 460, a = Math.sin(ph * Math.PI) * 0.5;
        ctx.beginPath(); ctx.moveTo(-14, y + 8); ctx.lineTo(0, y - 4); ctx.lineTo(14, y + 8);
        ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = `rgba(200,255,255,${a})`; ctx.stroke();
      }
      // motes
      for (let i = 0; i < 10; i++) {
        const ph = ((t * (0.4 + (i % 3) * 0.15) + i * 0.137) % 1);
        const x = Math.sin(i * 7.3) * 38, y = -16 - ph * 480;
        circlePath(ctx, x, y, 2 + (i % 2)); ctx.fillStyle = `rgba(220,255,255,${(1 - ph) * 0.8})`; ctx.fill();
      }
      ctx.restore();
      // column edges
      ctx.save();
      ctx.setLineDash([14, 10]); ctx.lineDashOffset = t * 60;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 50, -14); ctx.lineTo(s * 50, -380);
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(94,240,255,0.35)'; ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
      // emitter glow on top of the pad
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -14, 60, C, 0.35);
      ctx.restore();
      // pad (collision 120×26 r8)
      toonBox(ctx, 0, 0, 120, 26, 8, '#5b6676');
      ctx.save(); rrc(ctx, 0, 0, 120, 26, 8); ctx.clip();
      ctx.fillStyle = '#ffcf3a'; ctx.fillRect(-60, 6, 120, 7);
      ctx.fillStyle = '#2a2f36';
      for (let k = -66; k < 66; k += 12) { ctx.beginPath(); ctx.moveTo(k, 13); ctx.lineTo(k + 6, 13); ctx.lineTo(k + 12, 6); ctx.lineTo(k + 6, 6); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      rrc(ctx, 0, 0, 120, 26, 8); strokeOnly(ctx);
      // emitter grille
      const pulse = 0.6 + 0.4 * Math.sin(t * 6);
      rrc(ctx, 0, -6, 92, 8, 4); fillStroke(ctx, mix('#2bb6c9', C, pulse), 2.5);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(-40, -8, 80, 2);
      for (const s of [-1, 1]) rivet(ctx, s * 52, 1, 2);
      // arrows on the front
      for (const ax of [-22, 0, 22]) {
        ctx.beginPath(); ctx.moveTo(ax - 5, 3); ctx.lineTo(ax, -1); ctx.lineTo(ax + 5, 3);
        ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(C, 0.5 + 0.5 * Math.sin(t * 8 - ax * 0.1)); ctx.lineCap = 'round'; ctx.stroke();
      }
    },
  },

  // ======================= Rocket (blocker) =======================
  rocket: {
    draw(ctx, o) {
      const RED = ['#ff4d4d', '#3e8ed0', '#8d6cc4'][(o.v || 0) % 3], WHITE = '#f3f0ea';
      // engine bell (decor between the fins)
      ctx.beginPath(); ctx.moveTo(-22, 100); ctx.lineTo(22, 100); ctx.lineTo(30, 128); ctx.lineTo(-30, 128); ctx.closePath();
      ctx.fillStyle = hgrad(ctx, -30, 30, [[0, '#59626c'], [0.4, '#c3cbd2'], [1, '#4b535c']]); ctx.fill(); strokeOnly(ctx);
      // fins (collision polys)
      for (const s of [-1, 1]) {
        const fin = [[s * 40, 60], [s * 60, 160], [s * 40, 120]];
        polyPath(ctx, fin); ctx.fillStyle = RED; ctx.fill();
        ctx.save(); polyPath(ctx, fin); ctx.clip();
        ctx.fillStyle = rgba(darken(RED, 0.5), 0.3); ctx.fillRect(s > 0 ? 48 : -70, 50, 22, 120);
        ctx.restore();
        polyPath(ctx, fin); strokeOnly(ctx);
      }
      // body + nose cone
      const body = () => {
        ctx.beginPath();
        ctx.moveTo(-40, 100); ctx.lineTo(-40, -80);
        ctx.quadraticCurveTo(-24, -125, -3, -157);
        ctx.quadraticCurveTo(0, -161, 3, -157);
        ctx.quadraticCurveTo(24, -125, 40, -80);
        ctx.lineTo(40, 100); ctx.closePath();
      };
      body(); ctx.fillStyle = WHITE; ctx.fill();
      ctx.save(); body(); ctx.clip();
      // nose cone + bands
      ctx.fillStyle = RED;
      ctx.beginPath(); ctx.moveTo(-50, -78); ctx.quadraticCurveTo(0, -92, 50, -78); ctx.lineTo(50, -170); ctx.lineTo(-50, -170); ctx.closePath(); ctx.fill();
      ctx.fillRect(-45, 72, 90, 30);
      ctx.fillStyle = darken(WHITE, 0.15); ctx.fillRect(-45, 64, 90, 6);
      // cylindrical shading
      ctx.fillStyle = hgrad(ctx, -40, 40, [[0, 'rgba(255,255,255,0.0)'], [0.2, 'rgba(255,255,255,0.45)'], [0.35, 'rgba(255,255,255,0)'], [0.7, 'rgba(40,20,40,0.08)'], [1, 'rgba(40,20,40,0.32)']]);
      ctx.fillRect(-45, -170, 90, 280);
      ctx.restore();
      body(); strokeOnly(ctx);
      ctx.beginPath(); ctx.moveTo(-40, -79); ctx.quadraticCurveTo(0, -91, 40, -79); strokeOnly(ctx, 3);
      ctx.beginPath(); ctx.moveTo(-40, 72); ctx.lineTo(40, 72); strokeOnly(ctx, 3);
      // porthole with a hot dog astronaut peeking out
      circlePath(ctx, 0, -36, 21); fillStroke(ctx, '#c3cbd2', 4);
      circlePath(ctx, 0, -36, 14); ctx.fillStyle = rgrad(ctx, -4, -40, 2, 16, [[0, '#9fe6ff'], [1, '#3b7fd6']]); ctx.fill();
      ctx.save(); circlePath(ctx, 0, -36, 14); ctx.clip();
      ctx.beginPath(); ctx.moveTo(-14, -26); ctx.quadraticCurveTo(0, -40, 14, -30);
      ctx.lineWidth = 12; ctx.strokeStyle = '#d9573b'; ctx.lineCap = 'round'; ctx.stroke();
      circlePath(ctx, 1, -34, 2.6); ctx.fillStyle = '#fff'; ctx.fill(); circlePath(ctx, 1.6, -33.6, 1.3); ctx.fillStyle = INK; ctx.fill();
      circlePath(ctx, 8, -32, 2.6); ctx.fillStyle = '#fff'; ctx.fill(); circlePath(ctx, 8.6, -31.6, 1.3); ctx.fillStyle = INK; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.moveTo(-10, -46); ctx.lineTo(-4, -50); ctx.lineTo(8, -24); ctx.lineTo(2, -22); ctx.closePath(); ctx.fill();
      ctx.restore();
      circlePath(ctx, 0, -36, 14); strokeOnly(ctx, 3);
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8; rivet(ctx, Math.cos(a) * 18, -36 + Math.sin(a) * 18, 1.4, '#eef2f5'); }
      // lettering down the body
      ctx.save(); if (o.flip) ctx.scale(-1, 1); ctx.translate(0, 22); ctx.rotate(-Math.PI / 2);
      text(ctx, 'FRANK-1', 0, 0, 17, RED, { stroke: 0 });
      ctx.restore();
      for (const y of [-6, 50]) for (const x of [-32, 32]) rivet(ctx, x, y, 1.8);
      // tip
      circlePath(ctx, 0, -160, 4); fillStroke(ctx, '#c3cbd2', 2.5);
    },
  },

  // ======================= Space crate (platform) =======================
  spacecrate: {
    draw(ctx, o, t) {
      const col = ['#5d6b7e', '#6c5f86', '#4f7a74'][(o.v || 0) % 3];
      const glowC = ['#5ef0ff', '#ff8af0', '#9dff6a'][(o.v || 0) % 3];
      toonBox(ctx, 0, 0, 130, 90, 8, col);
      ctx.save(); rrc(ctx, 0, 0, 130, 90, 8); ctx.clip();
      // hazard stripe band along the top
      ctx.fillStyle = '#ffcf3a'; ctx.fillRect(-65, -45, 130, 12);
      ctx.fillStyle = '#2a2f36';
      for (let k = -75; k < 75; k += 14) { ctx.beginPath(); ctx.moveTo(k, -33); ctx.lineTo(k + 7, -33); ctx.lineTo(k + 14, -45); ctx.lineTo(k + 7, -45); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-65, -45, 130, 2.5);
      // panel seams
      ctx.strokeStyle = rgba(darken(col, 0.6), 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-65, -32); ctx.lineTo(65, -32); ctx.stroke();
      ctx.restore();
      rrc(ctx, 0, 0, 130, 90, 8); strokeOnly(ctx);
      // corner caps
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        ctx.beginPath();
        const cx = sx * 65, cy = sy * 45;
        ctx.moveTo(cx - sx * 20, cy); ctx.lineTo(cx - sx * 8, cy); ctx.quadraticCurveTo(cx, cy, cx, cy - sy * 8); ctx.lineTo(cx, cy - sy * 20);
        ctx.lineTo(cx - sx * 6, cy - sy * 14); ctx.lineTo(cx - sx * 14, cy - sy * 6); ctx.closePath();
        if (sy < 0) continue; // top corners stay flat under the stripe
        fillStroke(ctx, '#aeb8c2', 3);
      }
      // glowing display panel
      const pulse = 0.75 + 0.25 * Math.sin((t || 0) * 3);
      rrc(ctx, 0, 6, 64, 38, 6); fillStroke(ctx, '#1d2433', 3);
      ctx.save(); rrc(ctx, 0, 6, 64, 38, 6); ctx.clip();
      ctx.fillStyle = rgba(glowC, 0.18 * pulse); ctx.fillRect(-32, -13, 64, 38);
      ctx.restore();
      label(ctx, o, 'CARGO', 0, 0, 13, glowC);
      // tiny hot dog icon
      ctx.beginPath(); ctx.moveTo(-14, 16); ctx.quadraticCurveTo(0, 10, 14, 16); ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = glowC; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-17, 19); ctx.quadraticCurveTo(0, 25, 17, 19); ctx.lineWidth = 3; ctx.strokeStyle = rgba(glowC, 0.6); ctx.stroke();
      // side handles + rivets
      for (const s of [-1, 1]) {
        rrc(ctx, s * 52, 8, 8, 30, 3); fillStroke(ctx, darken(col, 0.3), 2.5);
        rivet(ctx, s * 52, -22, 2); rivet(ctx, s * 52, 34, 2);
      }
      gloss(ctx, -60, -28, 4, 50, 0.25);
    },
  },

  // ======================= UFO (mover) =======================
  ufo: {
    draw(ctx, o, t) {
      // underside tractor glow
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = vgrad(ctx, 24, 70, [[0, 'rgba(140,255,170,0.35)'], [1, 'rgba(140,255,170,0)']]);
      ctx.beginPath(); ctx.moveTo(-30, 24); ctx.lineTo(30, 24); ctx.lineTo(46, 70); ctx.lineTo(-46, 70); ctx.closePath(); ctx.fill();
      ctx.restore();
      // dome back (glass) + alien (collision: rounded box 70×30 r14 at y -39..-9)
      const dome = () => rrPath(ctx, -35, -39, 70, 30, 14);
      dome(); ctx.fillStyle = 'rgba(170,230,255,0.55)'; ctx.fill();
      ctx.save(); dome(); ctx.clip();
      // alien
      const bob = Math.sin(t * 3) * 1.2;
      ctx.beginPath(); ctx.ellipse(0, -14 + bob, 13, 10, 0, 0, TAU); fillStroke(ctx, '#7be06a', 3);
      ctx.beginPath(); ctx.moveTo(-6, -24 + bob); ctx.lineTo(-10, -34 + bob); ctx.moveTo(6, -24 + bob); ctx.lineTo(10, -34 + bob);
      ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      circlePath(ctx, -10, -35 + bob, 2.6); ctx.fillStyle = '#ffe14a'; ctx.fill();
      circlePath(ctx, 10, -35 + bob, 2.6); ctx.fillStyle = '#ffe14a'; ctx.fill();
      for (const ex of [-5, 5]) { ellipsePath(ctx, ex, -16 + bob, 3.6, 4.6); ctx.fillStyle = INK; ctx.fill(); circlePath(ctx, ex - 1, -18 + bob, 1.3); ctx.fillStyle = '#fff'; ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, -11 + bob, 3, 0.2, Math.PI - 0.2); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
      ctx.restore();
      dome(); ctx.fillStyle = 'rgba(200,245,255,0.18)'; ctx.fill(); strokeOnly(ctx, 3.5);
      ctx.save(); dome(); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.moveTo(-26, -36); ctx.quadraticCurveTo(-30, -24, -26, -14); ctx.lineTo(-22, -14); ctx.quadraticCurveTo(-26, -24, -21, -36); ctx.closePath(); ctx.fill();
      ctx.fillRect(-12, -36, 20, 2.5);
      ctx.restore();
      // saucer (collision poly)
      const P = [[-90, 10], [-60, -10], [60, -10], [90, 10], [50, 26], [-50, 26]];
      const saucer = () => {
        ctx.beginPath();
        ctx.moveTo(-90, 10); ctx.quadraticCurveTo(-78, -2, -60, -10); ctx.lineTo(60, -10); ctx.quadraticCurveTo(78, -2, 90, 10);
        ctx.quadraticCurveTo(72, 20, 50, 26); ctx.lineTo(-50, 26); ctx.quadraticCurveTo(-72, 20, -90, 10); ctx.closePath();
      };
      saucer();
      ctx.fillStyle = vgrad(ctx, -10, 26, [[0, '#e9edf7'], [0.45, '#b9c2da'], [0.5, '#8c92b8'], [1, '#6b6f98']]); ctx.fill();
      ctx.save(); saucer(); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-60, -8, 120, 4);
      ctx.fillStyle = '#7a5cc8'; ctx.fillRect(-95, 7, 190, 6);
      ctx.restore();
      saucer(); strokeOnly(ctx);
      ctx.beginPath(); ctx.moveTo(-36, -10); ctx.quadraticCurveTo(0, -6, 36, -10); strokeOnly(ctx, 2.5);
      // chase lights on the rim
      const step = Math.floor(t * 8);
      const LC = ['#ff5a7a', '#ffe14a', '#5ef0ff'];
      for (let i = 0; i < 7; i++) {
        const lx = -66 + i * 22;
        const lit = (step + i) % 3 === 0;
        if (lit) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, lx, 10, 12, LC[i % 3], 0.6); ctx.restore(); }
        circlePath(ctx, lx, 10, 4); fillStroke(ctx, lit ? LC[i % 3] : darken(LC[i % 3], 0.45), 2);
      }
      // underside emitter
      ellipsePath(ctx, 0, 26, 22, 5); fillStroke(ctx, '#9dffb0', 3);
      ellipsePath(ctx, 0, 25, 12, 2.5); ctx.fillStyle = '#eafff0'; ctx.fill();
    },
  },

  // ======================= Moon rock (ground platform) =======================
  moonrock: {
    draw(ctx, o) {
      const base = '#c9c4bb';
      const P = [[-100, 60], [100, 60], [85, -40], [40, -60], [-50, -60], [-90, -30]];
      const pts = roughPoly(P, 12 + (o.v || 0), 2.2, 14, -60);
      polyPath(ctx, pts); ctx.fillStyle = base; ctx.fill();
      ctx.save(); polyPath(ctx, pts); ctx.clip();
      ctx.fillStyle = vgrad(ctx, -60, 60, [[0, 'rgba(255,255,255,0.25)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(40,30,60,0.35)']]);
      ctx.fillRect(-110, -70, 220, 140);
      ctx.fillStyle = hgrad(ctx, -100, 100, [[0, 'rgba(255,255,255,0.12)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(40,30,60,0.25)']]);
      ctx.fillRect(-110, -70, 220, 140);
      // lit top rim
      ctx.fillStyle = 'rgba(255,255,250,0.55)'; ctx.fillRect(-50, -60, 90, 6);
      crater(ctx, -40, -10, 22, 12, base);
      crater(ctx, 36, 6, 16, 9, base);
      crater(ctx, 60, -28, 9, 5, base);
      crater(ctx, -10, 34, 12, 6, base);
      crater(ctx, -72, 30, 8, 4.5, base);
      crater(ctx, 72, 38, 10, 5, base);
      const r = rng(41);
      for (let i = 0; i < 50; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(80,70,90,0.25)' : 'rgba(255,255,255,0.45)'; ctx.fillRect(-95 + r() * 190, -58 + r() * 116, 2, 2); }
      ctx.restore();
      polyPath(ctx, pts); strokeOnly(ctx);
      // little glowing crystals at the base + pebbles
      crystal(ctx, -82, 58, 20, -0.35, '#7af0e6');
      crystal(ctx, -70, 60, 13, 0.25, '#9fd8ff');
      circlePath(ctx, 96, 56, 6); fillStroke(ctx, '#b3ada3', 2.5);
      circlePath(ctx, 84, 60, 4); fillStroke(ctx, '#bdb7ad', 2.2);
    },
  },
};
