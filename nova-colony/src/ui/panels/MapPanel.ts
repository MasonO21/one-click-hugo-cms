/**
 * MapPanel — 2D world map on a canvas: regions in their biome colours (WorldSystem.gen.regionMap),
 * fog of war (world.revealed), locked regions hatched with their unlock reason, the colony, the
 * player arrow, discovered POIs / beacons / live events. Pan, pinch/wheel zoom; tap a beacon to
 * fast travel (player.fastTravel).
 * Region surveys (sim/survey.ts): every region row carries its survey meter and next milestone; a tapped region
 * shows what is left, what the next milestone brings, Claim when it is reached and "Show me" for the nearest thing
 * left to explore. Explored POIs are dimmed on the map (a tick when one-off, waiting to restock otherwise) and a
 * restocked cache wears a green pip.
 */
import { Panel, type PanelTitle } from './Panel';
import { CELL, HALF_WORLD, WORLD_CELLS, cellCenter } from '../../core/constants';
import { clamp } from '../../core/math';
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, clampViewport, mapScale, mapToWorld, nearestMarker, placeLabel, regionCentroids, worldToMap, type LabelRect, type MapMarker, type MapViewport } from '../logic/map';
import { bar, btn, section } from '../widgets';
import { fill, h } from '../dom';
import { artOrEmoji, biomeArt, eventArt, hudArt, iconEl, poiArt } from '../art';
import { SURVEY } from '../../data/survey';
import type { SurveyProgress } from '../../sim/survey';
import { milestoneLabel, milestonePreview, pinSurvey, surveyLeftLine, surveyToast } from '../logic/survey';

function hex(c: string): [number, number, number] {
  const v = parseInt(c.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Cheap smooth value noise for terrain texture on the map. */
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const hsh = (a: number, b: number) => {
    let n = (a * 374761393 + b * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hsh(xi, yi) * (1 - u) + hsh(xi + 1, yi) * u;
  const b = hsh(xi, yi + 1) * (1 - u) + hsh(xi + 1, yi + 1) * u;
  return a * (1 - v) + b * v;
}

/**
 * The map's terrain texture: two octaves of value noise per cell. It never changes, so it is computed once and
 * cached (it was most of the first open's cost); `warmMapNoise` precomputes it while the game is idle.
 */
let mapNoiseCache: Float32Array | null = null;
function mapNoise(N: number): Float32Array {
  if (mapNoiseCache && mapNoiseCache.length === N * N) return mapNoiseCache;
  const out = new Float32Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) out[z * N + x] = vnoise(x * 0.07, z * 0.07) * 0.6 + vnoise(x * 0.28, z * 0.28) * 0.4;
  mapNoiseCache = out;
  return out;
}
/** Precompute the map texture noise in idle time after boot, so the first Map open is quick. */
export function warmMapNoise(): void {
  const w = globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(() => mapNoise(WORLD_CELLS), { timeout: 10000 });
  else setTimeout(() => mapNoise(WORLD_CELLS), 4000);
}

export class MapPanel extends Panel {
  readonly name = 'map';
  override readonly flush = true;
  private canvas!: HTMLCanvasElement;
  private g2!: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private baseKey = '';
  private vp: MapViewport = { w: 400, h: 400, zoom: 1, cx: 0, cz: 0 };
  private markers: MapMarker[] = [];
  private readonly markerImgs = new Map<string, HTMLImageElement>();
  private selected: MapMarker | null = null;
  /** A region picked by tapping empty ground or its row in the list (shows its postcard). */
  private selectedRegion: string | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch0 = 0;
  private zoom0 = 1;
  private moved = 0;
  private centroids: Record<string, { x: number; z: number }> = {};
  private acc = 1;
  private dirty = true;
  private prevMode: 'play' | 'build' | 'map' = 'play';
  private info!: HTMLElement;
  private dpr = 1;
  private zoomBox: HTMLElement | null = null;

  title(): PanelTitle {
    return { icon: '🗺️', art: hudArt('map'), text: 'World map' };
  }

  override onOpen(): void {
    const v = this.game.view;
    this.prevMode = v.mode === 'map' ? 'play' : v.mode;
    if (v.mode !== 'build') v.mode = 'map';
    this.vp.zoom = 1;
    this.vp.cx = 0;
    this.vp.cz = 0;
  }

  override onClose(): void {
    const v = this.game.view;
    if (v.mode === 'map') v.mode = this.prevMode === 'map' ? 'play' : this.prevMode;
  }

  override signature(): string {
    const w = this.game.state.world;
    return `${w.regionsUnlocked.length}|${w.regionsDiscovered.length}|${w.beacons.length}|${w.events.length}|${this.selected?.id}|${this.selectedRegion}|${this.game.state.colony.tier}|${this.game.sys.survey.version}`;
  }

  render(): void {
    const g = this.game;
    this.collectMarkers();
    // canvas area
    if (!this.canvas) {
      this.canvas = h<HTMLCanvasElement>('canvas', { class: 'map-canvas' });
      const ctx2d = this.canvas.getContext('2d');
      if (!ctx2d) return;
      this.g2 = ctx2d;
      this.bindCanvas();
    }
    const zoomBox = (this.zoomBox = h(
      'div',
      { class: 'map-zoom' },
      btn({ label: '＋', cls: 'ghost small', onClick: () => this.zoomBy(1.4) }),
      btn({ label: '－', cls: 'ghost small', onClick: () => this.zoomBy(1 / 1.4) }),
      btn({
        label: '◎',
        cls: 'ghost small',
        onClick: () => {
          this.vp.cx = g.state.player.x;
          this.vp.cz = g.state.player.z;
          this.vp.zoom = Math.max(this.vp.zoom, 2);
          clampViewport(this.vp);
          this.dirty = true;
        },
      }),
    ));
    const stage = h('div', { class: 'map-stage' }, this.canvas, zoomBox);

    // side column
    this.info = h('div', { class: 'map-info' });
    this.renderInfo();
    const side = h('div', { class: 'map-side' }, this.info, this.travelList(), this.regionList());
    fill(this.body, h('div', { class: 'map-layout' }, stage, side));
    this.dirty = true;
    this.acc = 1;
  }

  // ---------------------------------------------------------------- data

  private collectMarkers(): void {
    const g = this.game;
    const out: MapMarker[] = [];
    out.push({ id: 'base', kind: 'core', x: 0, z: 0, icon: '🏠', art: hudArt('home'), label: 'Your colony', travel: true });
    const wst = g.state.world;
    for (const p of g.sys.world.gen?.pois ?? []) {
      const ps = wst.pois[p.id];
      if (!ps?.discovered) continue;
      const def = this.data.poi(p.def);
      const isBeacon = wst.beacons.includes(p.id);
      const world = g.sys.world;
      const loot: MapMarker['loot'] = isBeacon || def?.kind === 'beacon' ? undefined : world.poiRestocked(p.id) ? 'restocked' : ps.looted ? ((def?.respawn ?? 0) > 0 ? 'waiting' : 'done') : undefined;
      out.push({ id: p.id, kind: isBeacon ? 'beacon' : 'poi', x: p.x, z: p.z, icon: def?.icon ?? '❓', art: poiArt(p.def), label: def?.name ?? p.def, travel: isBeacon, loot });
    }
    for (const t of g.sys.world.fastTravelTargets()) {
      if (t.id === 'base' || out.some((m) => m.id === t.id)) continue;
      out.push({ id: t.id, kind: 'teleporter', x: t.x, z: t.z, icon: '🌀', art: hudArt('teleporter'), label: t.name, travel: true });
    }
    for (const e of wst.events) {
      const def = this.data.worldEvent(e.def);
      out.push({ id: `event_${e.id}`, kind: 'event', x: e.x, z: e.z, icon: def?.icon ?? '✨', art: def?.poi ? poiArt(def.poi) : null, label: def?.name ?? 'Event', travel: false });
    }
    this.markers = out;
  }

  private travelTargets(): { id: string; name: string }[] {
    const t = this.game.sys.world.fastTravelTargets();
    const list = [{ id: 'base', name: 'Colony base' }, ...t.filter((x) => x.id !== 'base').map((x) => ({ id: x.id, name: x.name }))];
    return list;
  }

  private travel(id: string, name: string): void {
    if (this.game.sys.player.fastTravel(id)) {
      this.ctx.haptic('success');
      this.ctx.toast(`Whoosh! Arrived at ${name}`, 'success', '🌀');
      this.ctx.close(this.name);
    } else this.ctx.toast("Can't travel there right now", 'info', '🌀');
  }

  private renderInfo(): void {
    const m = this.selected;
    if (!m) {
      if (this.selectedRegion && this.data.biome(this.selectedRegion)) {
        fill(this.info, this.regionCard(this.selectedRegion));
        return;
      }
      const waiting = this.game.sys.survey.claimable();
      fill(
        this.info,
        h('div', { class: 'mute small', text: 'Tap a region or marker for details. Beacons let you fast travel!' }),
        waiting > 0 && this.game.sys.liveops.offersUnlocked() ? h('div', { class: 'sv-hint', text: `🧭 ${waiting === 1 ? 'A survey reward is' : `${waiting} survey rewards are`} waiting: tap a region marked Ready` }) : null,
      );
      return;
    }
    const evArt = m.kind === 'event' ? this.eventArtFor(m) : null;
    const card = h('div', { class: 'card tint' }, evArt ? h('div', { class: 'ev-hero small' }, artOrEmoji(evArt.src, m.icon, 'ev-img', m.label, true)) : null, h('div', { class: 'row' }, iconEl(m.art ?? null, m.icon, 'bi', 'span'), h('div', { class: 'grow' }, h('div', { class: 'h3', text: m.label }), h('div', { class: 'mute small', text: m.kind === 'event' ? 'A world event — go take a look!' : m.kind === 'beacon' ? 'Fast-travel beacon' : m.kind === 'core' ? 'Home sweet home' : this.poiStatus(m) }))));
    const act = h('div', { style: 'margin-top:.5em' });
    if (m.travel) act.appendChild(btn({ label: '🌀 Fast travel here', cls: 'good block', onClick: () => this.travel(m.id, m.label) }));
    else if (m.kind !== 'core') {
      act.appendChild(
        btn({
          label: '📍 Show me',
          cls: 'info block',
          onClick: () => {
            this.ctx.renderer.focus(m.x, m.z);
            this.ctx.close(this.name);
          },
        }),
      );
    }
    if (act.childElementCount) card.appendChild(act);
    fill(this.info, card);
  }

  /** "Restocked: open it again", "Restocks in 12 min", "Explored". */
  private poiStatus(m: MapMarker): string {
    if (m.loot === 'restocked') return 'Restocked: open it again';
    if (m.loot === 'done') return 'Explored';
    if (m.loot === 'waiting') {
      const left = this.game.sys.world.poiRestockLeft(m.id);
      return Number.isFinite(left) ? `Explored · restocks in ${Math.max(1, Math.ceil(left / 60))} min` : 'Explored';
    }
    return 'Point of interest · not explored yet';
  }

  /** A decoded marker picture, or null while it loads (the emoji stands in) or when it failed. */
  private markerImage(src: string): HTMLImageElement | null {
    let img = this.markerImgs.get(src);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.dirty = true;
      };
      img.src = src;
      this.markerImgs.set(src, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  private eventArtFor(m: MapMarker): { src: string } | null {
    const ev = this.game.state.world.events.find((e) => `event_${e.id}` === m.id);
    const def = ev ? this.data.worldEvent(ev.def) : undefined;
    const src = def ? eventArt(def.kind) : null;
    return src ? { src } : null;
  }

  /** Postcard + name + status (or what unlocks it) for a tapped region. */
  private regionCard(id: string): HTMLElement {
    const world = this.game.sys.world;
    const b = this.data.biome(id)!;
    const unlocked = world.isUnlocked(id);
    const disc = this.game.state.world.regionsDiscovered.includes(id);
    const reason = world.lockReason(id);
    const pic = h('div', { class: 'rc-pic' }, artOrEmoji(biomeArt(id), '🗺️', 'rc-img', b.name, true), unlocked ? null : h('div', { class: 'rc-lock', text: '🔒' }));
    const card = h(
      'div',
      { class: 'card tint region-card' + (unlocked ? '' : ' locked'), data: { region: id } },
      pic,
      h(
        'div',
        { class: 'rc-txt' },
        h('div', { class: 'h3', text: b.name }),
        h('div', { class: 'mute small', text: unlocked || disc ? b.description : 'An unexplored region far from home.' }),
        unlocked
          ? h('span', { class: 'chip ' + (disc ? 'good' : 'info'), text: disc ? '✔ Discovered' : 'Unlocked — go explore!' })
          : h('div', { class: 'lock', text: `🔒 ${reason ?? 'Locked'}` }),
      ),
    );
    const p = this.game.sys.survey.region(id);
    return p && unlocked ? h('div', { class: 'region-sheet' }, card, this.surveyCard(p)) : card;
  }

  /** A region's survey: meter, what is left, the next milestone (Claim when reached), "Show me" and the perk. */
  private surveyCard(p: SurveyProgress): HTMLElement {
    const g = this.game;
    const id = p.region;
    const box = h('div', { class: 'card sv-card', data: { survey: id } });
    const meter = bar(p.pct / 100, 'sv-bar');
    for (const m of SURVEY.milestones.slice(0, -1)) {
      const tick = h('b', { class: 'sv-tick' + (p.pct >= m ? ' on' : '') });
      tick.style.left = `${m}%`;
      meter.appendChild(tick);
    }
    box.appendChild(h('div', { class: 'sv-head' }, h('span', { class: 'sv-label', text: 'Survey' }), h('b', { class: 'sv-pct', text: `${p.pct}%` })));
    box.appendChild(meter);
    const facts = h(
      'div',
      { class: 'sv-facts' },
      h('span', null, h('i', { text: '🗺️' }), `Charted ${Math.floor(p.charted * 100)}%`),
      h('span', null, h('i', { text: '📍' }), `Sites ${p.pois.done}/${p.pois.total}`),
      h('span', null, h('i', { text: '🌿' }), `Field guide ${p.specimens.done}/${p.specimens.total}`),
    );
    box.appendChild(facts);
    // what is left, in words; the field guide names the kinds still missing
    const left = surveyLeftLine(p);
    box.appendChild(h('div', { class: 'sv-left' + (left ? '' : ' done'), text: left ?? 'Every corner charted, every site explored.' }));
    if (p.specimens.missing.length && p.specimens.missing.length <= 3) {
      const names = p.specimens.missing.map((n) => g.data.node(n)?.name ?? n).join(', ');
      box.appendChild(h('div', { class: 'mute small', text: `Field guide still needs: ${names}` }));
    }
    const next = g.sys.survey.next(id);
    if (next) {
      const ready = p.claimed < p.reached;
      const nb = h('div', { class: 'sv-next' + (ready ? ' ready' : '') });
      nb.appendChild(h('div', { class: 'sv-next-h', text: ready ? `Reward ready · ${milestoneLabel(next.step)}` : `Next · ${milestoneLabel(next.step)}` }));
      const ul = h('ul', { class: 'sv-prev' });
      for (const l of milestonePreview(g, id, next.step)) ul.appendChild(h('li', null, h('span', { class: 'ic', text: l.icon }), h('span', { text: l.text })));
      nb.appendChild(ul);
      if (ready) nb.appendChild(btn({ label: 'Claim reward', cls: 'good block', id: 'btn-survey-claim', onClick: () => this.claim(id) }));
      box.appendChild(nb);
    }
    if (g.sys.survey.mastered(id)) {
      const perk = g.sys.survey.preview(id, 3).perk;
      if (perk) box.appendChild(h('div', { class: 'sv-perk small' }, h('span', { class: 'sv-perk-ic', text: '★' }), h('div', { class: 'sv-perk-tx' }, h('b', { text: perk.title }), h('span', { text: perk.text }))));
    }
    const pl = g.state.player;
    const target = p.pct < 100 ? g.sys.survey.suggest(pl.x, pl.z, Number.POSITIVE_INFINITY, id) : null;
    if (target) {
      box.appendChild(
        btn({
          label: '📍 Show me what is left',
          cls: 'info block',
          id: 'btn-survey-show',
          onClick: () => {
            pinSurvey(target, performance.now() / 1000);
            this.ctx.toast(surveyToast(target), 'info', '🧭');
            this.ctx.close(this.name);
          },
        }),
      );
    }
    return box;
  }

  private claim(region: string): void {
    const c = this.game.sys.survey.claim(region);
    if (!c) return;
    this.ctx.haptic('success');
    this.ctx.open('survey_reward', c);
    this.rev++;
  }

  private selectRegion(id: string | null): void {
    this.selected = null;
    this.selectedRegion = id;
    this.ctx.sfx('ui_tab');
    this.renderInfo();
    this.dirty = true;
    this.info?.scrollIntoView({ block: 'nearest' });
  }

  private travelList(): HTMLElement {
    const wrap = h('div', null, section('Fast travel'));
    const list = h('div', { class: 'chips' });
    for (const t of this.travelTargets()) list.appendChild(btn({ label: t.id === 'base' ? '🏠 ' + t.name : '📡 ' + t.name, cls: 'ghost small', onClick: () => this.travel(t.id, t.name) }));
    wrap.appendChild(list);
    return wrap;
  }

  private regionList(): HTMLElement {
    const g = this.game;
    const wrap = h('div', null, section('Regions'));
    const list = h('div', { class: 'stack-v tight' });
    for (const b of this.data.biomes) {
      const unlocked = g.sys.world.isUnlocked(b.id);
      const reason = g.sys.world.lockReason(b.id);
      const disc = g.state.world.regionsDiscovered.includes(b.id);
      const sw = h('i', { class: 'sw' });
      sw.style.background = `linear-gradient(135deg, ${b.ground[0]}, ${b.ground[1]})`;
      // named like on the map above it, the Expeditions board and the missions ("Discover the Toxic Marsh"): a "???"
      // here next to "🔒 Toxic Marsh" on the map read as two different places
      const p = unlocked ? g.sys.survey.region(b.id) : undefined;
      const ready = !!p && p.claimed < p.reached;
      const next = p ? g.sys.survey.next(b.id) : null;
      const sub = !unlocked ? `🔒 ${reason ?? 'Locked'}` : !p ? (disc ? 'Discovered' : 'Unlocked — go explore!') : p.pct >= 100 && !ready ? '★ Mastered' : next ? `Next: ${milestoneLabel(next.step)}` : '';
      const meter = p ? h('div', { class: 'sv-row' }, bar(p.pct / 100, 'sv-bar thin'), h('b', { class: 'sv-pct', text: `${p.pct}%` })) : null;
      const row = h(
        'div',
        { class: 'row region' + (unlocked ? '' : ' locked') + (this.selectedRegion === b.id ? ' picked' : '') + (ready ? ' sv-ready' : ''), data: { region: b.id } },
        sw,
        h('div', { class: 'grow' }, h('div', { class: 'h3', text: b.name }), meter, h('div', { class: 'mute small', text: sub })),
        ready ? h('span', { class: 'chip good sv-chip', text: 'Ready' }) : null,
      );
      row.addEventListener('click', () => this.selectRegion(b.id));
      list.appendChild(row);
    }
    wrap.appendChild(list);
    return wrap;
  }

  // ---------------------------------------------------------------- interaction

  private bindCanvas(): void {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.moved = 0;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom0 = this.vp.zoom;
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      if (this.pointers.size === 1) {
        const k = mapScale(this.vp);
        this.vp.cx -= dx / k;
        this.vp.cz -= dy / k;
        clampViewport(this.vp);
        this.dirty = true;
      } else if (this.pointers.size === 2 && this.pinch0 > 0) {
        const [a, b] = [...this.pointers.values()];
        this.vp.zoom = clamp(this.zoom0 * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch0), MAP_MIN_ZOOM, MAP_MAX_ZOOM);
        clampViewport(this.vp);
        this.dirty = true;
      }
    });
    const up = (e: PointerEvent) => {
      const had = this.pointers.has(e.pointerId);
      this.pointers.delete(e.pointerId);
      this.pinch0 = 0;
      if (had && this.moved < 8 && this.pointers.size === 0) this.tap(e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2);
      },
      { passive: false },
    );
  }

  private zoomBy(f: number): void {
    this.vp.zoom = clamp(this.vp.zoom * f, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
    clampViewport(this.vp);
    this.dirty = true;
  }

  private tap(cx: number, cy: number): void {
    const r = this.canvas.getBoundingClientRect();
    const m = nearestMarker(this.markers, this.vp, cx - r.left, cy - r.top, 30);
    // tap a beacon once to select it, tap it again to travel
    if (m && m.travel && this.selected?.id === m.id) {
      this.travel(m.id, m.label);
      return;
    }
    this.selected = m;
    // empty ground: pick the region under the finger (postcard card)
    this.selectedRegion = null;
    if (!m) {
      const w = mapToWorld(this.vp, cx - r.left, cy - r.top);
      if (this.game.sys.world.gen && Math.abs(w.x) < HALF_WORLD && Math.abs(w.z) < HALF_WORLD) this.selectedRegion = this.game.sys.world.regionAt(w.x, w.z) ?? null;
    }
    if (m?.travel) this.ctx.sfx('ui_tab');
    this.renderInfo();
    this.dirty = true;
  }

  // ---------------------------------------------------------------- drawing

  override live(dt: number): void {
    if (!this.canvas || !this.g2) return;
    this.acc += dt;
    if (!this.dirty && this.acc < 0.5) return;
    this.acc = 0;
    this.dirty = false;
    this.draw();
  }

  private fit(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(50, Math.floor(r.width));
    const h2 = Math.max(50, Math.floor(r.height));
    if (this.vp.w !== w || this.vp.h !== h2 || this.dpr !== dpr || this.canvas.width !== Math.floor(w * dpr)) {
      this.vp.w = w;
      this.vp.h = h2;
      this.dpr = dpr;
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h2 * dpr);
      clampViewport(this.vp);
    }
  }

  private worldKey(): string {
    const w = this.game.state.world;
    return `${w.fog}|${w.regionsUnlocked.join(',')}|${this.game.sys.world.gen?.regionMap ? 1 : 0}`;
  }

  private buildBase(): void {
    const world = this.game.sys.world;
    const gen = world.gen;
    if (!gen?.regionMap) {
      this.base = null;
      return;
    }
    const N = WORLD_CELLS;
    const cv = this.base ?? document.createElement('canvas');
    cv.width = N;
    cv.height = N;
    const c = cv.getContext('2d')!;
    const img = c.createImageData(N, N);
    const ids = gen.regionIds;
    const cols = ids.map((id) => {
      const b = this.data.biome(id);
      return [hex(b?.ground[0] ?? '#6fbf5a'), hex(b?.ground[1] ?? '#9bd66b')] as [number, number, number][];
    });
    const locked = ids.map((id) => !world.isUnlocked(id));
    // fog grid (64x64 blocks of 4x4 cells)
    const B = N / 4;
    const fog = new Uint8Array(B * B);
    for (let bz = 0; bz < B; bz++) for (let bx = 0; bx < B; bx++) fog[bz * B + bx] = world.revealed(cellCenter(bx * 4 + 2), cellCenter(bz * 4 + 2)) ? 0 : 1;
    const d = img.data;
    const noise = mapNoise(N);
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x;
        const ri = gen.regionMap[i];
        const c0 = cols[ri]?.[0] ?? [90, 120, 90];
        const c1 = cols[ri]?.[1] ?? [120, 150, 110];
        const n = noise[i];
        let r = c0[0] + (c1[0] - c0[0]) * n;
        let g = c0[1] + (c1[1] - c0[1]) * n;
        let b = c0[2] + (c1[2] - c0[2]) * n;
        // region borders
        const right = x < N - 1 ? gen.regionMap[i + 1] : ri;
        const down = z < N - 1 ? gen.regionMap[i + N] : ri;
        if (right !== ri || down !== ri) {
          r *= 0.62;
          g *= 0.62;
          b *= 0.62;
        }
        if (locked[ri]) {
          const gray = (r + g + b) / 3;
          r = r * 0.35 + gray * 0.65 * 0.7;
          g = g * 0.35 + gray * 0.65 * 0.7;
          b = b * 0.35 + gray * 0.65 * 0.7;
          if ((x + z) % 9 < 2) {
            r *= 0.55;
            g *= 0.55;
            b *= 0.6;
          }
        }
        if (fog[((z >> 2) * B) + (x >> 2)]) {
          r = r * 0.22 + 36 * 0.78;
          g = g * 0.22 + 28 * 0.78;
          b = b * 0.22 + 58 * 0.78;
        }
        const o = i * 4;
        d[o] = r;
        d[o + 1] = g;
        d[o + 2] = b;
        d[o + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    this.base = cv;
    this.centroids = regionCentroids(gen.regionMap, ids);
  }

  /** Little badge on an explored POI: a green dot (restocked), a clock (restocking) or a tick (explored for good). */
  private lootPip(c: CanvasRenderingContext2D, x: number, y: number, kind: NonNullable<MapMarker['loot']>): void {
    const r = 5.5;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = kind === 'restocked' ? '#3fbf6f' : kind === 'waiting' ? '#8a7a64' : '#5a4f6e';
    c.fill();
    c.lineWidth = 1.6;
    c.strokeStyle = '#fff';
    c.stroke();
    c.beginPath();
    if (kind === 'done') {
      c.moveTo(x - 2.4, y + 0.2);
      c.lineTo(x - 0.6, y + 2);
      c.lineTo(x + 2.6, y - 1.8);
    } else if (kind === 'waiting') {
      c.moveTo(x, y - 2.8);
      c.lineTo(x, y);
      c.lineTo(x + 2.2, y + 1.2);
    } else {
      c.arc(x, y, 1.6, 0, Math.PI * 2);
      c.fillStyle = '#fff';
      c.fill();
      return;
    }
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.lineCap = 'round';
    c.stroke();
    c.lineCap = 'butt';
  }

  private draw(): void {
    this.fit();
    const g = this.game;
    const c = this.g2;
    const vp = this.vp;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#251d45';
    c.fillRect(0, 0, vp.w, vp.h);
    const key = this.worldKey();
    if (key !== this.baseKey) {
      this.baseKey = key;
      this.buildBase();
    }
    const k = mapScale(vp);
    const tl = worldToMap(vp, -HALF_WORLD, -HALF_WORLD);
    if (this.base) {
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(this.base, tl.x, tl.y, HALF_WORLD * 2 * k, HALF_WORLD * 2 * k);
    } else {
      c.fillStyle = '#3a2f66';
      c.fillRect(tl.x, tl.y, HALF_WORLD * 2 * k, HALF_WORLD * 2 * k);
      c.fillStyle = '#d9cfff';
      c.font = '700 16px system-ui';
      c.textAlign = 'center';
      c.fillText('Charting the unknown…', vp.w / 2, vp.h / 2);
    }
    // world frame
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 2;
    c.strokeRect(tl.x, tl.y, HALF_WORLD * 2 * k, HALF_WORLD * 2 * k);

    // region labels
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const ids = g.sys.world.gen?.regionIds ?? [];
    const fs = clamp(12 * Math.sqrt(vp.zoom), 11, 18);
    // labels stay inside the map, out from under the zoom buttons and off the beacons drawn on top of them
    const avoid = this.markers
      .filter((m) => m.kind !== 'player')
      .map((m) => ({ ...worldToMap(vp, m.x, m.z), r: m.travel ? 15 : 12 }));
    const blocked: LabelRect[] = [];
    const zr = this.zoomBox?.getBoundingClientRect();
    const cr = this.canvas?.getBoundingClientRect();
    if (zr && cr && zr.width > 0) blocked.push({ x: zr.left - cr.left, y: zr.top - cr.top, w: zr.width, h: zr.height });
    for (const id of ids) {
      const cen = this.centroids[id];
      if (!cen) continue;
      const p = worldToMap(vp, cen.x, cen.z);
      if (p.x < -40 || p.y < -20 || p.x > vp.w + 40 || p.y > vp.h + 20) continue;
      const b = this.data.biome(id);
      const lockedR = !g.sys.world.isUnlocked(id);
      const disc = g.state.world.regionsDiscovered.includes(id);
      c.font = `900 ${fs}px ui-rounded, system-ui, sans-serif`;
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(30,18,60,0.85)';
      c.fillStyle = '#fff';
      const label = lockedR ? `🔒 ${b?.name ?? id}` : disc || g.sys.world.isUnlocked(id) ? (b?.name ?? id) : '???';
      const reason = lockedR ? g.sys.world.lockReason(id) : null;
      const small = `800 ${Math.max(9, fs - 3)}px ui-rounded, system-ui, sans-serif`;
      let w = c.measureText(label).width;
      if (reason) {
        c.font = small;
        w = Math.max(w, c.measureText(reason).width);
        c.font = `900 ${fs}px ui-rounded, system-ui, sans-serif`;
      }
      const hh = reason ? fs * 2 + 2 : fs;
      // the box is placed by its centre; the name sits on its first line
      const at = placeLabel(p.x, p.y + (hh - fs) / 2, w + 4, hh + 4, vp, avoid, blocked);
      const ly = at.y - (hh - fs) / 2;
      c.strokeText(label, at.x, ly);
      c.fillText(label, at.x, ly);
      if (reason) {
        c.font = small;
        c.strokeText(reason, at.x, ly + fs + 2);
        c.fillStyle = '#ffd9a0';
        c.fillText(reason, at.x, ly + fs + 2);
      }
    }

    // colony ring
    const core = worldToMap(vp, 0, 0);
    c.setLineDash([8, 6]);
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(core.x, core.y, Math.max(8, g.state.colony.radius * CELL * k), 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);

    // markers
    const sel = this.selected?.id;
    for (const m of this.markers) {
      if (m.kind === 'player') continue;
      const p = worldToMap(vp, m.x, m.z);
      if (p.x < -20 || p.y < -20 || p.x > vp.w + 20 || p.y > vp.h + 20) continue;
      const r = m.travel ? 15 : 12;
      // explored points of interest step back; a restocked cache glows
      const dim = m.loot === 'waiting' || m.loot === 'done';
      if (dim) c.globalAlpha = 0.55;
      if (m.loot === 'restocked') {
        c.beginPath();
        c.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
        c.fillStyle = 'rgba(95, 211, 138, 0.35)';
        c.fill();
      }
      c.beginPath();
      c.arc(p.x, p.y, r, 0, Math.PI * 2);
      c.fillStyle = m.kind === 'event' ? '#ffcf4a' : m.travel ? '#ffffff' : 'rgba(255,255,255,0.88)';
      c.fill();
      c.lineWidth = m.id === sel ? 4 : 2.5;
      c.strokeStyle = m.id === sel ? '#ff8a3d' : m.travel ? '#4fb3f6' : 'rgba(40,24,70,0.7)';
      c.stroke();
      const img = m.art ? this.markerImage(m.art) : null;
      if (img) {
        const s = r * 1.75;
        c.drawImage(img, p.x - s / 2, p.y - s / 2, s, s);
      } else {
        c.font = `${m.travel ? 17 : 14}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
        c.fillStyle = '#000';
        c.fillText(m.icon, p.x, p.y + 1);
      }
      if (dim) c.globalAlpha = 1;
      if (m.loot) this.lootPip(c, p.x + r * 0.72, p.y - r * 0.72, m.loot);
    }

    // player arrow
    const pl = g.state.player;
    const pp = worldToMap(vp, pl.x, pl.z);
    c.save();
    c.translate(pp.x, pp.y);
    c.rotate(Math.PI / 2 - pl.rot);
    c.beginPath();
    c.moveTo(11, 0);
    c.lineTo(-8, -8);
    c.lineTo(-4, 0);
    c.lineTo(-8, 8);
    c.closePath();
    c.fillStyle = '#ff8a3d';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = '#fff';
    c.stroke();
    c.restore();
  }
}

// warm the map's terrain noise once the game is up (browser only; panels are built lazily on first open)
if (typeof document !== 'undefined') warmMapNoise();
