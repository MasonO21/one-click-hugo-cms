// The share card: a 1080×1350 image of a finished run, made on a 2D canvas from the painted art. The hero's splash (or
// skin) over the chapter's painting, the headline (VICTORY, COURT CLEARED, ABYSS DEPTH n…), the hook (peak legion), the
// boss slain, time / kills / raised / level, the build's painted icons and the call to play. The results screen's Share
// button opens it: Web Share with the image where the device offers it, otherwise Save (a download; inside a claude.ai
// artifact viewer, which blocks plain downloads, the viewer's own save prompt) or a long-press on the image. Nothing
// leaves the device unless the player shares or saves it.
import { h, $, modal, fmt, fmtTime, toast } from './dom.js';
import { icon } from './icons.js';
import { HEROES, BOSSES, BOSS_ORDER, CHAPTERS, SKILLS, EVOLUTIONS, DIFFICULTY } from '../game/data.js';
import { CHAPTER_ART, HERO_ART, SKIN_ART, FOE_ART, SKILL_ART, LOGO_ART } from './art.js';

const W = 1080, H = 1350;
const load = (src) => new Promise((res) => {
  if (!src) return res(null);
  const i = new Image();
  i.onload = () => res(i); i.onerror = () => res(null);
  i.src = src;
});
const hexCss = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

/** Draw `img` to fill (x, y, w, h), cropped like CSS object-fit: cover with the focus at (fx, fy). */
function cover(ctx, img, x, y, w, h, fx = 0.5, fy = 0.5) {
  const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) * fx, (img.height - sh) * fy, sw, sh, x, y, w, h);
}

function text(ctx, str, x, y, { font, color = '#fff', glow = null, blur = 18, align = 'left', spacing = 0 }) {
  ctx.save();
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = blur; }
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** What the card says about this result. */
export function cardCopy(result, run) {
  const ch = CHAPTERS[(result.chapter || 1) - 1] || CHAPTERS[0], D = DIFFICULTY[result.difficulty]; // (a campaign result; rush and Endless return first)
  const diff = D && result.difficulty !== 'normal' ? ` · ${D.name}` : '';
  if (result.rush) return { head: result.victory ? 'COURT CLEARED' : 'FELL IN THE COURT', sub: `Boss Rush · ${result.bossKills} of ${BOSS_ORDER.length} bosses`, art: 'endless',
    bosses: BOSS_ORDER.slice(0, result.bossKills), color: 0xff2e55 };
  if (result.endless) return { head: `ABYSS DEPTH ${result.bossKills + 1}`, sub: `Endless Abyss · ${result.bossKills} ${result.bossKills === 1 ? 'boss' : 'bosses'} slain`, art: 'endless',
    bosses: Array.from({ length: Math.min(5, result.bossKills) }, (_, i) => BOSS_ORDER[i % BOSS_ORDER.length]), color: 0x8f6bff };
  const boss = run && run.bossDead ? (run.boss.id || ch.bossId) : null;
  return { head: result.victory ? 'VICTORY' : 'FALLEN', sub: `${result.trial ? 'Daily Trial · ' : ''}Chapter ${ch.id} · ${ch.name}${diff}`, art: ch.art,
    bosses: boss ? [boss] : [], slew: boss ? `${BOSSES[boss].name}, ${BOSSES[boss].title}` : '', color: ch.rune || 0x4ef2ff };
}

/** Renders the card for a finished run; resolves to its canvas. */
export async function renderShareCard(app, run, result) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const copy = cardCopy(result, run), heroId = result.heroId || run.loadout.heroId, hero = HEROES[heroId];
  const skin = run.loadout.skin && SKIN_ART[run.loadout.skin];
  const weapons = Object.keys(run.skillLv).filter((id) => SKILLS[id] && SKILLS[id].type === 'weapon')
    .map((id) => Object.keys(EVOLUTIONS).find((e) => EVOLUTIONS[e].from === id && run.evolved[e]) || id).slice(0, 6);
  try { await Promise.all(['900 120px Cinzel', '700 40px Cinzel', '800 40px Oxanium', '600 30px Oxanium'].map((f) => document.fonts.load(f))); } catch (e) { /* the fallback stack draws */ }
  const [bg, art, logo, ...rest] = await Promise.all([load(CHAPTER_ART[copy.art]), load(skin || HERO_ART[heroId]), load(LOGO_ART),
    ...copy.bosses.map((id) => load(FOE_ART[id])), ...weapons.map((id) => load(SKILL_ART[id]))]);
  const bossImgs = rest.slice(0, copy.bosses.length), skillImgs = rest.slice(copy.bosses.length);
  const accent = hexCss(copy.color), legion = hexCss(run.heroColor || 0x4ef2ff);

  // the chapter's painting, dark, then the hero's splash on the right fading into it
  ctx.fillStyle = '#05060b'; ctx.fillRect(0, 0, W, H);
  if (bg) { ctx.globalAlpha = 0.45; cover(ctx, bg, 0, 0, W, 760); ctx.globalAlpha = 1; }
  let g = ctx.createLinearGradient(0, 380, 0, 900); g.addColorStop(0, 'rgba(5,6,11,0)'); g.addColorStop(1, 'rgba(5,6,11,1)');
  ctx.fillStyle = g; ctx.fillRect(0, 380, W, 520);
  if (art) { // on its own layer, its left, top and bottom edges feathered so it melts into the painting behind
    const L = document.createElement('canvas'); L.width = 750; L.height = 960;
    const lc = L.getContext('2d');
    cover(lc, art, 0, 0, 750, 960, 0.5, 0.2);
    lc.globalCompositeOperation = 'destination-out';
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 360, 0, 0, 0, 360, 960], [0, 0, 0, 150, 0, 0, 750, 150], [0, 960, 0, 680, 0, 680, 750, 280]]) {
      const f = lc.createLinearGradient(x0, y0, x1, y1); f.addColorStop(0, 'rgba(0,0,0,1)'); f.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = f; lc.fillRect(rx, ry, rw, rh);
    }
    ctx.drawImage(L, W - 750, 0);
  }
  // a vignette and the colour of the moment
  g = ctx.createRadialGradient(W / 2, H * 0.42, 200, W / 2, H * 0.42, 900); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // logo, headline, sub
  if (logo) { const lw = 380, lh = lw * logo.height / logo.width; ctx.drawImage(logo, 56, 44, lw, lh); }
  text(ctx, copy.head, 60, 400, { font: `900 ${copy.head.length > 12 ? 82 : 112}px Cinzel, 'Times New Roman', serif`, color: '#fff3d0', glow: 'rgba(255,190,60,.85)', blur: 28 });
  text(ctx, copy.sub.toUpperCase(), 64, 452, { font: "700 30px Oxanium, 'Segoe UI', sans-serif", color: '#c8d6ea', spacing: 3 });

  // the hook: the legion
  text(ctx, String(result.bestLegion || 0), 60, 640, { font: "900 190px Cinzel, 'Times New Roman', serif", color: '#ffffff', glow: legion, blur: 40 });
  text(ctx, 'SOULS IN MY LEGION', 66, 700, { font: "800 38px Oxanium, 'Segoe UI', sans-serif", color: legion, glow: legion, blur: 14, spacing: 6 });

  // the hero
  text(ctx, hero.name.toUpperCase(), W - 60, 905, { font: "900 46px Cinzel, 'Times New Roman', serif", color: '#ffffff', align: 'right', glow: 'rgba(0,0,0,.9)', blur: 12 });
  text(ctx, hero.title, W - 62, 945, { font: "600 28px Oxanium, 'Segoe UI', sans-serif", color: '#9fb2cc', align: 'right' });

  // the boss slain (or the bosses of a rush / an abyss)
  let y = 760;
  if (bossImgs.length) {
    const s = bossImgs.length > 1 ? 104 : 132, gap = 14;
    bossImgs.forEach((im, i) => {
      if (!im) return;
      const x = 60 + i * (s + gap), bc = hexCss(BOSSES[copy.bosses[i]].color);
      ctx.save(); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, s, s * 1.2, 12) : ctx.rect(x, y, s, s * 1.2); ctx.clip();
      cover(ctx, im, x, y, s, s * 1.2, 0.5, 0.15); ctx.restore();
      ctx.save(); ctx.strokeStyle = bc; ctx.lineWidth = 4; ctx.shadowColor = bc; ctx.shadowBlur = 16;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, s, s * 1.2, 12); ctx.stroke(); } else ctx.strokeRect(x, y, s, s * 1.2);
      ctx.restore();
    });
    if (copy.slew) {
      text(ctx, 'SLEW', 60 + s + 28, y + 52, { font: "800 28px Oxanium, 'Segoe UI', sans-serif", color: '#9fb2cc', spacing: 5 });
      const [n, t] = copy.slew.split(', ');
      text(ctx, n.toUpperCase(), 60 + s + 28, y + 108, { font: "900 54px Cinzel, 'Times New Roman', serif", color: hexCss(BOSSES[copy.bosses[0]].color), glow: hexCss(BOSSES[copy.bosses[0]].color), blur: 18 });
      text(ctx, t, 60 + s + 30, y + 146, { font: "600 28px Oxanium, 'Segoe UI', sans-serif", color: '#c8d6ea' });
    }
  }

  // the numbers
  y = 1000;
  ctx.fillStyle = 'rgba(10,16,30,.82)'; ctx.fillRect(40, y, W - 80, 150);
  ctx.fillStyle = accent; ctx.fillRect(40, y, W - 80, 4);
  const stats = [[fmtTime(result.time), 'TIME'], [fmt(result.kills), 'KILLS'], [fmt(result.raised), 'RAISED'], [String(result.level), 'LEVEL']];
  stats.forEach(([v, l], i) => {
    const x = 40 + (W - 80) * (i + 0.5) / stats.length;
    text(ctx, v, x, y + 86, { font: "800 60px Oxanium, 'Segoe UI', sans-serif", color: '#ffffff', align: 'center' });
    text(ctx, l, x, y + 126, { font: "700 24px Oxanium, 'Segoe UI', sans-serif", color: '#7f93b0', align: 'center', spacing: 4 });
  });
  // the build
  const S = 74, n = skillImgs.length;
  skillImgs.forEach((im, i) => {
    const x = W / 2 - (n * (S + 12) - 12) / 2 + i * (S + 12), yy = 1172;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x, yy, S, S);
    if (im) ctx.drawImage(im, x + 3, yy + 3, S - 6, S - 6);
    ctx.strokeStyle = 'rgba(126,226,255,.45)'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, yy + 1, S - 2, S - 2);
  });
  // the call to play
  text(ctx, 'CAN YOUR LEGION BEAT MINE?', W / 2, H - 38, { font: "800 34px Oxanium, 'Segoe UI', sans-serif", color: '#ffcf4a', align: 'center', glow: 'rgba(255,190,60,.6)', blur: 12, spacing: 4 });
  return c;
}

/** The share sheet: the card, then Share (Web Share with the image), Save (a download) or a long-press on the image. */
export async function openShare(app, run, result) {
  let url = '', file = null, blob = null;
  // a claude.ai artifact viewer offers saves through its downloads capability (null anywhere else, never blocking)
  const dlP = window.claude && typeof window.claude.use === 'function' ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
  const body = h(`<div class="share"><div class="share-frame"><div class="share-wait">${icon('star')} Painting your card…</div></div>
    <small class="share-hint t-dim">Long-press or right-click the image to save it.</small></div>`);
  const actions = [];
  const m = modal({ title: 'Share your run', body, cls: 'mm-share', actions, onClose: () => { if (url) URL.revokeObjectURL(url); } });
  try {
    const canvas = await renderShareCard(app, run, result);
    blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('no image');
    url = URL.createObjectURL(blob);
    file = new File([blob], 'soulswarm-run.png', { type: 'image/png' });
    const frame = $(body, '.share-frame');
    frame.innerHTML = `<img class="share-img" src="${url}" alt="My SOULSWARM run: ${result.bestLegion} souls in my legion">`;
    const row = h('<div class="share-acts"></div>');
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    if (canShare) row.appendChild(h(`<button class="btn btn-primary" data-act="share">${icon('share')} Share</button>`));
    row.appendChild(h(`<a class="btn ${canShare ? 'btn-ghost' : 'btn-primary'}" data-act="save" href="${url}" download="soulswarm-run.png">${icon('down')} Save image</a>`));
    body.appendChild(row);
    dlP.then((dl) => { // the viewer's save prompt replaces the plain download link it would block
      const a = $(row, '[data-act="save"]');
      if (!dl || !a) return;
      const b = h(`<button class="${a.className}" data-act="save">${icon('down')} Save image</button>`);
      a.replaceWith(b);
      b.addEventListener('click', async () => {
        app.audio.sfx('click');
        try { await dl.save({ filename: 'soulswarm-run.png', data: blob }); }
        catch (e) { if (e && e.code !== 'declined') toast(e.code === 'rate_limited' ? 'One moment, then try again.' : 'Saving is not available here. Long-press the image instead.'); }
      });
    });
    $(row, '[data-act="share"]')?.addEventListener('click', async () => {
      app.audio.sfx('click');
      try { await navigator.share({ files: [file], title: 'SOULSWARM', text: `${result.bestLegion} souls in my legion. Can yours beat it? #SOULSWARM` }); }
      catch (e) { if (e && e.name !== 'AbortError') toast('Sharing is not available here. Save the image instead.'); }
    });
  } catch (e) {
    $(body, '.share-frame').innerHTML = `<div class="share-wait">${icon('info')} The card could not be painted.</div>`;
  }
  return m;
}
