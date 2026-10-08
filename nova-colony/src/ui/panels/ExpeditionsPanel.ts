/**
 * ExpeditionsPanel — send squads out from the Radio Tower and bring their hauls home.
 *
 *  list   squads back home (Collect → the reward card), squads out (live countdowns), then the destinations of every
 *         region on its painted postcard (locked ones say why); after Titanium a Frontier tab with the Star Chart,
 *         its milestones and the uncharted signals.
 *  plan   one destination: who knows the terrain, the squad picker (portraits, profession match, skill), an
 *         optional vehicle, the expected haul and rare finds, and Launch.
 *
 * Opened from the Radio Tower's inspector, the Menu grid, the HUD chip and the "explorers are home" notification.
 */
import { Panel, type PanelTitle } from './Panel';
import type { Expedition, FrontierSite } from '../../core/state';
import type { Reward } from '../../data/schema';
import { fmt } from '../../core/format';
import { describeReward } from '../../sim/meta/util';
import { findLabel, nextFrontierFind, type HaulPlan, type TripSpec } from '../../sim/expedition/rules';
import { chanceText, chartLayout, destinationGroups, durationLabel, pickStar, squadRows, tripProgress, vehicleLine, type RegionGroup } from '../logic/expeditions';
import { jobOf, stars } from '../logic/colonist';
import { fmtHMS } from '../logic/time';
import { bar, btn, emptyState, portrait, rewardChips, section, tabs } from '../widgets';
import { fill, h, s, setVar } from '../dom';
import { artOrEmoji, biomeArt, buildingArt, hudArt, iconEl, itemArt, poiArt, professionArt, resIcon, vehicleIcon } from '../art';

type View = 'list' | 'plan';
type Tab = 'trips' | 'frontier';

export interface ExpeditionsArg {
  /** Open the planner for a destination id or a Frontier site id. */
  dest?: string;
  tab?: Tab;
}

const FRONTIER_ICON = '🌌';

export class ExpeditionsPanel extends Panel {
  readonly name = 'expeditions';
  private view: View = 'list';
  private tab: Tab = 'trips';
  private target: string | null = null;
  private squad: number[] = [];
  private vehicle: string | null = null;
  /** Star Chart: the star the player tapped (index into the chart). */
  private picked = -1;
  private acc = 0;

  title(): PanelTitle {
    if (this.view === 'plan' && this.target) {
      const spec = this.game.sys.expeditions.spec(this.target);
      if (spec) return { icon: spec.icon, art: spec.poi ? poiArt(spec.poi) : null, text: spec.name };
    }
    return { icon: '🧭', art: hudArt('expeditions'), text: 'Expeditions' };
  }

  override onOpen(arg: unknown): void {
    this.applyArg(arg);
  }

  override onArg(arg: unknown): void {
    this.applyArg(arg);
    this.rev++;
  }

  private applyArg(arg: unknown): void {
    const a = (arg && typeof arg === 'object' ? arg : {}) as ExpeditionsArg;
    if (a.tab) this.tab = a.tab;
    if (a.dest) this.plan(a.dest);
    else this.view = 'list';
  }

  override extras() {
    if (this.view !== 'plan') return null;
    return btn({ label: '← Back', cls: 'ghost small', data: { expBack: 1 }, onClick: () => this.back() });
  }

  private back(): void {
    this.view = 'list';
    this.target = null;
    this.rerender();
  }

  /** Android back in the planner goes to the list, like the header's "← Back". */
  override nestedView(): boolean {
    return this.view === 'plan' && this.target != null;
  }

  override leaveNested(): void {
    this.back();
  }

  private plan(target: string): void {
    this.view = 'plan';
    if (this.target !== target) {
      this.target = target;
      this.squad = [];
      this.vehicle = null;
    }
  }

  override signature(): string {
    const g = this.game;
    const st = g.state;
    const ex = g.sys.expeditions;
    const trips = ex.list().map((e) => `${e.id}${e.status}`).join(',');
    const away = st.colonists.list.reduce((n, c) => n + (c.away ? c.id : 0), 0);
    const fr = st.expeditions.frontier;
    return [
      this.view, this.tab, this.target, this.squad.join('.'), this.vehicle, this.picked, trips, st.colony.tier, st.colonists.list.length, away,
      st.world.regionsDiscovered.length, st.player.vehicles.join('.'), st.player.vehicle, fr.charted.length, fr.claimed.length, fr.signal, ex.unlocked() ? 1 : 0,
    ].join('|');
  }

  /** Countdowns and progress bars tick without re-rendering. */
  override live(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    const now = this.game.now();
    for (const el of Array.from(this.body.querySelectorAll<HTMLElement>('[data-ends]'))) {
      const left = (Number(el.dataset.ends) - now) / 1000;
      el.textContent = left > 0 ? fmtHMS(left) : 'Arriving…';
    }
    for (const el of Array.from(this.body.querySelectorAll<HTMLElement>('.bar[data-start]'))) {
      const a = Number(el.dataset.start);
      const b = Number(el.dataset.end);
      const f = Math.max(0, Math.min(1, (now - a) / Math.max(1, b - a)));
      const fillEl = el.firstElementChild as HTMLElement | null;
      if (fillEl) fillEl.style.transform = `scaleX(${f.toFixed(3)})`;
    }
  }

  render(): void {
    const ex = this.game.sys.expeditions;
    const lock = ex.lockReason();
    if (lock) {
      fill(this.body, this.lockedView(lock));
      return;
    }
    if (this.view === 'plan' && this.target && ex.spec(this.target)) {
      fill(this.body, this.planView(this.target));
      return;
    }
    this.view = 'list';
    fill(this.body, this.listView());
  }

  // ================================================================ locked

  private lockedView(reason: string): HTMLElement {
    const hq = this.game.sys.expeditions.hqDef();
    const wrap = h('div', { class: 'stack-v exp-locked' });
    wrap.appendChild(
      h(
        'div',
        { class: 'card tint row' },
        iconEl(buildingArt(hq?.id ?? 'radio_tower'), '📻', 'exp-hq', 'div'),
        h('div', { class: 'grow' }, h('div', { class: 'h3', text: 'Send squads beyond the colony' }), h('div', { class: 'mute small', text: 'Pick a few colonists, point them at a region you have discovered and they come home hours later with a haul: resources, crates, research and sometimes a new friend.' })),
      ),
    );
    wrap.appendChild(h('div', { class: 'card warn-card', text: `🔒 ${reason}` }));
    if (!this.game.sys.expeditions.hq() && this.game.state.colony.tier >= this.game.data.expeditionRules.unlockTier) {
      wrap.appendChild(btn({ label: `🔨 Build a ${hq?.name ?? 'Radio Tower'}`, cls: 'info block', onClick: () => this.ctx.open('build') }));
    }
    return wrap;
  }

  // ================================================================ list

  private listView(): HTMLElement {
    const g = this.game;
    const ex = g.sys.expeditions;
    const wrap = h('div', { class: 'stack-v exp-list' });
    const next = ex.nextSlotTier();
    wrap.appendChild(
      h(
        'div',
        { class: 'summary-strip' },
        h('div', { class: 'sum' }, h('b', { text: `${ex.busySlots()}/${ex.slots()}` }), h('small', { text: 'squads out' })),
        h('div', { class: 'sum' }, h('b', { class: ex.ready().length ? 'pos' : '', text: String(ex.ready().length) }), h('small', { text: 'back home' })),
        h('div', { class: 'sum' }, h('b', { text: next != null ? '+1 squad' : 'Max' }), h('small', { text: next != null ? `at ${g.data.tier(next).name}` : 'squad slots' })),
      ),
    );

    const ready = ex.ready();
    if (ready.length) {
      wrap.appendChild(section('Back home'));
      for (const e of ready) wrap.appendChild(this.readyCard(e));
      if (ready.length > 1) wrap.appendChild(btn({ label: `🎁 Collect all ${ready.length}`, cls: 'good block', onClick: () => this.collectAll() }));
    }
    const out = ex.out();
    if (out.length) {
      wrap.appendChild(section('Out exploring'));
      for (const e of out) wrap.appendChild(this.outCard(e));
    }

    if (ex.frontierUnlocked()) {
      const claim = ex.claimableMilestones().length;
      wrap.appendChild(
        tabs(
          [
            { id: 'trips', icon: '🗺️', art: hudArt('map'), label: 'Destinations' },
            { id: 'frontier', icon: FRONTIER_ICON, art: hudArt('starchart'), label: 'Frontier', badge: claim },
          ],
          this.tab,
          (id) => {
            this.tab = id as Tab;
            this.rerender();
          },
        ),
      );
    } else this.tab = 'trips';

    if (this.tab === 'frontier') wrap.appendChild(this.starChart());
    else {
      if (!ex.freeSlots()) wrap.appendChild(h('div', { class: 'mute small center', text: ex.ready().length ? 'Collect the squad that is back to send another.' : 'Every squad is out. Plan the next trip while you wait!' }));
      for (const grp of destinationGroups(g)) wrap.appendChild(this.regionCard(grp));
    }
    return wrap;
  }

  private tripIcon(e: Pick<Expedition, 'dest' | 'site'>): HTMLElement {
    if (e.dest === 'frontier') return artOrEmoji(biomeArt(e.site?.biome ?? ''), FRONTIER_ICON, 'exp-thumb', '', true);
    const def = this.data.expedition(e.dest);
    return iconEl(def ? poiArt(def.poi) : null, def?.icon ?? '🧭', 'exp-poi', 'div');
  }

  private readyCard(e: Expedition): HTMLElement {
    const ex = this.game.sys.expeditions;
    const crew = e.squad.map((id) => this.game.sys.colonists.get(id)).filter((c) => !!c);
    return h(
      'div',
      { class: 'card exp-trip ready', data: { trip: e.id } },
      h(
        'div',
        { class: 'row' },
        this.tripIcon(e),
        h('div', { class: 'grow' }, h('div', { class: 'h3', text: ex.nameOf(e) }), h('div', { class: 'small pos', text: `✨ ${crew.map((c) => c!.name.split(' ')[0]).join(', ')} ${crew.length === 1 ? 'is' : 'are'} home with a haul!` })),
      ),
      e.haul ? rewardChips(this.data, e.haul, 'exp-haul') : null,
      btn({ label: '🎁 Collect', cls: 'good block big', data: { collect: e.id }, onClick: () => this.collect(e.id) }),
    );
  }

  private outCard(e: Expedition): HTMLElement {
    const ex = this.game.sys.expeditions;
    const crew = e.squad.map((id) => this.game.sys.colonists.get(id)).filter((c) => !!c);
    const left = ex.secondsLeft(e);
    const pr = bar(tripProgress(this.game, e), 'blue exp-bar');
    pr.dataset.start = String(e.startedAt);
    pr.dataset.end = String(e.endsAt);
    const v = e.vehicle ? this.data.vehicle(e.vehicle) : null;
    return h(
      'div',
      { class: 'card exp-trip out', data: { trip: e.id } },
      h(
        'div',
        { class: 'row' },
        this.tripIcon(e),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'h3', text: ex.nameOf(e) }),
          h('div', { class: 'exp-crew' }, ...crew.map((c) => portrait(c!, false, jobOf(this.game, c!))), v ? vehicleIcon(v.id, v.icon, 'exp-veh', 'span') : null),
        ),
        h('div', { class: 'exp-eta' }, h('small', { text: 'back in' }), h('b', { class: 'num', 'data-ends': String(e.endsAt), text: fmtHMS(left) })),
      ),
      pr,
    );
  }

  private regionCard(grp: RegionGroup): HTMLElement {
    const biome = this.data.biome(grp.biome)!;
    const head = h(
      'div',
      { class: 'exp-banner' + (grp.discovered ? '' : ' locked') },
      artOrEmoji(biomeArt(grp.biome), '🗺️', 'exp-banner-img', biome.name, true),
      h('div', { class: 'exp-banner-txt' }, h('b', { text: biome.name }), h('small', { text: grp.discovered ? `${grp.entries.length} destinations` : '🔒 Not discovered yet' })),
    );
    const list = h('div', { class: 'exp-dests' });
    for (const en of grp.entries) list.appendChild(this.destRow(en.def.id, en.ok, en.reason));
    return h('div', { class: 'card exp-region', data: { region: grp.biome } }, head, list);
  }

  private destRow(id: string, ok: boolean, reason: string | null): HTMLElement {
    const def = this.data.expedition(id)!;
    const top = Object.entries(def.yields)
      .filter(([k]) => k !== 'rp')
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 3)
      .map(([k]) => resIcon(k, this.data.resource(k)?.icon ?? '•', 'exp-yi', 'span'));
    if ((def.yields.rp ?? 0) > 0) top.push(h('span', { class: 'exp-yi rp', text: '🔬' }));
    const meta = h(
      'div',
      { class: 'exp-meta' },
      h('span', { class: 'chip', text: `⏱ ${durationLabel(def.duration)}` }),
      ok ? h('span', { class: 'exp-yields' }, ...top) : h('span', { class: 'chip warn', text: `🔒 ${reason}` }),
    );
    const crew = h('span', { class: 'exp-match' }, ...def.match.map((p) => iconEl(professionArt(p), this.data.profession(p)?.icon ?? '🧑', 'exp-mi', 'span')));
    const kids = [iconEl(poiArt(def.poi), def.icon, 'exp-poi', 'div'), h('div', { class: 'grow' }, h('div', { class: 'dn', text: def.name }), meta), crew, h('span', { class: 'chev', text: '›' })];
    if (!ok) return h('div', { class: 'exp-dest locked', data: { dest: id }, title: reason ?? '' }, ...kids);
    const el = h('button', { class: 'exp-dest', type: 'button', data: { dest: id, sfx: 'ui_click' } }, ...kids);
    el.addEventListener('click', () => {
      this.plan(id);
      this.rerender();
      this.body.scrollTop = 0;
    });
    return el;
  }

  // ================================================================ collect

  private collect(id: number): void {
    const ex = this.game.sys.expeditions;
    const e = ex.get(id);
    if (!e) return;
    const icon = e.dest === 'frontier' ? FRONTIER_ICON : poiArt(this.data.expedition(e.dest)?.poi ?? '') ?? '🧭';
    const res = ex.collect(id);
    if (!res) return;
    this.ctx.haptic('success');
    this.ctx.showReward(`Home from ${res.name}!`, res.reward, icon);
    this.afterCollect(res.leftBehind, res.charted?.name);
    this.rerender();
  }

  private collectAll(): void {
    const ex = this.game.sys.expeditions;
    const total: Reward = {};
    let n = 0;
    const left: Record<string, number> = {};
    let charted: string | undefined;
    for (const e of ex.ready()) {
      const res = ex.collect(e.id);
      if (!res) continue;
      n++;
      mergeReward(total, res.reward);
      for (const [k, v] of Object.entries(res.leftBehind)) left[k] = (left[k] ?? 0) + v;
      charted = res.charted?.name ?? charted;
    }
    if (!n) return;
    this.ctx.haptic('success');
    this.ctx.showReward(`${n} squads home!`, total, '🧭');
    this.afterCollect(left, charted);
    this.rerender();
  }

  /** Follow-up toasts (a reached Star Chart milestone is announced by the sim itself). */
  private afterCollect(left: Record<string, number>, charted?: string): void {
    const lost = Object.entries(left).filter(([, v]) => v > 0);
    if (lost.length) {
      const [k, v] = lost[0];
      this.ctx.toast(`Storage is full: ${fmt(v)} ${this.data.resource(k)?.name ?? k} stayed behind. Build more storage!`, 'warning', '📦');
    }
    if (charted) this.ctx.toast(`${charted} is on your Star Chart!`, 'success', FRONTIER_ICON);
  }

  // ================================================================ plan

  private planView(target: string): HTMLElement {
    const g = this.game;
    const ex = g.sys.expeditions;
    const spec = ex.spec(target)!;
    // drop picks that are no longer possible (someone left on another trip, a vehicle got mounted…)
    this.squad = this.squad.filter((id) => !!g.sys.colonists.get(id) && !g.sys.colonists.get(id)!.away);
    if (this.vehicle && !ex.vehicles().some((v) => v.id === this.vehicle)) this.vehicle = null;
    const plan = ex.preview(target, this.squad, this.vehicle)!;
    const wrap = h('div', { class: 'stack-v exp-plan' });
    wrap.appendChild(this.hero(spec));
    wrap.appendChild(this.squadPicker(spec));
    const veh = this.vehiclePicker();
    if (veh) wrap.appendChild(veh);
    wrap.appendChild(this.forecast(spec, plan));
    const why = ex.canLaunch(target, this.squad, this.vehicle);
    wrap.appendChild(
      btn({
        label: this.squad.length ? `🧭 Launch · back in ${durationLabel(plan.seconds)}` : '🧭 Pick your squad',
        cls: 'good big block exp-launch',
        id: 'btn-exp-launch',
        disabled: why ?? false,
        onClick: () => this.launch(target),
      }),
    );
    return wrap;
  }

  private hero(spec: TripSpec): HTMLElement {
    const def = spec.dest !== 'frontier' ? this.data.expedition(spec.dest) : null;
    const desc = def?.description ?? `Uncharted land beyond the map that looks a lot like the ${this.data.biome(spec.region)?.name ?? 'wilds'}. Stop #${spec.depth} on your Frontier journey: nobody from your colony has ever set foot here.`;
    const pic = h(
      'div',
      { class: 'exp-hero' },
      artOrEmoji(biomeArt(spec.region), '🗺️', 'exp-hero-img', spec.name),
      spec.poi ? iconEl(poiArt(spec.poi), spec.icon, 'exp-hero-poi', 'div') : h('div', { class: 'exp-hero-poi star', text: FRONTIER_ICON }),
    );
    const chips = h(
      'div',
      { class: 'chips' },
      h('span', { class: 'chip info', text: `⏱ ${durationLabel(spec.duration)} on foot` }),
      h('span', { class: 'chip', text: spec.dest === 'frontier' ? `${FRONTIER_ICON} Depth ${spec.depth}` : `🗺️ ${this.data.biome(spec.region)?.name ?? ''}` }),
    );
    const crew = h(
      'div',
      { class: 'exp-best mute small' },
      'Best crew: ',
      ...spec.match.flatMap((p, i) => [i ? ' · ' : '', iconEl(professionArt(p), this.data.profession(p)?.icon ?? '', 'exp-mi', 'span'), ` ${this.data.profession(p)?.name ?? p}`]),
    );
    return h('div', { class: 'stack-v tight' }, pic, h('div', { class: 'mute small', text: desc }), chips, crew);
  }

  private squadPicker(spec: TripSpec): HTMLElement {
    const g = this.game;
    const max = g.data.expeditionRules.squadMax;
    const rows = squadRows(g, spec);
    const wrap = h('div', { class: 'stack-v tight' });
    wrap.appendChild(h('div', { class: 'sec exp-sec' }, `Squad ${this.squad.length}/${max}`, h('span', { class: 'mute', text: ' · ⭐ knows the terrain: bigger haul, better finds' })));
    if (!rows.length) {
      wrap.appendChild(emptyState('🧑‍🚀', 'Everyone is out exploring', 'Recruit more colonists, or wait for a squad to come home.'));
      return wrap;
    }
    const grid = h('div', { class: 'exp-picks', data: { scroll: 'picks' } });
    for (const r of rows) {
      const c = r.c;
      const on = this.squad.includes(c.id);
      const wp = c.workplace != null ? g.sys.buildings.get(c.workplace) : undefined;
      const job = wp ? this.data.building(wp.def)?.name ?? 'Working' : 'Idle';
      const el = h(
        'button',
        { class: 'exp-pick' + (on ? ' on' : '') + (r.match ? ' match' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', data: { pick: c.id, sfx: 'ui_tab' } },
        // the specialty is what counts out there (and what the match badge is about), so it is their portrait here
        portrait(c, false, c.specialty),
        h(
          'div',
          { class: 'grow pk' },
          h('div', { class: 'pn', text: c.name }),
          h('div', { class: 'ps' }, h('span', { class: 'stars', text: stars(c.skill) }), ` ${this.data.profession(c.specialty)?.name ?? c.specialty}`),
          h('div', { class: 'pj', text: job }),
        ),
        h('span', { class: 'pb' + (r.match ? ' match' : ''), text: `${r.match ? '⭐ ' : ''}+${r.bonusPct}%` }),
        h('span', { class: 'tick', text: on ? '✔' : '' }),
      );
      el.addEventListener('click', () => this.toggle(c.id));
      grid.appendChild(el);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  private toggle(id: number): void {
    const max = this.game.data.expeditionRules.squadMax;
    if (this.squad.includes(id)) this.squad = this.squad.filter((x) => x !== id);
    else if (this.squad.length < max) this.squad = [...this.squad, id];
    else {
      this.ctx.toast(`A squad has at most ${max} colonists`, 'info', '🧭');
      return;
    }
    this.rerender();
  }

  private vehiclePicker(): HTMLElement | null {
    const g = this.game;
    const owned = g.state.player.vehicles.map((id) => this.data.vehicle(id)).filter((v) => !!v);
    if (!owned.length) return null;
    const ex = g.sys.expeditions;
    const rules = this.data.expeditionRules;
    const row = h('div', { class: 'exp-vehs', data: { scroll: 'vehs' } });
    const opt = (id: string | null, icon: HTMLElement, name: string, line: string, why: string | false) => {
      const on = this.vehicle === id;
      const el = h('button', { class: 'exp-veh-opt' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', data: { vehicle: id ?? 'none', sfx: 'ui_tab' } }, icon, h('b', { text: name }), h('small', { text: line }));
      if (why) {
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('data-why', why);
      } else
        el.addEventListener('click', () => {
          this.vehicle = id;
          this.rerender();
        });
      row.appendChild(el);
    };
    opt(null, h('span', { class: 'exp-foot', text: '🥾' }), 'On foot', 'The scenic route', false);
    for (const v of owned) {
      const why = ex.vehicleAway(v!.id) ? 'Out on another trip' : g.state.player.vehicle === v!.id ? "You're riding it: hop off first" : false;
      opt(v!.id, vehicleIcon(v!.id, v!.icon, 'exp-vpic', 'span'), v!.name, vehicleLine(rules, v!), why);
    }
    return h('div', { class: 'stack-v tight' }, h('div', { class: 'sec exp-sec', text: 'Vehicle (optional)' }), row);
  }

  private forecast(spec: TripSpec, plan: HaulPlan): HTMLElement {
    const card = h('div', { class: 'card tint exp-forecast' });
    if (!plan.squad.size) {
      card.appendChild(h('div', { class: 'mute small', text: 'Pick up to three colonists to see what they could bring home.' }));
      return card;
    }
    const haul: Reward = { resources: plan.resources };
    if (plan.rp) haul.rp = plan.rp;
    const matched = plan.squad.matched;
    card.append(
      h('div', { class: 'row exp-fc-head' }, h('div', { class: 'h3 grow', text: 'Expected haul' }), h('span', { class: 'chip ' + (matched ? 'good' : ''), text: matched ? `⭐ ${matched} know${matched === 1 ? 's' : ''} the terrain` : 'No terrain experts' })),
      rewardChips(this.data, haul, 'exp-expect'),
    );
    if (plan.finds.length) {
      const finds = h('div', { class: 'chips exp-finds' });
      for (const f of plan.finds) {
        const item = Object.keys(f.reward.items ?? {})[0];
        const icon = f.reward.colonist ? iconEl(null, '🧑‍🚀') : item ? iconEl(itemArt(item), this.data.item(item)?.icon ?? '🎁') : f.reward.nova ? resIcon('nova', '💎') : iconEl(null, '🎁');
        finds.appendChild(h('span', { class: 'chip' + (f.reward.colonist ? ' info' : ''), title: describeReward(f.reward, this.data) }, icon, `${findLabel(this.data, f)} · ${chanceText(f.chance)}`));
      }
      card.append(h('div', { class: 'mute small', text: 'Might also find:' }), finds);
    }
    const back = new Date(this.game.now() + plan.seconds * 1000);
    const hhmm = `${back.getHours().toString().padStart(2, '0')}:${back.getMinutes().toString().padStart(2, '0')}`;
    const mood = plan.mood >= 0 ? `😊 Comes home in high spirits (+${plan.mood} mood)` : `😴 A long walk: a little tired after (${plan.mood} mood). A vehicle helps!`;
    card.append(h('div', { class: 'mute small exp-fc-foot' }, h('span', { text: `⏱ ${durationLabel(plan.seconds)} · back around ${hhmm}` }), h('span', { text: mood })));
    if (spec.dest !== 'frontier' && plan.squad.size < this.data.expeditionRules.squadMax) card.appendChild(h('div', { class: 'small info-txt', text: '💡 A bigger squad brings home more.' }));
    return card;
  }

  private launch(target: string): void {
    const ex = this.game.sys.expeditions;
    const spec = ex.spec(target);
    const e = ex.launch(target, this.squad, this.vehicle);
    if (!e) return;
    this.ctx.haptic('success');
    const n = e.squad.length;
    this.ctx.toast(`${n === 1 ? 'Your explorer is' : `${n} explorers are`} off to ${spec?.name ?? 'adventure'}. Back in ${durationLabel((e.endsAt - e.startedAt) / 1000)}!`, 'success', spec?.poi ? poiArt(spec.poi) ?? '🧭' : FRONTIER_ICON);
    this.view = 'list';
    this.target = null;
    this.squad = [];
    this.vehicle = null;
    this.rerender();
    this.body.scrollTop = 0;
  }

  // ================================================================ Star Chart

  private starChart(): HTMLElement {
    const g = this.game;
    const ex = g.sys.expeditions;
    const rules = this.data.expeditionRules;
    const charted = ex.charted();
    const wrap = h('div', { class: 'stack-v exp-chart' });

    // milestone progress
    const next = ex.nextMilestone();
    const prevCount = [...ex.milestones()].reverse().find((m) => m.reached)?.count ?? 0;
    const head = h('div', { class: 'card exp-ms-next' });
    head.appendChild(h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'h3', text: `${charted.length} site${charted.length === 1 ? '' : 's'} charted` }), next ? h('div', { class: 'mute small', text: `Next: ${next.title} at ${next.count} (${next.count - charted.length} to go)` }) : null), h('span', { class: 'exp-ms-ic', text: '🏅' })));
    if (next) {
      head.appendChild(bar((charted.length - prevCount) / Math.max(1, next.count - prevCount), 'purple thick', `${charted.length} / ${next.count}`));
      head.appendChild(rewardChips(this.data, next.reward));
    }
    wrap.appendChild(head);
    for (const m of ex.claimableMilestones()) {
      wrap.appendChild(
        h(
          'div',
          { class: 'card exp-ms-claim row' },
          h('span', { class: 'exp-ms-ic', text: '🏅' }),
          h('div', { class: 'grow' }, h('div', { class: 'h3', text: `${m.title} · ${m.count} sites` }), rewardChips(this.data, m.reward)),
          btn({
            label: 'Claim',
            cls: 'good',
            data: { milestone: m.count },
            onClick: () => {
              const r = ex.claimMilestone(m.count);
              if (r) this.ctx.showReward(`${m.title}!`, r, '🏅');
              this.rerender();
            },
          }),
        ),
      );
    }

    // the constellation
    wrap.appendChild(this.constellation());

    // uncharted signals
    wrap.appendChild(section('Uncharted signals'));
    if (!ex.freeSlots()) wrap.appendChild(h('div', { class: 'mute small', text: 'Every squad is out. Plan the next jump while you wait!' }));
    for (const site of ex.frontierSites()) wrap.appendChild(this.siteRow(site));
    const nf = nextFrontierFind(rules, charted.length + 1);
    if (nf) wrap.appendChild(h('div', { class: 'card tint small exp-next-find', text: `🔭 Deeper sites hold rarer things: ${nf.label} from site ${nf.from}.` }));

    // milestone ladder
    wrap.appendChild(section('Milestones'));
    const ladder = h('div', { class: 'exp-ladder' });
    for (const m of ex.milestones()) {
      ladder.appendChild(
        h(
          'div',
          { class: 'exp-rung' + (m.claimed ? ' done' : m.reached ? ' ready' : '') },
          h('b', { class: 'num', text: String(m.count) }),
          h('div', { class: 'grow' }, h('div', { class: 'rt', text: m.title }), rewardChips(this.data, m.reward)),
          h('span', { class: 'rs', text: m.claimed ? '✔' : m.reached ? '🎁' : '🔒' }),
        ),
      );
    }
    wrap.appendChild(ladder);
    return wrap;
  }

  private siteRow(site: FrontierSite): HTMLElement {
    const fl = this.data.expeditionRules.frontier.flavours.find((f) => f.biome === site.biome);
    const el = h(
      'button',
      { class: 'exp-dest frontier', type: 'button', data: { dest: site.id, sfx: 'ui_click' } },
      artOrEmoji(biomeArt(site.biome), FRONTIER_ICON, 'exp-thumb', site.name, true),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'dn', text: site.name }),
        h('div', { class: 'exp-meta' }, h('span', { class: 'chip', text: `⏱ ${durationLabel(site.duration)}` }), h('span', { class: 'chip info', text: `${FRONTIER_ICON} Site ${site.depth}` })),
      ),
      h('span', { class: 'exp-match' }, ...(fl?.match ?? []).map((p) => iconEl(professionArt(p), this.data.profession(p)?.icon ?? '🧑', 'exp-mi', 'span'))),
      h('span', { class: 'chev', text: '›' }),
    );
    el.addEventListener('click', () => {
      this.plan(site.id);
      this.rerender();
      this.body.scrollTop = 0;
    });
    return el;
  }

  /** The Star Chart: home at the centre, each charted site a star along the journey's path. */
  private constellation(): HTMLElement {
    const charted = this.game.sys.expeditions.charted();
    const pts = chartLayout(charted.length);
    const svg = s('svg', { viewBox: '0 0 100 100', class: 'exp-sky', role: 'img', 'aria-label': `Star Chart with ${charted.length} charted sites` });
    // faint background stars (deterministic)
    for (let i = 0; i < 40; i++) {
      const x = (i * 37.7) % 100;
      const y = (i * 61.3 + 13) % 100;
      svg.appendChild(s('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: (0.18 + (i % 3) * 0.12).toFixed(2), class: 'bg' }));
    }
    if (pts.length) {
      const path = ['M50 50', ...pts.map((p) => `L${(p.x * 100).toFixed(1)} ${(p.y * 100).toFixed(1)}`)].join(' ');
      svg.appendChild(s('path', { d: path, class: 'trail' }));
    }
    svg.appendChild(s('circle', { cx: 50, cy: 50, r: 3.2, class: 'home' }));
    svg.appendChild(s('text', { x: 50, y: 50.9, class: 'home-ic', 'text-anchor': 'middle' }, '🏠'));
    pts.forEach((p, i) => {
      const site = charted[i];
      const color = this.data.biome(site.biome)?.ground[1] ?? '#fff';
      const last = i === pts.length - 1;
      const g = s('g', { class: 'site' + (last ? ' last' : '') + (i === this.picked ? ' picked' : ''), 'data-site': i });
      g.appendChild(s('circle', { cx: (p.x * 100).toFixed(1), cy: (p.y * 100).toFixed(1), r: 6.5, class: 'hit' }));
      g.appendChild(s('circle', { cx: (p.x * 100).toFixed(1), cy: (p.y * 100).toFixed(1), r: site.find ? 1.9 : 1.4, fill: color, class: 'star' }));
      svg.appendChild(g);
    });
    // a tap picks the nearest star within ~26 px (at least the drawn circle): the chart is small on a landscape phone
    svg.addEventListener('click', (ev) => {
      const r = svg.getBoundingClientRect();
      const side = Math.min(r.width, r.height); // viewBox 100×100, centred (xMidYMid meet)
      if (!(side > 0)) return;
      const x = (ev.clientX - r.left - (r.width - side) / 2) / side;
      const y = (ev.clientY - r.top - (r.height - side) / 2) / side;
      const i = pickStar(pts, x, y, Math.max(0.065, 26 / side));
      if (i < 0) return;
      this.picked = this.picked === i ? -1 : i;
      this.rerender();
    });
    const box = h('div', { class: 'exp-sky-box' });
    box.appendChild(svg);
    if (!charted.length) box.appendChild(h('div', { class: 'exp-sky-empty', text: 'Your Star Chart is empty. Send a squad to an uncharted signal to draw the first star!' }));
    const info = charted[this.picked] ?? charted[charted.length - 1];
    if (info) {
      const when = new Date(info.at);
      const date = `${when.getFullYear()}-${(when.getMonth() + 1).toString().padStart(2, '0')}-${when.getDate().toString().padStart(2, '0')}`;
      box.appendChild(h('div', { class: 'exp-sky-info' }, h('b', { text: `#${info.depth} ${info.name}` }), h('small', { text: `${this.data.biome(info.biome)?.name ?? ''} · ${date}${info.find ? ` · found ${info.find}` : ''}` })));
    }
    const card = h('div', { class: 'exp-sky-card' }, box);
    setVar(card, '--n', String(charted.length));
    return card;
  }
}

function mergeReward(into: Reward, r: Reward): void {
  for (const [k, v] of Object.entries(r.resources ?? {})) {
    into.resources ??= {};
    into.resources[k] = (into.resources[k] ?? 0) + (v ?? 0);
  }
  for (const [k, v] of Object.entries(r.items ?? {})) {
    into.items ??= {};
    into.items[k] = (into.items[k] ?? 0) + v;
  }
  if (r.rp) into.rp = (into.rp ?? 0) + r.rp;
  if (r.nova) into.nova = (into.nova ?? 0) + r.nova;
  if (r.colonist) into.colonist = r.colonist;
}
