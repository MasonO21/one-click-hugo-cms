/**
 * SeasonPanel — free and premium reward tracks, level progress, claim buttons.
 *
 * Rewards lead with their real art: a cosmetic in its rarity ring, a Nova chest's painting, then chips (items,
 * resources, Nova with their icons). Without the premium track an upsell card lists what it holds, computed from
 * the data (logic/season.ts). Past level 50 the premium track keeps paying a bonus chest every `season.bonus.xp`
 * XP (sim/seasonBonus.ts): a "50+" column at the end of the track and a card with its progress once there.
 */
import { Panel, type PanelTitle } from './Panel';
import type { Reward } from '../../data/schema';
import { fmt } from '../../core/format';
import { bar, btn, rewardChips } from '../widgets';
import { claimableSeason } from '../logic/badges';
import { fill, h } from '../dom';
import { artOrEmoji, chestArt, hudArt, shopArt } from '../art';
import { highlightChips, rewardHero, seasonHighlights } from '../logic/season';
import { claimSeasonBonus, seasonBonusView } from '../../sim/seasonBonus';
import { cosmeticIcon } from './wardrobe/cards';

export class SeasonPanel extends Panel {
  readonly name = 'season';
  private scrolled = false;

  title(): PanelTitle {
    return { icon: '🏆', art: hudArt('season'), text: this.data.season.name };
  }

  override signature(): string {
    const s = this.st.liveops.season;
    const b = this.st.liveops.seasonBonus;
    return `${s.xp}|${s.premium}|${s.claimedFree.join(',')}|${s.claimedPremium.join(',')}|${this.game.sys.liveops.seasonLevel()}|${b?.id ?? ''}${b?.claimed ?? 0}`;
  }

  render(): void {
    const g = this.game;
    const lo = g.sys.liveops;
    const s = this.data.season;
    const st = g.state.liveops.season;
    const level = lo.seasonLevel();
    const into = st.xp - level * s.xpPerLevel;
    const wrap = h('div', { class: 'stack-v' });

    const claimable = claimableSeason(g);
    wrap.appendChild(
      h(
        'div',
        { class: 'card tint' },
        h('div', { class: 'row' }, h('div', { class: 'season-lvl', text: String(level) }), h('div', { class: 'grow' }, h('div', { class: 'h3', text: level >= s.levels.length ? 'Season complete!' : `Level ${level} → ${level + 1}` }), bar(level >= s.levels.length ? 1 : Math.max(0, into) / s.xpPerLevel, 'purple thick', level >= s.levels.length ? `All ${s.levels.length} levels done` : `${fmt(Math.max(0, into))} / ${fmt(s.xpPerLevel)} XP`)), claimable > 0 ? btn({ label: `Claim all (${claimable})`, cls: 'good small', id: 'btn-season-claim-all', onClick: () => this.claimAll() }) : null),
        h('div', { class: 'mute small', style: 'margin-top:.4em', text: 'Earn XP by building, gathering, crafting, exploring and defending.' }),
      ),
    );
    wrap.appendChild(this.premiumCard(st.premium));
    const bonus = seasonBonusView(g);
    if (bonus.enabled && bonus.unlocked) wrap.appendChild(this.bonusCard());

    // track
    const track = h('div', { class: 'season-track', data: { scroll: 'track' } });
    s.levels.forEach((lv, i) => {
      const n = i + 1;
      track.appendChild(this.column(n, lv.free, lv.premium, level, st));
    });
    if (bonus.enabled) track.appendChild(this.bonusColumn());
    wrap.appendChild(h('div', { class: 'track-legend' }, h('span', { text: 'FREE' }), h('span', { text: 'PREMIUM' })));
    wrap.appendChild(track);
    fill(this.body, wrap);
    if (!this.scrolled) {
      this.scrolled = true;
      requestAnimationFrame(() => {
        const cur = track.children[Math.max(0, Math.min(level, s.levels.length - 1) - 1)] as HTMLElement | undefined;
        if (cur) track.scrollLeft = Math.max(0, cur.offsetLeft - 40);
      });
    }
  }

  /** What the premium track holds (computed from the data), with a way to unlock it. */
  private premiumCard(owned: boolean): HTMLElement {
    const hl = seasonHighlights(this.data);
    const chips = highlightChips(hl);
    const strip = h('div', { class: 'sp-strip', data: { scroll: 'strip' } });
    // the cosmetics in level order, then one of each chest tier (best last)
    for (const id of hl.cosmetics) {
      const def = this.data.cosmetic(id);
      if (def) strip.appendChild(cosmeticIcon(def, 'mini'));
    }
    const tiers = this.data.chests.filter((c) => hl.chests.includes(c.id));
    for (const c of tiers) strip.appendChild(artOrEmoji(chestArt(c.id), c.icon, 'sp-chest', c.name));
    const prod = this.data.products.find((p) => p.section === 'season');
    const card = h(
      'div',
      { class: 'card sp-premium' + (owned ? ' owned' : ''), data: { premium: owned ? 'owned' : 'offer' } },
      artOrEmoji(shopArt('season_pass_premium'), '👑', 'sp-crown', 'Premium track'),
      h('div', { class: 'h3', text: owned ? 'Premium track unlocked ✓' : 'Premium track' }),
      h(
        'div',
        { class: 'stack-v tight' },
        h('div', { class: 'sp-hl' }, ...chips.map((t) => h('span', { class: 'chip', text: t }))),
        hl.exclusive > 0 || hl.bonus
          ? h('div', { class: 'mute small', text: [hl.exclusive > 0 ? `${hl.exclusive} cosmetics you can only get here` : '', hl.bonus ? `${article(this.data.chest(hl.bonus.chest ?? '')?.name ?? 'bonus cache')} every ${fmt(hl.bonus.xp)} XP after level ${this.data.season.levels.length}` : ''].filter(Boolean).join(' · ').replace(/^./, (c) => c.toUpperCase()) })
          : null,
      ),
      strip,
      !owned && prod ? btn({ label: `👑 Unlock premium · ${this.game.sys.liveops.price(prod.id) || prod.fallbackPrice}`, cls: 'nova block', id: 'btn-season-premium', onClick: () => this.ctx.open('shop', { tab: 'season' }) }) : null,
    );
    return card;
  }

  private column(n: number, free: Reward, prem: Reward, level: number, st: { premium: boolean; claimedFree: number[]; claimedPremium: number[] }): HTMLElement {
    const reached = n <= level;
    const col = h('div', { class: 'scol' + (reached ? ' reached' : '') + (n === level ? ' current' : ''), data: { level: n } });
    col.appendChild(h('div', { class: 'sl', text: String(n) }));
    col.appendChild(this.cell(n, free, false, reached, st.claimedFree.includes(n), true));
    col.appendChild(this.cell(n, prem, true, reached, st.claimedPremium.includes(n), st.premium));
    return col;
  }

  /** A reward's look: its hero picture (cosmetic / chest) above chips for the rest. */
  private rewardBody(r: Reward, cell: HTMLElement): void {
    const hero = rewardHero(this.data, r);
    const chestPic = (id: string) => {
      const c = this.data.chest(id);
      return artOrEmoji(chestArt(id), c?.icon ?? '🎁', 'sc-hero', c?.name ?? '');
    };
    if (hero?.kind === 'cosmetic') {
      const def = this.data.cosmetic(hero.id);
      if (def) {
        cell.classList.add('hero-cos');
        const pic = h('div', { class: 'sc-hero', title: def.name }, cosmeticIcon(def));
        // a cosmetic and a chest on the same level (the finale): both pictures, side by side
        cell.appendChild(hero.chest ? h('div', { class: 'sc-heroes' }, pic, chestPic(hero.chest)) : pic);
      }
    } else if (hero?.kind === 'chest') {
      cell.classList.add('hero-chest');
      cell.appendChild(chestPic(hero.id));
    }
    cell.appendChild(rewardChips(this.data, hero ? hero.rest : r, 'stacked'));
  }

  private cell(n: number, r: Reward, premium: boolean, reached: boolean, claimed: boolean, unlocked: boolean): HTMLElement {
    const can = reached && !claimed && unlocked;
    const cell = h('button', { class: 'scell' + (premium ? ' premium' : '') + (claimed ? ' claimed' : '') + (can ? ' can glow' : '') + (!unlocked ? ' locked' : ''), type: 'button', data: { sfx: can ? 'ui_click' : undefined } });
    this.rewardBody(r, cell);
    cell.appendChild(h('div', { class: 'sc-state', text: claimed ? '✔' : !unlocked ? '🔒' : can ? 'Claim' : '' }));
    cell.addEventListener('click', () => {
      if (!can) {
        if (!unlocked) this.ctx.toast('Unlock the premium track to claim this', 'info', '👑');
        else if (!reached) this.ctx.toast(`Reach level ${n} to claim`, 'info', '🔒');
        return;
      }
      if (this.game.sys.liveops.claimSeason(n, premium)) {
        this.ctx.haptic('success');
        this.ctx.showReward(`Level ${n} reward`, r, premium ? '👑' : '🎁');
      }
      this.rerender();
    });
    return cell;
  }

  /** The "50+" column: the repeatable premium bonus chest. */
  private bonusColumn(): HTMLElement {
    const b = seasonBonusView(this.game);
    const reward = this.data.season.bonus!.reward;
    const col = h('div', { class: 'scol bonus' + (b.unlocked ? ' reached' : ''), data: { level: 'bonus' } });
    col.appendChild(h('div', { class: 'sl', text: `${this.data.season.levels.length}+` }));
    col.appendChild(h('div', { class: 'scell ghost-cell', 'aria-hidden': 'true' }, h('div', { class: 'mute small center', text: `Every ${fmt(b.xpPer)} XP` })));
    const can = b.ready > 0;
    const cell = h('button', { class: 'scell premium' + (can ? ' can glow' : '') + (!b.premium ? ' locked' : ''), type: 'button', data: { bonus: '1' } });
    this.rewardBody(reward, cell);
    cell.appendChild(h('div', { class: 'sc-state', text: !b.premium ? '🔒' : can ? `Claim ×${b.ready}` : '∞' }));
    cell.addEventListener('click', () => this.claimBonus());
    col.appendChild(cell);
    return col;
  }

  /** Past level 50: progress to the next bonus chest, and any waiting. */
  private bonusCard(): HTMLElement {
    const b = seasonBonusView(this.game);
    const bonus = this.data.season.bonus!;
    const chestId = Object.keys(bonus.reward.items ?? {})[0] ?? '';
    const chest = this.data.chest(chestId);
    return h(
      'div',
      { class: 'card sp-bonus', data: { bonusCard: '1' } },
      artOrEmoji(chestArt(chestId), chest?.icon ?? '🎁', 'sp-bchest', chest?.name ?? 'Bonus chest'),
      h(
        'div',
        { class: 'grow stack-v tight' },
        h('div', { class: 'h3', text: b.premium ? `Bonus ${chest?.name ?? 'caches'}` : 'Bonus caches (premium)' }),
        bar(b.xpPer > 0 ? b.xpInto / b.xpPer : 0, 'purple', `${fmt(b.xpInto)} / ${fmt(b.xpPer)} XP`),
        h('div', { class: 'mute small', text: b.premium ? `One more every ${fmt(b.xpPer)} XP of play, with no limit.${b.claimed ? ` ${b.claimed} claimed so far.` : ''}` : `The premium track keeps paying after level ${this.data.season.levels.length}: a cache every ${fmt(b.xpPer)} XP.` }),
      ),
      b.ready > 0 ? btn({ label: `Claim ×${b.ready}`, cls: 'good small', id: 'btn-season-bonus', onClick: () => this.claimBonus() }) : null,
    );
  }

  private claimBonus(): void {
    const b = seasonBonusView(this.game);
    if (!b.premium) {
      this.ctx.toast('Unlock the premium track for bonus caches', 'info', '👑');
      return;
    }
    if (b.ready <= 0) {
      this.ctx.toast(`Next bonus cache in ${fmt(Math.max(0, b.xpPer - b.xpInto))} XP`, 'info', '🎁');
      return;
    }
    const reward = this.data.season.bonus!.reward;
    const n = claimSeasonBonus(this.game);
    if (n > 0) {
      this.ctx.haptic('success');
      this.ctx.showReward(n > 1 ? `${n} bonus caches` : 'Bonus cache', n > 1 ? scaleItems(reward, n) : reward, '🎁');
    }
    this.rerender();
  }

  private claimAll(): void {
    const g = this.game;
    const lo = g.sys.liveops;
    const st = g.state.liveops.season;
    const lvl = lo.seasonLevel();
    let n = 0;
    for (let l = 1; l <= Math.min(lvl, this.data.season.levels.length); l++) {
      if (!st.claimedFree.includes(l) && lo.claimSeason(l, false)) n++;
      if (st.premium && !st.claimedPremium.includes(l) && lo.claimSeason(l, true)) n++;
    }
    n += claimSeasonBonus(g);
    if (n) this.ctx.toast(`${n} season rewards claimed!`, 'reward', '🏆');
    this.rerender();
  }
}

/** `n` of a reward's items (the "you got" card for several bonus chests at once). */
function scaleItems(r: Reward, n: number): Reward {
  const items: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.items ?? {})) items[k] = v * n;
  return { ...r, items };
}

/** "an Explorer's Case", "a Supply Cache". */
function article(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}
