// Runs the real game rules on the server. web/js/data.js and web/js/match.js have no DOM access,
// so they load into a VM context unchanged: clients and server simulate with the same code.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const webJs = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'js');

export function loadSF() {
  const ctx = { console, Math, Date, JSON, Map, Set, Promise, setTimeout, clearTimeout };
  ctx.window = ctx;
  ctx.performance = { now: () => performance.now() };
  vm.createContext(ctx);
  for (const f of ['data.js', 'match.js']) vm.runInContext(readFileSync(join(webJs, f), 'utf8'), ctx, { filename: f });
  return ctx.SF;
}
export const SF = loadSF();

export const TICK = 1 / 30;
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const KIND = { hero: 'h', minion: 'm', tower: 't', core: 'c', monster: 'n' };
const isStructure = u => u.kind === 'tower' || u.kind === 'core';

// Reads a direction vector from client input: finite numbers only, length capped at `max`.
export function readVec(v, max = 1) {
  if (!v || !finite(v.x) || !finite(v.y)) return null;
  const l = Math.hypot(v.x, v.y);
  if (l < 1e-6) return null;
  const k = l > max ? max / l : 1;
  return { x: v.x * k, y: v.y * k };
}

function packFx(f) {
  const o = { type: f.type, x: r1(f.x), y: r1(f.y), color: f.color, dur: f.dur };
  for (const k of ['r', 'w', 'ang', 'x2', 'y2', 'len']) if (finite(f[k])) o[k] = r2(f[k]);
  if (f.dir) o.dir = { x: r2(f.dir.x), y: r2(f.dir.y) };
  return o;
}

// One online match. `players`: [{ pid, name, heroId, skinId, team }].
export class Room {
  constructor({ id, mode, players }) {
    this.id = id; this.mode = mode;
    const roster = [[], []];
    for (const p of players) roster[p.team].push({ id: p.heroId, skin: p.skinId, name: p.name, human: true, pid: p.pid, spell: SF.SPELLS[p.spell] ? p.spell : 'blink' });
    const names = shuffle(SF.BOT_NAMES.slice());
    for (const team of [0, 1]) {
      while (roster[team].length < 3) {
        const used = new Set(roster[team].map(s => s.id));
        const pool = SF.HEROES.filter(h => !used.has(h.id));
        const h = pool[Math.floor(Math.random() * pool.length)];
        const skins = SF.skinsFor(h.id);
        roster[team].push({ id: h.id, skin: skins[Math.random() < 0.5 ? 0 : Math.floor(Math.random() * skins.length)].id, name: names.pop() });
      }
    }
    this.m = new SF.Match({ roster, difficulty: 'normal' });
    this.byPid = new Map();
    for (const h of this.m.heroes) if (h.pid) this.byPid.set(h.pid, h);
    this.events = [];
    this.surrenders = new Set();
    this.ended = false;
    this.instrument();
  }

  // Cosmetic effects and notable moments are recorded as events and streamed to clients,
  // which replay them locally. The server itself keeps no particles.
  instrument() {
    const m = this.m, push = (...a) => this.events.push(a);
    m.updateFx = function () { for (const f of this.fx) push('fx', packFx(f)); this.fx = []; this.parts = []; this.floats = []; };
    m.burst = (x, y, color, n, sp) => push('burst', r1(x), r1(y), color, n, sp);
    m.shake = mag => push('shake', mag);
    const applyDamage = m.applyDamage.bind(m);
    m.applyDamage = (src, t, amt, o = {}) => {
      const n = applyDamage(src, t, amt, o);
      if (n >= 1 && ((src && src.kind === 'hero') || t.kind === 'hero')) push('dmg', src ? src.id : 0, t.id, Math.round(n), o.skill ? 1 : 0);
      return n;
    };
    const heal = m.heal.bind(m);
    m.heal = (u, amt, quiet) => { const b = u.hp; heal(u, amt, true); const d = u.hp - b; if (!quiet && d >= 1 && u.kind === 'hero') push('heal', u.id, Math.round(d)); };
    const addGold = m.addGold.bind(m);
    m.addGold = (h, n, passive) => { addGold(h, n, passive); if (!passive) push('gold', h.id, Math.round(n)); };
    const attack = m.attack.bind(m);
    m.attack = (u, t) => { attack(u, t); if (u.kind === 'hero' || t.kind === 'hero') push('hit', u.id, t.id); };
    m.on('announce', (text, team, sub) => push('announce', text, team, sub));
    m.on('kill', e => push('kill', e.killer ? e.killer.id : 0, e.victim.id, e.assists.map(a => a.id), e.text || null));
    m.on('levelup', h => push('levelup', h.id));
    m.on('cast', (h, s) => push('cast', h.id, h.def0.skills.indexOf(s)));
    m.on('tower', t => push('tower', t.id));
    m.on('signal', s => push('sig', s.kind, s.team, r1(s.x), r1(s.y), s.from.id, s.target ? s.target.id : 0, s.text));
    m.on('message', (h, text) => push('msg', h.id, h.team, text));
    m.on('end', () => { this.ended = true; });
  }

  rosterInfo() {
    return this.m.heroes.map(h => ({ i: h.id, tm: h.team, h: h.def0.id, sk: h.skin, n: h.name, hu: !!h.human, pid: h.pid || null, sp: h.spell }));
  }

  unit(id) { return this.m.units.find(u => u.id === id) || null; }

  input(pid, msg) {
    const h = this.byPid.get(pid), m = this.m;
    if (!h || this.ended || !h.human) return;
    switch (msg.t) {
      case 'in': h.wantDir = readVec(msg.d); h.attackHeld = !!msg.a; break;
      case 'cast': {
        const i = msg.i;
        if (i !== 0 && i !== 1 && i !== 2) return;
        m.castSkill(h, i, this.aimFrom(h, i, msg));
        break;
      }
      case 'buy': if (typeof msg.id === 'string' && Object.prototype.hasOwnProperty.call(SF.ITEMS, msg.id)) m.buy(h, msg.id); break;
      case 'flash':   // older clients
      case 'spell': {
        // The target is only a hint: useSpell checks team, visibility and range itself.
        const tg = Number.isInteger(msg.tg) ? this.unit(msg.tg) : null;
        m.useSpell(h, { dir: readVec(msg.d) || h.face, target: tg });
        break;
      }
      case 'recall': m.startRecall(h); break;
      case 'signal': if (typeof msg.k === 'string') m.signal(h, msg.k); break;
      case 'surrender': this.surrender(h); break;
    }
  }

  // Client aim is advisory: the direction is normalised, the ground point clamped to range and the
  // target must be a visible enemy within range. With no direction the server auto-aims.
  aimFrom(h, i, msg) {
    const s = h.def0.skills[i], m = this.m;
    const dir = readVec(msg.dir, Infinity);
    if (!dir) return null;
    const l = Math.hypot(dir.x, dir.y), d = { x: dir.x / l, y: dir.y / l };
    let point = null;
    const p = readVec(msg.p, Infinity);
    if (p && msg.p) {
      const dx = msg.p.x - h.x, dy = msg.p.y - h.y, D = Math.hypot(dx, dy), R = s.range || 200;
      point = D > R ? { x: h.x + dx / D * R, y: h.y + dy / D * R } : { x: msg.p.x, y: msg.p.y };
    }
    if (s.ground && !point) point = s.ai === 'fight' ? { x: h.x, y: h.y } : { x: h.x + d.x * (s.range || 200) * 0.6, y: h.y + d.y * (s.range || 200) * 0.6 };
    let target = null;
    if (Number.isInteger(msg.tg)) {
      const u = this.unit(msg.tg);
      if (u && u.alive && u.team !== h.team && !isStructure(u) && m.visible(u, h.team) && Math.hypot(u.x - h.x, u.y - h.y) <= (s.range || 200) + u.r + 60) target = u;
    }
    return { dir: d, point, target };
  }

  surrender(h) {
    this.surrenders.add(h.pid);
    const humans = [...this.byPid.values()].filter(x => x.team === h.team && x.human && !x.disconnected);
    if (humans.every(x => this.surrenders.has(x.pid))) this.m.end(1 - h.team);
  }

  // A disconnected human's hero is taken over by a bot; reconnecting hands it back.
  setConnected(pid, connected) {
    const h = this.byPid.get(pid);
    if (!h) return;
    h.disconnected = !connected;
    if (connected) { h.brain = null; h.human = true; }
    else { h.wantDir = null; h.attackHeld = false; }
  }
  botTakeover(pid) {
    const h = this.byPid.get(pid);
    if (h && h.disconnected && !h.brain) { h.brain = new SF.Brain(this.m, h, 'normal'); h.human = false; }
  }

  step() { if (!this.ended) this.m.update(TICK); }

  // Everything the client renders, filtered to what `team` is allowed to see.
  snapshotFor(team, pid, events) {
    const m = this.m, me = this.byPid.get(pid), u = [];
    for (const x of m.units) {
      const structure = isStructure(x);
      if (!x.alive && !structure) continue;
      if (x.kind === 'hero' && x.team !== team && !m.visible(x, team)) continue;
      const e = { i: x.id, k: KIND[x.kind], tm: x.team, x: r1(x.x), y: r1(x.y), hp: Math.round(x.hp), mh: Math.round(x.maxHp), r: x.r, fx: r2(x.face.x), fy: r2(x.face.y) };
      if (!x.alive) e.al = 0;
      if (x.moving) e.mv = 1;
      if (x.flash > 0) e.fl = 1;
      if (x.stunT > 0) e.st = r1(x.stunT);
      if (x.slowT > 0) e.sl = 1;
      if (x.shield > 0) e.sh = Math.round(x.shield);
      if (x.mtype) e.mt = x.mtype;
      if (structure) { e.rg = x.range; if (x.guard) e.g = x.guard.id; if (x.target) e.tg = x.target.id; }
      if (x.kind === 'hero') {
        e.h = x.def0.id; e.sk = x.skin; e.n = x.name; e.bu = x.bush;
        if (x.invisT > 0) e.iv = 1;
        if (x.team === team) e.ev = m.visible(x, 1 - team) ? 1 : 0;
        if (x.recallT > 0) e.rc = r1(x.recallT);
      }
      u.push(e);
    }
    const hs = m.heroes.map(h => [h.id, h.level, h.k, h.dth, h.ast, h.items.slice(), h.alive ? 1 : 0, r1(Math.max(0, h.respawnT))]);
    const snap = {
      t: 's', time: r2(m.t), k: m.kills.slice(), ts: m.teamStats.map(s => [s.towers, s.shards]), u, hs,
      z: m.zones.map(z => ({ x: r1(z.x), y: r1(z.y), r: z.r, team: z.team, t: r2(z.t), delay: z.delay || 0, dur: z.dur || 0, kind: z.kind, color: z.color, started: z.started ? 1 : 0, dir: z.dir ? { x: r2(z.dir.x), y: r2(z.dir.y) } : undefined, len: z.len, fo: z.follow ? z.follow.id : undefined })),
      pj: m.projs.filter(p => !p.homing || p.homing.kind !== 'hero' || p.homing.team === team || m.visible(p.homing, team)).map(p => ({ x: r1(p.x), y: r1(p.y), vx: p.vx != null ? r2(p.vx) : undefined, vy: p.vy != null ? r2(p.vy) : undefined, sp: p.speed, kind: p.kind, c: p.color, r: p.r, ho: p.homing ? p.homing.id : undefined, src: p.kind === 'hook' ? p.src.id : undefined, ang: r2(p.ang || 0) })),
      cp: m.camps.map(c => [c.x, c.y, c.unit && c.unit.alive ? 1 : 0]),
      sd: m.shard && m.shard.alive ? m.shard.id : 0,
      ev: events
    };
    if (me) {
      snap.me = {
        id: me.id, gold: Math.floor(me.gold), xp: Math.round(me.xp), xn: me.xpNeed, lv: me.level, items: me.items.slice(),
        cd: me.skillCd.map(r2), cdr: me.cdr, fcd: r1(me.spellCd), rc: r1(me.recallT), rg: me.range, ms: Math.round(me.speed()),
        tg: me.target ? me.target.id : 0, rs: r1(Math.max(0, me.respawnT)),
        b: me.buffs.filter(b => b.label || b.id === 'tailwind' || b.id === 'warcry').map(b => [b.id, r1(b.t), b.label || ''])
      };
    }
    return snap;
  }

  // Events that only matter to one player (damage numbers, gold, hit sounds) go only to that player.
  eventsFor(pid) {
    const me = this.byPid.get(pid), id = me ? me.id : -1;
    return this.events.filter(e => {
      if (e[0] === 'dmg' || e[0] === 'hit') return e[1] === id || e[2] === id;
      if (e[0] === 'heal' || e[0] === 'gold') return e[1] === id;
      if (e[0] === 'sig' || e[0] === 'msg') return !!me && e[2] === me.team;   // team chat stays on the team
      return true;
    });
  }
}
