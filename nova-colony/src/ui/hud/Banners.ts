/**
 * Banners — attack warning countdown ("ALIEN ACTIVITY DETECTED — ATTACK IN 2:00" + Start now),
 * live alien count during attacks, "open your chest" after victory, tutorial hint bubble and the
 * knocked-out notice.
 */
import type { UiCtx } from '../ctx';
import { fmtClock } from '../../core/format';
import { btn } from '../widgets';
import { h, setClass, setHidden, setText } from '../dom';
import { alienArt, artOrEmoji, rewardArt } from '../art';
import { showGuideNow } from '../logic/raid';

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
  private icKey = '';

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
      this.icKey = '';
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
    this.refreshIcon(mode);
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

    // tutorial hint (steps aside during a raid, see showGuideNow)
    const guide = game.sys.tutorial.guide();
    const text = guide && showGuideNow(c.phase, game.data.mission(guide.mission ?? '')?.type) ? guide.text : '';
    setHidden(this.hint, !text);
    if (text) setText(this.hintTxt, text);

    // knocked out
    const down = st.player.downUntil - st.playTime;
    setHidden(this.knocked, !(down > 0));
    if (down > 0) setText(this.knocked, `😵 Knocked out — waking up at the pod in ${Math.ceil(down)}s`);
    return mode !== 'none';
  }

  /**
   * The banner's icon as illustrations: the alien types in the coming wave (invasion table of the colony tier,
   * plus the boss when it is due), the types still on the field while attacking, the chest after victory.
   * Falls back to the emoji set above when there is no art.
   */
  private refreshIcon(mode: Banners['mode']): void {
    if (mode === 'none') return;
    const { game } = this.ctx;
    const c = game.state.combat;
    let items: { model: string; boss: boolean }[] = [];
    if (mode === 'victory') {
      items = [{ model: 'chest', boss: false }];
    } else {
      const seen = new Set<string>();
      const add = (alienId: string): void => {
        const d = game.data.alien(alienId);
        if (!d || seen.has(d.model) || !alienArt(d.model)) return;
        seen.add(d.model);
        items.push({ model: d.model, boss: !!d.boss });
      };
      if (mode === 'warning') {
        const inv = game.data.invasions.length ? game.data.invasion(game.state.colony.tier) : null;
        if (inv) {
          for (const g of inv.groups) add(g.alien);
          if (inv.boss && inv.boss.every > 0 && (c.waveAtTier + 1) % inv.boss.every === 0) add(inv.boss.alien);
        }
      } else {
        for (const a of c.aliens) if (!a.wild && a.state !== 'dying') add(a.def);
        for (const q of c.spawnQueue) add(q.alien);
      }
      items.sort((a, b) => Number(b.boss) - Number(a.boss));
      items = items.slice(0, 3);
    }
    const key = mode + ':' + items.map((i) => i.model + (i.boss ? '!' : '')).join(',');
    if (key === this.icKey) return;
    this.icKey = key;
    if (!items.length) {
      this.abIc.classList.remove('art');
      return;
    }
    this.abIc.classList.add('art');
    this.abIc.replaceChildren(
      ...items.map((i) => {
        const src = i.model === 'chest' ? rewardArt('victory_chest') : alienArt(i.model);
        const el = artOrEmoji(src, i.model === 'chest' ? '🏆' : '👾', 'ab-pic' + (i.boss ? ' boss' : '') + (i.model === 'chest' ? ' chest' : ''), i.model);
        return el;
      }),
    );
  }

  /** Height of the visible banner stack in px (portrait layout pushes the rail/mission card down). */
  height(): number {
    return this.el.offsetHeight;
  }
}
