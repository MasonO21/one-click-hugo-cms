// The tutorial coach (game/tutorial.js): a panel above the controls with the step, its instruction, a progress bar and
// Skip; a ghost thumb that demonstrates the drag; a pulsing ring with an arrow on the HUD control to touch (LEGION, the
// RITE button, NOVA); and a bobbing marker over the spot on the field that matters (the ×2 gate, the elite, its chest).
// RunUI creates it for a tutorial run, feeds it every frame (frame) and at 20 Hz (update), and routes hints into note().
import './coachui.css';
import { h, $, modal } from './dom.js';
import { icon } from './icons.js';
import { commit } from '../meta/economy.js';

const _v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };

export class CoachUI {
  constructor(ui, run) {
    this.ui = ui; this.run = run; this.app = ui.app;
    this.el = h(`<div class="coach" role="status" aria-live="polite">
      <div class="co-head"><span class="co-step t-label"></span><b class="co-title"></b><button class="co-skip">Skip</button></div>
      <p class="co-text"></p>
      <small class="co-sub"></small>
      <div class="co-goal" hidden><span class="co-bar"><i></i></span><b class="co-n tnum"></b></div>
      <span class="co-ok">${icon('check')}</span>
    </div>`);
    this.thumb = h('<div class="co-thumb" hidden><i class="co-trail"></i><i class="co-finger"></i></div>');
    this.point = h('<div class="co-point" hidden><i class="co-ring"></i><i class="co-arrow"></i></div>');
    this.mark = h('<div class="co-mark" hidden><i class="co-mring"></i><i class="co-marrow"></i></div>');
    for (const n of [this.thumb, this.point, this.mark, this.el]) ui.el.appendChild(n);
    this.q = { step: $(this.el, '.co-step'), title: $(this.el, '.co-title'), text: $(this.el, '.co-text'), sub: $(this.el, '.co-sub'),
      goal: $(this.el, '.co-goal'), bar: $(this.el, '.co-bar i'), n: $(this.el, '.co-n') };
    $(this.el, '.co-skip').addEventListener('click', (e) => { e.stopPropagation(); this.askSkip(); });
    this.last = {}; this.noteT = 0; this.cards = {};
  }

  set(k, v, fn) { if (this.last[k] !== v) { this.last[k] = v; fn(v); } }

  /** Every frame: the field marker follows its target smoothly. */
  frame(run) {
    const v = this.view, m = v && !run.ended ? v.mark : null;
    this.mark.hidden = !m;
    if (!m) return;
    const p = run.engine.project(_v.set(m.x, m.y || 3, m.z), run.camera, { x: 0, y: 0 });
    const W = run.engine.w, H = run.engine.h, pad = 34;
    let x = p ? p.x : W / 2, y = p ? p.y : H / 2;
    const off = !p || x < pad || x > W - pad || y < pad + 90 || y > H - 150;
    x = Math.min(W - pad, Math.max(pad, x)); y = Math.min(H - 150, Math.max(pad + 90, y));
    this.mark.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    if (off !== this.markOff) { this.markOff = off; this.mark.classList.toggle('edge', off); } // off screen: it waits at the edge
  }

  /** 20 Hz: the panel, the thumb and the HUD pointer. */
  update(run, dt) {
    const v = this.view = run.ended || run.bossDead || run.levelPending ? null : run.guide.view(); // hidden under a card screen
    this.el.hidden = !v;
    if (!v) { this.thumb.hidden = this.point.hidden = true; return; }
    this.set('step', v.i, () => {
      this.q.step.textContent = `Training · ${v.i + 1}/${v.n}`;
      this.el.classList.remove('next'); void this.el.offsetWidth; this.el.classList.add('next');
    });
    this.set('title', v.title, (t) => { this.q.title.textContent = t; });
    this.set('text', v.text, (t) => { this.q.text.textContent = t; });
    if (this.noteT > 0) this.noteT -= dt;
    this.set('sub', this.noteT > 0 ? this.noteText : v.sub, (t) => { this.q.sub.textContent = t; });
    this.set('note', this.noteT > 0, (on) => this.q.sub.classList.toggle('note', on));
    this.set('ok', v.ok, (on) => this.el.classList.toggle('ok', on));
    const g = v.goal;
    this.set('goal', g ? `${Math.floor(g[0])}/${g[1]}/${g[2] ? 1 : 0}` : '', () => {
      this.q.goal.hidden = !g;
      if (!g) return;
      this.q.bar.style.transform = `scaleX(${Math.min(1, g[0] / g[1]).toFixed(3)})`;
      this.q.n.textContent = g[2] ? `${Math.round(Math.min(1, g[0] / g[1]) * 100)}%` : `${Math.floor(g[0])} / ${g[1]}`;
    });
    this.set('thumb', v.thumb, (on) => { this.thumb.hidden = !on; });
    // the HUD control to touch
    const target = v.point === 'legion' ? this.ui.q.legion : v.point === 'nova' ? this.ui.q.nova : v.point === 'rite' ? this.ui.rite.el : null;
    this.point.hidden = !target;
    this.set('up', v.point === 'nova' || v.point === 'rite', (up) => this.el.classList.toggle('up', up)); // the panel makes room for the arrow
    if (target) {
      const r = target.getBoundingClientRect(), o = this.ui.el.getBoundingClientRect(), s = Math.max(r.width, r.height) + 22;
      const st = this.point.style;
      st.transform = `translate(${(r.left - o.left + r.width / 2).toFixed(0)}px, ${(r.top - o.top + r.height / 2).toFixed(0)}px)`;
      st.setProperty('--s', s + 'px');
      this.set('below', v.point === 'legion', (b) => this.point.classList.toggle('below', b)); // top controls: the arrow points up from below
    }
  }

  /** A passing remark (a hint, the gate's maths) in place of the second line for a few seconds. */
  note(text) {
    this.noteText = text.replace(/<[^>]+>/g, '');
    this.noteT = 4.5;
    this.last.sub = null;
  }

  /** The coach's line on the first level-up and the first Relic Chest, once each. */
  cardLine(chest) {
    const k = chest ? 'chest' : 'level';
    if (this.cards[k]) return '';
    this.cards[k] = true;
    return chest ? 'A Relic Chest: one free power, no level needed.' : 'LEVEL UP! Choose a power. Each one makes your Shepherd or your legion stronger.';
  }

  askSkip() {
    const run = this.run;
    if (run.ended || run.levelPending || run.paused) return;
    run.paused = true; run.input.reset();
    this.app.audio.sfx('click');
    let skipped = false;
    modal({
      title: 'Skip training?',
      body: '<p class="co-skip-p">You can replay it any time from Settings.</p>',
      actions: [
        { label: 'Keep training', cls: 'btn-ghost' },
        { label: 'Skip', cls: 'btn-primary', onClick: () => { skipped = true; } },
      ],
      onClose: () => {
        if (!skipped) { run.paused = false; return; }
        run.guide.skip();
        commit(this.app.profile);
        this.app.exitRun();
      },
    });
  }

  dispose() { for (const n of [this.el, this.thumb, this.point, this.mark]) n.remove(); }
}
