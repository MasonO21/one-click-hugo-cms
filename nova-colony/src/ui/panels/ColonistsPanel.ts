/**
 * ColonistsPanel — everyone in the colony: portrait, specialty, stars, happiness, job. Tap one for
 * the detail view (bio, trait, happiness factors, job assignment, "show me").
 */
import { Panel, type PanelTitle } from './Panel';
import type { Colonist } from '../../core/state';
import { RARITY_COLOR, cap } from '../logic/rewards';
import { happinessFace, jobOf, stars } from '../logic/colonist';
import { bar, btn, emptyState, portrait, section, tabs } from '../widgets';
import { fill, h } from '../dom';
import { buildingIcon, hudArt, professionArt } from '../art';

type Filter = 'all' | 'idle' | 'working';

export class ColonistsPanel extends Panel {
  readonly name = 'colonists';
  private detail: number | null = null;
  private filter: Filter = 'all';

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
  }

  override onArg(arg: unknown): void {
    const id = this.pick<number>(arg, 'id');
    this.detail = id != null ? Number(id) : null;
    this.rev++;
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
    const sum = list.reduce((a, c) => a + Math.round(c.happiness) + c.skill * 3 + (c.workplace ?? 0) * 7, 0);
    return `${list.length}|${sum}|${this.detail}|${this.filter}|${Math.round(this.game.derived.happiness.average)}`;
  }

  render(): void {
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
    const idle = all.filter((c) => c.workplace == null).length;
    wrap.appendChild(
      tabs(
        [
          { id: 'all', label: `All ${all.length}` },
          { id: 'idle', label: `Idle ${idle}` },
          { id: 'working', label: `Working ${all.length - idle}` },
        ],
        this.filter,
        (id) => {
          this.filter = id as Filter;
          this.rerender();
        },
      ),
    );
    const list = all.filter((c) => (this.filter === 'idle' ? c.workplace == null : this.filter === 'working' ? c.workplace != null : true));
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
        h('div', { class: 'cn' }, c.name, c.rarity !== 'common' ? h('span', { class: 'pill', style: { background: RARITY_COLOR[c.rarity] }, text: c.rarity }) : null),
        h('div', { class: 'cs' }, h('span', { class: 'stars', text: stars(c.skill) }), ` ${prof?.icon ?? ''} ${prof?.name ?? c.specialty}`),
        h('div', { class: 'cj ' + (c.workplace == null ? 'idle' : ''), text: this.jobText(c) }),
        h('div', { class: 'ch' }, h('span', { text: face.icon }), bar(c.happiness / 100, 'thin ' + (c.happiness >= 60 ? 'good' : c.happiness >= 40 ? 'orange' : 'red'))),
      ),
    );
    el.addEventListener('click', () => {
      this.detail = c.id;
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
        ),
      ),
    );
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

    // job
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
