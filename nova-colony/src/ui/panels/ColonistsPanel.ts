/**
 * ColonistsPanel — everyone in the colony: portrait, specialty, stars, happiness, job, friendship hearts. Tap one for
 * the detail view (their wish, bio, trait, happiness factors, job assignment, "show me"). The Wishes tab lists every
 * open wish, nearest first, with Give / Show me right there (sim/wishes.ts).
 */
import { Panel, type PanelTitle } from './Panel';
import type { Colonist } from '../../core/state';
import { RARITY_COLOR, cap } from '../logic/rewards';
import { happinessFace, jobOf, stars } from '../logic/colonist';
import { bar, btn, emptyState, portrait, section, tabs } from '../widgets';
import { fill, h } from '../dom';
import { fmtLong } from '../logic/time';
import { buildingIcon, hudArt, iconEl, professionArt } from '../art';
import { heartsView, showMePlan, wishCard, wishRows, type WishCardView } from '../logic/wishes';

type Filter = 'all' | 'wishes' | 'idle' | 'working' | 'away';

export class ColonistsPanel extends Panel {
  readonly name = 'colonists';
  private detail: number | null = null;
  /** The detail page was opened from the list (not straight from the world): Android back returns to the list. */
  private fromList = false;
  private filter: Filter = 'all';
  /** Wishes tab: "12 m away" labels, refreshed in place by live() (a re-render would swallow taps). */
  private whereEls = new Map<number, HTMLElement>();
  private whereAcc = 0;

  title(): PanelTitle {
    if (this.detail != null) {
      const c = this.game.sys.colonists.get(this.detail);
      if (c) return { icon: this.data.profession(c.specialty)?.icon ?? '🧑‍🚀', art: professionArt(c.specialty), text: c.name };
    }
    return { icon: '🧑‍🚀', art: hudArt('crew'), text: 'Colonists' };
  }

  override onOpen(arg: unknown): void {
    const id = this.pick<number>(arg, 'id');
    if (id != null) this.detail = Number(id);
    // with wishes waiting (the Crew button wears a pink badge) the list opens on them
    else if (this.pick<string>(arg, 'tab') === 'wishes' || wishRows(this.game).length) this.filter = 'wishes';
    this.fromList = false;
  }

  override onArg(arg: unknown): void {
    const id = this.pick<number>(arg, 'id');
    this.detail = id != null ? Number(id) : null;
    this.fromList = false;
    this.rev++;
  }

  override nestedView(): boolean {
    return this.detail != null && this.fromList;
  }

  override leaveNested(): void {
    this.back();
  }

  override extras() {
    if (this.detail != null) return btn({ label: '← All', cls: 'ghost small', onClick: () => this.back() });
    return btn({
      label: '⚡ Auto-assign',
      cls: 'info small',
      onClick: () => {
        const n = this.game.sys.colonists.autoAssign();
        this.ctx.toast(n > 0 ? `${n} colonist${n === 1 ? '' : 's'} put to work!` : 'Everyone already has a job', n > 0 ? 'success' : 'info', '⚡');
        this.rerender();
      },
    });
  }

  private back(): void {
    this.detail = null;
    this.rerender();
  }

  override signature(): string {
    const list = this.game.state.colonists.list;
    const sum = list.reduce((a, c) => a + Math.round(c.happiness) + c.skill * 3 + (c.workplace ?? 0) * 7 + (c.away ? 11 : 0), 0);
    // wishes: which are open, their progress, whether Give is possible, hearts, and (on the Wishes tab) who is near
    const ws = this.game.state.wishes;
    let wish = '';
    for (const w of ws?.open ?? []) wish += `${w.id}.${w.done}.${this.game.sys.wishes.refusal(w) ? 0 : 1},`;
    const hearts = Object.values(ws?.bonds ?? {}).reduce((a, n) => a + n, 0);
    return `${list.length}|${sum}|${this.detail}|${this.filter}|${Math.round(this.game.derived.happiness.average)}|${wish}|${hearts}`;
  }

  /** Distances on the Wishes tab follow the colonists without rebuilding the list. */
  override live(dt: number): void {
    this.whereAcc += dt;
    if (this.whereAcc < 0.5 || !this.whereEls.size) return;
    this.whereAcc = 0;
    for (const r of wishRows(this.game)) {
      const el = this.whereEls.get(r.card.id);
      if (el && el.textContent !== r.where) el.textContent = r.where;
    }
  }

  render(): void {
    this.whereEls.clear();
    if (this.detail != null) {
      const c = this.game.sys.colonists.get(this.detail);
      if (c) {
        fill(this.body, this.renderDetail(c));
        return;
      }
      this.detail = null;
    }
    fill(this.body, this.renderList());
  }

  // ---------------------------------------------------------------- list

  private jobText(c: Colonist): string {
    if (c.away) {
      const trip = this.game.sys.expeditions.tripOf(c.id);
      return trip ? `🧭 On an expedition · ${this.game.sys.expeditions.nameOf(trip)}` : '🧭 On an expedition';
    }
    if (c.workplace == null) return 'Idle — tap to assign a job';
    const b = this.game.sys.buildings.get(c.workplace);
    const d = b ? this.data.building(b.def) : undefined;
    const prof = d?.workers ? this.data.profession(d.workers.job) : undefined;
    return `${prof?.icon ?? '🛠️'} ${prof?.name ?? 'Working'} · ${d?.name ?? ''}`;
  }

  private renderList(): HTMLElement {
    const g = this.game;
    const all = g.sys.colonists.all();
    const wrap = h('div', { class: 'stack-v' });
    const d = g.derived;
    const face = happinessFace(d.happiness.average);
    wrap.appendChild(
      h(
        'div',
        { class: 'summary-strip' },
        h('div', { class: 'sum' }, h('b', { text: String(all.length) }), h('small', { text: 'colonists' })),
        h('div', { class: 'sum' }, h('b', { text: String(Math.max(0, d.housing.beds - d.housing.used)) }), h('small', { text: 'free beds' })),
        h('div', { class: 'sum' }, h('b', { text: `${face.icon} ${Math.round(d.happiness.average)}` }), h('small', { text: face.label })),
        btn({ label: '➕ Recruit', cls: 'good small', onClick: () => this.ctx.open('recruit') }),
      ),
    );
    if (!all.length) {
      wrap.appendChild(emptyState('🏕️', 'No colonists yet', 'Rescue a survivor or recruit one from the board — they will work and keep you company!'));
      return wrap;
    }
    const away = all.filter((c) => c.away).length;
    const idle = all.filter((c) => c.workplace == null && !c.away).length;
    const rows = wishRows(g);
    if (this.filter === 'wishes' && !rows.length) this.filter = 'all';
    wrap.appendChild(
      tabs(
        [
          { id: 'all', label: `All ${all.length}` },
          ...(rows.length ? [{ id: 'wishes', label: `💭 Wishes ${rows.length}` }] : []),
          { id: 'idle', label: `Idle ${idle}` },
          { id: 'working', label: `Working ${all.length - idle - away}` },
          ...(away ? [{ id: 'away', label: `🧭 Away ${away}` }] : []),
        ],
        this.filter,
        (id) => {
          this.filter = id as Filter;
          this.rerender();
        },
      ),
    );
    if (this.filter === 'away' && !away) this.filter = 'all';
    if (this.filter === 'wishes') {
      wrap.appendChild(this.renderWishes());
      return wrap;
    }
    const list = all.filter((c) => (this.filter === 'idle' ? c.workplace == null && !c.away : this.filter === 'working' ? c.workplace != null : this.filter === 'away' ? !!c.away : true));
    const grid = h('div', { class: 'grid col-list' });
    for (const c of list) grid.appendChild(this.row(c));
    wrap.appendChild(grid);
    return wrap;
  }

  private row(c: Colonist): HTMLElement {
    const prof = this.data.profession(c.specialty);
    const face = happinessFace(c.happiness);
    const el = h(
      'button',
      { class: 'crow', type: 'button', data: { colonist: c.id, sfx: 'ui_click' } },
      portrait(c, false, jobOf(this.game, c)),
      h(
        'div',
        { class: 'grow ct' },
        h(
          'div',
          { class: 'cn' },
          c.name,
          c.rarity !== 'common' ? h('span', { class: 'pill', style: { background: RARITY_COLOR[c.rarity] }, text: c.rarity }) : null,
          this.heartsMini(c.id),
          !c.away && this.game.sys.wishes.of(c.id) ? h('span', { class: 'wish-dot', title: 'Has a wish', text: '💭' }) : null,
        ),
        h('div', { class: 'cs' }, h('span', { class: 'stars', text: stars(c.skill) }), ` ${prof?.icon ?? ''} ${prof?.name ?? c.specialty}`),
        h('div', { class: 'cj ' + (c.away ? 'away' : c.workplace == null ? 'idle' : ''), text: this.jobText(c) }),
        h('div', { class: 'ch' }, h('span', { text: face.icon }), bar(c.happiness / 100, 'thin ' + (c.happiness >= 60 ? 'good' : c.happiness >= 40 ? 'orange' : 'red'))),
      ),
    );
    el.addEventListener('click', () => {
      this.detail = c.id;
      this.fromList = true;
      this.rerender();
    });
    return el;
  }

  // ---------------------------------------------------------------- detail

  private renderDetail(c: Colonist): HTMLElement {
    const g = this.game;
    const prof = this.data.profession(c.specialty);
    const trait = this.data.trait(c.trait);
    const face = happinessFace(c.happiness);
    const wrap = h('div', { class: 'stack-v' });

    wrap.appendChild(
      h(
        'div',
        { class: 'row cd-head' },
        portrait(c, true, jobOf(this.game, c)),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'row wrap', style: 'gap:.4em' }, h('span', { class: 'pill', style: { background: RARITY_COLOR[c.rarity] }, text: cap(c.rarity) }), h('span', { class: 'chip', style: { background: (prof?.color ?? '#999') + '44' } }, h('i', { text: prof?.icon ?? '' }), prof?.name ?? c.specialty)),
          h('div', { class: 'stars big', text: stars(c.skill) }),
          bar(Math.min(1, c.xp > 1 ? c.xp / 100 : c.xp), 'purple thin', ''),
          h('div', { class: 'mute small', text: 'Skill progress' }),
          this.heartsRow(c.id),
        ),
      ),
    );
    const wish = c.away ? undefined : g.sys.wishes.of(c.id);
    const card = wish ? wishCard(g, wish) : null;
    if (card) wrap.appendChild(this.wishCardEl(card, true));
    wrap.appendChild(h('div', { class: 'card tint small', text: c.bio }));
    if (trait) wrap.appendChild(h('div', { class: 'row' }, h('span', { class: 'chip info', text: `✨ ${trait.name}` }), h('span', { class: 'mute small grow', text: trait.description })));

    // happiness
    wrap.appendChild(section('Happiness'));
    wrap.appendChild(h('div', { class: 'row' }, h('span', { class: 'big-face', text: face.icon }), h('div', { class: 'grow' }, bar(c.happiness / 100, 'thick ' + (c.happiness >= 60 ? 'good' : c.happiness >= 40 ? 'orange' : 'red'), `${face.label} · ${Math.round(c.happiness)}`))));
    const factors = g.sys.colonists.happinessFactors(c);
    if (factors.length) {
      const list = h('div', { class: 'factors' });
      for (const f of factors) {
        list.appendChild(h('div', { class: 'factor ' + (f.ok ? 'ok' : 'no') }, h('span', { text: f.ok ? '✔' : '✖' }), h('span', { class: 'grow', text: f.label }), h('b', { text: (f.value >= 0 ? '+' : '') + Math.round(f.value) })));
      }
      wrap.appendChild(list);
    }

    // job (or the trip they are on)
    if (c.away) {
      const ex = g.sys.expeditions;
      const trip = ex.tripOf(c.id);
      wrap.appendChild(section('Expedition'));
      wrap.appendChild(
        h(
          'div',
          { class: 'card tint' },
          h('div', { class: 'h3', text: trip ? `🧭 Exploring ${ex.nameOf(trip)}` : '🧭 Out exploring' }),
          h('div', { class: 'mute small', text: trip ? `Back in ${fmtLong(ex.secondsLeft(trip))}. Their bed is kept warm and their job is waiting for them.` : 'Back soon.' }),
          btn({ label: '🧭 Open Expeditions', cls: 'info small', onClick: () => this.ctx.open('expeditions') }),
        ),
      );
      return wrap;
    }
    wrap.appendChild(section('Job'));
    const jobCard = h('div', { class: 'card' });
    jobCard.appendChild(h('div', { class: 'h3', text: this.jobText(c) }));
    if (c.workplace != null) jobCard.appendChild(btn({ label: 'Take off this job', cls: 'ghost small', onClick: () => {
      g.sys.colonists.assign(c.id, null);
      this.rerender();
    } }));
    wrap.appendChild(jobCard);
    wrap.appendChild(this.openJobs(c));

    wrap.appendChild(
      btn({
        label: '📍 Show me where they are',
        cls: 'info block',
        onClick: () => {
          this.ctx.renderer.focus(c.x, c.z);
          this.ctx.close(this.name);
        },
      }),
    );
    return wrap;
  }

  // ---------------------------------------------------------------- wishes & friendship

  /** Tiny "💛 3" next to a name (nothing before the first heart). */
  private heartsMini(id: number): HTMLElement | null {
    const n = this.game.sys.wishes.hearts(id);
    return n > 0 ? h('span', { class: 'hearts-mini', title: `Friendship ${n}/${this.game.sys.wishes.maxHearts()}`, text: `💛${n}` }) : null;
  }

  /** Friendship hearts with what they unlock. */
  private heartsRow(id: number): HTMLElement {
    const r = this.data.wishRules;
    const v = heartsView(this.game.sys.wishes.hearts(id), r.hearts, r.perks);
    const harder = `works ${Math.round(r.perks.productivity * 100)}% harder`;
    const next =
      v.full < r.perks.productivityHearts
        ? `${r.perks.productivityHearts} hearts: ${harder}`
        : v.full < r.perks.bestFriendsHearts
          ? `Now ${harder} · ${r.perks.bestFriendsHearts} hearts: best friends`
          : `${harder.charAt(0).toUpperCase()}${harder.slice(1)} · +${r.perks.bestFriendsHappiness} happiness for good`;
    return h(
      'div',
      { class: 'hearts-row', title: `Friendship ${v.full}/${v.max}` },
      h('span', { class: 'hearts', text: v.text, 'aria-label': `Friendship ${v.full} of ${v.max}` }),
      h('span', { class: 'hearts-label' }, h('b', { text: v.label }), h('small', { text: next })),
    );
  }

  /** The wish card: what they would love, how, and the buttons (Give / Show me / Not now). */
  private wishCardEl(card: WishCardView, detail: boolean): HTMLElement {
    const g = this.game;
    const actions = h('div', { class: 'wish-actions' });
    if (card.give) {
      actions.appendChild(
        btn({
          label: card.give.label,
          cls: 'good',
          disabled: card.give.why ?? undefined,
          data: { 'wish-give': card.id, sfx: 'none' },
          onClick: () => {
            if (g.sys.wishes.give(card.id)) this.rerender();
          },
        }),
      );
    }
    if (card.showMe) actions.appendChild(btn({ label: '📍 Show me', cls: 'info', data: { 'wish-show': card.id }, onClick: () => this.showMe(card.id) }));
    if (detail) actions.appendChild(btn({ label: 'Not now', cls: 'ghost', onClick: () => this.ctx.close(this.name) }));
    return h(
      'div',
      { class: 'card wish-card', data: { wish: card.id } },
      h(
        'div',
        { class: 'wish-head' },
        h('span', { class: 'wish-ic' }, iconEl(hudArt('wish'), '💭', 'wish-art', 'span'), h('i', { class: 'wish-kind', text: card.icon })),
        h('div', { class: 'grow' }, h('div', { class: 'wish-title', text: detail ? `${card.name}'s wish: ${card.title}` : card.title }), h('div', { class: 'wish-quote', text: `“${card.text}”` })),
      ),
      h('div', { class: 'wish-hint mute small' }, card.hint, card.progress ? h('b', { class: 'wish-prog', text: ` ${card.progress}` }) : null),
      actions,
    );
  }

  /** The Wishes tab: every open wish, nearest first. */
  private renderWishes(): HTMLElement {
    const g = this.game;
    const wrap = h('div', { class: 'stack-v wish-list' });
    for (const r of wishRows(g)) {
      const c = g.sys.colonists.get(r.card.colonist);
      if (!c) continue;
      const who = h(
        'button',
        { class: 'wish-who', type: 'button', data: { colonist: c.id, sfx: 'ui_click' } },
        portrait(c, false, jobOf(g, c)),
        h('span', { class: 'grow' }, h('b', { text: c.name }), this.whereEl(r.card.id, r.where)),
        this.heartsMini(c.id),
      );
      who.addEventListener('click', () => {
        this.detail = c.id;
        this.fromList = true; // Android back returns to the Wishes list
        this.rerender();
      });
      const card = this.wishCardEl(r.card, false);
      card.prepend(who);
      wrap.appendChild(card);
    }
    wrap.appendChild(h('div', { class: 'mute small wish-foot', text: 'Granting a wish makes them happy and adds a friendship heart. Wishes never pressure you: they fade after a while if you are busy.' }));
    return wrap;
  }

  private whereEl(id: number, text: string): HTMLElement {
    const el = h('small', { text });
    this.whereEls.set(id, el);
    return el;
  }

  /** "Show me": open the right menu at the right card, or swing the camera over and let the arrow point the way. */
  private showMe(id: number): void {
    const g = this.game;
    const w = g.sys.wishes.get(id);
    const plan = w ? showMePlan(g, w) : null;
    if (!w || !plan) {
      this.ctx.toast('Nothing to point at right now: try again in a moment', 'info', '💭');
      return;
    }
    this.ctx.close(this.name);
    if (plan.focus) this.ctx.renderer.focus(plan.focus.x, plan.focus.z);
    if (plan.panel) this.ctx.open(plan.panel.name, plan.panel.arg);
    g.bus.emit('ui:wishGuide', { id });
  }

  private openJobs(c: Colonist): HTMLElement {
    const g = this.game;
    const wrap = h('div', { class: 'stack-v tight' });
    const rows: { b: (typeof g.state.buildings.list)[number]; free: number; match: boolean }[] = [];
    for (const b of g.state.buildings.list) {
      if (b.status === 'building' || b.id === c.workplace) continue;
      const d = this.data.building(b.def);
      if (!d?.workers) continue;
      const free = d.workers.slots - b.workers.length;
      if (free > 0) rows.push({ b, free, match: d.workers.job === c.specialty });
    }
    rows.sort((a, z) => Number(z.match) - Number(a.match));
    if (!rows.length) {
      wrap.appendChild(h('div', { class: 'mute small', text: 'No open job slots right now — build workplaces to give everyone something to do.' }));
      return wrap;
    }
    wrap.appendChild(h('div', { class: 'mute small', text: 'Open jobs' }));
    for (const r of rows.slice(0, 12)) {
      const d = this.data.building(r.b.def)!;
      const prof = this.data.profession(d.workers!.job);
      wrap.appendChild(
        h(
          'div',
          { class: 'row pick-row' },
          buildingIcon(d.id, d.icon, 'bi', 'span'),
          h('div', { class: 'grow' }, h('div', { class: 'h3', text: d.name }), h('div', { class: 'mute small', text: `${r.match ? '⭐ ' : ''}${prof?.name ?? ''} · ${r.free} open` })),
          btn({
            label: 'Assign',
            cls: 'good small',
            onClick: () => {
              if (g.sys.colonists.assign(c.id, r.b.id)) this.ctx.haptic('success');
              else this.ctx.toast("They can't take that job right now", 'info', '🧑‍🚀');
              this.rerender();
            },
          }),
        ),
      );
    }
    return wrap;
  }
}
