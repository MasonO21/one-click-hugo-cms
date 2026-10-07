/**
 * Banners — attack warning countdown ("ALIEN ACTIVITY DETECTED — ATTACK IN 2:00" + Start now),
 * live alien count during attacks, "open your chest" after victory, tutorial hint bubble and the
 * knocked-out notice.
 */
import type { UiCtx } from '../ctx';
import { fmtClock } from '../../core/format';
import { btn } from '../widgets';
import { h, setClass, setHidden, setText } from '../dom';

export class Banners {
  readonly el: HTMLElement;
  private readonly attack: HTMLElement;
  private readonly abIc: HTMLElement;
  private readonly abSmall: HTMLElement;
  private readonly abMain: HTMLElement;
  private readonly abClock: HTMLElement;
  private readonly abBtn: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private readonly hintTxt: HTMLElement;
  private readonly knocked: HTMLElement;
  private mode: 'none' | 'warning' | 'attack' | 'victory' = 'none';

  constructor(private readonly ctx: UiCtx) {
    this.abIc = h('div', { class: 'ab-ic' });
    this.abSmall = h('small');
    this.abMain = h('b');
    this.abClock = h('div', { class: 'ab-clock' });
    this.abBtn = btn({ label: 'Start now', cls: 'small', onClick: () => this.onButton() });
    this.attack = h('div', { class: 'attack-banner', hidden: true, role: 'alert' }, this.abIc, h('div', { class: 'ab-txt' }, this.abSmall, this.abMain), this.abClock, this.abBtn);
    this.hintTxt = h('span');
    this.hint = h('div', { class: 'hint-bubble', hidden: true }, h('span', { class: 'ic', text: '💡' }), this.hintTxt);
    this.knocked = h('div', { class: 'knocked-banner', hidden: true });
    this.el = h('div', { class: 'hud-banners' }, this.attack, this.knocked, this.hint);
  }

  private onButton(): void {
    const { game } = this.ctx;
    if (this.mode === 'warning') game.sys.combat.startNow();
    else if (this.mode === 'victory') this.ctx.open('victory');
  }

  /** ≈5 Hz. Returns true when the attack banner is visible (layout hint). */
  poll(): boolean {
    const { game } = this.ctx;
    const st = game.state;
    const c = st.combat;
    let mode: Banners['mode'] = 'none';
    if (c.phase === 'warning') mode = 'warning';
    else if (c.phase === 'attack') mode = 'attack';
    else if (c.phase === 'victory' && c.pendingReward && !this.ctx.isOpen('victory')) mode = 'victory';

    if (mode !== this.mode) {
      this.mode = mode;
      setHidden(this.attack, mode === 'none');
      setClass(this.attack, 'attack', mode === 'attack');
      setClass(this.attack, 'victory', mode === 'victory');
      this.abBtn.hidden = mode === 'attack';
      if (mode === 'warning') {
        setText(this.abIc, '🛸');
        setText(this.abSmall, '⚠ Alien activity detected');
        this.abBtn.textContent = 'Start now';
      } else if (mode === 'attack') {
        setText(this.abIc, '👾');
        setText(this.abSmall, 'Defend the colony!');
        setText(this.abClock, '');
      } else if (mode === 'victory') {
        setText(this.abIc, '🏆');
        setText(this.abSmall, 'Colony defended!');
        setText(this.abMain, 'Open your reward chest');
        setText(this.abClock, '');
        this.abBtn.textContent = 'Open';
      }
    }
    if (mode === 'warning') {
      let sec = game.sys.combat.secondsToAttack();
      const alt = c.nextAt - st.playTime;
      if (!isFinite(sec) && isFinite(alt) && alt < 1e9) sec = alt;
      setText(this.abMain, 'ATTACK IN');
      setText(this.abClock, isFinite(sec) ? fmtClock(sec) : '--:--');
    } else if (mode === 'attack') {
      const left = c.aliens.filter((a) => a.state !== 'dying').length + c.spawnQueue.length;
      setText(this.abMain, left > 0 ? `${left} alien${left === 1 ? '' : 's'} remaining` : 'Almost done!');
    }

    // tutorial hint
    const guide = game.sys.tutorial.guide();
    const text = guide?.text ?? '';
    setHidden(this.hint, !text);
    if (text) setText(this.hintTxt, text);

    // knocked out
    const down = st.player.downUntil - st.playTime;
    setHidden(this.knocked, !(down > 0));
    if (down > 0) setText(this.knocked, `😵 Knocked out — waking up at the pod in ${Math.ceil(down)}s`);
    return mode !== 'none';
  }

  /** Height of the visible banner stack in px (portrait layout pushes the rail/mission card down). */
  height(): number {
    return this.el.offsetHeight;
  }
}
