// Title logo: chunky "SIZZLE FLIP" lettering with the hero sausage vaulting over it.
import { INK } from './common.js';
import { drawSausage, makeFaceState, SKINS } from './sausage.js';

export function drawLogo(c, skin = SKINS[0]) {
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // sizzle lines
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineCap = 'round';
  for (const [x, y, s] of [[110, 120, 1], [610, 110, -1], [80, 300, 1], [640, 300, -1]]) {
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(x + s * k * 14, y - k * 10);
      ctx.quadraticCurveTo(x + s * (k * 14 + 10), y - k * 10 - 20, x + s * (k * 14 + 22), y - k * 10 - 6);
      ctx.lineWidth = 6; ctx.stroke();
    }
  }

  const word = (txt, x, y, size, rot, fillA, fillB) => {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.font = `${size}px "Lilita One", system-ui, sans-serif`;
    // 3D extrusion
    for (let d = 14; d > 0; d -= 2) {
      ctx.fillStyle = d > 2 ? '#7a1f14' : INK;
      ctx.fillText(txt, 0, d);
    }
    ctx.lineWidth = 22; ctx.strokeStyle = INK; ctx.strokeText(txt, 0, 0);
    const g = ctx.createLinearGradient(0, -size * 0.75, 0, 0);
    g.addColorStop(0, fillA); g.addColorStop(1, fillB);
    ctx.fillStyle = g; ctx.fillText(txt, 0, 0);
    // glossy top
    ctx.save();
    ctx.beginPath(); ctx.rect(-W, -size, W * 2, size * 0.42); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillText(txt, 0, 0);
    ctx.restore();
    ctx.restore();
  };

  word('SIZZLE', W / 2 - 6, 218, 150, -0.05, '#fff2a8', '#ffb31a');
  word('FLIP!', W / 2 + 20, 370, 150, 0.04, '#ff9a7a', '#ef3b2c');

  // the sausage hero vaulting across the top
  const N = 10, px = new Float64Array(N), py = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    px[i] = 240 + u * 250;
    py[i] = 60 - Math.sin(u * Math.PI) * 26 + u * 10;
  }
  ctx.save();
  ctx.translate(-10, 6);
  ctx.scale(1.6, 1.6);
  ctx.translate(-150, -26);
  const sx = new Float64Array(N), sy = new Float64Array(N);
  for (let i = 0; i < N; i++) { sx[i] = 240 + (px[i] - 240) * 0.62; sy[i] = py[i]; }
  const face = makeFaceState(); face.expr = 'win';
  drawSausage(ctx, sx, sy, { R: 15, skin, face, t: 0 });
  ctx.restore();

  // little stars
  const star = (x, y, r, col) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  };
  star(96, 210, 22, '#ffd23f');
  star(640, 230, 18, '#7be0ff');
  star(620, 60, 14, '#ffd23f');
  ctx.restore();
}
